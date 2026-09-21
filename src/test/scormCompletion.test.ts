import { describe, expect, it } from "vitest";

import { projectStatus, toLegacyDuration, toLegacyRelayModel } from "@/lib/scormCompletion";

// The one case table, imported rather than read from disk so this needs no
// @types/node, and imported from tests/fixtures rather than copied into web/
// so it stays one table.
import caseTable from "../../../tests/fixtures/scorm-completion-cases.json";

// The TypeScript third of one rule. The other two are
// progress.scorm_lesson_status in SQL (migration 051) and
// Slate.Content.ScormCompletion in C#, and all three read the case table below
// rather than each other. Slate.Progress.Tests additionally runs every case
// through both the SQL and the C# and compares them, so the three-way
// agreement is machine-checked rather than asserted in a comment.

interface StatusCase {
  why: string;
  completion: string | null;
  success: string | null;
  lesson12: string | null;
  expect: string | null;
}

interface DurationCase {
  why: string;
  raw: string | null;
  expect: string | null;
}

interface CaseTable {
  status: StatusCase[];
  duration: DurationCase[];
}

const cases = caseTable as unknown as CaseTable;

describe("the shared case table", () => {
  it("loaded, so the tables below are not vacuous", () => {
    // A table that failed to load would make every case below pass by
    // iterating nothing, which is the worst outcome for a test whose whole job
    // is to keep three implementations honest.
    expect(cases.status.length).toBeGreaterThanOrEqual(20);
    expect(cases.duration.length).toBeGreaterThanOrEqual(8);
  });
});

describe("projectStatus", () => {
  it.each(cases.status.map((c) => [c.why, c] as const))("%s", (_why, c) => {
    expect(projectStatus(c.completion, c.success, c.lesson12)).toBe(c.expect);
  });
});

describe("toLegacyDuration", () => {
  it.each(cases.duration.map((c) => [c.why, c] as const))("%s", (_why, c) => {
    expect(toLegacyDuration(c.raw)).toBe(c.expect);
  });
});

describe("toLegacyRelayModel", () => {
  it("rewrites a 2004 model into the names a host LMS can store", () => {
    const relayed = toLegacyRelayModel({
      "cmi.completion_status": "completed",
      "cmi.success_status": "passed",
      "cmi.score.raw": "90",
      "cmi.score.min": "0",
      "cmi.score.max": "100",
      "cmi.session_time": "PT21M30S",
    });

    expect(relayed["cmi.core.lesson_status"]).toBe("passed");
    expect(relayed["cmi.core.score.raw"]).toBe("90");
    expect(relayed["cmi.core.score.min"]).toBe("0");
    expect(relayed["cmi.core.score.max"]).toBe("100");
    expect(relayed["cmi.core.session_time"]).toBe("0000:21:30");
  });

  it("leaves a 1.2 model alone", () => {
    const original = {
      "cmi.core.lesson_status": "completed",
      "cmi.core.score.raw": "80",
      "cmi.core.session_time": "0000:10:00",
    };

    const relayed = toLegacyRelayModel(original);

    expect(relayed["cmi.core.lesson_status"]).toBe("completed");
    expect(relayed["cmi.core.score.raw"]).toBe("80");
    expect(relayed["cmi.core.session_time"]).toBe("0000:10:00");
  });

  it("does not invent a status when the course reported none", () => {
    const relayed = toLegacyRelayModel({ "cmi.location": "slide-2" });

    expect(relayed["cmi.core.lesson_status"]).toBeUndefined();
  });

  it("prefers an explicit 1.2 value over the 2004 one when both are present", () => {
    // Only reachable via a stale seeded default, but the precedence should be
    // stated rather than accidental.
    const relayed = toLegacyRelayModel({
      "cmi.core.score.raw": "70",
      "cmi.score.raw": "90",
    });

    expect(relayed["cmi.core.score.raw"]).toBe("70");
  });
});
