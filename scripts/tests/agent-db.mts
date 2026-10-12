import { localTestDatabaseUrl } from "./database-target";
import { Client } from "pg";
import { readFile } from "node:fs/promises";
const url = localTestDatabaseUrl();
const db = new Client({ connectionString: url });
await db.connect();
db.on("notice", (n) => console.log(n.message));
try {
  await db.query(await readFile("supabase/tests/agent.sql", "utf8"));
  await db.query(await readFile("supabase/tests/agent-confirmations.sql", "utf8"));
  await db.query(await readFile("supabase/tests/dashboards.sql", "utf8"));
  await db.query(await readFile("supabase/tests/workflow-creation.sql", "utf8"));
} finally {
  await db.end();
}
