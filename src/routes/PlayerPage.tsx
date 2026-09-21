import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { api, apiBase } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import {
  createSessionRuntime,
  ScormProgressLoadError,
  type LaunchedSessionRuntime,
  type ScormRuntime,
} from "@/lib/scormApi";
import type { Scorm2004Runtime } from "@/lib/scormDataModel2004";
import { installRuntime, terminateRuntime, uninstallRuntime } from "@/lib/scormStandard";

interface LaunchResponse {
  standard: "scorm" | "xapi";
  // The course's stored scorm_version token ("1.2", "2004-4th", and so on).
  // Absent from an older API response, which reads as 1.2.
  scormVersion?: string | null;
  courseKey: number;
  title: string;
  contentUrl?: string;
  launchUrl?: string;
  learnerKey?: number;
  attemptKey?: number;
  learnerEmail?: string;
  navigationPosition?: string;
  navigationExitText?: string;
  exitUrl: string | null;
}

declare global {
  interface Window {
    API?: ScormRuntime;
    API_1484_11?: Scorm2004Runtime;
  }
}

// The floating bar is 250px wide at every viewport, so on a 375px
// phone it covers two thirds of the width and the Left and Right positions
// still overlap by 157px. The configured position therefore cannot move the
// chrome off the content on a phone, which is what it was meant to do.
// Collapsed it is 40px, which restores real clearance. 640px is Tailwind's sm breakpoint; the query is inverted rather
// than written as a max-width so the boundary cannot drift from the utility
// classes. Read once at mount and not tracked on resize, so a learner who
// opens the bar keeps it open through a rotation.
function startCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return !window.matchMedia("(min-width: 640px)").matches;
}

