import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";

interface OperatorAccountSummary {
  tenantHandle: string;
  accountKey: number;
  email: string;
  name: string;
  isActive: boolean;
  isOperator: boolean;
  isManager: boolean;
  isLearner: boolean;
  createdAt: string;
  authenticatedAt: string | null;
}

interface DuplicateAccountsResponse {
  canMerge: boolean;
  duplicateAccounts: number;
  duplicateEmails: number;
  accounts: OperatorAccountSummary[];
}

export function OperatorDuplicateAccountsPage() {
  const navigate = useNavigate();
  const [sameTenant, setSameTenant] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);

  const list = useQuery({
    queryKey: ["operator", "reports", "duplicate-accounts", sameTenant],
    queryFn: async () =>
      api<DuplicateAccountsResponse>(
        `/api/operator/reports/duplicate-accounts${sameTenant ? "?same_tenant=true" : ""}`,
      ),
    placeholderData: keepPreviousData,
  });

  const canMerge = list.data?.canMerge ?? false;
  const rows = list.data?.accounts ?? [];

  function toggleSelect(accountKey: number) {
    setSelected((prev) =>
      prev.includes(accountKey) ? prev.filter((k) => k !== accountKey) : [...prev, accountKey],
    );
  }

  // A merge pair must share tenant and email (case-insensitive); the API
  // enforces the same rule, this just keeps the button honest.
  const selectedRows = rows.filter((r) => selected.includes(r.accountKey));
  const validPair =
    selectedRows.length === 2 &&
    selectedRows[0].tenantHandle === selectedRows[1].tenantHandle &&
    selectedRows[0].email.toLowerCase() === selectedRows[1].email.toLowerCase();

  return (
    <AppShell>
      <PageHeader
        title="Operator: Duplicate accounts"
        subtitle="Accounts sharing an email address with at least one other account"
        restricted={[
          "Operator access only. Your account must have the operator role.",
          "The /operator/reports/duplicate-accounts route is wrapped in RequireOperator; non-operators are redirected to their dashboard or library.",
          <>
            Enforced server-side by{" "}
            <code className="font-mono">GET /api/operator/reports/duplicate-accounts</code>, which
            returns 403 for non-operators.
          </>,
        ]}
      />

      <p className="mb-4">
        <Link to="/operator/dashboard" className="text-link text-sm hover:underline">
          Back to dashboard
        </Link>
      </p>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sameTenant}
              onChange={(e) => setSameTenant(e.target.checked)}
            />
            Same tenant only
          </label>
          {canMerge && (
            <>
              <button
                type="button"
                disabled={!validPair}
                onClick={() =>
                  navigate(`/operator/merge-accounts?keys=${selected[0]},${selected[1]}`)
                }
                className="border-border hover:bg-muted rounded-lg border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              >
                Merge selected
              </button>
              {selectedRows.length === 2 && !validPair && (
                <span className="text-sm text-red-600 dark:text-red-400">
                  Selected accounts must share the same email and tenant.
                </span>
              )}
            </>
          )}
        </div>
        {list.data && (
          <p className="text-muted-foreground text-sm">
            {list.data.duplicateAccounts} accounts across {list.data.duplicateEmails} email
            addresses
          </p>
        )}
      </div>

      <p className="text-muted-foreground/70 mb-4 text-xs">
        Same-tenant duplicates share an email inside one tenant, differing only by letter case.
        These are the truly problematic rows: they block case-insensitive email uniqueness and need
        a merge. Cross-tenant duplicates are usually just one person in more than one tenant.
      </p>

      <div className="border-border bg-card text-card-foreground overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground text-left">
              <tr>
                {canMerge && <th className="w-10 px-4 py-3" aria-label="Select" />}
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Tenant</th>
                <th className="px-4 py-3 font-medium">Active</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading && (
                <tr>
                  <td
                    colSpan={canMerge ? 7 : 6}
                    className="text-muted-foreground px-4 py-6 text-center"
                  >
                    Loading…
                  </td>
                </tr>
              )}
              {list.data && list.data.accounts.length === 0 && (
                <tr>
                  <td
                    colSpan={canMerge ? 7 : 6}
                    className="text-muted-foreground px-4 py-6 text-center"
                  >
                    No duplicate accounts
                  </td>
                </tr>
              )}
              {list.data?.accounts.map((a) => (
                <tr key={a.accountKey} className="border-border border-t">
                  {canMerge && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select account ${a.accountKey}`}
                        checked={selected.includes(a.accountKey)}
                        disabled={selected.length === 2 && !selected.includes(a.accountKey)}
                        onChange={() => toggleSelect(a.accountKey)}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">{a.email}</td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/operator/accounts/${a.accountKey}`}
                      className="text-link hover:underline"
                    >
                      {a.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{a.tenantHandle}</td>
                  <td className="px-4 py-3">{a.isActive ? "Yes" : "No"}</td>
                  <td className="px-4 py-3">{formatDate(a.createdAt)}</td>
                  <td className="px-4 py-3">{formatDate(a.authenticatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
