import type { CrmRecord, Row } from "./types";
export type Signal = {
  code: string;
  label: string;
  weight: number;
  resource: string;
  ids: string[];
};
export type Priority = {
  record: CrmRecord;
  score: number;
  signals: Signal[];
  next_task: Row | null;
  last_interaction: string | null;
};
function grouped(rows: Row[]) {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const id = String(row.record_id ?? "");
    if (!id) continue;
    const group = map.get(id) ?? [];
    group.push(row);
    map.set(id, group);
  }
  return map;
}
export function rankPriorities(
  records: CrmRecord[],
  tasks: Row[],
  commitments: Row[],
  conflicts: Row[],
  activities: Row[],
  meetings: Row[],
  now = new Date(),
): Priority[] {
  const taskGroups = grouped(tasks),
    commitmentGroups = grouped(commitments),
    conflictGroups = grouped(conflicts),
    activityGroups = grouped(activities),
    meetingGroups = grouped(meetings);
  const stamp = now.getTime();
  return records
    .map((record) => {
      const signals: Signal[] = [];
      const openTasks = (taskGroups.get(record.id) ?? []).filter((t) =>
        ["open", "in_progress"].includes(String(t.status)),
      );
      const nextTask =
        openTasks
          .filter((t) => t.due_date && Date.parse(String(t.due_date)) >= stamp)
          .sort(
            (a, b) =>
              Date.parse(String(a.due_date)) - Date.parse(String(b.due_date)),
          )[0] ?? null;
      const lateTasks = openTasks.filter(
        (t) => t.due_date && Date.parse(String(t.due_date)) < stamp,
      );
      const latePromises = (commitmentGroups.get(record.id) ?? []).filter(
        (t) =>
          ["confirmed", "in_progress"].includes(String(t.status)) &&
          t.due_date &&
          Date.parse(String(t.due_date)) < stamp,
      );
      const openConflicts = (conflictGroups.get(record.id) ?? []).filter(
        (c) => c.status === "open",
      );
      if (latePromises.length)
        signals.push({
          code: "promise_late",
          label: latePromises.length + " engagement(s) accepté(s) en retard",
          weight: 35,
          resource: "commitments",
          ids: latePromises.map((t) => t.id),
        });
      if (openConflicts.length)
        signals.push({
          code: "conflict",
          label: openConflicts.length + " contradiction(s) à examiner",
          weight: 30,
          resource: "conflicts",
          ids: openConflicts.map((t) => t.id),
        });
      if (lateTasks.length)
        signals.push({
          code: "task_late",
          label: lateTasks.length + " tâche(s) en retard",
          weight: 25,
          resource: "tasks",
          ids: lateTasks.map((t) => t.id),
        });
      const interactions = [
        ...(activityGroups.get(record.id) ?? [])
          .filter((a) => ["call", "email", "meeting"].includes(String(a.type)))
          .map((a) => a.created_at),
        ...(meetingGroups.get(record.id) ?? []).map((m) =>
          String(m.starts_at || m.created_at),
        ),
      ]
        .filter((t) => Date.parse(t) <= stamp)
        .sort((a, b) => Date.parse(b) - Date.parse(a));
      const last = interactions[0] ?? null;
      if (!["Gagné", "Perdu"].includes(record.stage)) {
        if (!nextTask)
          signals.push({
            code: "next_step",
            label: "Aucune prochaine action datée",
            weight: 15,
            resource: "tasks",
            ids: [],
          });
        const idle = Math.floor(
          (stamp - Date.parse(last || record.created_at)) / 86400000,
        );
        const plannedSoon =
          !!nextTask &&
          Date.parse(String(nextTask.due_date)) > stamp &&
          Date.parse(String(nextTask.due_date)) <= stamp + 7 * 86400000;
        if (idle >= 14 && !plannedSoon)
          signals.push({
            code: "idle",
            label: "Aucun échange journalisé depuis " + idle + " jours",
            weight: 20,
            resource: "activities",
            ids: [],
          });
      }
      return {
        record,
        score: Math.min(
          100,
          signals.reduce((s, v) => s + v.weight, 0),
        ),
        signals,
        next_task: nextTask,
        last_interaction: last,
      };
    })
    .sort(
      (a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id),
    );
}
