"use client";
import { Avatar, Badge, money, str } from "../ui/display";
import type { Attribute, CrmRecord } from "@/lib/domain/types";
import styles from "./records.module.css";
import {
  AtSign,
  CalendarDays,
  CircleDollarSign,
  Globe,
  Columns3,
  Text,
  ContactRound,
} from "lucide-react";
const columnIcons = {
  display_name: ContactRound,
  email: AtSign,
  domain: Globe,
  amount: CircleDollarSign,
  stage: Columns3,
  close_date: CalendarDays,
};
export function RecordTable({
  rows,
  columns,
  custom = [],
  slug,
  onOpen,
}: {
  rows: CrmRecord[];
  columns: string[];
  custom?: Attribute[];
  slug: string;
  onOpen: (record: CrmRecord) => void;
}) {
  return (
    <div className="table-wrap record-table">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((key) => {
              const Icon = columnIcons[key as keyof typeof columnIcons] ?? Text;
              return (
                <th key={key} scope="col">
                  <span className="table-heading">
                    <Icon size={14} aria-hidden="true" />
                    {key.startsWith("attr_")
                      ? custom.find((a) => a.key === key.slice(5))?.name || key.slice(5)
                      : ((
                          {
                            display_name: "Nom",
                            email: "Email",
                            domain: "Site",
                            amount: "Montant",
                            stage: "Étape",
                            close_date: "Clôture",
                          } as Record<string, string>
                        )[key] ?? key)}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              tabIndex={0}
              aria-label={"Ouvrir " + r.display_name}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen(r);
                }
              }}
              onClick={() => onOpen(r)}
            >
              {columns.map((key) => (
                <td
                  key={key}
                  className={key === "email" || key === "domain" ? "cell-link" : undefined}
                >
                  {key === "display_name" ? (
                    <span className={"name-cell " + (slug === "people" ? styles.personName : "")}>
                      <Avatar name={r.display_name} />
                      <strong>{r.display_name}</strong>
                    </span>
                  ) : key === "stage" ? (
                    <Badge value={r.stage} />
                  ) : key === "amount" ? (
                    money(r.amount, r.currency)
                  ) : key.startsWith("attr_") ? (
                    str(r.attributes?.[key.slice(5)]) || "—"
                  ) : (
                    str(r[key]) || "—"
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
