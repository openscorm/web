import { describe, expect, it } from "vitest";

import { TRUST_SECTIONS, TRUST_LAST_REVIEWED } from "@/lib/trust";

// Every field on these objects reaches the browser, because Vite
// compiles this module into the public bundle, and the whole web/ tree is
// copied into the public mirror of this tree. A ref field carrying reviewer
// provenance shipped that way for several releases: the renderer ignored it,
// so nobody saw it, and nothing failed. Reviewer notes now live outside this
// tree entirely.
//
// TrustControl has no ref member, so excess property checking already rejects a
// literal that adds one back. This asserts the same thing at runtime, for the
// case that reaches the array through a cast or a spread that type checking
// does not see. It names the allowed keys rather than banning "ref", because
// the next leak will be called something else.

const ALLOWED_CONTROL_KEYS = ["title", "detail", "status", "links"];
const ALLOWED_LINK_KEYS = ["label", "href"];

describe("trust page content", () => {
  it("ships no field beyond what the page renders", () => {
    const offenders: string[] = [];

    for (const section of TRUST_SECTIONS) {
      for (const control of section.controls) {
        for (const key of Object.keys(control)) {
          if (!ALLOWED_CONTROL_KEYS.includes(key)) {
            offenders.push(`${section.id} / ${control.title}: ${key}`);
          }
        }

        for (const link of control.links ?? []) {
          for (const key of Object.keys(link)) {
            if (!ALLOWED_LINK_KEYS.includes(key)) {
              offenders.push(`${section.id} / ${control.title} / link: ${key}`);
            }
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("carries a reviewed date the page can render", () => {
    expect(TRUST_LAST_REVIEWED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
