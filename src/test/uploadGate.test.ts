import { describe, expect, it } from "vitest";

import { uploadDisabledFor } from "@/lib/uploadGate";

// At the limit the upload stays open, so the attempt reaches the server and
// its refusal raises the course-wall email. Over the limit it closes.
describe("uploadDisabledFor", () => {
  it("leaves upload open at exactly the course limit", () => {
    expect(uploadDisabledFor({ isCoursesOverLimit: false })).toBe(false);
  });

  it("closes upload once the tenant is over the limit", () => {
    expect(uploadDisabledFor({ isCoursesOverLimit: true })).toBe(true);
  });

  it("leaves upload open before capacity has loaded", () => {
    expect(uploadDisabledFor(undefined)).toBe(false);
  });
});
