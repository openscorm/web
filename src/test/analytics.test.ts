import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MeResponse } from "@/lib/types";

// The mode machine no longer gates on consent, so what this file
// guards changed. Three things matter now: managers and operators are
// identified, learners never are, and NOTHING is ever written to the device.
// The last is worth a test because posthog-js writes its opt-out flag to
// localStorage whatever `persistence` says, so a stray opt_out_capturing call
// would silently break the no-storage condition with no visible symptom.
// Each test re-imports the module so module-level state starts from "off".

const ph = {
  init: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  reset: vi.fn(),
  identify: vi.fn(),
  group: vi.fn(),
  register: vi.fn(),
  capture: vi.fn(),
};
vi.mock("posthog-js", () => ({ default: ph }));

const manager: MeResponse = {
  accountKey: 1,
  accountId: "6f1c1e5e-0000-4000-8000-000000000001",
  email: "manager@acme.test",
  name: "Ada Manager",
  tenantKey: 3,
  tenantHandle: "acme",
  tenantType: "Mini",
  isOperator: false,
  isManager: true,
  isLearner: false,
  dispatchEnabled: true,
  environment: "test",
};

const learner: MeResponse = {
  ...manager,
  accountKey: 2,
  accountId: "6f1c1e5e-0000-4000-8000-000000000002",
  email: "learner@acme.test",
  name: "Bo Learner",
  isManager: false,
  isLearner: true,
};

async function load() {
  vi.resetModules();
  const mod = await import("@/lib/analytics");
  mod.configureAnalytics({
    key: "phc_test",
    host: "/api/ingest",
    uiHost: "https://us.posthog.com",
  });
  return mod;
}

