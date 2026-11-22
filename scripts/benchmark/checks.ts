/* eslint-disable @typescript-eslint/no-explicit-any -- the benchmark inspects arbitrary JSON produced by the model and its tool arguments. */
import { Case } from "./cases";
import { records, sources } from "./fixtures";
import { keyOf, MUTATING, TOOL_NAMES, ToolKey } from "./tools";

export interface ToolCall {
  name: string;
  args: any;
  result: unknown;
  /** false when the server refused the call (tool not loaded): it did not run. */
  executed?: boolean;
}
export interface RunResult {
  raw: string;
  toolCalls: ToolCall[];
  error?: string;
}
export interface CheckResult {
  name: string;
  pass: boolean;
  detail?: string;
}

interface Parsed {
  answer?: unknown;
  source_ids?: unknown;
  citations?: unknown;
  proposals?: unknown;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const clean = (s: string) =>
  s.replace(/[’‘]/g, "'").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();

export function parse(raw: string): { strict: boolean; data?: Parsed } {
  try {
    return { strict: true, data: JSON.parse(raw.trim()) };
  } catch {
    /* fall through */
  }
  const a = raw.indexOf("{"),
    b = raw.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try {
      return { strict: false, data: JSON.parse(raw.slice(a, b + 1)) };
    } catch {
      /* */
    }
  }
  return { strict: false };
}

const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
// Any attempt, refused or not: used for mustNotCall (trying a forbidden tool fails the case).
const called = (r: RunResult, k: ToolKey) => r.toolCalls.filter((c) => keyOf(c.name) === k);
// Calls that actually ran: used for mustCall, mustCallOneOf and args.
const executed = (r: RunResult, k: ToolKey) => called(r, k).filter((c) => c.executed !== false);

