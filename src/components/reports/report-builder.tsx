import Link from "next/link";
export function ReportBuilder() {
  return (
    <div className="detail-card">
      <h2>Vos dashboards personnalisés</h2>
      <p>Retrouvez vos graphiques, objectifs et indicateurs dans Dashboard.</p>
      <Link href="/app/dashboard" className="button">
        Ouvrir Dashboard
      </Link>
    </div>
  );
}
