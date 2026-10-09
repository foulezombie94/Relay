"use client";
import { Globe, Mail } from "lucide-react";
import { Avatar, str } from "../ui/display";
import type { CrmRecord, Row } from "@/lib/domain/types";
import styles from "./records.module.css";

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
        <button
          type="button"
          key={record.id}
          className={`${styles.recordCard} ${slug === "people" ? styles.personCard : ""}`}
          onClick={() => onOpen(record)}
        >
          <div className={styles.cardTop}>
            <Avatar name={record.display_name} />
            <span>
              {slug === "companies" ? "ENTREPRISE" : slug === "people" ? "CONTACT" : "FICHE"}
            </span>
          </div>
          <strong>{record.display_name}</strong>
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
            <span>Ouvrir la fiche →</span>
          </div>
        </button>
      ))}
    </div>
  );
}
