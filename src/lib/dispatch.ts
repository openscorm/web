// Shared shapes for the dispatch console, matching the
// DispatchController responses. A client organization is a first-class label
// the manager creates; a dispatch is one course delivered to one client, and
// its package is a thin SCORM wrapper with no course content.

export interface ClientRow {
  clientKey: number;
  clientId: string;
  clientName: string;
  createdAt: string;
  activeDispatchCount: number;

  // Billable, non-archived registrations, from the same count expression the
  // capacity surface uses.
  registrationCount: number;
}

export interface DispatchRow {
  dispatchId: string;
  courseKey: number;
  courseSlug: string;
  courseTitle: string;
  clientKey: number;
  clientName: string;
  status: "active" | "expired" | "revoked";
  expiresAt: string | null;
  registrationCap: number | null;
  allowedDomains: string[];
  createdAt: string;
  registrationCount: number;
  launchCount: number;
  completionCount: number;
  packageUrl: string | null;
}

export interface DispatchRegistrationRow {
  registrationId: string;
  externalLearnerId: string;
  externalLearnerName: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  archived: boolean;
  // A host-declared no-tracking preview. Shown marked as a test; not
  // billed and not in compliance exports.
  noTracking: boolean;
  attemptCount: number;
  latestStatus: string | null;
  latestScore: string | null;
}

export interface DispatchDetail extends DispatchRow {
  registrations: DispatchRegistrationRow[];
}
