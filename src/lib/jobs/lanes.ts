import type { JobType } from "./types";
export type WorkerLane = {
  name: "interactive" | "bulk";
  types: JobType[];
  concurrency: number;
  minPollMs: number;
  maxPollMs: number;
};
export function workerLanes(
  types: JobType[],
  env: Record<string, string | undefined> = process.env,
): WorkerLane[] {
  const slots = (key: string, fallback: number) => {
    const n = env[key] === undefined ? fallback : Number(env[key]);
    if (!Number.isInteger(n) || n < 1 || n > 4)
      throw new Error(`${key} must be an integer between 1 and 4`);
    return n;
  };
  const bulk = new Set<JobType>(["imports", "email_sync", "calendar_sync"]);
  return [
    {
      name: "interactive" as const,
      types: types.filter((t) => !bulk.has(t)),
      concurrency: slots("WORKER_SHORT_CONCURRENCY", 2),
      minPollMs: 1000,
      maxPollMs: 2000,
    },
    {
      name: "bulk" as const,
      types: types.filter((t) => bulk.has(t)),
      concurrency: slots("WORKER_LONG_CONCURRENCY", 1),
      minPollMs: 2000,
      maxPollMs: 5000,
    },
  ].filter((l) => l.types.length);
}
export async function runWorkerSlot<T>(options: {
  lane: WorkerLane;
  stopping: () => boolean;
  claim: (types: JobType[]) => Promise<T | null>;
  run: (job: T) => Promise<void>;
  wait: (ms: number) => Promise<void>;
  error: () => Promise<void>;
}) {
  let delay = options.lane.minPollMs;
  while (!options.stopping()) {
    try {
      const job = await options.claim(options.lane.types);
      // A claim racing shutdown is still executed under its lease. Dropping it
      // here would hide a job until expiry and could stall an interactive send.
      if (job) {
        delay = options.lane.minPollMs;
        await options.run(job);
        continue;
      }
    } catch {
      await options.error();
    }
    if (!options.stopping()) await options.wait(Math.round(delay * (0.9 + Math.random() * 0.2)));
    delay = Math.min(options.lane.maxPollMs, delay * 2);
  }
}
