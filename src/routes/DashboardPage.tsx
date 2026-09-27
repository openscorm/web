import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { api } from "@/lib/api";
import { capBand, capture } from "@/lib/analytics";
import { formatDate } from "@/lib/dates";
import { tierLabel } from "@/lib/tiers";
import { useAuth } from "@/hooks/useAuth";
import { useImpression } from "@/hooks/useImpression";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";

interface CapacityResponse {
  tenantType: string;
  courseCount: number;
  courseLimit: number;
  // userCount = accountCount + registrationCount; the single cap applies to
  // the total, the split shows where the number comes from.
  userCount: number;
  accountCount: number;
  registrationCount: number;
  userLimit: number;
  isCoursesUnlimited: boolean;
  isUsersUnlimited: boolean;
  isCoursesOverLimit: boolean;
  isUsersOverLimit: boolean;
  isCoursesNearLimit: boolean;
  isUsersNearLimit: boolean;
  isOverLimit: boolean;
  isNearLimit: boolean;
  recommendedTier: string | null;
  // Present only once the active-learner meter enforces, and
  // then it replaces the accounts gauge: two numbers on one card would be two
  // bills to explain.
  meter: CapacityMeter | null;
}

interface CapacityMeter {
  current: number;
  previous: number;
  limit: number | null;
  state: "unlimited" | "under" | "near" | "over" | "sustained";
  periodStartsAt: string;
  periodResetsAt: string;
  fittingTier: string | null;
  aboveTopTier: boolean;
  // Paid tiers can add learners without limit under the meter; Free keeps its
  // hard cap at registration. The server decides it, because the cap is
  // enforced in SQL and this card must not hold a second opinion.
  rosterUnlimited: boolean;
}

interface DashboardResponse {
  tenantKey: number;
  tenantHandle: string;
  tenantName: string;
  tenantType: string;
  capacity: CapacityResponse;
  courseCount: number;
  deletedCourseCount: number;
  learnerCount: number;
  managerCount: number;
}

export function DashboardPage() {
  const { user } = useAuth();

  const dashboard = useQuery({
    queryKey: ["tenants", user?.tenantKey, "dashboard"],
    queryFn: async () => api<DashboardResponse>(`/api/tenants/${user!.tenantKey}/dashboard`),
    enabled: !!user?.tenantKey,
  });

  return (
    <AppShell>
      <PageHeader
        title="Dashboard"
        subtitle={
          dashboard.data
            ? `${dashboard.data.tenantName} · ${dashboard.data.tenantHandle}`
            : "Loading…"
        }
        restricted={[
          "Manager or operator access only. Learners are redirected to the library.",
          "The /dashboard route is wrapped in RequireManager.",
          <>
            Enforced server-side by{" "}
            <code className="font-mono">GET /api/tenants/&#123;tenantKey&#125;/dashboard</code>,
            which returns 403 for learners and for accounts outside the tenant (operators exempt).
          </>,
        ]}
      />

      {dashboard.isLoading && <div className="text-muted-foreground">Loading dashboard…</div>}
      {dashboard.isError && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          Failed to load dashboard.
        </div>
      )}

      {dashboard.data && (
        <div className="space-y-6">
          <PlanCard data={dashboard.data} />

          <div className="grid gap-4 sm:grid-cols-3">
            <CoursesCard
              active={dashboard.data.courseCount}
              deleted={dashboard.data.deletedCourseCount}
            />
            <MetricCard label="Learners" value={dashboard.data.learnerCount} />
            <MetricCard label="Managers" value={dashboard.data.managerCount} />
          </div>
        </div>
      )}
    </AppShell>
  );
}

