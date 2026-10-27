"use client";
import { Globe, Mail, MapPin, Pencil, Phone, Users, ExternalLink } from "lucide-react";
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
}: {
  record: CrmRecord;
  attributes: Attribute[];
  visibleFields: string[];
  readonly: boolean;
  onEdit: () => void;
}) {
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
    { keys: ["linkedin", "linkedin_url"], label: "LinkedIn", mark: "in", host: "linkedin.com" },
    { keys: ["youtube", "youtube_url"], label: "YouTube", mark: "▶", host: "youtube.com" },
    { keys: ["instagram", "instagram_url"], label: "Instagram", mark: "◎", host: "instagram.com" },
    { keys: ["facebook", "facebook_url"], label: "Facebook", mark: "f", host: "facebook.com" },
  ].flatMap((s) => {
    const url = companySite(find(s.keys));
    return url && (url.host === s.host || url.host.endsWith("." + s.host)) ? [{ ...s, url }] : [];
  });
  const hasContact = !!(phone || email || site || address);
  return (
    <section className={styles.panel} aria-label="Coordonnées de l’entreprise">
      <div className={styles.identity}>
        <CompanyLogo name={record.display_name} domain={record.domain} size={44} />
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
          {socials.map((s) => (
            <a
              key={s.label}
              href={s.url.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={s.label}
              title={s.label}
              data-network={s.label}
            >
              {s.mark}
            </a>
          ))}
        </div>
      )}
      <div className={styles.coordinates}>
        {phone && (
          <div className={styles.coordinate}>
            <Phone size={14} />
            <div>
              {/^[+\d\s().-]{3,40}$/.test(phone) ? (
                <a href={"tel:" + phone.replace(/[^+\d]/g, "")}>{phone}</a>
              ) : (
                <span>{phone}</span>
              )}
              <small>Téléphone professionnel</small>
            </div>
          </div>
        )}
        {email && (
          <div className={styles.coordinate}>
            <Mail size={14} />
            <div>
              {/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(email) ? (
                <a href={"mailto:" + encodeURIComponent(email)}>{email}</a>
              ) : (
                <span>{email}</span>
              )}
              <small>Email professionnel</small>
            </div>
          </div>
        )}
        {site && (
          <div className={styles.coordinate}>
            <Globe size={14} />
            <div>
              <a href={site.href} target="_blank" rel="noopener noreferrer">
                {site.host}
                <ExternalLink size={10} />
              </a>
              <small>Site internet</small>
            </div>
          </div>
        )}
        {address && (
          <div className={styles.coordinate}>
            <MapPin size={14} />
            <div>
              <span className={styles.address}>{address}</span>
              <small>Adresse professionnelle</small>
            </div>
          </div>
        )}
        {!hasContact && (
          <p className={styles.empty}>Les coordonnées de cette entreprise apparaîtront ici.</p>
        )}
      </div>
      {employees && (
        <div className={styles.employee}>
          <Users size={14} />
          <span>Effectif</span>
          <strong>{employees}</strong>
        </div>
      )}
      {!readonly && (
        <button type="button" className={styles.edit} onClick={onEdit}>
          {hasContact ? "Compléter les coordonnées" : "Ajouter des coordonnées"}
          <Pencil size={12} />
        </button>
      )}
    </section>
  );
}
