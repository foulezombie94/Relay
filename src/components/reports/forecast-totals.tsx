import { money } from "../ui/display";
export function ForecastTotals({
  forecast,
  currency,
}: {
  forecast: { open: number; weighted: number; won: number; lost: number };
  currency: string;
}) {
  return (
    <div className="stats">
      <article>
        <span>Pipeline total ouvert</span>
        <strong>{money(forecast.open, currency)}</strong>
      </article>
      <article>
        <span>Forecast pondéré ouvert</span>
        <strong>{money(forecast.weighted, currency)}</strong>
      </article>
      <article>
        <span>Gagné · toutes périodes</span>
        <strong>{money(forecast.won, currency)}</strong>
      </article>
      <article>
        <span>Perdu · toutes périodes</span>
        <strong>{money(forecast.lost, currency)}</strong>
      </article>
    </div>
  );
}
