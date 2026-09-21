import { describe, expect, it } from "vitest";

import { createScorm2004Api, type DataModel } from "@/lib/scormDataModel2004";

// The seam between the two halves of SCORM 2004 support.
//
// The runtime emits a data model snapshot; the server projects that snapshot
// onto a stored status, a score and a duration. Both halves were tested, but
// against payloads written by hand on each side, which is the trap where two
// test suites agree with each other and neither agrees with production. The
// first version of the server's payload was missing
// cmi.comments_from_learner._count and cmi.comments_from_lms._count, which the
// runtime does in fact emit, and nothing would have caught that.
//
// So the payload has one home. This test asserts the runtime still produces it,
// and Slate.Progress.Tests drives the same file through the real ProgressWriter.
// A change to the runtime's snapshot fails here and must be regenerated
// deliberately rather than discovered in production.
import expected from "../../../tests/fixtures/scorm2004-runtime-snapshot.json";

/**
 * A finished, passed attempt that resumed a sitting with two hours banked.
 * Kept in step with tests/fixtures/scorm2004-runtime-snapshot.json.
 */
function playAFinishedAttempt(): DataModel {
  let final: DataModel = {};

  const api = createScorm2004Api({
    learnerId: "5001",
    learnerName: "learner@example.com",
    initialData: { "cmi.total_time": "PT2H0M0S" },
    onCommit: (d) => {
      final = d;
    },
  });

  api.Initialize("");
  api.SetValue("cmi.location", "playing/scoring");
  api.SetValue("cmi.suspend_data", "page=12;answers=1,1,0,1");
  api.SetValue("cmi.objectives.0.id", "playing_obj");
  api.SetValue("cmi.objectives.0.success_status", "passed");
  api.SetValue("cmi.objectives.0.score.scaled", "0.9");
  api.SetValue("cmi.interactions.0.id", "playing_q1");
  api.SetValue("cmi.interactions.0.type", "choice");
  api.SetValue("cmi.interactions.0.learner_response", "fourteen");
  api.SetValue("cmi.interactions.0.result", "correct");
  api.SetValue("cmi.score.scaled", "0.85");
  api.SetValue("cmi.score.raw", "85");
  api.SetValue("cmi.score.min", "0");
  api.SetValue("cmi.score.max", "100");
  api.SetValue("cmi.progress_measure", "1");
  api.SetValue("cmi.completion_status", "completed");
  api.SetValue("cmi.success_status", "passed");
  api.SetValue("cmi.session_time", "PT35M12S");
  api.SetValue("cmi.exit", "normal");
  api.Terminate("");

  return final;
}

describe("the 2004 runtime's committed snapshot", () => {
  it("matches the fixture the server is tested against", () => {
    // If this fails, the runtime's output changed. Regenerate the fixture and
    // re-run Slate.Progress.Tests, because the server's rollup is asserted
    // against this exact payload.
    expect(playAFinishedAttempt()).toEqual(expected);
  });

  it("carries the elements the server's projection reads", () => {
    // Named individually so a failure says which one went missing rather than
    // printing a thirty-five key diff.
    const snapshot = playAFinishedAttempt();

    expect(snapshot["cmi.completion_status"]).toBe("completed");
    expect(snapshot["cmi.success_status"]).toBe("passed");
    expect(snapshot["cmi.score.raw"]).toBe("85");
    expect(snapshot["cmi.total_time"]).toBe("PT2H35M12S");
  });

  it("writes no SCORM 1.2 element names at all", () => {
    // The server projects rather than the runtime translating. If the runtime
    // ever started emitting cmi.core.* the projection would silently prefer it,
    // and the two halves would disagree about which standard this is.
    const snapshot = playAFinishedAttempt();

    const legacy = Object.keys(snapshot).filter((k) => k.startsWith("cmi.core."));
    expect(legacy).toEqual([]);
  });
});
