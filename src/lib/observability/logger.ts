import "server-only";
type Fields = { job_id?: string; job_type?: string; worker_id?: string; attempt?: number; duration_ms?: number; code?: string; status?: number; request_id?: string };
export async function logEvent(level: "info" | "warn" | "error", message: string, fields: Fields = {}) {
  const entry = { dt: new Date().toISOString(), level, message, service: process.env.RELAY_SERVICE ?? "relay-web", ...fields };
  console[level === "info" ? "log" : level](JSON.stringify(entry));
  const token = process.env.BETTER_STACK_SOURCE_TOKEN;
  const endpoint = process.env.BETTER_STACK_INGEST_URL;
  if (!token || !endpoint) return;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return;
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(entry), signal: AbortSignal.timeout(2000), redirect: "error" });
  } catch { /* Telemetry outages must not affect the queue or client requests. */ }
}
