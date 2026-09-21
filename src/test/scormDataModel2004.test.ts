import { describe, expect, it, vi } from "vitest";

import {
  createDefault2004DataModel,
  createScorm2004Api,
  durationToSeconds,
  isValidDuration,
  secondsToDuration,
  type DataModel,
} from "@/lib/scormDataModel2004";

// Step 2 of the SCORM 2004 plan. Where a rule here disagrees with
// scormDataModel.ts, the disagreement is the point: the two standards use the
// same-looking error codes for different meanings, and the 1.2 module must not
// be consulted as a reference for what 2004 should do.

function makeApi(overrides?: {
  initialData?: DataModel;
  onDirty?: (d: DataModel) => void;
  onFinish?: (d: DataModel) => void;
}) {
  const commits: DataModel[] = [];
  const api = createScorm2004Api({
    learnerId: "42",
    learnerName: "learner@example.com",
    initialData: overrides?.initialData,
    onDirty: overrides?.onDirty,
    onFinish: overrides?.onFinish,
    onCommit: (d) => commits.push(d),
  });
  return { api, commits };
}

function started() {
  const made = makeApi();
  made.api.Initialize("");
  return made;
}

describe("state machine", () => {
  it("uses the 2004 pre-initialization codes, not the 1.2 ones", () => {
    const { api } = makeApi();

    // The 1.2 module answers 301 to all of these. 2004 distinguishes which
    // call was made before initialization, and a conformance suite checks it.
    expect(api.GetValue("cmi.completion_status")).toBe("");
    expect(api.GetLastError()).toBe("122");

    expect(api.SetValue("cmi.completion_status", "completed")).toBe("false");
    expect(api.GetLastError()).toBe("132");

    expect(api.Commit("")).toBe("false");
    expect(api.GetLastError()).toBe("142");

    expect(api.Terminate("")).toBe("false");
    expect(api.GetLastError()).toBe("112");
  });

  it("rejects a second Initialize with 103", () => {
    const { api } = makeApi();

    expect(api.Initialize("")).toBe("true");
    expect(api.GetLastError()).toBe("0");
    expect(api.Initialize("")).toBe("false");
    expect(api.GetLastError()).toBe("103");
  });

  it("uses the 2004 post-termination codes", () => {
    const { api } = started();
    expect(api.Terminate("")).toBe("true");

    expect(api.GetValue("cmi.completion_status")).toBe("");
    expect(api.GetLastError()).toBe("123");

    expect(api.SetValue("cmi.completion_status", "completed")).toBe("false");
    expect(api.GetLastError()).toBe("133");

    expect(api.Commit("")).toBe("false");
    expect(api.GetLastError()).toBe("143");

    expect(api.Terminate("")).toBe("false");
    expect(api.GetLastError()).toBe("113");
  });

  it("refuses to re-Initialize a terminated instance with 104", () => {
    const { api } = started();
    api.Terminate("");

    expect(api.Initialize("")).toBe("false");
    expect(api.GetLastError()).toBe("104");
  });

  it("rejects a non-empty parameter with 201", () => {
    const { api } = makeApi();

    expect(api.Initialize("nonsense")).toBe("false");
    expect(api.GetLastError()).toBe("201");

    api.Initialize("");
    expect(api.Commit("nonsense")).toBe("false");
    expect(api.GetLastError()).toBe("201");
    expect(api.Terminate("nonsense")).toBe("false");
    expect(api.GetLastError()).toBe("201");
  });

  it("commits on Terminate and reports finish after commit", () => {
    const order: string[] = [];
    const commits: DataModel[] = [];
    const api = createScorm2004Api({
      learnerId: "1",
      learnerName: "x",
      onCommit: (d) => {
        order.push("commit");
        commits.push(d);
      },
      onFinish: () => order.push("finish"),
    });

    api.Initialize("");
    api.SetValue("cmi.completion_status", "completed");
    api.Terminate("");

    expect(order).toEqual(["commit", "finish"]);
    expect(commits[0]["cmi.completion_status"]).toBe("completed");
  });
});

