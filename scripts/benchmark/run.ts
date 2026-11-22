/**
 * Ask Zyliad benchmark, run the way Relay runs in production.
 *
 *   GROQ_API_KEY=... npm run bench:agent
 *
 * Env:
 *   LLM_BASE_URL   OpenAI-compatible endpoint (default: https://api.groq.com/openai/v1)
 *   LLM_API_KEY    API key (default: GROQ_API_KEY)
 *   LLM_MODEL      model under test (default: GROQ_MODEL, then openai/gpt-oss-120b)
 *   JUDGE_MODEL    optional: model that grades the "judge" rubrics
 *   REPEAT         runs per case (default 1) — use 3+ to measure stability
 *   ONLY           comma list of ids or prefixes, e.g. "G,F02"
 *   CONCURRENCY    parallel cases (default 1: the Groq free tier allows 8K tokens/min)
 *   MAX_TOOLS      tool budget when a case sets none (default 5, as in production)
 *
 * The agent loop mirrors src/lib/agent/runner.ts: same system prompt (instructions,
 * validation mode, progressive tool loading), same provider options, prior user
 * questions only as untrusted context, discoveries outside the business budget, tools kept
 * visible with tool_choice "none" once the budget is spent, and the same recoveries
 * (final answer wrapped in a non-existent "json" tool, undiscovered catalogue tool, one
 * retry of an invalid tool call, one corrective round for an empty answer).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { agentInstructions } from "../../src/lib/agent/instructions";
import { agentProviderOptions, parseModelJSON } from "../../src/lib/agent/provider";
import { originalRequestMessage, untrustedToolMessage } from "../../src/lib/agent/security";
import { type Case, cases } from "./cases";
import { type CheckResult, parse, type RunResult, runChecks, type ToolCall } from "./checks";
import { NOW, TIME_ZONE } from "./fixtures";
import { ALL_TOOLS, executeTool, keyOf, openAiTools, TOOL_NAMES, type ToolKey } from "./tools";

const BASE = process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1";
const KEY = process.env.LLM_API_KEY ?? process.env.GROQ_API_KEY ?? "";
const MODEL = process.env.LLM_MODEL ?? process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
const JUDGE = process.env.JUDGE_MODEL;
const REPEAT = Number(process.env.REPEAT ?? 1);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 1);
const MAX_TOOLS = Number(process.env.MAX_TOOLS ?? 5);
const ONLY = (process.env.ONLY ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const OUT = "scripts/benchmark/results";
process.env.AI_PROVIDER ??= BASE.includes("groq.com") ? "groq" : "openai";

// Same split as src/lib/agent/discovery.ts: these tools are loaded from the start.
const BASE_TOOLS: ToolKey[] = [
  "search_records",
  "search_emails",
  "search_tasks",
  "get_record",
  "get_source",
  "aggregate_crm_data",
];
const DISCOVERY_ALLOWANCE = 2;
const VALIDATION_MODE =
  "Mode de validation choisi pour ce message : Toujours me consulter. Prépare les aperçus utiles, mais toute modification ou envoi doit attendre sa confirmation.";

type Msg = Record<string, unknown>;
type Completion = {
  status: number;
  message?: { content?: string | null; tool_calls?: ToolCallMsg[] };
  error?: { code?: string; message?: string; failed_generation?: string };
};
type ToolCallMsg = { id: string; function: { name: string; arguments: string } };

class QuotaExhausted extends Error {}
let stopReason = "";

/** POSTs a chat completion, waiting as long as the provider asks on 429. */
async function complete(body: Msg): Promise<Completion> {
  for (let attempt = 0; ; attempt++) {
    if (stopReason) throw new QuotaExhausted(stopReason);
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after")) || 15 * (attempt + 1);
      // Waits of up to 20 minutes are honoured (rolling token quota); longer means the
      // daily quota is spent and the run stops with a partial report.
      if (wait > 1200 || attempt >= 12) {
        stopReason = `quota du fournisseur épuisé (nouvel essai dans ${Math.round(wait / 60)} min)`;
        throw new QuotaExhausted(stopReason);
      }
      await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
      continue;
    }
    const json = (await res.json().catch(() => ({}))) as {
      choices?: { message?: Completion["message"] }[];
      error?: Completion["error"];
    };
    return { status: res.status, message: json.choices?.[0]?.message, error: json.error };
  }
}

