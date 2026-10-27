"use client";
import { MapPin, Map, Pencil, Paperclip, List, Link2 } from "lucide-react";
import { useState } from "react";
import type { Attribute, CrmRecord } from "@/lib/domain/types";
import { companySite } from "@/lib/domain/company-site";
import { CompanyLogo } from "./company-logo";
import styles from "./company-contact-sidebar.module.css";

export function CompanyContactSidebar({
  record,
  attributes,
  visibleFields,
  readonly,
  onEdit,
  onDocuments,
  onProperties,
}: {
  record: CrmRecord;
  attributes: Attribute[];
  visibleFields: string[];
  readonly: boolean;
  onEdit: () => void;
  onDocuments?: () => void;
  onProperties?: () => void;
}) {
  const [showSocials, setShowSocials] = useState(false);
  const attrs = attributes.filter((a) => !a.archived && visibleFields.includes("attr_" + a.key));
  const text = (value: unknown) =>
    typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  const find = (keys: string[], type?: string) => {
    const attr = attrs.find((a) => keys.includes(a.key) || (type && a.type === type));
    return attr ? text(record.attributes[attr.key]) : "";
  };
  const phone = find(["phone", "telephone", "phone_number"], "phone");
  const email = visibleFields.includes("email") ? record.email?.trim() : "";
  const site = visibleFields.includes("domain") ? companySite(record.domain) : null;
  const address = find(["address", "adresse", "location"], "location");
  const employees = find(["employees", "employee_count", "effectif"]);
  const sector = find(["sector", "industry", "secteur"]);
  const tagAttr = attrs.find((a) => ["tags", "labels", "etiquettes"].includes(a.key));
  const rawTags = tagAttr ? record.attributes[tagAttr.key] : [];
  const tags = [
    ...new Set(
      [
        record.archived ? "Archivée" : record.stage,
        sector,
        ...(Array.isArray(rawTags) ? rawTags.map(text) : text(rawTags).split(",")),
      ].filter(Boolean),
    ),
  ].slice(0, 8);
  const socials = [
    { keys: ["linkedin", "linkedin_url"], label: "LinkedIn", host: "linkedin.com" },
    { keys: ["youtube", "youtube_url"], label: "YouTube", host: "youtube.com" },
    { keys: ["instagram", "instagram_url"], label: "Instagram", host: "instagram.com" },
    { keys: ["facebook", "facebook_url"], label: "Facebook", host: "facebook.com" },
  ].flatMap((s) => {
    const url = companySite(find(s.keys));
    return url && (url.host === s.host || url.host.endsWith("." + s.host)) ? [{ ...s, url }] : [];
  });
  const hasContact = !!(phone || email || site || address);
  return (
    <section className={styles.panel} aria-label="Coordonnées de l’entreprise">
      <div className={styles.identity}>
        <CompanyLogo
          name={record.display_name}
          domain={record.domain}
          size={48}
          interactive={false}
        />
        {!readonly && (
          <button
            type="button"
            onClick={onEdit}
            disabled={readonly}
            aria-label="Modifier les coordonnées de l’entreprise"
          >
            <Pencil size={14} />
          </button>
        )}
      </div>
      <h2>{record.display_name}</h2>
      {tags.length > 0 && (
        <div className={styles.tags} aria-label="Étiquettes de l’entreprise">
          {tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      )}
      {socials.length > 0 && (
        <div className={styles.socials}>
          {socials.slice(0, showSocials ? socials.length : 2).map((s) => (
            <a
              key={s.label}
              href={s.url.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={s.label}
              title={s.label}
              data-network={s.label}
            >
              <SocialIcon network={s.label} />
            </a>
          ))}
          {socials.length > 2 && (
            <button
              type="button"
              className={styles.moreSocials}
              onClick={() => setShowSocials(!showSocials)}
              aria-expanded={showSocials}
              aria-label={
                showSocials ? "Réduire les liens sociaux" : "Afficher les autres liens sociaux"
              }
            >
              <Link2 size={14} />
              <span>{socials.length - 2}</span>
            </button>
          )}
        </div>
      )}
      <div className={styles.coordinates}>
        {phone && (
          <div className={styles.coordinate}>
            <div>
              {/^[+\d\s().-]{3,40}$/.test(phone) ? (
                <a href={"tel:" + phone.replace(/[^+\d]/g, "")}>{phone}</a>
              ) : (
                <span>{phone}</span>
              )}
              <small>Travail</small>
            </div>
          </div>
        )}
        {email && (
          <div className={styles.coordinate}>
            <div>
              {/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(email) ? (
                <a href={"mailto:" + encodeURIComponent(email)}>{email}</a>
              ) : (
                <span>{email}</span>
              )}
              <small>Travail</small>
            </div>
          </div>
        )}
        {site && (
          <div className={styles.coordinate}>
            <div>
              <a href={site.href} target="_blank" rel="noopener noreferrer">
                {site.host}
              </a>
              <small>Travail</small>
            </div>
          </div>
        )}
        {address && (
          <div className={styles.coordinate}>
            <div>
              <span className={styles.address}>{address}</span>
              <small>Travail</small>
              <div className={styles.addressActions}>
                <a
                  href={
                    "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address)
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Voir l’adresse sur une carte"
                >
                  <MapPin size={14} />
                </a>
                <a
                  href={
                    "https://www.google.com/maps/dir/?api=1&destination=" +
                    encodeURIComponent(address)
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Itinéraire vers l’entreprise"
                >
                  <Map size={14} />
                </a>
                {onDocuments && (
                  <button
                    type="button"
                    onClick={onDocuments}
                    aria-label="Ouvrir les documents de l’entreprise"
                  >
                    <Paperclip size={14} />
                  </button>
                )}
                {onProperties && (
                  <button
                    type="button"
                    onClick={onProperties}
                    aria-label="Afficher toutes les propriétés"
                  >
                    <List size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {!hasContact && (
          <p className={styles.empty}>Les coordonnées de cette entreprise apparaîtront ici.</p>
        )}
      </div>
      {employees && (
        <div className={styles.employee}>
          <span>Effectif</span>
          <strong>{employees}</strong>
        </div>
      )}
      {!readonly && !hasContact && (
        <button type="button" className={styles.edit} onClick={onEdit}>
          Ajouter des coordonnées
          <Pencil size={12} />
        </button>
      )}
    </section>
  );
}

function SocialIcon({ network }: { network: string }) {
  if (network === "LinkedIn")
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M5.4 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM3.7 9h3.4v12H3.7V9Zm5.7 0h3.3v1.6h.1c.5-.9 1.6-1.9 3.4-1.9 3.6 0 4.3 2.4 4.3 5.5V21H17v-6c0-1.4 0-3.2-2-3.2s-2.3 1.5-2.3 3.1V21H9.4V9Z" />
      </svg>
    );
  if (network === "YouTube")
    return (
      <svg width="15" height="12" viewBox="0 0 24 18" aria-hidden="true">
        <rect x="1" y="1" width="22" height="16" rx="5" fill="currentColor" />
        <path d="m10 5 7 4-7 4V5Z" fill="#e21a22" />
      </svg>
    );
  return <span aria-hidden="true">{network === "Instagram" ? "◎" : "f"}</span>;
}
