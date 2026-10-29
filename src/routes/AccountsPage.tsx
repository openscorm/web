import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import type { ProblemResponse, PublicConfig } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui/page-header";
import { TablePager } from "@/components/TablePager";
import { TableStateRow } from "@/components/TableStateRow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/Table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LearnerImportCard } from "@/components/LearnerImportCard";
import { AssignCoursesDialog, type AssignTarget } from "@/components/AssignCoursesDialog";

interface AccountRow {
  accountKey: number;
  email: string;
  name: string;
  isActive: boolean;
  isManager: boolean;
  isLearner: boolean;
  isOperator: boolean;
  createdAt: string;
}

// The roster is paged and searchable server-side, the same
// shape as the reports list, so a 5,000-account tenant (the load-test fixture)
// or a 300,000-account one renders one page at a time.
interface AccountPage {
  items: AccountRow[];
  total: number;
  // The learners among total: what "select all matching" assigns to, since a
  // course is never assigned to a manager-only account.
  learnerTotal: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 50;

const createSchema = z
  .object({
    name: z.string().min(1, "Name is required.").max(80),
    email: z.string().min(1, "Email is required.").email("Enter a valid email."),
    isManager: z.boolean(),
    isLearner: z.boolean(),
  })
  .refine((v) => v.isManager || v.isLearner, {
    path: ["isLearner"],
    message: "Pick at least one role.",
  });

type CreateFormValues = z.infer<typeof createSchema>;

export function AccountsPage() {
  const { user } = useAuth();
  const tenantKey = user?.tenantKey;
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  // The account action awaiting confirmation; null when the dialog is closed.
  // Both live in one slot because only one dialog can be open at a time.
  const [pendingAction, setPendingAction] = useState<{
    kind: "restart" | "deactivate";
    accountKey: number;
    name: string;
  } | null>(null);

  // Learners picked for an assignment. The picks survive paging, and
  // allMatching widens them to every learner the current search matches,
  // which the server resolves. A new search clears both, since the rows they
  // were picked from are gone.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);

  // Search is part of the key so a change refetches, and it resets the page:
  // holding page 7 while narrowing to 3 results would show an empty table.
  const list = useQuery({
    queryKey: ["tenants", tenantKey, "users", search, page],
    queryFn: async () => {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search.trim()) qs.set("search", search.trim());
      return api<AccountPage>(`/api/tenants/${tenantKey}/accounts?${qs}`);
    },
    enabled: !!tenantKey,
    placeholderData: (previous) => previous,
  });

  // The import is dark behind a server flag; the card appears when it is on.
  const config = useQuery({
    queryKey: ["public-config"],
    queryFn: () => api<PublicConfig>("/api/public/config"),
    staleTime: Infinity,
  });

