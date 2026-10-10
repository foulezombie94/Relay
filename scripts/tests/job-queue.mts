import { localTestDatabaseUrl } from "./database-target";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
const db = new Client({ connectionString: localTestDatabaseUrl() });
await db.connect();
try {
  for (const path of ["supabase/tests/job-queue.sql", "supabase/tests/worker-hardening.sql"]) {
    const results = await db.query(await readFile(path, "utf8"));
    for (const result of Array.isArray(results) ? results : [results])
      if (result.rows?.length) console.log(result.rows);
  }
} finally {
  await db.end();
}
