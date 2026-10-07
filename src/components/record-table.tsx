"use client";
import { Avatar, Badge, money, str } from "./ui/display";
import type { Attribute, CrmRecord } from "@/lib/domain/types";
import styles from "./pages/records.module.css";
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
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((key) => (
              <th key={key}>
                {key.startsWith("attr_")
                  ? custom.find((a) => a.key === key.slice(5))?.name ||
                    key.slice(5)
                  : (
                      {
                        display_name: "Nom",
                        email: "Email",
                        domain: "Site",
                        amount: "Montant",
                        stage: "Étape",
                        close_date: "Clôture",
                      } as Record<string, string>
                    )[key]}
              </th>
            ))}
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
                <td key={key}>
                  {key === "display_name" ? (
                    <span
                      className={
                        "name-cell " +
                        (slug === "people" ? styles.personName : "")
                      }
                    >
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
