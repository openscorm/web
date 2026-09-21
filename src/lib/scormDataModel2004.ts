// SCORM 2004 data model and runtime state machine (step 2 of the 2004 plan).
// Sibling to scormDataModel.ts, deliberately not a replacement for it: the two
// standards differ enough that one module serving both would be a switch
// statement wearing a trench coat. Transport-free on the same principle as the
// 1.2 module, so the session player and the dispatch content shim can each
// wire it to their own persistence.
//
// Three differences from the 1.2 module are worth knowing before reading:
//
// 1. The API surface is renamed, not just extended. A 2004 SCO calls
//    Initialize/Terminate/GetValue/SetValue/Commit and finds the runtime at
//    window.API_1484_11, not window.API.
//
// 2. There is no lesson_status. Completion and success are orthogonal in 2004:
//    cmi.completion_status says whether the learner finished, cmi.success_status
//    says whether they passed. A course can be complete and failed. Projecting
//    those two axes onto the platform's single lesson_status column is step 4
//    and is deliberately not done here.
//
// 3. Durations are ISO 8601 ("PT1H30M15S"), not the 1.2 "HHHH:MM:SS.SS".
//
// Error codes follow IEEE 1484.11.2. They are NOT the 1.2 codes: a get before
// Initialize is 122 here and 301 there, and 403/404/405 mean different things
// in each standard. Do not copy an error code between the two modules.

import { createSessionClock } from "./sessionDuration";

export type DataModel = Record<string, string>;

export interface Scorm2004Runtime {
  Initialize(param: string): "true" | "false";
  Terminate(param: string): "true" | "false";
  GetValue(element: string): string;
  SetValue(element: string, value: string): "true" | "false";
  Commit(param: string): "true" | "false";
  GetLastError(): string;
  GetErrorString(errorCode: string): string;
  GetDiagnostic(errorCode: string): string;
}

export interface Scorm2004ApiOptions {
  // Named for the data model elements they populate (cmi.learner_id,
  // cmi.learner_name) rather than the 1.2 module's studentId/studentName, so
  // this file reads against the specification without translation.
  learnerId: string;
  learnerName: string;

  // Server state merged over the defaults before the SCO initializes.
  initialData?: DataModel;

  // Clock behind the measured-duration fallback, injectable for tests.
  now?: () => number;

  // Handed the runtime's snapshot function once, at construction. See the 1.2
  // module for why the transport needs a fresh snapshot at unload rather than
  // the last one it kept.
  exposeSnapshot?: (snapshot: () => DataModel) => void;

  // Called after every successful SetValue.
  onDirty?: (data: DataModel) => void;

  // Called on Commit and Terminate with the full current model.
  onCommit: (data: DataModel) => void;

  // Called on Terminate only, after onCommit. The dispatch launcher needs the
  // distinction for the same reason it does in 1.2: it reports a final result
  // to the host LMS exactly once.
  onFinish?: (data: DataModel) => void;
}

// --- error codes ------------------------------------------------------------

export const scorm2004ErrorStrings: Record<string, string> = {
  "0": "No error",
  "101": "General exception",
  "102": "General initialization failure",
  "103": "Already initialized",
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

const OK = "0";

// --- ISO 8601 durations -----------------------------------------------------

// SCORM 2004 timeinterval: P[yY][mM][dD][T[hH][mM][s[.s]S]], seconds carrying
// at most two decimal places.
const DURATION_PATTERN =
  /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d{1,2})?)S)?)?$/;

export function isValidDuration(value: string): boolean {
  // "P" and "PT" parse against the pattern but carry no components, and a
  // trailing "T" promises a time part that is not there.
  if (!DURATION_PATTERN.test(value)) return false;
  if (!/\d/.test(value)) return false;
  if (value.endsWith("T")) return false;
  return true;
}

const SECONDS_PER_DAY = 86_400;

export function durationToSeconds(value: string): number | null {
  if (!isValidDuration(value)) return null;

  const m = DURATION_PATTERN.exec(value);
  if (!m) return null;

  const [, years, months, days, hours, minutes, seconds] = m;

  // Years and months are calendar quantities with no fixed length, so any
  // conversion is an approximation. Real content never emits them (ADL's own
  // examples are PT-only), but a package that does must not silently produce
  // NaN, so they are converted at 365 and 30 days and that choice is written
  // down here rather than discovered later.
  let total = 0;
  if (years) total += Number(years) * 365 * SECONDS_PER_DAY;
  if (months) total += Number(months) * 30 * SECONDS_PER_DAY;
  if (days) total += Number(days) * SECONDS_PER_DAY;
  if (hours) total += Number(hours) * 3600;
  if (minutes) total += Number(minutes) * 60;
  if (seconds) total += Number(seconds);

  return total;
}

