import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import { roleLabel } from "@/lib/accounts";
import { formatDateTime } from "@/lib/dates";
import { AccountAdminActions } from "@/components/AccountAdminActions";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { DetailCard, DetailGrid, Field } from "@/components/DetailCard";
import { PageLoading } from "@/components/PageLoading";
import { PageError } from "@/components/PageError";
import { TableStateRow } from "@/components/TableStateRow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface OperatorAccountEnrollment {
  enrollmentKey: number;
  courseKey: number;
  courseTitle: string;
  status: string;
  score: string | null;
  duration: string | null;
  attemptCount: number;
  createdAt: string;
  modifiedAt: string | null;
}

interface OperatorAccountDetailResponse {
  tenantHandle: string;
  tenantName: string;
  tenantKey: number;
  accountKey: number;
  accountId: string;
  email: string;
  login: string;
  title: string | null;
  nameFirst: string;
  nameLast: string;
  name: string;
  isActive: boolean;
  isOperator: boolean;
  isManager: boolean;
  isLearner: boolean;
  totpEnabled: boolean;
  failedLoginCount: number;
  lockedUntil: string | null;
  createdAt: string;
  invitedAt: string | null;
  acceptedAt: string | null;
  authenticatedAt: string | null;
  passwordResetAt: string | null;
  passwordExpiresAt: string;
  enrollments: OperatorAccountEnrollment[];
}

interface EditAccountForm {
  name: string;
  email: string;
  login: string;
  isOperator: boolean;
  isManager: boolean;
  isLearner: boolean;
  isActive: boolean;
}

function editErrorMessage(error: unknown): string {
  if (error instanceof ApiError && typeof error.problem === "string") return error.problem;
  return "Save failed.";
}

