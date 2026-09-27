import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import { ACCOUNT_PAGE_SIZE, roleLabel } from "@/lib/accounts";
import type { AccountsResponse, AccountSort } from "@/lib/accounts";
import { formatDate, formatDateTime } from "@/lib/dates";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { TablePager } from "@/components/TablePager";
import { DetailCard, DetailGrid, Field } from "@/components/DetailCard";
import { PageLoading } from "@/components/PageLoading";
import { PageError } from "@/components/PageError";
import { SelectControl } from "@/components/SelectControl";
import { TableStateRow } from "@/components/TableStateRow";
import { OperatorTenantSamlCard } from "@/components/OperatorTenantSamlCard";
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

interface EditTenantForm {
  name: string;
  handle: string;
  referral: string;
  capWaived: boolean;
  capWaiverNote: string;
  // The catalog plan; sent only when it differs from the stored one.
  tenantType: string;
}

// The plans the console may set. Custom is deliberately absent: it
// has no catalog limits, so it is only ever shown as a current value.
// Provider is refused by the API until the repriced catalog is on.
const PLANS = ["Trial", "Mini", "Starter", "Small", "Medium", "Large", "Provider"];

function editErrorMessage(error: unknown): string {
  if (error instanceof ApiError && typeof error.problem === "string") return error.problem;
  return "Save failed.";
}

interface OperatorTenantCourse {
  courseKey: number;
  courseSlug: string;
  courseTitle: string;
  scormVersion: string;
  sizeInKb: number;
  isActive: boolean;
  isShared: boolean;
  courseTag: string | null;
  uploadedAt: string;
}

interface OperatorTenantDetailResponse {
  canRestart: boolean;
  canDelete: boolean;
  // The off switch and its gates; item 2, today's API calls.
  canSuspend: boolean;
  suspendedAt: string | null;
  suspensionNote: string | null;
  apiCallsToday: number;
  apiDailyLimit: number | null;
  tenantKey: number;
  tenantId: string;
  tenantHandle: string;
  tenantName: string;
  tenantType: string;
  platformEdition: string;
  platformReferral: string | null;
  courseLimit: number;
  userLimit: number;
  capWaived: boolean;
  capWaiverNote: string | null;
  coursesAlwaysShared: boolean;
  courseCount: number;
  userCount: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  createdAt: string;
  courses: OperatorTenantCourse[];
}

function formatSize(sizeInKb: number): string {
  if (sizeInKb >= 1024) return `${(sizeInKb / 1024).toFixed(1)} MB`;
  return `${sizeInKb} KB`;
}

