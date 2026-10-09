import { Client } from "pg";
import { randomUUID } from "node:crypto";
const url = process.env.RELAY_TEST_DATABASE_URL;
if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname))
  throw new Error("Use a disposable localhost RELAY_TEST_DATABASE_URL.");
const admin = new Client({ connectionString: url });
const users = Array.from({ length: 32 }, () => randomUUID());
const secret = "b".repeat(64);
let workspace: string | undefined;
await admin.connect();
async function authenticated(user: string, operation: string, payload: Record<string, unknown>) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
    await client.query("set local role authenticated");
    const result = await client.query("select public.agent_runtime($1,$2,$3::jsonb) data", [
      workspace,
      operation,
      JSON.stringify(payload),
    ]);
    await client.query("commit");
    return { ok: true as const, user, data: result.rows[0].data };
  } catch (error) {
    await client.query("rollback");
    return { ok: false as const, user, code: (error as { code: string }).code };
  } finally {
    await client.end();
  }
}
try {
  await admin.query(
    "insert into auth.users(id,email) select u,'token-race-'||u::text||'@example.test' from unnest($1::uuid[]) u",
    [users],
  );
  await admin.query("select set_config('request.jwt.claim.sub',$1,false)", [users[0]]);
  workspace = (await admin.query("select public.create_workspace('Token quota race') w")).rows[0].w;
  await admin.query(
    "insert into public.memberships(workspace_id,user_id,role) select $1,u,'member' from unnest($2::uuid[]) u",
    [workspace, users.slice(1)],
  );
  await admin.query(
    "insert into relay_private.agent_settings(workspace_id,monthly_token_limit) values($1,10000)",
    [workspace],
  );
  const payload = { secret, tool_limit: 5, reserved_tokens: 1000, token_limit: 20000 };
  const runs = await Promise.all(users.map((user) => authenticated(user, "begin", payload)));
  const accepted = runs.filter((r) => r.ok);
  if (accepted.length !== 10 || runs.some((r) => !r.ok && r.code !== "53300"))
    throw new Error("Concurrent monthly admission exceeded the budget");
  let usage = (
    await admin.query(
      "select tokens_reserved,uncertain_tokens from relay_private.agent_usage where workspace_id=$1",
      [workspace],
    )
  ).rows[0];
  if (Number(usage.tokens_reserved) !== 10000)
    throw new Error("Concurrent reservation counter incorrect");
  const releases = await Promise.all(
    accepted.map((r) =>
      authenticated(r.user, "finish", { secret, id: r.data.id, status: "error" }),
    ),
  );
  if (releases.some((r) => !r.ok))
    throw new Error("Concurrent unused reservation settlement failed");
  usage = (
    await admin.query(
      "select tokens_reserved from relay_private.agent_usage where workspace_id=$1",
      [workspace],
    )
  ).rows[0];
  if (Number(usage.tokens_reserved) !== 0)
    throw new Error("Unused reservations were not reconciled");
  console.log(
    "32 users / 10,000 monthly tokens: exactly 10 reservations of 1,000 admitted; settlement releases all unused tokens.",
  );
  const first = await authenticated(users[0], "begin", payload);
  const second = await authenticated(users[1], "begin", payload);
  if (!first.ok || !second.ok) throw new Error("Provider race setup failed");
  const calls = await Promise.all(
    Array.from({ length: 32 }, (_, n) => {
      const run = n % 2 ? second : first;
      return authenticated(run.user, "provider_begin", {
        secret,
        id: run.data.id,
        sequence: Math.floor(n / 2),
        reserved_tokens: 5000,
        provider: "groq",
        model: "fixture",
      });
    }),
  );
  if (calls.filter((r) => r.ok).length !== 2 || calls.some((r) => !r.ok && r.code !== "53300"))
    throw new Error("Concurrent provider growth exceeded the budget");
  const settled = await Promise.all(
    [first, second].map((r) =>
      authenticated(r.user, "finish", { secret, id: r.data.id, status: "error" }),
    ),
  );
  if (settled.some((r) => !r.ok)) throw new Error("Provider reservation settlement failed");
  usage = (
    await admin.query(
      "select tokens_reserved,uncertain_tokens from relay_private.agent_usage where workspace_id=$1",
      [workspace],
    )
  ).rows[0];
  if (Number(usage.tokens_reserved) !== 10000 || Number(usage.uncertain_tokens) !== 10000)
    throw new Error("Uncertain concurrent calls were not retained conservatively");
  console.log(
    "32 concurrent provider admissions: exactly 2 at 5,000 tokens; unknown outcomes remain charged within the 10,000-token limit. No provider called.",
  );
} finally {
  await admin.query("select set_config('request.jwt.claim.sub','',false)");
  if (workspace) await admin.query("delete from public.workspaces where id=$1", [workspace]);
  await admin.query("delete from auth.users where id=any($1::uuid[])", [users]);
  await admin.end();
}
