import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { OperatorMeterReportPage } from "@/routes/OperatorMeterReportPage";
import type { MeResponse } from "@/lib/types";

// The operator meter report renders each tenant's counts, cap and
// state, says which tier fits an over-cap tenant, shows the ledger totals that
// prove launches are being recorded, and asks the server for idle tenants only
// when the operator opts in.

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

const tenant = (overrides: Record<string, unknown>) => ({
  tenantKey: 42,
  tenantHandle: "acme",
  tenantName: "Acme",
  plan: "Mini",
  platformEdition: "Commercial",
  isTest: false,
  periodAnchor: "subscription",
  periodStartsAt: "2026-09-10T15:00:00+00:00",
  periodResetsAt: "2026-10-10T15:00:00+00:00",
  current: 12,
  previous: 3,
  limit: 100,
  state: "under",
  fittingTier: null,
  aboveTopTier: false,
  ...overrides,
});

const report = {
  asOf: "2026-09-16T12:00:00+00:00",
  ledgerRows: 57,
  lastRecordedLaunchAt: "2026-09-16T11:58:00+00:00",
  tenants: [
    tenant({
      tenantKey: 7,
      tenantHandle: "bigco",
      tenantName: "BigCo",
      current: 140,
      previous: 120,
      state: "sustained",
      fittingTier: "Starter",
    }),
    tenant({}),
  ],
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

let urls: string[];
const reportUrls = () => urls.filter((u) => u.includes("/api/operator/reports/meter"));

beforeEach(() => {
  urls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/api/operator/reports/meter")) return Promise.resolve(json(report));
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
      <MemoryRouter initialEntries={["/operator/reports/meter"]}>
        <OperatorMeterReportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OperatorMeterReportPage", () => {
  it("renders counts, cap, state and the fitting tier per tenant", async () => {
    renderPage();

    const bigco = (await screen.findByText("BigCo", {}, { timeout: 3000 })).closest("tr")!;
    expect(within(bigco).getByText("Sustained")).toBeInTheDocument();
    expect(within(bigco).getByText("140")).toBeInTheDocument();
    expect(within(bigco).getByText("120")).toBeInTheDocument();
    expect(within(bigco).getByText("Starter")).toBeInTheDocument();

    const acme = screen.getByText("Acme").closest("tr")!;
    expect(within(acme).getByText("Under")).toBeInTheDocument();
    expect(within(acme).getByText("Subscription")).toBeInTheDocument();
  });

  it("shows the ledger totals that prove launches are being recorded", async () => {
    renderPage();

    expect(
      await screen.findByText(/57 launches recorded/, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it("asks for idle tenants only when the operator opts in", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("BigCo", {}, { timeout: 3000 });

    expect(reportUrls()[0]).not.toContain("all=true");

    await user.click(screen.getByLabelText("Include tenants with no learners in either period"));
    await waitFor(() => expect(reportUrls().at(-1)).toContain("all=true"));
  });
});
