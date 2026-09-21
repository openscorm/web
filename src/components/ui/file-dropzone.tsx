import { useRef, useState } from "react";
import type { ReactNode } from "react";

// One affordance that both accepts a drop and opens the file
// picker on click, replacing the shape this app had everywhere: a bare
// <input type="file"> read from a ref only when a second button was pressed.
//
// Choosing a file IS the action here. This component owns no mutation and no
// validation; it hands the caller the File and the caller decides what that
// costs. That keeps the size and capacity rules in one place (the caller
// already has the capacity snapshot) instead of split across two files.
//
// Themed with semantic tokens rather than literal palette colours, because a
// hardcoded border-gray-300 disappears against --color-card in dark.
interface FileDropzoneProps {
  /** Native accept list, e.g. ".zip". A hint to the picker, never validation. */
  accept?: string;
  disabled?: boolean;
  /** The first file chosen or dropped. Called once per selection. */
  onFile: (file: File) => void;
  /** Sits under the prompt: what may be dropped, and how large it may be. */
  hint?: ReactNode;
  /** Accessible name for the control, since the input itself is visually hidden. */
  label: string;
}

export function FileDropzone({ accept, disabled = false, onFile, hint, label }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const open = () => {
    if (!disabled) inputRef.current?.click();
  };

  const take = (file: File | undefined) => {
    if (!disabled && file) onFile(file);
  };

  const border = dragging ? "border-primary bg-accent" : "border-border bg-card hover:bg-muted/60";

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        take(e.dataTransfer?.files?.[0]);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--color-input-focus-ring)] focus-visible:outline-none ${border} ${
        disabled ? "cursor-not-allowed opacity-60" : ""
      }`}
    >
      <span className="text-sm font-semibold">{label}</span>
      {hint && <span className="text-muted-foreground mt-1 text-xs">{hint}</span>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          take(e.target.files?.[0]);
          // Cleared so choosing the same file twice in a row fires again,
          // which matters after a failed upload the person wants to retry.
          e.target.value = "";
        }}
      />
    </div>
  );
}
