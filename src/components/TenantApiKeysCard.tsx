import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import type { IssuedApiKey, MeResponse, TenantApiKey } from "@/lib/types";

// Server-to-server keys for the public API, for managers and
// operators. A key names the organization, never a person, and the secret is
// shown exactly once, at issuance: the server keeps only its hash, so there is
// no "reveal" and the card says so. Revoking is immediate, which is why it is
// a two-step control rather than a native confirm.
const primaryBtn =
  "bg-primary inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--color-primary-hover)] focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";
const secondaryBtn =
  "border-border text-foreground inline-flex items-center justify-center rounded-full border px-6 py-3 text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";
const dangerBtn =
  "inline-flex items-center justify-center rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";
const linkBtn =
  "text-sm font-medium text-red-700 hover:underline focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400";
const inputClass =
  "bg-background text-foreground focus:border-primary mt-1 block w-full rounded-lg border border-[color:var(--color-input-border)] px-3 py-2.5 text-[15px] transition-colors focus:ring-2 focus:ring-[color:var(--color-input-focus-ring)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60";

export const MAX_ACTIVE_KEYS = 10;

function problemMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.problem && typeof error.problem === "object") {
    const message = (error.problem as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return fallback;
}

export function TenantApiKeysCard({ user }: { user: MeResponse }) {
  const qc = useQueryClient();
  const queryKey = ["tenants", user.tenantKey, "api-keys"];
  const path = `/api/tenants/${user.tenantKey}/api-keys`;

  const [label, setLabel] = useState("");
  const [issued, setIssued] = useState<IssuedApiKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);

  const keys = useQuery({
    queryKey,
    queryFn: async () => api<TenantApiKey[]>(path),
  });

  const create = useMutation({
    mutationFn: async (nextLabel: string) =>
      api<IssuedApiKey>(path, { method: "POST", body: JSON.stringify({ label: nextLabel }) }),
    onSuccess: (key) => {
      setIssued(key);
      setCopied(false);
      setLabel("");
      void qc.invalidateQueries({ queryKey });
    },
  });

  const revoke = useMutation({
    mutationFn: async (apiKeyKey: number) =>
      api<void>(`${path}/${apiKeyKey}`, { method: "DELETE" }),
    onSuccess: () => {
      setConfirming(null);
      void qc.invalidateQueries({ queryKey });
    },
  });

  const active = (keys.data ?? []).filter((k) => k.revokedAt === null);
  const atLimit = active.length >= MAX_ACTIVE_KEYS;
  const busy = keys.isLoading || create.isPending || revoke.isPending;

  async function copySecret() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="border-border bg-card mx-auto mt-6 max-w-xl rounded-xl border p-6">
      <h2 className="text-lg font-semibold">API keys</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Server-to-server access to your organization, bounded by your plan&apos;s learner and course
        caps
      </p>

      {(keys.isError || create.isError || revoke.isError) && (
        <p className="mt-4 text-sm text-red-700 dark:text-red-400" role="alert">
          {keys.isError
            ? "Could not load API keys."
            : create.isError
              ? problemMessage(create.error, "Could not create the key. Try again.")
              : problemMessage(revoke.error, "Could not revoke the key. Try again.")}
        </p>
      )}

      {issued && (
        <div
          className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/40"
          role="status"
        >
          <p className="text-sm font-medium">Copy this key now. It is shown only once.</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {issued.label}. Send it as <span className="font-mono">Authorization: Bearer</span> on
            every request.
          </p>
          <code
            className="bg-background mt-3 block overflow-x-auto rounded border px-3 py-2 font-mono text-sm break-all select-all"
            data-testid="issued-secret"
          >
            {issued.secret}
          </code>
          <div className="mt-3 flex gap-2">
            <button type="button" className={primaryBtn} onClick={() => void copySecret()}>
              {copied ? "Copied" : "Copy key"}
            </button>
            <button type="button" className={secondaryBtn} onClick={() => setIssued(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      <div className="mt-5">
        {keys.isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
        {!keys.isLoading && active.length === 0 && (
          <p className="text-muted-foreground text-sm">No API keys yet</p>
        )}
        {active.length > 0 && (
          <ul className="divide-border divide-y">
            {active.map((key) => (
              <li key={key.apiKeyKey} className="py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{key.label}</p>
                    <p className="text-muted-foreground mt-0.5 font-mono text-xs">{key.prefix}…</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Created {formatDateTime(key.createdAt)}
                      {key.createdBy ? ` by ${key.createdBy}` : ""}
                      {" · "}
                      {key.lastUsedAt
                        ? `Last used ${formatDateTime(key.lastUsedAt)}`
                        : "Never used"}
                    </p>
                  </div>
                  {confirming !== key.apiKeyKey && (
                    <button
                      type="button"
                      className={linkBtn}
                      disabled={busy}
                      onClick={() => setConfirming(key.apiKeyKey)}
                    >
                      Revoke
                    </button>
                  )}
                </div>
                {confirming === key.apiKeyKey && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
                    <p className="text-sm">
                      Revoke {key.label}? Anything using it stops working at once.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className={dangerBtn}
                        disabled={revoke.isPending}
                        onClick={() => revoke.mutate(key.apiKeyKey)}
                      >
                        {revoke.isPending ? "Revoking…" : "Revoke key"}
                      </button>
                      <button
                        type="button"
                        className={secondaryBtn}
                        disabled={revoke.isPending}
                        onClick={() => setConfirming(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim().length === 0 || atLimit) return;
          create.mutate(label.trim());
        }}
      >
        <label htmlFor="api-key-label" className="block text-sm font-medium">
          New key label
        </label>
        <input
          id="api-key-label"
          type="text"
          className={inputClass}
          maxLength={100}
          placeholder="What will use it, for example Acme production"
          value={label}
          disabled={busy || atLimit}
          onChange={(e) => setLabel(e.target.value)}
        />
        <p className="text-muted-foreground mt-2 text-xs">
          {atLimit
            ? `Limit of ${MAX_ACTIVE_KEYS} active keys reached. Revoke one to create another.`
            : "The label is for you. The key itself is generated and shown once."}
        </p>
        <button
          type="submit"
          className={`${primaryBtn} mt-4`}
          disabled={busy || atLimit || label.trim().length === 0}
        >
          {create.isPending ? "Creating…" : "Create key"}
        </button>
      </form>
    </div>
  );
}