describe("analytics mode machine", () => {
  beforeEach(() => {
    for (const fn of Object.values(ph)) fn.mockClear();
  });

  it("captures nothing until an identity has been seen", async () => {
    const a = await load();
    a.capture("pricing_viewed");
    expect(ph.init).not.toHaveBeenCalled();
    expect(ph.capture).not.toHaveBeenCalled();
  });

  it("initializes with memory persistence and resolves the proxy path against the origin", async () => {
    const a = await load();
    a.applyAnalyticsUser(null);
    expect(ph.init).toHaveBeenCalledTimes(1);
    const [key, options] = ph.init.mock.calls[0] as [string, Record<string, unknown>];
    expect(key).toBe("phc_test");
    expect(options.api_host).toBe(`${window.location.origin}/api/ingest`);
    expect(options.ui_host).toBe("https://us.posthog.com");
    expect(options.disable_session_recording).toBe(true);
    // The no-storage condition: nothing on the device.
    expect(options.persistence).toBe("memory");
    expect(options.opt_out_capturing_by_default).toBeUndefined();
    // A person profile only for identify(), so a learner's events stay
    // personless whatever the library's default becomes.
    expect(options.person_profiles).toBe("identified_only");
  });

  it("never opts in or out, because that flag is the one thing that would hit localStorage", async () => {
    const a = await load();
    a.applyAnalyticsUser(null);
    a.applyAnalyticsUser(manager);
    a.applyAnalyticsUser(learner);
    a.applyAnalyticsUser(null);
    expect(ph.opt_in_capturing).not.toHaveBeenCalled();
    expect(ph.opt_out_capturing).not.toHaveBeenCalled();
  });

  it("a signed-out visitor is anonymous: never identified, first pageview fired", async () => {
    const a = await load();
    a.applyAnalyticsUser(null);
    expect(ph.identify).not.toHaveBeenCalled();
    expect(ph.capture).toHaveBeenCalledWith("$pageview", expect.anything());
  });

  it("a manager is identified with no consent involved, after a reset", async () => {
    const a = await load();
    a.applyAnalyticsUser(manager);
    expect(ph.reset).toHaveBeenCalledTimes(1);
    expect(ph.identify).toHaveBeenCalledWith(
      manager.accountId,
      expect.objectContaining({ is_manager: true }),
    );
    expect(ph.group).toHaveBeenCalledWith(
      "tenant",
      "3",
      expect.objectContaining({ handle: "acme" }),
    );
  });

  // A customer's learners are data we handle only on the customer's behalf,
  // so their events carry the tenant and never the account. No group either:
  // posthog-js creates a person profile for any event that carries one.
  it("a learner is never identified and joins no group, but still captures", async () => {
    const a = await load();
    a.applyAnalyticsUser(learner);
    expect(ph.identify).not.toHaveBeenCalled();
    expect(ph.group).not.toHaveBeenCalled();
    a.capture("course_launched");
    expect(ph.capture).toHaveBeenCalledWith("course_launched", undefined);
  });

  it("a learner's events carry the tenant and nothing that names the learner", async () => {
    const a = await load();
    a.applyAnalyticsUser({ ...learner, isTest: true });
    const [props] = ph.register.mock.calls.at(-1) as [Record<string, unknown>];
    expect(props).toMatchObject({
      tenant_key: "3",
      tenant_handle: "acme",
      is_learner: true,
      is_test: true,
    });
    const sent = JSON.stringify(props);
    for (const value of [
      learner.accountId,
      String(learner.accountKey),
      learner.email,
      learner.name,
    ]) {
      expect(sent).not.toContain(value);
    }
  });

  it("someone who also manages is identified as a manager", async () => {
    const a = await load();
    a.applyAnalyticsUser({ ...learner, isManager: true });
    expect(ph.identify).toHaveBeenCalledTimes(1);
  });

  it("moving from a manager's session to a learner's drops the identity", async () => {
    const a = await load();
    a.applyAnalyticsUser(manager);
    ph.reset.mockClear();
    a.applyAnalyticsUser(learner);
    expect(ph.reset).toHaveBeenCalledTimes(1);
    expect(ph.identify).toHaveBeenCalledTimes(1); // the manager's, not the learner's
  });

  // The test-account filter keys on is_test. The server stamps it on its own
  // events; client events only carry it if it is registered here, and without
  // it a test tenant's pageviews count while its server events are excluded.
  it("registers is_test on every client event and on the tenant group", async () => {
    const a = await load();
    a.applyAnalyticsUser({ ...manager, isTest: true });
    expect(ph.register).toHaveBeenCalledWith(expect.objectContaining({ is_test: true }));
    expect(ph.group).toHaveBeenCalledWith(
      "tenant",
      "3",
      expect.objectContaining({ is_test: true }),
    );
  });

  it("registers is_test false for a real tenant, and for a payload without the field", async () => {
    for (const who of [{ ...manager, isTest: false }, manager]) {
      const a = await load();
      a.applyAnalyticsUser(who);
      const [props] = ph.register.mock.calls.at(-1) as [Record<string, unknown>];
      expect(props.is_test).toBe(false);
    }
  });

  // The /trust page states that events are tied to the account and not the
  // person. That sentence is only true while this holds, for every role, so it
  // is asserted rather than left to a reviewer to notice.
  it("sends no email and no name for anyone", async () => {
    const a = await load();
    a.applyAnalyticsUser(manager);
    const [, props] = ph.identify.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(props).not.toHaveProperty("email");
    expect(props).not.toHaveProperty("name");

    a.applyAnalyticsUser(learner);
    const [registered] = ph.register.mock.calls.at(-1) as [Record<string, unknown>];
    expect(registered).not.toHaveProperty("email");
    expect(registered).not.toHaveProperty("name");
  });

  it("signing out of an identified session resets to a fresh anonymous id", async () => {
    const a = await load();
    a.applyAnalyticsUser(manager);
    ph.reset.mockClear();
    a.applyAnalyticsUser(null);
    expect(ph.reset).toHaveBeenCalledTimes(1);
    expect(ph.identify).toHaveBeenCalledTimes(1); // not re-identified
  });

  it("replays the identity seen before config arrived", async () => {
    vi.resetModules();
    const a = await import("@/lib/analytics");
    a.applyAnalyticsUser(manager);
    expect(ph.init).not.toHaveBeenCalled();
    a.configureAnalytics({ key: "phc_test", host: null });
    expect(ph.init).toHaveBeenCalledTimes(1);
    expect(ph.identify).toHaveBeenCalledTimes(1);
  });

  it("stays inert without a key", async () => {
    vi.resetModules();
    const a = await import("@/lib/analytics");
    a.configureAnalytics({ key: "", host: "/api/ingest" });
    a.applyAnalyticsUser(null);
    expect(ph.init).not.toHaveBeenCalled();
  });
});

