"use client";
export function Pagination({
  page,
  size,
  total,
  busy,
  onChange,
}: {
  page: number;
  size: number;
  total: number;
  busy?: boolean;
  onChange: (page: number) => void;
}) {
  return (
    <nav className="toolbar" aria-label="Pagination">
      <span className="caption">
        {total ? Math.min(page * size + 1, total) : 0}–
        {Math.min((page + 1) * size, total)} sur {total}
      </span>
      <button
        type="button"
        className="button small"
        disabled={busy || page === 0}
        onClick={() => onChange(page - 1)}
      >
        Précédent
      </button>
      <button
        type="button"
        className="button small"
        disabled={busy || (page + 1) * size >= total}
        onClick={() => onChange(page + 1)}
      >
        Suivant
      </button>
    </nav>
  );
}
