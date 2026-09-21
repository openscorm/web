import { describe, expect, it } from "vitest";

import { createScormApi } from "@/lib/scormDataModel";
import { createScorm2004Api } from "@/lib/scormDataModel2004";
import {
  globalNameFor,
  installRuntime,
  SCORM_12_GLOBAL,
  SCORM_2004_GLOBAL,
  standardFromVersion,
  terminateRuntime,
  uninstallRuntime,
} from "@/lib/scormStandard";

// Step 3 of the SCORM 2004 plan. The global name is the entire point: a 1.2
// SCO searches its ancestors for "API" and a 2004 SCO searches for
// "API_1484_11", so publishing the wrong one produces a course that loads,
// renders its first slide, and tracks nothing at all.

describe("standardFromVersion", () => {
  it.each(["2004", "2004-2nd", "2004-3rd", "2004-4th"])("maps %s to 2004", (token) => {
    expect(standardFromVersion(token)).toBe("2004");
  });

  it("maps the 1.2 token to 1.2", () => {
    expect(standardFromVersion("1.2")).toBe("1.2");
  });

  it.each([null, undefined, "", "   "])("falls back to 1.2 for %s", (token) => {
    // Every course recorded before version detection existed reports "1.2",
    // and a launch response from an older API omits the field entirely.
    // Degrading to today's behavior beats handing a SCO no API at all.
    expect(standardFromVersion(token)).toBe("1.2");
  });

  it("falls back to 1.2 for something unrecognized", () => {
    expect(standardFromVersion("cmi5")).toBe("1.2");
    expect(standardFromVersion("xAPI")).toBe("1.2");
  });

  it("is not confused by case or surrounding space", () => {
    expect(standardFromVersion("  2004-4TH  ")).toBe("2004");
  });
});

describe("globalNameFor", () => {
  it("names the property each standard's content searches for", () => {
    expect(globalNameFor("1.2")).toBe("API");
    expect(globalNameFor("2004")).toBe("API_1484_11");
    expect(SCORM_12_GLOBAL).toBe("API");
    expect(SCORM_2004_GLOBAL).toBe("API_1484_11");
  });
});

describe("install and uninstall", () => {
  function scope() {
    return {} as unknown as Window;
  }

  it("publishes a 1.2 runtime as API and nothing else", () => {
    const target = scope();
    const runtime = createScormApi({ studentId: "1", studentName: "x", onCommit: () => {} });

    installRuntime(target, "1.2", runtime);

    expect((target as unknown as Record<string, unknown>).API).toBe(runtime);
    expect((target as unknown as Record<string, unknown>).API_1484_11).toBeUndefined();
  });

  it("publishes a 2004 runtime as API_1484_11 and nothing else", () => {
    const target = scope();
    const runtime = createScorm2004Api({ learnerId: "1", learnerName: "x", onCommit: () => {} });

    installRuntime(target, "2004", runtime);

    expect((target as unknown as Record<string, unknown>).API_1484_11).toBe(runtime);
    // Publishing both "so either kind of content works" would be worse than
    // useless: a 2004 SCO finding an API property does not check whether the
    // methods it needs exist, it calls Initialize on an object without them.
    expect((target as unknown as Record<string, unknown>).API).toBeUndefined();
  });

  it("removes only the runtime that is still installed", () => {
    const target = scope();
    const first = createScormApi({ studentId: "1", studentName: "x", onCommit: () => {} });
    const second = createScormApi({ studentId: "2", studentName: "y", onCommit: () => {} });

    installRuntime(target, "1.2", first);
    installRuntime(target, "1.2", second);

    // A relaunch replaced the property. Tearing down the first launch must not
    // strip the live course of its API.
    uninstallRuntime(target, "1.2", first);
    expect((target as unknown as Record<string, unknown>).API).toBe(second);

    uninstallRuntime(target, "1.2", second);
    expect((target as unknown as Record<string, unknown>).API).toBeUndefined();
  });
});

describe("terminateRuntime", () => {
  it("calls LMSFinish on a 1.2 runtime", () => {
    const commits: unknown[] = [];
    const runtime = createScormApi({
      studentId: "1",
      studentName: "x",
      onCommit: (d) => commits.push(d),
    });
    runtime.LMSInitialize("");

    terminateRuntime(runtime);

    expect(commits).toHaveLength(1);
    // Terminated: a further set is refused.
    expect(runtime.LMSSetValue("cmi.core.lesson_status", "completed")).toBe("false");
  });

  it("calls Terminate on a 2004 runtime", () => {
    const commits: unknown[] = [];
    const runtime = createScorm2004Api({
      learnerId: "1",
      learnerName: "x",
      onCommit: (d) => commits.push(d),
    });
    runtime.Initialize("");

    terminateRuntime(runtime);

    expect(commits).toHaveLength(1);
    expect(runtime.SetValue("cmi.completion_status", "completed")).toBe("false");
    expect(runtime.GetLastError()).toBe("133");
  });
});
