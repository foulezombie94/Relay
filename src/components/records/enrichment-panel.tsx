"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Building,
  CalendarDays,
  ExternalLink,
  Globe,
  Hash,
  MapPin,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react";
import { request, useWorkspace } from "../providers/data-provider";
import type { CompanyEnrichment } from "@/lib/domain/enrichment";
import type { CrmRecord } from "@/lib/domain/types";
import styles from "./enrichment-panel.module.css";

type Enrichment = {
  status: "pending" | "running" | "done" | "failed" | "skipped";
  data: CompanyEnrichment;
  sources: string[];
  error: string | null;
  enriched_at: string | null;
};
const sourceLabels: Record<string, string> = {
  site: "site web",
  "annuaire-entreprises": "Annuaire des entreprises",
  email: "domaine email",
};
const socialLinks: [keyof CompanyEnrichment, string][] = [
  ["linkedin_url", "LinkedIn"],
  ["twitter_url", "X"],
  ["facebook_url", "Facebook"],
  ["instagram_url", "Instagram"],
  ["youtube_url", "YouTube"],
];

/** Attio-style enriched facts for companies (website, registry) and people (company link). */
export function EnrichmentPanel({
  record,
  slug,
  readonly,
}: {
  record: CrmRecord;
  slug: string;
  readonly: boolean;
}) {
  const { workspace } = useWorkspace();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const key = ["rows", workspace.id, "enrichment", record.id];
  const q = useQuery({
    queryKey: key,
    queryFn: () =>
      request<{ data: Enrichment | null }>(`/api/${workspace.id}/enrichment?record=${record.id}`),
    // Poll briefly while the worker processes the record.
    refetchInterval: (query) =>
      ["pending", "running"].includes(query.state.data?.data?.status ?? "") ? 5000 : false,
  });
  if (!["companies", "people"].includes(slug)) return null;
  const enrichment = q.data?.data;
  const data = enrichment?.data ?? {};
  const working = ["pending", "running"].includes(enrichment?.status ?? "");
  async function refresh() {
    setBusy(true);
    try {
      await request(`/api/${workspace.id}/enrichment`, "POST", { record: record.id });
      await cache.invalidateQueries({ queryKey: key });
      toast.success("Enrichissement demandé");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enrichissement impossible.");
    } finally {
      setBusy(false);
    }
  }
  const facts: [typeof Users, string, string | number | undefined][] = [
    [Building, "Secteur", data.industry],
    [Users, "Effectif", data.employees],
    [CalendarDays, "Création", data.founded_year],
    [
      MapPin,
      "Localisation",
      [data.postal_code, data.city].filter(Boolean).join(" ") || data.country,
    ],
    [Hash, "SIREN", data.siren],
  ];
  const visibleFacts = facts.filter(([, , value]) => value !== undefined && value !== "");
  const socials = socialLinks.filter(([field]) => typeof data[field] === "string");
  const canRefresh =
    !readonly && (slug === "companies" ? !!record.domain : !!record.email) && !working;
  return (
    <section className={styles.panel} aria-labelledby={`enrichment-${record.id}`}>
      <header className={styles.head}>
        <h3 id={`enrichment-${record.id}`}>
          <Sparkles size={15} /> Données enrichies
        </h3>
        <button
          type="button"
          className={styles.refresh}
          disabled={!canRefresh || busy}
          onClick={refresh}
          title="Mettre à jour"
          aria-label="Mettre à jour l’enrichissement"
        >
          <RefreshCw size={13} className={working ? styles.spin : undefined} />
        </button>
      </header>
      {q.isPending ? (
        <div className={styles.skeleton} aria-hidden />
      ) : !enrichment ? (
        <p className={styles.muted}>
          {slug === "companies"
            ? record.domain
              ? "Pas encore enrichie."
              : "Ajoutez le domaine du site pour enrichir automatiquement cette entreprise."
            : record.email
              ? "Pas encore enrichie."
              : "Ajoutez un email professionnel pour rattacher ce contact à son entreprise."}
        </p>
      ) : working ? (
        <p className={styles.muted}>Recherche des informations publiques…</p>
      ) : enrichment.status === "failed" ? (
        <p className={styles.muted}>{enrichment.error ?? "Enrichissement indisponible."}</p>
      ) : enrichment.status === "skipped" ? (
        <p className={styles.muted}>
          {slug === "people"
            ? "Adresse personnelle : aucune entreprise à rattacher."
            : "Aucune source exploitable pour ce domaine."}
        </p>
      ) : slug === "people" ? (
        <p className={styles.muted}>
          Rattaché à l’entreprise du domaine <strong>{data.company_domain}</strong>.
        </p>
      ) : (
        <>
          {(data.logo_url || data.description) && (
            <div className={styles.identity}>
              {data.logo_url && (
                // Public logo loaded by the browser only, without referrer.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.logo_url} alt="" referrerPolicy="no-referrer" loading="lazy" />
              )}
              {data.description && <p>{data.description}</p>}
            </div>
          )}
          {visibleFacts.length > 0 && (
            <dl className={styles.facts}>
              {visibleFacts.map(([Icon, label, value]) => (
                <div key={label}>
                  <dt>
                    <Icon size={13} /> {label}
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {(socials.length > 0 || data.website) && (
            <div className={styles.links}>
              {data.website && (
                <a href={data.website} target="_blank" rel="noreferrer noopener">
                  <Globe size={13} /> Site
                </a>
              )}
              {socials.map(([field, label]) => (
                <a key={field} href={String(data[field])} target="_blank" rel="noreferrer noopener">
                  <ExternalLink size={12} /> {label}
                </a>
              ))}
            </div>
          )}
        </>
      )}
      {enrichment?.status === "done" && enrichment.sources.length > 0 && (
        <small className={styles.source}>
          Source : {enrichment.sources.map((s) => sourceLabels[s] ?? s).join(", ")}
          {enrichment.enriched_at
            ? " · " + new Date(enrichment.enriched_at).toLocaleDateString("fr-FR")
            : ""}
        </small>
      )}
    </section>
  );
}
