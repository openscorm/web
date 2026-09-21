// SCORM 1.2 data model and runtime state machine, extracted from scormApi.ts
// Transport-free on purpose: the session player wires it to
// the /api/progress/scorm endpoints, and the dispatch content shim wires the
// same semantics to the token-scoped relay endpoints. Two divergent copies of
// the error-code and time-accumulation logic is a bug factory; this is the
// single copy. Behavior is verbatim from the PlayScorm.js port - do not
// "fix" SCORM quirks here without checking both consumers.

import { createSessionClock } from "./sessionDuration";

export type DataModel = Record<string, string>;

export interface ScormRuntime {
  LMSInitialize(param: string): "true" | "false";
  LMSFinish(param: string): "true" | "false";
  LMSGetValue(element: string): string;
  LMSSetValue(element: string, value: string): "true" | "false";
  LMSCommit(param: string): "true" | "false";
  LMSGetLastError(): string;
  LMSGetErrorString(errorCode: string): string;
  LMSGetDiagnostic(errorCode: string): string;
}

export interface ScormApiOptions {
  studentId: string;
  studentName: string;

  // Server state merged over the defaults before the SCO initializes.
  initialData?: DataModel;

  // Clock behind the measured-duration fallback, injectable for tests.
  now?: () => number;

  // Handed the runtime's snapshot function once, at construction. The session
  // player's transport needs it to take a FRESH snapshot when the page is
  // being torn down: the last one it happened to keep was taken at the last
  // LMSSetValue, so flushing that on unload reports the time as of whenever
  // the course last wrote something rather than as of the learner leaving.
  exposeSnapshot?: (snapshot: () => DataModel) => void;

  // Called after every successful LMSSetValue. The session player uses this
  // for its probabilistic save; the dispatch shim debounces instead.
  onDirty?: (data: DataModel) => void;

  // Called on LMSCommit and LMSFinish with the full current model. This is
  // the transport seam: persist the snapshot however the host runtime does.
  onCommit: (data: DataModel) => void;

  // Called on LMSFinish only, after onCommit. The dispatch launcher needs the
  // distinction because cmi.core.session_time is write-once in SCORM 1.2: a
  // host LMS told it on every commit accumulates total_time several times over
  // for one sitting. The session player has no host to tell and omits this.
  onFinish?: (data: DataModel) => void;
}

export const scormErrorStrings: Record<string, string> = {
  "0": "No error",
  "101": "General exception",
  "102": "General initialization failure",
  "103": "Already terminated",
  "104": "Content instance terminated",
  "111": "General termination failure",
  "112": "Termination before initialization",
  "113": "Termination after termination",
  "122": "Retrieve data before initialization",
  "123": "Retrieve data after termination",
  "132": "Store data before initialization",
  "133": "Store data after termination",
  "142": "Commit before initialization",
  "143": "Commit after termination",
  "201": "General argument error",
  "301": "General get failure",
  "351": "General set failure",
  "391": "General commit failure",
  "401": "Undefined data model element",
  "402": "Unimplemented data model element",
  "403": "Data model element value not initialized",
  "404": "Data model element is read only",
  "405": "Data model element is write only",
  "406": "Data model element type mismatch",
  "407": "Data model element value out of range",
  "408": "Data model dependency not established",
};

export function isValidScormTime(time: string): boolean {
  return /^\d{2,4}:\d{2}:\d{2}(\.\d{1,2})?$/.test(time);
}

export function accumulateTotalTime(total: string, session: string): string {
  const totalParts = total.split(":");
  const sessionParts = session.split(":");
  const totalSeconds =
    parseInt(totalParts[0]) * 3600 + parseInt(totalParts[1]) * 60 + parseFloat(totalParts[2]);
  const sessionSeconds =
    parseInt(sessionParts[0]) * 3600 + parseInt(sessionParts[1]) * 60 + parseFloat(sessionParts[2]);
  const newTotal = totalSeconds + sessionSeconds;
  const hours = Math.floor(newTotal / 3600);
  const minutes = Math.floor((newTotal % 3600) / 60);
  const seconds = newTotal % 60;
  return (
    String(hours).padStart(4, "0") +
    ":" +
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds.toFixed(2)).padStart(5, "0")
  );
}

/** Seconds as the 1.2 timespan format, hhhh:mm:ss.ss. */
export function secondsToScormTime(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return (
    String(hours).padStart(4, "0") +
    ":" +
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds.toFixed(2)).padStart(5, "0")
  );
}

export function createDefaultDataModel(studentId: string, studentName: string): DataModel {
  return {
    "cmi.core.student_id": studentId,
    "cmi.core.student_name": studentName,
    "cmi.core.lesson_location": "",
    "cmi.core.credit": "credit",
    "cmi.core.lesson_status": "not attempted",
    "cmi.core.entry": "ab-initio",
    "cmi.core.score.raw": "",
    "cmi.core.score.max": "",
    "cmi.core.score.min": "",
    "cmi.core.total_time": "0000:00:00",
    "cmi.core.lesson_mode": "normal",
    "cmi.core.exit": "",
    "cmi.core.session_time": "0000:00:00",
    "cmi.launch_data": "",
    "cmi.comments": "",
    "cmi.comments_from_lms": "",
    "cmi.objectives._count": "0",
    "cmi.student_data.mastery_score": "",
    "cmi.student_data.max_time_allowed": "",
    "cmi.student_data.time_limit_action": "",
    "cmi.student_preference.audio": "0",
    "cmi.student_preference.language": "",
    "cmi.student_preference.speed": "0",
    "cmi.student_preference.text": "0",
    "cmi.interactions._count": "0",
    "cmi.suspend_data": "",
  };
}

