import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/dates";
import { useAuth } from "@/hooks/useAuth";
import { AccountAdminActions } from "@/components/AccountAdminActions";
import { AccountManagerActions } from "@/components/AccountManagerActions";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { DetailCard, DetailGrid, Field } from "@/components/DetailCard";
import { PageLoading } from "@/components/PageLoading";
import { PageError } from "@/components/PageError";
import { Badge } from "@/components/ui/badge";

interface AccountDetail {
  accountKey: number;
  accountId: string;
  email: string;
  name: string;
  isActive: boolean;
  isManager: boolean;
  isLearner: boolean;
  isOperator: boolean;
  createdAt: string;
  invitedAt: string | null;
  acceptedAt: string | null;
  authenticatedAt: string | null;
  passwordResetAt: string | null;
  passwordExpiresAt: string | null;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && typeof error.problem === "string") return error.problem;
  return fallback;
}

export function AccountDetailPage() {
  const { accountKey } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const tenantKey = user?.tenantKey;

  const detail = useQuery({
    queryKey: ["accounts", tenantKey, accountKey],
    queryFn: async () => api<AccountDetail>(`/api/tenants/${tenantKey}/accounts/${accountKey}`),
    enabled: !!tenantKey && !!accountKey,
  });

  const account = detail.data;

  return (
    <AppShell align="left">
      <PageHeader title={account?.name ?? "Account"} subtitle={account?.email} />

      <div className="mb-4 flex items-center justify-between">
        <Link to="/accounts" className="text-link text-sm hover:underline">
          Back to accounts
        </Link>
        {account && tenantKey !== undefined && (
          <div className="flex items-center gap-2">
            <AccountManagerActions
              tenantKey={tenantKey}
              accountKey={account.accountKey}
              name={account.name}
              email={account.email}
              isActive={account.isActive}
              isManager={account.isManager}
              isLearner={account.isLearner}
              onChanged={() =>
                qc.invalidateQueries({ queryKey: ["accounts", tenantKey, accountKey] })
              }
            />
            <AccountAdminActions
              tenantKey={tenantKey}
              accountKey={account.accountKey}
              name={account.name}
              isActive={account.isActive}
              isOperator={account.isOperator}
              onPasswordSet={() =>
                qc.invalidateQueries({ queryKey: ["accounts", tenantKey, accountKey] })
              }
            />
          </div>
        )}
      </div>

      {detail.isLoading && <PageLoading />}
      {detail.isError && (
        <PageError
          message={errorMessage(detail.error, "Could not load this account.")}
          onRetry={() => detail.refetch()}
        />
      )}

      {account && (
        <div className="flex flex-col gap-6">
          <DetailCard title="Account">
            <DetailGrid>
              <Field label="Name">{account.name}</Field>
              <Field label="Email">{account.email}</Field>
              <Field label="Account id">
                <span className="font-mono text-xs">{account.accountId}</span>
              </Field>
              <Field label="Roles">
                {[
                  account.isOperator && "Operator",
                  account.isManager && "Manager",
                  account.isLearner && "Learner",
                ]
                  .filter(Boolean)
                  .join(", ") || "None"}
              </Field>
              <Field label="Active">
                <Badge variant={account.isActive ? "success" : "secondary"}>
                  {account.isActive ? "Active" : "Inactive"}
                </Badge>
              </Field>
              <Field label="Created">{formatDate(account.createdAt)}</Field>
              <Field label="Last sign-in">
                {account.authenticatedAt ? formatDateTime(account.authenticatedAt) : "Never"}
              </Field>
              <Field label="Password last set">
                {account.passwordResetAt ? formatDateTime(account.passwordResetAt) : "Never"}
              </Field>
              <Field label="Password expires">
                {account.passwordExpiresAt ? formatDate(account.passwordExpiresAt) : "Not set"}
              </Field>
            </DetailGrid>
          </DetailCard>
        </div>
      )}
    </AppShell>
  );
}
