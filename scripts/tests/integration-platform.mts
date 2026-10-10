import { Client } from "pg";
import { readFile } from "node:fs/promises";
import { localTestDatabaseUrl } from "./database-target";
const db = new Client({ connectionString: localTestDatabaseUrl() });
await db.connect();
try {
  const results = await db.query(await readFile("supabase/tests/integration-platform.sql", "utf8"));
  for (const result of Array.isArray(results) ? results : [results])
    for (const row of result.rows) console.log(row);
} finally {
  await db.end();
}
