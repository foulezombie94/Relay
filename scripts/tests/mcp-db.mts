import { localTestDatabaseUrl } from "./database-target";
import { Client } from "pg";
import { readFile } from "node:fs/promises";
const db = new Client({ connectionString: localTestDatabaseUrl() });
await db.connect();
db.on("notice", (n) => console.log(n.message));
try {
  await db.query(await readFile("supabase/tests/mcp.sql", "utf8"));
  await db.query(await readFile("supabase/tests/mcp-read-context.sql", "utf8"));
  await db.query(await readFile("supabase/tests/mcp-extended.sql", "utf8"));
  await db.query(await readFile("supabase/tests/mcp-client-confirmation.sql", "utf8"));
  await db.query(await readFile("supabase/tests/mcp-app-confirmation.sql", "utf8"));
  await db.query(await readFile("supabase/tests/mcp-client-document-admission.sql", "utf8"));
} finally {
  await db.end();
}
