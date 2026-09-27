import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { TablePager } from "@/components/TablePager";
import { SearchInput } from "@/components/SearchInput";
import { SelectControl } from "@/components/SelectControl";
import { TableStateRow } from "@/components/TableStateRow";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface OperatorTenantSummary {
  tenantKey: number;
  tenantHandle: string;
  tenantName: string;
  tenantType: string;
  platformEdition: string;
  platformReferral: string | null;
  courseCount: number;
  courseLimit: number;
  userCount: number;
  userLimit: number;
  enrollmentCount: number;
  createdAt: string;
  // Null until anyone in the tenant has signed in or saved progress.
  lastActivityAt: string | null;
  storageKb: number;
  egressKb: number;
  // Keyed API calls this UTC day, and the operator off switch.
  apiCallsToday: number;
  suspendedAt: string | null;
}

interface OperatorTenantsResponse {
  page: number;
  pageSize: number;
  total: number;
  tenants: OperatorTenantSummary[];
}

const PAGE_SIZE = 20;
const ALL_EDITIONS = ["Commercial", "Community"];
const ALL_TYPES = ["Trial", "Mini", "Starter", "Small", "Medium", "Large", "Provider", "Custom"];
const SORTS = [
  ["created", "Sort: newest first"],
  ["name", "Sort: name"],
  ["activity", "Sort: last activity"],
  ["users", "Sort: most accounts"],
  ["courses", "Sort: most courses"],
  ["enrollments", "Sort: most enrollments"],
  ["storage", "Sort: most storage"],
  ["egress", "Sort: most egress"],
  ["api", "Sort: most API calls today"],
] as const;
type SortKey = (typeof SORTS)[number][0];

// KB to a short size: under a gigabyte in MB with one decimal, else GB.
function formatKb(kb: number): string {
  const mb = kb / 1024;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(1)} MB`;
}

export function OperatorTenantsPage() {
  const [page, setPage] = useState(1);
  const [editions, setEditions] = useState<string[]>(["Commercial"]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("created");
  const [type, setType] = useState("");

  // Debounce keystrokes so each pause of 300 ms issues one request; applying
  // the filter jumps back to page 1 since the old offset is meaningless.
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Omit the editions param when everything is checked so the default URL
  // stays clean; the API treats a missing param as "all editions".
  const editionsParam =
    editions.length === ALL_EDITIONS.length ? "" : `&editions=${editions.join(",")}`;
  const searchParam = appliedSearch ? `&search=${encodeURIComponent(appliedSearch)}` : "";
  const typeParam = type ? `&types=${type}` : "";

  const list = useQuery({
    queryKey: ["operator", "tenants", page, editions, type, appliedSearch, sort],
    queryFn: async () =>
      api<OperatorTenantsResponse>(
        `/api/operator/tenants?page=${page}&page_size=${PAGE_SIZE}&sort=${sort}${editionsParam}${typeParam}${searchParam}`,
      ),
    placeholderData: keepPreviousData,
  });

  function toggleEdition(edition: string) {
    setEditions((prev) =>
      prev.includes(edition) ? prev.filter((e) => e !== edition) : [...prev, edition],
    );
    setPage(1);
  }

  return (
    <AppShell align="left">
      <PageHeader
        title="Operator: Tenants"
        subtitle="Cross-tenant view"
        restricted={[
          "Operator access only. Your account must have the operator role.",
          "The /operator/tenants route is wrapped in RequireOperator; non-operators are redirected to their dashboard or library.",
          <>
            Enforced server-side by <code className="font-mono">GET /api/operator/tenants</code>,
            which returns 403 for non-operators.
          </>,
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <SearchInput
          id="tenant-filter"
          label="Filter tenants"
          placeholder="Filter tenants by name or handle"
          value={search}
          onChange={setSearch}
        />
        <span className="text-muted-foreground text-sm">Edition</span>
        {ALL_EDITIONS.map((edition) => (
          <label key={edition} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editions.includes(edition)}
              disabled={editions.length === 1 && editions.includes(edition)}
              onChange={() => toggleEdition(edition)}
            />
            {edition}
          </label>
        ))}
        <SelectControl
          value={type}
          onChange={(next) => {
            setType(next);
            setPage(1);
          }}
          label="Filter by plan"
          className="ml-auto min-w-[150px]"
        >
          <option value="">Plan: all</option>
          {ALL_TYPES.map((t) => (
            <option key={t} value={t}>
              Plan: {t}
            </option>
          ))}
        </SelectControl>
        <SelectControl
          value={sort}
          onChange={(next) => {
            setSort(next as SortKey);
            setPage(1);
          }}
          label="Sort tenants"
          className="min-w-[190px]"
        >
          {SORTS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectControl>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Handle</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Edition</TableHead>
              <TableHead>Referral</TableHead>
              <TableHead className="text-center">Courses</TableHead>
              <TableHead className="text-center">Accounts</TableHead>
              <TableHead className="text-right">Enrollments</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last activity</TableHead>
              <TableHead className="text-right">Storage</TableHead>
              <TableHead className="text-right">Egress est.</TableHead>
              <TableHead className="text-right">API today</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && <TableStateRow colSpan={13}>Loading…</TableStateRow>}
            {list.data && list.data.tenants.length === 0 && (
              <TableStateRow colSpan={13}>No tenants match the selected filter</TableStateRow>
            )}
            {list.data?.tenants.map((t) => (
              <TableRow key={t.tenantKey}>
                <TableCell>
                  <Link
                    to={`/operator/tenants/${t.tenantKey}`}
                    className="text-link hover:underline"
                  >
                    {t.tenantName}
                  </Link>
                  {t.suspendedAt && (
                    <Badge variant="warning" className="ml-2">
                      Suspended
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{t.tenantHandle}</TableCell>
                <TableCell>{t.tenantType}</TableCell>
                <TableCell>{t.platformEdition}</TableCell>
                <TableCell>{t.platformReferral ?? "-"}</TableCell>
                <TableCell>
                  <span className="mx-auto grid w-24 grid-cols-[1fr_auto_1fr] gap-1.5 whitespace-nowrap tabular-nums">
                    <span className="text-right">{t.courseCount}</span>
                    <span>/</span>
                    <span className="text-left">{t.courseLimit || "∞"}</span>
                  </span>
                </TableCell>
                <TableCell>
                  <span className="mx-auto grid w-24 grid-cols-[1fr_auto_1fr] gap-1.5 whitespace-nowrap tabular-nums">
                    <span className="text-right">{t.userCount}</span>
                    <span>/</span>
                    <span className="text-left">{t.userLimit || "∞"}</span>
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{t.enrollmentCount}</TableCell>
                <TableCell className="tabular-nums">{formatDate(t.createdAt)}</TableCell>
                <TableCell className="tabular-nums">{formatDate(t.lastActivityAt)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatKb(t.storageKb)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatKb(t.egressKb)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {t.apiCallsToday.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {list.data && (
          <TablePager
            page={page}
            pageSize={PAGE_SIZE}
            total={list.data.total}
            onPageChange={setPage}
          />
        )}
      </Card>
    </AppShell>
  );
}
