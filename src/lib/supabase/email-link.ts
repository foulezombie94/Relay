import { z } from "zod";
import { loginDestination } from "./session";
const types = z.enum(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);
export function emailLink(values: { get(key: string): unknown; getAll(key: string): unknown[] }) {
  if (["token_hash", "type", "next"].some((key) => values.getAll(key).length > 1)) return null;
  const tokenHash = values.get("token_hash");
  const type = types.safeParse(values.get("type") || "email");
  if (typeof tokenHash !== "string" || !/^[a-f0-9]{64}$/i.test(tokenHash) || !type.success)
    return null;
  const next = values.get("next");
  return {
    tokenHash,
    type: type.data,
    next:
      next === "/reset-password" ? next : loginDestination(typeof next === "string" ? next : null),
  };
}