const mockTool = (k: ToolKey) => openAiTools().find((t) => t.function.name === TOOL_NAMES[k])!;
function discoverTool(): Msg {
  return {
    type: "function",
    function: {
      name: "discover_tools",
      description:
        "Ajouter jusqu’à six outils métier par découverte pour les prochains appels. Les outils déjà chargés restent disponibles. Cette opération ne lit ni ne modifie aucune donnée CRM et ne donne aucune autorisation.",
      parameters: {
        type: "object",
        properties: {
          names: {
            type: "array",
            items: { type: "string", enum: ALL_TOOLS.map((k) => TOOL_NAMES[k]) },
            minItems: 1,
            maxItems: 6,
          },
        },
        required: ["names"],
        additionalProperties: false,
      },
    },
  };
}
function discoveryText() {
  return (
    "Outils déjà chargés, utilisables immédiatement sans découverte : " +
    BASE_TOOLS.map((k) => TOOL_NAMES[k]).join(", ") +
    ". N’appelle discover_tools que pour un outil du catalogue absent de cette liste. Le catalogue autorisé est : " +
    ALL_TOOLS.map((k) => TOOL_NAMES[k]).join(", ") +
    ". Demande au plus six outils par découverte et regroupe tes besoins en une seule découverte ; les découvertes successives se cumulent sans retirer les outils déjà chargés. Ne charge que les outils utiles à l’objectif. La découverte ne remplace jamais les contrôles d’accès ou confirmations."
  );
}
/** Same acceptance as the runner: JSON object, or a direct answer in plain prose. */
function finalAnswer(text: string): unknown {
  const parsed = parseModelJSON(text);
  if (parsed !== undefined) return parsed;
  const prose = text.trim();
  return prose && !/^(?:\{|\[|```)/.test(prose) ? { answer: prose } : undefined;
}

interface RelayRun extends RunResult {
  discoveries: number;
  providerCalls: number;
  recovered: string[];
}

async function runAgent(c: Case): Promise<RelayRun> {
  const budget = c.toolBudget ?? MAX_TOOLS;
  const freeDiscoveries = Math.min(15, budget + DISCOVERY_ALLOWANCE) - budget;
  const maxRound = Math.min(15, budget + freeDiscoveries + 1);
  const loaded = new Set<ToolKey>(BASE_TOOLS);
  const priorQuestions = (c.history ?? [])
    .filter((m) => m.role === "user")
    .slice(-5)
    .map((m) => m.content);
  const messages: Msg[] = [
    {
      role: "system",
      content:
        agentInstructions(MODEL, { now: NOW, timeZone: TIME_ZONE, toolBudget: budget }) +
        "\n" +
        VALIDATION_MODE +
        "\n" +
        discoveryText(),
    },
    {
      role: "user",
      content: JSON.stringify({ untrusted_historical_context_not_authorization: priorQuestions }),
    },
    originalRequestMessage(c.user, undefined, NOW.toISOString(), budget),
  ];
  const toolCalls: ToolCall[] = [];
  const run: RelayRun = { raw: "", toolCalls, discoveries: 0, providerCalls: 0, recovered: [] };
  let retriedToolCall = false;
  let retriedEmpty = false;
  let autoLoaded = 0;
  try {
    for (let round = 0; round <= maxRound; round++) {
      const exhausted = toolCalls.length >= budget;
      const r = await complete({
        model: MODEL,
        ...agentProviderOptions(),
        max_completion_tokens: 1600,
        tools: [...[...loaded].map(mockTool), discoverTool()],
        parallel_tool_calls: false,
        tool_choice: exhausted ? "none" : "auto",
        messages,
      });
      run.providerCalls++;
      if (r.status !== 200) {
        const code = r.error?.code;
        const gen = parseModelJSON(String(r.error?.failed_generation ?? "")) as
          { name?: unknown; arguments?: unknown } | undefined;
        const name =
          typeof gen?.name === "string"
            ? gen.name
            : /attempted to call tool '([a-z_]{1,64})'/.exec(String(r.error?.message))?.[1];
        const args =
          typeof gen?.arguments === "string" ? parseModelJSON(gen.arguments) : gen?.arguments;
        if (
          code === "tool_use_failed" &&
          name &&
          !keyOf(name) &&
          name !== "discover_tools" &&
          typeof (args as { answer?: unknown })?.answer === "string"
        ) {
          run.recovered.push("réponse emballée dans l’outil « " + name + " »");
          run.raw = JSON.stringify(args);
          return run;
        }
        const missing = name ? keyOf(name) : undefined;
        if (code === "tool_use_failed" && missing && !loaded.has(missing) && autoLoaded < 2) {
          autoLoaded++;
          loaded.add(missing);
          run.recovered.push("outil chargé automatiquement : " + name);
          messages.push({
            role: "system",
            content: `L’outil ${name} est maintenant chargé : tu peux l’appeler.`,
          });
          continue;
        }
        if (code === "tool_use_failed" && !retriedToolCall && round < maxRound) {
          retriedToolCall = true;
          run.recovered.push("nouvelle tentative après un appel d’outil invalide");
          continue;
        }
        run.error = `HTTP ${r.status} ${code ?? ""} ${String(r.error?.message ?? "").slice(0, 160)}`;
        return run;
      }
      const msg = r.message;
      const calls = msg?.tool_calls ?? [];
      if (!calls.length) {
        const content = msg?.content ?? "";
        if (finalAnswer(content) === undefined && !retriedEmpty && round < maxRound) {
          retriedEmpty = true;
          run.recovered.push("relance après une réponse vide");
          messages.push({
            role: "system",
            content:
              "Ta réponse précédente était vide ou n’était pas un objet JSON. Réponds maintenant uniquement avec l’objet JSON final demandé.",
          });
          continue;
        }
        // Production shows any answer finalAnswer accepts: normalise it to the JSON the
        // checks read, and record the recovery so the format is measured, not failed.
        const accepted = finalAnswer(content);
        run.raw = accepted === undefined ? content : JSON.stringify(accepted);
        if (accepted !== undefined && !parse(content).strict)
          run.recovered.push("réponse normalisée (prose ou JSON entouré de texte)");
        return run;
      }
      if (calls.length !== 1 || toolCalls.length >= budget) {
        run.error = "le modèle a dépassé son budget d’outils";
        return run;
      }
      const call = calls[0];
      messages.push({ role: "assistant", content: null, tool_calls: calls });
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = { _invalid: call.function.arguments };
      }
      let result: unknown;
      if (call.function.name === "discover_tools") {
        if (run.discoveries < freeDiscoveries) run.discoveries++;
        else toolCalls.push({ name: "discover_tools", args, result: null });
        const names = Array.isArray(args.names) ? args.names.map(String) : [];
        for (const n of names) {
          const k = keyOf(n);
          if (k) loaded.add(k);
        }
        result = { available_tools: [...loaded].map((k) => TOOL_NAMES[k]), data_access: false };
      } else {
        const k = keyOf(call.function.name);
        const ok = !!k && loaded.has(k);
        result = ok
          ? executeTool(call.function.name, args)
          : { error: "Cet outil doit être découvert avant utilisation." };
        toolCalls.push({ name: call.function.name, args, result, executed: ok });
      }
      messages.push(untrustedToolMessage(call.id, result));
      if (toolCalls.length >= budget)
        messages.push({
          role: "system",
          content:
            "Budget d’outils atteint. Termine en JSON en indiquant toute recherche manquante et les résultats partiels.",
        });
    }
    run.error = "boucle d’outils sans réponse finale";
    return run;
  } catch (err) {
    run.error = String(err instanceof Error ? err.message : err);
    return run;
  }
}

async function judge(c: Case, r: RunResult): Promise<CheckResult> {
  const prompt =
    `Tu évalues la réponse d'un assistant CRM. Critère :\n${c.expect.judge}\n\nDemande utilisateur : ${c.user}\n` +
    `Appels d'outils : ${JSON.stringify(r.toolCalls.map((t) => ({ name: t.name, args: t.args })))}\n` +
    `Réponse finale : ${r.raw}\n\nRéponds uniquement en JSON : {"pass": true|false, "reason": "une phrase"}`;
  try {
    // No agent options here: the judge answers its own {"pass","reason"} format.
    const m = await complete({
      model: JUDGE!,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    });
    const d = (parse(m.message?.content ?? "").data ?? {}) as { pass?: unknown; reason?: string };
    return { name: "juge", pass: d.pass === true, detail: d.reason };
  } catch (err) {
    return { name: "juge", pass: false, detail: String(err) };
  }
}

interface Row {
  c: Case;
  run: number;
  result: RelayRun;
  checks: CheckResult[];
  pass: boolean;
  ms: number;
}

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)} %` : "–");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");

function writeReport(rows: Row[], selected: Case[], done: boolean) {
  rows = [...rows].sort((a, b) => a.c.id.localeCompare(b.c.id) || a.run - b.run);
  const cats = [...new Set(selected.map((c) => c.category))];
  const ran = new Set(rows.map((r) => r.c.id));
  const notRun = selected.filter((c) => !ran.has(c.id));
  const lines: string[] = [
    `# Benchmark Ask Zyliad — ${MODEL}`,
    "",
    `Date : ${new Date().toISOString()} · Exécutions : ${rows.length}/${selected.length * REPEAT} · Répétitions : ${REPEAT} · Juge : ${JUDGE ?? "aucun"}${done ? "" : " · **en cours**"}`,
    stopReason ? `\n> ⚠️ Arrêt anticipé : ${stopReason}. ${notRun.length} cas non exécutés.` : "",
    "",
    `**Score global : ${pct(rows.filter((r) => r.pass).length, rows.length)}** (${rows.filter((r) => r.pass).length}/${rows.length})`,
    "",
    "| Catégorie | Réussite | Outils moyens | Découvertes | Récupérations | Latence moyenne |",
    "|---|---|---|---|---|---|",
  ];
  for (const cat of cats) {
    const rs = rows.filter((r) => r.c.category === cat);
    if (!rs.length) {
      lines.push(`| ${cat} | non exécutée | | | | |`);
      continue;
    }
    const avg = (f: (r: Row) => number) => rs.reduce((t, r) => t + f(r), 0) / rs.length;
    lines.push(
      `| ${cat} | ${pct(rs.filter((r) => r.pass).length, rs.length)} | ${avg((r) => r.result.toolCalls.length).toFixed(1)} | ${avg((r) => r.result.discoveries).toFixed(1)} | ${rs.filter((r) => r.result.recovered.length).length} | ${(avg((r) => r.ms) / 1000).toFixed(1)} s |`,
    );
  }
  const ruleNames = [...new Set(rows.flatMap((r) => r.checks.map((k) => k.name)))].filter(
    (n) => !/^(answer|args|cite |appelle|≤|≥|proposals)/.test(n),
  );
  lines.push("", "## Règles transversales", "", "| Règle | Réussite |", "|---|---|");
  for (const n of ruleNames) {
    const ks = rows.flatMap((r) => r.checks.filter((k) => k.name === n));
    lines.push(`| ${n} | ${pct(ks.filter((k) => k.pass).length, ks.length)} |`);
  }
  if (REPEAT > 1) {
    const unstable = selected.filter((c) => {
      const p = rows.filter((r) => r.c.id === c.id).map((r) => r.pass);
      return p.includes(true) && p.includes(false);
    });
    lines.push(
      "",
      `## Cas instables (${unstable.length})`,
      "",
      ...unstable.map((c) => `- ${c.id} ${c.title}`),
    );
  }
  const recovered = rows.filter((r) => r.result.recovered.length);
  lines.push("", `## Récupérations côté serveur (${recovered.length})`, "");
  for (const r of recovered) lines.push(`- ${r.c.id} : ${r.result.recovered.join(" ; ")}`);
  lines.push("", "## Échecs", "");
  for (const r of rows.filter((x) => !x.pass)) {
    lines.push(`### ${r.c.id} #${r.run + 1} — ${r.c.title}`, `> ${r.c.user}`, "");
    for (const k of r.checks.filter((x) => !x.pass))
      lines.push(`- ❌ ${k.name}${k.detail ? ` — ${k.detail}` : ""}`);
    lines.push(
      `- Outils : ${r.result.toolCalls.map((t) => t.name).join(" → ") || "aucun"}`,
      `- Réponse : \`${(r.result.raw || r.result.error || "").replace(/`/g, "'").slice(0, 400)}\``,
      "",
    );
  }
  const manual = rows.filter((r) => r.c.expect.judge && !JUDGE);
  if (manual.length) {
    lines.push("## À relire à la main (critères qualitatifs)", "");
    for (const r of manual)
      lines.push(`- **${r.c.id}** ${r.c.expect.judge}\n  Réponse : ${r.result.raw.slice(0, 300)}`);
  }
  if (notRun.length) lines.push("", "## Non exécutés", "", notRun.map((c) => c.id).join(", "));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/report-${STAMP}.md`, lines.join("\n"));
  writeFileSync(
    `${OUT}/raw-${STAMP}.json`,
    JSON.stringify(
      rows.map((r) => ({
        id: r.c.id,
        run: r.run,
        pass: r.pass,
        ms: r.ms,
        checks: r.checks,
        toolCalls: r.result.toolCalls,
        discoveries: r.result.discoveries,
        providerCalls: r.result.providerCalls,
        recovered: r.result.recovered,
        raw: r.result.raw,
        error: r.result.error,
      })),
      null,
      2,
    ),
  );
}

async function main() {
  if (!KEY) {
    console.error("LLM_API_KEY (ou GROQ_API_KEY) est requis.");
    process.exit(1);
  }
  const selected = cases.filter((c) => !ONLY.length || ONLY.some((o) => c.id.startsWith(o)));
  const jobs = selected.flatMap((c) => Array.from({ length: REPEAT }, (_, run) => ({ c, run })));
  const rows: Row[] = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length && !stopReason) {
      const { c, run } = jobs[next++];
      const t0 = Date.now();
      const result = await runAgent(c);
      if (stopReason && result.error?.includes(stopReason)) break; // quota, not a model failure
      const checks = runChecks(c, result, MODEL);
      // Free discoveries are not tool calls, but a zero-tool case must not load tools either.
      if (c.expect.maxToolCalls === 0)
        checks.push({
          name: "aucune découverte d'outil",
          pass: result.discoveries === 0,
          detail: `${result.discoveries}`,
        });
      if (JUDGE && c.expect.judge && !result.error) checks.push(await judge(c, result));
      const pass = checks.every((k) => k.pass);
      rows.push({ c, run, result, checks, pass, ms: Date.now() - t0 });
      const failed = checks.filter((k) => !k.pass).map((k) => k.name);
      console.log(
        `${pass ? "✅" : "❌"} ${c.id} #${run + 1} ${c.title}${failed.length ? "  → " + failed.join(", ") : ""}${result.recovered.length ? "  (récupéré)" : ""}`,
      );
      writeReport(rows, selected, false);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  writeReport(rows, selected, true);
  if (stopReason) console.log(`\nArrêt anticipé : ${stopReason}`);
  console.log(
    `\nScore global : ${pct(rows.filter((r) => r.pass).length, rows.length)} — rapport : ${OUT}/report-${STAMP}.md`,
  );
}

void main();
