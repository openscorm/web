// Identity payload returned by GET /api/auth/me. Volatile fields (tenantType, role flags)
// are re-read from the database on every authenticated request, so a tier change made by
// a billing webhook shows up in the UI without waiting for a new sign-in.
// Property names are camelCase because ASP.NET Core System.Text.Json default naming
// policy is JsonNamingPolicy.CamelCase.
// Served by GET /api/public/config for pre-session client config.
// posthogKey is empty when analytics is not configured for the environment.
export interface PublicConfig {
  posthogKey: string;
  // Either an absolute PostHog host or a same-origin path (the reverse
  // proxy, e.g. "/api/ingest"); analytics.ts resolves the latter against
  // window.location.origin.
  posthogHost: string;
  // The PostHog app, for toolbar links, since a proxy path cannot serve them.
  // Optional: a config cached before it shipped omits it.
  posthogUiHost?: string;
  environment: string;
  // The roster's CSV import. Optional: a config cached before it shipped
  // omits it, and absent reads as off.
  bulkImport?: boolean;
}

// The stored consent as the server reports it on /me: null
// means the account has not been asked or has not answered.

export interface MeResponse {
  accountKey: number;
  accountId: string;
  email: string;
  name: string;
  tenantKey: number;
  tenantHandle: string;
  tenantType: string;
  isOperator: boolean;
  isManager: boolean;
  isLearner: boolean;
  // The tenant's acquisition channel (signup_source) and
  // whether it is a Community channel. Attached to the PostHog tenant
  // group so client events can exclude Community in one clause. Optional: only
  // /me carries them, and a session cached before they shipped omits them.
  channel?: string | null;
  isCommunity?: boolean;
  // Whether the tenant is a founder or scratch account. Registered on every
  // client event so the analytics test-account filter excludes it, the same
  // flag the server stamps on its own events. Optional for the same reason as
  // the two above.
  isTest?: boolean;
  // Product-analytics consent for managers and operators.
  // null is the server saying undecided, which is what opens the consent
  // moment; undefined is a payload from before the field shipped (or the
  // login/register reply), which must not open it. Learners carry whatever is
  // stored and the app ignores it.
  // Optional so a /me response cached before this field
  // shipped reads as verified rather than nagging; only an explicit false shows
  // the verify prompt.
  emailVerified?: boolean;
  // Whether this tenant may use the dispatch console. True on a paid
  // tier (Mini and above, or Custom) or for an operator; false on Free.
  // Server-sent, not a build-time flag: one SPA package ships to every
  // environment, and the answer is per-tenant besides.
  dispatchEnabled: boolean;
  // Whether to show the Free-tier locked dispatch explainer instead
  // (show-but-gate): the nav entry renders with a lock chip and routes
  // to the upgrade landing rather than the working console. Never true at the
  // same time as dispatchEnabled. Optional so a session cached before this
  // field shipped reads as not-gated rather than throwing.
  dispatchGated?: boolean;
  // Which environment answered this request, for the badge and rule in the app
  // chrome. Server-sent for the same reason dispatchEnabled is. Optional here
  // because a session cached from before this field shipped has no value for
  // it, and an undefined environment renders as no badge rather than throwing.
  environment?: string;
  // Present only while an operator is impersonating this account. The chrome
  // keys off it to show the banner and the way out. Everything else about the
  // session, including the role flags above, belongs to the impersonated
  // account, because impersonation must not be an escalation.
  impersonatedBy?: string | null;
  impersonatedByEmail?: string | null;
  // Set only on the login response when a second factor is
  // required: no session is issued, and the app must redeem mfaToken at
  // /api/auth/mfa/verify with a code. Absent on an ordinary sign-in.
  mfaRequired?: boolean;
  mfaToken?: string | null;
  // Set with mfaToken on the login response when the tenant
  // requires two-factor and this account has none: no session yet, and the
  // app runs enrollment through /api/auth/mfa/enroll/setup and then
  // /api/auth/mfa/enroll/enable, which issues the session.
  mfaEnrollmentRequired?: boolean;
  // On the challenge response: the tenant's trusted-device
  // window in days; 0 or absent hides the "Trust this device" option.
  mfaTrustDays?: number;
}

