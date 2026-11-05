import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
process.env.RELAY_SERVICE = "relay-worker";
const { adminDb } = await import("../src/lib/supabase/admin");
const { enabledJobTypes } = await import("../src/lib/jobs/flags");
const { queueOperation } = await import("../src/lib/jobs/client");
const { runJob } = await import("../src/lib/jobs/runner");
const { workerLanes, runWorkerSlot } = await import("../src/lib/jobs/lanes");
const { logEvent, flushLogging } = await import("../src/lib/observability/logger");
const { initWorkerMonitoring, flushMonitoring } = await import("../src/lib/observability/server");
const { startMaintenance, maintenanceTasks } = await import("../src/lib/jobs/maintenance-tasks");
initWorkerMonitoring();
const admin = adminDb();
const workerId = process.env.WORKER_ID ?? randomUUID();
const types = enabledJobTypes();
const lanes = workerLanes(types);
if (!types.length) throw new Error("No enabled job types");
const controller = new AbortController();
let stopping = false;
let lastHeartbeat = 0;
const active = new Map<string, number>();
let lastProgress = Date.now();
function stop() {
  stopping = true;
  controller.abort();
}
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
function authorized(value: string | undefined) {
  const expected = process.env.WORKER_METRICS_SECRET;
  const provided = value?.replace(/^Bearer /, "") ?? "";
  return (
    !!expected &&
    Buffer.byteLength(provided) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  );
}
const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (req.url === "/healthz" && req.method === "GET") {
    const ready =
      !stopping &&
      lastHeartbeat > Date.now() - 90000 &&
      lastProgress > Date.now() - 15 * 60000 &&
      [...active.values()].every((started) => started > Date.now() - 15 * 60000);
    res.writeHead(ready ? 200 : 503);
    res.end(JSON.stringify({ status: ready ? "ok" : "unavailable" }));
  } else if (
    req.url === "/metrics" &&
    req.method === "GET" &&
    authorized(req.headers.authorization)
  ) {
    try {
      res.end(
        JSON.stringify({
          ...(await queueOperation(admin, "metrics")),
          busy: active.size > 0,
          active_jobs: active.size,
          lanes: lanes.map((l) => ({
            name: l.name,
            capacity: l.concurrency,
            active: [...active.keys()].filter((k) => k.startsWith(l.name + ":")).length,
          })),
        }),
      );
    } catch {
      res.writeHead(503);
      res.end(JSON.stringify({ status: "unavailable" }));
    }
  } else {
    res.writeHead(404);
    res.end("{}");
  }
});
server.requestTimeout = 5000;
server.headersTimeout = 5000;
server.listen(Number(process.env.PORT ?? process.env.WORKER_PORT ?? 3001), "0.0.0.0");
const heartbeat = async () => {
  await queueOperation(admin, "heartbeat", { worker_id: workerId, types, stopping });
  lastHeartbeat = Date.now();
};
let beating: Promise<void> | undefined;
const timer = setInterval(() => {
  if (!beating)
    beating = heartbeat()
      .catch(async () => {
        await logEvent("warn", "worker_heartbeat_failed", { worker_id: workerId });
      })
      .finally(() => {
        beating = undefined;
      });
}, 25000);
let scheduling: Promise<void> | undefined;
const schedule = () => {
  if (!stopping && !scheduling)
    scheduling = queueOperation(admin, "schedule", { types })
      .then(() => undefined)
      .catch(async () => {
        await logEvent("warn", "worker_schedule_failed", { worker_id: workerId });
      })
      .finally(() => {
        scheduling = undefined;
      });
};
const scheduleTimer = setInterval(schedule, 60000);
schedule();
const stopMaintenance = startMaintenance(admin, maintenanceTasks(workerId));
await logEvent("info", "worker_started", { worker_id: workerId });
try {
  await heartbeat();
  await Promise.all(
    lanes.flatMap((lane) =>
      Array.from({ length: lane.concurrency }, (_, index) => {
        const slot = lane.name + ":" + index;
        return runWorkerSlot({
          lane,
          stopping: () => stopping,
          claim: async (selected) => {
            const job = await queueOperation(admin, "claim", {
              worker_id: workerId,
              types: selected,
            });
            lastProgress = Date.now();
            return job;
          },
          run: async (job) => {
            active.set(slot, Date.now());
            try {
              await runJob(admin, job);
            } finally {
              active.delete(slot);
              lastProgress = Date.now();
            }
          },
          wait: async (ms) => {
            await pause(ms, undefined, { signal: controller.signal }).catch(() => {});
          },
          error: async () => {
            await logEvent("error", "worker_poll_failed", { worker_id: workerId });
          },
        });
      }),
    ),
  );
} finally {
  clearInterval(timer);
  clearInterval(scheduleTimer);
  await Promise.allSettled([beating, scheduling, stopMaintenance()]);
  await heartbeat().catch(() => {});
  await flushMonitoring();
  server.close();
  await logEvent("info", "worker_stopped", { worker_id: workerId });
  await flushLogging();
}
