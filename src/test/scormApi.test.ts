import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createScormRuntime, createSessionRuntime, ScormProgressLoadError } from "@/lib/scormApi";

// The player used to treat a failed progress load exactly like an
// empty one: both produced {}. A learner relaunching during a deploy window
// therefore got a blank data model, and the first save wrote that blank over
// their real bookmark, suspend data and completion status -- silently, and
// destructively, because the database was never the thing that was broken.
//
// These tests pin the distinction that fix rests on. The load-failed case must
// be loud (throw) and must never reach a save; the no-prior-progress case must
// stay silent and ordinary, because starting fresh is correct there.

interface FakeXhr {
  method: string;
  url: string;
  body?: string;
}

let sent: FakeXhr[] = [];

function stubXhr(load: { status: number; responseText?: string; throwOnSend?: boolean }) {
  class MockXhr {
    status = 0;
    responseText = "";
    readyState = 4;
    withCredentials = false;
    onreadystatechange: (() => void) | null = null;
    private method = "";
    private url = "";

    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader() {}
    send(body?: string) {
      sent.push({ method: this.method, url: this.url, body });
      // Only the load is under test here; a save always "succeeds" so that a
      // save firing at all is visible in `sent` rather than masked by an error.
      if (this.url.includes("/load")) {
        if (load.throwOnSend) throw new DOMException("network error");
        this.status = load.status;
        this.responseText = load.responseText ?? "";
      } else {
        this.status = 200;
      }
      this.onreadystatechange?.();
    }
  }
  vi.stubGlobal("XMLHttpRequest", MockXhr);
}

const opts = {
  courseKey: 7,
  learnerKey: 42,
  attemptKey: 1,
  learnerEmail: "learner@acme.test",
  apiBase: "https://test.example",
};

