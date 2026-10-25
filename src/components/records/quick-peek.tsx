"use client";
import { Modal, Badge, money } from "../ui";
import type { CrmRecord } from "@/lib/domain/types";
import styles from "./quick-peek.module.css";
export function RecordQuickPeek({
  record,
  onClose,
  onDetails,
  onEdit,
}: {
  record: Pick<CrmRecord, "id" | "display_name" | "amount" | "currency" | "stage" | "close_date">;
  onClose: () => void;
  onDetails?: () => void;
  onEdit?: () => void;
}) {
  const date = record.close_date ? new Date(record.close_date + "T12:00:00") : null;
  return (
    <Modal
      open
      onClose={onClose}
      title={record.display_name}
      description="Aperçu de l’opportunité"
      className={styles.popup}
    >
      <div className={styles.body}>
        <p className={styles.amount}>{money(record.amount, record.currency)}</p>
        <dl>
          <div>
            <dt>Étape</dt>
            <dd>
              <Badge value={record.stage} />
            </dd>
          </div>
          <div>
            <dt>Date de clôture</dt>
            <dd>
              {date && !Number.isNaN(date.getTime())
                ? date.toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "Non renseignée"}
            </dd>
          </div>
          <div>
            <dt>Devise</dt>
            <dd>{record.currency}</dd>
          </div>
        </dl>
        {(onDetails || onEdit) && (
          <footer>
            {onDetails && (
              <button type="button" className="button" onClick={onDetails}>
                Ouvrir la fiche complète
              </button>
            )}
            {onEdit && (
              <button type="button" className="button primary" onClick={onEdit}>
                Modifier
              </button>
            )}
          </footer>
        )}
      </div>
    </Modal>
  );
}
