// Session player transport for both SCORM runtimes. Data model semantics live
// in scormDataModel.ts (1.2, shared with the dispatch content shim) and
// scormDataModel2004.ts (2004); this file owns only the transport:
// synchronous XHR load before the SCO initializes, async saves to
// /api/progress/scorm keyed by the session account.
//
// The transport is identical for both standards because the persistence
// endpoint stores whatever element names it is handed. Only the data model
// differs, so only the factory differs, and createTransport below is shared
// rather than copied. The 1.2 behavior is byte-for-byte what it was when this
// file was a port of PlayScorm.js.

import { createScormApi, type DataModel, type ScormRuntime } from "@/lib/scormDataModel";
import { createScorm2004Api, type Scorm2004Runtime } from "@/lib/scormDataModel2004";
import { standardFromVersion, type AnyScormRuntime } from "@/lib/scormStandard";

export type { ScormRuntime, Scorm2004Runtime, AnyScormRuntime };

export interface ScormRuntimeOptions {
  courseKey: number;
  learnerKey: number;
  // The runtime attempt this launch resolved. Carried on every load and
  // save so the SCO's cmi_result stays isolated from other attempts on the same
  // enrollment.
  attemptKey: number;
  learnerEmail: string;
  apiBase: string;
  // The course's stored scorm_version token, which decides which data model
  // the SCO is handed. Absent means 1.2, which is what every course recorded
  // before version detection existed reports.
  scormVersion?: string | null;
}

// Raised when the learner's stored progress could not be read.
// Distinct from an empty-but-valid response, which is the ordinary "this
// learner has not started yet" case. The caller must not launch the SCO on
// this: an unread data model looks identical to a blank one, and the first
// save would write that blank over real progress.
export class ScormProgressLoadError extends Error {
  constructor(readonly status: number) {
    super(`SCORM progress load failed (status ${status})`);
    this.name = "ScormProgressLoadError";
  }
}

// The session runtime plus its teardown. `dispose` detaches the unload flush;
// the player calls it when the launch ends. Extending the interface here rather
// than in scormDataModel keeps the transport concern out of the shared data
// model, which the dispatch shim also uses and which has no unload of its own.
export interface SessionScormRuntime extends ScormRuntime {
  dispose(): void;
}

// The same, for a SCORM 2004 course. Same transport, different data model.
export interface Session2004Runtime extends Scorm2004Runtime {
  dispose(): void;
}

// What a launch produced: the runtime, the standard it speaks so the caller
// knows which global name to publish it under, and the teardown.
export interface LaunchedSessionRuntime {
  runtime: AnyScormRuntime;
  standard: ReturnType<typeof standardFromVersion>;
  dispose(): void;
}

interface Transport {
  loadInitialData(): DataModel;
  saveData(data: DataModel): void;
  // What the course's own writes go through: a save DEBOUNCE_MS after the last
  // one, rather than one per write. saveData stays the immediate path, which is
  // what a commit and the unload flush want.
  scheduleSave(data: DataModel): void;
  // Where the unload flush gets a current model, rather than the last one
  // saveData happened to keep. Set once, after the runtime exists.
  setSnapshotSource(snapshot: () => DataModel): void;
  listen(): void;
  dispose(): void;
}

// How long the transport waits after the course's last write before saving,
// and how long it waits before trying a refused save again. Both numbers match
// the dispatch content shim (web/src/dispatch/shim.ts), which met these two
// questions first; one idiom across both players is worth more than tuning
// either in isolation.
const DEBOUNCE_MS = 5_000;
const RETRY_MS = 15_000;