describe("resolveApiHost", () => {
  it("resolves a leading-slash path against the origin", async () => {
    const { resolveApiHost } = await import("@/lib/analytics");
    expect(resolveApiHost("/api/ingest", "https://live.openscorm.com")).toBe(
      "https://live.openscorm.com/api/ingest",
    );
    expect(resolveApiHost("/api/ingest/", "https://live.openscorm.com/")).toBe(
      "https://live.openscorm.com/api/ingest",
    );
  });

  it("passes an absolute host through and defaults when empty", async () => {
    const { resolveApiHost, DEFAULT_POSTHOG_HOST } = await import("@/lib/analytics");
    expect(resolveApiHost("https://us.i.posthog.com", "https://x")).toBe(
      "https://us.i.posthog.com",
    );
    expect(resolveApiHost("", "https://x")).toBe(DEFAULT_POSTHOG_HOST);
    expect(resolveApiHost(null, "https://x")).toBe(DEFAULT_POSTHOG_HOST);
  });
});

// Signed-out pages carry secrets in their links: the password reset link holds
// the tenant login, the email and a live reset token, and PostHog stamps the
// current URL on every event. Every URL leaves with its query and fragment
// removed, whatever the page.
describe("URL redaction", () => {
  const reset =
    "https://app.openscorm.com/reset?username=acme%2Fada%40acme.test&email=ada%40acme.test&token=secret-token";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("installs the redaction as PostHog's before_send", async () => {
    const mod = await load();
    mod.applyAnalyticsUser(null);

    const options = ph.init.mock.calls[0][1] as { before_send: unknown };
    expect(options.before_send).toBe(mod.redactUrls);
  });

  it("sends a signed-out pageview of the reset link without its query", async () => {
    const mod = await load();
    mod.applyAnalyticsUser(null);
    ph.capture.mockClear();

    mod.capturePageview(reset);

    expect(ph.capture).toHaveBeenCalledWith("$pageview", {
      $current_url: "https://app.openscorm.com/reset",
    });
  });

  it("strips every URL property PostHog adds, on the event and the person", async () => {
    const { redactUrls } = await load();

    const out = redactUrls({
      uuid: "u",
      event: "$autocapture",
      properties: {
        $current_url: reset,
        $referrer: "https://mail.example.test/open?token=abc#frag",
        $prev_pageview_url: "https://app.openscorm.com/verify-email?token=verify-secret",
        $pathname: "/reset",
        other: "kept?as=is",
      },
      $set_once: { $initial_current_url: reset, $initial_referrer: "$direct" },
    });

    expect(out!.properties).toEqual({
      $current_url: "https://app.openscorm.com/reset",
      $referrer: "https://mail.example.test/open",
      $prev_pageview_url: "https://app.openscorm.com/verify-email",
      $pathname: "/reset",
      other: "kept?as=is",
    });
    expect(out!.$set_once).toEqual({
      $initial_current_url: "https://app.openscorm.com/reset",
      $initial_referrer: "$direct",
    });
    expect(JSON.stringify(out)).not.toContain("secret");
    expect(JSON.stringify(out)).not.toContain("acme.test");
  });

  it("passes a dropped event through as dropped", async () => {
    const { redactUrls } = await load();
    expect(redactUrls(null)).toBeNull();
  });
});

// A path keeps its page name and loses any account key in it: the account
// detail, a learner's report and the operator's account view all carry one,
// and it reaches PostHog in more places than the URL properties.
describe("account keys in paths", () => {
  it("masks the key wherever a path appears on the event", async () => {
    const { redactUrls } = await load();

    const out = redactUrls({
      uuid: "u",
      event: "$autocapture",
      properties: {
        $current_url: "https://app.openscorm.com/reports/learners/41?period=current",
        $pathname: "/reports/learners/41",
        $prev_pageview_pathname: "/accounts/7",
        $elements_chain: 'a:attr__href="/operator/accounts/12"nth-child="1"',
        $elements: [{ tag_name: "a", attr__href: "/reports/learners/41" }],
        course: "/library/41",
      },
      $set: { $current_url: "https://app.openscorm.com/accounts/7" },
    })!;

    expect(out.properties.$current_url).toBe("https://app.openscorm.com/reports/learners/:id");
    expect(out.properties.$pathname).toBe("/reports/learners/:id");
    expect(out.properties.$prev_pageview_pathname).toBe("/accounts/:id");
    expect(out.properties.$elements_chain).toBe(
      'a:attr__href="/operator/accounts/:id"nth-child="1"',
    );
    expect(out.properties.$elements).toEqual([
      { tag_name: "a", attr__href: "/reports/learners/:id" },
    ]);
    expect(out.properties.course).toBe("/library/41");
    expect(out.$set?.$current_url).toBe("https://app.openscorm.com/accounts/:id");
  });
});
