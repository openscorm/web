import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import type { ProblemResponse } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { useImpression } from "@/hooks/useImpression";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { formatDate } from "@/lib/dates";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TierResponse {
  name: string;
  courseLimit: number;
  userLimit: number;
  monthlyPriceUsd: number;
  annualPriceUsd: number;
}

type Interval = "monthly" | "annual";

interface TierListResponse {
  tiers: TierResponse[];
}

interface CheckoutSessionResponse {
  url?: string;
  sessionId?: string;
}

interface PortalSessionResponse {
  url?: string;
}

// A subscribed tenant changes plan in place on its one
// Stripe subscription: the preview says what the card is charged today and
// what the next invoice bills, the change does it. An upgrade is prorated
// and charged now; a downgrade applies at once with no credit and no charge
// until renewal. Free tenants have no subscription and still go through
// Checkout.
interface PlanChangePreview {
  direction: "upgrade" | "downgrade";
  fromTier: string;
  toTier: string;
  interval: "Monthly" | "Annual";
  amountDueTodayCents: number;
  currency: string;
  nextInvoiceAt: string;
  nextInvoiceAmountCents: number;
}

interface PlanChangeResult {
  direction: "upgrade" | "downgrade";
  fromTier: string;
  toTier: string;
  interval: "Monthly" | "Annual";
  amountChargedCents: number;
  currency: string;
  invoiceUrl?: string | null;
}

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function perInterval(interval: "Monthly" | "Annual"): string {
  return interval === "Annual" ? "a year" : "a month";
}

// The API answers a refusal as a problem detail and the verification gate
// as { code, message }; either way the server's sentence beats ours.
function describe(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.problem) {
    const p = err.problem as ProblemResponse & { message?: string };
    return p.detail ?? p.title ?? p.message ?? fallback;
  }
  return fallback;
}

const primaryBtn =
  "inline-flex items-center justify-center rounded-full py-2 px-4 font-semibold text-sm text-white bg-primary hover:bg-[color:var(--color-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

const secondaryBtn =
  "inline-flex items-center justify-center rounded-full py-2 px-4 font-semibold text-sm border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

