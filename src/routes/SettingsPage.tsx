import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import type { MfaSetupResponse, MfaStatusResponse, ProblemResponse } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { MfaProvisioning } from "@/components/MfaProvisioning";
import { PageHeader } from "@/components/PageHeader";
import { TenantApiKeysCard } from "@/components/TenantApiKeysCard";
import { TenantSecurityCard } from "@/components/TenantSecurityCard";
import { LinkVerificationCard } from "@/components/LinkVerificationCard";
import { TenantWebhookCard } from "@/components/TenantWebhookCard";
import { TrustedDevices } from "@/components/TrustedDevices";

// Self-service two-factor management. Enrollment is two steps by
// design: setup mints the secret and recovery codes (re-authed by password),
// then the user proves they can produce a code before it is turned on, so a
// misconfigured authenticator never locks anyone out.
const primaryBtn =
  "bg-primary inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--color-primary-hover)] focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";
const secondaryBtn =
  "border-border text-foreground inline-flex items-center justify-center rounded-full border px-6 py-3 text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";
const inputClass =
  "bg-background text-foreground focus:border-primary block w-full rounded-lg border border-[color:var(--color-input-border)] px-3 py-2.5 text-[15px] transition-colors focus:ring-2 focus:ring-[color:var(--color-input-focus-ring)] focus:outline-none";

function problemText(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.problem) {
    const p = err.problem as ProblemResponse;
    return p.detail ?? p.title ?? fallback;
  }
  return fallback;
}

type Stage = "idle" | "password" | "confirm";

export function SettingsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [stage, setStage] = useState<Stage>("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<MfaSetupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disarming, setDisarming] = useState(false);

  const status = useQuery({
    queryKey: ["auth", "mfa"],
    queryFn: async () => api<MfaStatusResponse>("/api/auth/mfa"),
  });

  const reset = () => {
    setStage("idle");
    setPassword("");
    setCode("");
    setSetup(null);
    setError(null);
    setDisarming(false);
  };

  const begin = useMutation({
    mutationFn: async () =>
      api<MfaSetupResponse>("/api/auth/mfa/setup", {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    onSuccess: (r) => {
      setSetup(r);
      setPassword("");
      setError(null);
      setStage("confirm");
    },
    onError: (err) => setError(problemText(err, "Could not start setup.")),
  });

  const enable = useMutation({
    mutationFn: async () =>
      api<MfaStatusResponse>("/api/auth/mfa/enable", {
        method: "POST",
        body: JSON.stringify({ code }),
      }),
    onSuccess: (r) => {
      qc.setQueryData(["auth", "mfa"], r);
      reset();
    },
    onError: (err) => setError(problemText(err, "That code did not match.")),
  });

  const disable = useMutation({
    mutationFn: async () =>
      api<MfaStatusResponse>("/api/auth/mfa/disable", {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    onSuccess: (r) => {
      qc.setQueryData(["auth", "mfa"], r);
      reset();
    },
    onError: (err) => setError(problemText(err, "Could not turn off two-factor.")),
  });

  const enabled = status.data?.enabled ?? false;

  return (
    <AppShell>
      <PageHeader
        title="Settings"
        subtitle="Two-factor authentication, product analytics, and your organization's sign-in policy"
      />

      <div className="border-border bg-card mx-auto max-w-xl rounded-xl border p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Two-factor authentication</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {status.isLoading
                ? "Loading…"
                : enabled
                  ? `On. ${status.data?.recoveryCodesRemaining ?? 0} recovery codes remaining.`
                  : "Off. Add a code from an authenticator app to your sign-in."}
            </p>
          </div>
          <span
            className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
              enabled
                ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {enabled ? "On" : "Off"}
          </span>
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-700 dark:text-red-400" role="alert">
            {error}
          </p>
        )}

        {!enabled && stage === "idle" && (
          <button
            type="button"
            className={`${primaryBtn} mt-5`}
            onClick={() => setStage("password")}
          >
            Set up two-factor
          </button>
        )}

        {!enabled && stage === "password" && (
          <form
            className="mt-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              begin.mutate();
            }}
          >
            <label htmlFor="pw" className="block text-sm font-medium">
              Confirm your password to continue
            </label>
            <input
              id="pw"
              type="password"
              autoComplete="current-password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex gap-2">
              <button type="submit" className={primaryBtn} disabled={begin.isPending || !password}>
                {begin.isPending ? "Working…" : "Continue"}
              </button>
              <button type="button" className={secondaryBtn} onClick={reset}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {!enabled && stage === "confirm" && setup && (
          <div className="mt-5 space-y-4">
            <p className="text-sm">
              Scan this with your authenticator app, then enter the 6-digit code it shows.
            </p>
            <MfaProvisioning setup={setup} />

            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                enable.mutate();
              }}
            >
              <label htmlFor="code" className="block text-sm font-medium">
                Enter the 6-digit code
              </label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                className={`${inputClass} font-mono`}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <div className="flex gap-2">
                <button type="submit" className={primaryBtn} disabled={enable.isPending || !code}>
                  {enable.isPending ? "Turning on…" : "Turn on two-factor"}
                </button>
                <button type="button" className={secondaryBtn} onClick={reset}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Devices that skip the code, while two-factor is on. */}
        {enabled && <TrustedDevices />}

        {enabled && !disarming && (
          <button
            type="button"
            className={`${secondaryBtn} mt-5`}
            onClick={() => setDisarming(true)}
          >
            Turn off two-factor
          </button>
        )}
        {enabled && disarming && (
          <form
            className="mt-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              disable.mutate();
            }}
          >
            <label htmlFor="pw-off" className="block text-sm font-medium">
              Confirm your password to turn off two-factor
            </label>
            <input
              id="pw-off"
              type="password"
              autoComplete="current-password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className={primaryBtn}
                disabled={disable.isPending || !password}
              >
                {disable.isPending ? "Turning off…" : "Turn off"}
              </button>
              <button type="button" className={secondaryBtn} onClick={reset}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* The tenant's sign-in policy: managers and operators only. */}
      {user && (user.isManager || user.isOperator) && <TenantSecurityCard user={user} />}
      {user && (user.isManager || user.isOperator) && <LinkVerificationCard user={user} />}

      {/* Server-to-server keys for the public API: managers and
          operators only. The secret is shown once, at issuance, and never again. */}
      {user && (user.isManager || user.isOperator) && <TenantApiKeysCard user={user} />}
      {user && (user.isManager || user.isOperator) && <TenantWebhookCard user={user} />}
    </AppShell>
  );
}
