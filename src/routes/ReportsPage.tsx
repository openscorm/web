import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api, ApiError, download } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import type { ProblemResponse } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { TablePager } from "@/components/TablePager";
import { StatusBadge } from "@/components/StatusBadge";
import type { RecordRow } from "@/lib/records";
import { STATUS_OPTIONS } from "@/lib/records";

interface RecordsResponse {
  page: number;
  pageSize: number;
  total: number;
  records: RecordRow[];
}

interface CourseOption {
  courseKey: number;
  title: string;
  courseSlug: string;
  sourceType: string | null;
}

interface ClientOption {
  clientKey: number;
  clientName: string;
}

const PAGE_SIZE = 20;

export function ReportsPage() {
  const { user } = useAuth();
  const tenantKey = user?.tenantKey;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [courseKey, setCourseKey] = useState("");
  const [clientKey, setClientKey] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Filters are part of the key so a change refetches, and reset the page:
  // holding page 7 while narrowing to 3 results would show an empty table.
  const filters = { search, courseKey, clientKey, status, from, to };

  const query = buildQuery({ ...filters, page, pageSize: PAGE_SIZE });

  const list = useQuery({
    queryKey: ["tenants", tenantKey, "reports", "records", filters, page],
    queryFn: async () => api<RecordsResponse>(`/api/tenants/${tenantKey}/reports/records?${query}`),
    enabled: !!tenantKey,
    placeholderData: keepPreviousData,
  });

  const courses = useQuery({
    queryKey: ["tenants", tenantKey, "courses"],
    queryFn: async () => api<CourseOption[]>(`/api/tenants/${tenantKey}/courses`),
    enabled: !!tenantKey,
  });

  const clients = useQuery({
    queryKey: ["tenants", tenantKey, "clients"],
    queryFn: async () => api<ClientOption[]>(`/api/tenants/${tenantKey}/clients`),
    enabled: !!tenantKey,
  });

  // Dispatch is invisible on this page until the tenant actually uses it:
  // the client filter and column appear only once a client org exists.
  const hasClients = (clients.data?.length ?? 0) > 0;

  // Following the hasClients rule above: the version column
  // appears once the tenant has a policy document and not before, so tenants
  // who only ever upload packages do not get a permanently empty column.
  //
  // Derived from the course list rather than from the visible rows on purpose.
  // Rows are one page of results, so a tenant with documents on page 1 and none
  // on page 2 would watch the column appear and disappear as they paged.
  const hasDocuments = (courses.data ?? []).some((c) => c.sourceType === "pdf");
  const columnCount = 6 + (hasClients ? 1 : 0) + (hasDocuments ? 1 : 0);

  function applyFilter(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(1);
    };
  }

  async function onDownload() {
    setDownloadError(null);
    setDownloading(true);
    try {
      // Export follows the filters on screen, minus paging: what you see is
      // what you get, for every row rather than the current page.
      const exportQuery = buildQuery(filters);
      await download(
        `/api/tenants/${tenantKey}/reports/records.csv?${exportQuery}`,
        "learner-records.csv",
      );
    } catch (err) {
      const message =
        err instanceof ApiError && err.problem
          ? ((err.problem as ProblemResponse).detail ??
            (err.problem as ProblemResponse).title ??
            "Download failed.")
          : "Download failed.";
      setDownloadError(message);
    } finally {
      setDownloading(false);
    }
  }

  const rows = list.data?.records ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Reports"
        subtitle="Search learner records and download them as CSV"
        restricted={[
          "Manager or operator access only. Learners cannot report on other learners.",
          "The /reports route is wrapped in RequireManager.",
          <>
            Enforced server-side by the{" "}
            <code className="font-mono">/api/tenants/&#123;tenantKey&#125;/reports</code> endpoints,
            which scope every row to your own tenant's learners and return 403 for learners and for
            accounts outside the tenant (operators exempt).
          </>,
        ]}
      />

      <div className="border-border bg-card text-card-foreground mb-6 rounded-xl border p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="search" className="mb-1.5 block text-sm font-medium">
              Search
            </label>
            <input
              id="search"
              type="search"
              placeholder="Learner or course"
              value={search}
              onChange={(e) => applyFilter(setSearch)(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="course" className="mb-1.5 block text-sm font-medium">
              Course
            </label>
            <select
              id="course"
              value={courseKey}
              onChange={(e) => applyFilter(setCourseKey)(e.target.value)}
              className={inputClass}
            >
              <option value="">All courses</option>
              {courses.data?.map((c) => (
                <option key={c.courseKey} value={c.courseKey}>
                  {c.title || c.courseSlug}
                </option>
              ))}
            </select>
          </div>
          {hasClients && (
            <div>
              <label htmlFor="client" className="mb-1.5 block text-sm font-medium">
                Client organization
              </label>
              <select
                id="client"
                value={clientKey}
                onChange={(e) => applyFilter(setClientKey)(e.target.value)}
                className={inputClass}
              >
                <option value="">All clients</option>
                {clients.data?.map((c) => (
                  <option key={c.clientKey} value={c.clientKey}>
                    {c.clientName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="status" className="mb-1.5 block text-sm font-medium">
              Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => applyFilter(setStatus)(e.target.value)}
              className={inputClass}
            >
              <option value="">Any status</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="from" className="mb-1.5 block text-sm font-medium">
              Active from
            </label>
            <input
              id="from"
              type="date"
              value={from}
              onChange={(e) => applyFilter(setFrom)(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="to" className="mb-1.5 block text-sm font-medium">
              Active to
            </label>
            <input
              id="to"
              type="date"
              value={to}
              onChange={(e) => applyFilter(setTo)(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={onDownload}
              disabled={downloading || list.isLoading}
              className={primaryBtn}
            >
              {downloading ? "Preparing…" : "Download CSV"}
            </button>
          </div>
        </div>

        {downloadError && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            {downloadError}
          </div>
        )}
      </div>

      <div className="border-border bg-card text-card-foreground overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Learner</th>
                <th className="px-4 py-3 font-medium">Course</th>
                {hasDocuments && <th className="px-4 py-3 font-medium">Version</th>}
                {hasClients && <th className="px-4 py-3 font-medium">Client</th>}
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Time spent</th>
                <th className="px-4 py-3 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading && (
                <tr>
                  <td colSpan={columnCount} className="text-muted-foreground px-4 py-6 text-center">
                    Loading…
                  </td>
                </tr>
              )}
              {!list.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={columnCount} className="text-muted-foreground px-4 py-6 text-center">
                    No records match these filters
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.enrollmentKey} className="border-border border-t">
                  <td className="px-4 py-3">
                    {r.accountKey != null ? (
                      <Link
                        to={`/reports/learners/${r.accountKey}`}
                        className="text-link hover:underline"
                      >
                        {r.learnerName}
                      </Link>
                    ) : (
                      // Dispatch registration: an external learner with no
                      // account, so no learner detail page exists.
                      <span>{r.learnerName || "External learner"}</span>
                    )}
                    <div className="text-muted-foreground/70 text-xs">{r.learnerEmail}</div>
                  </td>
                  <td className="px-4 py-3">{r.courseTitle || r.courseSlug}</td>
                  {hasDocuments && (
                    <td className="px-4 py-3 font-mono">{r.documentVersion ?? "—"}</td>
                  )}
                  {hasClients && <td className="px-4 py-3">{r.clientName ?? "—"}</td>}
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 font-mono">{r.score || "—"}</td>
                  <td className="px-4 py-3 font-mono">{r.duration || "—"}</td>
                  <td className="text-muted-foreground px-4 py-3 font-mono text-xs">
                    {formatDateTime(r.lastActivityAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePager
          page={list.data?.page ?? page}
          pageSize={list.data?.pageSize ?? PAGE_SIZE}
          total={list.data?.total ?? 0}
          onPageChange={setPage}
        />
      </div>
    </AppShell>
  );
}

function buildQuery(values: {
  search?: string;
  courseKey?: string;
  clientKey?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}): string {
  const params = new URLSearchParams();
  if (values.search) params.set("search", values.search);
  if (values.courseKey) params.set("course_key", values.courseKey);
  if (values.clientKey) params.set("client_key", values.clientKey);
  if (values.status) params.set("status", values.status);
  if (values.from) params.set("from", values.from);
  // "Active to" reads as inclusive of that day, but the server compares with
  // "<" against a timestamp, so 2026-07-05 alone would drop that day's rows.
  // Send the next midnight instead.
  if (values.to) params.set("to", nextDay(values.to));
  if (values.page) params.set("page", String(values.page));
  if (values.pageSize) params.set("page_size", String(values.pageSize));
  return params.toString();
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const inputClass =
  "block w-full py-2.5 px-3 rounded-lg border border-[color:var(--color-input-border)] bg-background text-foreground text-[15px] focus:outline-none focus:border-primary focus:ring-2 focus:ring-[color:var(--color-input-focus-ring)] transition-colors";

const primaryBtn =
  "inline-flex items-center justify-center rounded-full py-2.5 px-6 font-semibold text-sm text-white bg-primary hover:bg-[color:var(--color-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
