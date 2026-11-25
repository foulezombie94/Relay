import { describe, it, expect, vi } from "vitest";
import { workerLanes, runWorkerSlot } from "./lanes";
import { jobTypes } from "./types";
describe("bounded worker lanes", () => {
  it("covers all enabled job types and reserves capacity for interactive work", () => {
    const lanes = workerLanes([...jobTypes], {});
    expect(lanes.flatMap((l) => l.types).sort()).toEqual([...jobTypes].sort());
    expect(lanes.reduce((n, l) => n + l.concurrency, 0)).toBe(3);
    expect(lanes[0].types).not.toContain("imports");
    expect(lanes[0].maxPollMs).toBe(3000);
  });
  it("refuses unsafe capacity values", () => {
    for (const n of ["0", "-1", "5", "1.5", "NaN", ""])
      expect(() => workerLanes([...jobTypes], { WORKER_SHORT_CONCURRENCY: n })).toThrow();
  });
  it("runs an interactive job while an import is blocked and stops claiming on shutdown", async () => {
    let stop = false;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const completed: string[] = [];
    const lanes = workerLanes([...jobTypes], {});
    const bulkClaim = vi.fn().mockResolvedValueOnce("import").mockResolvedValue(null);
    const shortClaim = vi.fn().mockResolvedValueOnce("send").mockResolvedValue(null);
    const common = {
      stopping: () => stop,
      wait: async () => {
        stop = true;
      },
      error: async () => {
        throw new Error("unexpected");
      },
    };
    const long = runWorkerSlot({
      ...common,
      lane: lanes[1],
      claim: bulkClaim,
      run: async () => {
        await blocked;
        completed.push("import");
      },
    });
    await Promise.resolve();
    await runWorkerSlot({
      ...common,
      lane: lanes[0],
      claim: shortClaim,
      run: async () => {
        completed.push("send");
        stop = true;
      },
    });
    expect(completed).toEqual(["send"]);
    release();
    await long;
    expect(completed).toEqual(["send", "import"]);
    expect(bulkClaim).toHaveBeenCalledTimes(1);
    expect(shortClaim).toHaveBeenCalledTimes(1);
  });
});