// GET /api/auth/mfa and the enable/disable replies.
export interface MfaStatusResponse {
  enabled: boolean;
  recoveryCodesRemaining: number;
}

// POST /api/auth/mfa/setup. The secret and otpauth URI provision an
// authenticator; the recovery codes are shown once and never returned again.
export interface MfaSetupResponse {
  otpauthUri: string;
  secret: string;
  recoveryCodes: string[];
}

// GET and PUT /api/tenants/{tenantKey}/security. "all" binds
// every credentialed account in the tenant and switches its public invitation
// links off; "managers" binds managers and operators only.
export type MfaScope = "all" | "managers";

// Enumerated, not freeform; 0 is a code on every sign-in.
export type MfaTrustDays = 0 | 7 | 14 | 30;

export interface TenantSecurityPolicy {
  mfaRequired: boolean;
  mfaScope: MfaScope;
  mfaTrustDays: MfaTrustDays;
  // When on, an invitation link emails a sign-in link instead of signing the
  // learner straight in.
  linkRequiresVerifiedEmail: boolean;
}

// GET /api/tenants/{key}/api-keys. Every key the tenant
// issued; revoked ones carry revokedAt. The secret is never here.
export interface TenantApiKey {
  apiKeyKey: number;
  label: string;
  prefix: string;
  createdAt: string;
  createdBy: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

// GET/PUT /api/tenants/{key}/webhook. The signing secret is
// present only on the create and rotate responses.
export interface TenantWebhook {
  url: string;
  secretPrefix: string;
  secret?: string | null;
  createdAt: string;
  updatedAt: string;
  secretRotatedAt: string;
  lastDeliveryAt: string | null;
  lastDeliveryStatus: string | null;
  lastDeliveryError: string | null;
}

// POST /api/tenants/{key}/api-keys: the one response that carries the secret.
export interface IssuedApiKey extends TenantApiKey {
  secret: string;
}

// GET /api/operator/tenants/{key}/saml. Operator-only, because an
// email-domain claim decides where anyone typing that domain gets sent to sign
// in. The signing certificates are never returned; hasCertificate is whether
// one is stored. configured false means no row at all, which is different from
// a row that exists and is switched off.
export interface OperatorTenantSaml {
  configured: boolean;
  isEnabled: boolean;
  idpEntityId: string | null;
  idpSignInUrl: string | null;
  idpSignOutUrl: string | null;
  nameIdFormat: string;
  emailAttribute: string | null;
  firstNameAttribute: string | null;
  lastNameAttribute: string | null;
  jitProvision: boolean;
  hasCertificate: boolean;
  hasNextCertificate: boolean;
  updatedAt: string | null;
  domains: string[];
}

// GET /api/auth/devices. Only devices still inside their expiry
// and the tenant window; current marks the one this request came from.
export interface TrustedDevice {
  deviceKey: number;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  current: boolean;
}

export interface DevicesResponse {
  trustDays: number;
  devices: TrustedDevice[];
}

// POST /api/public/enroll. A session payload plus the course the invitation
// named. courseKey is the whole point of the separate type: the enroll page
// sends a course slug and the player route addresses a course by key, so
// without this the page has nowhere to send the learner but the tenant-wide
// listing, which is what it used to do.
export interface EnrollResponse extends MeResponse {
  courseKey: number;
}

// The 202 from POST /api/public/enroll when the organization requires a
// verified email: no session, and a sign-in link went to this address.
export interface EnrollPendingResponse {
  verificationRequired: true;
  email: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// RFC 7807 shape returned by ASP.NET Core Problem() helper.
export interface ProblemResponse {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
}
