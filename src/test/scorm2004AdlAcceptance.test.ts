import { describe, expect, it } from "vitest";

import { createScorm2004Api, type DataModel } from "@/lib/scormDataModel2004";

// Acceptance against real reference content rather than against my own reading
// of the specification.
//
// The element list below was extracted from ADL's published SCORM 2004 3rd
// Edition golf examples, RuntimeBasicCalls and RunTimeAdvancedCalls, which
// exist for the express purpose of exercising the run-time data model. If the
// runtime cannot answer every element that content touches, it cannot run that
// content, and the packages a customer sends will touch the same ones.
//
// The bar here is deliberately "the runtime has an opinion": no 401 for an
// element ADL uses, and no rejection of a value ADL sets.

const ELEMENTS_ADL_TOUCHES = [
  "adl.nav.request",
  "cmi.completion_status",
  "cmi.exit",
  "cmi.interactions._count",
  "cmi.location",
  "cmi.objectives._count",
  "cmi.progress_measure",
  "cmi.score.max",
  "cmi.score.min",
  "cmi.score.raw",
  "cmi.score.scaled",
  "cmi.session_time",
  "cmi.success_status",
];

const OBJECTIVE_CHILDREN_ADL_TOUCHES = [
  "id",
  "score.scaled",
  "score.raw",
  "score.min",
  "score.max",
  "completion_status",
  "progress_measure",
  "description",
];

const INTERACTION_CHILDREN_ADL_TOUCHES = [
  "id",
  "type",
  "learner_response",
  "result",
  "description",
];

function start(initialData?: DataModel) {
  const commits: DataModel[] = [];
  const api = createScorm2004Api({
    learnerId: "1001",
    learnerName: "Jordan Blake",
    initialData,
    onCommit: (d) => commits.push(d),
  });
  api.Initialize("");
  return { api, commits };
}

describe("every element ADL's runtime examples touch is implemented", () => {
  it.each(ELEMENTS_ADL_TOUCHES)("knows %s", (element) => {
    const { api } = start();

    api.GetValue(element);
    const error = api.GetLastError();

    // 401 means "undefined data model element", which would be the runtime
    // saying it has never heard of something ADL's own content uses. 405 is a
    // legitimate answer for a write-only element, and 403 for one not yet set.
    expect(error).not.toBe("401");
    expect(["0", "403", "405"]).toContain(error);
  });

  it.each(OBJECTIVE_CHILDREN_ADL_TOUCHES)("knows cmi.objectives.n.%s", (child) => {
    const { api } = start();
    api.SetValue("cmi.objectives.0.id", "obj-1");

    api.GetValue(`cmi.objectives.0.${child}`);

    expect(api.GetLastError()).not.toBe("401");
  });

  it.each(INTERACTION_CHILDREN_ADL_TOUCHES)("knows cmi.interactions.n.%s", (child) => {
    const { api } = start();
    api.SetValue("cmi.interactions.0.id", "q-1");

    api.GetValue(`cmi.interactions.0.${child}`);

    expect(api.GetLastError()).not.toBe("401");
  });
});

