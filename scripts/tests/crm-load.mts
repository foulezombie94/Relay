import { localTestDatabaseUrl } from "./database-target";
import { Client, Pool, type PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import {
  dashboardTemplate,
  tileFilters,
  resolveDashboardPeriod,
} from "../../src/lib/domain/dashboards";
const url = localTestDatabaseUrl();
const records = Number(process.env.RELAY_LOAD_RECORDS ?? 10000);
const salesDashboard = process.env.RELAY_LOAD_DASHBOARD === "sales";
if (!Number.isInteger(records) || records < 100 || records > 100000)
  throw new Error("RELAY_LOAD_RECORDS must be 100..100000");
const admin = new Client({ connectionString: url });
const pool = new Pool({ connectionString: url, max: 12, connectionTimeoutMillis: 10000 });
const users = Array.from({ length: 100 }, () => randomUUID());
const results: Array<Record<string, unknown>> = [];
let workspace: string | undefined;
await admin.connect();
try {
  await admin.query(
    "insert into auth.users(id,email) select u,'load-'||u::text||'@example.test' from unnest($1::uuid[]) u",
    [users],
  );
  await admin.query("select set_config('request.jwt.claim.sub',$1,false)", [users[0]]);
  workspace = (await admin.query("select public.create_workspace('Isolated load test') w")).rows[0]
    .w;
  await admin.query(
    "insert into public.memberships(workspace_id,user_id,role) select $1,u,'member' from unnest($2::uuid[]) u",
    [workspace, users.slice(1)],
  );
  const object = (
    await admin.query("select id from public.objects where workspace_id=$1 and slug='deals'", [
      workspace,
    ])
  ).rows[0].id;
  const template = dashboardTemplate("sales", object);
  const requests = salesDashboard
    ? template.config.map((tile) => ({
        kind: tile.kind,
        metric: tile.metric,
        group_by: tile.group_by,
        date_field: tile.date_field,
        filters: tileFilters(tile, template.settings, resolveDashboardPeriod(template.settings)),
      }))
    : [{ kind: "record", metric: "count" }];
  await admin.query(
    `insert into public.records(workspace_id,object_id,display_name,email,stage,amount,owner_id,created_at)
    select $1,$2,'Load record '||n,'load-'||n||'@example.test',(array['Nouveau','Qualification','Proposition','Négociation','Gagné','Perdu'])[1+(n%6)],100+n,$3,now()-interval '30 days' from generate_series(1,$4::integer) n`,
    [workspace, object, users[0], records],
  );
  const expectedFirstTotal = salesDashboard
    ? Number(
        (
          await admin.query(
            "select count(*) from public.records where workspace_id=$1 and not archived and stage not in ('Gagné','Perdu')",
            [workspace],
          )
        ).rows[0].count,
      )
    : records;
  const ids = (
    await admin.query(
      "select id from public.records where workspace_id=$1 order by id limit 1000",
      [workspace],
    )
  ).rows.map((r) => r.id);
  await admin.query(
    "insert into public.tasks(workspace_id,record_id,title,owner_id,due_date) select $1,id,'Load task',$2,now()+interval '1 day' from unnest($3::uuid[]) id",
    [workspace, users[0], ids],
  );
  await admin.query(
    "analyze public.records;analyze public.tasks;analyze public.audit_events;analyze public.memberships",
  );
  const read = async (user: string, name: string) => {
    const started = performance.now();
    let client: PoolClient | undefined;
    try {
      client = await pool.connect();
      await client.query("begin");
      await client.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('statement_timeout','15000',true)",
        [user],
      );
      await client.query("set local role authenticated");
      let result;
      if (name === "list")
        result = await client.query(
          "select id,display_name,stage from public.records where workspace_id=$1 and object_id=$2 and not archived order by updated_at desc,id limit 20",
          [workspace, object],
        );
      else if (name === "detail")
        result = await client.query("select public.crm_record_context($1,$2,'summary') data", [
          workspace,
          ids[0],
        ]);
      else if (name === "dashboard") {
        result = await client.query("select public.dashboard_batch($1,$2::jsonb) data", [
          workspace,
          JSON.stringify(requests),
        ]);
        if (
          result.rows[0].data.some((entry: { error?: string }) => entry.error) ||
          Number(result.rows[0].data[0].result.total) !== expectedFirstTotal
        )
          throw new Error("incorrect aggregate under load");
      } else if (name === "report")
        result = await client.query("select public.crm_sales_report($1) data", [workspace]);
      else result = await client.query("select public.crm_priorities($1) data", [workspace]);
      await client.query("commit");
      return { name, ms: performance.now() - started, error: null };
    } catch (error) {
      if (client) await client.query("rollback");
      return {
        name,
        ms: performance.now() - started,
        error: (error as { code?: string }).code ?? "failed",
      };
    } finally {
      client?.release();
    }
  };
  const summarize = (samples: Awaited<ReturnType<typeof read>>[], users: number, phase: string) => {
    for (const name of [...new Set(samples.map((s) => s.name))]) {
      const group = samples.filter((s) => s.name === name),
        sorted = group.map((s) => s.ms).sort((a, b) => a - b);
      const row = {
        users,
        phase,
        operation: name,
        requests: group.length,
        errors: group.filter((s) => s.error).length,
        p50_ms: Math.round(sorted[Math.ceil(sorted.length * 0.5) - 1]),
        p95_ms: Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1]),
        max_ms: Math.round(sorted.at(-1)!),
      };
      results.push(row);
      console.log(JSON.stringify(row));
    }
  };
  for (const count of [10, 25, 50, 100]) {
    await admin.query("delete from relay_private.crm_aggregate_cache where workspace_id=$1", [
      workspace,
    ]);
    await admin.query(
      "delete from relay_private.crm_record_aggregate_cache where workspace_id=$1",
      [workspace],
    );
    const requests = () =>
      users
        .slice(0, count)
        .flatMap((u) => ["list", "detail", "dashboard"].map((name) => read(u, name)));
    summarize(await Promise.all(requests()), count, "cold");
    summarize(await Promise.all(requests()), count, "immediate_repeat");
  }
  summarize(
    await Promise.all(["report", "priorities"].map((name) => read(users[0], name))),
    1,
    "aggregate_baseline",
  );
  await admin.query("begin");
  await admin.query("select set_config('request.jwt.claim.sub',$1,true)", [users[0]]);
  await admin.query("set local role authenticated");
  const explain = await admin.query(
    "explain (analyze,buffers,format json) select id from public.records where workspace_id=$1 and object_id=$2 and not archived order by updated_at desc,id limit 20",
    [workspace, object],
  );
  await admin.query("rollback");
  const server = (await admin.query("show server_version")).rows[0].server_version;
  await mkdir("docs/performance", { recursive: true });
  await writeFile(
    `docs/performance/local-load-${records}-records${salesDashboard ? "-sales-dashboard" : ""}.json`,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        scope:
          "Local PostgreSQL SQL/RLS only; excludes Next.js, network, Supabase Auth, providers and worker execution. Request latency includes a bounded 12-connection pool queue. Not a production capacity guarantee.",
        postgres: server,
        records,
        actual_test_users: users.length,
        pool_connections: 12,
        dashboard_calculations: requests.length,
        results,
        listing_plan: explain.rows[0]["QUERY PLAN"],
      },
      null,
      2,
    ) + "\n",
  );
  if (results.some((r) => Number(r.errors) > 0))
    throw new Error("Load test reported failures; inspect the saved result.");
} finally {
  await pool.end();
  await admin.query("rollback");
  await admin.query(
    "select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','{}',false)",
  );
  if (workspace) await admin.query("delete from public.workspaces where id=$1", [workspace]);
  await admin.query("delete from auth.users where id=any($1::uuid[])", [users]);
  await admin.end();
}
