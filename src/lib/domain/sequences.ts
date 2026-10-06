import { z } from "zod";
export const sequenceSteps = z
  .array(
    z.object({
      subject: z.string().min(1).max(300),
      body: z.string().min(1).max(20000),
      delay_days: z.number().int().min(0).max(365),
    }),
  )
  .min(1)
  .max(30);
export function sequenceMessage(
  step: z.infer<typeof sequenceSteps>[number],
  record: Record<string, unknown>,
) {
  const render = (value: string) =>
    value.replace(/{{\s*([a-z_]+)\s*}}/g, (_, key: string) => {
      const v = record[key === "name" ? "display_name" : key];
      if (v === null || v === undefined || v === "")
        throw new Error("Information manquante : " + key);
      return String(v);
    });
  const subject = render(step.subject);
  const body = render(step.body);
  if (
    /{{|}}/.test(subject + body) ||
    /[\r\n]/.test(subject) ||
    subject.length > 300 ||
    body.length > 28000
  )
    throw new Error("Variables ou contenu du message invalides");
  return { subject, body };
}
export function businessTime(now: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const allowed = (date: Date) => {
    const parts = formatter.formatToParts(date);
    const day = parts.find((p) => p.type === "weekday")?.value;
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    return day !== "Sat" && day !== "Sun" && hour >= 9 && hour < 17;
  };
  if (allowed(now)) return now;
  let candidate = new Date(Math.ceil(now.getTime() / 900000) * 900000);
  for (let i = 0; i < 800; i++) {
    if (allowed(candidate)) return candidate;
    candidate = new Date(candidate.getTime() + 900000);
  }
  throw new Error("Fuseau horaire invalide");
}
export function nextSequenceDate(
  days: number,
  timezone: string,
  now = new Date(),
) {
  return businessTime(new Date(now.getTime() + days * 86400000), timezone);
}
