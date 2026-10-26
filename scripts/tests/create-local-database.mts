import { Client } from "pg";
import { localTestDatabaseUrl } from "./database-target";

// The Supabase image initializes its platform schemas in postgres. Each run
// creates a separate, empty database for our repository-owned test bootstrap.
const url = new URL(localTestDatabaseUrl());
const database = url.pathname.slice(1);
url.pathname = "/postgres";
const client = new Client({ connectionString: url.toString() });
await client.connect();
try {
  const extension = await client.query(
    "select 1 from pg_available_extensions where name = 'pg_jsonschema'",
  );
  if (!extension.rowCount)
    throw new Error("SQL tests require a PostgreSQL image with pg_jsonschema installed.");
  // localTestDatabaseUrl restricts this to a local relay_test[a-z0-9_]* name.
  // Fail if it already exists: never drop or reuse another run's database.
  await client.query(`create database "${database}"`);
  console.log("Created isolated local test database.");
} finally {
  await client.end();
}