  const { register, handleSubmit, reset, formState } = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", email: "", isManager: false, isLearner: true },
  });

  const create = useMutation({
    mutationFn: async (values: CreateFormValues) =>
      api<AccountRow>(`/api/tenants/${tenantKey}/accounts`, {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: async () => {
      setServerError(null);
      reset();
      await qc.invalidateQueries({ queryKey: ["tenants", tenantKey, "users"] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.problem) {
        const p = err.problem as ProblemResponse;
        setServerError(p.detail ?? p.title ?? "Create failed.");
      } else {
        setServerError("Create failed.");
      }
    },
  });

  const deactivate = useMutation({
    mutationFn: async (accountKey: number) =>
      api<void>(`/api/tenants/${tenantKey}/accounts/${accountKey}`, { method: "DELETE" }),
    onSuccess: async () => {
      setPendingAction(null);
      await qc.invalidateQueries({ queryKey: ["tenants", tenantKey, "users"] });
    },
  });

  const restart = useMutation({
    mutationFn: async (accountKey: number) =>
      api<void>(`/api/tenants/${tenantKey}/accounts/${accountKey}/restart`, { method: "POST" }),
    onSuccess: async () => {
      setPendingAction(null);
      await qc.invalidateQueries({ queryKey: ["tenants", tenantKey, "users"] });
    },
  });

  const pageLearners = (list.data?.items ?? []).filter((u) => u.isLearner);
  const learnerTotal = list.data?.learnerTotal ?? 0;
  const pageAllSelected =
    pageLearners.length > 0 && pageLearners.every((u) => allMatching || selected.has(u.accountKey));
  const selectedCount = allMatching ? learnerTotal : selected.size;

  function clearSelection() {
    setSelected(new Set());
    setAllMatching(false);
  }

  function toggleRow(accountKey: number) {
    // Unticking one row out of "all matching" falls back to this page's
    // learners less that one: the other pages' rows cannot be listed here.
    if (allMatching) {
      setAllMatching(false);
      setSelected(
        new Set(pageLearners.map((u) => u.accountKey).filter((key) => key !== accountKey)),
      );
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(accountKey)) next.delete(accountKey);
      else next.add(accountKey);
      return next;
    });
  }

  function togglePage() {
    if (pageAllSelected) {
      if (allMatching) {
        clearSelection();
        return;
      }
      setSelected((prev) => {
        const next = new Set(prev);
        pageLearners.forEach((u) => next.delete(u.accountKey));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        pageLearners.forEach((u) => next.add(u.accountKey));
        return next;
      });
    }
  }

  function openAssign() {
    setAssignTarget(
      allMatching
        ? { kind: "search", search: search.trim(), learnerCount: learnerTotal }
        : { kind: "accounts", accountKeys: [...selected] },
    );
  }

  return (
    <AppShell align="left">
      <PageHeader
        className="mb-6"
        title="Accounts"
        subtitle="Manage learners and managers for your tenant."
        restricted={[
          "Manager or operator access only. Learners are redirected to the library.",
          "The /accounts route is wrapped in RequireManager.",
          <>
            Enforced server-side by the{" "}
            <code className="font-mono">/api/tenants/&#123;tenantKey&#125;/accounts</code>{" "}
            endpoints, which return 403 for learners and for accounts outside the tenant (operators
            exempt).
          </>,
        ]}
      />

      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-lg font-semibold">Add account</h2>
        {serverError && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            {serverError}
          </div>
        )}
        <form
          onSubmit={handleSubmit((v) => create.mutate(v))}
          noValidate
          className="grid gap-4 sm:grid-cols-2"
        >
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
              Name
            </label>
            <Input id="name" type="text" autoComplete="off" {...register("name")} />
            {formState.errors.name && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {formState.errors.name.message}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
              Email
            </label>
            <Input id="email" type="email" autoComplete="off" {...register("email")} />
            {formState.errors.email && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {formState.errors.email.message}
              </p>
            )}
          </div>
          <div className="flex items-center gap-4 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register("isManager")} /> Manager
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register("isLearner")} /> Learner
            </label>
            {formState.errors.isLearner && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {formState.errors.isLearner.message}
              </p>
            )}
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create account"}
            </Button>
          </div>
        </form>
      </Card>

      {config.data?.bulkImport && tenantKey && <LearnerImportCard tenantKey={tenantKey} />}

      <Card className="overflow-hidden">
        <div className="border-border flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <label htmlFor="account-search" className="sr-only">
            Search accounts
          </label>
          <Input
            id="account-search"
            type="search"
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
              clearSelection();
            }}
            className="max-w-sm"
          />
          {selectedCount > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-muted-foreground text-sm">
                {selectedCount.toLocaleString()} selected
              </span>
              <Button type="button" variant="outline" onClick={clearSelection}>
                Clear
              </Button>
              <Button type="button" onClick={openAssign}>
                Assign courses
              </Button>
            </div>
          )}
        </div>
        {pageAllSelected && learnerTotal > pageLearners.length && (
          <div className="bg-muted border-border border-b px-4 py-2 text-sm">
            {allMatching ? (
              <>
                All {learnerTotal.toLocaleString()} learners
                {search.trim() ? ` matching "${search.trim()}"` : ""} are selected.{" "}
                <button
                  type="button"
                  className="text-link hover:underline"
                  onClick={clearSelection}
                >
                  Clear selection
                </button>
              </>
            ) : (
              <>
                All {pageLearners.length} learners on this page are selected.{" "}
                <button
                  type="button"
                  className="text-link hover:underline"
                  onClick={() => setAllMatching(true)}
                >
                  Select all {learnerTotal.toLocaleString()} learners
                  {search.trim() ? ` matching "${search.trim()}"` : ""}
                </button>
              </>
            )}
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select every learner on this page"
                  checked={pageAllSelected}
                  disabled={pageLearners.length === 0}
                  onChange={togglePage}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && <TableStateRow colSpan={5}>Loading…</TableStateRow>}
            {list.data?.total === 0 && (
              <TableStateRow colSpan={5}>
                {search.trim() ? "No accounts match" : "No accounts yet"}
              </TableStateRow>
            )}
            {list.data?.items.map((u) => (
              <TableRow key={u.accountKey}>
                <TableCell>
                  {u.isLearner && (
                    <input
                      type="checkbox"
                      aria-label={`Select ${u.name}`}
                      checked={allMatching || selected.has(u.accountKey)}
                      onChange={() => toggleRow(u.accountKey)}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <Link to={`/accounts/${u.accountKey}`} className="text-link hover:underline">
                    {u.name}
                  </Link>
                </TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <span className="flex flex-wrap gap-1">
                    {u.isOperator && <Badge variant="success">Operator</Badge>}
                    {u.isManager && <Badge>Manager</Badge>}
                    {u.isLearner && <Badge variant="secondary">Learner</Badge>}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Actions for ${u.name}`}
                      className="hover:bg-muted text-muted-foreground hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-lg"
                    >
                      <i className="fa-sharp fa-regular fa-ellipsis" aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to={`/accounts/${u.accountKey}`}>View details</Link>
                      </DropdownMenuItem>
                      {u.isLearner && (
                        <DropdownMenuItem
                          onSelect={() =>
                            setAssignTarget({
                              kind: "accounts",
                              accountKeys: [u.accountKey],
                              name: u.name,
                            })
                          }
                        >
                          Assign courses
                        </DropdownMenuItem>
                      )}
                      {u.isLearner && (
                        <DropdownMenuItem
                          onSelect={() =>
                            setPendingAction({
                              kind: "restart",
                              accountKey: u.accountKey,
                              name: u.name,
                            })
                          }
                        >
                          Restart progress
                        </DropdownMenuItem>
                      )}
                      {!u.isOperator && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600 dark:text-red-400"
                            onSelect={() =>
                              setPendingAction({
                                kind: "deactivate",
                                accountKey: u.accountKey,
                                name: u.name,
                              })
                            }
                          >
                            Deactivate
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePager
          page={list.data?.page ?? page}
          pageSize={list.data?.pageSize ?? PAGE_SIZE}
          total={list.data?.total ?? 0}
          onPageChange={setPage}
        />
      </Card>

      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        title={
          pendingAction?.kind === "restart"
            ? `Reset progress for ${pendingAction.name}?`
            : `Deactivate ${pendingAction?.name ?? ""}?`
        }
        description={
          pendingAction?.kind === "restart"
            ? "This resets their progress in every course. Historical activity records are kept."
            : "They will no longer be able to sign in. Their records are kept."
        }
        confirmLabel={pendingAction?.kind === "restart" ? "Reset progress" : "Deactivate account"}
        busyLabel={pendingAction?.kind === "restart" ? "Resetting…" : "Deactivating…"}
        busy={pendingAction?.kind === "restart" ? restart.isPending : deactivate.isPending}
        onConfirm={() => {
          if (!pendingAction) return;
          if (pendingAction.kind === "restart") restart.mutate(pendingAction.accountKey);
          else deactivate.mutate(pendingAction.accountKey);
        }}
      />

      {tenantKey !== undefined && (
        <AssignCoursesDialog
          tenantKey={tenantKey}
          target={assignTarget}
          onAssigned={() => {
            // A finished assignment from the selection drops the picks; one
            // from a row's menu leaves the selection as it was.
            if (assignTarget?.kind === "search" || assignTarget?.name === undefined)
              clearSelection();
          }}
          onClose={() => setAssignTarget(null)}
        />
      )}
    </AppShell>
  );
}