function createTransport(opts: ScormRuntimeOptions): Transport {
  const { courseKey, learnerKey, attemptKey, apiBase } = opts;

  const saveUrl = `${apiBase}/api/progress/scorm/save?courseKey=${courseKey}&learnerKey=${learnerKey}&attemptKey=${attemptKey}`;

  // Synchronous on purpose: the SCO calls LMSGetValue on the same call stack
  // as its load event, so server state must be present before window.API is
  // handed over. Matches the WebForms runtime exactly.
  //
  // Throws rather than returning {} when the read fails. The two cases are
  // NOT interchangeable even though both produce an empty data model: a 200
  // carrying {} means the learner has no prior progress and starting fresh
  // is correct, whereas a failed read means we do not know what their
  // progress is. The old code returned {} for both, so a launch during a
  // deploy window silently reset the learner.
  function loadData(): DataModel {
    const xhr = new XMLHttpRequest();
    const url = `${apiBase}/api/progress/scorm/load?courseKey=${courseKey}&learnerKey=${learnerKey}&attemptKey=${attemptKey}`;
    xhr.open("GET", url, false);
    xhr.withCredentials = true;

    // A sync XHR raises on network failure rather than returning a status,
    // which is the exact shape of an API restarting mid-deploy.
    try {
      xhr.send();
    } catch (e) {
      console.error("SCORM load failed (network)", e);
      throw new ScormProgressLoadError(0);
    }

    if (xhr.status !== 200) {
      console.error("SCORM load failed", xhr.status);
      throw new ScormProgressLoadError(xhr.status);
    }

    try {
      return JSON.parse(xhr.responseText) as DataModel;
    } catch (e) {
      // A 200 we cannot parse is still an unknown data model, so it fails
      // the same way. An HTML error page served with status 200 lands here.
      console.error("SCORM load parse error", e);
      throw new ScormProgressLoadError(200);
    }
  }

  // One save in flight at a time. A newer snapshot waiting to go out replaces
  // an older one rather than queueing behind it, because every snapshot is the
  // whole data model and the newest therefore supersedes all of its
  // predecessors.
  //
  // This exists because parallel saves corrupt progress, which was caught on
  // test with a 4096-character suspend_data that never arrived. A single click
  // fires three saves microseconds apart: one per LMSSetValue via the
  // probabilistic onDirty below, and one for the LMSCommit that follows. Those
  // were independent async XHRs, so the snapshot taken BETWEEN the two sets
  // could be delivered after the snapshot taken by the commit, and the server
  // would durably store the earlier, emptier one. The learner's bookmark
  // survived and their suspend_data did not.
  //
  // Serializing makes last-write-wins true rather than a race that usually
  // happens to come out in the right order.
  let inFlight = false;
  let queued: DataModel | null = null;
  let latest: DataModel | null = null;
  let takeSnapshot: (() => DataModel) | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  function post(data: DataModel): void {
    inFlight = true;

    const xhr = new XMLHttpRequest();
    xhr.open("POST", saveUrl, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.withCredentials = true;
    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;

      settle(xhr.status === 200, xhr.status);
    };

    try {
      xhr.send(JSON.stringify(data));
    } catch (e) {
      // send() throws rather than answering when the page is tearing down or
      // the network is gone. Treated as a refusal so the retry below owns it,
      // instead of the exception escaping into the SCO's LMSCommit call.
      console.error("SCORM save failed (network)", e);
      settle(false, 0);
    }
  }

  // One place where a save ends, successfully or not. A refused save used to
  // end at a console line: the SCO had already been told "true", so a commit
  // landing in a deploy window was lost with nobody the wiser.
  //
  // Retrying the LATEST model rather than the payload that failed is the point.
  // Every snapshot is the whole data model, so the newest supersedes whatever
  // was refused, and a learner who read on for another minute has that minute
  // in the retry too.
  function settle(ok: boolean, status: number): void {
    inFlight = false;

    if (ok && retryTimer !== undefined) {
      clearTimeout(retryTimer);
      retryTimer = undefined;
    }

    if (!ok) {
      console.error("SCORM save failed", status);
      if (retryTimer === undefined) {
        retryTimer = setTimeout(() => {
          retryTimer = undefined;
          if (latest) saveData(latest);
        }, RETRY_MS);
      }
    }

    const next = queued;
    queued = null;
    if (next) post(next);
  }

  function saveData(data: DataModel): void {
    latest = data;

    // This save carries everything a waiting one would have, so the pending
    // debounce has nothing left to send.
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }

    if (inFlight) {
      queued = data;
      return;
    }
    post(data);
  }

  // The course's own writes. Waiting for a quiet moment rather than saving on
  // some proportion of them means a sitting costs one request per quiet window
  // instead of a coin flip per write, and the model that goes is the one the
  // learner left rather than whichever write happened to win the toss.
  function scheduleSave(data: DataModel): void {
    latest = data;

    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      if (latest) saveData(latest);
    }, DEBOUNCE_MS);
  }

  // The last save of a session is the one most worth keeping and the one most
  // likely to be lost. A course commits from its own beforeunload handler, and
  // an async XHR started while the page is tearing down is cancelled by the
  // browser, so that final commit frequently never left the machine.
  //
  // sendBeacon is the transport designed for this: the browser owns the request
  // and delivers it after the page is gone. Fire and forget, so there is no
  // status to inspect and no retry, which is why it is the fallback rather than
  // the normal path.
  function flushOnUnload(): void {
    if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return;

    // A CURRENT snapshot, not the last one saveData kept. The kept one was
    // taken at the last LMSSetValue, so a learner who reads for twenty minutes
    // without the course writing anything, then closes the tab, had their
    // sitting recorded as of whenever the course last wrote - or not at all,
    // if it never did. Now that the player measures the duration itself there
    // is always something newer to report, which is why the old "nothing has
    // changed since the last confirmed save" guard no longer belongs here.
    const data = takeSnapshot ? takeSnapshot() : latest;
    if (data === null) return;

    navigator.sendBeacon(saveUrl, new Blob([JSON.stringify(data)], { type: "application/json" }));
  }

  // pagehide rather than beforeunload: it fires for the bfcache case too, and
  // beforeunload is increasingly ignored on mobile.
  const canListen = typeof window !== "undefined" && typeof window.addEventListener === "function";

  return {
    loadInitialData: loadData,
    saveData,
    scheduleSave,
    setSnapshotSource(snapshot: () => DataModel) {
      takeSnapshot = snapshot;
    },
    listen() {
      if (canListen) window.addEventListener("pagehide", flushOnUnload);
    },
    dispose() {
      if (canListen) window.removeEventListener("pagehide", flushOnUnload);

      // A timer outliving the launch would save a finished sitting's model
      // over whatever the learner is doing next, which is the same class of
      // fault as the listener leak this dispose already existed for.
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      debounceTimer = undefined;
      retryTimer = undefined;
    },
  };
}

