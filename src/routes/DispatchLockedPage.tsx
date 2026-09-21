import { useState } from "react";
import { Lock } from "lucide-react";
import { useMutation } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import type { ProblemResponse } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";

// Free-tier dispatch gate, the "show" surface. RequireDispatch renders this
// instead of the console for a Free (Trial) manager; a paid tenant never lands
// here. It is an honest feature explainer, not a teaser of the working
// console: no configurator, no fillable fields, no package control -- the
// only interactive element is the upgrade CTA.
//
// Copy note: the strings below convey the required content (what the surface
// must say); final in-app wording is reviewed separately and swaps in without
// touching this structure.
interface CheckoutSessionResponse {
  url?: string;
  sessionId?: string;
}

export function DispatchLockedPage() {
  const { user } = useAuth();
  const tenantKey = user?.tenantKey;
  const [error, setError] = useState<string | null>(null);

  const checkout = useMutation({
    // R2/R3: a one-click authenticated upgrade straight to Stripe
    // Checkout, never a generic /billing link. Mini is pre-selected: a Free
    // tenant cannot exceed Free's 10 users under the symmetric hard-stop, so
    // Mini (100 users) always clears current usage in the normal case. The one
    // exception is a former higher tier grandfathered down to Free with
    // over-Mini usage; that tenant is vanishingly rare pre-launch and
    // is not handled here -- revisit against the "lowest clearing tier" rule
    // if it ever matters.
    mutationFn: async () =>
      api<CheckoutSessionResponse>("/api/billing/checkout-session", {
        method: "POST",
        body: JSON.stringify({ tenantKey, targetTier: "Mini", interval: "monthly" }),
      }),
    onSuccess: (r) => {
      if (r.url) window.location.href = r.url;
    },
    onError: (err) => {
      if (err instanceof ApiError && err.problem) {
        const p = err.problem as ProblemResponse;
        setError(p.detail ?? p.title ?? "Checkout failed.");
      } else setError("Checkout failed.");
    },
  });

  return (
    <AppShell>
      <PageHeader title="SCORM Dispatch" subtitle="Deliver your own courses into a client's LMS" />

      <div className="border-border bg-card mx-auto max-w-xl rounded-xl border p-8">
        <span className="inline-flex items-center gap-1.5 rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-950/50 dark:text-green-300">
          <Lock className="h-3.5 w-3.5" />
          Available on any paid plan
        </span>

        <p className="text-foreground mt-5 text-sm">
          Dispatch packages your hosted courses as a universal SCORM 1.2 file you send to a client,
          so it runs inside their own LMS.
        </p>
        <ul className="text-muted-foreground mt-4 space-y-1.5 text-sm">
          <li>Retakes are never re-billed as new learners</li>
          <li>Dispatch registrations count toward your plan's user total</li>
          <li>Per-client reporting and CSV export</li>
        </ul>

        <p className="text-foreground mt-6 text-sm font-medium">
          Available on any paid plan, from $30/mo (Mini and up).
        </p>

        <button
          type="button"
          onClick={() => {
            setError(null);
            checkout.mutate();
          }}
          disabled={checkout.isPending}
          className="bg-primary mt-4 inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--color-primary-hover)] focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {checkout.isPending ? "Redirecting…" : "Upgrade to unlock dispatch"}
        </button>

        {/* R4: honest, low-pressure framing. Nothing is being
            taken away -- dispatch was never on Free -- so no countdown, no
            scarcity. */}
        <p className="text-muted-foreground mt-4 text-xs">
          A standard monthly plan, cancel anytime. Everything you've built on Free carries forward.
        </p>

        {error && (
          <p className="mt-4 text-sm text-red-700 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    </AppShell>
  );
}
