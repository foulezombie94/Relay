"use client";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CircleAlert,
  TrendingUp,
  CheckCheck,
  Mail,
  Handshake,
  CalendarClock,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { request, useWorkspace } from "../providers/data-provider";
import {
  pulseOverviewPrompt,
  pulseAnalysisPrompt,
  type AssistantPulse,
  type PulseSignal,
} from "@/lib/domain/assistant-pulse";
import type { RecordContext } from "./composer";
import styles from "./assistant.module.css";

export function RelayPulse({
  configured,
  onAnalyze,
}: {
  configured: boolean;
  onAnalyze: (prompt: string, context: RecordContext) => void;
}) {
  const { workspace, user } = useWorkspace();
  const query = useQuery({
    queryKey: ["assistant-pulse", workspace.id, user.id],
    queryFn: () => request<{ data: AssistantPulse }>(`/api/${workspace.id}/assistant/pulse`),
    staleTime: 15_000,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });
  const pulse = query.error ? undefined : query.data?.data;
  const display = (value: number | undefined) =>
    value === undefined ? "—" : new Intl.NumberFormat("fr-FR").format(value);
  function analyze(signal: PulseSignal) {
    onAnalyze(
      pulseAnalysisPrompt(signal),
      signal.record_id ? { id: signal.record_id, label: signal.label || "Fiche à analyser" } : null,
    );
  }
  const signals =
    pulse?.signals ??
    ([
      { kind: "email", detected: false },
      { kind: "deal", detected: false },
      { kind: "commitment", detected: false },
    ] satisfies PulseSignal[]);
  return (
    <section className={styles.pulse} aria-label="Zyliad Pulse" aria-busy={query.isPending}>
      <header className={styles.pulseHeader}>
        <div>
          <h2>
            <Activity size={14} />
            Zyliad Pulse
          </h2>
          <p>Votre activité, vos priorités, vos opportunités</p>
        </div>
        <span
          className={styles.pulseBadge}
          title="Comptages sur les données accessibles avec vos droits actuels."
        >
          {query.isPending ? "Chargement…" : query.error ? "Indisponible" : "Vos données"}
        </span>
      </header>
      <div className={styles.pulseMetrics}>
        <div title="Tâches en retard, engagements confirmés à échéance sous 7 jours (retards inclus), et contradictions ouvertes.">
          <CircleAlert size={14} className={styles.pulseAlert} />
          <strong>{display(pulse?.counts.attention)}</strong>
          <span>À traiter</span>
        </div>
        <div title="Toutes les opportunités non archivées accessibles, y compris gagnées ou perdues.">
          <TrendingUp size={15} className={styles.pulseGrowth} />
          <strong>{display(pulse?.counts.opportunities)}</strong>
          <span>Opportunités</span>
        </div>
        <div title="Tâches ouvertes ou en cours accessibles.">
          <CheckCheck size={16} />
          <strong>{display(pulse?.counts.open_tasks)}</strong>
          <span>Tâches ouvertes</span>
        </div>
      </div>
      {query.error ? (
        <div className={styles.pulseError} role="alert">
          <span>Pulse ne peut pas être chargé avec vos accès actuels.</span>
          <button type="button" disabled={query.isFetching} onClick={() => void query.refetch()}>
            <RefreshCw size={13} />
            Réessayer
          </button>
        </div>
      ) : (
        <>
          <div className={styles.pulseSectionTitle}>
            <h3>Ce qui mérite votre attention</h3>
            <span>Aujourd’hui</span>
          </div>
          <div className={styles.pulseSignals}>
            {signals.map((signal) => {
              const Icon =
                signal.kind === "email" ? Mail : signal.kind === "deal" ? Handshake : CalendarClock;
              const title =
                signal.kind === "email"
                  ? signal.detected
                    ? "Un client attend peut-être une réponse"
                    : "Faire le point sur vos échanges"
                  : signal.kind === "deal"
                    ? signal.detected
                      ? "Une opportunité mérite un point"
                      : "Faire le point sur vos opportunités"
                    : signal.detected
                      ? "Des engagements arrivent à échéance"
                      : "Faire le point sur vos engagements";
              const detail =
                signal.kind === "email"
                  ? signal.detected
                    ? "Réponse à vérifier dans les échanges importés"
                    : "Vérifier les réponses attendues et le suivi"
                  : signal.kind === "deal"
                    ? signal.detected
                      ? "Fiche inchangée depuis 14 jours · activité à vérifier"
                      : "Examiner le pipeline et les prochaines étapes"
                    : signal.detected
                      ? "Échéances sous 7 jours et retards · vérifier les preuves"
                      : "Vérifier les promesses et les tâches associées";
              return (
                <article key={signal.kind} className={styles.pulseSignal}>
                  <Icon size={16} />
                  <div>
                    <strong>{title}</strong>
                    <p>{detail}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!configured || query.isPending}
                    onClick={() => analyze(signal)}
                    aria-label={`Analyser : ${title}`}
                  >
                    Analyser
                  </button>
                </article>
              );
            })}
          </div>
          <p
            className={styles.pulseScope}
            title={`Les signaux email examinent au maximum les 3 derniers emails entrants liés à une fiche sur 14 jours (${pulse?.email_candidates_scanned ?? 0} examinés). Une réponse hors des données importées peut manquer. Le compteur À traiter est calculé sur les tâches, engagements et contradictions, pas sur ces trois suggestions.`}
          >
            Signaux à vérifier dans vos sources accessibles.
          </p>
        </>
      )}
      <button
        type="button"
        className={styles.pulseReview}
        disabled={!configured}
        onClick={() => onAnalyze(pulseOverviewPrompt, null)}
      >
        <Sparkles size={16} />
        Faire mon bilan IA
      </button>
    </section>
  );
}
