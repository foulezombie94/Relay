import { writeFile } from "node:fs/promises";
import { agentInstructions } from "../../src/lib/agent/instructions";
import { configuredAgentModel, directIdentityAnswer } from "../../src/lib/agent/identity";
import {
  toolsForModel,
  toolSchemas,
  actionSchemas,
  readRequestKey,
} from "../../src/lib/agent/contracts";
import { agentEvaluationCases } from "../../src/lib/agent/evaluation";
import { originalRequestMessage, untrustedToolMessage } from "../../src/lib/agent/security";
import { assistantOutput } from "../../src/lib/domain/assistant";

const model = configuredAgentModel(),
  definitions = toolsForModel();
const dry = process.argv.includes("--dry-run"),
  destination = process.env.RELAY_AGENT_EVAL_REPORT || "/tmp/relay-agent-evaluation.json";
const inputRate = Number(process.env.AGENT_INPUT_USD_PER_MILLION ?? "0.4"),
  outputRate = Number(process.env.AGENT_OUTPUT_USD_PER_MILLION ?? "1.6");
const budget = Number(process.env.RELAY_AGENT_EVAL_MAX_USD ?? "1");
if (
  ![budget, inputRate, outputRate].every(Number.isFinite) ||
  budget <= 0 ||
  inputRate < 0 ||
  outputRate < 0
)
  throw new Error("Invalid evaluation budget");