export function createScormApi(opts: ScormApiOptions): ScormRuntime {
  const dataModel = createDefaultDataModel(opts.studentId, opts.studentName);
  if (opts.initialData) {
    for (const key in opts.initialData) {
      if (Object.prototype.hasOwnProperty.call(opts.initialData, key) && opts.initialData[key]) {
        dataModel[key] = opts.initialData[key];
      }
    }
  }

  // The sitting we measure ourselves, and whether the SCO has reported one
  // of its own. See sessionDuration.ts for why the LMS keeps a clock at all.
  const clock = createSessionClock(opts.now);
  const totalTimeAtStart = dataModel["cmi.core.total_time"] || "0000:00:00";
  let sessionTimeReported = false;

  let initialized = false;
  let finished = false;
  let lastError = "0";

  // Snapshot with every value coerced to a string. SCO packages sometimes
  // call LMSSetValue with null/undefined despite the signature, and the
  // server rejects non-string JSON values with a 400.
  function snapshot(): DataModel {
    const clean: DataModel = {};
    for (const k in dataModel) {
      if (Object.prototype.hasOwnProperty.call(dataModel, k)) {
        const v = dataModel[k];
        clean[k] = v == null ? "" : String(v);
      }
    }

    // Only the snapshot carries the measured time, never the data model the
    // SCO reads: total_time is the accumulation across PRIOR sessions, and a
    // SCO that asks for it mid-session must not be told about this one.
    if (!sessionTimeReported) {
      clean["cmi.core.total_time"] = accumulateTotalTime(
        totalTimeAtStart,
        secondsToScormTime(clock.elapsedSeconds()),
      );
    }

    return clean;
  }

  opts.exposeSnapshot?.(snapshot);

  return {
    LMSInitialize(param: string) {
      if (initialized) {
        lastError = "101";
        return "false";
      }
      if (param !== "") {
        lastError = "201";
        return "false";
      }
      initialized = true;
      lastError = "0";
      return "true";
    },

    LMSFinish(param: string) {
      if (!initialized) {
        lastError = "301";
        return "false";
      }
      if (finished) {
        lastError = "103";
        return "false";
      }
      if (param !== "") {
        lastError = "201";
        return "false";
      }
      // The sitting is over at LMSFinish, so the measurement stops here and
      // not whenever the last snapshot happens to be taken.
      clock.stop();
      const final = snapshot();
      opts.onCommit(final);
      opts.onFinish?.(final);
      finished = true;
      initialized = false;
      lastError = "0";
      return "true";
    },

    LMSGetValue(element: string) {
      if (!initialized) {
        lastError = "301";
        return "";
      }
      if (finished) {
        lastError = "103";
        return "";
      }
      if (element in dataModel) {
        lastError = "0";
        return dataModel[element];
      }
      if (element.indexOf("cmi.objectives.") === 0 || element.indexOf("cmi.interactions.") === 0) {
        lastError = "0";
        return "";
      }
      lastError = "401";
      return "";
    },

    LMSSetValue(element: string, value: string) {
      if (!initialized) {
        lastError = "301";
        return "false";
      }
      if (finished) {
        lastError = "103";
        return "false";
      }

      switch (element) {
        case "cmi.core.lesson_status":
          if (
            ["passed", "completed", "failed", "incomplete", "browsed", "not attempted"].indexOf(
              value,
            ) === -1
          ) {
            lastError = "405";
            return "false";
          }
          dataModel[element] = value;
          break;

        case "cmi.core.score.raw":
        case "cmi.core.score.min":
        case "cmi.core.score.max":
          if (isNaN(Number(value))) {
            lastError = "405";
            return "false";
          }
          dataModel[element] = value;
          break;

        case "cmi.core.exit":
          if (["time-out", "suspend", "logout", ""].indexOf(value) === -1) {
            lastError = "405";
            return "false";
          }
          dataModel[element] = value;
          break;

        case "cmi.core.session_time":
          if (!isValidScormTime(value)) {
            lastError = "405";
            return "false";
          }
          dataModel[element] = value;
          sessionTimeReported = true;
          dataModel["cmi.core.total_time"] = accumulateTotalTime(
            dataModel["cmi.core.total_time"],
            value,
          );
          break;

        case "cmi.core.lesson_location":
        case "cmi.suspend_data":
        case "cmi.comments":
          dataModel[element] = value;
          break;

        case "cmi.core.student_id":
        case "cmi.core.student_name":
        case "cmi.core.credit":
        case "cmi.core.entry":
        case "cmi.core.total_time":
        case "cmi.core.lesson_mode":
          lastError = "403";
          return "false";

        default:
          if (
            element.indexOf("cmi.objectives.") === 0 ||
            element.indexOf("cmi.interactions.") === 0
          ) {
            // Deliberately returns without onDirty: the original runtime's
            // probabilistic save never fired for the array elements, and the
            // session player must keep byte-identical save timing.
            dataModel[element] = value;
            lastError = "0";
            return "true";
          }
          lastError = "401";
          return "false";
      }

      lastError = "0";
      if (opts.onDirty) opts.onDirty(snapshot());
      return "true";
    },

    LMSCommit(param: string) {
      if (!initialized) {
        lastError = "301";
        return "false";
      }
      if (finished) {
        lastError = "103";
        return "false";
      }
      if (param !== "") {
        lastError = "201";
        return "false";
      }
      opts.onCommit(snapshot());
      lastError = "0";
      return "true";
    },

    LMSGetLastError() {
      return lastError;
    },
    LMSGetErrorString(code: string) {
      return scormErrorStrings[code] ?? "Unknown error";
    },
    LMSGetDiagnostic(code: string) {
      return scormErrorStrings[code] ?? "Unknown error";
    },
  };
}
