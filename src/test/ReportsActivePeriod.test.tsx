import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ReportsPage } from "@/routes/ReportsPage";
import type { MeResponse } from "@/lib/types";

// FR2.1. The billing period view on Reports lists the learners the meter
// counts, one row per learner, so the list reconciles to the capacity card. It
// is URL-driven so the card can open it, it shows hosted and dispatch learners
// with the counting rule stated, and a dispatch learner the host relayed no
// name for is shown by its host-LMS id.

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
  dispatchEnabled: true,
  environment: "test",
};

const activeLearners = {
  period: "current",
  periodStartsAt: "2026-09-10T15:00:00+00:00",
  periodEndsAt: "2026-10-10T15:00:00+00:00",
  meterCount: 3,
  page: 1,
  pageSize: 20,
  total: 3,
  learners: [
    {
      type: "hosted",
      accountKey: 7,
      registrationKey: null,
      learnerName: "Ada Hosted",
      email: "ada@acme.test",
      externalLearnerId: null,
      clientName: null,
      courseTitle: null,
      firstLaunchAt: "2026-09-12T10:00:00+00:00",
      status: "Deactivated",
    },
    {
      type: "dispatch",
      accountKey: null,
      registrationKey: 11,
      learnerName: null,
      email: null,
      externalLearnerId: "lms-4471",
      clientName: "Northwind",
      courseTitle: "Forklift Safety",
      firstLaunchAt: "2026-09-13T10:00:00+00:00",
      status: "Active",
    },
    {
      type: "dispatch",
      accountKey: null,
      registrationKey: 12,
      learnerName: "Cy Relayed",
      email: null,
      externalLearnerId: "lms-9",
      clientName: "Northwind",
      courseTitle: "Forklift Safety",
      firstLaunchAt: "2026-09-14T10:00:00+00:00",
      status: "Archived",
    },
  ],
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

vi.mock("@/lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics")>();
  return { ...actual, capture: vi.fn() };
});

const requested: string[] = [];

function stubFetch() {
  requested.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith("/api/auth/me")) return Promise.resolve(json(manager));
      if (url.includes("/reports/active-learners")) return Promise.resolve(json(activeLearners));
      if (url.includes("/reports/records"))
        return Promise.resolve(json({ page: 1, pageSize: 20, total: 0, records: [] }));
      if (url.endsWith("/courses") || url.endsWith("/clients")) return Promise.resolve(json([]));
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <ReportsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Reports billing period view", () => {
  it("opens from the URL with the count, the period and the counting rule", async () => {
    stubFetch();
    renderAt("/reports?period=current&from=dashboard_card");

    expect(await screen.findByText("3 active learners", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText("2026-09-10")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Hosted learners count once per period. Each dispatch registration counts separately.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Billing period")).toHaveValue("current");
    expect(requested.some((u) => u.includes("active-learners?period=current"))).toBe(true);
    expect(requested.some((u) => u.includes("/reports/records"))).toBe(false);
  });

  it("shows hosted and dispatch learners, and the host id when no name was relayed", async () => {
    stubFetch();
    renderAt("/reports?period=current");

    const hosted = await screen.findByRole("link", { name: "Ada Hosted" }, { timeout: 3000 });
    expect(hosted).toHaveAttribute("href", "/reports/learners/7");
    expect(within(hosted.closest("td")!).getByText(/deactivated/)).toBeInTheDocument();

    const unnamed = screen.getAllByText("lms-4471");
    expect(unnamed[0]).toHaveClass("font-mono");
    expect(screen.getByText("Cy Relayed")).toBeInTheDocument();
    expect(screen.getAllByRole("cell", { name: "Dispatch" })).toHaveLength(2);
  });

  it("switches from the records list to the period view from the selector", async () => {
    stubFetch();
    renderAt("/reports");

    await screen.findByText("No records match these filters", {}, { timeout: 3000 });
    await userEvent.selectOptions(screen.getByLabelText("Billing period"), "previous");

    expect(await screen.findByText("3 active learners")).toBeInTheDocument();
    expect(requested.some((u) => u.includes("active-learners?period=previous"))).toBe(true);
    expect(screen.getByText(/Ended/)).toBeInTheDocument();
  });

  // Found on test: the heading keeps the full count while a search narrows the
  // rows, so an empty result must say the search found nobody, not that
  // nobody launched.
  it("says a search found nobody rather than that nobody launched", async () => {
    stubFetch();
    const inner = vi.mocked(fetch);
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input).includes("search=")
          ? Promise.resolve(json({ ...activeLearners, total: 0, learners: [] }))
          : inner(input),
      ),
    );
    renderAt("/reports?period=current");

    await screen.findByText("3 active learners", {}, { timeout: 3000 });
    await userEvent.type(screen.getByLabelText("Search"), "nobody");

    expect(await screen.findByText("No learners match this search")).toBeInTheDocument();
    expect(screen.getByText("3 active learners")).toBeInTheDocument();
    expect(screen.queryByText("No learners launched in this period")).not.toBeInTheDocument();
  });
});