export function secondsToDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "PT0H0M0S";

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Hours are not rolled into days. "PT36H" is valid ISO 8601 and unambiguous,
  // whereas "P1DT12H" invites a reader to wonder whether the day is 24 hours.
  const rendered = Number.isInteger(seconds)
    ? String(seconds)
    : seconds.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");

  return `PT${hours}H${minutes}M${rendered}S`;
}

// --- vocabularies -----------------------------------------------------------

const COMPLETION_STATUS = ["completed", "incomplete", "not attempted", "unknown"];
const SUCCESS_STATUS = ["passed", "failed", "unknown"];
const EXIT = ["time-out", "suspend", "logout", "normal", ""];
const MODE = ["browse", "normal", "review"];
const CREDIT = ["credit", "no-credit"];
const TIME_LIMIT_ACTION = [
  "exit,message",
  "continue,message",
  "exit,no message",
  "continue,no message",
];
const INTERACTION_TYPE = [
  "true-false",
  "choice",
  "fill-in",
  "long-fill-in",
  "likert",
  "matching",
  "performance",
  "sequencing",
  "numeric",
  "other",
];
const INTERACTION_RESULT = ["correct", "incorrect", "unanticipated", "neutral"];
const NAV_REQUEST = [
  "continue",
  "previous",
  "exit",
  "exitAll",
  "abandon",
  "abandonAll",
  "suspendAll",
  "_none_",
];

// A validator answers with an error code, or null when the value is acceptable.
type Validator = (value: string) => string | null;

function vocabulary(allowed: string[]): Validator {
  return (value) => (allowed.includes(value) ? null : "406");
}

function real(): Validator {
  return (value) => (value !== "" && Number.isFinite(Number(value)) ? null : "406");
}

function realInRange(min: number, max: number): Validator {
  return (value) => {
    if (value === "" || !Number.isFinite(Number(value))) return "406";
    const n = Number(value);
    return n >= min && n <= max ? null : "407";
  };
}

function duration(): Validator {
  return (value) => (isValidDuration(value) ? null : "406");
}

function maxLength(limit: number): Validator {
  // The specification calls this the smallest permitted maximum: a value longer
  // than the SPM is out of range rather than the wrong type.
  return (value) => (value.length <= limit ? null : "407");
}

// time(second,10,0): an ISO 8601 combined date and time, optionally zoned.
const TIMESTAMP_PATTERN =
  /^\d{4}(-\d{2}(-\d{2}(T\d{2}(:\d{2}(:\d{2}(\.\d{1,2})?)?)?(Z|[+-]\d{2}(:\d{2})?)?)?)?)?$/;

function timestamp(): Validator {
  return (value) => (TIMESTAMP_PATTERN.test(value) ? null : "406");
}

function interactionResult(): Validator {
  // Either a vocabulary token or a real number, which is how a scored
  // performance interaction reports its outcome.
  return (value) =>
    INTERACTION_RESULT.includes(value) || (value !== "" && Number.isFinite(Number(value)))
      ? null
      : "406";
}

function anyText(): Validator {
  return () => null;
}

// --- element specifications -------------------------------------------------

type Access = "ro" | "wo" | "rw";

interface ElementSpec {
  access: Access;
  validate?: Validator;
}

const SUSPEND_DATA_SPM = 64_000;

