"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Check, CreditCard, ExternalLink, Sparkles } from "lucide-react";
import { request, useWorkspace } from "../providers/data-provider";
import { ErrorMessage, Loading } from "../ui";
import styles from "./billing.module.css";

type Billing = {
  configured: boolean;
  billable_seats: number;
  subscription: {
    plan: string;
    status: string;
    seats: number;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    trial_end: string | null;
    has_customer: boolean;
  } | null;
  plans: {
    id: "pro" | "business";
    available: boolean;
    amount: number | null;
    currency: string;
    interval: string;
  }[];
};
const planCopy = {
  free: { name: "Gratuit", summary: "Pour découvrir Zyliad." },
  pro: { name: "Pro", summary: "Pour les équipes commerciales qui organisent leur pipeline." },
  business: { name: "Business", summary: "Pour les organisations aux processus avancés." },
} as const;
const statusCopy: Record<string, string> = {
  active: "Actif",
  trialing: "Essai en cours",
  past_due: "Paiement en retard",
  unpaid: "Impayé",
  canceled: "Résilié",
  incomplete: "Paiement à finaliser",
  incomplete_expired: "Paiement expiré",
  paused: "En pause",
  none: "Aucun abonnement",
};
const day = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";
function price(amount: number | null, currency: string, interval: string) {
  if (amount === null) return "Tarif sur demande";
  return (
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency.toUpperCase() }).format(
      amount / 100,
    ) +
    " / siège / " +
    (interval === "year" ? "an" : "mois")
  );
}

/** Settings › Facturation: Stripe subscription per workspace, billed per active seat. */
export function BillingSettings() {
  const { workspace } = useWorkspace();
  const admin = ["owner", "admin"].includes(workspace.role);
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["rows", workspace.id, "billing"],
    enabled: admin,
    queryFn: () => request<Billing>(`/api/${workspace.id}/billing`),
  });
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("checkout");
    if (status === "success")
      toast.success("Merci ! Votre abonnement sera actif dès la confirmation du paiement.");
    if (status === "cancel") toast("Paiement annulé : aucun abonnement n’a été créé.");
  }, []);
  async function go(body: Record<string, unknown>, label: string) {
    setBusy(label);
    try {
      const { url } = await request<{ url: string }>(`/api/${workspace.id}/billing`, "POST", body);
      if (!/^https:\/\/(checkout|billing)\.stripe\.com\//.test(url))
        throw new Error("Adresse de paiement inattendue.");
      window.location.assign(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Redirection impossible.");
      setBusy(null);
    }
  }
  if (!admin)
    return (
      <p className={styles.notice}>La facturation est gérée par les administrateurs de l’espace.</p>
    );
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorMessage error={q.error} />;
  const billing = q.data!;
  const sub = billing.subscription;
  const active = !!sub && ["active", "trialing", "past_due"].includes(sub.status);
  const current = active ? (sub!.plan as keyof typeof planCopy) : "free";
  return (
    <div className={styles.billing}>
      <section className={styles.current}>
        <div className={styles.currentMain}>
          <span className={styles.planBadge} data-plan={current}>
            <Sparkles size={18} />
          </span>
          <div>
            <small>Offre actuelle</small>
            <h2>{planCopy[current].name}</h2>
            <p>
              {active
                ? `${sub!.seats} siège(s) facturé(s) · ${statusCopy[sub!.status] ?? sub!.status}`
                : "Aucun abonnement payant"}
            </p>
          </div>
        </div>
        <dl className={styles.facts}>
          <div>
            <dt>Sièges actifs</dt>
            <dd>{billing.billable_seats}</dd>
          </div>
          <div>
            <dt>{sub?.cancel_at_period_end ? "Fin de l’abonnement" : "Prochain renouvellement"}</dt>
            <dd>{active ? day(sub!.current_period_end) : "—"}</dd>
          </div>
          {sub?.trial_end && sub.status === "trialing" && (
            <div>
              <dt>Fin d’essai</dt>
              <dd>{day(sub.trial_end)}</dd>
            </div>
          )}
        </dl>
        {sub?.has_customer && (
          <button
            className="button small"
            disabled={!!busy || !billing.configured}
            onClick={() => void go({ action: "portal" }, "portal")}
          >
            <CreditCard size={14} /> {busy === "portal" ? "Ouverture…" : "Factures et paiement"}
            <ExternalLink size={12} />
          </button>
        )}
      </section>
      {sub?.status === "past_due" && (
        <p className={styles.alert} role="alert">
          <AlertTriangle size={15} /> Le dernier paiement a échoué. Mettez à jour votre moyen de
          paiement pour éviter l’interruption de l’abonnement.
        </p>
      )}
      {sub?.cancel_at_period_end && active && (
        <p className={styles.alert} role="status">
          <AlertTriangle size={15} /> L’abonnement s’arrêtera le {day(sub.current_period_end)}.
          Réactivez-le depuis le portail de facturation.
        </p>
      )}
      {!billing.configured && (
        <p className={styles.notice}>
          Le paiement en ligne n’est pas encore configuré sur ce serveur (clés Stripe manquantes).
        </p>
      )}
      <div className={styles.plans}>
        {(["free", ...billing.plans.map((p) => p.id)] as (keyof typeof planCopy)[]).map((id) => {
          const plan = billing.plans.find((p) => p.id === id);
          const isCurrent = current === id;
          return (
            <article key={id} className={styles.plan} data-current={isCurrent} data-plan={id}>
              <header>
                <h3>{planCopy[id].name}</h3>
                {isCurrent && (
                  <span className={styles.currentTag}>
                    <Check size={12} /> Actuelle
                  </span>
                )}
              </header>
              <p className={styles.price}>
                {id === "free"
                  ? "0 €"
                  : plan
                    ? price(plan.amount, plan.currency, plan.interval)
                    : "—"}
              </p>
              <p className={styles.summary}>{planCopy[id].summary}</p>
              {id !== "free" && !active && (
                <button
                  className="button primary small"
                  disabled={!!busy || !plan?.available}
                  onClick={() => void go({ action: "checkout", plan: id }, id)}
                >
                  {busy === id ? "Redirection…" : `Passer à ${planCopy[id].name}`}
                </button>
              )}
              {id !== "free" && active && !isCurrent && (
                <button
                  className="button small"
                  disabled={!!busy}
                  onClick={() => void go({ action: "portal" }, "portal")}
                >
                  Changer d’offre
                </button>
              )}
            </article>
          );
        })}
      </div>
      <p className={styles.footnote}>
        Facturation par siège actif (propriétaires, administrateurs et membres ; les lecteurs ne
        sont pas facturés), ajustée automatiquement au prorata quand l’équipe évolue. Paiement
        sécurisé par Stripe ; Zyliad ne stocke aucune donnée de carte.
      </p>
    </div>
  );
}
