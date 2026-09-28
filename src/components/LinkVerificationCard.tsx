import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { InvitationLinkDays, MeResponse, TenantSecurityPolicy } from "@/lib/types";

// Whether the organization's public invitation links must confirm the
// learner's email before signing them in, and how long a new link lasts. Both
// live on the same security
// policy as the two-factor card, so both read and save through one query and
// one PUT, and a change on either card shows on the other at once.
const primaryBtn =
  "bg-primary inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--color-primary-hover)] focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";
const selectClass =
  "bg-background text-foreground focus:border-primary mt-1 block w-full rounded-lg border border-[color:var(--color-input-border)] px-3 py-2.5 text-[15px] transition-colors focus:ring-2 focus:ring-[color:var(--color-input-focus-ring)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60";
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

      <div className="mt-6">
        <label htmlFor="link-lifetime" className="block text-sm font-medium">
          New links expire after
        </label>
        <select
          id="link-lifetime"
          className={selectClass}
          value={String(current?.invitationLinkDays ?? 0)}
          disabled={busy}
          onChange={(e) =>
            current &&
            save.mutate({
              ...current,
              invitationLinkDays: Number(e.target.value) as InvitationLinkDays,
            })
          }
        >
          <option value="0">Never</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="180">180 days</option>
          <option value="365">365 days</option>
        </select>
        <p className="text-muted-foreground mt-2 text-xs">
          Applies to links created after you change it. Existing links keep their expiry, and any
          link can be revoked from its course page.
        </p>
      </div>
    </div>
  );
}