beforeEach(() => {
  sent = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// Every runtime attaches a pagehide listener, and jsdom's window outlives the
// test that created it. Undisposed runtimes therefore used to pile up and all
// answer one dispatched pagehide, which stayed invisible only while the beacon
// had a "nothing changed" guard suppressing them. Track and dispose them so a
// beacon assertion measures the runtime under test and nothing else.
let tracked: { dispose(): void }[] = [];

function track<T extends { dispose(): void }>(runtime: T): T {
  tracked.push(runtime);
  return runtime;
}

afterEach(() => {
  tracked.forEach((r) => r.dispose());
  tracked = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createScormRuntime progress load", () => {
  it("starts fresh when the learner genuinely has no prior progress", () => {
    stubXhr({ status: 200, responseText: "{}" });
    const api = track(createScormRuntime(opts));

    expect(api.LMSInitialize("")).toBe("true");
    expect(api.LMSGetValue("cmi.core.lesson_status")).toBe("not attempted");
  });

  it("restores prior progress when the load succeeds", () => {
    stubXhr({
      status: 200,
      responseText: JSON.stringify({
        "cmi.core.lesson_status": "incomplete",
        "cmi.core.lesson_location": "page-4",
        "cmi.suspend_data": "abc123",
      }),
    });
    const api = track(createScormRuntime(opts));

    // LMSInitialize first: the runtime enforces the SCORM 1.2 lifecycle and
    // returns "" for any get before the session is open.
    api.LMSInitialize("");
    expect(api.LMSGetValue("cmi.core.lesson_location")).toBe("page-4");
    expect(api.LMSGetValue("cmi.suspend_data")).toBe("abc123");
  });

  it("throws rather than inventing a blank state when the API is down", () => {
    stubXhr({ status: 503 });
    expect(() => createScormRuntime(opts)).toThrow(ScormProgressLoadError);
  });

  it("throws when the load is unreachable, the shape of an API restart", () => {
    stubXhr({ status: 0, throwOnSend: true });
    expect(() => createScormRuntime(opts)).toThrow(ScormProgressLoadError);
  });

  it("throws on a 200 it cannot parse, such as an error page", () => {
    stubXhr({ status: 200, responseText: "<html>502 Bad Gateway</html>" });
    expect(() => createScormRuntime(opts)).toThrow(ScormProgressLoadError);
  });

  // The regression itself: failed load, then a save. Before the fix this
  // sequence persisted an empty data model over real progress.
  it("never saves after a failed load, because no runtime is handed back", () => {
    stubXhr({ status: 503 });

    let api;
    try {
      api = track(createScormRuntime(opts));
    } catch {
      api = undefined;
    }

    expect(api).toBeUndefined();
    expect(sent.filter((r) => r.url.includes("/save"))).toHaveLength(0);
  });

  it("does save once a load has succeeded, so the guard is not simply off", () => {
    stubXhr({ status: 200, responseText: JSON.stringify({ "cmi.core.lesson_status": "browsed" }) });
    const api = track(createScormRuntime(opts));

    api.LMSInitialize("");
    api.LMSSetValue("cmi.core.lesson_status", "completed");
    api.LMSCommit("");

    const saves = sent.filter((r) => r.url.includes("/save"));
    expect(saves.length).toBeGreaterThan(0);
    expect(saves[saves.length - 1].body).toContain("completed");
  });
});

// A 4096-character cmi.suspend_data was written, committed, reported
// saved, and was not there on the next launch. Two independent faults, both
// reproduced below.
//
// The first was a server debounce that discarded any save within two seconds of
// the previous one while answering { success: true }; it is deleted, and this
// file cannot test it. The second is here: the saves themselves were unordered
// async XHRs, so the snapshot taken between two LMSSetValue calls could be
// delivered after the snapshot taken by the LMSCommit that followed, durably
// storing the older and emptier of the two.
describe("createScormRuntime save ordering", () => {
  // Unlike stubXhr, this one holds each request open so a test can decide the
  // completion order. That is the whole point: the bug only appears when a
  // second save starts before the first finishes.
  function stubDeferredXhr(initial: Record<string, string>) {
    const pending: Array<() => void> = [];

    class MockXhr {
      status = 0;
      responseText = "";
      readyState = 4;
      withCredentials = false;
      onreadystatechange: (() => void) | null = null;
      private method = "";
      private url = "";

      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }
      setRequestHeader() {}
      send(body?: string) {
        sent.push({ method: this.method, url: this.url, body });
        if (this.url.includes("/load")) {
          this.status = 200;
          this.responseText = JSON.stringify(initial);
          this.onreadystatechange?.();
          return;
        }
        pending.push(() => {
          this.status = 200;
          this.onreadystatechange?.();
        });
      }
    }

    vi.stubGlobal("XMLHttpRequest", MockXhr);
    return {
      pending,
      settleAll() {
        while (pending.length) pending.shift()!();
      },
    };
  }

  const saves = () => sent.filter((r) => r.url.includes("/save"));

  // Every runtime attaches a pagehide listener, so one left undisposed would
  // still be listening during the next test and would beacon its own stale
  // snapshot. That is exactly the leak dispose() exists to prevent, and letting
  // it happen here would make the beacon assertions below meaningless.
  let live: Array<{ dispose(): void }> = [];

  function launch() {
    const api = track(createScormRuntime(opts));
    live.push(api);
    return api;
  }

  afterEach(() => {
    live.forEach((r) => r.dispose());
    live = [];
    vi.useRealTimers();
  });

  it("never has two saves in flight at once", () => {
    const xhr = stubDeferredXhr({});
    const api = launch();
    api.LMSInitialize("");

    api.LMSSetValue("cmi.core.lesson_location", "probe-page-7");
    api.LMSSetValue("cmi.suspend_data", "x".repeat(4096));
    api.LMSCommit("");

    // The two writes wait on the debounce and the commit goes at once, so one
    // request is open and nothing is racing it.
    expect(xhr.pending).toHaveLength(1);
    expect(saves()).toHaveLength(1);
  });

  it("sends the newest snapshot after the in-flight save completes", () => {
    const xhr = stubDeferredXhr({});
    const api = launch();
    api.LMSInitialize("");

    api.LMSSetValue("cmi.core.lesson_location", "probe-page-7");
    api.LMSSetValue("cmi.suspend_data", "PAYLOAD");
    api.LMSCommit("");

    xhr.settleAll();

    // The last thing the server is told must carry the payload. Before the fix
    // the final request could be the between-the-sets snapshot, whose
    // suspend_data was still empty.
    const last = saves()[saves().length - 1];
    expect(last.body).toContain("PAYLOAD");
    expect(JSON.parse(last.body!)["cmi.suspend_data"]).toBe("PAYLOAD");
  });

  // The course's own writes used to save on a 30 percent coin flip.
  // They now wait for a quiet window, so a run of writes costs one request and
  // it carries where the learner actually ended up.
  it("coalesces a run of writes into one save after the quiet window", () => {
    vi.useFakeTimers();
    const xhr = stubDeferredXhr({});
    const api = launch();
    api.LMSInitialize("");

    api.LMSSetValue("cmi.core.lesson_location", "a");
    api.LMSSetValue("cmi.core.lesson_location", "b");
    api.LMSSetValue("cmi.core.lesson_location", "c");

    expect(saves()).toHaveLength(0);

    vi.advanceTimersByTime(5_000);
    xhr.settleAll();

    // Each snapshot is the whole data model, so the first two hold nothing the
    // last one lacks.
    expect(saves()).toHaveLength(1);
    expect(JSON.parse(saves()[0].body!)["cmi.core.lesson_location"]).toBe("c");
  });

  it("sends a commit at once rather than waiting for the window", () => {
    vi.useFakeTimers();
    const xhr = stubDeferredXhr({});
    const api = launch();
    api.LMSInitialize("");

    api.LMSSetValue("cmi.core.lesson_location", "page-3");
    api.LMSCommit("");
    xhr.settleAll();

    expect(saves()).toHaveLength(1);

    // And the write's pending save is spent rather than still waiting behind
    // it: the commit already carried everything it held.
    vi.advanceTimersByTime(5_000);
    expect(saves()).toHaveLength(1);
  });

  it("beacons the unsaved snapshot when the page goes away", () => {
    stubDeferredXhr({});
    const beacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { sendBeacon: beacon });

    const api = launch();
    api.LMSInitialize("");
    api.LMSSetValue("cmi.suspend_data", "LAST-PAGE");
    api.LMSCommit("");

    // The commit's XHR is still open, exactly as it is when a course commits
    // from its own beforeunload handler and the browser then cancels it.
    window.dispatchEvent(new Event("pagehide"));

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toContain("/api/progress/scorm/save");
  });

  it("beacons a current snapshot even when the last one was confirmed", () => {
    const xhr = stubDeferredXhr({});
    const beacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { sendBeacon: beacon });

    const api = launch();
    api.LMSInitialize("");
    api.LMSSetValue("cmi.suspend_data", "SAVED");
    api.LMSCommit("");
    xhr.settleAll();

    window.dispatchEvent(new Event("pagehide"));

    // This used to be "does not beacon when the server already confirmed the
    // latest snapshot", and the guard behind it was right while the model only
    // changed when the course wrote something. It is wrong now: the player
    // measures the sitting, so the model has moved on even though the course
    // has not, and the confirmed snapshot understates the learner's time by
    // however long they stayed after their last interaction.
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toContain("/api/progress/scorm/save");
  });

  it("stops listening once disposed, so a relaunch cannot beacon stale state", () => {
    stubDeferredXhr({});
    const beacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { sendBeacon: beacon });

    const api = launch();
    api.LMSInitialize("");
    api.LMSSetValue("cmi.suspend_data", "STALE");
    api.LMSCommit("");

    api.dispose();
    window.dispatchEvent(new Event("pagehide"));

    expect(beacon).not.toHaveBeenCalled();
  });
});