// Accounts live in their own card with their own query rather than riding along
// on the tenant detail payload: a tenant can hold thousands of accounts, where
// its course list is small enough to embed. Sort and page state are local to the
// card so paging the grid does not refetch the tenant.
function AccountsCard({ tenantKey }: { tenantKey: string }) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<AccountSort>("name");

  const list = useQuery({
    queryKey: ["operator", "tenant", tenantKey, "accounts", page, sort],
    queryFn: async () =>
      api<AccountsResponse>(
        `/api/operator/tenants/${tenantKey}/accounts?page=${page}&page_size=${ACCOUNT_PAGE_SIZE}&sort=${sort}`,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <DetailCard
      title="Accounts"
      action={
        <SelectControl
          value={sort}
          onChange={(next) => {
            setSort(next as AccountSort);
            setPage(1);
          }}
          label="Sort accounts"
          className="min-w-[170px]"
        >
          <option value="name">Sort: name</option>
          <option value="created">Sort: newest first</option>
        </SelectControl>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>Active</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Last sign-in</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.isLoading && <TableStateRow colSpan={6}>Loading…</TableStateRow>}
          {list.isError && (
            <TableStateRow colSpan={6} tone="danger">
              Failed to load accounts.
            </TableStateRow>
          )}
          {list.data && list.data.accounts.length === 0 && (
            <TableStateRow colSpan={6}>No accounts</TableStateRow>
          )}
          {list.data?.accounts.map((a) => (
            <TableRow key={a.accountKey}>
              <TableCell>
                <Link
                  to={`/operator/accounts/${a.accountKey}`}
                  className="text-link hover:underline"
                >
                  {a.name}
                </Link>
              </TableCell>
              <TableCell>{a.email}</TableCell>
              <TableCell>{roleLabel(a)}</TableCell>
              <TableCell>
                <Badge variant={a.isActive ? "success" : "secondary"}>
                  {a.isActive ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell>{formatDate(a.createdAt)}</TableCell>
              <TableCell>{formatDate(a.authenticatedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {list.data && (
        <TablePager
          page={page}
          pageSize={ACCOUNT_PAGE_SIZE}
          total={list.data.total}
          onPageChange={setPage}
        />
      )}
    </DetailCard>
  );
}

export function OperatorTenantDetailPage() {
  const { tenantKey } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [restartOpen, setRestartOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendNote, setSuspendNote] = useState("");
  const [confirmHandle, setConfirmHandle] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmHandle, setDeleteConfirmHandle] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<EditTenantForm | null>(null);

  const detail = useQuery({
    queryKey: ["operator", "tenant", tenantKey],
    queryFn: async () => api<OperatorTenantDetailResponse>(`/api/operator/tenants/${tenantKey}`),
  });

  const restart = useMutation({
    mutationFn: async () =>
      api<void>(`/api/operator/tenants/${tenantKey}/restart`, { method: "POST" }),
    onSuccess: async () => {
      setRestartOpen(false);
      setConfirmHandle("");
      await qc.invalidateQueries({ queryKey: ["operator"] });
    },
  });

  // Suspend takes the note; unsuspend takes nothing. Both
  // refetch the detail so the banner and the danger zone follow the switch.
  const suspend = useMutation({
    mutationFn: async (note: string) =>
      api<{ suspendedAt: string }>(`/api/operator/tenants/${tenantKey}/suspend`, {
        method: "POST",
        body: JSON.stringify({ note: note.trim() || null }),
      }),
    onSuccess: async () => {
      setSuspendOpen(false);
      setSuspendNote("");
      await qc.invalidateQueries({ queryKey: ["operator"] });
    },
  });
  const unsuspend = useMutation({
    mutationFn: async () =>
      api<void>(`/api/operator/tenants/${tenantKey}/unsuspend`, { method: "POST" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["operator"] });
    },
  });

  const notFound = detail.error instanceof ApiError && detail.error.status === 404;
  const t = detail.data;

  // A plan under an active Stripe subscription changes through
  // Stripe; the console shows it locked and the API refuses it with 409.
  const subscriptionActive =
    !!t?.stripeSubscriptionId && (t.subscriptionStatus ?? "").toLowerCase() !== "canceled";

  function openEdit() {
    if (!t) return;
    setForm({
      name: t.tenantName,
      handle: t.tenantHandle,
      referral: t.platformReferral ?? "",
      capWaived: t.capWaived,
      capWaiverNote: t.capWaiverNote ?? "",
      tenantType: t.tenantType,
    });
    setEditOpen(true);
  }

  const save = useMutation({
    mutationFn: async (body: EditTenantForm) =>
      api<void>(`/api/operator/tenants/${tenantKey}`, {
        method: "PATCH",
        // The plan rides only when it changed, so an unchanged edit carries
        // no plan field at all and the waiver stays a waiver.
        body: JSON.stringify({
          ...body,
          tenantType: body.tenantType === t?.tenantType ? undefined : body.tenantType,
        }),
      }),
    onSuccess: async () => {
      setEditOpen(false);
      await qc.invalidateQueries({ queryKey: ["operator"] });
    },
  });

  const formValid = !!form && form.name.trim() !== "" && form.handle.trim() !== "";
  const handleChanged = !!form && !!t && form.handle.trim() !== t.tenantHandle;

  const del = useMutation({
    mutationFn: async () => api<void>(`/api/operator/tenants/${tenantKey}`, { method: "DELETE" }),
    onSuccess: async () => {
      setDeleteOpen(false);
      setDeleteConfirmHandle("");
      await qc.invalidateQueries({ queryKey: ["operator"] });
      navigate("/operator/tenants");
    },
  });

  return (
    <AppShell align="left">
      <PageHeader
        title={t ? `Tenant: ${t.tenantName}` : "Tenant"}
        subtitle="Cross-tenant tenant detail"
        restricted={[
          "Operator access only. Your account must have the operator role.",
          "The /operator/tenants/:tenantKey route is wrapped in RequireOperator; non-operators are redirected to their dashboard or library.",
          <>
            Enforced server-side by{" "}
            <code className="font-mono">GET /api/operator/tenants/&#123;tenantKey&#125;</code>,
            which returns 403 for non-operators.
          </>,
        ]}
      />

      <div className="mb-4 flex items-center justify-between">
        <Link to="/operator/tenants" className="text-link text-sm hover:underline">
          Back to tenants
        </Link>
        {t && (
          <Button variant="outline" onClick={openEdit}>
            Edit
          </Button>
        )}
      </div>

      {detail.isLoading && <PageLoading />}
      {notFound && <PageError message="Tenant not found." />}
      {detail.isError && !notFound && (
        <PageError message="Failed to load tenant." onRetry={() => detail.refetch()} />
      )}

      {t && (
        <div className="flex flex-col gap-6">
          {t.suspendedAt && (
            <div
              role="alert"
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
            >
              <strong>Suspended</strong> since {formatDateTime(t.suspendedAt)}. Sign-ins, API keys,
              launches, and course content are refused until an operator lifts it.
              {t.suspensionNote && <> Note: {t.suspensionNote}</>}
            </div>
          )}

          <DetailCard title="Tenant">
            <DetailGrid>
              <Field label="Name">{t.tenantName}</Field>
              <Field label="Handle">
                <span className="font-mono text-xs">{t.tenantHandle}</span>
              </Field>
              <Field label="Type">{t.tenantType}</Field>
              <Field label="Edition">{t.platformEdition}</Field>
              <Field label="Referral">{t.platformReferral ?? "None"}</Field>
              <Field label="Course sharing">
                {t.coursesAlwaysShared ? "All courses always shared" : "Per course"}
              </Field>
              <Field label="Created">{formatDateTime(t.createdAt)}</Field>
              <Field label="Tenant key">
                <span className="font-mono text-xs">{t.tenantKey}</span>
              </Field>
              <Field label="Tenant id">
                <span className="font-mono text-xs">{t.tenantId}</span>
              </Field>
            </DetailGrid>
          </DetailCard>

          <DetailCard title="Capacity">
            <DetailGrid>
              {/* The plan limit still renders when a waiver is in force. It is
                  what the tenant pays for, and hiding it would leave nothing to
                  read the overage against. */}
              <Field label="Courses">
                {t.courseCount} / {t.courseLimit || "∞"}
                {t.capWaived && <span className="text-muted-foreground"> (cap waived)</span>}
              </Field>
              <Field label="Accounts">
                {t.userCount} / {t.userLimit || "∞"}
                {t.capWaived && <span className="text-muted-foreground"> (cap waived)</span>}
              </Field>
              <Field label="Cap waiver">
                {t.capWaived ? "Permitted to exceed both caps" : "None"}
              </Field>
              {t.capWaived && <Field label="Waiver note">{t.capWaiverNote ?? "None"}</Field>}
              <Field label="API calls today">
                <span className="tabular-nums">
                  {t.apiCallsToday.toLocaleString()} /{" "}
                  {t.apiDailyLimit === null ? "∞" : t.apiDailyLimit.toLocaleString()}
                </span>
              </Field>
            </DetailGrid>
          </DetailCard>

          <DetailCard title="Billing">
            <DetailGrid>
              <Field label="Subscription status">{t.subscriptionStatus ?? "None"}</Field>
              <Field label="Stripe customer">
                <span className="font-mono text-xs">{t.stripeCustomerId ?? "None"}</span>
              </Field>
              <Field label="Stripe subscription">
                <span className="font-mono text-xs">{t.stripeSubscriptionId ?? "None"}</span>
              </Field>
            </DetailGrid>
          </DetailCard>

          <DetailCard title={`Courses (${t.courses.length})`}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Handle</TableHead>
                  <TableHead>SCORM</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Shared</TableHead>
                  <TableHead>Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {t.courses.length === 0 && <TableStateRow colSpan={7}>No courses</TableStateRow>}
                {t.courses.map((c) => (
                  <TableRow key={c.courseKey}>
                    <TableCell>{c.courseTitle}</TableCell>
                    <TableCell className="font-mono text-xs">{c.courseSlug}</TableCell>
                    <TableCell>{c.scormVersion}</TableCell>
                    <TableCell>{formatSize(c.sizeInKb)}</TableCell>
                    <TableCell>
                      <Badge variant={c.isActive ? "success" : "secondary"}>
                        {c.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.isShared ? "success" : "secondary"}>
                        {c.isShared ? "Shared" : "Private"}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(c.uploadedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DetailCard>

          <AccountsCard tenantKey={String(t.tenantKey)} />

          <OperatorTenantSamlCard tenantKey={String(t.tenantKey)} />

          {(t.canRestart || t.canDelete || t.canSuspend) && (
            <section className="overflow-hidden rounded-xl border border-red-300 dark:border-red-900">
              <h2 className="bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:bg-red-950/40 dark:text-red-200">
                Danger zone
              </h2>
              {t.canSuspend && (
                <div className="bg-card flex flex-wrap items-center justify-between gap-4 p-4">
                  <p className="text-muted-foreground max-w-xl text-sm">
                    {t.suspendedAt
                      ? "Unsuspend restores sign-ins, API keys, launches, and course content at once. Sessions resume without a fresh sign-in."
                      : "Suspend refuses every sign-in, API key, invitation link, launch, and course asset of this tenant immediately. Reversible at any time; nothing is deleted."}
                  </p>
                  {t.suspendedAt ? (
                    <Button
                      variant="outline"
                      disabled={unsuspend.isPending}
                      onClick={() => unsuspend.mutate()}
                    >
                      {unsuspend.isPending ? "Unsuspending…" : "Unsuspend tenant"}
                    </Button>
                  ) : (
                    <Button variant="destructive" onClick={() => setSuspendOpen(true)}>
                      Suspend tenant
                    </Button>
                  )}
                </div>
              )}
              {t.canRestart && (
                <div className="border-border bg-card flex flex-wrap items-center justify-between gap-4 border-t p-4 first:border-t-0">
                  <p className="text-muted-foreground max-w-xl text-sm">
                    Restart resets every enrollment for every account in this tenant. Historical
                    activity records are kept. This cannot be undone.
                  </p>
                  <Button variant="destructive" onClick={() => setRestartOpen(true)}>
                    Restart tenant
                  </Button>
                </div>
              )}
              {t.canDelete && (
                <div className="border-border bg-card flex flex-wrap items-center justify-between gap-4 border-t p-4">
                  <p className="text-muted-foreground max-w-xl text-sm">
                    Delete permanently removes this tenant and every account, course, and progress
                    record it owns. For cleaning up spam or spurious tenants. This cannot be undone.
                  </p>
                  <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                    Delete tenant
                  </Button>
                </div>
              )}
            </section>
          )}

          {form && (
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit tenant</DialogTitle>
                  <DialogDescription>Changes apply immediately.</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <div>
                    <label htmlFor="edit-tenant-name" className="mb-1.5 block text-sm font-medium">
                      Name
                    </label>
                    <Input
                      id="edit-tenant-name"
                      type="text"
                      autoComplete="off"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="edit-tenant-handle"
                      className="mb-1.5 block text-sm font-medium"
                    >
                      Handle
                    </label>
                    <Input
                      id="edit-tenant-handle"
                      type="text"
                      autoComplete="off"
                      value={form.handle}
                      onChange={(e) => setForm({ ...form, handle: e.target.value })}
                      className="font-mono"
                    />
                    {handleChanged && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                        Changing the handle breaks every account&apos;s login in this tenant. Logins
                        use the handle/email composite and are not rewritten automatically. Only
                        change the handle if you will also rewrite the affected logins.
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="edit-tenant-referral"
                      className="mb-1.5 block text-sm font-medium"
                    >
                      Referral
                    </label>
                    <Input
                      id="edit-tenant-referral"
                      type="text"
                      autoComplete="off"
                      value={form.referral}
                      onChange={(e) => setForm({ ...form, referral: e.target.value })}
                    />
                  </div>
                  <div>
                    <span className="mb-1.5 block text-sm font-medium">Plan</span>
                    <SelectControl
                      value={form.tenantType}
                      onChange={(next) => setForm({ ...form, tenantType: next })}
                      label="Plan"
                      disabled={subscriptionActive}
                    >
                      {t?.tenantType === "Custom" && <option value="Custom">Custom</option>}
                      {PLANS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </SelectControl>
                    <p className="text-muted-foreground mt-1.5 text-xs">
                      {subscriptionActive
                        ? "This tenant has an active Stripe subscription. Change its plan through Stripe; a console edit would be overwritten by the next webhook."
                        : "Sets the plan and both limits from the catalog. Stripe is untouched. A lower plan on a tenant already over its new limits blocks the next addition, not existing courses or accounts."}
                    </p>
                  </div>
                  {/* The waiver is deliberately not a plan change. Moving the
                      tenant to Custom or raising its limits by hand would be
                      undone by the next subscription webhook, which rewrites
                      the tier and both limits from the catalog. */}
                  <div className="border-border border-t pt-4">
                    <label className="flex items-start gap-2.5 text-sm font-medium">
                      <input
                        id="edit-tenant-cap-waived"
                        type="checkbox"
                        checked={form.capWaived}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            capWaived: e.target.checked,
                            capWaiverNote: e.target.checked ? form.capWaiverNote : "",
                          })
                        }
                        className="mt-0.5"
                      />
                      Allow this tenant to exceed its course and user limits
                    </label>
                    <p className="text-muted-foreground mt-1.5 text-xs">
                      The plan, its limits, and the subscription are unchanged, so billing is
                      unaffected. The tenant keeps its tier and is not charged for the excess.
                    </p>
                  </div>
                  {form.capWaived && (
                    <div>
                      <label
                        htmlFor="edit-tenant-cap-waiver-note"
                        className="mb-1.5 block text-sm font-medium"
                      >
                        Waiver note
                      </label>
                      <Input
                        id="edit-tenant-cap-waiver-note"
                        type="text"
                        autoComplete="off"
                        maxLength={200}
                        placeholder="Why this tenant may exceed its limits, and who approved it"
                        value={form.capWaiverNote}
                        onChange={(e) => setForm({ ...form, capWaiverNote: e.target.value })}
                      />
                      <p className="text-muted-foreground mt-1 text-xs">
                        Cleared when the waiver is lifted
                      </p>
                    </div>
                  )}
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

          <Dialog
            open={suspendOpen}
            onOpenChange={(open) => {
              setSuspendOpen(open);
              if (!open) setSuspendNote("");
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Suspend tenant {t.tenantName}?</DialogTitle>
                <DialogDescription>
                  Every sign-in, API key, invitation link, launch, and course asset of this tenant
                  is refused from now until you unsuspend it. Nothing is deleted.
                </DialogDescription>
              </DialogHeader>
              <div>
                <label htmlFor="suspend-note" className="mb-1.5 block text-sm font-medium">
                  Note (optional, operators only)
                </label>
                <Input
                  id="suspend-note"
                  type="text"
                  autoComplete="off"
                  maxLength={200}
                  value={suspendNote}
                  onChange={(e) => setSuspendNote(e.target.value)}
                />
              </div>
              {suspend.isError && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  Suspend failed. Your connection may not be whitelisted for this command.
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setSuspendOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={suspend.isPending}
                  onClick={() => suspend.mutate(suspendNote)}
                >
                  {suspend.isPending ? "Suspending…" : "Suspend tenant"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={restartOpen}
            onOpenChange={(open) => {
              setRestartOpen(open);
              if (!open) setConfirmHandle("");
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Restart tenant {t.tenantName}?</DialogTitle>
                <DialogDescription>
                  This resets every enrollment for every account in this tenant. Historical activity
                  records are kept. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div>
                <label htmlFor="confirm-handle" className="mb-1.5 block text-sm font-medium">
                  Type <span className="font-mono">{t.tenantHandle}</span> to confirm
                </label>
                <input
                  id="confirm-handle"
                  type="text"
                  autoComplete="off"
                  value={confirmHandle}
                  onChange={(e) => setConfirmHandle(e.target.value)}
                  className="border-border bg-background text-foreground block w-full rounded-lg border px-3 py-2 font-mono text-sm focus:border-red-600 focus:outline-none"
                />
              </div>
              {restart.isError && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  Restart failed. Your connection may not be whitelisted for this command.
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setRestartOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={confirmHandle !== t.tenantHandle || restart.isPending}
                  onClick={() => restart.mutate()}
                >
                  {restart.isPending ? "Restarting…" : "Restart tenant"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={deleteOpen}
            onOpenChange={(open) => {
              setDeleteOpen(open);
              if (!open) setDeleteConfirmHandle("");
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete tenant {t.tenantName}?</DialogTitle>
                <DialogDescription>
                  This permanently removes the tenant and every account, course, and progress record
                  it owns, including audit ledgers. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div>
                <label htmlFor="delete-confirm-handle" className="mb-1.5 block text-sm font-medium">
                  Type <span className="font-mono">{t.tenantHandle}</span> to confirm
                </label>
                <input
                  id="delete-confirm-handle"
                  type="text"
                  autoComplete="off"
                  value={deleteConfirmHandle}
                  onChange={(e) => setDeleteConfirmHandle(e.target.value)}
                  className="border-border bg-background text-foreground block w-full rounded-lg border px-3 py-2 font-mono text-sm focus:border-red-600 focus:outline-none"
                />
              </div>
              {del.isError && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  Delete failed. Your connection may not be whitelisted for this command.
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={deleteConfirmHandle !== t.tenantHandle || del.isPending}
                  onClick={() => del.mutate()}
                >
                  {del.isPending ? "Deleting…" : "Delete tenant"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </AppShell>
  );
}