const SCALARS: Record<string, ElementSpec> = {
  "cmi._version": { access: "ro" },
  "cmi.completion_status": { access: "rw", validate: vocabulary(COMPLETION_STATUS) },
  "cmi.completion_threshold": { access: "ro" },
  "cmi.credit": { access: "ro", validate: vocabulary(CREDIT) },
  "cmi.entry": { access: "ro" },
  "cmi.exit": { access: "wo", validate: vocabulary(EXIT) },
  "cmi.launch_data": { access: "ro" },
  "cmi.learner_id": { access: "ro" },
  "cmi.learner_name": { access: "ro" },
  "cmi.learner_preference.audio_level": { access: "rw", validate: realInRange(0, Infinity) },
  "cmi.learner_preference.language": { access: "rw", validate: anyText() },
  "cmi.learner_preference.delivery_speed": { access: "rw", validate: realInRange(0, Infinity) },
  "cmi.learner_preference.audio_captioning": {
    access: "rw",
    validate: vocabulary(["-1", "0", "1"]),
  },
  "cmi.location": { access: "rw", validate: maxLength(1000) },
  "cmi.max_time_allowed": { access: "ro" },
  "cmi.mode": { access: "ro", validate: vocabulary(MODE) },
  "cmi.progress_measure": { access: "rw", validate: realInRange(0, 1) },
  "cmi.scaled_passing_score": { access: "ro" },
  "cmi.score.scaled": { access: "rw", validate: realInRange(-1, 1) },
  "cmi.score.raw": { access: "rw", validate: real() },
  "cmi.score.min": { access: "rw", validate: real() },
  "cmi.score.max": { access: "rw", validate: real() },
  "cmi.session_time": { access: "wo", validate: duration() },
  "cmi.success_status": { access: "rw", validate: vocabulary(SUCCESS_STATUS) },
  "cmi.suspend_data": { access: "rw", validate: maxLength(SUSPEND_DATA_SPM) },
  "cmi.time_limit_action": { access: "ro", validate: vocabulary(TIME_LIMIT_ACTION) },
  "cmi.total_time": { access: "ro" },
  "adl.nav.request": { access: "rw", validate: vocabulary(NAV_REQUEST) },
};

// Read-only lists the specification fixes verbatim.
const CHILDREN: Record<string, string> = {
  "cmi._children":
    "comments_from_learner,comments_from_lms,completion_status,completion_threshold,credit,entry," +
    "exit,interactions,launch_data,learner_id,learner_name,learner_preference,location," +
    "max_time_allowed,mode,objectives,progress_measure,scaled_passing_score,score,session_time," +
    "success_status,suspend_data,time_limit_action,total_time",
  "cmi.score._children": "scaled,raw,min,max",
  "cmi.learner_preference._children": "audio_level,language,delivery_speed,audio_captioning",
  "cmi.objectives._children":
    "id,score,success_status,completion_status,progress_measure,description",
  "cmi.interactions._children":
    "id,type,objectives,timestamp,correct_responses,weighting,learner_response,result,latency,description",
  "cmi.comments_from_learner._children": "comment,location,timestamp",
  "cmi.comments_from_lms._children": "comment,location,timestamp",
};

// Collections addressed as cmi.<name>.<index>.<child>.
interface CollectionSpec {
  access: Access;
  children: Record<string, ElementSpec>;
  // Children that may not be written until this collection entry has an id.
  requiresId: boolean;
  // Fixed _children lists that live inside an entry rather than on the
  // collection, such as cmi.objectives.n.score._children. Without these the
  // address parses as an ordinary child, finds no stored value, and answers
  // 403 for an element the specification says is always readable.
  childrenLists?: Record<string, string>;
  // Nested collections, addressed as cmi.<name>.<i>.<sub>.<j>.<child>.
  nested?: Record<string, { children: Record<string, ElementSpec>; childrenList: string }>;
}

const COLLECTIONS: Record<string, CollectionSpec> = {
  "cmi.objectives": {
    access: "rw",
    requiresId: true,
    children: {
      id: { access: "rw", validate: maxLength(4000) },
      "score.scaled": { access: "rw", validate: realInRange(-1, 1) },
      "score.raw": { access: "rw", validate: real() },
      "score.min": { access: "rw", validate: real() },
      "score.max": { access: "rw", validate: real() },
      success_status: { access: "rw", validate: vocabulary(SUCCESS_STATUS) },
      completion_status: { access: "rw", validate: vocabulary(COMPLETION_STATUS) },
      progress_measure: { access: "rw", validate: realInRange(0, 1) },
      description: { access: "rw", validate: maxLength(250) },
    },
    childrenLists: { "score._children": "scaled,raw,min,max" },
  },
  "cmi.interactions": {
    access: "rw",
    requiresId: true,
    children: {
      id: { access: "rw", validate: maxLength(4000) },
      type: { access: "rw", validate: vocabulary(INTERACTION_TYPE) },
      timestamp: { access: "rw", validate: timestamp() },
      weighting: { access: "rw", validate: real() },
      learner_response: { access: "rw", validate: anyText() },
      result: { access: "rw", validate: interactionResult() },
      latency: { access: "rw", validate: duration() },
      description: { access: "rw", validate: maxLength(250) },
    },
    nested: {
      objectives: {
        children: { id: { access: "rw", validate: maxLength(4000) } },
        childrenList: "id",
      },
      correct_responses: {
        children: { pattern: { access: "rw", validate: anyText() } },
        childrenList: "pattern",
      },
    },
  },
  "cmi.comments_from_learner": {
    access: "rw",
    requiresId: false,
    children: {
      comment: { access: "rw", validate: maxLength(4000) },
      location: { access: "rw", validate: maxLength(250) },
      timestamp: { access: "rw", validate: timestamp() },
    },
  },
  "cmi.comments_from_lms": {
    access: "ro",
    requiresId: false,
    children: {
      comment: { access: "ro" },
      location: { access: "ro" },
      timestamp: { access: "ro" },
    },
  },
};

