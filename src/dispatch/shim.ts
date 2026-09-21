// Dispatch content shim. Runs on the launch page served by
// /api/dispatch/launch/{id}, same origin as the API and the course content, so
// the SCO leg needs no postMessage. Sequence: fetch the stored CMI state,
// install window.API so the SCO's discovery walk finds a live SCORM 1.2
// runtime, then inject the course iframe.
//
// The other leg does need postMessage. When this page is framed by a dispatch
// package's launcher, that launcher is the only thing holding a reference to
// the customer's client's LMS, and it needs the result to write there
// That conversation lives in ./hostRelay.
//
// Persistence strategy per the plan's risk table: debounced saves while the
// learner works, immediate save on LMSCommit/LMSFinish with keepalive,
// sendBeacon on pagehide, and a bounded retry when a save fails. None of
// these is a guarantee; residual loss on tab close is documented.

import { createScormApi, type DataModel } from "@/lib/scormDataModel";
import { createScorm2004Api } from "@/lib/scormDataModel2004";
import { installRuntime, standardFromVersion } from "@/lib/scormStandard";

import { createHostRelay } from "./hostRelay";

interface ShimConfig {
  loadUrl: string;
  saveUrl: string;
  contentUrl: string;
  studentId: string;
  studentName: string;
  courseTitle: string;

  // The dispatched course's stored scorm_version token. Absent on a page
  // rendered by an older API, which reads as 1.2.
  scormVersion?: string | null;

  // The dispatch's domain allow-list, already normalized to bare hosts by
  // DispatchDomains. Empty means the control is off, which is not the same as
  // "allow nothing": the launcher's origin is then whichever one speaks first.
  hostDomains?: string[];
}

const DEBOUNCE_MS = 5_000;
const RETRY_MS = 15_000;

function readConfig(): ShimConfig | null {
  const el = document.getElementById("openscorm-dispatch-config");
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as ShimConfig;
  } catch {
    return null;
  }
}

function showStatus(message: string) {
  const host = document.getElementById("shim-status");
  if (host) host.innerHTML = `<p>${message}</p>`;
}

async function boot(): Promise<void> {
  const config = readConfig();
  if (!config) {
    showStatus("The course could not start. Contact your training provider.");
    return;
  }

  // Before the first await, so the listener exists no matter how early the
  // launcher's hello arrives.
  const host = createHostRelay(config.hostDomains ?? []);

  let initialData: DataModel = {};
  try {
    const res = await fetch(config.loadUrl, { headers: { Accept: "application/json" } });
    if (res.ok) {
      initialData = (await res.json()) as DataModel;
    } else {
      showStatus("The course is temporarily unavailable. Try again shortly.");
      return;
    }
  } catch {
    showStatus("The course is temporarily unavailable. Try again shortly.");
    return;
  }

  let latest: DataModel | null = null;
  let debounceTimer: number | undefined;
  let retryTimer: number | undefined;

  async function flush(data: DataModel): Promise<void> {
    if (debounceTimer !== undefined) {
      window.clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
    try {
      const res = await fetch(config!.saveUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        keepalive: true,
      });
      if (!res.ok) throw new Error(`save ${res.status}`);
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
        retryTimer = undefined;
      }
    } catch (err) {
      // The learner is never interrupted for a postback failure; the
      // latest snapshot wins whenever the next flush succeeds.
      console.error("openscorm dispatch save failed", err);
      if (retryTimer === undefined) {
        retryTimer = window.setTimeout(() => {
          retryTimer = undefined;
          if (latest) void flush(latest);
        }, RETRY_MS);
      }
    }
  }

  const onDirty = (data: DataModel) => {
    latest = data;
    if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      debounceTimer = undefined;
      if (latest) void flush(latest);
    }, DEBOUNCE_MS);
  };

  const onCommit = (data: DataModel) => {
    latest = data;
    void flush(data);
    host.progress(data);
  };

  const onFinish = (data: DataModel) => host.finish(data);

  const standard = standardFromVersion(config.scormVersion);

  const api =
    standard === "2004"
      ? createScorm2004Api({
          learnerId: config.studentId,
          learnerName: config.studentName,
          initialData,
          onDirty,
          onCommit,
          onFinish,
        })
      : createScormApi({
          studentId: config.studentId,
          studentName: config.studentName,
          initialData,
          onDirty,
          onCommit,
          onFinish,
        });

  // Install before the iframe exists: the SCO walks window.parent on its load
  // event and must find a live runtime on the first try, under the name its
  // own standard tells it to look for.
  installRuntime(window, standard, api);

  window.addEventListener("pagehide", () => {
    if (!latest) return;
    // sendBeacon survives page teardown where fetch may not. A same-origin
    // JSON blob avoids any preflight.
    navigator.sendBeacon(
      config.saveUrl,
      new Blob([JSON.stringify(latest)], { type: "application/json" }),
    );
  });

  const status = document.getElementById("shim-status");
  status?.remove();

  const frame = document.createElement("iframe");
  frame.id = "course-frame";
  frame.src = config.contentUrl;
  frame.title = config.courseTitle;
  frame.allow = "fullscreen";
  document.body.appendChild(frame);
}

void boot();
