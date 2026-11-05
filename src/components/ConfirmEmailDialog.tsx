import { useState } from "react";

import { api } from "@/lib/api";
import { SUPPORT_EMAIL } from "@/lib/emailConfirmation";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const secondaryBtn =
  "inline-flex items-center justify-center rounded-full py-2 px-4 font-semibold text-sm border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

const primaryBtn =
  "inline-flex items-center justify-center rounded-full py-2 px-4 font-semibold text-sm text-white bg-primary hover:bg-[color:var(--color-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

interface ConfirmEmailDialogProps {
  open: boolean;
  onClose: () => void;
}

// Shown when checkout or a plan change is refused for an unconfirmed email:
// why paying is blocked, a way to resend the link, and a way to reach us.
export function ConfirmEmailDialog({ open, onClose }: ConfirmEmailDialogProps) {
  const { user } = useAuth();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function resend() {
    setState("sending");
    try {
      await api("/api/auth/email/resend", { method: "POST" });
      setState("sent");
    } catch {
      setState("error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm your email to upgrade</DialogTitle>
          <DialogDescription>
            We need a confirmed email before you can pay, so your billing notices reach you. Click
            the link we sent to{" "}
            {user?.email ? (
              <span className="text-foreground font-medium">{user.email}</span>
            ) : (
              "your email"
            )}
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {state === "sent" ? (
            <p role="status" className="text-foreground">
              Sent. Check your inbox, and your spam folder if it hasn&apos;t arrived in a few
              minutes.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={resend}
                disabled={state === "sending"}
                className={secondaryBtn}
              >
                {state === "sending" ? "Sending…" : "Resend email"}
              </button>
              {state === "error" && (
                <span role="alert" className="text-red-700 dark:text-red-400">
                  We couldn&apos;t send it. Try again in a few minutes.
                </span>
              )}
            </div>
          )}
          <p className="text-muted-foreground">
            Still stuck? Email{" "}
            <a className="text-link hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>{" "}
            and we&apos;ll get you sorted.
          </p>
        </div>

        <DialogFooter>
          <button type="button" onClick={onClose} className={primaryBtn}>
            Close
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
