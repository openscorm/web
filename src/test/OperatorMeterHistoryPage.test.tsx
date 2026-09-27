import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { OperatorMeterHistoryPage } from "@/routes/OperatorMeterHistoryPage";
import type { MeResponse } from "@/lib/types";

// The operator meter history lists one row per billing period with its count,
// plan and cap, labels pre-subscription months "Free plan", marks a plan that
// moved mid-period, and tells an unknown cap apart from an uncapped one.

const operator: MeResponse = {
  accountKey: 1,
  accountId: "6f1c1e5e-0000-4000-8000-000000000001",
  email: "operator@mail.openscorm.test",
  name: "Ops Person",
  tenantKey: 1,
  tenantHandle: "openscorm",
  tenantType: "Custom",
  isOperator: true,
  isManager: true,
  isLearner: false,
  dispatchEnabled: true,
  environment: "test",
};

const period = (overrides: Record<string, unknown>) => ({
  periodStartsAt: "2026-09-03T12:00:00+00:00",
  periodEndsAt: "2026-10-03T12:00:00+00:00",
  isCurrent: false,
  learners: 0,
  plan: "Small",
  planChangedDuring: false,
  isFreePlan: false,
  limit: 500,
  unlimited: false,
  ...overrides,
});

const history = {
  asOf: "2026-09-20T12:00:00+00:00",
  tenantKey: 42,
  tenantHandle: "acme",
  tenantName: "Acme",
  plan: "Medium",
  recordingSince: "2026-06-15T12:00:00+00:00",
  periods: [
    period({
      isCurrent: true,
      learners: 610,
      plan: "Medium",
      planChangedDuring: true,
      limit: 1500,
    }),
    period({
      periodStartsAt: "2026-08-03T12:00:00+00:00",
      periodEndsAt: "2026-09-03T12:00:00+00:00",
      learners: 480,
    }),
    period({
      periodStartsAt: "2026-07-03T12:00:00+00:00",
      periodEndsAt: "2026-08-03T12:00:00+00:00",
      learners: 9,
      plan: "Custom",
      limit: null,
    }),
    period({
      periodStartsAt: "2026-06-10T12:00:00+00:00",
      periodEndsAt: "2026-07-03T12:00:00+00:00",
      learners: 4,
      plan: "Free",
      isFreePlan: true,
      limit: 10,
    }),
  ],
};

let status: number;

function json(body: unknown, code = 200) {
  return new Response(JSON.stringify(body), {
    status: code,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  status = 200;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/operator/tenants/42/meter/history"))
        return Promise.resolve(
          status === 200 ? json(history) : json({ message: "Tenant not found." }, status),
        );
      if (url.endsWith("/api/auth/me")) return Promise.resolve(json(operator));
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operator/reports/meter/42"]}>
        <Routes>
          <Route path="/operator/reports/meter/:tenantKey" element={<OperatorMeterHistoryPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function rowFor(text: string) {
  return screen.getByText(text).closest("tr")!;
}

describe("OperatorMeterHistoryPage", () => {
  it("renders each period's count, plan and cap, newest first", async () => {
    renderPage();

    const current = (await screen.findByText("610", {}, { timeout: 3000 })).closest("tr")!;
    expect(within(current).getByText("Current")).toBeInTheDocument();
    expect(within(current).getByText("Medium")).toBeInTheDocument();
    expect(within(current).getByText("changed during this period")).toBeInTheDocument();
    expect(within(current).getByText("1500")).toBeInTheDocument();

    const august = rowFor("480");
    expect(within(august).getByText("Small")).toBeInTheDocument();
    expect(within(august).getByText("500")).toBeInTheDocument();
  });

  it("labels pre-subscription months Free plan", async () => {
    renderPage();
    await screen.findByText("610", {}, { timeout: 3000 });

    const june = rowFor("Free plan");
    expect(within(june).getByText("4")).toBeInTheDocument();
    expect(within(june).getByText("10")).toBeInTheDocument();
  });

  it("shows an unrecorded cap as a dash, not as uncapped", async () => {
    renderPage();
    await screen.findByText("610", {}, { timeout: 3000 });

    const july = rowFor("Custom");
    expect(within(july).getByText("-")).toBeInTheDocument();
    expect(within(july).queryByText("∞")).not.toBeInTheDocument();
  });

  it("says when recording began", async () => {
    renderPage();

    expect(
      await screen.findByText(/Recording began 2026-06-15/, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it("reports an unknown tenant", async () => {
    status = 404;
    renderPage();

    expect(await screen.findByText("Tenant not found", {}, { timeout: 3000 })).toBeInTheDocument();
  });
});