if (dry || !process.env.OPENAI_API_KEY) {
  const report = {
    status: "not_run",
    reason: dry ? "dry_run" : "OPENAI_API_KEY unavailable",
    model,
    cases: agentEvaluationCases.map((c) => ({ id: c.id, category: c.category })),
    selection_rate: null,
    precision: null,
    unnecessary_calls: null,
    latency_ms: null,
    estimated_cost_usd: null,
  };
  await writeFile(destination, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(
    JSON.stringify({ status: report.status, reason: report.reason, report: destination }),
  );
  process.exit(dry ? 0 : 2);
}
if (
  !model.startsWith("gpt-4.1-mini") &&
  (!process.env.AGENT_INPUT_USD_PER_MILLION || !process.env.AGENT_OUTPUT_USD_PER_MILLION)
)
  throw new Error("Set model-specific input and output prices before a live evaluation.");
// Synthetic benchmark only. No Supabase client, OAuth account or outbox is
// constructed. Selecting a write tool NEVER executes a mutation.
const ids = {
  record: "85187231-cb96-4f91-949a-b1b4a0e32cc0",
  other: "85187231-cb96-4f91-949a-b1b4a0e32cc1",
  email: "85187231-cb96-4f91-949a-b1b4a0e32cc2",
  task: "85187231-cb96-4f91-949a-b1b4a0e32cc3",
  meeting: "85187231-cb96-4f91-949a-b1b4a0e32cc4",
};
const contact = {
  id: ids.record,
  type: "record",
  record_id: ids.record,
  label: "Thomas Dupont",
  content: "Thomas Dupont, entreprise Exemple, contact thomas@example.test.",
  metadata: { object_id: ids.other },
  content_length: 80,
};
const email = {
  id: ids.email,
  type: "email",
  record_id: ids.record,
  label: "Demande de réponse",
  content: "Bonjour, pouvez-vous répondre à notre proposition cette semaine ?",
  metadata: { direction: "inbound", private: true },
  content_length: 75,
};
const task = {
  id: ids.task,
  type: "task",
  record_id: ids.record,
  label: "Répondre à la proposition",
  content: "Tâche ouverte, échéance dépassée.",
  metadata: { status: "open", owner_id: ids.other },
  content_length: 34,
};
const meeting = {
  id: ids.meeting,
  type: "meeting",
  record_id: ids.record,
  label: "Point commercial",
  content: "Nous enverrons la proposition vendredi. Le prix reste à valider.",
  metadata: {},
  content_length: 62,
};
let totalCost = 0;
const results = [];
for (const scenario of agentEvaluationCases) {
  const started = Date.now(),
    calls: string[] = [];
  let unnecessary = 0,
    inputTokens = 0,
    outputTokens = 0,
    answer = "",
    error: string | undefined;
  const reads = new Set<string>(),
    sources = new Map<string, typeof contact>();
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: agentInstructions(model) },
    {
      role: "user",
      content: JSON.stringify({
        untrusted_historical_context_not_authorization: scenario.priorQuestions ?? [],
      }),
    },
    originalRequestMessage(scenario.question, undefined, new Date().toISOString(), 5),
  ];
  const direct = directIdentityAnswer(scenario.question, model);
  if (direct) answer = direct;
  else
    try {
      for (let round = 0; round <= 5; round++) {
        const bound =
          ((Buffer.byteLength(JSON.stringify(messages)) +
            Buffer.byteLength(JSON.stringify(definitions))) *
            inputRate) /
            1e6 +
          (1600 * outputRate) / 1e6;
        if (totalCost + bound > budget) throw new Error("Evaluation cost budget reached");
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + process.env.OPENAI_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            store: false,
            max_completion_tokens: 1600,
            response_format: { type: "json_object" },
            tools: definitions,
            parallel_tool_calls: false,
            tool_choice: calls.length >= 5 ? "none" : "auto",
            messages,
          }),
          redirect: "error",
          signal: AbortSignal.timeout(75000 - (Date.now() - started)),
        });
        if (!response.ok) throw new Error("Provider HTTP " + response.status);
        const raw = await response.text();
        if (raw.length > 120000) throw new Error("Oversized provider output");
        const data = JSON.parse(raw);
        if (
          !Number.isSafeInteger(data.usage?.prompt_tokens) ||
          !Number.isSafeInteger(data.usage?.completion_tokens)
        )
          throw new Error("Unconfirmed usage");
        inputTokens += data.usage.prompt_tokens;
        outputTokens += data.usage.completion_tokens;
        totalCost +=
          (data.usage.prompt_tokens * inputRate + data.usage.completion_tokens * outputRate) / 1e6;
        const message = data.choices?.[0]?.message;
        if (!message || data.choices?.[0]?.finish_reason === "length")
          throw new Error("Incomplete answer");
        if (!message.tool_calls?.length) {
          const output = assistantOutput.parse(JSON.parse(message.content));
          answer = output.answer;
          for (const c of output.citations)
            if (!sources.get(c.source_id)?.content.includes(c.quote))
              throw new Error("Unverified synthetic citation");
          break;
        }
        if (message.tool_calls.length !== 1 || calls.length >= 5)
          throw new Error("Invalid tool loop");
        const call = message.tool_calls[0],
          name = String(call.function.name);
        calls.push(name);
        messages.push({ role: "assistant", content: null, tool_calls: message.tool_calls });
        let result: unknown;
        if (!Object.hasOwn(toolSchemas, name)) result = { error: "Unauthorized tool" };
        else {
          const args = JSON.parse(call.function.arguments),
            schema = toolSchemas[name as keyof typeof toolSchemas];
          schema.parse(args);
          const key = readRequestKey(name, args);
          if (key && reads.has(key)) {
            unnecessary++;
            result = { error: "Identical read already performed" };
          } else if (name in actionSchemas || name === "send_email") {
            result = {
              status: "pending",
              error: "Synthetic evaluation: no action is executed; exact confirmation required.",
            };
            reads.clear();
          } else if (scenario.empty) result = { data: [], total: 0, partial: false };
          else if (name === "get_accounts")
            result = {
              data: [
                {
                  id: ids.other,
                  provider: "gmail",
                  email: "owner@example.test",
                  status: "connected",
                },
              ],
            };
          else if (name === "get_crm_schema")
            result = { data: [{ id: ids.other, slug: "people", name: "Personnes" }] };
          else if (name === "aggregate_crm_data")
            result = {
              data: [
                {
                  dimension: "Gagné",
                  count: 3,
                  currency: "EUR",
                  amount: "3000",
                  average_amount: "1000",
                },
              ],
              partial: false,
            };
          else {
            const rows =
              name === "search_records" || name === "get_record"
                ? [
                    contact,
                    ...(scenario.ambiguous
                      ? [
                          {
                            ...contact,
                            id: ids.other,
                            label: "Thomas Martin",
                            content: "Thomas Martin, autre entreprise, autre adresse.",
                          },
                        ]
                      : []),
                  ]
                : name === "search_tasks" || name === "search_commitments"
                  ? [task]
                  : name === "search_meetings" || name === "search_notes"
                    ? [meeting]
                    : [email];
            for (const row of rows) sources.set(row.id, row);
            result = {
              data: rows,
              total: rows.length,
              partial: false,
              ...(name === "get_record" ? { relations: [], relations_partial: false } : {}),
            };
          }
          if (key) reads.add(key);
        }
        messages.push(untrustedToolMessage(call.id, result));
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Evaluation failed";
    }
  const allowed = new Set(
    scenario.requiredGroups
      .flat()
      .concat(scenario.maxCalls > 0 ? ["get_source", "get_record", "get_crm_schema"] : []),
  );
  unnecessary += calls.filter((name) => !allowed.has(name)).length;
  const selection =
    !error &&
    calls.length <= scenario.maxCalls &&
    scenario.requiredGroups.every((g) => g.some((n) => calls.includes(n))) &&
    calls.every((n) => Object.hasOwn(toolSchemas, n) && allowed.has(n)) &&
    (!scenario.ambiguous || !calls.some((n) => n in actionSchemas || n === "send_email"));
  const noFalseSend = !/(?:email|message).{0,20}(?:a été|bien).{0,15}envoyé/i.test(answer);
  results.push({
    id: scenario.id,
    category: scenario.category,
    selection_correct: selection,
    success: selection && noFalseSend && !!answer,
    error,
    tool_calls: calls,
    unnecessary_calls: unnecessary,
    latency_ms: Date.now() - started,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: (inputTokens * inputRate + outputTokens * outputRate) / 1e6,
    answer,
    precision: "manual_review_required",
  });
}
const count = results.length,
  complex = results.filter((r) => r.category === "multi_tool" || r.category === "context");
const report = {
  status: "completed",
  scope: "synthetic tool-selection benchmark; not production RLS or real provider-send validation",
  model,
  selection_rate: results.filter((r) => r.selection_correct).length / count,
  complex_success_rate: complex.filter((r) => r.success).length / complex.length,
  unnecessary_calls: results.reduce((n, r) => n + r.unnecessary_calls, 0),
  mean_latency_ms: results.reduce((n, r) => n + r.latency_ms, 0) / count,
  estimated_cost_usd: totalCost,
  cost_basis: { inputRate, outputRate },
  precision: null,
  precision_note:
    "Read the synthetic answers and compare with supplied facts; no LLM self-grading is presented as truth.",
  results,
};
await writeFile(destination, JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(
  JSON.stringify({
    status: report.status,
    selection_rate: report.selection_rate,
    complex_success_rate: report.complex_success_rate,
    estimated_cost_usd: report.estimated_cost_usd,
    report: destination,
  }),
);