describe("completion and success are separate axes", () => {
  it("carries completed and failed at the same time", () => {
    // The whole reason 2004 cannot be projected onto lesson_status without a
    // decision: this state is legal and has no 1.2 equivalent.
    const { api } = started();

    expect(api.SetValue("cmi.completion_status", "completed")).toBe("true");
    expect(api.SetValue("cmi.success_status", "failed")).toBe("true");

    expect(api.GetValue("cmi.completion_status")).toBe("completed");
    expect(api.GetValue("cmi.success_status")).toBe("failed");
  });

  it("defaults both to unknown rather than to a 1.2 style not attempted", () => {
    const { api } = started();

    expect(api.GetValue("cmi.completion_status")).toBe("unknown");
    expect(api.GetValue("cmi.success_status")).toBe("unknown");
  });

  it("rejects a 1.2 lesson_status vocabulary value with 406", () => {
    const { api } = started();

    expect(api.SetValue("cmi.completion_status", "passed")).toBe("false");
    expect(api.GetLastError()).toBe("406");
  });

  it("does not implement cmi.core.lesson_status at all", () => {
    const { api } = started();

    expect(api.SetValue("cmi.core.lesson_status", "completed")).toBe("false");
    expect(api.GetLastError()).toBe("401");
  });
});

describe("access rules", () => {
  it("refuses a write to a read-only element with 404", () => {
    const { api } = started();

    for (const element of [
      "cmi.learner_id",
      "cmi.learner_name",
      "cmi.total_time",
      "cmi.mode",
      "cmi.credit",
      "cmi.entry",
    ]) {
      expect(api.SetValue(element, "x")).toBe("false");
      expect(api.GetLastError()).toBe("404");
    }
  });

  it("refuses a read of a write-only element with 405", () => {
    const { api } = started();

    expect(api.GetValue("cmi.exit")).toBe("");
    expect(api.GetLastError()).toBe("405");

    expect(api.GetValue("cmi.session_time")).toBe("");
    expect(api.GetLastError()).toBe("405");
  });

  it("refuses an undefined element with 401", () => {
    const { api } = started();

    expect(api.GetValue("cmi.not_a_real_element")).toBe("");
    expect(api.GetLastError()).toBe("401");
    expect(api.SetValue("cmi.not_a_real_element", "x")).toBe("false");
    expect(api.GetLastError()).toBe("401");
  });

  it("refuses a write to _count and _children with 404", () => {
    const { api } = started();

    expect(api.SetValue("cmi.objectives._count", "5")).toBe("false");
    expect(api.GetLastError()).toBe("404");
    expect(api.SetValue("cmi.interactions._children", "x")).toBe("false");
    expect(api.GetLastError()).toBe("404");
  });

  it("reads the fixed _children lists", () => {
    const { api } = started();

    expect(api.GetValue("cmi.score._children")).toBe("scaled,raw,min,max");
    expect(api.GetValue("cmi.interactions._children")).toContain("correct_responses");
    expect(api.GetLastError()).toBe("0");
  });
});

