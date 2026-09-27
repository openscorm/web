// The shim's half of the dispatch launcher conversation.
//
// A dispatch package's launcher runs on the customer's client's LMS origin and
// is the only thing holding a reference to that LMS's SCORM API. The course
// runs here, on ours. Without this relay the learner's own training record
// shows a course they opened and never finished, which is the state dispatch
// exists to avoid.
//
// The protocol is mirrored in src/Slate.Dispatch/Templates/launcher.js. The
// launcher says host-hello to this frame with an explicit target origin, this
// frame answers shim-hello, and everything afterward is progress and finish.
// Neither end ever posts to a wildcard target.
//
// Separate module from shim.ts so it can be tested without booting the shim.

import { SESSION_TIME_12, toLegacyRelayModel } from "@/lib/scormCompletion";
import { secondsToScormTime, type DataModel } from "@/lib/scormDataModel";
import { createSessionClock, type SessionClock } from "@/lib/sessionDuration";

export const SOURCE = "openscorm-dispatch";
export const PROTOCOL_VERSION = 1;

// What the launcher is told, on every message. It owns the learner's
// transcript; we own the detail, so suspend_data and interactions are not in
// this list.
//
// This is deliberately not the same as what the launcher writes. session_time
// is write-once in SCORM 1.2, so the launcher holds it back until it closes
// the host session, and telling a host on every commit would add one sitting
// to total_time several times over.
//
// It still has to be told early. The learner leaving is what usually fires the
// launcher's close path, and a message posted at that moment may never be
// delivered, so anything the launcher needs at close has to already be in its
// hands. Sending late and writing late are different problems, and only one of
// them is ours to solve.
//
// These stay 1.2 names on purpose. The launcher runs inside the customer's
// client's LMS, was handed a SCORM 1.2 API by that LMS, and can only write
// what 1.2 understands, so a 2004 course's two status axes are projected down
// to one before anything is picked from the model (scormCompletion.ts, the
// same rule as the hosted rollup's SQL and the dispatch save's C#).
export const RELAYED_ELEMENTS = [
  "cmi.core.lesson_status",
  "cmi.core.score.raw",
  "cmi.core.score.min",
  "cmi.core.score.max",
  "cmi.core.session_time",
];

export interface HostRelay {
  progress(data: DataModel): void;
  finish(data: DataModel): void;
}

// SCORM 1.2 accumulated-time format, all components zero: 0000:00:00,
// 00:00:00, 0:00:00.00.
function isZeroTime(value: string): boolean {
  return /^0+:0+:0+(\.0+)?$/.test(value.trim());
}

// Two values are worse to send than to withhold, and both were caught by the
// SCORM Cloud debug log on the first hosted launch.
//
// The shim's data model carries "not attempted" from the moment it boots, so
// an early commit relayed it before the SCO had said anything. SCORM Cloud
// refused it, which is how we found out; a host that accepts it would take a
// real status from a previous attempt and reset it.
//
// A zero session_time is the same shape of mistake. The host adds it to
// total_time, so telling it a sitting took no time is a worse answer than
// telling it nothing.
export function isReportable(element: string, value: string): boolean {
  if (value === "") return false;
  if (element === "cmi.core.lesson_status") return value.trim().toLowerCase() !== "not attempted";
  if (element === "cmi.core.session_time") return !isZeroTime(value);
  return true;
}

function pick(data: DataModel, elements: string[], clock: SessionClock): DataModel {
  // Projected first, so a 2004 model is expressed in the names the host LMS
  // can store. A 1.2 model passes through the projection unchanged.
  const legacy = toLegacyRelayModel(data);

  const values: DataModel = {};
  for (const element of elements) {
    const value = legacy[element];
    if (value !== undefined && isReportable(element, value)) values[element] = value;
  }

  // The session player's rule, applied to the host. When the course
  // reports no session time, the host is told the sitting we measured rather
  // than nothing, which it would record as zero. A time the course did report
  // always wins. A reported zero counts as nothing, because a 1.2 model starts
  // out at zero and cannot say whether the course or the default put it there.
  if (!(SESSION_TIME_12 in values)) {
    const measured = secondsToScormTime(clock.elapsedSeconds());
    if (isReportable(SESSION_TIME_12, measured)) values[SESSION_TIME_12] = measured;
  }

  return values;
}

// Same suffix rule as DispatchLaunchGuards.CheckOrigin, so a manager who
// allow-lists acme.com gets lms.acme.com from both the Referer check and this
// one. Two rules that must agree forever is the bug waiting to happen.
export function hostAllowed(origin: string, domains: string[]): boolean {
  if (domains.length === 0) return true;

  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }

  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

// Answers the launcher and relays results to it. Created before the course
// loads, because the hello can arrive at any point after this frame's document
// does, and an unanswered hello is a host LMS that never learns the course was
// completed.
//
// The clock starts here, before the course loads, which is the same moment the
// runtime's own clock starts: shim.ts creates both at boot.
export function createHostRelay(
  domains: string[],
  scope: Window = window,
  clock: SessionClock = createSessionClock(),
): HostRelay {
  // Nothing to relay to: this page was opened directly rather than framed by a
  // dispatch package. That is the manual test path, and the ordinary case in
  // development.
  if (scope.parent === scope) {
    return { progress: () => {}, finish: () => {} };
  }

  let hostOrigin: string | null = null;
  let pending: { type: "progress" | "finish"; values: DataModel } | null = null;
  let done = false;

  function post(type: "progress" | "finish", values: DataModel) {
    // LMSFinish drives onCommit and then onFinish, so a progress message
    // always trails the finish it belongs to. The host has been told the
    // session ended; nothing after that is news.
    if (done) return;

    if (!hostOrigin) {
      // Hold the newest only. A launcher that says hello late still gets the
      // current state, and a queued finish is never overwritten by the
      // progress snapshot that trails it.
      if (!(pending?.type === "finish" && type === "progress")) pending = { type, values };
      return;
    }

    if (type === "finish") done = true;
    scope.parent.postMessage(
      { source: SOURCE, type, version: PROTOCOL_VERSION, values },
      hostOrigin,
    );
  }

  scope.addEventListener("message", (event: MessageEvent) => {
    const message = event.data as { source?: string; type?: string } | null;
    if (!message || message.source !== SOURCE || message.type !== "host-hello") return;

    if (!hostAllowed(event.origin, domains)) {
      console.warn("openscorm dispatch: refused a launcher handshake from", event.origin);
      return;
    }

    // Pinned on the first accepted hello. Everything afterward goes to that
    // origin and nowhere else, whatever a second frame claims to be.
    hostOrigin ??= event.origin;
    if (event.origin !== hostOrigin) return;

    scope.parent.postMessage(
      { source: SOURCE, type: "shim-hello", version: PROTOCOL_VERSION },
      hostOrigin,
    );

    if (pending) {
      const queued = pending;
      pending = null;
      post(queued.type, queued.values);
    }
  });

  return {
    progress: (data) => post("progress", pick(data, RELAYED_ELEMENTS, clock)),
    finish: (data) => {
      // The sitting ends when the course finishes, not when a late hello
      // finally lets the queued finish go out.
      clock.stop();
      post("finish", pick(data, RELAYED_ELEMENTS, clock));
    },
  };
}
