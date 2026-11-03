import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/observability/logger";

export type MaintenanceTask = {
  name: string;
  everyMs: number;
  run: (admin: SupabaseClient) => Promise<Record<string, unknown> | void>;
};

/**
 * Periodic, idempotent maintenance run by every worker replica. Each task is
 * safe concurrently: SQL claims use leases and SKIP LOCKED.
 */
export function startMaintenance(admin: SupabaseClient, tasks: MaintenanceTask[]) {
  const timers: NodeJS.Timeout[] = [];
  const running = new Map<string, Promise<void>>();
  for (const task of tasks) {
    const tick = () => {
      if (running.has(task.name)) return;
      const work = task
        .run(admin)
        .then(async (result) => {
          const count = result
            ? Object.values(result).reduce<number>((sum, value) => sum + (Number(value) || 0), 0)
            : 0;
          if (count > 0) await logEvent("info", "worker_maintenance", { action: task.name, count });
        })
        .catch(async (error: unknown) => {
          const code =
            error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
          await logEvent("warn", "worker_maintenance_failed", { action: task.name, code });
        })
        .finally(() => running.delete(task.name));
      running.set(task.name, work);
    };
    // Spread first runs so replicas started together do not all hit the database at once.
    timers.push(setTimeout(tick, 5000 + Math.floor(Math.random() * 10000)));
    timers.push(setInterval(tick, task.everyMs));
  }
  return async () => {
    for (const timer of timers) clearInterval(timer);
    await Promise.allSettled(running.values());
  };
}

export const trashRetentionTask: MaintenanceTask = {
  name: "trash_retention",
  everyMs: 60 * 60 * 1000,
  run: async (admin) => {
    const { data, error } = await admin.rpc("purge_expired_trash", { batch: 500 });
    if (error) throw Object.assign(new Error("Trash retention failed"), { code: error.code });
    return data as Record<string, unknown>;
  },
};

export function webhookDeliveryTask(worker: string): MaintenanceTask {
  return {
    name: "webhook_delivery",
    everyMs: 10 * 1000,
    run: async (admin) => {
      const { deliverWebhooks } = await import("@/lib/integrations/webhooks");
      return deliverWebhooks(admin, worker);
    },
  };
}

export const webhookRetentionTask: MaintenanceTask = {
  name: "webhook_retention",
  everyMs: 6 * 60 * 60 * 1000,
  run: async (admin) => {
    const { data, error } = await admin.rpc("webhook_retention");
    if (error) throw Object.assign(new Error("Webhook retention failed"), { code: error.code });
    return { removed: Number(data) || 0 };
  },
};

export function enrichmentTask(worker: string): MaintenanceTask {
  return {
    name: "record_enrichment",
    everyMs: 20 * 1000,
    run: async (admin) => {
      const { runEnrichment } = await import("@/lib/integrations/enrichment");
      return runEnrichment(admin, worker);
    },
  };
}

export const billingSeatTask: MaintenanceTask = {
  name: "billing_seats",
  everyMs: 30 * 60 * 1000,
  run: async (admin) => {
    const { syncSeats } = await import("@/lib/integrations/stripe");
    return syncSeats(admin);
  },
};
