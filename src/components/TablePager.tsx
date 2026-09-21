interface TablePagerProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

const buttonClasses =
  "border-border hover:bg-muted rounded-md border px-3 py-1.5 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent";

export function TablePager({ page, pageSize, total, onPageChange }: TablePagerProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    // The pager sits outside the grid's scroll container, so at high zoom it
    // has nothing to scroll into. Wrapping is what keeps the buttons reachable
    // rather than clipped by the card.
    <div className="border-border text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs">
      <span>{total === 0 ? "No rows" : `${start}-${end} of ${total}`}</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={buttonClasses}
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          className={buttonClasses}
        >
          Next
        </button>
      </div>
    </div>
  );
}
