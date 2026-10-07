import "server-only";
import { createHash } from "node:crypto";
import type { TeamInvitation } from "@/lib/domain/team";
export function teamLoginUrl() {
  if (!process.env.APP_URL) return null;
  try {
    const url = new URL("/login", process.env.APP_URL);
    if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.protocol === "http:")) return null;
    return url.toString();
  } catch { return null; }
}
export function invitationDeliveryConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.RELAY_EMAIL_FROM && teamLoginUrl());
}
export async function deliverInvitation(invite: TeamInvitation, workspaceName: string) {
  if (!invitationDeliveryConfigured()) return "manual" as const;
  const url = new URL(teamLoginUrl()!); url.searchParams.set("email", invite.email);
  const key = createHash("sha256").update(invite.id + ":" + invite.last_issued_at).digest("hex");
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(8000),
      headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json", "Idempotency-Key": "team-invite-" + key },
      body: JSON.stringify({ from: process.env.RELAY_EMAIL_FROM, to: [invite.email], subject: "Invitation à rejoindre un espace Relay", text: `Vous êtes invité à rejoindre ${workspaceName} sur Relay.\n\nConnectez-vous ou créez un compte avec ${invite.email}, puis vérifiez cette adresse :\n${url}\n\nL’invitation expire dans 7 jours et peut être annulée par l’administrateur.\nSi vous ne connaissez pas cet espace, ignorez cet email.` }),
    });
    return response.ok ? "sent" as const : "failed" as const;
  } catch { return "failed" as const; }
}
