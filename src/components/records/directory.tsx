"use client";
import { Globe, Mail } from "lucide-react";
import { Avatar, str } from "../ui/display";
import type { CrmRecord, Row } from "@/lib/domain/types";
import styles from "./records.module.css";
import { CompanyLogo } from "./company-logo";

export function RecordDirectory({
  rows,
  members,
  slug,
  onOpen,
}: {
  rows: CrmRecord[];
  members: Row[];
  slug: string;
  onOpen: (record: CrmRecord) => void;
}) {
  const owners = new Map(members.map((member) => [str(member.user_id), str(member.display_name)]));
  return (
    <div className={styles.directory}>
      {rows.map((record) => (
        <article
          key={record.id}
          className={`${styles.recordCard} ${slug === "people" ? styles.personCard : ""}`}
        >
          <div className={styles.cardTop}>
            {slug === "companies" ? (
              <CompanyLogo name={record.display_name} domain={record.domain} size={36} />
            ) : (
              <Avatar name={record.display_name} />
            )}
            <span>
              {slug === "companies" ? "ENTREPRISE" : slug === "people" ? "CONTACT" : "FICHE"}
            </span>
          </div>
          <button type="button" className={styles.cardOpen} onClick={() => onOpen(record)}>
            <strong>{record.display_name}</strong>
          </button>
          <div className={styles.cardDetails}>
            {record.domain && (
              <span>
                <Globe size={13} />
                {record.domain}
              </span>
            )}
            {record.email && (
              <span>
                <Mail size={13} />
                {record.email}
              </span>
            )}
            {!record.domain && !record.email && <span>Coordonnées à compléter</span>}
          </div>
          <div className={styles.cardFooter}>
            <span>
              {owners.get(record.owner_id || "") ||
                (record.owner_id ? "Responsable assigné" : "Sans responsable")}
            </span>
            <button type="button" className={styles.cardOpen} onClick={() => onOpen(record)}>
              Ouvrir la fiche →
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
