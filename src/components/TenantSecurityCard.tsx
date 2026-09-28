import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { MeResponse, MfaScope, MfaTrustDays, TenantSecurityPolicy } from "@/lib/types";

// The tenant's two-factor mandate and trusted-device
// window, for managers and operators. Every change saves on the spot: the
// switch, the scope, and the window are one row on the tenant, and there is
// nothing to stage. The mandate binds at each person's next sign-in, never
// mid-session, which is also what keeps the manager flipping it from locking
// themselves out. The window applies to everyone in the tenant who uses
// two-factor, mandated or not.
const primaryBtn =
  "bg-primary inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--color-primary-hover)] focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";
const secondaryBtn =
  "border-border text-foreground inline-flex items-center justify-center rounded-full border px-6 py-3 text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";
const selectClass =
  "bg-background text-foreground focus:border-primary mt-1 block w-full rounded-lg border border-[color:var(--color-input-border)] px-3 py-2.5 text-[15px] transition-colors focus:ring-2 focus:ring-[color:var(--color-input-focus-ring)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60";

const fallback: TenantSecurityPolicy = {
  mfaRequired: false,
  mfaScope: "all",
  mfaTrustDays: 30,
  linkRequiresVerifiedEmail: false,
};

function describe(policy: TenantSecurityPolicy | undefined, loading: boolean): string {
  if (loading || !policy) return "Loading…";
  if (!policy.mfaRequired) return "Optional. Anyone can turn it on for their own account.";
  return policy.mfaScope === "managers"
    ? "Required for managers and operators."
    : "Required for all users. Public invitation links are off.";
}

export function TenantSecurityCard({ user }: { user: MeResponse }) {
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

  const current = policy.data ?? fallback;
  const on = current.mfaRequired;
  const scope: MfaScope = current.mfaScope;
  const busy = policy.isLoading || save.isPending;

  return (
    <div className="border-border bg-card mx-auto mt-6 max-w-xl rounded-xl border p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Two-factor for your organization</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {describe(policy.data, policy.isLoading)}
          </p>
        </div>
        <span
          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
            on
              ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {on ? "Required" : "Optional"}
        </span>
      </div>

      {(policy.isError || save.isError) && (
        <p className="mt-4 text-sm text-red-700 dark:text-red-400" role="alert">
          {policy.isError
            ? "Could not load this setting."
            : "Could not save this setting. Try again."}
        </p>
      )}

      {on && (
        <fieldset className="mt-5" disabled={busy}>
          <legend className="text-sm font-medium">Who must use it</legend>
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="mfa-scope"
                checked={scope === "all"}
                onChange={() => save.mutate({ ...current, mfaScope: "all" })}
              />
              All users
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="mfa-scope"
                checked={scope === "managers"}
                onChange={() => save.mutate({ ...current, mfaScope: "managers" })}
              />
              Managers and operators only
            </label>
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            Requiring two-factor for all users turns off this organization&apos;s public invitation
            links. Provision learners by direct invite instead.
          </p>
        </fieldset>
      )}

      <p className="text-muted-foreground mt-4 text-xs">
        Takes effect at each person&apos;s next sign-in. Anyone without an authenticator sets one up
        before they get in.
      </p>

      <div className="mt-5">
        <label htmlFor="mfa-trust" className="block text-sm font-medium">
          Trusted devices
        </label>
        <select
          id="mfa-trust"
          className={selectClass}
          value={String(current.mfaTrustDays)}
          disabled={busy}
          onChange={(e) =>
            save.mutate({ ...current, mfaTrustDays: Number(e.target.value) as MfaTrustDays })
          }
        >
          <option value="0">Off, a code on every sign-in</option>
          <option value="7">7 days</option>
          <option value="14">14 days</option>
          <option value="30">30 days</option>
        </select>
        <p className="text-muted-foreground mt-2 text-xs">
          How long a sign-in can skip the code on a device the person chose to trust. Applies to
          everyone in your organization who uses two-factor.
        </p>
      </div>

      <button
        type="button"
        className={`${on ? secondaryBtn : primaryBtn} mt-5`}
        disabled={busy}
        onClick={() => save.mutate({ ...current, mfaRequired: !on })}
      >
        {save.isPending ? "Saving…" : on ? "Make it optional" : "Require two-factor"}
      </button>
    </div>
  );
}
