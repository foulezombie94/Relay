import { Client } from "pg";
import { readFile, readdir } from "node:fs/promises";
const url = process.env.RELAY_TEST_DATABASE_URL;
if (!url || !/^postgres(?:ql)?:\/\/[^/]*@(?:127\.0\.0\.1|localhost):/.test(url))
  throw new Error("Use a disposable local RELAY_TEST_DATABASE_URL.");
const db = new Client({ connectionString: url });
await db.connect();
try {
  await db.query(await readFile("scripts/tests/local-bootstrap.sql", "utf8"));
  for (const f of (await readdir("supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      const sql = (await readFile("supabase/migrations/" + f, "utf8"))
        .replace("create extension if not exists pg_cron;", "")
        .replace(/select cron.schedule\([^;]+;/g, "");
      await db.query(sql);
      console.log("Applied", f);
    } catch (e) {
      console.error("Failed", f, e);
      throw e;
    }
  }
} finally {
  await db.end();
}
