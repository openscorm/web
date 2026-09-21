import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PlayerPage } from "@/routes/PlayerPage";

// Reported on a real iPhone: the per-course chrome position
// (Left / Center / Right) had no effect there. It does have effect: the bar
// moves 93px on a 375px screen. The defect is width, not wiring. Measured
// against the app's own compiled CSS with Inter loaded, the bar is 250px wide
// at every viewport, so on a 375px phone it covers 67% of the width and the
// Left and Right positions overlap by 157px. That central band is covered
// whichever position the course author picks, so repositioning cannot clear
// the content. On a 1280px desktop the two positions do not overlap at all,
// which is why desktop was reported working. Below sm the bar now starts
// collapsed (40px), which is the only variant that also survives a course
// setting a long custom exit label.

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: {
      accountKey: 1,
      accountId: "a",
      email: "learner@acme.test",
      name: "Learner",
      tenantKey: 7,
      tenantHandle: "acme",
      tenantType: "Mini",
      isOperator: false,
      isManager: false,
      isLearner: true,
    },
    loading: false,
  }),
}));

let position = "Left";

// standard "xapi" keeps the SCORM runtime install and its progress gate out of
// this test: the player only builds a runtime for a scorm launch, and the bar
// is identical on both branches.
function launchResponse() {
  return {
    standard: "xapi",
    courseKey: 573,
    title: "Hydrogen Sulfide Awareness",
    launchUrl: "https://content.example.test/activity",
    navigationPosition: position,
    navigationExitText: "Exit",
    exitUrl: null,
  };
}

function stubViewportWide(wide: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: wide, addEventListener() {}, removeEventListener() {} }),
  );
}

beforeEach(() => {
  position = "Left";
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(launchResponse()), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPlayer() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/play/573"]}>
        <Routes>
          <Route path="/play/:courseKey" element={<PlayerPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("player chrome at phone width", () => {
  it("starts collapsed below the sm breakpoint, so the position setting can clear the content", async () => {
    stubViewportWide(false);
    renderPlayer();

    expect(await screen.findByRole("button", { name: "Expand" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Exit" })).not.toBeInTheDocument();
  });

  it("starts expanded at desktop width, where the two positions do not overlap", async () => {
    stubViewportWide(true);
    renderPlayer();

    expect(await screen.findByRole("button", { name: "Exit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse" })).toBeInTheDocument();
  });

  it("still opens on demand at phone width, so Exit stays reachable", async () => {
    stubViewportWide(false);
    renderPlayer();

    (await screen.findByRole("button", { name: "Expand" })).click();

    expect(await screen.findByRole("button", { name: "Exit" })).toBeInTheDocument();
  });
});

describe("configured position", () => {
  // Pins the behavior 3527220 restored on 2026-07-13, which had no test. This
  // passes with or without the collapse change, so it guards that older fix
  // rather than this one.
  it("applies the course's Right setting to the floating bar", async () => {
    position = "Right";
    stubViewportWide(true);
    renderPlayer();

    const exit = await screen.findByRole("button", { name: "Exit" });
    expect(exit.parentElement).toHaveClass("right-4");
  });
});
