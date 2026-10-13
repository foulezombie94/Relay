import { expect, it } from "vitest";
import { workflowDefinition } from "@/lib/domain/workflow-schema";
import { blockPresets, blockSummary, createPreset } from "./block-presets";

const object_id = "70df58cb-a6be-4778-b6a3-14c53f86544a";
it("creates independent actions accepted by the execution contract after required configuration", () => {
  for (const preset of blockPresets) {
    const action = createPreset(preset.id)!;
    expect(action.id).not.toBe(createPreset(preset.id)!.id);
    if (preset.id === "assign") action.value = "56a29cca-ccba-4600-bf2a-0fcbdcddc0f6";
    if (preset.id === "wait-date") action.until = "2026-11-01T09:00:00Z";
    expect(
      workflowDefinition.safeParse({ object_id, conditions: [], actions: [action] }).success,
      preset.id,
    ).toBe(true);
  }
  expect(createPreset("unknown")).toBeUndefined();
});
it("requires the assignee and date before saving their presets", () => {
  for (const id of ["assign", "wait-date"]) {
    expect(
      workflowDefinition.safeParse({ object_id, conditions: [], actions: [createPreset(id)] })
        .success,
    ).toBe(false);
  }
});
it("keeps bounded email waits and never exposes message content or opaque IDs in summaries", () => {
  const action = createPreset("wait-reply")!;
  expect(action).toMatchObject({
    type: "wait_until",
    wait_mode: "email_reply",
    timeout_minutes: 10080,
    timeout_behavior: "stop",
  });
  expect(
    blockSummary({ type: "email", body: "private-content", to: "private@example.test" }),
  ).not.toContain("private");
  expect(blockSummary({ type: "set_field", field: "owner_id", value: "opaque-member-id" })).toBe(
    "Responsable · Membre sélectionné",
  );
});
