import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { api, ApiError, download } from "@/lib/api";
import { roleLabel } from "@/lib/accounts";
import { formatDate, formatDateTime } from "@/lib/dates";
import type { ProblemResponse } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { DetailCard, DetailGrid, Field } from "@/components/DetailCard";
import { PageLoading } from "@/components/PageLoading";
import { TableStateRow } from "@/components/TableStateRow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RecordRow } from "@/lib/records";

interface LearnerDetail {
  accountKey: number;
  accountId: string;
  name: string;
  email: string;
  isActive: boolean;
  isManager: boolean;
  isLearner: boolean;
  createdAt: string;
  authenticatedAt: string | null;
  records: RecordRow[];
}

export function LearnerDetailPage() {
  const { user } = useAuth();
  const tenantKey = user?.tenantKey;
  const { accountKey } = useParams<{ accountKey: string }>();

  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const detail = useQuery({
    queryKey: ["tenants", tenantKey, "reports", "learner", accountKey],
    queryFn: async () =>
      api<LearnerDetail>(`/api/tenants/${tenantKey}/reports/learners/${accountKey}`),
    enabled: !!tenantKey && !!accountKey,
    retry: false,
  });

  async function onDownload() {
    setDownloadError(null);
    setDownloading(true);
    try {
      await download(
        `/api/tenants/${tenantKey}/reports/records.csv?account_key=${accountKey}`,
        `learner-${accountKey}-records.csv`,
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

  if (detail.isLoading) {
    return (
      <AppShell align="left">
        <PageLoading />
      </AppShell>
    );
  }

  // A learner in another tenant is a 404, not a 403: the API resolves the
  // account inside the tenant first, so "not yours" and "does not exist" are
  // deliberately indistinguishable from here.
  if (detail.isError || !detail.data) {
    return (
      <AppShell align="left">
        <PageHeader title="Learner not found" subtitle="No such learner in your tenant" />
        <Link to="/reports" className="text-link text-sm hover:underline">
          Back to reports
        </Link>
      </AppShell>
    );
  }

  const learner = detail.data;

  return (
    <AppShell align="left">
      <PageHeader title={learner.name} subtitle={learner.email} />

      <div className="mb-6">
        <Link to="/reports" className="text-muted-foreground text-sm hover:underline">
          Back to reports
        </Link>
      </div>

      <DetailCard title="Learner" className="mb-6">
        <DetailGrid className="lg:grid-cols-4">
          <Field label="Account key">
            <span className="font-mono break-all">{learner.accountKey}</span>
          </Field>
          <Field label="Account id">
            <span className="font-mono break-all">{learner.accountId}</span>
          </Field>
          <Field label="Email">{learner.email}</Field>
          <Field label="Status">
            <Badge variant={learner.isActive ? "success" : "secondary"}>
              {learner.isActive ? "Active" : "Deactivated"}
            </Badge>
          </Field>
          <Field label="Roles">{roleLabel(learner)}</Field>
          <Field label="Created">
            <span className="font-mono">{formatDate(learner.createdAt)}</span>
          </Field>
          <Field label="Last sign-in">
            <span className="font-mono">{formatDateTime(learner.authenticatedAt)}</span>
          </Field>
          <Field label="Records">
            <span className="font-mono">{learner.records.length}</span>
          </Field>
        </DetailGrid>
      </DetailCard>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Learning records</h2>
        <Button
          type="button"
          onClick={onDownload}
          disabled={downloading || learner.records.length === 0}
        >
          {downloading ? "Preparing…" : "Download CSV"}
        </Button>
      </div>

      {downloadError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          {downloadError}
        </div>
      )}

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Course</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Time spent</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Last activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {learner.records.length === 0 && (
              <TableStateRow colSpan={6}>No learning records yet</TableStateRow>
            )}
            {learner.records.map((r) => (
              <TableRow key={r.enrollmentKey}>
                <TableCell>
                  <Link to={`/courses/${r.courseKey}`} className="text-link hover:underline">
                    {r.courseTitle || r.courseSlug}
                  </Link>
                  <div className="text-muted-foreground/70 font-mono text-xs">{r.courseSlug}</div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell className="font-mono">{r.score || "—"}</TableCell>
                <TableCell className="font-mono">{r.duration || "—"}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {formatDate(r.startedAt)}
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {formatDateTime(r.lastActivityAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </AppShell>
  );
}
