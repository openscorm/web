import { describe, expect, it } from "vitest";

import { createScorm2004Api, type DataModel } from "../lib/scormDataModel2004";

// Replays the exact call sequence the isEazy authoring tool emits, read out of
// the minified runtime in the two 2026-09-08 test packages. Their helpers:
//
//   Ta = score:        set score.raw, score.max=100, score.min=0, score.scaled=raw/100
//   Aa = success:      set success_status passed/failed
//   Oa = completion:   set completion_status completed
//   Na = exit:         set cmi.exit normal/suspend
//   Pa = session time: set session_time as an ISO 8601 duration built from
//                      elapsed centiseconds, so it omits any zero-valued
//                      leading component ("PT1M30S", not "PT0H1M30S")
//   Ma = save:         Commit
function drive(steps: (api: ReturnType<typeof createScorm2004Api>) => void) {
  const commits: DataModel[] = [];
  const api = createScorm2004Api({
    learnerId: "1",
    learnerName: "learner@example.com",
    onCommit: (d) => commits.push(d),
  });

  expect(api.Initialize("")).toBe("true");
  steps(api);
  return { api, commits };
}

describe("isEazy 2004 package replay", () => {
  it("accepts the score the quiz reports", () => {
    const { api } = drive((a) => {
      expect(a.SetValue("cmi.score.raw", "85")).toBe("true");
      expect(a.SetValue("cmi.score.max", "100")).toBe("true");
      expect(a.SetValue("cmi.score.min", "0")).toBe("true");
      expect(a.SetValue("cmi.score.scaled", "0.85")).toBe("true");
    });

    expect(api.GetValue("cmi.score.raw")).toBe("85");
  });

  it("accepts a session_time with no hours component", () => {
    const { api } = drive((a) => {
      expect(a.SetValue("cmi.session_time", "PT1M30S")).toBe("true");
    });

    expect(api.GetValue("cmi.total_time")).toBe("PT0H1M30S");
  });

  it("carries score and total_time into the committed snapshot", () => {
    const { commits } = drive((a) => {
      a.SetValue("cmi.completion_status", "completed");
      a.SetValue("cmi.score.raw", "85");
      a.SetValue("cmi.score.max", "100");
      a.SetValue("cmi.score.min", "0");
      a.SetValue("cmi.score.scaled", "0.85");
      a.SetValue("cmi.success_status", "passed");
      a.SetValue("cmi.exit", "normal");
      a.SetValue("cmi.session_time", "PT1M30S");
      a.Commit("");
      a.Terminate("");
    });

    const final = commits.at(-1)!;
    expect(final["cmi.score.raw"]).toBe("85");
    expect(final["cmi.total_time"]).toBe("PT0H1M30S");
    expect(final["cmi.completion_status"]).toBe("completed");
  });

  it("accepts every duration shape their builder can emit", () => {
    // Their builder omits any component that is zero, so these are the forms a
    // real sitting produces: under a minute, under an hour, exact hour, and a
    // fractional-second tail from the centisecond remainder.
    for (const [emitted, expected] of [
      ["PT45S", "PT0H0M45S"],
      ["PT1M30S", "PT0H1M30S"],
      ["PT1H", "PT1H0M0S"],
      ["PT2M7.53S", "PT0H2M7.53S"],
    ]) {
      const { api } = drive((a) => {
        expect(a.SetValue("cmi.session_time", emitted)).toBe("true");
      });
      expect(api.GetValue("cmi.total_time")).toBe(expected);
    }
  });
});