export function createDefault2004DataModel(learnerId: string, learnerName: string): DataModel {
  return {
    "cmi._version": "1.0",
    "cmi.completion_status": "unknown",
    "cmi.credit": "credit",
    "cmi.entry": "ab-initio",
    "cmi.launch_data": "",
    "cmi.learner_id": learnerId,
    "cmi.learner_name": learnerName,
    "cmi.learner_preference.audio_level": "1",
    "cmi.learner_preference.language": "",
    "cmi.learner_preference.delivery_speed": "1",
    "cmi.learner_preference.audio_captioning": "0",
    "cmi.location": "",
    "cmi.mode": "normal",
    "cmi.success_status": "unknown",
    "cmi.suspend_data": "",
    "cmi.total_time": "PT0H0M0S",
    "adl.nav.request": "_none_",
  };
}

// --- element addressing -----------------------------------------------------

interface CollectionAddress {
  collection: string;
  spec: CollectionSpec;
  index: number;
  child: string;
  // Set when the address reaches into a nested collection.
  nested?: { name: string; index: number; child: string };
}

type Parsed =
  | { kind: "scalar"; name: string; spec: ElementSpec }
  | { kind: "children"; value: string }
  | { kind: "count"; collection: string; nestedOf?: { collection: string; index: number } }
  | { kind: "collection"; address: CollectionAddress }
  | { kind: "unknown" };

function parseElement(element: string): Parsed {
  if (Object.prototype.hasOwnProperty.call(CHILDREN, element)) {
    return { kind: "children", value: CHILDREN[element] };
  }

  if (Object.prototype.hasOwnProperty.call(SCALARS, element)) {
    return { kind: "scalar", name: element, spec: SCALARS[element] };
  }

  // cmi.objectives._count, cmi.interactions._count
  for (const collection of Object.keys(COLLECTIONS)) {
    if (element === `${collection}._count`) return { kind: "count", collection };
  }

  // Everything below is cmi.<collection>.<index>...
  const collectionName = Object.keys(COLLECTIONS).find((c) => element.startsWith(`${c}.`));
  if (!collectionName) return { kind: "unknown" };

  const spec = COLLECTIONS[collectionName];
  const rest = element.slice(collectionName.length + 1);
  const dot = rest.indexOf(".");
  if (dot === -1) return { kind: "unknown" };

  const indexText = rest.slice(0, dot);
  if (!/^\d+$/.test(indexText)) return { kind: "unknown" };
  const index = Number(indexText);

  const child = rest.slice(dot + 1);

  // A fixed child list inside an entry, such as objectives.n.score._children.
  if (spec.childrenLists && Object.prototype.hasOwnProperty.call(spec.childrenLists, child)) {
    return { kind: "children", value: spec.childrenLists[child] };
  }

  // Nested collection: cmi.interactions.0.objectives._count / .0.id
  if (spec.nested) {
    for (const nestedName of Object.keys(spec.nested)) {
      if (child === `${nestedName}._count`) {
        return {
          kind: "count",
          collection: nestedName,
          nestedOf: { collection: collectionName, index },
        };
      }
      if (child === `${nestedName}._children`) {
        return { kind: "children", value: spec.nested[nestedName].childrenList };
      }
      if (child.startsWith(`${nestedName}.`)) {
        const nestedRest = child.slice(nestedName.length + 1);
        const nestedDot = nestedRest.indexOf(".");
        if (nestedDot === -1) return { kind: "unknown" };

        const nestedIndexText = nestedRest.slice(0, nestedDot);
        if (!/^\d+$/.test(nestedIndexText)) return { kind: "unknown" };

        const nestedChild = nestedRest.slice(nestedDot + 1);
        if (!Object.prototype.hasOwnProperty.call(spec.nested[nestedName].children, nestedChild)) {
          return { kind: "unknown" };
        }

        return {
          kind: "collection",
          address: {
            collection: collectionName,
            spec,
            index,
            child,
            nested: { name: nestedName, index: Number(nestedIndexText), child: nestedChild },
          },
        };
      }
    }
  }

  if (!Object.prototype.hasOwnProperty.call(spec.children, child)) return { kind: "unknown" };

  return { kind: "collection", address: { collection: collectionName, spec, index, child } };
}

