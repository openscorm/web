// ISO 8601 rendering in the viewer's local timezone (decided 2026-07-14).
// "11/5/2025" is ambiguous across locales, and the toLocale* functions render
// differently per browser, so the same row could read differently for two
// operators. Explicit padding rather than the en-CA locale trick: that output
// is a browser quirk, not a contract.

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** "2025-11-05" in local time, or "Never" for null. */
export function formatDate(value: string | null): string {
  if (!value) return "Never";
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "2025-11-05 14:32" in local 24-hour time, or "Never" for null. */
export function formatDateTime(value: string | null): string {
  if (!value) return "Never";
  const d = new Date(value);
  return `${formatDate(value)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "14:32:07" in local 24-hour time. */
export function formatTime(value: string): string {
  const d = new Date(value);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
