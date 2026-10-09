import { z } from "zod";
const counter = z.number().int().nonnegative();
export const agentUsageSchema = z.object({
  settings: z.object({ daily_runs: counter.positive(), monthly_token_limit: counter.positive() }),
  month: z
    .object({ month: z.string(), tokens_reserved: counter, tokens_actual: counter })
    .nullable(),
  runs: z
    .array(
      z.object({
        id: z.uuid(),
        status: z.string().max(40),
        started_at: z.string(),
        tool_calls: counter,
        input_tokens: counter,
        output_tokens: counter,
        cost_microusd: counter,
      }),
    )
    .max(30),
});
export type AgentUsage = z.infer<typeof agentUsageSchema>;
export type AgentUsageResponse = { data: AgentUsage; configured: boolean; model: string };
