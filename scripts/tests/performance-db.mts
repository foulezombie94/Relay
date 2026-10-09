import { Client } from "pg";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const url = process.env.RELAY_TEST_DATABASE_URL;
if (!url || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname))
  throw new Error("Use a migrated, disposable local RELAY_TEST_DATABASE_URL.");
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
    "reader-visibility",
    "team-access",
    "worker-hardening",
    "job-queue",
    "workflow-blocks",
    "commercial-features",
    "duplicate-lifecycle",
    "service-connections",
    "crm-migrations",
  ]) {
    await db.query(await readFile(`supabase/tests/${name}.sql`, "utf8"));
    console.log(`PASS ${name}`);
  }
} finally {
  await db.query("rollback");
  await db.query("delete from auth.users where id=$1", [user]);
  await db.end();
}
