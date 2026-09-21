import { describe, expect, it } from "vitest";

import { createScormApi, type DataModel } from "../lib/scormDataModel";
import { createScorm2004Api } from "../lib/scormDataModel2004";
import { createSessionClock } from "../lib/sessionDuration";

// A clock a test can drive, so elapsed time is asserted rather than slept for.
function fakeClock() {
  let millis = 1_000_000;
  return {
    now: () => millis,
    advance(seconds: number) {
      millis += seconds * 1000;
    },
  };
}

describe("session clock", () => {
  it("measures forward from creation and never reports negative time", () => {
    const clock = fakeClock();
    const session = createSessionClock(clock.now);

    expect(session.elapsedSeconds()).toBe(0);
    clock.advance(90);
    expect(session.elapsedSeconds()).toBe(90);
  });

  it("rounds to the two decimal places both time formats carry", () => {
    const clock = fakeClock();
    const session = createSessionClock(clock.now);

    clock.advance(1.2345);
    expect(session.elapsedSeconds()).toBe(1.23);
  });
});

describe("SCORM 1.2 measured duration", () => {
  function drive(initialData?: DataModel) {
    const clock = fakeClock();
    const commits: DataModel[] = [];
    const api = createScormApi({
      studentId: "1",
      studentName: "learner@example.com",
      initialData,
      onCommit: (d) => commits.push(d),
      now: clock.now,
    });
    api.LMSInitialize("");
    return { api, commits, clock };
  }

  it("records the sitting the player measured when the SCO reports nothing", () => {
    const { api, commits, clock } = drive();

    clock.advance(90);
    api.LMSFinish("");

    expect(commits.at(-1)!["cmi.core.total_time"]).toBe("0000:01:30.00");
  });

  it("keeps the SCO's own time when it reports one", () => {
    const { api, commits, clock } = drive();

    api.LMSSetValue("cmi.core.session_time", "0000:00:10");
    clock.advance(90);
    api.LMSFinish("");

    expect(commits.at(-1)!["cmi.core.total_time"]).toBe("0000:00:10.00");
  });

  it("adds the measured sitting onto time from prior sessions", () => {
    const { api, commits, clock } = drive({ "cmi.core.total_time": "0001:00:00" });

    clock.advance(90);
    api.LMSFinish("");

    expect(commits.at(-1)!["cmi.core.total_time"]).toBe("0001:01:30.00");
  });

  it("never tells the SCO about the current session", () => {
    const { api, clock } = drive({ "cmi.core.total_time": "0001:00:00" });

    clock.advance(90);

    // total_time is the accumulation across PRIOR sessions. A SCO reading it
    // mid-session must see what it saw at launch.
    expect(api.LMSGetValue("cmi.core.total_time")).toBe("0001:00:00");
  });
});

describe("SCORM 2004 measured duration", () => {
  function drive(initialData?: DataModel) {
    const clock = fakeClock();
    const commits: DataModel[] = [];
    const api = createScorm2004Api({
      learnerId: "1",
      learnerName: "learner@example.com",
      initialData,
      onCommit: (d) => commits.push(d),
      now: clock.now,
    });
    api.Initialize("");
    return { api, commits, clock };
  }

  it("records the sitting the player measured when the SCO reports nothing", () => {
    const { api, commits, clock } = drive();

    clock.advance(90);
    api.Terminate("");

    expect(commits.at(-1)!["cmi.total_time"]).toBe("PT0H1M30S");
  });

  it("keeps the SCO's own time when it reports one", () => {
    const { api, commits, clock } = drive();

    api.SetValue("cmi.session_time", "PT0H0M10S");
    clock.advance(90);
    api.Terminate("");

    expect(commits.at(-1)!["cmi.total_time"]).toBe("PT0H0M10S");
  });

  it("adds the measured sitting onto time from prior sessions", () => {
    const { api, commits, clock } = drive({ "cmi.total_time": "PT1H0M0S" });

    clock.advance(90);
    api.Terminate("");

    expect(commits.at(-1)!["cmi.total_time"]).toBe("PT1H1M30S");
  });

  it("never tells the SCO about the current session", () => {
    const { api, clock } = drive({ "cmi.total_time": "PT1H0M0S" });

    clock.advance(90);

    expect(api.GetValue("cmi.total_time")).toBe("PT1H0M0S");
  });

  it("covers the exit path that lost the time in the first place", () => {
    // The isEazy packages report session_time from their own exit routine.
    // Clicking the player's Exit terminates the runtime before that routine
    // runs, so nothing is reported and the sitting used to record as zero.
    const { api, commits, clock } = drive();

    api.SetValue("cmi.progress_measure", "0.22");
    api.SetValue("cmi.suspend_data", "somewhere");
    clock.advance(66);
    api.Terminate("");

    expect(commits.at(-1)!["cmi.total_time"]).toBe("PT0H1M6S");
  });
});

describe("the clock stops when the sitting does", () => {
  it("freezes the measurement at stop", () => {
    const clock = fakeClock();
    const session = createSessionClock(clock.now);

    clock.advance(30);
    session.stop();
    clock.advance(600);

    expect(session.elapsedSeconds()).toBe(30);
  });

  it("keeps a 1.2 snapshot taken after LMSFinish reporting the sitting", () => {
    const clock = fakeClock();
    let take: (() => DataModel) | null = null;
    const api = createScormApi({
      studentId: "1",
      studentName: "learner@example.com",
      onCommit: () => {},
      now: clock.now,
      exposeSnapshot: (s) => {
        take = s;
      },
    });

    api.LMSInitialize("");
    clock.advance(90);
    api.LMSFinish("");

    // An unload beacon can fire well after the SCO terminated, while the page
    // is still tearing down. It must report the sitting that happened, not
    // keep counting against a course nobody is in any more.
    clock.advance(600);
    expect(take!()["cmi.core.total_time"]).toBe("0000:01:30.00");
  });

  it("keeps a 2004 snapshot taken after Terminate reporting the sitting", () => {
    const clock = fakeClock();
    let take: (() => DataModel) | null = null;
    const api = createScorm2004Api({
      learnerId: "1",
      learnerName: "learner@example.com",
      onCommit: () => {},
      now: clock.now,
      exposeSnapshot: (s) => {
        take = s;
      },
    });

    api.Initialize("");
    clock.advance(90);
    api.Terminate("");

    clock.advance(600);
    expect(take!()["cmi.total_time"]).toBe("PT0H1M30S");
  });
});
