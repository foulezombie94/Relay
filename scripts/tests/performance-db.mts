import { localTestDatabaseUrl } from "./database-target";
import { Client } from "pg";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const url = localTestDatabaseUrl();
const db = new Client({ connectionString: url });
const user = randomUUID();
await db.connect();
db.on("notice", (n) => console.log(n.message));
try {
  // Vanilla PostgreSQL has no pg_cron. Its activation is checked separately on
  // Supabase; this empty stand-in supports the legacy disabled-cron assertion.
  await db.query(
    "create schema if not exists cron;create table if not exists cron.job(jobname text,active boolean)",
  );
  // Older regression scripts require an existing Auth account. It is test-only
  // and deleted afterwards; each SQL suite rolls its own fixtures back.
  await db.query("insert into auth.users(id,email) values($1,$2)", [
    user,
    `regression-${user}@example.test`,
  ]);
  for (const name of [
    "aggregate-reads",
    "shared-aggregate-cache",
    "duplicate-reads",
    "agent-usage-ledger",
    "agent",
    "agent-confirmations",
    "dashboards",
    "portals",
    "meetings",
    "reader-visibility",
    "team-access",
    "worker-hardening",
    "job-queue",
    "workflow-blocks",
    "commercial-features",
    "duplicate-lifecycle",
    "service-connections",
    "security-boundaries",
    "crm-migrations",
    "crm-save-reliability",
    "onboarding",
    "custom-pipeline-stages",
    "record-trash-history",
    "workspace-mfa",
    "public-api-webhooks",
    "contact-capture-tracking",
    "record-enrichment",
    "stripe-billing",
  ]) {
    await db.query(await readFile(`supabase/tests/${name}.sql`, "utf8"));
    console.log(`PASS ${name}`);
  }
  // Two real transactions model simultaneous first-workspace creation in tabs.
  const createFirstWorkspace = async () => {
    const caller = new Client({ connectionString: url });
    await caller.connect();
    try {
      await caller.query("begin");
      await caller.query("set local statement_timeout = '10s'");
      await caller.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
      await caller.query("set local role authenticated");
      const result = await caller.query<{ id: string }>(
        "select public.create_onboarding_workspace($1,$2,$3,$4) as id",
        ["Concurrent onboarding", "Local Test User", "Europe/Paris", randomUUID()],
      );
      await caller.query("commit");
      return result.rows[0].id;
    } finally {
      await caller.query("rollback");
      await caller.end();
    }
  };
  const attempts = await Promise.allSettled([createFirstWorkspace(), createFirstWorkspace()]);
  const ids: string[] = [];
  for (const result of attempts) {
    if (result.status === "rejected") throw result.reason;
    ids.push(result.value);
  }
  assert.equal(ids[0], ids[1], "Concurrent requests must resume the same first workspace");
  const setup = await db.query<{ workspaces: number; memberships: number; objects: number }>(
    `select
      (select count(*)::int from public.workspaces where owner_id=$1) as workspaces,
      (select count(*)::int from public.memberships where user_id=$1) as memberships,
      (select count(*)::int from public.objects where workspace_id=$2) as objects`,
    [user, ids[0]],
  );
  assert.deepEqual(setup.rows[0], { workspaces: 1, memberships: 1, objects: 3 });
  console.log("PASS onboarding concurrency: two transactions, one complete first workspace");
} finally {
  await db.query("rollback");
  await db.query("delete from public.workspaces where owner_id=$1", [user]);
  await db.query("delete from auth.users where id=$1", [user]);
  await db.end();
}
