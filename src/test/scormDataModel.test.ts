import { describe, expect, it, vi } from "vitest";

import {
  accumulateTotalTime,
  createScormApi,
  isValidScormTime,
  type DataModel,
} from "@/lib/scormDataModel";

// Pins the extracted SCORM 1.2 state machine to the PlayScorm.js port's
// behavior. The session player and the dispatch shim both sit
// on this module, so a semantic drift here breaks two runtimes at once.

function makeApi(overrides?: { initialData?: DataModel; onDirty?: (d: DataModel) => void }) {
  const commits: DataModel[] = [];
  const api = createScormApi({
    studentId: "42",
    studentName: "learner@example.com",
    initialData: overrides?.initialData,
    onDirty: overrides?.onDirty,
    onCommit: (d) => commits.push(d),
  });
  return { api, commits };
}

describe("state machine", () => {
  it("rejects calls before LMSInitialize", () => {
    const { api } = makeApi();
    expect(api.LMSGetValue("cmi.core.lesson_status")).toBe("");
    expect(api.LMSGetLastError()).toBe("301");
    expect(api.LMSSetValue("cmi.core.lesson_status", "completed")).toBe("false");
    expect(api.LMSCommit("")).toBe("false");
  });

  it("rejects a second LMSInitialize with 101", () => {
    const { api } = makeApi();
    expect(api.LMSInitialize("")).toBe("true");
    expect(api.LMSInitialize("")).toBe("false");
    expect(api.LMSGetLastError()).toBe("101");
  });

  it("rejects a non-empty parameter string with 201", () => {
    const { api } = makeApi();
    expect(api.LMSInitialize("x")).toBe("false");
    expect(api.LMSGetLastError()).toBe("201");
  });

  it("rejects calls after LMSFinish with 301 (PlayScorm.js quirk)", () => {
    // LMSFinish clears the initialized flag, so post-finish calls hit the
    // not-initialized branch (301) before the terminated branch (103) is
    // ever reachable. SCORM 1.2 would say 133; the port is verbatim by
    // requirement, so the quirk is pinned rather than corrected.
    const { api } = makeApi();
    api.LMSInitialize("");
    expect(api.LMSFinish("")).toBe("true");
    expect(api.LMSSetValue("cmi.core.lesson_status", "completed")).toBe("false");
    expect(api.LMSGetLastError()).toBe("301");
    expect(api.LMSFinish("")).toBe("false");
    expect(api.LMSGetLastError()).toBe("301");
  });
});

describe("data model access", () => {
  it("serves defaults and initialData, ignoring empty initial values", () => {
    const { api } = makeApi({
      initialData: { "cmi.core.lesson_status": "incomplete", "cmi.suspend_data": "" },
    });
    api.LMSInitialize("");
    expect(api.LMSGetValue("cmi.core.lesson_status")).toBe("incomplete");
    expect(api.LMSGetValue("cmi.suspend_data")).toBe("");
    expect(api.LMSGetValue("cmi.core.student_id")).toBe("42");
    expect(api.LMSGetValue("cmi.core.student_name")).toBe("learner@example.com");
  });

  // The player half of the resume contract. cmi.core.entry is read-only to the
  // SCO, so it can only arrive in initialData, and the default here is
  // "ab-initio". If the server omits the key on a resume, that default stands
  // and a conforming course starts over despite holding perfect suspend data.
  // That was live on the session path until 2026-08-13; the server
  // half is ScormLoadPayload.Prepare.
  it("lets the server's entry value override the ab-initio default", () => {
    const { api } = makeApi({
      initialData: {
        "cmi.core.entry": "resume",
        "cmi.core.lesson_location": "probe-page-7",
        "cmi.suspend_data": "x".repeat(4096),
      },
    });
    api.LMSInitialize("");
    expect(api.LMSGetValue("cmi.core.entry")).toBe("resume");
    expect(api.LMSGetValue("cmi.core.lesson_location")).toBe("probe-page-7");
    expect(api.LMSGetValue("cmi.suspend_data")).toHaveLength(4096);
  });

  it("falls back to ab-initio when the server sends no entry", () => {
    const { api } = makeApi({ initialData: { "cmi.core.lesson_status": "incomplete" } });
    api.LMSInitialize("");
    expect(api.LMSGetValue("cmi.core.entry")).toBe("ab-initio");
  });

  it("returns empty string with no error for objectives and interactions reads", () => {
    const { api } = makeApi();
    api.LMSInitialize("");
    expect(api.LMSGetValue("cmi.objectives.0.id")).toBe("");
    expect(api.LMSGetLastError()).toBe("0");
  });

  it("returns 401 for unknown elements", () => {
    const { api } = makeApi();
    api.LMSInitialize("");
    expect(api.LMSGetValue("cmi.bogus")).toBe("");
    expect(api.LMSGetLastError()).toBe("401");
    expect(api.LMSSetValue("cmi.bogus", "x")).toBe("false");
  });
});

