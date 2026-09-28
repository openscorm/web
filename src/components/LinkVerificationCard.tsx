import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { MeResponse, TenantSecurityPolicy } from "@/lib/types";

// Whether the organization's public invitation links must confirm the
// learner's email before signing them in. It lives on the same security
// policy as the two-factor card, so both read and save through one query and
// one PUT, and a change on either card shows on the other at once.
const primaryBtn =
  "bg-primary inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--color-primary-hover)] focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";
const secondaryBtn =
  "border-border text-foreground inline-flex items-center justify-center rounded-full border px-6 py-3 text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";

export function LinkVerificationCard({ user }: { user: MeResponse }) {
  const qc = useQueryClient();
  const queryKey = ["tenants", user.tenantKey, "security"];
  const path = `/api/tenants/${user.tenantKey}/security`;

  const policy = useQuery({
    queryKey,
    queryFn: async () => api<TenantSecurityPolicy>(path),
  });

  const save = useMutation({
    mutationFn: async (next: TenantSecurityPolicy) =>
      api<TenantSecurityPolicy>(path, { method: "PUT", body: JSON.stringify(next) }),
    onSuccess: (r) => qc.setQueryData(queryKey, r),
  });

  const current = policy.data;
  const on = current?.linkRequiresVerifiedEmail ?? false;
  const linksOff = current?.mfaRequired === true && current.mfaScope === "all";
  const busy = policy.isLoading || save.isPending || !current;

  const status = policy.isLoading
    ? "Loading…"
    : linksOff
      ? "Invitation links are off while two-factor is required for all users"
      : on
        ? "Learners confirm their email before a link signs them in"
        : "A link signs learners in as soon as they enter their name and email";

  return (
    <div className="border-border bg-card mx-auto mt-6 max-w-xl rounded-xl border p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Invitation links</h2>
          <p className="text-muted-foreground mt-1 text-sm">{status}</p>
        </div>
        <span
          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
            on
              ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {on ? "Email confirmed" : "Name and email"}
        </span>
      </div>

      {(policy.isError || save.isError) && (
        <p className="mt-4 text-sm text-red-700 dark:text-red-400" role="alert">
          {policy.isError
            ? "Could not load this setting."
            : "Could not save this setting. Try again."}
        </p>
      )}

      <p className="text-muted-foreground mt-4 text-xs">
        When this is on, a learner who opens an invitation link is emailed a sign-in link, and only
        that link starts the course. Learners coming back through a link confirm again each time.
      </p>

      <button
        type="button"
        className={`${on ? secondaryBtn : primaryBtn} mt-5`}
        disabled={busy}
        onClick={() => current && save.mutate({ ...current, linkRequiresVerifiedEmail: !on })}
      >
        {save.isPending ? "Saving…" : on ? "Stop requiring it" : "Require a confirmed email"}
      </button>
    </div>
  );
}
