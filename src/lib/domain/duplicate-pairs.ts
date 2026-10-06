import { duplicateGroups } from "./duplicates";
import type { CrmRecord } from "./types";
export type DuplicateDecision = {
  record_a: string;
  record_b: string;
  status: "separate" | "deferred";
  defer_until: string | null;
};
export type DuplicatePair = {
  key: string;
  a: CrmRecord;
  b: CrmRecord;
  reasons: string[];
  strength: "fort" | "à examiner";
};
export function pairKey(a: string, b: string) {
  return [a.toLowerCase(), b.toLowerCase()].sort().join(":");
}
export function decisionBlocks(
  decision: DuplicateDecision | undefined,
  now: number,
) {
  return (
    !!decision &&
    (decision.status === "separate" ||
      Date.parse(decision.defer_until ?? "") > now)
  );
}
export function findDuplicatePairs(
  records: CrmRecord[],
  decisions: DuplicateDecision[],
  now = Date.now(),
  limit = 250,
) {
  const blocked = new Map(
    decisions.map((d) => [pairKey(d.record_a, d.record_b), d]),
  );
  const seen = new Set<string>();
  const pairs: DuplicatePair[] = [];
  let visits = 0;
  for (const group of duplicateGroups(records)) {
    for (let i = 0; i < group.records.length; i++) {
      for (let j = i + 1; j < group.records.length; j++) {
        if (++visits > 50000) return { pairs, truncated: true };
        const a = group.records[i],
          b = group.records[j],
          key = pairKey(a.id, b.id);
        if (seen.has(key)) continue;
        seen.add(key);
        if (decisionBlocks(blocked.get(key), now)) continue;
        if (pairs.length === limit) return { pairs, truncated: true };
        const matches = duplicateGroups([a, b]);
        pairs.push({
          key,
          a,
          b,
          reasons: matches.map((g) => g.reason),
          strength: matches.some((g) => g.strength === "fort")
            ? "fort"
            : "à examiner",
        });
      }
    }
  }
  return { pairs, truncated: false };
}
