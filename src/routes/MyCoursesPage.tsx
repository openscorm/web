import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { api, apiBase } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";

interface CourseRow {
  courseKey: number;
  courseSlug: string;
  title: string;
  version: string;
  launcherStatusHtml: string;
  launchUrl: string;
  restartUrl: string | null;
}

export function MyCoursesPage() {
  const { user } = useAuth();
  const tenantKey = user?.tenantKey;

  const list = useQuery({
    queryKey: ["tenants", tenantKey, "courses"],
    queryFn: async () => api<CourseRow[]>(`/api/tenants/${tenantKey}/courses`),
    enabled: !!tenantKey,
  });

  return (
    <AppShell>
      <PageHeader title="My courses" subtitle="Courses available to you" />

      {list.isLoading && <p className="text-muted-foreground text-sm">Loading courses…</p>}
      {list.data?.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No courses yet. Ask your manager for an invitation.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {list.data?.map((c) => (
          <div
            key={c.courseKey}
            className="border-border bg-card text-card-foreground flex flex-col rounded-xl border p-5"
          >
            <h4 className="mb-3 text-lg font-semibold">{c.title || c.courseSlug}</h4>
            <div
              className="text-muted-foreground mb-4 text-xs"
              dangerouslySetInnerHTML={{ __html: c.launcherStatusHtml }}
            />
            {c.restartUrl && (
              <a
                href={absoluteUrl(c.restartUrl)}
                className="text-muted-foreground hover:text-foreground mb-3 text-xs hover:underline"
              >
                Restart
              </a>
            )}
            <div className="mt-auto">
              <Link to={c.launchUrl} className={primaryBtn}>
                Launch
              </Link>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (!apiBase) return path;
  return apiBase + path;
}

const primaryBtn =
  "inline-flex items-center justify-center rounded-full py-2 px-4 font-semibold text-sm text-white bg-primary hover:bg-[color:var(--color-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