export function runChecks(c: Case, r: RunResult, model: string): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (name: string, pass: boolean, detail?: string) => out.push({ name, pass, detail });
  const e = c.expect;

  if (r.error) {
    add("exécution", false, r.error);
    return out;
  }

  // ── Format ──
  const { strict, data } = parse(r.raw);
  add("json_strict", strict, strict ? undefined : "texte autour du JSON ou JSON invalide");
  if (!data) {
    add("json_valide", false, r.raw.slice(0, 200));
    return out;
  }
  const answer = typeof data.answer === "string" ? data.answer : "";
  add(
    "schema",
    answer.length > 0 &&
      ["source_ids", "citations", "proposals"].every(
        (k) => (data as any)[k] === undefined || Array.isArray((data as any)[k]),
      ),
    "answer non vide et champs tableaux",
  );
  const sourceIds = arr(data.source_ids).map(String);
  const citations = arr(data.citations);
  const proposals = arr(data.proposals);

  // ── Global rules (every case) ──
  const consulted = new Set<string>();
  for (const t of r.toolCalls)
    for (const m of JSON.stringify(t.result).match(UUID) ?? []) consulted.add(m);
  const fake = sourceIds.filter((id) => !consulted.has(id));
  add(
    "source_ids_consultés",
    fake.length === 0,
    fake.length ? `non consultés : ${fake.join(", ")}` : undefined,
  );

  const badCit = citations.filter((q: any) => {
    const src = sources.find((s) => s.id === q?.source_id);
    const rec = records.find((x) => x.id === q?.source_id);
    const text = src?.text ?? (rec ? JSON.stringify(rec) : null);
    return !text || typeof q?.quote !== "string" || !clean(text).includes(clean(q.quote));
  });
  add(
    "citations_mot_pour_mot",
    badCit.length === 0,
    badCit.length
      ? badCit.map((q: any) => `«${String(q?.quote).slice(0, 60)}»`).join(" | ")
      : undefined,
  );

  const quoted = [...answer.matchAll(/«\s*([^»]{12,})\s*»|"([^"]{12,})"/g)].map((m) =>
    clean(m[1] ?? m[2]),
  );
  const citedText = citations.map((q: any) => clean(String(q?.quote ?? ""))).join(" ¶ ");
  const orphan = quoted.filter((q) => !citedText.includes(q) && !clean(c.user).includes(q));
  add(
    "guillemets_dans_citations",
    orphan.length === 0,
    orphan.length ? orphan[0].slice(0, 80) : undefined,
  );

  const claim =
    /\b(j['’]ai|je viens d['’]|c['’]est|a bien été|ont bien été|a été|ont été|est)\s+(bien\s+)?(envoyé|créé|crée|planifié|programmé|supprimé|modifié|mis à jour|enregistré|activé)/i;
  add("aucune_affirmation_d_exécution", !claim.test(answer), answer.match(claim)?.[0]);

  const leaked = Object.values(TOOL_NAMES).filter((n) => answer.includes(n));
  add("aucun_nom_d_outil", leaked.length === 0, leaked.join(", ") || undefined);

  const sigs = r.toolCalls.map((t) => `${t.name}:${JSON.stringify(t.args)}`);
  const dup = sigs.filter((s, i) => sigs.indexOf(s) !== i);
  add("aucun_appel_dupliqué", dup.length === 0, dup[0]);

  if (c.toolBudget != null)
    add(
      "budget_respecté",
      r.toolCalls.length <= c.toolBudget,
      `${r.toolCalls.length}/${c.toolBudget}`,
    );

  // ── Case expectations ──
  const n = r.toolCalls.length;
  if (e.maxToolCalls != null)
    add(`≤ ${e.maxToolCalls} appels d'outils`, n <= e.maxToolCalls, `${n} appels`);
  if (e.minToolCalls != null)
    add(`≥ ${e.minToolCalls} appels d'outils`, n >= e.minToolCalls, `${n} appels`);
  for (const k of e.mustCall ?? []) add(`appelle ${k}`, executed(r, k).length > 0);
  if (e.mustCallOneOf)
    add(
      `appelle un de ${e.mustCallOneOf.join("/")}`,
      e.mustCallOneOf.some((k) => executed(r, k).length > 0),
    );
  for (const k of e.mustNotCall ?? []) if (called(r, k).length) add(`n'appelle pas ${k}`, false);
  if (e.mustNotCall?.length && !e.mustNotCall.some((k) => called(r, k).length))
    add("aucun outil interdit", true);

  if (e.clarify === true) {
    const mut = r.toolCalls.filter((t) => MUTATING.includes(keyOf(t.name)!));
    add(
      "demande une précision",
      answer.includes("?") && mut.length === 0,
      mut.length ? "a agi au lieu de demander" : "aucune question",
    );
  }
  if (e.clarify === false) {
    add(
      "ne bloque pas sur une question",
      !/\b(lequel|laquelle|lesquels|pouvez-vous préciser|peux-tu préciser|de qui parlez)/i.test(
        answer,
      ),
    );
  }
  for (const re of e.answer ?? []) add(`answer ~ ${re}`, re.test(answer));
  for (const re of e.answerNot ?? [])
    add(`answer !~ ${re}`, !re.test(answer), answer.match(re)?.[0]);
  if (e.answerIncludesModel) {
    const short = model.split("/").pop()!;
    add(
      "cite configured_model",
      answer.toLowerCase().includes(short.toLowerCase()),
      `attendu : ${model}`,
    );
  }
  if (e.emptyArrays)
    add("tableaux vides", sourceIds.length + citations.length + proposals.length === 0);
  if (e.proposals?.min != null)
    add(
      `proposals ≥ ${e.proposals.min}`,
      proposals.length >= e.proposals.min,
      `${proposals.length}`,
    );
  if (e.proposals?.max != null)
    add(
      `proposals ≤ ${e.proposals.max}`,
      proposals.length <= e.proposals.max,
      `${proposals.length}`,
    );
  for (const id of e.citeIds ?? []) {
    add(
      `cite ${id.slice(-3)}`,
      sourceIds.includes(id) || citations.some((q: any) => q?.source_id === id),
    );
  }
  for (const id of e.notInProposals ?? []) {
    add(`proposals sans ${id.slice(-3)} (privé)`, !JSON.stringify(proposals).includes(id));
  }
  if (e.partial)
    add(
      "signale une analyse partielle",
      /(partiel|incomplet|tronqu|approfondir|pas pu (tout|lire|consulter))/i.test(answer),
    );
  for (const a of e.args ?? []) {
    const calls = executed(r, a.tool);
    add(
      `args ${a.tool} : ${a.label}`,
      calls.some((t) => {
        try {
          return a.check(t.args);
        } catch {
          return false;
        }
      }),
      calls
        .map((t) => JSON.stringify(t.args))
        .join(" | ")
        .slice(0, 200) || "outil non appelé",
    );
  }
  return out;
}
