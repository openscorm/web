// The shim's half of the launcher conversation. The launcher's half
// is covered in dispatchLauncher.test.ts against the real embedded file; this
// one drives createHostRelay directly, because the interesting cases are all
// about which origin gets to talk to us and what happens when the two ends
// start out of order.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHostRelay, hostAllowed, isReportable, RELAYED_ELEMENTS } from "@/dispatch/hostRelay";

const HOST_ORIGIN = "https://lms.acme.com";

function fakeScope() {
  const listeners: ((event: MessageEvent) => void)[] = [];
  const postMessage = vi.fn();
  const scope = {
    parent: { postMessage },
    addEventListener: (_type: string, handler: (event: MessageEvent) => void) => {
      listeners.push(handler);
    },
  };

  return {
    scope: scope as unknown as Window,
    postMessage,
    deliver(data: unknown, origin = HOST_ORIGIN) {
      for (const handler of listeners) handler({ data, origin } as MessageEvent);
    },
  };
}

function hello() {
  return { source: "openscorm-dispatch", type: "host-hello", version: 1 };
}

// The relay measures the sitting itself, from Date.now. Frozen time
// keeps that measurement at zero, so every test below sees only what the
// course reported unless it advances the clock on purpose.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("hostAllowed", () => {
  it("is open when no allow-list is configured", () => {
    expect(hostAllowed(HOST_ORIGIN, [])).toBe(true);
  });

  it("matches a bare host and its subdomains, per the Referer rule", () => {
    expect(hostAllowed("https://acme.com", ["acme.com"])).toBe(true);
    expect(hostAllowed("https://lms.acme.com", ["acme.com"])).toBe(true);
  });

  // The reason the match is a label-boundary suffix and not endsWith.
  it("does not match a host that merely ends in the allowed string", () => {
    expect(hostAllowed("https://notacme.com", ["acme.com"])).toBe(false);
    expect(hostAllowed("https://acme.com.evil.example", ["acme.com"])).toBe(false);
  });
});

// Both rules come from the SCORM Cloud debug log on the first hosted launch:
// two rejected "not attempted" writes before the SCO had said anything, and a
// session_time of 0000:00:00 sitting in our own data.
describe("isReportable", () => {
  it("withholds the status the shim starts out with", () => {
    expect(isReportable("cmi.core.lesson_status", "not attempted")).toBe(false);
    expect(isReportable("cmi.core.lesson_status", "Not Attempted")).toBe(false);
  });

  it("reports every status the SCO actually sets", () => {
    for (const status of ["completed", "incomplete", "passed", "failed", "browsed"]) {
      expect(isReportable("cmi.core.lesson_status", status)).toBe(true);
    }
  });

  it("withholds a session that took no time, in any of its written forms", () => {
    expect(isReportable("cmi.core.session_time", "0000:00:00")).toBe(false);
    expect(isReportable("cmi.core.session_time", "00:00:00")).toBe(false);
    expect(isReportable("cmi.core.session_time", "0:00:00.00")).toBe(false);
  });

  it("reports a session that took time", () => {
    expect(isReportable("cmi.core.session_time", "00:00:01")).toBe(true);
    expect(isReportable("cmi.core.session_time", "0000:18:22")).toBe(true);
  });

  it("withholds an empty value whatever the element", () => {
    expect(isReportable("cmi.core.score.raw", "")).toBe(false);
  });
});

