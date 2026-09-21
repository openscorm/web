import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { ACCOUNT_PAGE_SIZE, roleLabel } from "@/lib/accounts";
import type { AccountsResponse } from "@/lib/accounts";
import { formatDate } from "@/lib/dates";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { TablePager } from "@/components/TablePager";
import { SearchInput } from "@/components/SearchInput";
import { TableStateRow } from "@/components/TableStateRow";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function OperatorAccountsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  // Debounce keystrokes so each pause of 300 ms issues one request; applying
  // the filter jumps back to page 1 since the old offset is meaningless.
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const searchParam = appliedSearch ? `&search=${encodeURIComponent(appliedSearch)}` : "";

  const list = useQuery({
    queryKey: ["operator", "accounts", page, appliedSearch],
    queryFn: async () =>
      api<AccountsResponse>(
        `/api/operator/accounts?page=${page}&page_size=${ACCOUNT_PAGE_SIZE}${searchParam}`,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <AppShell align="left">
      <PageHeader
        title="Operator: Accounts"
        subtitle="All accounts across all tenants"
        restricted={[
          "Operator access only. Your account must have the operator role.",
          "The /operator/accounts route is wrapped in RequireOperator; non-operators are redirected to their dashboard or library.",
          <>
            Enforced server-side by <code className="font-mono">GET /api/operator/accounts</code>,
            which returns 403 for non-operators.
          </>,
        ]}
      />

      <div className="mb-4">
        <SearchInput
          id="account-filter"
          label="Filter accounts"
          placeholder="Filter accounts by name, email, or tenant"
          value={search}
          onChange={setSearch}
        />
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last sign-in</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && <TableStateRow colSpan={7}>Loading…</TableStateRow>}
            {list.data && list.data.accounts.length === 0 && (
              <TableStateRow colSpan={7}>No accounts match the filter</TableStateRow>
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
                <TableCell className="font-mono text-xs">{a.tenantHandle}</TableCell>
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
      </Card>
    </AppShell>
  );
}