export function OperatorAccountDetailPage() {
  const { accountKey } = useParams();
  const qc = useQueryClient();

  const detail = useQuery({
    queryKey: ["operator", "account", accountKey],
    queryFn: async () => api<OperatorAccountDetailResponse>(`/api/operator/accounts/${accountKey}`),
  });

  const notFound = detail.error instanceof ApiError && detail.error.status === 404;
  const a = detail.data;

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<EditAccountForm | null>(null);

  function openEdit() {
    if (!a) return;
    setForm({
      name: a.name,
      email: a.email,
      login: a.login,
      isOperator: a.isOperator,
      isManager: a.isManager,
      isLearner: a.isLearner,
      isActive: a.isActive,
    });
    setEditOpen(true);
  }

  const save = useMutation({
    mutationFn: async (body: EditAccountForm) =>
      api<void>(`/api/operator/accounts/${accountKey}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      setEditOpen(false);
      await qc.invalidateQueries({ queryKey: ["operator"] });
    },
  });

  const formValid =
    !!form &&
    form.name.trim() !== "" &&
    form.email.trim() !== "" &&
    form.login.trim() !== "" &&
    (form.isOperator || form.isManager || form.isLearner);

  // Login normally follows the {tenantHandle}/{email} composite; warn on drift
  // rather than block, because legacy rows predate the convention.
  const expectedLogin = form && a ? `${a.tenantHandle}/${form.email.trim().toLowerCase()}` : "";
  const loginDrifted = !!form && form.login.trim() !== expectedLogin;

  return (
    <AppShell align="left">
      <PageHeader
        title={a ? `Account: ${a.name}` : "Account"}
        subtitle="Cross-tenant account detail"
        restricted={[
          "Operator access only. Your account must have the operator role.",
          "The /operator/accounts/:accountKey route is wrapped in RequireOperator; non-operators are redirected to their dashboard or library.",
          <>
            Enforced server-side by{" "}
            <code className="font-mono">GET /api/operator/accounts/&#123;accountKey&#125;</code>,
            which returns 403 for non-operators.
          </>,
        ]}
      />

      <div className="mb-4 flex items-center justify-between">
        <Link to="/operator/accounts" className="text-link text-sm hover:underline">
          Back to accounts
        </Link>
        {a && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openEdit}>
              Edit
            </Button>
            {/* The tenant key is the target's own, not the operator's: this
                console reaches across tenants. */}
            <AccountAdminActions
              tenantKey={a.tenantKey}
              accountKey={a.accountKey}
              name={a.name}
              isActive={a.isActive}
              isOperator={a.isOperator}
              onPasswordSet={() => qc.invalidateQueries({ queryKey: ["operator"] })}
            />
          </div>
        )}
      </div>

      {detail.isLoading && <PageLoading />}
      {notFound && <PageError message="Account not found." />}
      {detail.isError && !notFound && (
        <PageError message="Failed to load account." onRetry={() => detail.refetch()} />
      )}

      {a && (
        <div className="flex flex-col gap-6">
          <DetailCard title="Account">
            <DetailGrid>
              <Field label="Name">
                {a.title ? `${a.title} ` : ""}
                {a.nameFirst} {a.nameLast}
              </Field>
              <Field label="Email">{a.email}</Field>
              <Field label="Login">
                <span className="font-mono text-xs">{a.login}</span>
              </Field>
              <Field label="Tenant">
                <span className="font-mono text-xs">{a.tenantHandle}</span> ({a.tenantName})
              </Field>
              <Field label="Roles">{roleLabel(a)}</Field>
              <Field label="Active">
                <Badge variant={a.isActive ? "success" : "secondary"}>
                  {a.isActive ? "Active" : "Inactive"}
                </Badge>
              </Field>
              <Field label="Account key">
                <span className="font-mono text-xs">{a.accountKey}</span>
              </Field>
              <Field label="Account id">
                <span className="font-mono text-xs">{a.accountId}</span>
              </Field>
            </DetailGrid>
          </DetailCard>

          <DetailCard title="Security">
            <DetailGrid>
              <Field label="MFA (TOTP)">{a.totpEnabled ? "Enabled" : "Not enabled"}</Field>
              <Field label="Failed login count">{a.failedLoginCount}</Field>
              <Field label="Locked until">
                {a.lockedUntil ? formatDateTime(a.lockedUntil) : "Not locked"}
              </Field>
              <Field label="Password expires">{formatDateTime(a.passwordExpiresAt)}</Field>
              <Field label="Password reset">{formatDateTime(a.passwordResetAt)}</Field>
            </DetailGrid>
          </DetailCard>

          <DetailCard title="Timeline">
            <DetailGrid>
              <Field label="Created">{formatDateTime(a.createdAt)}</Field>
              <Field label="Invited">{formatDateTime(a.invitedAt)}</Field>
              <Field label="Accepted">{formatDateTime(a.acceptedAt)}</Field>
              <Field label="Last sign-in">{formatDateTime(a.authenticatedAt)}</Field>
            </DetailGrid>
          </DetailCard>

          <DetailCard title={`Enrollments (${a.enrollments.length})`}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Course</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.enrollments.length === 0 && (
                  <TableStateRow colSpan={7}>No enrollments</TableStateRow>
                )}
                {a.enrollments.map((e) => (
                  <TableRow key={e.enrollmentKey}>
                    <TableCell>{e.courseTitle}</TableCell>
                    <TableCell>
                      <StatusBadge status={e.status} />
                    </TableCell>
                    <TableCell>{e.score ?? "-"}</TableCell>
                    <TableCell>{e.duration ?? "-"}</TableCell>
                    <TableCell>{e.attemptCount}</TableCell>
                    <TableCell>{formatDateTime(e.createdAt)}</TableCell>
                    <TableCell>{formatDateTime(e.modifiedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DetailCard>
        </div>
      )}

      {a && form && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit account</DialogTitle>
              <DialogDescription>
                Changes apply immediately. Email is stored lowercase.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div>
                <label htmlFor="edit-name" className="mb-1.5 block text-sm font-medium">
                  Name
                </label>
                <Input
                  id="edit-name"
                  type="text"
                  autoComplete="off"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="edit-email" className="mb-1.5 block text-sm font-medium">
                  Email
                </label>
                <Input
                  id="edit-email"
                  type="email"
                  autoComplete="off"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="edit-login" className="mb-1.5 block text-sm font-medium">
                  Login
                </label>
                <Input
                  id="edit-login"
                  type="text"
                  autoComplete="off"
                  value={form.login}
                  onChange={(e) => setForm({ ...form, login: e.target.value })}
                  className="font-mono"
                />
                {loginDrifted && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    Login differs from the usual <span className="font-mono">{expectedLogin}</span>{" "}
                    composite. The account signs in with exactly this value.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-sm font-medium">Roles</span>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isOperator}
                    onChange={(e) => setForm({ ...form, isOperator: e.target.checked })}
                  />
                  Operator
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isManager}
                    onChange={(e) => setForm({ ...form, isManager: e.target.checked })}
                  />
                  Manager
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isLearner}
                    onChange={(e) => setForm({ ...form, isLearner: e.target.checked })}
                  />
                  Learner
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Active
              </label>
              {save.isError && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  {editErrorMessage(save.error)}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button disabled={!formValid || save.isPending} onClick={() => save.mutate(form)}>
                {save.isPending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AppShell>
  );
}
