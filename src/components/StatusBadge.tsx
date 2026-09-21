// SCORM 1.2 lesson_status values. Color carries meaning here (pass/fail is the
// point of the column), so the text is always present rather than relying on
// the swatch alone.
const styles: Record<string, string> = {
  passed: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  incomplete: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  browsed: "bg-muted text-muted-foreground",
  "not attempted": "bg-muted text-muted-foreground",
};

// A launch writes 'launched' before the SCO reports anything, so surface it as
// "Not started" rather than the raw internal word.
const labels: Record<string, string> = {
  launched: "Not started",
};

export function StatusBadge({ status }: { status: string }) {
  const key = (status ?? "").toLowerCase();
  const className = styles[key] ?? "bg-muted text-muted-foreground";
  const label = labels[key] ?? status ?? "unknown";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs whitespace-nowrap ${className}`}>
      {label || "unknown"}
    </span>
  );
}
