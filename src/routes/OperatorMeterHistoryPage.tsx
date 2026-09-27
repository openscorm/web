import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
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

// One tenant's active-learner count per billing period for the last twelve
// months, with the plan and cap each period was on. An operator reads it
// before a renewal-at-fit notice goes out.

interface OperatorMeterHistoryPeriod {
  periodStartsAt: string;
  periodEndsAt: string;
  isCurrent: boolean;
  learners: number;
  plan: string;
  planChangedDuring: boolean;
  isFreePlan: boolean;
  // Null with unlimited false: the cap for that month was not recorded.
  limit: number | null;
  unlimited: boolean;
}

interface OperatorMeterHistoryResponse {
  asOf: string;
  tenantKey: number;
  tenantHandle: string;
  tenantName: string;
  plan: string;
  recordingSince: string;
  periods: OperatorMeterHistoryPeriod[];
}

function capLabel(p: OperatorMeterHistoryPeriod): string {
  if (p.unlimited) return "∞";
  return p.limit === null ? "-" : String(p.limit);
}

export function OperatorMeterHistoryPage() {
  const { tenantKey } = useParams();

  const history = useQuery({
    queryKey: ["operator", "meter", "history", tenantKey],
    queryFn: async () =>
      api<OperatorMeterHistoryResponse>(`/api/operator/tenants/${tenantKey}/meter/history`),
  });

  const notFound = history.error instanceof ApiError && history.error.status === 404;
  const h = history.data;
  const periods = h?.periods ?? [];

  return (
    <AppShell>
      <PageHeader
        title={h ? `Operator: Meter history for ${h.tenantName}` : "Operator: Meter history"}
        subtitle="Learners who launched a course in each billing period, against the plan and cap that period was on"
        restricted={[
          "Operator access only. Your account must have the operator role.",
          "The /operator/reports/meter/:tenantKey route is wrapped in RequireOperator; non-operators are redirected to their dashboard or library.",
          <>
            Enforced server-side by{" "}
            <code className="font-mono">
              GET /api/operator/tenants/{"{tenantKey}"}/meter/history
            </code>
            , which returns 403 for non-operators.
          </>,
        ]}
      />

      <p className="mb-4">
        <Link to="/operator/reports/meter" className="text-link text-sm hover:underline">
          Back to the meter report
        </Link>
      </p>

      {h && (
        <p className="text-muted-foreground mb-4 text-sm">
          <span className="font-mono">{h.tenantHandle}</span>, on {h.plan} now. Recording began{" "}
          {formatDate(h.recordingSince)}; earlier periods are not listed.
        </p>
      )}

      <p className="text-muted-foreground/70 mb-4 text-xs">
        Past plans are rebuilt from plan changes, and each past cap is that plan's cap. A cap waiver
        shows on the current period only, because waivers are not recorded per month.
      </p>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Learners</TableHead>
              <TableHead className="text-right">Cap</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.isLoading && <TableStateRow colSpan={4}>Loading…</TableStateRow>}
            {notFound && (
              <TableStateRow colSpan={4} tone="danger">
                Tenant not found
              </TableStateRow>
            )}
            {history.isError && !notFound && (
              <TableStateRow colSpan={4} tone="danger">
                Failed to load the meter history
              </TableStateRow>
            )}
            {h && periods.length === 0 && (
              <TableStateRow colSpan={4}>No periods since recording began</TableStateRow>
            )}
            {periods.map((p) => (
              <TableRow key={p.periodStartsAt}>
                <TableCell>
                  {formatDate(p.periodStartsAt)} to {formatDate(p.periodEndsAt)}
                  {p.isCurrent && (
                    <Badge variant="secondary" className="ml-2">
                      Current
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {p.isFreePlan ? "Free plan" : p.plan}
                  {p.planChangedDuring && (
                    <span className="text-muted-foreground ml-2 text-xs">
                      changed during this period
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{p.learners}</TableCell>
                <TableCell
                  className="text-right tabular-nums"
                  title={
                    p.limit === null && !p.unlimited ? "Not recorded for this period" : undefined
                  }
                >
                  {capLabel(p)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </AppShell>
  );
}
