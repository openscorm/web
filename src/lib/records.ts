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
  // per-attempt history does not exist to count. 0 for an assigned course the
  // learner has not opened yet.
  saveCount: number;

  // Both null only for an assigned course the learner has not opened yet: when
  // it was assigned is neither when they started nor something they did.
  startedAt: string | null;
  lastActivityAt: string | null;

  // The revision of the policy document this record was taken
  // against, joined from the immutable course row. Null for a course that was
  // uploaded as a package, which is why the table renders a dash rather than
  // hiding the cell: one tenant can hold both kinds.
  documentVersion: string | null;
  sourceType: string | null;

  // How the learner's identity was established, already in words: "Admin",
  // "Link", "LMS", "Import" or "Not recorded". Stored when the record is
  // created, so a Not started row carries it too.
  identitySource: string;

  // Whether the learner's email was verified when the record completed, or
  // now if it has not completed.
  emailVerified: boolean;

  // When a manager assigned the course and who; both null for a record nobody
  // assigned.
  assignedAt: string | null;
  assignedByName: string | null;
}

// The label the API uses for a record with no identity source.
export const IDENTITY_NOT_RECORDED = "Not recorded";

// SCORM 1.2 cmi.core.lesson_status carries completion and pass/fail in one
// field, which is why a single Status filter covers both. Not started is the
// stored launched status under the name the table shows for it.
export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "not_started", label: "Not started" },
  { value: "passed", label: "passed" },
  { value: "failed", label: "failed" },
  { value: "completed", label: "completed" },
  { value: "incomplete", label: "incomplete" },
  { value: "browsed", label: "browsed" },
  { value: "not attempted", label: "not attempted" },
];

// Offered once the organization has assigned a course: who was given a
// course and has not started it, or has not finished it. Failed counts as
// not finished.
export const ASSIGNMENT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "assigned_not_started", label: "Assigned, not started" },
  { value: "assigned_not_completed", label: "Assigned, not completed" },
];