export function PricingPage() {
  const { user } = useAuth();
  const tenantKey = user?.tenantKey;
  const currentTier = user?.tenantType ?? "";
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState<Interval>("monthly");
  // Stripe Checkout redirects back with ?checkout=success|canceled.
  const [search, setSearch] = useSearchParams();
  const checkoutOutcome = search.get("checkout");
  const qc = useQueryClient();
  // A paid catalog tenant has a subscription to move in place; Free has
  // nothing to move yet and Custom has no catalog price.
  const subscribed = currentTier !== "" && currentTier !== "Trial" && currentTier !== "Custom";
  const [pending, setPending] = useState<{ tier: string; preview: PlanChangePreview } | null>(null);
  const [done, setDone] = useState<PlanChangeResult | null>(null);

  // pricing_viewed (Group 4). entry_surface names the surface
  // that sent the manager here (e.g. library_banner, dashboard_card), so we can
  // see which drives pricing views; a direct visit reads "direct".
  useImpression("pricing_viewed", true, {
    entry_surface: search.get("from") ?? "direct",
  });

  const tiers = useQuery({
    queryKey: ["billing", "tiers"],
    queryFn: async () => api<TierListResponse>("/api/billing/tiers"),
    staleTime: Infinity,
  });

  const checkout = useMutation({
    mutationFn: async (targetTier: string) =>
      api<CheckoutSessionResponse>("/api/billing/checkout-session", {
        method: "POST",
        body: JSON.stringify({ tenantKey, targetTier, interval }),
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

  const portal = useMutation({
    mutationFn: async () =>
      api<PortalSessionResponse>("/api/billing/portal-session", {
        method: "POST",
        body: JSON.stringify({ tenantKey, returnUrl: window.location.origin + "/billing" }),
      }),
    onSuccess: (r) => {
      if (r.url) window.location.href = r.url;
    },
    onError: (err) => {
      if (err instanceof ApiError && err.problem) {
        const p = err.problem as ProblemResponse;
        setError(p.detail ?? p.title ?? "Portal failed.");
      } else setError("Portal failed.");
    },
  });

  const preview = useMutation({
    mutationFn: async (targetTier: string) =>
      api<PlanChangePreview>("/api/billing/plan-change/preview", {
        method: "POST",
        body: JSON.stringify({ tenantKey, targetTier, interval }),
      }),
    onSuccess: (p, targetTier) => setPending({ tier: targetTier, preview: p }),
    onError: (err) => setError(describe(err, "Could not price the change.")),
  });

  const change = useMutation({
    mutationFn: async (targetTier: string) =>
      api<PlanChangeResult>("/api/billing/plan-change", {
        method: "POST",
        body: JSON.stringify({ tenantKey, targetTier, interval }),
      }),
    onSuccess: (r) => {
      setPending(null);
      setDone(r);
      // The session payload carries tenantType, so the Current badge moves.
      void qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    onError: (err) => {
      setPending(null);
      setError(describe(err, "The plan change failed."));
    },
  });

  // A tier with no annual price (Provider, until its annual price is set) is
  // monthly-only, so the annual view leaves it out rather than show $0.
  const buyableTiers =
    tiers.data?.tiers.filter(
      (t) =>
        t.name !== "Trial" &&
        t.name !== "Custom" &&
        (interval === "monthly" || t.annualPriceUsd > 0),
    ) ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Pricing"
        subtitle={
          <>
            Current plan: <span className="text-foreground font-semibold">{currentTier}</span>.
          </>
        }
        restricted={[
          "Manager or operator access only. Learners are redirected to the library.",
          "The /billing route is wrapped in RequireManager.",
          <>
            <code className="font-mono">GET /api/billing/tiers</code> is a public tier catalog.
          </>,
          "Checkout and billing portal sessions are enforced server-side: manager or operator of the tenant only.",
        ]}
      />

      {checkoutOutcome === "success" && (
        <div
          role="status"
          className="mb-4 flex items-start justify-between gap-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200"
        >
          <span>Payment received. Your plan has been updated.</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setSearch({}, { replace: true })}
            className="font-semibold hover:opacity-70"
          >
            &times;
          </button>
        </div>
      )}

      {checkoutOutcome === "canceled" && (
        <div
          role="status"
          className="border-border bg-muted text-muted-foreground mb-4 flex items-start justify-between gap-4 rounded-lg border px-4 py-3 text-sm"
        >
          <span>Checkout canceled. Your plan has not changed.</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setSearch({}, { replace: true })}
            className="font-semibold hover:opacity-70"
          >
            &times;
          </button>
        </div>
      )}

      {done && (
        <div
          role="status"
          className="mb-4 flex items-start justify-between gap-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200"
        >
          <span>
            Your plan is now {done.toTier}.
            {done.direction === "upgrade" && done.amountChargedCents > 0 && (
              <> {formatUsd(done.amountChargedCents)} was charged today.</>
            )}
            {done.invoiceUrl && (
              <>
                {" "}
                <a href={done.invoiceUrl} target="_blank" rel="noreferrer" className="underline">
                  View invoice
                </a>
              </>
            )}
          </span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDone(null)}
            className="font-semibold hover:opacity-70"
          >
            &times;
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {currentTier !== "Trial" && currentTier !== "Custom" && (
        <div className="mb-6">
          <button
            type="button"
            onClick={() => portal.mutate()}
            disabled={portal.isPending}
            className="text-link text-sm hover:underline"
          >
            {portal.isPending ? "Opening…" : "Manage subscription in Stripe →"}
          </button>
        </div>
      )}

      <div
        className="mb-6 inline-flex rounded-lg border p-1"
        role="group"
        aria-label="Billing interval"
      >
        {(["monthly", "annual"] as const).map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => setInterval(i)}
            aria-pressed={interval === i}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              interval === i
                ? "bg-primary text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {i === "monthly" ? "Monthly" : "Annual (save 10%)"}
          </button>
        ))}
      </div>

      {tiers.isLoading ? (
        <div className="text-muted-foreground">Loading tiers…</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {buyableTiers.map((t) => {
            const isCurrent = t.name === currentTier;
            return (
              <div
                key={t.name}
                className={`flex flex-col rounded-xl border p-6 ${isCurrent ? "border-primary bg-primary/5" : "border-border bg-card"} text-card-foreground`}
              >
                <div className="mb-4 flex items-baseline justify-between">
                  <h2 className="text-xl font-bold">{t.name}</h2>
                  {isCurrent && (
                    <span className="bg-primary text-primary-foreground rounded px-2 py-1 text-xs">
                      Current
                    </span>
                  )}
                </div>
                <div className="mb-1 text-3xl font-bold">
                  ${interval === "annual" ? t.annualPriceUsd / 12 : t.monthlyPriceUsd}
                  <span className="text-muted-foreground text-sm font-normal">/mo</span>
                </div>
                {interval === "annual" && (
                  <div className="text-muted-foreground text-xs">
                    ${t.annualPriceUsd} billed annually
                  </div>
                )}
                <ul className="text-muted-foreground mt-4 mb-6 flex-1 space-y-1 text-sm">
                  <li>{t.courseLimit} courses</li>
                  <li>{t.userLimit} users</li>
                </ul>
                {!isCurrent && (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setDone(null);
                      if (subscribed) preview.mutate(t.name);
                      else checkout.mutate(t.name);
                    }}
                    disabled={checkout.isPending || preview.isPending}
                    className="bg-primary inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--color-primary-hover)] focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {checkout.isPending
                      ? "Redirecting…"
                      : preview.isPending && preview.variables === t.name
                        ? "Checking…"
                        : `Choose ${t.name}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pending && (
        <PlanChangeDialog
          tier={pending.tier}
          preview={pending.preview}
          busy={change.isPending}
          onCancel={() => setPending(null)}
          onConfirm={() => change.mutate(pending.tier)}
        />
      )}
    </AppShell>
  );
}

// The confirm step. The two sentences are the whole of the policy as a customer
// meets it: an upgrade names the charge and the date; a downgrade says the
// unused time is not refunded and names the date. Nothing is charged until
// the confirm button, and the button says which way the money goes.
function PlanChangeDialog(props: {
  tier: string;
  preview: PlanChangePreview;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { preview } = props;
  const upgrade = preview.direction === "upgrade";
  const verb = upgrade ? "Upgrade" : "Downgrade";
  const next = `From ${formatDate(preview.nextInvoiceAt)}, you'll pay ${formatUsd(preview.nextInvoiceAmountCents)} ${perInterval(preview.interval)}.`;
  return (
    <Dialog open onOpenChange={(open) => !open && !props.busy && props.onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {verb} to {props.tier}
          </DialogTitle>
          <DialogDescription>
            {upgrade
              ? `You'll be charged ${formatUsd(preview.amountDueTodayCents)} today for the rest of your current billing period. ${next}`
              : `Your plan changes right away. There's no refund for the unused part of your current plan. ${next}`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            onClick={props.onCancel}
            disabled={props.busy}
            className={secondaryBtn}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            disabled={props.busy}
            className={primaryBtn}
          >
            {props.busy ? "Working…" : `${verb} to ${props.tier}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
