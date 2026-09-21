// The dispatch launcher (src/Slate.Dispatch/Templates/launcher.js) is the one
// piece of OpenSCORM that runs on a customer's client's LMS, and it is the
// piece we cannot reach from any other test: it ships inside a zip, embedded
// in the .NET assembly, and executes in a frame chain we do not build.
//
// So it is read off disk and run here against a fake host LMS. The file that
// this suite loads is the same file DispatchPackageBuilder embeds, which is
// the property that matters: a stub cannot pass these.

import { beforeEach, describe, expect, it, vi } from "vitest";

// Imported as text rather than executed on import: the file is an IIFE that
// expects a document to already exist. This is the same path the .NET build
// embeds, so the two cannot drift.
import launcherSource from "../../../src/Slate.Dispatch/Templates/launcher.js?raw";

const LAUNCH_URL =
  "https://live.openscorm.com/dispatch/launch/6f9619ff-8b86-d011-b42d-00cf4fc964ff";
const LAUNCH_ORIGIN = "https://live.openscorm.com";

interface FakeApi {
  sets: [string, string][];
  commits: number;
  finishes: number;
  values: Record<string, string>;
  LMSInitialize(param: string): "true" | "false";
  LMSGetValue(element: string): string;
  LMSSetValue(element: string, value: string): "true" | "false";
  LMSCommit(param: string): "true" | "false";
  LMSFinish(param: string): "true" | "false";
}

function createFakeApi(values: Record<string, string>): FakeApi {
  return {
    sets: [],
    commits: 0,
    finishes: 0,
    values,
    LMSInitialize: () => "true",
    LMSGetValue(element) {
      return this.values[element] ?? "";
    },
    LMSSetValue(element, value) {
      this.sets.push([element, value]);
      return "true";
    },
    LMSCommit() {
      this.commits += 1;
      return "true";
    },
    LMSFinish() {
      this.finishes += 1;
      return "true";
    },
  };
}

// The launcher walks window.parent and then window.opener. jsdom's top window
// is its own parent, so the opener chain is the one to fake, which is also the
// popup-launching LMS shape the second walk exists for.
function withHostApi(api: unknown, depth = 0) {
  let chain: unknown = { API: api };
  for (let i = 0; i < depth; i++) chain = { parent: chain };

  Object.defineProperty(window, "opener", { value: chain, writable: true, configurable: true });
}

function runLauncher() {
  document.head.innerHTML = `<meta name="openscorm-launch-url" content="${LAUNCH_URL}">`;
  document.body.innerHTML = `<div id="openscorm-status"><p>Opening your course</p></div>`;
  // Indirect eval so the IIFE sees jsdom's globals rather than module scope.
  (0, eval)(launcherSource);
}

function courseFrame(): HTMLIFrameElement | null {
  return document.getElementById("openscorm-course") as HTMLIFrameElement | null;
}

function statusText(): string {
  return document.getElementById("openscorm-status")?.textContent ?? "";
}

function sendFromShim(type: string, values: Record<string, string>, origin = LAUNCH_ORIGIN) {
  window.dispatchEvent(
    new MessageEvent("message", {
      origin,
      data: { source: "openscorm-dispatch", type, version: 1, values },
    }),
  );
}