function PlanCard({ data }: { data: DashboardResponse }) {
  const c = data.capacity;

  // capacity_warning_shown (Group 3), dashboard_card surface,
  // deduped per page-view. Course takes precedence when both are constrained;
  // the card always carries a billing CTA.
  const warnDimension = c.isCoursesOverLimit || c.isCoursesNearLimit ? "course" : "user";
  const warnCount = warnDimension === "course" ? c.courseCount : c.userCount;
  const warnLimit = warnDimension === "course" ? c.courseLimit : c.userLimit;
  useImpression("capacity_warning_shown", c.isOverLimit || c.isNearLimit, {
    dimension: warnDimension,
    surface: "dashboard_card",
    cta_present: true,
    pct_of_cap_band: capBand(warnCount, warnLimit),
  });

  const tierColor =
    data.tenantType === "Trial"
      ? "bg-muted text-foreground"
      : data.tenantType === "Custom"
        ? "bg-accent text-accent-foreground"
        : "bg-primary text-primary-foreground";

  return (
    <div className="border-border bg-card text-card-foreground rounded-xl border p-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="text-muted-foreground mb-1 text-xs tracking-wide uppercase">Plan</div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${tierColor}`}
            >
              {tierLabel(data.tenantType)}
            </span>
            {c.isOverLimit && (
              <span className="inline-block rounded-lg bg-red-100 px-2 py-1 text-xs font-medium text-red-800 dark:bg-red-950/50 dark:text-red-200">
                Over limit
              </span>
            )}
            {!c.isOverLimit && c.isNearLimit && (
              <span className="inline-block rounded-lg bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-200">
                Near limit
              </span>
            )}
          </div>
        </div>
        <Link to="/billing" className="text-link text-sm hover:underline">
          Manage billing →
        </Link>
      </div>

      {data.tenantType === "Custom" ? (
        <p className="text-muted-foreground text-sm">Custom plan; caps do not apply.</p>
      ) : (
        <div className="space-y-4">
          <Gauge
            label="Courses"
            count={c.courseCount}
            limit={c.courseLimit}
            unlimited={c.isCoursesUnlimited}
            isOver={c.isCoursesOverLimit}
            isNear={c.isCoursesNearLimit}
          />
          {c.meter ? (
            <div>
              <Gauge
                label="Active learners this period"
                count={c.meter.current}
                limit={c.meter.limit ?? 0}
                unlimited={c.meter.limit === null}
                isOver={c.meter.state === "over" || c.meter.state === "sustained"}
                isNear={c.meter.state === "near"}
              />
              <div className="text-muted-foreground mt-1.5 text-xs">
                Resets {formatDate(c.meter.periodResetsAt)}. Learners who stop launching stop
                counting
                {c.meter.rosterUnlimited
                  ? ", and your roster is unlimited."
                  : ", and your plan still limits how many learners you can add."}
              </div>
            </div>
          ) : (
            <div>
              <Gauge
                label="Users"
                count={c.userCount}
                limit={c.userLimit}
                unlimited={c.isUsersUnlimited}
                isOver={c.isUsersOverLimit}
                isNear={c.isUsersNearLimit}
              />
              {c.registrationCount > 0 && (
                <div className="text-muted-foreground mt-1.5 text-xs">
                  {c.accountCount.toLocaleString()} users, {c.registrationCount.toLocaleString()}{" "}
                  dispatch registrations
                </div>
              )}
              {data.tenantType === "Trial" && c.isUsersOverLimit && (
                <div className="text-muted-foreground mt-1.5 text-xs">
                  Free includes {c.userLimit.toLocaleString()} users. The{" "}
                  {c.userCount.toLocaleString()} you already have keep working, and you can add
                  another once you are back under {c.userLimit.toLocaleString()}.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {c.meter && <MeterWall meter={c.meter} />}

      {!c.meter && c.recommendedTier && (
        <div className="border-border text-muted-foreground mt-4 border-t pt-4 text-sm">
          Recommended upgrade:{" "}
          <span className="text-foreground font-semibold">{c.recommendedTier}</span>.{" "}
          <Link to="/billing?from=dashboard_card" className="text-link hover:underline">
            See pricing
          </Link>
        </div>
      )}
    </div>
  );
}

// Three states, none of which
// blocks anybody: an approaching note at 80 percent, a persistent banner over
// cap, and a firmer one when a second period runs over. Every state says the
// numbers plainly, says that learners keep full access, and offers the tier that
// fits. Nothing here promises an automatic plan move: renewal-at-fit is a
// separate switch and its own copy.
function MeterWall({ meter }: { meter: CapacityMeter }) {
  const over = meter.state === "over" || meter.state === "sustained";
  const sustained = meter.state === "sustained";

  useImpression("meter_wall_banner_shown", over, {
    state: meter.state,
    surface: "dashboard_card",
    active_learners: meter.current,
    learner_limit: meter.limit,
  });

  if (meter.state === "near") {
    return (
      <div className="border-border text-muted-foreground mt-4 border-t pt-4 text-sm">
        {meter.current.toLocaleString()} of {meter.limit?.toLocaleString()} active learners this
        period
      </div>
    );
  }

  if (!over) return null;

  return (
    <div
      className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
        sustained
          ? "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
          : "border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-100"
      }`}
    >
      <p className="font-medium">
        {meter.current.toLocaleString()} of {meter.limit?.toLocaleString()} active learners this
        period
        {sustained ? ", the second period in a row over your plan" : ""}
      </p>
      <p className="mt-1">
        All learners keep full access, and nothing is charged for going over. Your records are safe.
      </p>
      {meter.aboveTopTier ? (
        <p className="mt-2">
          Usage above our largest plan. Reply to any billing email and we will size it with you.
        </p>
      ) : (
        meter.fittingTier && (
          <p className="mt-2">
            <Link
              to={`/billing?from=meter_wall&tier=${meter.fittingTier}`}
              className="font-medium underline"
              onClick={() =>
                capture("meter_upgrade_cta_clicked", {
                  state: meter.state,
                  surface: "dashboard_card",
                  fitting_tier: meter.fittingTier,
                  active_learners: meter.current,
                })
              }
            >
              Move to {meter.fittingTier}
            </Link>{" "}
            to cover this period's usage, or reduce active learners before{" "}
            {formatDate(meter.periodResetsAt)}.
          </p>
        )
      )}
    </div>
  );
}

function Gauge({
  label,
  count,
  limit,
  unlimited,
  isOver,
  isNear,
}: {
  label: string;
  count: number;
  limit: number;
  unlimited: boolean;
  isOver: boolean;
  isNear: boolean;
}) {
  if (unlimited) {
    return (
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-muted-foreground text-sm">{count.toLocaleString()} (no cap)</span>
        </div>
        <div className="bg-muted h-2 overflow-hidden rounded-full">
          <div className="bg-muted-foreground/30 h-full w-full" />
        </div>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((count / Math.max(1, limit)) * 100));
  const barColor = isOver ? "bg-red-500" : isNear ? "bg-yellow-500" : "bg-primary";

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-muted-foreground text-sm">
          {count.toLocaleString()} of {limit.toLocaleString()}
          {isOver ? " — over limit" : ""}
        </span>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// The headline number is active courses, matching the library and the plan
// gauge. Deleted packages still exist in the database and still hold learner
// progress, so the card expands to account for the difference rather than
// leaving a manager to wonder where the other courses went.
function CoursesCard({ active, deleted }: { active: number; deleted: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-border bg-card text-card-foreground rounded-xl border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="focus-visible:ring-primary hover:bg-muted/40 w-full rounded-xl p-5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <div className="text-muted-foreground mb-1 flex items-center justify-between text-xs tracking-wide uppercase">
          <span>Courses</span>
          <Chevron open={expanded} />
        </div>
        <div className="text-3xl font-bold">{active.toLocaleString()}</div>
      </button>

      {expanded && (
        <dl className="border-border space-y-1.5 border-t px-5 py-4 text-sm">
          <Breakdown term="Active" value={active} />
          <Breakdown term="Deleted" value={deleted} />
          <Breakdown term="Total uploaded" value={active + deleted} emphasis />
        </dl>
      )}
    </div>
  );
}

function Breakdown({
  term,
  value,
  emphasis = false,
}: {
  term: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`border-border flex justify-between ${emphasis ? "border-t pt-1.5 font-semibold" : ""}`}
    >
      <dt className={emphasis ? "" : "text-muted-foreground"}>{term}</dt>
      <dd>{value.toLocaleString()}</dd>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