// --- runtime ----------------------------------------------------------------

export function createScorm2004Api(opts: Scorm2004ApiOptions): Scorm2004Runtime {
  const dataModel = createDefault2004DataModel(opts.learnerId, opts.learnerName);

  if (opts.initialData) {
    for (const key in opts.initialData) {
      if (Object.prototype.hasOwnProperty.call(opts.initialData, key) && opts.initialData[key]) {
        dataModel[key] = opts.initialData[key];
      }
    }
  }

  // total_time is the accumulation across every prior session. Held separately
  // so that setting session_time twice in one sitting recomputes rather than
  // accumulates: the 1.2 module adds each set into the running total, which
  // double counts a SCO that reports its time more than once. Recomputing from
  // the session's starting total is idempotent, which is the property that
  // makes the difference invisible when a SCO behaves and correct when it
  // does not.
  const totalTimeAtStart = durationToSeconds(dataModel["cmi.total_time"] ?? "PT0H0M0S") ?? 0;

  // The sitting we measure ourselves, and whether the SCO has reported one
  // of its own. See sessionDuration.ts for why the LMS keeps a clock at all.
  const clock = createSessionClock(opts.now);
  let sessionTimeReported = false;

  let initialized = false;
  let terminated = false;
  let lastError = OK;

  // Collection sizes are derived from the keys present rather than trusted
  // from a stored _count, so a partially written model heals itself on load.
  function countOf(prefix: string): number {
    let highest = -1;
    const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(\\d+)\\.`);
    for (const key in dataModel) {
      const m = pattern.exec(key);
      if (m) highest = Math.max(highest, Number(m[1]));
    }
    return highest + 1;
  }

  function snapshot(): DataModel {
    const clean: DataModel = {};
    for (const k in dataModel) {
      if (Object.prototype.hasOwnProperty.call(dataModel, k)) {
        const v = dataModel[k];
        clean[k] = v == null ? "" : String(v);
      }
    }
    // Counts are derived, but persisting them keeps a stored model readable by
    // anything that does not want to re-derive.
    for (const collection of Object.keys(COLLECTIONS)) {
      clean[`${collection}._count`] = String(countOf(collection));
    }

    // Only the snapshot carries the measured time, never the data model the
    // SCO reads: total_time is the accumulation across PRIOR sessions, and a
    // SCO that asks for it mid-session must not be told about this one.
    if (!sessionTimeReported) {
      clean["cmi.total_time"] = secondsToDuration(totalTimeAtStart + clock.elapsedSeconds());
    }

    return clean;
  }

  function fail(code: string): "false" {
    lastError = code;
    return "false";
  }

  opts.exposeSnapshot?.(snapshot);

  return {
    Initialize(param: string) {
      if (param !== "") return fail("201");
      if (terminated) return fail("104");
      if (initialized) return fail("103");

      initialized = true;
      lastError = OK;
      return "true";
    },

    Terminate(param: string) {
      if (param !== "") return fail("201");
      if (terminated) return fail("113");
      if (!initialized) return fail("112");

      // The sitting is over at Terminate, so the measurement stops here and
      // not whenever the last snapshot happens to be taken.
      clock.stop();
      const final = snapshot();
      opts.onCommit(final);
      opts.onFinish?.(final);

      terminated = true;
      initialized = false;
      lastError = OK;
      return "true";
    },

    GetValue(element: string) {
      if (terminated) {
        lastError = "123";
        return "";
      }
      if (!initialized) {
        lastError = "122";
        return "";
      }
      if (element === "") {
        lastError = "301";
        return "";
      }

      const parsed = parseElement(element);

      if (parsed.kind === "unknown") {
        lastError = "401";
        return "";
      }

      if (parsed.kind === "children") {
        lastError = OK;
        return parsed.value;
      }

      if (parsed.kind === "count") {
        lastError = OK;
        const prefix = parsed.nestedOf
          ? `${parsed.nestedOf.collection}.${parsed.nestedOf.index}.${parsed.collection}`
          : parsed.collection;
        return String(countOf(prefix));
      }

      if (parsed.kind === "scalar") {
        if (parsed.spec.access === "wo") {
          lastError = "405";
          return "";
        }
        const stored = dataModel[element];
        if (stored === undefined) {
          lastError = "403";
          return "";
        }
        lastError = OK;
        return stored;
      }

      // Collection element.
      const { address } = parsed;
      const spec = address.nested
        ? address.spec.nested![address.nested.name].children[address.nested.child]
        : address.spec.children[address.child];

      if (spec.access === "wo") {
        lastError = "405";
        return "";
      }

      const size = address.nested
        ? countOf(`${address.collection}.${address.index}.${address.nested.name}`)
        : countOf(address.collection);
      const index = address.nested ? address.nested.index : address.index;

      if (index >= size) {
        lastError = "301";
        return "";
      }

      const stored = dataModel[element];
      if (stored === undefined) {
        lastError = "403";
        return "";
      }

      lastError = OK;
      return stored;
    },

    SetValue(element: string, value: string) {
      if (terminated) return fail("133");
      if (!initialized) return fail("132");
      if (element === "") return fail("351");

      const text = value == null ? "" : String(value);
      const parsed = parseElement(element);

      if (parsed.kind === "unknown") return fail("401");
      if (parsed.kind === "children" || parsed.kind === "count") return fail("404");

      if (parsed.kind === "scalar") {
        if (parsed.spec.access === "ro") return fail("404");

        const problem = parsed.spec.validate?.(text);
        if (problem) return fail(problem);

        dataModel[element] = text;

        if (element === "cmi.session_time") {
          sessionTimeReported = true;
          const session = durationToSeconds(text) ?? 0;
          dataModel["cmi.total_time"] = secondsToDuration(totalTimeAtStart + session);
        }

        lastError = OK;
        if (opts.onDirty) opts.onDirty(snapshot());
        return "true";
      }

      const { address } = parsed;
      const spec = address.nested
        ? address.spec.nested![address.nested.name].children[address.nested.child]
        : address.spec.children[address.child];

      if (address.spec.access === "ro" || spec.access === "ro") return fail("404");

      // An index may address an existing entry or append exactly one past the
      // end. Anything further would leave a hole in the collection.
      const size = countOf(address.collection);
      if (address.index > size) return fail("351");

      if (address.nested) {
        const nestedPrefix = `${address.collection}.${address.index}.${address.nested.name}`;
        const nestedSize = countOf(nestedPrefix);
        if (address.nested.index > nestedSize) return fail("351");
      }

      // Dependency rules. The identifier names the thing every other field
      // describes, so writing a description before an id leaves a record that
      // cannot be reconciled with anything.
      if (address.spec.requiresId) {
        const idKey = `${address.collection}.${address.index}.id`;
        const writingId = address.child === "id";
        if (!writingId && dataModel[idKey] === undefined) return fail("408");

        // learner_response is parsed according to the interaction's type, so
        // the type has to exist before a response can be judged against it.
        if (address.collection === "cmi.interactions" && address.child === "learner_response") {
          if (dataModel[`${address.collection}.${address.index}.type`] === undefined) {
            return fail("408");
          }
        }
      }

      const problem = spec.validate?.(text);
      if (problem) return fail(problem);

      dataModel[element] = text;
      lastError = OK;
      if (opts.onDirty) opts.onDirty(snapshot());
      return "true";
    },

    Commit(param: string) {
      if (param !== "") return fail("201");
      if (terminated) return fail("143");
      if (!initialized) return fail("142");

      opts.onCommit(snapshot());
      lastError = OK;
      return "true";
    },

    GetLastError() {
      return lastError;
    },

    GetErrorString(errorCode: string) {
      return scorm2004ErrorStrings[errorCode] ?? "";
    },

    GetDiagnostic(errorCode: string) {
      // No vendor-specific diagnostics. The specification permits returning the
      // error string, and returning something is friendlier to a SCO that logs
      // whatever it gets than returning an empty string.
      return scorm2004ErrorStrings[errorCode] ?? "";
    },
  };
}