describe("dispatch launcher", () => {
  beforeEach(() => {
    Object.defineProperty(window, "opener", { value: null, writable: true, configurable: true });
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("carries the host LMS learner identity to the launch URL", () => {
    withHostApi(
      createFakeApi({
        "cmi.core.student_id": "acme-4471",
        "cmi.core.student_name": "Jones, Pat",
      }),
    );

    runLauncher();

    const src = courseFrame()?.src ?? "";
    expect(src.startsWith(`${LAUNCH_URL}?`)).toBe(true);
    expect(src).toContain("student_id=acme-4471");
    expect(src).toContain(`student_name=${encodeURIComponent("Jones, Pat")}`);
  });

  it("finds an API several frames up rather than only in the immediate parent", () => {
    withHostApi(createFakeApi({ "cmi.core.student_id": "deep-1" }), 4);

    runLauncher();

    expect(courseFrame()?.src ?? "").toContain("student_id=deep-1");
  });

  // The failure the OQ was filed for. Before this change the launcher
  // redirected regardless and the learner met a 400 on our origin, which reads
  // as an OpenSCORM outage rather than a host that said nothing.
  it("says so on screen when the host offers no SCORM connection", () => {
    runLauncher();

    expect(courseFrame()).toBeNull();
    expect(statusText()).toContain("did not offer it a SCORM connection");
  });

  it("says so on screen when the host has an API but no learner identity", () => {
    withHostApi(createFakeApi({ "cmi.core.student_name": "Nameless" }));

    runLauncher();

    expect(courseFrame()).toBeNull();
    expect(statusText()).toContain("did not identify you");
  });

  it("writes progress into the host LMS and commits, without session_time", () => {
    const api = createFakeApi({ "cmi.core.student_id": "acme-1" });
    withHostApi(api);
    runLauncher();

    sendFromShim("progress", {
      "cmi.core.lesson_status": "incomplete",
      "cmi.core.score.raw": "40",
      "cmi.core.session_time": "00:10:00",
    });

    expect(api.sets).toContainEqual(["cmi.core.lesson_status", "incomplete"]);
    expect(api.sets).toContainEqual(["cmi.core.score.raw", "40"]);
    expect(api.sets.map(([element]) => element)).not.toContain("cmi.core.session_time");
    expect(api.commits).toBe(1);
    expect(api.finishes).toBe(0);
  });

  it("writes session_time once, on finish, and closes the host session", () => {
    const api = createFakeApi({ "cmi.core.student_id": "acme-1" });
    withHostApi(api);
    runLauncher();

    sendFromShim("finish", {
      "cmi.core.lesson_status": "completed",
      "cmi.core.score.raw": "90",
      "cmi.core.session_time": "00:21:04",
    });

    expect(api.sets).toContainEqual(["cmi.core.lesson_status", "completed"]);
    expect(api.sets).toContainEqual(["cmi.core.session_time", "00:21:04"]);
    expect(api.commits).toBe(1);
    expect(api.finishes).toBe(1);
  });

  it("finishes the host session only once, however many times it is told to", () => {
    const api = createFakeApi({ "cmi.core.student_id": "acme-1" });
    withHostApi(api);
    runLauncher();

    sendFromShim("finish", { "cmi.core.lesson_status": "completed" });
    sendFromShim("finish", { "cmi.core.lesson_status": "completed" });
    window.dispatchEvent(new Event("pagehide"));

    expect(api.finishes).toBe(1);
  });

  // The SCORM Cloud run that found this: pagehide closed the host session
  // before the shim's finish message arrived, so the launcher committed and
  // finished having written nothing, and the four calls that followed were all
  // refused. The host record was correct only because the probe happened to
  // report completed mid-course.
  it("reports what it knows when the learner leaves before the finish message", () => {
    const api = createFakeApi({ "cmi.core.student_id": "acme-1" });
    withHostApi(api);
    runLauncher();

    sendFromShim("progress", {
      "cmi.core.lesson_status": "completed",
      "cmi.core.score.raw": "88",
    });
    api.sets.length = 0;

    window.dispatchEvent(new Event("pagehide"));

    expect(api.sets).toContainEqual(["cmi.core.lesson_status", "completed"]);
    expect(api.sets).toContainEqual(["cmi.core.score.raw", "88"]);
    expect(api.finishes).toBe(1);
  });

  // The session_time the host is told has to come from a message that arrived
  // while the page was still alive, because the one sent at close does not
  // reliably get there. Written once, at the end, never on the way.
  it("holds session_time from progress and writes it only at the close", () => {
    const api = createFakeApi({ "cmi.core.student_id": "acme-1" });
    withHostApi(api);
    runLauncher();

    sendFromShim("progress", {
      "cmi.core.lesson_status": "completed",
      "cmi.core.session_time": "0000:07:35",
    });

    expect(api.sets.map(([element]) => element)).not.toContain("cmi.core.session_time");

    window.dispatchEvent(new Event("pagehide"));

    expect(api.sets).toContainEqual(["cmi.core.session_time", "0000:07:35"]);
    expect(api.sets.filter(([element]) => element === "cmi.core.session_time")).toHaveLength(1);
    expect(api.finishes).toBe(1);
  });

  // A commit with nothing before it is a round trip that says nothing, and it
  // reads as a defect in the host's own debug log.
  it("does not commit when a progress message had nothing to write", () => {
    const api = createFakeApi({ "cmi.core.student_id": "acme-1" });
    withHostApi(api);
    runLauncher();

    sendFromShim("progress", {});

    expect(api.sets).toHaveLength(0);
    expect(api.commits).toBe(0);
  });

  it("ignores progress that arrives after the session is closed", () => {
    const api = createFakeApi({ "cmi.core.student_id": "acme-1" });
    withHostApi(api);
    runLauncher();

    window.dispatchEvent(new Event("pagehide"));
    const setsAtClose = api.sets.length;
    const commitsAtClose = api.commits;

    sendFromShim("progress", { "cmi.core.lesson_status": "completed" });

    expect(api.sets).toHaveLength(setsAtClose);
    expect(api.commits).toBe(commitsAtClose);
  });

  it("merges what progress reported with what finish adds", () => {
    const api = createFakeApi({ "cmi.core.student_id": "acme-1" });
    withHostApi(api);
    runLauncher();

    sendFromShim("progress", { "cmi.core.lesson_status": "completed" });
    api.sets.length = 0;
    sendFromShim("finish", { "cmi.core.session_time": "00:18:22" });

    expect(api.sets).toContainEqual(["cmi.core.lesson_status", "completed"]);
    expect(api.sets).toContainEqual(["cmi.core.session_time", "00:18:22"]);
    expect(api.finishes).toBe(1);
  });

  it("ignores messages from any origin but the launch URL's", () => {
    const api = createFakeApi({ "cmi.core.student_id": "acme-1" });
    withHostApi(api);
    runLauncher();

    sendFromShim("finish", { "cmi.core.lesson_status": "completed" }, "https://evil.example.com");

    expect(api.sets).toHaveLength(0);
    expect(api.finishes).toBe(0);
  });

  it("ignores messages that are not ours, whatever origin they arrive from", () => {
    const api = createFakeApi({ "cmi.core.student_id": "acme-1" });
    withHostApi(api);
    runLauncher();

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: LAUNCH_ORIGIN,
        data: { type: "finish", values: { "cmi.core.lesson_status": "completed" } },
      }),
    );

    expect(api.finishes).toBe(0);
  });

  it("keeps going when the host rejects an element", () => {
    const api = createFakeApi({ "cmi.core.student_id": "acme-1" });
    const rejecting = {
      ...api,
      LMSSetValue(element: string, value: string) {
        if (element === "cmi.core.score.raw") throw new Error("host says no");
        api.sets.push([element, value]);
        return "true" as const;
      },
    };
    withHostApi(rejecting);
    runLauncher();

    sendFromShim("progress", {
      "cmi.core.lesson_status": "completed",
      "cmi.core.score.raw": "90",
    });

    expect(api.sets).toContainEqual(["cmi.core.lesson_status", "completed"]);
  });

  it("says hello to the course frame at the launch origin and never a wildcard", () => {
    const api = createFakeApi({ "cmi.core.student_id": "acme-1" });
    withHostApi(api);
    runLauncher();

    const frame = courseFrame()!;
    const postMessage = vi.fn();
    // close() included because jsdom calls it on every frame at teardown.
    Object.defineProperty(frame, "contentWindow", {
      value: { postMessage, close: () => {} },
      configurable: true,
    });
    frame.dispatchEvent(new Event("load"));

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ source: "openscorm-dispatch", type: "host-hello" }),
      LAUNCH_ORIGIN,
    );
  });
});
