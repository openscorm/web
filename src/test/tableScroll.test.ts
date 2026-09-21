import { describe, expect, it } from "vitest";

// A grid wider than its panel was chopped off with no way to reach the
// hidden columns, because the card carries overflow-hidden for its rounded
// corners and nothing between the card and the table could scroll. Two pages
// were reported; six more had the same shape and would otherwise have been
// found one screenshot at a time.
//
// A source scan rather than a render test on purpose. jsdom has no layout, so
// it cannot tell a scrolling grid from a clipped one at any width, and what
// actually regresses is someone adding a table without the wrapper.
//
// Loaded through Vite rather than node:fs because the app project carries no
// node types, and a test that fails typecheck is a broken build.
const sources = import.meta.glob("../**/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// How far back to look for the scroll container. The wrapper is always the
// table's immediate parent, so this only has to span the opening div and any
// attributes on the table itself.
const LOOKBACK = 400;

describe("data grids scroll instead of clipping", () => {
  it("keeps every table inside a horizontal scroll container", () => {
    const offenders: string[] = [];

    for (const [path, source] of Object.entries(sources)) {
      if (path.startsWith("../test/")) continue;

      for (const match of source.matchAll(/<table\b/g)) {
        const preceding = source.slice(Math.max(0, match.index - LOOKBACK), match.index);
        if (!preceding.includes("overflow-x-auto")) {
          offenders.push(`${path}:${source.slice(0, match.index).split("\n").length}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  // A scan that matches nothing passes for the wrong reason, and this one is
  // one glob pattern away from scanning an empty set.
  //
  // Since the design-system migration a data grid is reached one of two ways: a
  // raw <table> wrapped in overflow-x-auto (guarded above), or the
  // ui/table.tsx <Table> primitive, which wraps itself in overflow-x-auto. The
  // sentinel counts both, so converting a page from a raw <table> to <Table>
  // does not silently make the scan above vacuous.
  it("actually reaches the pages it is guarding", () => {
    const scanned = Object.keys(sources).filter((p) => !p.startsWith("../test/"));
    const withGrids = scanned.filter(
      (p) => /<table\b/.test(sources[p]) || sources[p].includes('from "@/components/ui/table"'),
    );

    // 36 components; well over a dozen reach a grid one way or the other. The
    // floors sit below both so deleting one page does not fail this, while a
    // glob that stops matching does.
    expect(scanned.length).toBeGreaterThan(20);
    expect(withGrids.length).toBeGreaterThanOrEqual(8);
  });
});
