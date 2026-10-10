import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// One in-app confirmation for a consequential action, so no surface has to reach for
// window.confirm. A native confirm blocks the whole renderer, cannot be styled, cannot be driven by
// a test or by browser automation, and looks nothing like the rest of the app.
//
// The default tone is danger on purpose: the person should pause here. And nothing takes autofocus,
// so Enter alone never confirms - Radix focuses the first focusable element, which is Cancel.
//
// Carbon's footer rule: the escape sits on the left and the outcome on the right, so the eye and
// the tab order both end on the button that acts.
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Verb, object and a question mark: "Delete course?". */
  title: string;
  description?: ReactNode;
  /** Names the outcome, never "OK": "Delete course". */
  confirmLabel: string;
  /**
   * "danger" for anything that destroys or revokes, which is most of them. "default" for a confirm
   * that only asks the caller to be sure, such as publishing a revision that retires the one before.
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && busyLabel ? busyLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
