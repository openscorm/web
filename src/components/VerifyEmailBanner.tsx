import { useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

// The gated-not-walled verify prompt. Shows only when the
// account is explicitly unverified (undefined reads as verified, so a session
// cached before the field shipped does not nag). Product access is unaffected;
// this only nudges verification, which gates lifecycle sends and paid
// conversion.
export function VerifyEmailBanner() {
  const { user } = useAuth();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  if (!user || user.emailVerified !== false) return null;

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
    <div
      role="status"
      className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <span>
          Verify your email to keep receiving account notices.{" "}
          {user.email && <span className="font-mono">{user.email}</span>}
        </span>
        {state === "sent" ? (
          <span className="shrink-0 font-medium">Verification email sent. Check your inbox.</span>
        ) : (
          <button
            type="button"
            onClick={resend}
            disabled={state === "sending"}
            className="shrink-0 rounded-full border border-amber-400 px-3 py-1 font-medium hover:bg-amber-100 disabled:opacity-60 dark:hover:bg-amber-900/40"
          >
            {state === "sending" ? "Sending…" : state === "error" ? "Try again" : "Resend email"}
          </button>
        )}
      </div>
    </div>
  );
}
