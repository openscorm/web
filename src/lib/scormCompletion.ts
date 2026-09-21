// Projects a SCORM 2004 result onto the single SCORM 1.2 lesson_status a host
// LMS understands.
//
// This is the third home of one rule. The other two are
// progress.scorm_lesson_status in SQL (migration 051), for the hosted player's
// rollup over stored cmi_result rows, and Slate.Content.ScormCompletion in C#,
// for the dispatch save. Three runtimes, one rule, and a rule written three
// times will disagree with itself eventually, so all three are asserted
// against tests/fixtures/scorm-completion-cases.json rather than against each
// other.
//
// This copy exists because the dispatch launcher runs inside the customer's
// client's LMS, was handed a SCORM 1.2 API by that LMS, and can only write
// what 1.2 understands. Relaying 2004's two axes to it would be relaying
// something it has no way to store.

import type { DataModel } from "@/lib/scormDataModel";

export const LESSON_STATUS_12 = "cmi.core.lesson_status";
export const COMPLETION_STATUS_2004 = "cmi.completion_status";
export const SUCCESS_STATUS_2004 = "cmi.success_status";

export const SCORE_RAW_12 = "cmi.core.score.raw";
export const SCORE_RAW_2004 = "cmi.score.raw";
export const SCORE_MIN_12 = "cmi.core.score.min";
export const SCORE_MIN_2004 = "cmi.score.min";
export const SCORE_MAX_12 = "cmi.core.score.max";
export const SCORE_MAX_2004 = "cmi.score.max";

export const SESSION_TIME_12 = "cmi.core.session_time";
export const SESSION_TIME_2004 = "cmi.session_time";

function normalize(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed === "" ? null : trimmed;
}

/**
 * The projected status, or null when nothing has been reported at all.
 *
 * Completion says whether the learner finished; success says how. A failure is
 * terminal and overrides everything, and a pass does not override an explicit
 * incomplete.
 */
export function projectStatus(
  completionStatus: string | undefined | null,
  successStatus: string | undefined | null,
  lessonStatus12: string | undefined | null,
): string | null {
  const completion = normalize(completionStatus);
  const success = normalize(successStatus);

  // Absent both 2004 axes this is a 1.2 payload and passes through.
  if (completion === null && success === null) return normalize(lessonStatus12);

  // A failure is terminal. Reporting a learner as complete when the course
  // said they failed is the one mistake here with a compliance consequence.
  if (success === "failed") return "failed";

  // A pass does not override an explicit incomplete: passing the quiz is not
  // finishing the course.
  if (success === "passed" && completion !== "incomplete") return "passed";

  if (completion === "completed") return "completed";
  if (completion === "not attempted") return "not attempted";

  // Everything left is underway. Unknown reads as incomplete rather than not
  // attempted, because 2004 courses commonly leave completion_status unknown
  // for the whole of an attempt that is plainly underway.
  return "incomplete";
}

const LEGACY_DURATION = /^(\d{2,4}):(\d{2}):(\d{2})(?:\.\d{1,2})?$/;
const ISO_DURATION =
  /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/**
 * Renders an accumulated or session time in the SCORM 1.2 format.
 *
 * The host LMS was handed a 1.2 API and will parse what we send it as
 * HHHH:MM:SS. An ISO 8601 duration posted into that field is either rejected
 * or silently misread as zero, and a sitting recorded as zero is worse than
 * one not recorded at all. An unparseable value is passed through rather than
 * discarded.
 */
export function toLegacyDuration(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) return null;

  const value = raw.trim();
  if (value === "") return null;
  let total = 0;
  const legacy = LEGACY_DURATION.exec(value);

  if (legacy) {
    // Re-rendered rather than returned as found. The 1.2 grammar allows two to
    // four hour digits and an optional hundredths tail, so passing a legacy
    // value straight through is how one column came to carry several shapes of
    // the same number.
    total = Number(legacy[1]) * 3600 + Number(legacy[2]) * 60 + Number(legacy[3]);
  } else {
    const m = ISO_DURATION.exec(value);
    if (!m || !/\d/.test(value)) return value;

    const [, years, months, days, hours, minutes, seconds] = m;

    if (years) total += Number(years) * 365 * 86400;
    if (months) total += Number(months) * 30 * 86400;
    if (days) total += Number(days) * 86400;
    if (hours) total += Number(hours) * 3600;
    if (minutes) total += Number(minutes) * 60;
    if (seconds) total += Number(seconds);
  }

  const h = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = Math.floor(total % 60);

  return (
    String(h).padStart(4, "0") +
    ":" +
    String(mm).padStart(2, "0") +
    ":" +
    String(ss).padStart(2, "0")
  );
}

/**
 * Rewrites a data model of either standard into the 1.2 element names a host
 * LMS can store. A 1.2 model comes back unchanged.
 */
export function toLegacyRelayModel(data: DataModel): DataModel {
  const out: DataModel = { ...data };

  const status = projectStatus(
    data[COMPLETION_STATUS_2004],
    data[SUCCESS_STATUS_2004],
    data[LESSON_STATUS_12],
  );
  if (status !== null) out[LESSON_STATUS_12] = status;

  const raw = data[SCORE_RAW_12] ?? data[SCORE_RAW_2004];
  if (raw !== undefined) out[SCORE_RAW_12] = raw;

  const min = data[SCORE_MIN_12] ?? data[SCORE_MIN_2004];
  if (min !== undefined) out[SCORE_MIN_12] = min;

  const max = data[SCORE_MAX_12] ?? data[SCORE_MAX_2004];
  if (max !== undefined) out[SCORE_MAX_12] = max;

  const session = toLegacyDuration(data[SESSION_TIME_12] ?? data[SESSION_TIME_2004]);
  if (session !== null) out[SESSION_TIME_12] = session;

  return out;
}