// A save the API refused used to end at a console line. The SCO had
// already been told its commit succeeded, so a sitting that ended inside a
// deploy window was lost and nobody, learner or manager, had any sign of it.
// The transport now tries again with the newest model it holds.
describe("createScormRuntime save retry", () => {
  // Saves answer immediately with whatever status the test asks for, so the
  // refusal and the retry that follows are both visible in `sent`.
  function stubXhrWithSaveStatus(saveStatus: () => number) {
    class MockXhr {
      status = 0;
      responseText = "";
      readyState = 4;
      withCredentials = false;
      onreadystatechange: (() => void) | null = null;
      private method = "";
      private url = "";

      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }
      setRequestHeader() {}
      send(body?: string) {
        sent.push({ method: this.method, url: this.url, body });
        if (this.url.includes("/load")) {
          this.status = 200;
          this.responseText = "{}";
        } else {
          this.status = saveStatus();
        }
        this.onreadystatechange?.();
      }
    }
    vi.stubGlobal("XMLHttpRequest", MockXhr);
  }

  const saves = () => sent.filter((r) => r.url.includes("/save"));

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tries a refused save again, carrying the model it holds", () => {
    vi.useFakeTimers();
    let status = 503;
    stubXhrWithSaveStatus(() => status);
    const api = track(createScormRuntime(opts));
    api.LMSInitialize("");

    api.LMSSetValue("cmi.core.lesson_location", "page-3");
    vi.advanceTimersByTime(5_000);
    expect(saves()).toHaveLength(1);

    status = 200;
    vi.advanceTimersByTime(15_000);

    expect(saves()).toHaveLength(2);
    expect(JSON.parse(saves()[1].body!)["cmi.core.lesson_location"]).toBe("page-3");
  });

  it("stops once a save lands", () => {
    vi.useFakeTimers();
    let status = 503;
    stubXhrWithSaveStatus(() => status);
    const api = track(createScormRuntime(opts));
    api.LMSInitialize("");

    api.LMSSetValue("cmi.core.lesson_location", "page-3");
    vi.advanceTimersByTime(5_000);
    status = 200;
    vi.advanceTimersByTime(15_000);
    expect(saves()).toHaveLength(2);

    // A retry that survived its own success would post the same model forever.
    vi.advanceTimersByTime(60_000);
    expect(saves()).toHaveLength(2);
  });

  it("keeps trying while the API is still refusing", () => {
    vi.useFakeTimers();
    stubXhrWithSaveStatus(() => 503);
    const api = track(createScormRuntime(opts));
    api.LMSInitialize("");

    api.LMSSetValue("cmi.core.lesson_location", "page-3");
    vi.advanceTimersByTime(5_000);
    vi.advanceTimersByTime(15_000);
    vi.advanceTimersByTime(15_000);

    expect(saves()).toHaveLength(3);
  });

  it("retries nothing once the launch is disposed", () => {
    vi.useFakeTimers();
    stubXhrWithSaveStatus(() => 503);
    const api = track(createScormRuntime(opts));
    api.LMSInitialize("");

    api.LMSSetValue("cmi.core.lesson_location", "page-3");
    vi.advanceTimersByTime(5_000);
    expect(saves()).toHaveLength(1);

    // A timer outliving the launch would save this sitting over whatever the
    // learner opens next.
    api.dispose();
    vi.advanceTimersByTime(60_000);

    expect(saves()).toHaveLength(1);
  });
});

