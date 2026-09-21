import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// One in-app confirmation for a destructive action, so no surface has to reach
// for window.confirm. A native confirm blocks the whole renderer,
// cannot be styled, cannot be driven by a test or by browser automation, and
// looks nothing like the rest of the app.
//
// Carbon's footer rule, which the operator Danger zone already follows: the
// escape sits on the left and the outcome on the right, so the eye and the tab
// order both end on the button that acts.
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Verb, object and a question mark: "Delete course?". */
  title: string;
  description?: ReactNode;
  /** Names the outcome, never "OK": "Delete course". */
  confirmLabel: string;
  /**
   * "danger" for anything that destroys or revokes, which is most of them.
   * "default" for a confirm that only asks the caller to be sure, such as
   * publishing a revision that retires the version before it.
   */
  tone?: "danger" | "default";
  /** Shown in place of confirmLabel while the action runs. */
  busyLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = "danger",
  busyLabel,
  cancelLabel = "Cancel",
  busy = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="border-border hover:bg-muted rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={
              tone === "danger"
                ? "bg-danger rounded-lg px-3 py-1.5 text-sm text-white disabled:opacity-50"
                : "bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
            }
          >
            {busy && busyLabel ? busyLabel : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