describe("value validation", () => {
  it("rejects a score.scaled outside -1..1 with 407, not 406", () => {
    const { api } = started();

    expect(api.SetValue("cmi.score.scaled", "1.5")).toBe("false");
    expect(api.GetLastError()).toBe("407");

    expect(api.SetValue("cmi.score.scaled", "-2")).toBe("false");
    expect(api.GetLastError()).toBe("407");

    expect(api.SetValue("cmi.score.scaled", "-1")).toBe("true");
    expect(api.SetValue("cmi.score.scaled", "0.85")).toBe("true");
  });

  it("separates a wrong type from an out of range value", () => {
    const { api } = started();

    // Not a number at all: type mismatch.
    expect(api.SetValue("cmi.score.scaled", "excellent")).toBe("false");
    expect(api.GetLastError()).toBe("406");

    // A number, but not a permitted one: out of range.
    expect(api.SetValue("cmi.progress_measure", "2")).toBe("false");
    expect(api.GetLastError()).toBe("407");
  });

  it("accepts an unbounded score.raw", () => {
    const { api } = started();

    expect(api.SetValue("cmi.score.raw", "87.5")).toBe("true");
    expect(api.SetValue("cmi.score.raw", "-40")).toBe("true");
  });

  it("enforces the 64000 character suspend_data limit", () => {
    const { api } = started();

    // 2004 allows sixteen times what 1.2 does, and content relies on it.
    expect(api.SetValue("cmi.suspend_data", "x".repeat(64_000))).toBe("true");

    expect(api.SetValue("cmi.suspend_data", "x".repeat(64_001))).toBe("false");
    expect(api.GetLastError()).toBe("407");
  });

  it("validates the exit vocabulary including the 2004 only normal", () => {
    const { api } = started();

    for (const value of ["time-out", "suspend", "logout", "normal", ""]) {
      expect(api.SetValue("cmi.exit", value)).toBe("true");
    }

    expect(api.SetValue("cmi.exit", "finished")).toBe("false");
    expect(api.GetLastError()).toBe("406");
  });

  it("validates the navigation request vocabulary", () => {
    const { api } = started();

    expect(api.SetValue("adl.nav.request", "continue")).toBe("true");
    expect(api.SetValue("adl.nav.request", "suspendAll")).toBe("true");
    expect(api.SetValue("adl.nav.request", "onwards")).toBe("false");
    expect(api.GetLastError()).toBe("406");
  });
});

describe("ISO 8601 durations", () => {
  it("accepts the forms real content emits", () => {
    for (const value of [
      "PT0H0M0S",
      "PT1H30M15S",
      "PT15.25S",
      "P1DT2H",
      "PT90M",
      "P1Y2M3DT4H5M6S",
    ]) {
      expect(isValidDuration(value)).toBe(true);
    }
  });

  it("rejects malformed durations, including the 1.2 time format", () => {
    for (const value of ["0000:00:00", "P", "PT", "1H30M", "P1YT", "PT1H30", "", "PT1.234S"]) {
      expect(isValidDuration(value)).toBe(false);
    }
  });

  it("round trips through seconds", () => {
    expect(durationToSeconds("PT1H30M15S")).toBe(5415);
    expect(durationToSeconds("PT0H0M0S")).toBe(0);
    expect(durationToSeconds("PT15.5S")).toBe(15.5);
    expect(secondsToDuration(5415)).toBe("PT1H30M15S");
    expect(secondsToDuration(0)).toBe("PT0H0M0S");
  });

  it("does not roll hours into days", () => {
    // PT36H is unambiguous; P1DT12H invites the reader to wonder whether a day
    // is 24 hours in this context.
    expect(secondsToDuration(36 * 3600)).toBe("PT36H0M0S");
  });

  it("rejects a 1.2 formatted session_time with 406", () => {
    const { api } = started();

    expect(api.SetValue("cmi.session_time", "0000:10:00")).toBe("false");
    expect(api.GetLastError()).toBe("406");
    expect(api.SetValue("cmi.session_time", "PT10M")).toBe("true");
  });
});

