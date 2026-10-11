"use client";
import type { z } from "zod";
import type { recordFilters } from "@/lib/domain/record-filters";
type Filters = z.infer<typeof recordFilters>;
export function RecordSegments({
  value,
  onChange,
}: {
  value: Filters;
  onChange: (v: Filters) => void;
}) {
  return (
    <details className="detail-card segment-filter">
      <summary>Segment dynamique avancé ({value.length} conditions)</summary>
      <p>Les conditions se cumulent et sont enregistrées avec la vue.</p>
      {value.map((f, i) => (
        <div className="row-actions" key={i}>
          <select
            aria-label="Champ du filtre"
            value={f.field}
            onChange={(e) =>
              onChange(
                value.map((x, j) => (i === j ? { field: e.target.value, operator: "exists" } : x)),
              )
            }
          >
            {[
              "display_name",
              "email",
              "domain",
              "stage",
              "amount",
              "probability",
              "close_date",
            ].map((field) => (
              <option key={field} value={field}>
                {
                  {
                    display_name: "Nom",
                    email: "Email",
                    domain: "Domaine",
                    stage: "Étape",
                    amount: "Montant",
                    probability: "Probabilité",
                    close_date: "Clôture",
                  }[field]
                }
              </option>
            ))}
          </select>
          <select
            aria-label="Opérateur"
            value={f.operator}
            onChange={(e) =>
              onChange(
                value.map((x, j) =>
                  i === j ? { ...x, operator: e.target.value as Filters[number]["operator"] } : x,
                ),
              )
            }
          >
            {[
              "equals",
              "not_equals",
              "contains",
              "gt",
              "lt",
              "before",
              "after",
              "exists",
              "not_exists",
            ]
              .filter(
                (op) =>
                  !(["gt", "lt"].includes(op) && !["amount", "probability"].includes(f.field)) &&
                  !(["before", "after"].includes(op) && f.field !== "close_date") &&
                  !(op === "contains" && ["amount", "probability", "close_date"].includes(f.field)),
              )
              .map((op) => (
                <option key={op} value={op}>
                  {
                    {
                      equals: "Égale",
                      not_equals: "Différent de",
                      contains: "Contient",
                      gt: "Supérieur à",
                      lt: "Inférieur à",
                      before: "Avant",
                      after: "Après",
                      exists: "Renseigné",
                      not_exists: "Absent",
                    }[op]
                  }
                </option>
              ))}
          </select>
          {!["exists", "not_exists"].includes(f.operator) && (
            <input
              type={
                ["amount", "probability"].includes(f.field)
                  ? "number"
                  : f.field === "close_date"
                    ? "date"
                    : "text"
              }
              aria-label="Valeur du filtre"
              maxLength={300}
              value={f.value ?? ""}
              onChange={(e) =>
                onChange(value.map((x, j) => (i === j ? { ...x, value: e.target.value } : x)))
              }
            />
          )}
          <button
            className="button small"
            onClick={() => onChange(value.filter((_, j) => i !== j))}
          >
            Retirer
          </button>
        </div>
      ))}
      <button
        className="button small"
        disabled={value.length >= 20}
        onClick={() =>
          onChange([...value, { field: "stage", operator: "equals", value: "Nouveau" }])
        }
      >
        Ajouter une condition
      </button>
    </details>
  );
}
