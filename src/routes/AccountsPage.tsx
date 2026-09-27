import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { ProblemResponse, PublicConfig } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { TablePager } from "@/components/TablePager";
import { TableStateRow } from "@/components/TableStateRow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LearnerImportCard } from "@/components/LearnerImportCard";

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

  return (
    <AppShell align="left">
      <PageHeader
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
        <div className="border-border border-b px-4 py-3">
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
            }}
            className="max-w-sm"
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && <TableStateRow colSpan={4}>Loading…</TableStateRow>}
            {list.data?.total === 0 && (
              <TableStateRow colSpan={4}>
                {search.trim() ? "No accounts match" : "No accounts yet"}
              </TableStateRow>
            )}
            {list.data?.items.map((u) => (
              <TableRow key={u.accountKey}>
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
                      <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to={`/accounts/${u.accountKey}`}>View details</Link>
                      </DropdownMenuItem>
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
    </AppShell>
  );
}