describe("total_time accumulation", () => {
  it("adds the session to the total carried in from prior sessions", () => {
    const { api, commits } = makeApi({ initialData: { "cmi.total_time": "PT2H0M0S" } });
    api.Initialize("");

    api.SetValue("cmi.session_time", "PT30M");
    api.Commit("");

    expect(commits[0]["cmi.total_time"]).toBe("PT2H30M0S");
  });

  it("recomputes rather than accumulating when session_time is set twice", () => {
    // The 1.2 module adds each set into the running total, so a SCO that
    // reports its time more than once inflates it. Recomputing from the
    // session's starting total is idempotent.
    const { api, commits } = makeApi({ initialData: { "cmi.total_time": "PT1H0M0S" } });
    api.Initialize("");

    api.SetValue("cmi.session_time", "PT10M");
    api.SetValue("cmi.session_time", "PT20M");
    api.Commit("");

    expect(commits[0]["cmi.total_time"]).toBe("PT1H20M0S");
  });

  it("starts from zero when there is no prior total", () => {
    const { api, commits } = started();

    api.SetValue("cmi.session_time", "PT45M30S");
    api.Commit("");

    expect(commits[0]["cmi.total_time"]).toBe("PT0H45M30S");
  });
});

describe("objectives", () => {
  it("counts entries as they are appended", () => {
    const { api } = started();

    expect(api.GetValue("cmi.objectives._count")).toBe("0");

    api.SetValue("cmi.objectives.0.id", "obj-1");
    expect(api.GetValue("cmi.objectives._count")).toBe("1");

    api.SetValue("cmi.objectives.1.id", "obj-2");
    expect(api.GetValue("cmi.objectives._count")).toBe("2");
  });

  it("requires an id before any other field, with 408", () => {
    const { api } = started();

    expect(api.SetValue("cmi.objectives.0.success_status", "passed")).toBe("false");
    expect(api.GetLastError()).toBe("408");

    expect(api.SetValue("cmi.objectives.0.id", "obj-1")).toBe("true");
    expect(api.SetValue("cmi.objectives.0.success_status", "passed")).toBe("true");
  });

  it("refuses an index that would leave a hole, with 351", () => {
    const { api } = started();

    expect(api.SetValue("cmi.objectives.3.id", "obj-4")).toBe("false");
    expect(api.GetLastError()).toBe("351");
  });

  it("refuses a read past the end with 301", () => {
    const { api } = started();

    api.SetValue("cmi.objectives.0.id", "obj-1");

    expect(api.GetValue("cmi.objectives.5.id")).toBe("");
    expect(api.GetLastError()).toBe("301");
  });

  it("reports an unset field of an existing entry as 403", () => {
    const { api } = started();

    api.SetValue("cmi.objectives.0.id", "obj-1");

    expect(api.GetValue("cmi.objectives.0.description")).toBe("");
    expect(api.GetLastError()).toBe("403");
  });

  it("validates an objective score against the same range as the root score", () => {
    const { api } = started();
    api.SetValue("cmi.objectives.0.id", "obj-1");

    expect(api.SetValue("cmi.objectives.0.score.scaled", "0.5")).toBe("true");
    expect(api.SetValue("cmi.objectives.0.score.scaled", "3")).toBe("false");
    expect(api.GetLastError()).toBe("407");
  });
});

