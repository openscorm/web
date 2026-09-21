import { describe, expect, it } from "vitest";

import { packageTooLarge } from "@/lib/packageSize";

// The Library refuses an oversized file before it uploads, in
// the words the server would use, and stays quiet when the file fits or the
// capacity read has not arrived.
describe("packageTooLarge", () => {
  const mb = 1024 * 1024;

  it("is quiet when the file fits or nothing is known", () => {
    expect(packageTooLarge(100 * mb, { tenantType: "Trial", packageLimitMb: 100 })).toBeNull();
    expect(packageTooLarge(5000 * mb, undefined)).toBeNull();
  });

  it("names the Free plan and the plan that lifts the limit", () => {
    const message = packageTooLarge(250 * mb, { tenantType: "Trial", packageLimitMb: 100 });
    expect(message).toContain("250 MB");
    expect(message).toContain("Free plan");
    expect(message).toContain("Upgrade to Mini");
  });

  it("does not sell an upgrade on a paid plan", () => {
    const message = packageTooLarge(900 * mb, { tenantType: "Small", packageLimitMb: 800 });
    expect(message).toContain("800 MB");
    expect(message).not.toContain("Upgrade");
  });
});