export function PlayerPage() {
  const { courseKey } = useParams<{ courseKey: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const tenantKey = user?.tenantKey;

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const runtimeRef = useRef<LaunchedSessionRuntime | null>(null);
  const [collapsed, setCollapsed] = useState(startCollapsed);
  // "idle" covers both "not a SCORM course" and "runtime not built yet"; the
  // render gate below only consults it for SCORM launches.
  const [runtimeStatus, setRuntimeStatus] = useState<"idle" | "ready" | "failed">("idle");
  const [retryToken, setRetryToken] = useState(0);

  const launch = useQuery({
    queryKey: ["tenants", tenantKey, "courses", courseKey, "launch", searchParams.toString()],
    queryFn: async () => {
      const qs = new URLSearchParams();
      const progressUrl = searchParams.get("progressUrl");
      const exitUrl = searchParams.get("exitUrl");
      if (progressUrl) qs.set("progressUrl", progressUrl);
      if (exitUrl) qs.set("exitUrl", exitUrl);
      const suffix = qs.toString() ? `?${qs}` : "";
      return api<LaunchResponse>(`/api/tenants/${tenantKey}/courses/${courseKey}/launch${suffix}`);
    },
    enabled: !!tenantKey && !!courseKey,
    staleTime: Infinity,
  });

  // course_launched fires server-side from the launch endpoint, so a
  // learner who cannot run JS still counts and first_launch is stamped once.

  useEffect(() => {
    if (!launch.data || launch.data.standard !== "scorm") return;
    if (runtimeRef.current) return;

    // Problem #94: this used to fall back to attempt 0, which no enrollment can
    // own - progress.attempt.attempt_key is an identity column starting at 1 - so
    // every save the session made was refused by the database, one 500 per commit,
    // and the learner's work went nowhere. A launch with no attempt is a launch we
    // cannot record progress against, so refuse it here for the same reason the
    // progress-load failure below refuses it.
    if (!launch.data.attemptKey) {
      setRuntimeStatus("failed");
      return;
    }

    let runtime: LaunchedSessionRuntime;
    try {
      runtime = createSessionRuntime({
        courseKey: launch.data.courseKey,
        learnerKey: launch.data.learnerKey ?? 0,
        attemptKey: launch.data.attemptKey,
        learnerEmail: launch.data.learnerEmail ?? "",
        scormVersion: launch.data.scormVersion,
        apiBase,
      });
    } catch (e) {
      // We could not read this learner's progress, so we do not know
      // it. Refuse the launch rather than handing the SCO a blank data model
      // it would later save over the real one. Same posture as the dispatch
      // shim, which shows a neutral retry page and never initializes on
      // defaults.
      if (e instanceof ScormProgressLoadError) {
        setRuntimeStatus("failed");
        return;
      }
      throw e;
    }

    runtimeRef.current = runtime;
    // Published under the name this course's SCO will search for: API for a
    // 1.2 package, API_1484_11 for 2004. Only one, never both.
    installRuntime(window, runtime.standard, runtime.runtime);
    setRuntimeStatus("ready");

    return () => {
      uninstallRuntime(window, runtime.standard, runtime.runtime);
      // Detaches the unload flush. Without this a relaunch would leave the
      // previous launch's listener attached, and it would beacon that course's
      // stale snapshot when the tab eventually closes.
      runtime.dispose();
      runtimeRef.current = null;
      setRuntimeStatus("idle");
    };
  }, [launch.data, retryToken]);

  useEffect(() => {
    const start = Date.now();
    const id = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  if (launch.isLoading) {
    return (
      <div className="text-muted-foreground flex min-h-screen items-center justify-center text-sm">
        Loading course…
      </div>
    );
  }

  if (launch.isError || !launch.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <div className="text-sm text-red-600">Course could not be launched.</div>
        <button type="button" onClick={() => nav("/courses")} className={secondaryBtn}>
          Back to courses
        </button>
      </div>
    );
  }

  // A SCORM launch waits for a runtime built on progress we actually
  // read. Gating the iframe rather than only the runtime matters: the SCO
  // discovers window.API on its own load event, so rendering the frame before
  // the runtime exists is a race even when the load succeeds.
  const isScorm = launch.data.standard === "scorm";

  if (isScorm && runtimeStatus === "failed") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-sm font-medium">We could not load your progress.</div>
        <div className="text-muted-foreground max-w-sm text-sm">
          Your place in this course is safe. Starting now would risk overwriting it, so the course
          has not been opened. This usually clears within a minute.
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setRuntimeStatus("idle");
              setRetryToken((t) => t + 1);
            }}
            className={primaryBtn}
          >
            Try again
          </button>
          <button type="button" onClick={() => nav("/courses")} className={secondaryBtn}>
            Back to courses
          </button>
        </div>
      </div>
    );
  }

  if (isScorm && runtimeStatus !== "ready") {
    return (
      <div className="text-muted-foreground flex min-h-screen items-center justify-center text-sm">
        Loading your progress…
      </div>
    );
  }

  const iframeSrc = launch.data.launchUrl || launch.data.contentUrl || "about:blank";
  const exitText = launch.data.navigationExitText || "Exit";
  // Mirrors legacy NavigationController.Setup: the configured position sets
  // the floating bar's horizontal placement; Left is the legacy default.
  const positionClass =
    launch.data.navigationPosition === "Right"
      ? "right-4"
      : launch.data.navigationPosition === "Center"
        ? "left-1/2 -translate-x-1/2"
        : "left-4";

  function handleExit() {
    if (runtimeRef.current) {
      // LMSFinish for 1.2, Terminate for 2004. Calling the wrong one throws
      // and the learner's final commit never happens.
      terminateRuntime(runtimeRef.current.runtime);
    }
    // Prefer launch.data.exitUrl — the API decodes the base64-wrapped LMS URL
    // the integrator sends on ?exitUrl=<base64>. Fall back to the course list
    // for in-app launches with no relay context.
    const target = launch.data?.exitUrl || "/courses";
    if (/^https?:\/\//i.test(target)) {
      window.location.assign(target);
    } else {
      nav(target);
    }
  }

  return (
    <div className="bg-background text-foreground min-h-screen">
      <iframe
        title={launch.data.title}
        src={iframeSrc}
        className="fixed inset-0 h-full w-full border-0"
      />
      <div
        className={`bg-card text-card-foreground border-border fixed top-4 ${positionClass} z-50 flex items-center gap-3 rounded-full border px-3 py-1.5 text-xs shadow-lg transition-all ${collapsed ? "w-10 justify-center" : ""}`}
      >
        {!collapsed && (
          <>
            <button
              type="button"
              onClick={handleExit}
              className="bg-primary rounded-full px-3 py-1 text-xs font-semibold text-white"
            >
              {exitText}
            </button>
            <span className="font-mono tabular-nums">{formatElapsed(elapsedSeconds)}</span>
            <a
              href="https://openscorm.com"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground"
            >
              OpenSCORM
            </a>
          </>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="text-muted-foreground hover:text-foreground inline-flex h-6 w-6 items-center justify-center"
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "◀" : "▶"}
        </button>
      </div>
    </div>
  );
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const secondaryBtn =
  "inline-flex items-center justify-center rounded-full py-2 px-4 font-semibold text-sm border border-border text-foreground hover:bg-muted transition-colors";

const primaryBtn =
  "inline-flex items-center justify-center rounded-full py-2 px-4 font-semibold text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity";
