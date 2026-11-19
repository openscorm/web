import { useState } from "react";

// One Copy button for every place a link is handed over, so the label, the
// "Copied" confirmation and the failure text cannot drift between them.
// onCopied runs only after the clipboard accepted the text, which is what an
// analytics event should count.
const buttonClass =
  "border-border text-foreground inline-flex shrink-0 items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";

export function CopyButton({ url, onCopied }: { url: string; onCopied?: () => void }) {
  const [label, setLabel] = useState("Copy");
  return (
    <button
      type="button"
      className={buttonClass}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setLabel("Copied");
          setTimeout(() => setLabel("Copy"), 1500);
          onCopied?.();
        } catch {
          setLabel("Copy failed");
        }
      }}
    >
      {label}
    </button>
  );
}
