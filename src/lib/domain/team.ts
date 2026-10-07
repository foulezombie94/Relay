import type { Role } from "./types";
export const teamRoles: Record<Role, { label: string; description: string }> = {
  owner: { label: "Propriétaire", description: "Gère tout l’espace et nomme les administrateurs. Cet accès est protégé." },
  admin: { label: "Administrateur", description: "Configure le CRM et gère les membres et lecteurs. Ne gère pas les autres administrateurs." },
  member: { label: "Membre", description: "Crée, importe et modifie les données CRM ; ne gère pas l’administration." },
  viewer: { label: "Lecteur", description: "Consulte et exporte les données accessibles ; ne peut pas les modifier." },
};
export type TeamMember = { id: string; user_id: string; role: Role; version: number; display_name: string; created_at: string };
export type TeamInvitation = { id: string; email: string; role: Exclude<Role, "owner">; created_at: string; last_issued_at: string; expires_at: string; accepted_at: string | null; revoked_at: string | null };
export function invitationState(invite: TeamInvitation, now = Date.now()) {
  if (invite.accepted_at) return "Acceptée";
  if (invite.revoked_at) return "Annulée";
  return new Date(invite.expires_at).getTime() <= now ? "Expirée" : "En attente";
}
export function canManageTeamMember(actor: Role, currentUser: string, member: TeamMember) {
  return member.role !== "owner" && member.user_id !== currentUser && (actor === "owner" || (actor === "admin" && member.role !== "admin"));
}
