import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";

interface OperatorAccountDetailResponse {
  tenantHandle: string;
  tenantName: string;
  accountKey: number;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  authenticatedAt: string | null;
  enrollments: { enrollmentKey: number }[];
}

function useAccountDetail(accountKey: number | undefined) {
  return useQuery({
    queryKey: ["operator", "account", String(accountKey)],
    queryFn: async () => api<OperatorAccountDetailResponse>(`/api/operator/accounts/${accountKey}`),
    enabled: accountKey !== undefined,
  });
}

function mergeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (typeof error.problem === "string") return error.problem;
    if (error.status === 403)
      return "Merge refused. Your connection may not be whitelisted for this command.";
  }
  return "Merge failed.";
}

export function OperatorMergeAccountsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const keys = (searchParams.get("keys") ?? "")
    .split(",")
    .map((k) => Number.parseInt(k, 10))
    .filter((k) => Number.isInteger(k) && k > 0);
  const [keyA, keyB] = keys;
  const validKeys = keys.length === 2 && keyA !== keyB;

  const a = useAccountDetail(validKeys ? keyA : undefined);
  const b = useAccountDetail(validKeys ? keyB : undefined);

  const [survivorKey, setSurvivorKey] = useState<number | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");

  const merge = useMutation({
    mutationFn: async (body: { survivorKey: number; loserKey: number }) =>
      api<void>("/api/operator/merge-accounts", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["operator"] });
      navigate("/operator/reports/duplicate-accounts");
    },
  });

  const bothLoaded = a.data && b.data;
  const survivor = survivorKey === keyA ? a.data : survivorKey === keyB ? b.data : undefined;
  const loser = survivorKey === keyA ? b.data : survivorKey === keyB ? a.data : undefined;
  const sharedEmail = a.data?.email.toLowerCase();
  const confirmed = !!sharedEmail && confirmEmail.trim().toLowerCase() === sharedEmail;

  return (
    <AppShell>
      <PageHeader
        title="Operator: Merge accounts"
        subtitle="Merge two duplicate accounts into one"
        restricted={[
          "Operator access only. Your account must have the operator role.",
          "The /operator/merge-accounts route is wrapped in RequireOperator; non-operators are redirected to their dashboard or library.",
          <>
            Enforced server-side by{" "}
            <code className="font-mono">POST /api/operator/merge-accounts</code>, which returns 403
            for non-operators and for connections outside the security whitelist.
          </>,
        ]}
      />

      <p className="mb-4">
        <Link
          to="/operator/reports/duplicate-accounts"
          className="text-link text-sm hover:underline"
        >
          Back to duplicate accounts
        </Link>
      </p>

      {!validKeys && (
        <p className="text-muted-foreground py-6 text-sm">
          Select two accounts on the duplicate accounts report to start a merge.
        </p>
      )}

      {validKeys && (a.isLoading || b.isLoading) && (
        <p className="text-muted-foreground py-6 text-sm">Loading…</p>
      )}
      {validKeys && (a.isError || b.isError) && (
        <p className="py-6 text-sm text-red-600 dark:text-red-400">Failed to load accounts.</p>
      )}

      {bothLoaded && (
        <div className="flex flex-col gap-6">
          <p className="text-muted-foreground text-sm">
            Pick the account that survives. The other account is deactivated and renamed. Its
            enrollments and progress move to the survivor except where the survivor already has
            progress for the same course; those rows are discarded. Historical activity records stay
            attributed to the original account.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {[a.data!, b.data!].map((acct) => (
              <label
                key={acct.accountKey}
                className={`cursor-pointer rounded-xl border p-5 transition-colors ${
                  survivorKey === acct.accountKey
                    ? "border-primary ring-primary/30 ring-2"
                    : "border-border bg-card"
                }`}
              >
                <div className="mb-3 flex items-center gap-2">
                  <input
                    type="radio"
                    name="survivor"
                    checked={survivorKey === acct.accountKey}
                    onChange={() => setSurvivorKey(acct.accountKey)}
                  />
                  <span className="font-semibold">Survivor</span>
                </div>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Account key</dt>
                    <dd className="font-mono text-xs">{acct.accountKey}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Name</dt>
                    <dd>{acct.name}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Email</dt>
                    <dd className="break-all">{acct.email}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Tenant</dt>
                    <dd className="font-mono text-xs">{acct.tenantHandle}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Active</dt>
                    <dd>{acct.isActive ? "Yes" : "No"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Enrollments</dt>
                    <dd className="tabular-nums">{acct.enrollments.length}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Created</dt>
                    <dd>{formatDate(acct.createdAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Last sign-in</dt>
                    <dd>{formatDate(acct.authenticatedAt)}</dd>
                  </div>
                </dl>
              </label>
            ))}
          </div>

          {survivor && loser && (
            <div className="overflow-hidden rounded-xl border border-red-300 dark:border-red-900">
              <h2 className="bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:bg-red-950/40 dark:text-red-200">
                Confirm merge
              </h2>
              <div className="bg-card flex flex-col gap-4 p-4">
                <p className="text-muted-foreground text-sm">
                  Account {loser.accountKey} will be deactivated and renamed. Its progress moves to
                  account {survivor.accountKey}; where both hold progress for the same course, the
                  survivor's rows win and the other rows are discarded. This cannot be undone.
                </p>
                <div className="max-w-md">
                  <label htmlFor="confirm-email" className="mb-1.5 block text-sm font-medium">
                    Type <span className="font-mono">{sharedEmail}</span> to confirm
                  </label>
                  <input
                    id="confirm-email"
                    type="text"
                    autoComplete="off"
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                    className="border-border bg-background text-foreground block w-full rounded-lg border px-3 py-2 font-mono text-sm focus:border-red-600 focus:outline-none"
                  />
                </div>
                {merge.isError && (
                  <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                    {mergeErrorMessage(merge.error)}
                  </p>
                )}
                <div>
                  <button
                    type="button"
                    disabled={!confirmed || merge.isPending}
                    onClick={() =>
                      merge.mutate({ survivorKey: survivor.accountKey, loserKey: loser.accountKey })
                    }
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {merge.isPending ? "Merging…" : "Merge accounts"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
