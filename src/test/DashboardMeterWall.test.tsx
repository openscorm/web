import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { DashboardPage } from "@/routes/DashboardPage";
import type { MeResponse } from "@/lib/types";

// Until the meter enforces the card shows
// the provisioned accounts gauge, unchanged. Once it does, the card shows the
// learners who launched this period, the cap and the reset date, and never both
// numbers at once. Over cap it says so plainly, says access continues, and names
// the tier that fits; a second period running over says that too.

const manager: MeResponse = {
  accountKey: 5,
  accountId: "6f1c1e5e-0000-4000-8000-000000000005",
  email: "manager@acme.test",
  name: "Morgan Manager",
  tenantKey: 42,
  tenantHandle: "acme",
  tenantType: "Mini",
  isOperator: false,
  isManager: true,
  isLearner: false,
  dispatchEnabled: false,
  environment: "test",
};

const baseCapacity = {
  tenantType: "Mini",
  courseCount: 2,
  courseLimit: 3,
  userCount: 64,
  accountCount: 60,
  registrationCount: 4,
  userLimit: 100,
  isCoursesUnlimited: false,
  isUsersUnlimited: false,
  isCoursesOverLimit: false,
  isUsersOverLimit: false,
  isCoursesNearLimit: false,
  isUsersNearLimit: false,
  isOverLimit: false,
  isNearLimit: false,
  recommendedTier: null,
  meter: null as Record<string, unknown> | null,
};

function dashboard(meter: Record<string, unknown> | null) {
  return {
    tenantKey: 42,
    tenantHandle: "acme",
    tenantName: "Acme",
    tenantType: "Mini",
    capacity: { ...baseCapacity, meter },
    courseCount: 2,
    deletedCourseCount: 0,
    learnerCount: 60,
    managerCount: 2,
  };
}

const meter = (overrides: Record<string, unknown> = {}) => ({
  current: 40,
  previous: 12,
  limit: 100,
  state: "under",
  periodStartsAt: "2026-09-10T15:00:00+00:00",
  periodResetsAt: "2026-10-10T15:00:00+00:00",
  fittingTier: null,
  aboveTopTier: false,
  rosterUnlimited: true,
  ...overrides,
});

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const captured: { event: string; props?: Record<string, unknown> }[] = [];
vi.mock("@/lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics")>();
  return {
    ...actual,
    capture: (event: string, props?: Record<string, unknown>) => captured.push({ event, props }),
  };
});

function stubFetch(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/dashboard")) return Promise.resolve(json(body));
      if (url.endsWith("/api/auth/me")) return Promise.resolve(json(manager));
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }),
  );
}

beforeEach(() => {
  captured.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Dashboard capacity card under the active-learner meter", () => {
  it("shows the users gauge and no period while the meter is off", async () => {
    stubFetch(dashboard(null));
    renderPage();

    // Matched by the gauge's own label element, so a nav link or a sentence
    // that says "users" cannot satisfy it.
    expect(await screen.findByText("Users", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByText("Active learners this period")).not.toBeInTheDocument();
  });

  it("replaces the users gauge with the period count and reset date", async () => {
    stubFetch(dashboard(meter()));
    renderPage();

    expect(
      await screen.findByText("Active learners this period", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Users", { selector: "span" })).not.toBeInTheDocument();
    expect(screen.getByText(/Resets 2026-10-10/)).toBeInTheDocument();
  });

  it("says the numbers, says access continues, and names the tier that fits", async () => {
    stubFetch(dashboard(meter({ current: 140, state: "over", fittingTier: "Starter" })));
    renderPage();

    expect(
      await screen.findByText(/140 of 100 active learners this period/, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/All learners keep full access/)).toBeInTheDocument();

    const cta = screen.getByRole("link", { name: "Move to Starter" });
    expect(cta).toHaveAttribute("href", "/billing?from=meter_wall&tier=Starter");

    await waitFor(() =>
      expect(captured.find((c) => c.event === "meter_wall_banner_shown")).toBeTruthy(),
    );

    await userEvent.click(cta);
    expect(captured.find((c) => c.event === "meter_upgrade_cta_clicked")?.props).toMatchObject({
      fitting_tier: "Starter",
      state: "over",
    });
  });

  it("names the second period over the plan when sustained", async () => {
    stubFetch(dashboard(meter({ current: 140, state: "sustained", fittingTier: "Starter" })));
    renderPage();

    expect(
      await screen.findByText(/the second period in a row over your plan/, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it("offers a conversation rather than a plan when usage is above the top tier", async () => {
    stubFetch(
      dashboard(meter({ current: 9000, state: "over", fittingTier: null, aboveTopTier: true })),
    );
    renderPage();

    expect(
      await screen.findByText(/above our largest plan/, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Move to/ })).not.toBeInTheDocument();
  });

  // Caught on test during the cutover walk, not by a test. A Free tenant was
  // shown "your roster is unlimited" while its next account answered 402,
  // because the line was written once for everyone and the roster cap only
  // retires on paid tiers.
  it("promises an unlimited roster only when the roster really is unlimited", async () => {
    stubFetch(dashboard(meter({ rosterUnlimited: true })));
    renderPage();

    expect(
      await screen.findByText(/your roster is unlimited/, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it("tells a capped tenant its plan still limits how many learners it can add", async () => {
    stubFetch(dashboard(meter({ rosterUnlimited: false })));
    renderPage();

    expect(
      await screen.findByText(/still limits how many learners you can add/, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/your roster is unlimited/)).not.toBeInTheDocument();
  });

  // Free is held to its account cap rather than to the meter, so the
  // server sends no meter block for a Free tenant however the flag is set, and
  // the card falls through to the accounts gauge. The number that answers 402
  // is the number on the card.
  describe("on Free", () => {
    function freeDashboard(overrides: Record<string, unknown> = {}) {
      const body = dashboard(null);
      return {
        ...body,
        tenantType: "Trial",
        capacity: { ...body.capacity, tenantType: "Trial", userLimit: 10, ...overrides },
      };
    }

    it("shows accounts against the Free cap", async () => {
      stubFetch(freeDashboard({ userCount: 7, accountCount: 7, registrationCount: 0 }));
      renderPage();

      expect(await screen.findByText("Free", {}, { timeout: 3000 })).toBeInTheDocument();
      expect(screen.getByText(/7 of 10/)).toBeInTheDocument();
    });

    // A tenant that cancels back to Free keeps the accounts it already had and
    // cannot add another until it is under the cap. Without this line the gauge
    // reads 14 of 10 and says nothing about why adding one fails.
    it("explains why a downgraded tenant over the cap cannot add another account", async () => {
      stubFetch(
        freeDashboard({
          userCount: 14,
          accountCount: 14,
          registrationCount: 0,
          isUsersOverLimit: true,
          isOverLimit: true,
        }),
      );
      renderPage();

      expect(
        await screen.findByText(/you already have keep working/, {}, { timeout: 3000 }),
      ).toBeInTheDocument();
    });

    it("says nothing about it while the tenant is within the cap", async () => {
      stubFetch(freeDashboard({ userCount: 7, accountCount: 7, registrationCount: 0 }));
      renderPage();

      await screen.findByText("Free", {}, { timeout: 3000 });
      expect(screen.queryByText(/you already have keep working/)).not.toBeInTheDocument();
    });
  });
});
