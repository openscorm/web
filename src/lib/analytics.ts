import posthog from "posthog-js";

import type { MeResponse } from "@/lib/types";

// Product analytics for the SPA. The PostHog key and host are fetched at
// runtime from GET /api/public/config (a per-environment deployment variable), not
// baked into the bundle at build time, so the key can be set whenever it is
// available with no rebuild, and one SPA package still ships to every
// environment. Analytics stays INERT until configureAnalytics receives a
// non-empty key. The key is a public phc_ client key, safe to expose.
//
// There is no consent gate. Learners, managers and operators are all
// tracked. Two live modes:
//   off        - nothing captured, because config or /me has not resolved yet.
//                posthog is not initialized, so autocapture cannot fire either.
//   anonymous  - a signed-out visitor. Events flow with no identity.
//   identified - any signed-in account. identify() ties events to the account
//                and the tenant group.
// There is deliberately no opt_out_capturing call anywhere in this module.
// posthog-js writes its opt-out flag to localStorage whatever `persistence` is
// set to, so that call was the last thing putting state on the device. With
// nobody excluded it is not needed, which is what lets persistence be memory.
//
// api_host may be a same-origin path (the reverse proxy on the API);
// resolveApiHost turns it into the absolute URL posthog.init needs.

type Mode = "off" | "anonymous" | "identified";

interface AnalyticsConfig {
  key: string;
  host?: string | null;
  uiHost?: string | null;
}

let config: AnalyticsConfig | null = null;
let initialized = false;
let mode: Mode = "off";
let identifiedAs: string | null = null;
// The last identity seen before config arrived, replayed once it does. Three
// states on purpose: undefined (nothing seen), null (signed out), a user.
let pendingUser: MeResponse | null | undefined;

export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

export function configureAnalytics(cfg: {
  key?: string | null;
  host?: string | null;
  uiHost?: string | null;
}): void {
  if (!cfg.key || config) return;
  config = { key: cfg.key, host: cfg.host, uiHost: cfg.uiHost };
  if (pendingUser !== undefined) applyAnalyticsUser(pendingUser);
}

// A leading slash means "a path on this origin" (the same-origin proxy); anything
// else is taken as the absolute host it already is.
export function resolveApiHost(host: string | null | undefined, origin: string): string {
  if (!host) return DEFAULT_POSTHOG_HOST;
  if (host.startsWith("/")) return origin.replace(/\/$/, "") + host.replace(/\/$/, "");
  return host;
}

function ensureInit(): boolean {
  if (initialized) return true;
  if (!config) return false;
  posthog.init(config.key, {
    api_host: resolveApiHost(config.host, window.location.origin),
    ...(config.uiHost ? { ui_host: config.uiHost } : {}),
    // SPA route changes are captured manually (capturePageview); autocapture
    // alone misses client-side navigations.
    capture_pageview: false,
    autocapture: true,
    // No session replay. Recording a compliance product's screens is a privacy
    // liability we are not taking on here; a consent-gated opt-in would be its
    // own decision alongside a cookie-consent banner.
    disable_session_recording: true,
    // The no-storage condition, now actually reachable: nothing written to or read
    // from cookie, localStorage or sessionStorage.
    persistence: "memory",
  });
  initialized = true;
  return true;
}

// Called by AnalyticsBridge whenever /me resolves to a different identity (a
// user, or null for signed out). Decides the mode; everything else follows.
export function applyAnalyticsUser(me: MeResponse | null): void {
  pendingUser = me;
  if (!config) return;

  if (me === null) {
    setMode("anonymous");
    return;
  }

  setMode("identified", me);
}

function setMode(next: Mode, me?: MeResponse): void {
  if (!ensureInit()) return;
  const wasOff = mode === "off";

  if (next === "anonymous") {
    if (identifiedAs !== null) {
      // Leaving an identified session: a fresh anonymous id, so the next
      // person on this browser is not stitched to the last one.
      posthog.reset();
    }
    mode = "anonymous";
    identifiedAs = null;
    if (wasOff) capturePageview(window.location.href);
    return;
  }

  if (!me) return;
  if (identifiedAs !== me.accountId) {
    // A fresh anonymous id first, so nothing captured before we knew who this
    // was gets merged into their profile by identify().
    posthog.reset();
    identifyUser(me);
    identifiedAs = me.accountId;
  }
  mode = "identified";
  if (wasOff) capturePageview(window.location.href);
}

export function capture(event: string, props?: Record<string, unknown>): void {
  if (mode !== "off") posthog.capture(event, props);
}

export function capturePageview(url: string): void {
  if (mode !== "off") posthog.capture("$pageview", { $current_url: url });
}

// distinct_id is the stable accountId; the tenant is a PostHog group for
// per-tenant B2B funnels; staff, impersonation, and environment are tagged so
// internal traffic and test-env noise can be excluded in PostHog.
//
// No email and no name, for anyone. accountId is a stable identifier, so every
// funnel, cohort and per-person sequence works without them; what they bought
// was reading a name instead of a GUID in the PostHog UI, recoverable with a
// lookup on account_id whenever that is actually needed. Leaving them out is
// what makes the /trust claim "events are tied to the account, not the person"
// true as written rather than true only for learners.
function identifyUser(me: MeResponse): void {
  posthog.identify(me.accountId, {
    tenant_handle: me.tenantHandle,
    tenant_type: me.tenantType,
    is_operator: me.isOperator,
    is_manager: me.isManager,
    is_learner: me.isLearner,
    is_impersonating: Boolean(me.impersonatedBy),
    environment: me.environment ?? null,
  });
  posthog.group("tenant", String(me.tenantKey), {
    handle: me.tenantHandle,
    type: me.tenantType,
    // Channel + is_community on the group let any client event
    // - impressions included - filter out Community in one clause (acceptance 1),
    // the same exclusion the server events carry inline.
    channel: me.channel ?? null,
    is_community: Boolean(me.isCommunity),
  });
  // Registered as super properties so every subsequent client event carries the
  // exclusion dimensions and the environment tag without re-passing them.
  posthog.register({
    channel: me.channel ?? null,
    is_community: Boolean(me.isCommunity),
    ...(me.environment ? { environment: me.environment } : {}),
  });
}

// Coarse band for the pct-of-cap dimension on capacity
// impressions, so capacity_warning_shown stays low-cardinality (taxonomy
// Group 3). Shared by the Library banner and the Dashboard plan card.
export function capBand(count: number, limit: number): string {
  if (limit <= 0) return "unlimited";
  const pct = (count / limit) * 100;
  if (pct >= 100) return "100+";
  if (pct >= 90) return "90-99";
  if (pct >= 75) return "75-89";
  return "under-75";
}
