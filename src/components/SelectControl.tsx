import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/cn";

// A styled <select> for search toolbars, ported from a sibling app. It matches the
// Input control (same height, border, radius, focus ring) and replaces the
// native caret with a drawn chevron: Chrome pins the native indicator to the
// edge and ignores padding-right, and each browser insets it differently, so
// appearance-none + our own chevron makes the control look identical
// everywhere and the same as the search box beside it. Width is set on the
// wrapper via className. `label` is the aria-label; put the visible text in the
// options (e.g. "Sort: name") so the control reads its own purpose.
export function SelectControl({
  value,
  onChange,
  label,
  className,
  disabled,
  children,
}: {
  value: string | number;
  onChange: (value: string) => void;
  label: string;
  className?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        disabled={disabled}
        className="border-border bg-card focus-visible:ring-primary h-9 w-full appearance-none rounded-lg border pr-9 pl-3 text-sm shadow-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        {children}
      </select>
      <ChevronDown
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2"
        aria-hidden="true"
      />
    </div>
  );
}
