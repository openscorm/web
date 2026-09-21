import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { api } from "@/lib/api";
import { formatTime } from "@/lib/dates";

interface ActivityTenant {
  tenantHandle: string;
  activeLearners: number;
  activeSessions: number;
}

interface ActivityResponse {
  asOf: string;
  windowMinutes: number;
  deployRisk: "None" | "Low" | "Medium" | "High";
  activeLearners: number;
  activeSessions: number;
  scormSavesLast: number;
  xapiStatementsLast: number;
  lastProgressSaveSecondsAgo: number | null;
  tenantsWithActivity: ActivityTenant[];
}

interface PlatformStats {
  tenants: number;
  accounts: number;
  courses: number;
  enrollments: number;
  coursesByScormVersion: Record<string, number>;
}

interface DuplicateAccountsResponse {
  duplicateAccounts: number;
  duplicateEmails: number;
}

const windowOptions = [
  { minutes: 5, label: "5 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 1440, label: "24 hours" },
];

export function OperatorDashboardPage() {
  const [windowMinutes, setWindowMinutes] = useState(5);

  const stats = useQuery({
    queryKey: ["operator", "stats"],
    queryFn: async () => api<PlatformStats>("/api/operator/stats"),
  });

  const duplicates = useQuery({
    queryKey: ["operator", "reports", "duplicate-accounts"],
    queryFn: async () => api<DuplicateAccountsResponse>("/api/operator/reports/duplicate-accounts"),
  });

  // How many tenants the active-learner meter reads as over cap,
  // this period alone or sustained across two.
  const meter = useQuery({
    queryKey: ["operator", "reports", "meter", false],
    queryFn: async () => api<{ tenants: { state: string }[] }>("/api/operator/reports/meter"),
  });
  const overCapTenants = meter.data?.tenants.filter(
    (t) => t.state === "over" || t.state === "sustained",
  ).length;

  const activity = useQuery({
    queryKey: ["operator", "activity", windowMinutes],
    queryFn: async () =>
      api<ActivityResponse>(`/api/operator/activity?window_minutes=${windowMinutes}`),
    refetchInterval: 30_000,
  });

  // The per-SCORM-version split rides in the Courses card's info tooltip
  // rather than as its own line, to keep the metric grid clean.
  const coursesByVersion = stats.data?.coursesByScormVersion;
  const coursesVersionHint =
    coursesByVersion && Object.keys(coursesByVersion).length > 0
      ? "By SCORM version: " +
        Object.entries(coursesByVersion)
          .map(([version, count]) => `${version} ${count.toLocaleString()}`)
          .join(", ")
      : undefined;

  return (
    <AppShell>
      <PageHeader
        title="Operator: Dashboard"
        subtitle="Platform-wide stats and live activity"
        restricted={[
          "Operator access only. Your account must have the operator role.",
          "The /operator/dashboard route is wrapped in RequireOperator; non-operators are redirected to their dashboard or library.",
          <>
            Enforced server-side by <code className="font-mono">GET /api/operator/tenants</code> and{" "}
            <code className="font-mono">GET /api/operator/activity</code>, which return 403 for
            non-operators.
          </>,
        ]}
      />

      {(stats.isError || activity.isError) && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          Failed to load {activity.isError ? "activity" : "platform stats"}. Retrying automatically.
        </div>
      )}

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Accounts" value={stats.data?.accounts} to="/operator/accounts" />
          <MetricCard label="Tenants" value={stats.data?.tenants} to="/operator/tenants" />
          <MetricCard label="Courses" value={stats.data?.courses} hint={coursesVersionHint} />
          <MetricCard label="Enrollments" value={stats.data?.enrollments} />
          <MetricCard
            label="Active learners"
            value={activity.data?.activeLearners}
            hint="Distinct learner accounts with at least one SCORM save or xAPI statement in the selected time window."
          />
          <MetricCard
            label="Active enrollments"
            value={activity.data?.activeSessions}
            hint="Distinct learner-and-course pairs with at least one SCORM save or xAPI statement in the selected time window."
          />
          <MetricCard
            label="Duplicate accounts"
            value={duplicates.data?.duplicateAccounts}
            to="/operator/reports/duplicate-accounts"
            hint="Accounts sharing an email address with at least one other account"
          />
          <MetricCard
            label="Over learner cap"
            value={overCapTenants}
            to="/operator/reports/meter"
            hint="Tenants whose active learners this billing period exceed their plan cap. Not shown to customers or enforced yet."
          />
        </div>

        <div className="border-border bg-card text-card-foreground rounded-xl border p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-muted-foreground mb-1 text-xs tracking-wide uppercase">
                Deploy risk
              </div>
              <div className="flex items-center gap-2">
                {activity.data ? (
                  <RiskBadge risk={activity.data.deployRisk} />
                ) : (
                  <span className="text-muted-foreground text-sm">Loading…</span>
                )}
              </div>
            </div>
            <WindowSelector value={windowMinutes} onChange={setWindowMinutes} />
          </div>

          {activity.data && (
            <dl className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-3">
              <div className="flex justify-between sm:block">
                <dt className="text-muted-foreground">Last progress save</dt>
                <dd className="font-medium">
                  {formatSaveAge(activity.data.lastProgressSaveSecondsAgo)}
                </dd>
              </div>
              <div className="flex justify-between sm:block">
                <dt className="text-muted-foreground">SCORM saves in window</dt>
                <dd className="font-medium tabular-nums">
                  {activity.data.scormSavesLast.toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between sm:block">
                <dt className="text-muted-foreground">xAPI statements in window</dt>
                <dd className="font-medium tabular-nums">
                  {activity.data.xapiStatementsLast.toLocaleString()}
                </dd>
              </div>
            </dl>
          )}

          <div className="text-muted-foreground/70 mt-4 text-xs">
            {activity.data
              ? `As of ${formatTime(activity.data.asOf)} · refreshes every 30 seconds`
              : "Loading activity…"}
          </div>
        </div>

        <div className="border-border bg-card text-card-foreground overflow-hidden rounded-xl border">
          <div className="border-border border-b px-4 py-3">
            <h5 className="font-semibold">Tenants with activity</h5>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Tenant</th>
                  <th className="px-4 py-3 text-right font-medium">Active learners</th>
                  <th className="px-4 py-3 text-right font-medium">Active enrollments</th>
                </tr>
              </thead>
              <tbody>
                {activity.isLoading && (
                  <tr>
                    <td colSpan={3} className="text-muted-foreground px-4 py-6 text-center">
                      Loading…
                    </td>
                  </tr>
                )}
                {activity.data && activity.data.tenantsWithActivity.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-muted-foreground px-4 py-6 text-center">
                      No learner activity in the selected window
                    </td>
                  </tr>
                )}
                {activity.data?.tenantsWithActivity.map((t) => (
                  <tr key={t.tenantHandle} className="border-border border-t">
                    <td className="px-4 py-3 font-mono text-xs">{t.tenantHandle}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{t.activeLearners}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{t.activeSessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-muted-foreground/70 text-xs">
          Duplicate accounts share an email address with at least one other account (same email,
          different login), usually the same person in more than one tenant.
        </p>
      </div>
    </AppShell>
  );
}

// Mirrors ClassifyDeployRisk in OperatorController: None means a release will
// not interrupt anyone; High means a learner saved progress within 60 seconds.
function RiskBadge({ risk }: { risk: ActivityResponse["deployRisk"] }) {
  const styles =
    risk === "High"
      ? "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200"
      : risk === "Medium"
        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-200"
        : risk === "Low"
          ? "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200"
          : "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-200";
  const hint =
    risk === "None" ? "Safe to deploy" : risk === "Low" ? "Sessions idle" : "Learners saving";

  return (
    <>
      <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${styles}`}>
        {risk}
      </span>
      <span className="text-muted-foreground text-sm">{hint}</span>
    </>
  );
}

function WindowSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="border-border inline-flex overflow-hidden rounded-lg border text-sm">
      {windowOptions.map((o) => (
        <button
          key={o.minutes}
          type="button"
          onClick={() => onChange(o.minutes)}
          className={`px-3 py-1.5 ${
            value === o.minutes
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function formatSaveAge(secondsAgo: number | null): string {
  if (secondsAgo === null) return "never";
  if (secondsAgo < 60) return `${secondsAgo} seconds ago`;
  if (secondsAgo < 3600) return `${Math.round(secondsAgo / 60)} minutes ago`;
  if (secondsAgo < 86400) return `${Math.round(secondsAgo / 3600)} hours ago`;
  return `${Math.round(secondsAgo / 86400)} days ago`;
}
