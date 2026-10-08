import { Client } from "pg";
import { readFile } from "node:fs/promises";
const url = process.env.RELAY_TEST_DATABASE_URL;
if (!url)
  throw new Error(
    "Set RELAY_TEST_DATABASE_URL to a test database with migrations applied. Tests roll back.",
  );
const db = new Client({ connectionString: url });
await db.connect();
db.on("notice", (n) => console.log(n.message));
try {
  await db.query(await readFile("supabase/tests/agent.sql", "utf8"));
  await db.query(await readFile("supabase/tests/agent-confirmations.sql", "utf8"));
} finally {
  await db.end();
}
