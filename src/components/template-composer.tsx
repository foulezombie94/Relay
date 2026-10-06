"use client";
import { useState } from "react";
import { useRows, useWorkspace, request } from "./data-provider";
import { Modal, ErrorMessage, str } from "./ui";
import { renderEmailTemplate } from "@/lib/domain/email-templates";
import type { CrmRecord, Row } from "@/lib/domain/types";
export function TemplateComposer({
  accounts,
  initialTemplate = "",
  onClose,
  onSent,
}: {
  accounts: Row[];
  initialTemplate?: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { workspace } = useWorkspace();
  const templates = useRows("email_templates", { size: 100 });
  const [search, setSearch] = useState("");
  const records = useRows<CrmRecord>("records", {
    q: search || undefined,
    size: 25,
  });
  const [template, setTemplate] = useState(initialTemplate);
  const [recordId, setRecordId] = useState("");
  const [provider, setProvider] = useState(str(accounts[0]?.provider));
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function applyTemplate() {
    setError("");
    const selected = templates.data?.data.find((t) => t.id === template);
    if (!selected) return;
    const contact = records.data?.data.find((r) => r.id === recordId);
    const values = {
      name: contact?.display_name,
      email: to || contact?.email,
      domain: contact?.domain,
      workspace: workspace.name,
    };
    const renderedSubject = renderEmailTemplate(str(selected.subject), values);
    const renderedBody = renderEmailTemplate(str(selected.body), values);
    const missing = [
      ...new Set([...renderedSubject.missing, ...renderedBody.missing]),
    ];
    if (missing.length) {
      setError(
        "Données manquantes pour le modèle : " +
          missing.join(", ") +
          ". Choisissez une fiche complète ou modifiez le modèle.",
      );
      return;
    }
    if (
      (subject || body) &&
      !window.confirm("Remplacer le contenu actuel par ce modèle ?")
    )
      return;
    setSubject(renderedSubject.text);
    setBody(renderedBody.text);
  }
  return (
    <Modal open onClose={onClose} title="Rédiger un email">
      <div className="stack">
        <label>
          Rechercher une fiche pour personnaliser le modèle
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom, email…"
          />
        </label>
        <label>
          Fiche · 25 résultats maximum
          <select
            value={recordId}
            onChange={(e) => {
              setRecordId(e.target.value);
              const contact = records.data?.data.find(
                (r) => r.id === e.target.value,
              );
              if (contact?.email) setTo(contact.email);
            }}
          >
            <option value="">Sans fiche</option>
            {records.data?.data.map((r) => (
              <option value={r.id} key={r.id}>
                {r.display_name}
                {r.email ? " · " + r.email : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="row-actions">
          <select
            style={{ width: "auto", flex: 1 }}
            aria-label="Modèle email"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          >
            <option value="">Choisir un modèle</option>
            {templates.data?.data.map((t) => (
              <option key={t.id} value={t.id}>
                {str(t.name)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="button"
            disabled={!template || busy}
            onClick={applyTemplate}
          >
            Appliquer le modèle
          </button>
        </div>
        <ErrorMessage
          error={
            templates.error ||
            records.error ||
            (error ? new Error(error) : null)
          }
        />
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            if (
              !window.confirm(
                "Envoyer réellement cet email au destinataire indiqué ?",
              )
            )
              return;
            setBusy(true);
            try {
              await request("/api/" + workspace.id + "/send", "POST", {
                provider,
                to,
                subject,
                body,
              });
              onSent();
              onClose();
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Envoi impossible.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Compte expéditeur
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              disabled={busy}
              required
            >
              {accounts.map((a) => (
                <option key={a.id} value={str(a.provider)}>
                  {a.provider === "gmail" ? "Gmail" : "Outlook"} ·{" "}
                  {str(a.email)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Destinataire
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              required
              maxLength={320}
              disabled={busy}
            />
          </label>
          <label>
            Objet
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              maxLength={300}
              disabled={busy}
            />
          </label>
          <label>
            Message
            <textarea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              maxLength={20000}
              disabled={busy}
            />
          </label>
          <div className="dialog-footer">
            <button
              type="button"
              className="button"
              onClick={onClose}
              disabled={busy}
            >
              Annuler
            </button>
            <button
              className="button primary"
              disabled={busy || !accounts.length}
            >
              {busy ? "Envoi…" : "Envoyer"}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