describe("interactions", () => {
  it("requires type before learner_response, with 408", () => {
    const { api } = started();
    api.SetValue("cmi.interactions.0.id", "q-1");

    // The response is parsed according to the type, so a response without a
    // type cannot be judged against anything.
    expect(api.SetValue("cmi.interactions.0.learner_response", "true")).toBe("false");
    expect(api.GetLastError()).toBe("408");

    expect(api.SetValue("cmi.interactions.0.type", "true-false")).toBe("true");
    expect(api.SetValue("cmi.interactions.0.learner_response", "true")).toBe("true");
  });

  it("validates the interaction type vocabulary", () => {
    const { api } = started();
    api.SetValue("cmi.interactions.0.id", "q-1");

    for (const type of [
      "true-false",
      "choice",
      "fill-in",
      "likert",
      "matching",
      "numeric",
      "other",
    ]) {
      expect(api.SetValue("cmi.interactions.0.type", type)).toBe("true");
    }

    expect(api.SetValue("cmi.interactions.0.type", "multiple-guess")).toBe("false");
    expect(api.GetLastError()).toBe("406");
  });

  it("accepts either a vocabulary token or a number for result", () => {
    const { api } = started();
    api.SetValue("cmi.interactions.0.id", "q-1");

    expect(api.SetValue("cmi.interactions.0.result", "correct")).toBe("true");
    expect(api.SetValue("cmi.interactions.0.result", "neutral")).toBe("true");
    expect(api.SetValue("cmi.interactions.0.result", "12.5")).toBe("true");
    expect(api.SetValue("cmi.interactions.0.result", "sort of")).toBe("false");
    expect(api.GetLastError()).toBe("406");
  });

  it("validates latency as a duration and timestamp as a date time", () => {
    const { api } = started();
    api.SetValue("cmi.interactions.0.id", "q-1");

    expect(api.SetValue("cmi.interactions.0.latency", "PT8S")).toBe("true");
    expect(api.SetValue("cmi.interactions.0.latency", "8 seconds")).toBe("false");
    expect(api.GetLastError()).toBe("406");

    expect(api.SetValue("cmi.interactions.0.timestamp", "2026-09-08T14:32:00")).toBe("true");
    expect(api.SetValue("cmi.interactions.0.timestamp", "Tuesday")).toBe("false");
    expect(api.GetLastError()).toBe("406");
  });

  it("carries nested correct_responses and objectives with their own counts", () => {
    const { api } = started();
    api.SetValue("cmi.interactions.0.id", "q-1");
    api.SetValue("cmi.interactions.0.type", "choice");

    expect(api.GetValue("cmi.interactions.0.correct_responses._count")).toBe("0");

    expect(api.SetValue("cmi.interactions.0.correct_responses.0.pattern", "a")).toBe("true");
    expect(api.SetValue("cmi.interactions.0.correct_responses.1.pattern", "b")).toBe("true");
    expect(api.GetValue("cmi.interactions.0.correct_responses._count")).toBe("2");
    expect(api.GetValue("cmi.interactions.0.correct_responses.1.pattern")).toBe("b");

    expect(api.SetValue("cmi.interactions.0.objectives.0.id", "obj-1")).toBe("true");
    expect(api.GetValue("cmi.interactions.0.objectives._count")).toBe("1");
    expect(api.GetValue("cmi.interactions.0.objectives._children")).toBe("id");
  });

  it("keeps nested counts independent per interaction", () => {
    const { api } = started();
    api.SetValue("cmi.interactions.0.id", "q-1");
    api.SetValue("cmi.interactions.0.correct_responses.0.pattern", "a");
    api.SetValue("cmi.interactions.1.id", "q-2");

    expect(api.GetValue("cmi.interactions.0.correct_responses._count")).toBe("1");
    expect(api.GetValue("cmi.interactions.1.correct_responses._count")).toBe("0");
  });
});

describe("comments", () => {
  it("lets the learner write comments and keeps the LMS ones read-only", () => {
    const { api } = started();

    expect(api.SetValue("cmi.comments_from_learner.0.comment", "Confusing slide")).toBe("true");

    expect(api.SetValue("cmi.comments_from_lms.0.comment", "hello")).toBe("false");
    expect(api.GetLastError()).toBe("404");
  });

  it("does not require an id for a comment", () => {
    // Comments have no id child at all, so the objectives dependency rule must
    // not be applied to them.
    const { api } = started();

    expect(api.SetValue("cmi.comments_from_learner.0.location", "slide-4")).toBe("true");
  });
});

