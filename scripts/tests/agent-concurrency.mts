import { Client } from "pg";
import { randomUUID } from "node:crypto";
const url = process.env.RELAY_TEST_DATABASE_URL;
if (!url)
  throw new Error(
    "Use a migrated test database. This test commits isolated fixtures, then deletes them.",
  );
const db = new Client({ connectionString: url });
await db.connect();
const user = randomUUID();
let workspace: string | undefined;
try {
  await db.query("insert into auth.users(id,email) values($1,$2)", [
    user,
    "agent-concurrency-" + user + "@example.test",
  ]);
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
    [user, JSON.stringify({ sub: user, role: "authenticated" })],
  );
  workspace = (await db.query("select public.create_workspace('Agent concurrency fixture') as id"))
    .rows[0].id;
  const results = await Promise.all(
    Array.from({ length: 32 }, async () => {
      const client = new Client({ connectionString: url });
      await client.connect();
      try {
        await client.query("begin");
        await client.query(
          "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
          [user, JSON.stringify({ sub: user, role: "authenticated" })],
        );
        await client.query("set local role authenticated");
        const result = await client.query(
          'select public.agent_runtime($1,\'begin\',\'{"reserved_tokens":1000,"tool_limit":5,"secret":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}\') as data',
          [workspace],
        );
        await client.query("commit");
        return { ok: true, id: result.rows[0].data.id };
      } catch (error) {
        await client.query("rollback");
        return { ok: false, code: (error as { code: string }).code };
      } finally {
        await client.end();
      }
    }),
  );
  if (
    results.filter((r) => r.ok).length !== 1 ||
    results.filter((r) => !r.ok).some((r) => r.code !== "53300")
  )
    throw new Error("Atomic admission failed: " + JSON.stringify(results));
  console.log("32 simultaneous runs: exactly 1 admitted, 31 refused by PostgreSQL.");
  await db.query(
    "insert into public.integrations(workspace_id,user_id,provider,email,status) values($1,$2,'gmail','fixture@example.test','connected')",
    [workspace, user],
  );
  const jobs: Array<{ job: string; lease: string }> = [];
  for (let n = 0; n < 32; n++) {
    await db.query("begin");
    await db.query("set local role authenticated");
    const action = (
      await db.query("select public.agent_action($1,'propose',$2::jsonb) as data", [
        workspace,
        JSON.stringify({
          key: "quota-" + n,
          kind: "draft_email",
          input: {
            provider: "gmail",
            to: "recipient@example.test",
            subject: "Quota fixture",
            body: "No real provider is called.",
          },
        }),
      ])
    ).rows[0].data;
    const queued = (
      await db.query("select public.agent_apply($1,$2,$3) as data", [
        workspace,
        action.id,
        action.confirmation_digest,
      ])
    ).rows[0].data;
    await db.query("commit");
    const lease = randomUUID();
    await db.query(
      // Age each isolated fixture to test the send quota independently from
      // the existing 30 new jobs/minute admission limit.
      "update relay_private.jobs set status='running',lease=$2,leased_until=now()+interval '5 minutes',created_at=now()-interval '2 minutes' where id=$1",
      [queued.job_id, lease],
    );
    jobs.push({ job: queued.job_id, lease });
  }
  await db.query(
    "insert into relay_private.workflow_io_usage(workspace_id,day,kind,attempts) values($1,(now() at time zone 'UTC')::date,'email',199)",
    [workspace],
  );
  const sends = await Promise.all(
    jobs.map(async ({ job, lease }) => {
      const client = new Client({ connectionString: url });
      await client.connect();
      try {
        await client.query("begin");
        await client.query("set local role service_role");
        await client.query("select public.agent_effect_worker('prepare',$1::jsonb)", [
          JSON.stringify({ job_id: job, lease }),
        ]);
        await client.query("commit");
        return { ok: true, code: "" };
      } catch (error) {
        await client.query("rollback");
        return { ok: false, code: (error as { code: string }).code };
      } finally {
        await client.end();
      }
    }),
  );
  if (
    sends.filter((r) => r.ok).length !== 1 ||
    // A bounded lock timeout under load is also a safe refusal, not an admission.
    sends.filter((r) => !r.ok).some((r) => !["53300", "55P03"].includes(r.code))
  )
    throw new Error("Atomic send quota failed: " + JSON.stringify(sends));
  const attempts = (
    await db.query(
      "select attempts from relay_private.workflow_io_usage where workspace_id=$1 and kind='email'",
      [workspace],
    )
  ).rows[0].attempts;
  if (attempts !== 200) throw new Error("Shared email quota exceeded");
  console.log(
    "32 simultaneous email reservations with 1 remaining: exactly 1 admitted; shared counter stays at 200. No provider called.",
  );
  // The duplicate-confirmation scenario has its own available quota.
  await db.query(
    "update relay_private.workflow_io_usage set attempts=0 where workspace_id=$1 and kind='email'",
    [workspace],
  );
  const duplicate = (
    await db.query("select public.agent_action($1,'propose',$2::jsonb) as data", [
      workspace,
      JSON.stringify({
        key: "duplicate-confirmation",
        kind: "draft_email",
        input: {
          provider: "gmail",
          to: "recipient@example.test",
          subject: "Duplicate fixture",
          body: "No provider called.",
        },
      }),
    ])
  ).rows[0].data;
  const confirmations = await Promise.all(
    Array.from({ length: 32 }, async () => {
      const client = new Client({ connectionString: url });
      await client.connect();
      try {
        await client.query("begin");
        await client.query(
          "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
          [user, JSON.stringify({ sub: user, role: "authenticated" })],
        );
        await client.query("set local role authenticated");
        const data = (
          await client.query("select public.agent_apply($1,$2,$3) as data", [
            workspace,
            duplicate.id,
            duplicate.confirmation_digest,
          ])
        ).rows[0].data;
        await client.query("commit");
        return data.job_id;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        await client.end();
      }
    }),
  );
  const outboxes = (
    await db.query(
      "select count(*)::integer as count from relay_private.workflow_outbox where agent_action_id=$1",
      [duplicate.id],
    )
  ).rows[0].count;
  if (new Set(confirmations).size !== 1 || !confirmations[0] || outboxes !== 1)
    throw new Error("Concurrent duplicate confirmation produced multiple sends");
  console.log("32 concurrent confirmations of one draft: exactly 1 job and 1 outbox row.");
} finally {
  await db.query("rollback");
  await db.query(
    "select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','{}',false)",
  );
  if (workspace) await db.query("delete from public.workspaces where id=$1", [workspace]);
  await db.query("delete from auth.users where id=$1", [user]);
  await db.end();
}
