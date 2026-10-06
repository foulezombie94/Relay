import { setTimeout } from "node:timers/promises";
process.loadEnvFile(".env.local");
if (!process.env.JOBS_SECRET) throw new Error("JOBS_SECRET manquant");
const origin =
  process.env.WORKER_URL || process.env.APP_URL || "http://127.0.0.1:3000";
const parsed = new URL(origin);
if (
  parsed.protocol !== "https:" &&
  !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
)
  throw new Error("WORKER_URL doit utiliser HTTPS hors localhost");
console.log("Relay : worker de synchronisation démarré");
for (;;) {
  try {
    const response = await fetch(new URL("/api/jobs/run", origin), {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.JOBS_SECRET },
      signal: AbortSignal.timeout(115000),
    });
    if (!response.ok) console.error("Worker : HTTP " + response.status);
    else {
      const result = await response.json();
      if (result.completed || result.failed)
        console.log(
          "Worker : " +
            result.completed +
            " lots terminés, " +
            result.failed +
            " interrompus",
        );
    }
  } catch {
    console.error("Worker : serveur temporairement inaccessible");
  }
  await setTimeout(60000);
}
