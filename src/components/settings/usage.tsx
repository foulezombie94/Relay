"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CreditCard,
  Cpu,
  Sparkles,
  Users,
  Gauge,
  Check,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { request, useWorkspace } from "../providers/data-provider";
import type { AgentUsageResponse } from "@/lib/domain/agent-usage";
import { date } from "../ui";
import styles from "./settings.module.css";
const number = (value: number) => new Intl.NumberFormat("fr-FR").format(value);
export function useAgentUsage() {
  const { workspace, user } = useWorkspace();
  return useQuery({
    queryKey: ["agent-usage", workspace.id, user.id],
    queryFn: () => request<AgentUsageResponse>(`/api/${workspace.id}/assistant/usage`),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
  });
}
export function SettingsUsage({ billing = false }: { billing?: boolean }) {
  const { workspace, user } = useWorkspace();
  const q = useAgentUsage();
  const admin = ["owner", "admin"].includes(workspace.role);
  const team = useQuery({
    queryKey: ["team-count", workspace.id],
    enabled: billing && admin,
    queryFn: () => request<{ count: number }>(`/api/${workspace.id}/team?kind=members&page=0`),
    retry: false,
  });
  const data = q.error ? undefined : q.data?.data;
  const actual = data?.month?.tokens_actual ?? 0;
  const reserved = data?.month?.tokens_reserved ?? 0;
  const limit = data?.settings.monthly_token_limit;
  return (
    <>
      {billing && (
        <div className={styles.subscriptionCard}>
          <div className={styles.subscriptionTop}>
            <div className={styles.subscriptionIdentity}>
              <span className={styles.planIcon}>
                <Sparkles size={23} />
              </span>
              <div>
                <h2>Relay · {workspace.name}</h2>
                <p>Votre espace de travail</p>
              </div>
            </div>
            <span className={styles.softBadge}>
              <Check size={12} />
              Espace actif
            </span>
          </div>
          <div className={styles.subscriptionActions}>
            <a className="button small" href="#utilisation">
              <Gauge size={14} />
              Voir l’utilisation
            </a>
            <a className="button small" href="#equipe">
              <Users size={14} />
              Gérer les membres
            </a>
          </div>
          <div className={styles.billingMetrics}>
            <div>
              <span>
                <Users size={14} />
                Membres
              </span>
              <strong>{!team.error && team.data ? number(team.data.count) : "—"}</strong>
              <small>{admin ? "Personnes dans l’espace" : "Visible par un administrateur"}</small>
              <a href="#equipe">
                Équipe et accès <ArrowUpRight size={12} />
              </a>
            </div>
            <div>
              <span>
                <Cpu size={14} />
                Tokens IA ce mois-ci
              </span>
              <strong>
                {data ? number(actual) : "—"}
                <em> / {limit ? number(limit) : "—"}</em>
              </strong>
              <div
                className={styles.meter}
                role="meter"
                aria-label="Tokens IA consommés"
                aria-valuemin={0}
                aria-valuemax={limit ?? 1}
                aria-valuenow={Math.min(actual, limit ?? 1)}
              >
                <i style={{ width: limit ? `${Math.min((actual / limit) * 100, 100)}%` : "0%" }} />
              </div>
              <a href="#utilisation">
                Détail de l’utilisation <ArrowUpRight size={12} />
              </a>
            </div>
            <div>
              <span>
                <Gauge size={14} />
                Analyses IA par jour
              </span>
              <strong>{data ? number(data.settings.daily_runs) : "—"}</strong>
              <small>Limite partagée par l’espace</small>
              <a href="#utilisation">
                Voir les limites <ArrowUpRight size={12} />
              </a>
            </div>
          </div>
        </div>
      )}
      {q.error && (
        <div className={styles.loadError} role="alert">
          <p>Les quotas ne sont pas disponibles avec vos accès actuels.</p>
          <button className="button small" disabled={q.isFetching} onClick={() => void q.refetch()}>
            <RefreshCw size={13} />
            Réessayer
          </button>
        </div>
      )}
      {!billing && (
        <>
          <div className={styles.usageCards}>
            <article>
              <span>
                <Cpu size={17} />
                Tokens consommés
              </span>
              <strong>{data ? number(actual) : "—"}</strong>
              <p>sur {limit ? number(limit) : "—"} tokens ce mois-ci</p>
              <div className={styles.meter}>
                <i style={{ width: limit ? `${Math.min((actual / limit) * 100, 100)}%` : "0%" }} />
              </div>
            </article>
            <article>
              <span>
                <ShieldCheck size={17} />
                Budget utilisé ou réservé
              </span>
              <strong>{data ? number(reserved) : "—"}</strong>
              <p>Les réservations protègent les traitements en cours et incertains.</p>
              {!!data?.month?.uncertain_tokens && (
                <small>
                  {number(data.month.uncertain_tokens)} tokens estimés pour des appels sans
                  confirmation fournisseur.
                </small>
              )}
            </article>
            <article>
              <span>
                <Gauge size={17} />
                Limite quotidienne
              </span>
              <strong>{data ? number(data.settings.daily_runs) : "—"}</strong>
              <p>Analyses par jour, partagées par les utilisateurs de cet espace.</p>
            </article>
          </div>
          <div className={styles.inlineNotice}>
            Le budget mensuel est appliqué aux tokens utilisés ou réservés. Les limites sont
            contrôlées en base avant les appels IA ; elles ne représentent pas un abonnement
            facturé.
          </div>
          <section className={styles.settingSection}>
            <div className={styles.sectionCopy}>
              <h2>Vos dernières analyses</h2>
              <p>
                Vos 30 dernières exécutions au maximum. Cet historique n’est pas un total quotidien.
              </p>
            </div>
            <div className={styles.historyTable}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Statut</th>
                    <th>Outils</th>
                    <th>Tokens</th>
                    <th>Coût estimé</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.runs.map((run) => (
                    <tr key={run.id}>
                      <td>{date(run.started_at)}</td>
                      <td>
                        <span className={styles.runStatus} data-status={run.status}>
                          {(
                            {
                              complete: "Terminée",
                              running: "En cours",
                              error: "Interrompue",
                            } as Record<string, string>
                          )[run.status] ?? run.status}
                        </span>
                      </td>
                      <td>{run.tool_calls}</td>
                      <td>{number(run.input_tokens + run.output_tokens)}</td>
                      <td>
                        {(run.cost_microusd / 1_000_000).toLocaleString("fr-FR", {
                          style: "currency",
                          currency: "USD",
                          maximumFractionDigits: 4,
                        })}
                      </td>
                    </tr>
                  ))}
                  {data && !data.runs.length && (
                    <tr>
                      <td colSpan={5} className={styles.emptyCell}>
                        Vos analyses apparaîtront ici.
                      </td>
                    </tr>
                  )}
                  {!data && (
                    <tr>
                      <td colSpan={5} className={styles.emptyCell}>
                        {q.isPending ? "Chargement de l’utilisation…" : "Historique indisponible."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          {!!data?.provider_calls?.length && (
            <section className={styles.settingSection}>
              <div className={styles.sectionCopy}>
                <h2>Vos derniers appels au fournisseur IA</h2>
                <p>
                  Durées et tokens confirmés. Les estimations de coût dépendent des tarifs
                  configurés et ne constituent pas une facture.
                </p>
              </div>
              <div className={styles.historyTable}>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Fournisseur / modèle</th>
                      <th>Résultat</th>
                      <th>Durée</th>
                      <th>Entrée / sortie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.provider_calls.map((call, i) => (
                      <tr key={i}>
                        <td>{date(call.created_at)}</td>
                        <td>
                          {call.provider} · {call.model}
                        </td>
                        <td>
                          {call.status === "complete"
                            ? "Confirmé"
                            : call.status === "rejected"
                              ? "Refusé"
                              : "En cours / incertain"}
                          {call.http_status ? ` · ${call.http_status}` : ""}
                        </td>
                        <td>{call.duration_ms === null ? "—" : `${call.duration_ms} ms`}</td>
                        <td>
                          {number(call.input_tokens)} / {number(call.output_tokens)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
      {billing && (
        <section className={styles.settingSection}>
          <div className={styles.sectionCopy}>
            <h2>Informations de facturation</h2>
            <p>Les informations disponibles pour votre espace.</p>
          </div>
          <div className={styles.billingDetails}>
            <article>
              <h3>Compte et organisation</h3>
              <dl>
                <dt>Email du compte</dt>
                <dd>{user.email || "Non renseigné"}</dd>
                <dt>Espace</dt>
                <dd>{workspace.name}</dd>
                <dt>Devise CRM</dt>
                <dd>{workspace.currency}</dd>
              </dl>
              <a href="#organisation">
                Informations de l’espace <ArrowUpRight size={13} />
              </a>
            </article>
            <article className={styles.paymentEmpty}>
              <span>
                <CreditCard size={23} />
              </span>
              <h3>Facturation non connectée</h3>
              <p>
                Aucun abonnement ni moyen de paiement n’est relié à Relay. Les factures et
                changements d’offre seront disponibles après connexion d’un service de paiement.
              </p>
              <Link href="/doc">
                Consulter l’aide <ArrowUpRight size={13} />
              </Link>
            </article>
          </div>
        </section>
      )}
    </>
  );
}
export function SettingsAgent() {
  const q = useAgentUsage();
  const response = q.error ? undefined : q.data;
  return (
    <>
      <div className={styles.agentCard}>
        <span className={styles.agentOrb}>
          <Sparkles size={27} />
        </span>
        <div>
          <h2>Votre contexte. Vos prochaines actions.</h2>
          <p>Ask Relay recherche vos sources et vous accompagne dans votre CRM.</p>
          <span className={styles.softBadge}>
            {response
              ? response.configured
                ? "Disponible dans votre espace"
                : "Configuration requise"
              : "Vérification…"}
          </span>
        </div>
        <Link className="button primary" href="/app/assistant">
          Ouvrir Ask Relay <ArrowUpRight size={14} />
        </Link>
      </div>
      <section className={styles.settingSection}>
        <div className={styles.sectionCopy}>
          <h2>Modèle et fonctionnement</h2>
          <p>Une IA qui travaille avec les données auxquelles vous avez accès.</p>
        </div>
        <div className={styles.infoRows}>
          <div>
            <span>Fournisseur</span>
            <strong>OpenAI</strong>
          </div>
          <div>
            <span>Modèle configuré</span>
            <strong>{response?.model ?? "Indisponible"}</strong>
          </div>
          <div>
            <span>Recherches par réponse</span>
            <strong>5 · jusqu’à 15 avec Approfondir</strong>
          </div>
          <div>
            <span>Durée maximale</span>
            <strong>90 secondes</strong>
          </div>
        </div>
        {q.error && (
          <p role="alert" className={styles.systemHint}>
            La configuration actuelle ne peut pas être chargée.
          </p>
        )}
      </section>
      <div className={styles.securityCards}>
        <article>
          <ShieldCheck size={20} />
          <h3>Vos accès, toujours respectés</h3>
          <p>
            Les permissions sont vérifiées côté serveur. Les notes et emails privés gardent leurs
            restrictions.
          </p>
        </article>
        <article>
          <Check size={20} />
          <h3>Vous gardez la main</h3>
          <p>
            Les actions sensibles passent par une confirmation précise. Un email reçu n’autorise
            jamais une action.
          </p>
        </article>
      </div>
      <a className={styles.textLink} href="#utilisation">
        Consulter les limites et votre utilisation <ArrowUpRight size={14} />
      </a>
    </>
  );
}