describe("dispatch host relay", () => {
  let harness: ReturnType<typeof fakeScope>;

  beforeEach(() => {
    harness = fakeScope();
  });

  it("answers a hello and then relays progress to that origin", () => {
    const relay = createHostRelay([], harness.scope);

    harness.deliver(hello());
    expect(harness.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "shim-hello" }),
      HOST_ORIGIN,
    );

    relay.progress({ "cmi.core.lesson_status": "incomplete", "cmi.suspend_data": "x".repeat(50) });

    const [message, origin] = harness.postMessage.mock.calls[1];
    expect(origin).toBe(HOST_ORIGIN);
    expect(message.type).toBe("progress");
    expect(message.values).toEqual({ "cmi.core.lesson_status": "incomplete" });
  });

  // Sending late and writing late are different problems. The launcher holds
  // session_time back until it closes the host session, but it can only do
  // that if it was told while there was still time to tell it: the message
  // that would carry it at close is racing the teardown that prompted it.
  it("relays session_time with progress, not only with finish", () => {
    const relay = createHostRelay([], harness.scope);
    harness.deliver(hello());

    relay.progress({
      "cmi.core.lesson_status": "incomplete",
      "cmi.core.session_time": "0000:04:11",
    });

    const [message] = harness.postMessage.mock.calls[1];
    expect(message.values).toEqual({
      "cmi.core.lesson_status": "incomplete",
      "cmi.core.session_time": "0000:04:11",
    });
  });

  // The detail is ours. A host LMS that received suspend_data would be storing
  // a copy of state it never reads and cannot resume from.
  it("never relays suspend_data or interactions", () => {
    const relay = createHostRelay([], harness.scope);
    harness.deliver(hello());

    relay.finish({
      "cmi.core.lesson_status": "completed",
      "cmi.core.session_time": "00:12:00",
      "cmi.suspend_data": "page=7",
      "cmi.interactions.0.id": "q1",
    });

    const [message] = harness.postMessage.mock.calls[1];
    // The hours arrive padded to four digits: toLegacyDuration re-renders a 1.2
    // timespan into the canonical shape now rather than passing it through, so
    // one column cannot carry several renderings of the same number. Both forms
    // are valid CMITimespan and mean twelve minutes.
    expect(message.values).toEqual({
      "cmi.core.lesson_status": "completed",
      "cmi.core.session_time": "0000:12:00",
    });
  });

  // The race the retrying hello in launcher.js exists for, seen from this end:
  // a course that finishes before the handshake completes must still report.
  it("holds the newest result until a hello arrives, then sends it", () => {
    const relay = createHostRelay([], harness.scope);

    relay.progress({ "cmi.core.lesson_status": "incomplete" });
    relay.finish({ "cmi.core.lesson_status": "completed" });
    expect(harness.postMessage).not.toHaveBeenCalled();

    harness.deliver(hello());

    const types = harness.postMessage.mock.calls.map(([message]) => message.type);
    expect(types).toEqual(["shim-hello", "finish"]);
  });

  it("relays nothing from a model the SCO has not touched", () => {
    const relay = createHostRelay([], harness.scope);
    harness.deliver(hello());

    relay.progress({
      "cmi.core.lesson_status": "not attempted",
      "cmi.core.session_time": "0000:00:00",
    });

    const [message] = harness.postMessage.mock.calls[1];
    expect(message.values).toEqual({});
  });

  it("refuses a hello from an origin outside the allow-list", () => {
    createHostRelay(["acme.com"], harness.scope);

    harness.deliver(hello(), "https://evil.example.com");

    expect(harness.postMessage).not.toHaveBeenCalled();
  });

  // A second frame claiming to be the launcher must not redirect the report,
  // which is the whole reason the origin is pinned rather than read per
  // message.
  it("stays pinned to the first origin it accepted", () => {
    const relay = createHostRelay([], harness.scope);

    harness.deliver(hello());
    harness.deliver(hello(), "https://second.example.com");
    relay.finish({ "cmi.core.lesson_status": "completed" });

    for (const [, origin] of harness.postMessage.mock.calls) {
      expect(origin).toBe(HOST_ORIGIN);
    }
  });

  it("ignores a message that is not ours", () => {
    createHostRelay([], harness.scope);

    harness.deliver({ type: "host-hello", version: 1 });

    expect(harness.postMessage).not.toHaveBeenCalled();
  });

  it("says nothing at all when the page is not framed", () => {
    const postMessage = vi.fn();
    const scope = { postMessage, addEventListener: vi.fn() } as unknown as Window;
    Object.defineProperty(scope, "parent", { value: scope, configurable: true });

    const relay = createHostRelay([], scope);
    relay.finish({ "cmi.core.lesson_status": "completed" });

    expect(postMessage).not.toHaveBeenCalled();
  });
});