describe("write validation", () => {
  it("rejects an invalid lesson_status with 405", () => {
    const { api } = makeApi();
    api.LMSInitialize("");
    expect(api.LMSSetValue("cmi.core.lesson_status", "finished")).toBe("false");
    expect(api.LMSGetLastError()).toBe("405");
  });

  it("rejects non-numeric scores with 405", () => {
    const { api } = makeApi();
    api.LMSInitialize("");
    expect(api.LMSSetValue("cmi.core.score.raw", "ninety")).toBe("false");
    expect(api.LMSGetLastError()).toBe("405");
  });

  it("rejects writes to read-only elements with 403", () => {
    const { api } = makeApi();
    api.LMSInitialize("");
    expect(api.LMSSetValue("cmi.core.student_id", "7")).toBe("false");
    expect(api.LMSGetLastError()).toBe("403");
    expect(api.LMSGetValue("cmi.core.student_id")).toBe("42");
  });

  it("adds session_time to the total the sitting started with", () => {
    const { api } = makeApi();
    api.LMSInitialize("");
    expect(api.LMSSetValue("cmi.core.session_time", "00:10:30")).toBe("true");
    expect(api.LMSGetValue("cmi.core.total_time")).toBe("0000:10:30.00");
  });

  it("recomputes rather than accumulates when session_time is set again", () => {
    // A SCO that reports a cumulative session_time on every commit must not
    // have each report added on top of the last.
    const { api } = makeApi();
    api.LMSInitialize("");
    api.LMSSetValue("cmi.core.session_time", "00:10:30");
    api.LMSSetValue("cmi.core.session_time", "00:20:00");
    expect(api.LMSSetValue("cmi.core.session_time", "01:00:00")).toBe("true");
    expect(api.LMSGetValue("cmi.core.total_time")).toBe("0001:00:00.00");
  });

  it("keeps prior sessions when session_time is set more than once", () => {
    const { api, commits } = makeApi({ initialData: { "cmi.core.total_time": "0002:00:00" } });
    api.LMSInitialize("");
    api.LMSSetValue("cmi.core.session_time", "00:30:00");
    api.LMSSetValue("cmi.core.session_time", "00:59:01.29");
    api.LMSFinish("");
    expect(commits[commits.length - 1]["cmi.core.total_time"]).toBe("0002:59:01.29");
  });
});

describe("commit and dirty seams", () => {
  it("fires onCommit with the full model on LMSCommit and LMSFinish", () => {
    const { api, commits } = makeApi();
    api.LMSInitialize("");
    api.LMSSetValue("cmi.core.lesson_status", "completed");
    expect(api.LMSCommit("")).toBe("true");
    expect(api.LMSFinish("")).toBe("true");
    expect(commits).toHaveLength(2);
    expect(commits[0]["cmi.core.lesson_status"]).toBe("completed");
    expect(commits[1]["cmi.core.student_id"]).toBe("42");
  });

  it("fires onDirty for scalar sets but not for interaction array sets", () => {
    // The original runtime's probabilistic save never fired for the array
    // elements; the seam must preserve that timing exactly.
    const onDirty = vi.fn();
    const { api } = makeApi({ onDirty });
    api.LMSInitialize("");
    api.LMSSetValue("cmi.core.lesson_status", "incomplete");
    expect(onDirty).toHaveBeenCalledTimes(1);
    api.LMSSetValue("cmi.interactions.0.id", "q1");
    expect(onDirty).toHaveBeenCalledTimes(1);
  });
});

describe("time helpers", () => {
  it("validates SCORM time strings", () => {
    expect(isValidScormTime("00:10:30")).toBe(true);
    expect(isValidScormTime("0000:10:30.55")).toBe(true);
    expect(isValidScormTime("10:30")).toBe(false);
    expect(isValidScormTime("junk")).toBe(false);
  });

  it("accumulates with zero-padded four-digit hours", () => {
    expect(accumulateTotalTime("0000:00:00", "02:30:15.50")).toBe("0002:30:15.50");
  });
});