describe("persistence seam", () => {
  it("merges server state over the defaults before the SCO initializes", () => {
    const { api } = makeApi({
      initialData: {
        "cmi.location": "slide-12",
        "cmi.suspend_data": "restored",
        "cmi.completion_status": "incomplete",
      },
    });
    api.Initialize("");

    expect(api.GetValue("cmi.location")).toBe("slide-12");
    expect(api.GetValue("cmi.suspend_data")).toBe("restored");
    expect(api.GetValue("cmi.completion_status")).toBe("incomplete");
  });

  it("rebuilds collection counts from stored keys rather than a stored count", () => {
    // A partially written model heals itself: the count is derived, so a
    // missing or stale _count cannot desynchronize the collection.
    const { api } = makeApi({
      initialData: {
        "cmi.objectives.0.id": "obj-1",
        "cmi.objectives.1.id": "obj-2",
        "cmi.objectives._count": "0",
      },
    });
    api.Initialize("");

    expect(api.GetValue("cmi.objectives._count")).toBe("2");
  });

  it("reports every set through onDirty and the whole model through onCommit", () => {
    const onDirty = vi.fn();
    const { api, commits } = makeApi({ onDirty });
    api.Initialize("");

    api.SetValue("cmi.location", "slide-3");
    expect(onDirty).toHaveBeenCalledTimes(1);

    api.Commit("");
    expect(commits).toHaveLength(1);
    expect(commits[0]["cmi.location"]).toBe("slide-3");
    expect(commits[0]["cmi.learner_id"]).toBe("42");
  });

  it("does not report a rejected set through onDirty", () => {
    const onDirty = vi.fn();
    const { api } = makeApi({ onDirty });
    api.Initialize("");

    api.SetValue("cmi.completion_status", "not-a-status");

    expect(onDirty).not.toHaveBeenCalled();
  });

  it("coerces every snapshot value to a string", () => {
    // SCO packages call SetValue with null despite the signature, and the
    // server rejects non-string JSON values with a 400.
    const { api, commits } = started();

    api.SetValue("cmi.location", null as unknown as string);
    api.Commit("");

    expect(commits[0]["cmi.location"]).toBe("");
  });
});

describe("defaults", () => {
  it("seeds the learner identity and the 2004 defaults", () => {
    const model = createDefault2004DataModel("99", "Sam Rivera");

    expect(model["cmi.learner_id"]).toBe("99");
    expect(model["cmi.learner_name"]).toBe("Sam Rivera");
    expect(model["cmi._version"]).toBe("1.0");
    expect(model["cmi.completion_status"]).toBe("unknown");
    expect(model["cmi.success_status"]).toBe("unknown");
    expect(model["cmi.total_time"]).toBe("PT0H0M0S");
    expect(model["adl.nav.request"]).toBe("_none_");
  });

  it("carries no 1.2 core elements", () => {
    const model = createDefault2004DataModel("1", "x");

    expect(Object.keys(model).some((k) => k.startsWith("cmi.core."))).toBe(false);
  });
});

describe("error strings", () => {
  it("names the 2004 meanings, which differ from the 1.2 ones", () => {
    const { api } = started();

    // In SCORM 1.2, 403 is "element is read only" and 404 is "element is write
    // only". In 2004 they mean different things, which is why the two modules
    // must not share an error table.
    expect(api.GetErrorString("403")).toBe("Data model element value not initialized");
    expect(api.GetErrorString("404")).toBe("Data model element is read only");
    expect(api.GetErrorString("405")).toBe("Data model element is write only");
    expect(api.GetErrorString("122")).toBe("Retrieve data before initialization");
  });

  it("returns an empty string for an unrecognized code", () => {
    const { api } = started();

    expect(api.GetErrorString("9999")).toBe("");
  });
});

describe("child lists inside a collection entry", () => {
  it("reads cmi.objectives.n.score._children", () => {
    // Parsed as an ordinary child before the fix, so it found no stored value
    // and answered 403 for an element that is always readable.
    const { api } = started();
    api.SetValue("cmi.objectives.0.id", "obj-1");

    expect(api.GetValue("cmi.objectives.0.score._children")).toBe("scaled,raw,min,max");
    expect(api.GetLastError()).toBe("0");
  });

  it("refuses to write one, with 404", () => {
    const { api } = started();
    api.SetValue("cmi.objectives.0.id", "obj-1");

    expect(api.SetValue("cmi.objectives.0.score._children", "x")).toBe("false");
    expect(api.GetLastError()).toBe("404");
  });
});