// This settles a question the old runtime left open. It saved on roughly
// 30 percent of successful sets, a coin flip inherited from PlayScorm.js, and a
// save that failed was logged and forgotten. The session player now does what
// the dispatch shim does: debounce the course's writes, save a commit at once,
// retry a refused save with the newest model, and beacon on unload.
//
// What is deliberately NOT done is telling the SCO a commit failed. LMSCommit
// answers on the same call stack and the save resolves later, so the only
// honest version reports a failure on a LATER call, against a course that has
// usually moved on. The dispatch player made
// the same call for the same reason: the learner is never interrupted over a
// postback, and the retry plus the unload beacon are what actually save the
// record.

export function createScormRuntime(opts: ScormRuntimeOptions): SessionScormRuntime {
  const transport = createTransport(opts);

  // Load before attaching the unload listener, not after. A failed load throws
  // out of here, and the listener used to be attached first, so every refused
  // launch left one behind. Harmless in effect (it returns early with nothing
  // to flush) but PlayerPage offers a retry button, so they accumulated.
  const initialData = transport.loadInitialData();
  transport.listen();

  const runtime = createScormApi({
    studentId: String(opts.learnerKey),
    studentName: opts.learnerEmail,
    initialData,
    onDirty: transport.scheduleSave,
    onCommit: transport.saveData,
    exposeSnapshot: transport.setSnapshotSource,
  });

  return { ...runtime, dispose: transport.dispose };
}

export function createScorm2004Runtime(opts: ScormRuntimeOptions): Session2004Runtime {
  const transport = createTransport(opts);

  const initialData = transport.loadInitialData();
  transport.listen();

  const runtime = createScorm2004Api({
    learnerId: String(opts.learnerKey),
    learnerName: opts.learnerEmail,
    initialData,
    onDirty: transport.scheduleSave,
    onCommit: transport.saveData,
    exposeSnapshot: transport.setSnapshotSource,
  });

  return { ...runtime, dispose: transport.dispose };
}

/**
 * Builds the runtime the course's stored version calls for.
 *
 * The caller gets the standard back rather than inferring it again, because
 * publishing the runtime under the wrong global name is the one mistake that
 * produces a course which loads, renders, and silently tracks nothing.
 */
export function createSessionRuntime(opts: ScormRuntimeOptions): LaunchedSessionRuntime {
  const standard = standardFromVersion(opts.scormVersion);

  const runtime = standard === "2004" ? createScorm2004Runtime(opts) : createScormRuntime(opts);

  return { runtime, standard, dispose: runtime.dispose };
}
