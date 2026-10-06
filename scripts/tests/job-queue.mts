import { readFile } from "node:fs/promises";
import { Client } from "pg";
const connectionString=process.env.SUPABASE_DB_URL;
if(!connectionString) throw new Error("Set SUPABASE_DB_URL to run the rollback-only SQL integration test.");
const db=new Client({connectionString,ssl:{rejectUnauthorized:true}});
await db.connect();
try {
  const results=await db.query(await readFile("supabase/tests/job-queue.sql","utf8"));
  for(const result of Array.isArray(results)?results:[results]) if(result.rows?.length) console.log(result.rows);
} finally { await db.end(); }
