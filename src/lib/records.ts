// Shared shape for a learner progress record, used by the reports list and the
// learner detail view so the two render the same data the same way.

export interface RecordRow {
  enrollmentKey: number;
  enrollmentId: string;

  // Null for dispatch registrations: an external learner has no account
  // (ck_enrollment_exactly_one_principal), so there is no learner detail
  // page to link to.
  accountKey: number | null;
  learnerName: string;
  learnerEmail: string | null;

  // Set only for dispatch registrations: the client organization whose LMS
  // the learner launched from.
  clientKey: number | null;
  clientName: string | null;
  courseKey: number;
  courseTitle: string;
  courseSlug: string;
  scormVersion: string | null;
  status: string;
  score: string;
  duration: string | null;

  // Commits of progress, not SCORM attempts. The API names it saveCount for
  // the same reason: cmi_result is last-value-wins per course+account, so
  // per-attempt history does not exist to count.
  saveCount: number;

  startedAt: string;
  lastActivityAt: string;

  // The revision of the policy document this record was taken
  // against, joined from the immutable course row. Null for a course that was
  // uploaded as a package, which is why the table renders a dash rather than
  // hiding the cell: one tenant can hold both kinds.
  documentVersion: string | null;
  sourceType: string | null;
}

// SCORM 1.2 cmi.core.lesson_status carries completion and pass/fail in one
// field, which is why a single Status filter covers both.
export const STATUS_OPTIONS = [
  "passed",
  "failed",
  "completed",
  "incomplete",
  "browsed",
  "not attempted",
] as const;