// The 2004 projection at the relay boundary. The launcher runs inside the
// customer's client LMS, was handed a SCORM 1.2 API by that LMS, and can only
// write what 1.2 understands, so a 2004 course's two status axes are projected
// to one before anything is picked from the model.
//
// This block replaced a test that pinned the gap: before step 4 a 2004 model
// relayed nothing at all, and that test existed so closing the gap would be a
// deliberate act rather than a silent one. It failed the moment the projection
// landed, which is what it was for.
describe("SCORM 2004 relay", () => {
  it("relays a 2004 result in the names a host LMS can store", () => {
    const harness = fakeScope();
    const relay = createHostRelay([], harness.scope);
    harness.deliver(hello());

    relay.finish({
      "cmi.completion_status": "completed",
      "cmi.success_status": "passed",
      "cmi.score.scaled": "0.9",
      "cmi.score.raw": "90",
      "cmi.session_time": "PT21M",
    });

    const [message] = harness.postMessage.mock.calls[1];
    expect(message.type).toBe("finish");
    expect(message.values).toEqual({
      "cmi.core.lesson_status": "passed",
      "cmi.core.score.raw": "90",
      // ISO 8601 in, 1.2 format out. A host handed "PT21M" either rejects it or
      // reads it as zero, and a sitting recorded as zero is worse than one not
      // recorded at all.
      "cmi.core.session_time": "0000:21:00",
    });
  });

  it("relays a completed and failed 2004 attempt as failed", () => {
    // The state with no 1.2 equivalent, and the one where getting the
    // projection backwards would tell a host LMS that someone who failed had
    // passed.
    const harness = fakeScope();
    const relay = createHostRelay([], harness.scope);
    harness.deliver(hello());

    relay.finish({
      "cmi.completion_status": "completed",
      "cmi.success_status": "failed",
      "cmi.session_time": "PT5M",
    });

    const [message] = harness.postMessage.mock.calls[1];
    expect(message.values["cmi.core.lesson_status"]).toBe("failed");
  });

  it("still withholds a not attempted status and a zero session time", () => {
    // The two values SCORM Cloud refused on the first hosted launch.
    // Projection must not have reintroduced them: a 2004 model that has said
    // nothing projects to "incomplete", which is reportable, but an explicit
    // "not attempted" is not.
    const harness = fakeScope();
    const relay = createHostRelay([], harness.scope);
    harness.deliver(hello());

    relay.progress({
      "cmi.completion_status": "not attempted",
      "cmi.session_time": "PT0S",
    });

    const [message] = harness.postMessage.mock.calls[1];
    expect(message.values["cmi.core.lesson_status"]).toBeUndefined();
    expect(message.values["cmi.core.session_time"]).toBeUndefined();
  });

  it("names no 2004 element in the relayed set", () => {
    // The list stays 1.2 only by design: it describes what the host LMS can
    // store, not what our runtime holds.
    for (const element of RELAYED_ELEMENTS) {
      expect(element.startsWith("cmi.core.")).toBe(true);
    }
  });
});

// The session player's rule, applied to the host. A course that reports no session time used to leave the host at zero, which a
// customer reads as dispatch losing data.
describe("measured session time", () => {
  it("tells the host the measured sitting when the course reports none", () => {
    const harness = fakeScope();
    const relay = createHostRelay([], harness.scope);
    harness.deliver(hello());

    vi.advanceTimersByTime((4 * 60 + 11) * 1000);
    relay.progress({ "cmi.core.lesson_status": "incomplete" });

    const [message] = harness.postMessage.mock.calls[1];
    expect(message.values).toEqual({
      "cmi.core.lesson_status": "incomplete",
      "cmi.core.session_time": "0000:04:11.00",
    });
  });

  it("never overrides a time the course reported", () => {
    const harness = fakeScope();
    const relay = createHostRelay([], harness.scope);
    harness.deliver(hello());

    vi.advanceTimersByTime(60 * 60 * 1000);
    relay.finish({
      "cmi.core.lesson_status": "completed",
      "cmi.core.session_time": "0000:05:00",
    });

    const [message] = harness.postMessage.mock.calls[1];
    expect(message.values["cmi.core.session_time"]).toBe("0000:05:00");
  });

  it("measures over a reported zero, which a 1.2 model cannot tell from its default", () => {
    const harness = fakeScope();
    const relay = createHostRelay([], harness.scope);
    harness.deliver(hello());

    vi.advanceTimersByTime(90 * 1000);
    relay.progress({
      "cmi.core.lesson_status": "incomplete",
      "cmi.core.session_time": "0000:00:00",
    });

    const [message] = harness.postMessage.mock.calls[1];
    expect(message.values["cmi.core.session_time"]).toBe("0000:01:30.00");
  });

  it("ends the sitting at finish, not when a late hello lets it out", () => {
    const harness = fakeScope();
    const relay = createHostRelay([], harness.scope);

    vi.advanceTimersByTime(10 * 60 * 1000);
    relay.finish({ "cmi.core.lesson_status": "completed" });
    vi.advanceTimersByTime(5 * 60 * 1000);
    harness.deliver(hello());

    const [message] = harness.postMessage.mock.calls[1];
    expect(message.type).toBe("finish");
    expect(message.values["cmi.core.session_time"]).toBe("0000:10:00.00");
  });

  it("measures a 2004 course that reports no session time, in the 1.2 name", () => {
    const harness = fakeScope();
    const relay = createHostRelay([], harness.scope);
    harness.deliver(hello());

    vi.advanceTimersByTime(3 * 60 * 1000);
    relay.finish({ "cmi.completion_status": "completed" });

    const [message] = harness.postMessage.mock.calls[1];
    expect(message.values).toEqual({
      "cmi.core.lesson_status": "completed",
      "cmi.core.session_time": "0000:03:00.00",
    });
  });
});