// --- step 3: runtime selection ----------------------------------------------

describe("createSessionRuntime standard selection", () => {
  it("builds a SCORM 1.2 runtime when the course is 1.2", () => {
    stubXhr({ status: 200, responseText: "{}" });

    const launched = track(createSessionRuntime({ ...opts, scormVersion: "1.2" }));

    expect(launched.standard).toBe("1.2");
    expect("LMSInitialize" in launched.runtime).toBe(true);
    expect("Initialize" in launched.runtime).toBe(false);
    launched.dispose();
  });

  it("builds a SCORM 2004 runtime when the course is 2004", () => {
    stubXhr({ status: 200, responseText: "{}" });

    const launched = track(createSessionRuntime({ ...opts, scormVersion: "2004-4th" }));

    expect(launched.standard).toBe("2004");
    expect("Initialize" in launched.runtime).toBe(true);
    expect("LMSInitialize" in launched.runtime).toBe(false);
    launched.dispose();
  });

  it("builds a 1.2 runtime when the version is absent", () => {
    stubXhr({ status: 200, responseText: "{}" });

    const launched = track(createSessionRuntime(opts));

    expect(launched.standard).toBe("1.2");
    launched.dispose();
  });

  it("gives a 2004 runtime the same transport, including the restored model", () => {
    stubXhr({
      status: 200,
      responseText: JSON.stringify({
        "cmi.location": "slide-9",
        "cmi.completion_status": "incomplete",
      }),
    });

    const launched = track(createSessionRuntime({ ...opts, scormVersion: "2004-3rd" }));
    const api = launched.runtime as import("@/lib/scormDataModel2004").Scorm2004Runtime;
    api.Initialize("");

    expect(api.GetValue("cmi.location")).toBe("slide-9");
    expect(api.GetValue("cmi.completion_status")).toBe("incomplete");

    api.SetValue("cmi.completion_status", "completed");
    api.Commit("");

    const save = sent.find((r) => r.method === "POST");
    expect(save).toBeTruthy();
    expect(JSON.parse(save!.body!)["cmi.completion_status"]).toBe("completed");

    launched.dispose();
  });

  it("refuses a 2004 launch on a failed load, exactly as 1.2 does", () => {
    stubXhr({ status: 503 });

    expect(() => createSessionRuntime({ ...opts, scormVersion: "2004-4th" })).toThrow(
      ScormProgressLoadError,
    );
  });
});

describe("unload listener lifetime", () => {
  it("attaches no listener when the load fails", () => {
    // The listener used to be attached before the load, so every refused
    // launch left one behind. PlayerPage offers a retry button, so they
    // accumulated across attempts.
    stubXhr({ status: 503 });
    const add = vi.spyOn(window, "addEventListener");

    expect(() => createScormRuntime(opts)).toThrow(ScormProgressLoadError);

    expect(add.mock.calls.filter(([event]) => event === "pagehide")).toHaveLength(0);
  });

  it("attaches one listener when the load succeeds", () => {
    stubXhr({ status: 200, responseText: "{}" });
    const add = vi.spyOn(window, "addEventListener");

    const runtime = track(createScormRuntime(opts));

    expect(add.mock.calls.filter(([event]) => event === "pagehide")).toHaveLength(1);
    runtime.dispose();
  });
});
