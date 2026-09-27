import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/dates";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { TableStateRow } from "@/components/TableStateRow";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// The active-learner meter across tenants, for operators only,
// before any customer sees it: the proof the launch ledger is filling, and the
// list the dated over-cap notice is sent from.

type MeterState = "unlimited" | "under" | "near" | "over" | "sustained";

interface OperatorMeterTenant {
  tenantKey: number;
  tenantHandle: string;
  tenantName: string;
  plan: string;
  platformEdition: string | null;
  isTest: boolean;
  periodAnchor: "subscription" | "created";
  periodStartsAt: string;
  periodResetsAt: string;
  current: number;
  previous: number;
  limit: number | null;
  state: MeterState;
  fittingTier: string | null;
  aboveTopTier: boolean;
  pendingMove: OperatorMeterPendingMove | null;
}

// The dated notice a tenant is holding. Always null while
// Meter:RenewalAtFit is off, since nothing proposes a move until the sweep runs.
interface OperatorMeterPendingMove {
  toTier: string;
  proposedAt: string;
  executesAfter: string;
  basisPeriodStart: string;
  basisLearners: number;
  learnerLimit: number;
}

interface OperatorMeterReportResponse {
  asOf: string;
  ledgerRows: number;
  lastRecordedLaunchAt: string | null;
  pendingMoves: number;
  tenants: OperatorMeterTenant[];
}

const stateBadge: Record<MeterState, { label: string; variant: BadgeProps["variant"] }> = {
  sustained: { label: "Sustained", variant: "danger" },
  over: { label: "Over", variant: "warning" },
  near: { label: "Near", variant: "secondary" },
  under: { label: "Under", variant: "outline" },
  unlimited: { label: "Unlimited", variant: "outline" },
};

function fitLabel(t: OperatorMeterTenant): string {
  if (t.aboveTopTier) return "Above top tier";
  return t.fittingTier ?? "-";
}

export function OperatorMeterReportPage() {
  const [all, setAll] = useState(false);

  const report = useQuery({
    queryKey: ["operator", "reports", "meter", all],
    queryFn: async () =>
      api<OperatorMeterReportResponse>(`/api/operator/reports/meter${all ? "?all=true" : ""}`),
    placeholderData: keepPreviousData,
  });

  const rows = report.data?.tenants ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Operator: Active-learner meter"
        subtitle="Learners who launched a course this billing period and last, against each tenant's cap"
        restricted={[
          "Operator access only. Your account must have the operator role.",
          "The /operator/reports/meter route is wrapped in RequireOperator; non-operators are redirected to their dashboard or library.",
          <>
            Enforced server-side by{" "}
            <code className="font-mono">GET /api/operator/reports/meter</code>, which returns 403
            for non-operators.
          </>,
        ]}
      />

      <p className="mb-4">
        <Link to="/operator/dashboard" className="text-link text-sm hover:underline">
          Back to dashboard
        </Link>
      </p>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          Include tenants with no learners in either period
        </label>
        {report.data && (
          <p className="text-muted-foreground text-sm">
            {report.data.ledgerRows} {report.data.ledgerRows === 1 ? "launch" : "launches"}{" "}
            recorded, last {formatDateTime(report.data.lastRecordedLaunchAt)}
            {report.data.pendingMoves > 0 &&
              `, ${report.data.pendingMoves} renewal ${report.data.pendingMoves === 1 ? "move" : "moves"} pending`}
          </p>
        )}
      </div>

      <p className="text-muted-foreground/70 mb-4 text-xs">
        Nothing here is shown to customers or enforced yet. A hosted learner counts once per period;
        each dispatch registration counts separately. A learner who launched in a period still
        counts for it after being deactivated or archived; only a no-tracking (test) registration
        never counts.
      </p>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead>Handle</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="text-right">This period</TableHead>
              <TableHead className="text-right">Last period</TableHead>
              <TableHead className="text-right">Cap</TableHead>
              <TableHead>Fits</TableHead>
              <TableHead>Pending move</TableHead>
              <TableHead>Resets</TableHead>
              <TableHead>Anchor</TableHead>
              <TableHead>History</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.isLoading && <TableStateRow colSpan={12}>Loading…</TableStateRow>}
            {report.isError && (
              <TableStateRow colSpan={12} tone="danger">
                Failed to load the meter report
              </TableStateRow>
            )}
            {report.data && rows.length === 0 && (
              <TableStateRow colSpan={12}>No learners launched in either period</TableStateRow>
            )}
            {rows.map((t) => (
              <TableRow key={t.tenantKey}>
                <TableCell>
                  <Link
                    to={`/operator/tenants/${t.tenantKey}`}
                    className="text-link hover:underline"
                  >
                    {t.tenantName}
                  </Link>
                  {t.isTest && (
                    <Badge variant="secondary" className="ml-2">
                      Test
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{t.tenantHandle}</TableCell>
                <TableCell>{t.plan}</TableCell>
                <TableCell>
                  <Badge variant={stateBadge[t.state].variant}>{stateBadge[t.state].label}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{t.current}</TableCell>
                <TableCell className="text-right tabular-nums">{t.previous}</TableCell>
                <TableCell className="text-right tabular-nums">{t.limit ?? "∞"}</TableCell>
                <TableCell>{fitLabel(t)}</TableCell>
                <TableCell>
                  {t.pendingMove ? (
                    <span
                      title={`${t.pendingMove.basisLearners} learners against a cap of ${t.pendingMove.learnerLimit}, measured in the period starting ${formatDate(t.pendingMove.basisPeriodStart)}`}
                    >
                      {t.pendingMove.toTier} on {formatDate(t.pendingMove.executesAfter)}
                    </span>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell>{formatDate(t.periodResetsAt)}</TableCell>
                <TableCell>
                  {t.periodAnchor === "subscription" ? "Subscription" : "Created"}
                </TableCell>
                <TableCell>
                  <Link
                    to={`/operator/reports/meter/${t.tenantKey}`}
                    className="text-link hover:underline"
                  >
                    View
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </AppShell>
  );
}