describe("a full ADL style attempt", () => {
  it("plays through the sequence RuntimeAdvancedCalls performs", () => {
    // Resuming a suspended attempt with two hours already banked, which is the
    // shape the golf examples use to demonstrate a second session.
    const { api, commits } = start({
      "cmi.total_time": "PT2H0M0S",
      "cmi.completion_status": "incomplete",
      "cmi.location": "playing/par",
      "cmi.suspend_data": "page=4",
    });

    expect(api.GetValue("cmi.location")).toBe("playing/par");
    expect(api.GetValue("cmi.completion_status")).toBe("incomplete");

    // Objectives, as the advanced example writes them.
    expect(api.SetValue("cmi.objectives.0.id", "playing_obj")).toBe("true");
    expect(api.SetValue("cmi.objectives.0.description", "Playing the game")).toBe("true");
    expect(api.SetValue("cmi.objectives.0.score.scaled", "0.9")).toBe("true");
    expect(api.SetValue("cmi.objectives.0.score.raw", "90")).toBe("true");
    expect(api.SetValue("cmi.objectives.0.score.min", "0")).toBe("true");
    expect(api.SetValue("cmi.objectives.0.score.max", "100")).toBe("true");
    expect(api.SetValue("cmi.objectives.0.completion_status", "completed")).toBe("true");
    expect(api.SetValue("cmi.objectives.0.progress_measure", "1")).toBe("true");

    // One interaction of each shape the examples use.
    expect(api.SetValue("cmi.interactions.0.id", "playing_q1")).toBe("true");
    expect(api.SetValue("cmi.interactions.0.type", "choice")).toBe("true");
    expect(api.SetValue("cmi.interactions.0.description", "How many clubs?")).toBe("true");
    expect(api.SetValue("cmi.interactions.0.learner_response", "fourteen")).toBe("true");
    expect(api.SetValue("cmi.interactions.0.result", "correct")).toBe("true");

    expect(api.SetValue("cmi.interactions.1.id", "playing_q2")).toBe("true");
    expect(api.SetValue("cmi.interactions.1.type", "true-false")).toBe("true");
    expect(api.SetValue("cmi.interactions.1.learner_response", "true")).toBe("true");
    expect(api.SetValue("cmi.interactions.1.result", "incorrect")).toBe("true");

    // Course level outcome.
    expect(api.SetValue("cmi.score.scaled", "0.85")).toBe("true");
    expect(api.SetValue("cmi.score.raw", "85")).toBe("true");
    expect(api.SetValue("cmi.score.min", "0")).toBe("true");
    expect(api.SetValue("cmi.score.max", "100")).toBe("true");
    expect(api.SetValue("cmi.progress_measure", "1")).toBe("true");
    expect(api.SetValue("cmi.completion_status", "completed")).toBe("true");
    expect(api.SetValue("cmi.success_status", "passed")).toBe("true");
    expect(api.SetValue("cmi.location", "playing/scoring")).toBe("true");
    expect(api.SetValue("cmi.session_time", "PT35M12S")).toBe("true");
    expect(api.SetValue("cmi.exit", "normal")).toBe("true");

    expect(api.Terminate("")).toBe("true");

    const final = commits.at(-1)!;
    expect(final["cmi.completion_status"]).toBe("completed");
    expect(final["cmi.success_status"]).toBe("passed");
    expect(final["cmi.score.scaled"]).toBe("0.85");
    expect(final["cmi.objectives._count"]).toBe("1");
    expect(final["cmi.interactions._count"]).toBe("2");
    // Two hours carried in plus this session's thirty-five minutes.
    expect(final["cmi.total_time"]).toBe("PT2H35M12S");

    // Nothing went wrong anywhere in that sequence.
    expect(api.GetLastError()).toBe("0");
  });

  it("suspends and resumes without losing the bookmark or the banked time", () => {
    const first = start();
    first.api.SetValue("cmi.location", "playing/par");
    first.api.SetValue("cmi.suspend_data", "page=4;answers=1,0,1");
    first.api.SetValue("cmi.completion_status", "incomplete");
    first.api.SetValue("cmi.session_time", "PT20M");
    first.api.SetValue("cmi.exit", "suspend");
    first.api.Terminate("");

    const stored = first.commits.at(-1)!;
    expect(stored["cmi.total_time"]).toBe("PT0H20M0S");

    // The stored model is what the server hands back on the next launch.
    const second = start(stored);
    expect(second.api.GetValue("cmi.location")).toBe("playing/par");
    expect(second.api.GetValue("cmi.suspend_data")).toBe("page=4;answers=1,0,1");

    second.api.SetValue("cmi.session_time", "PT15M");
    second.api.Terminate("");

    expect(second.commits.at(-1)!["cmi.total_time"]).toBe("PT0H35M0S");
  });
});
