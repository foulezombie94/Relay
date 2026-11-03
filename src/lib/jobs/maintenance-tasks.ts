import "server-only";
import {
  startMaintenance,
  trashRetentionTask,
  webhookDeliveryTask,
  webhookRetentionTask,
  enrichmentTask,
  billingSeatTask,
  type MaintenanceTask,
} from "./maintenance";
export { startMaintenance };

/** Maintenance enabled on this worker. FEATURE_WORKER_MAINTENANCE=false disables all. */
export function maintenanceTasks(worker: string): MaintenanceTask[] {
  if (process.env.FEATURE_WORKER_MAINTENANCE === "false") return [];
  return [
    trashRetentionTask,
    webhookRetentionTask,
    ...(process.env.FEATURE_ENRICHMENT === "false" ? [] : [enrichmentTask(worker)]),
    ...(process.env.STRIPE_SECRET_KEY ? [billingSeatTask] : []),
    // Signing secrets are sealed with INTEGRATION_ENCRYPTION_KEY: deliver only when it is set.
    ...(process.env.INTEGRATION_ENCRYPTION_KEY ? [webhookDeliveryTask(worker)] : []),
  ];
}
