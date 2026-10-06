import "server-only";
type Fields = { job_id?: string; job_type?: string; worker_id?: string; attempt?: number; duration_ms?: number; code?: string; status?: number; request_id?: string };
const pending = new Set<Promise<void>>();
let dropped = 0;
export async function logEvent(level: "info" | "warn" | "error", message: string, fields: Fields = {}) {
  const entry = { dt: new Date().toISOString(), level, message, service: process.env.RELAY_SERVICE ?? "relay-web", ...fields };
  console[level === "info" ? "log" : level](JSON.stringify(entry));
  const token = process.env.BETTER_STACK_SOURCE_TOKEN;
  const endpoint = process.env.BETTER_STACK_INGEST_URL;
  if (!token || !endpoint) return;
  const send = async () => { try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return;
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(entry), signal: AbortSignal.timeout(2000), redirect: "error" });
  } catch { /* Platform logs remain available when remote ingestion fails. */ } };
  if (process.env.RELAY_SERVICE === "relay-worker") {
    // Bound in-flight telemetry and keep slow ingestion out of the job path.
    if (pending.size >= 8) { dropped++; return; }
    const request = send().finally(() => pending.delete(request));
    pending.add(request);
  } else await send();
}
export async function flushLogging() {
  await Promise.allSettled([...pending]);
  if (dropped) console.warn(JSON.stringify({level:"warn",message:"remote_logs_dropped",count:dropped}));
}
