import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { OperatorTenantsPage } from "@/routes/OperatorTenantsPage";
import type { MeResponse } from "@/lib/types";

// The triage columns and the plan filter travel to the server as query
// parameters, and the sizes render in units a person can read.

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

const acme = {
  tenantKey: 42,
  tenantHandle: "acme",
  tenantName: "Acme",
  tenantType: "Mini",
  platformEdition: "Commercial",
  platformReferral: null,
  courseCount: 3,
  courseLimit: 3,
  userCount: 100,
  userLimit: 100,
  enrollmentCount: 250,
  createdAt: "2026-08-01T00:00:00+00:00",
  lastActivityAt: "2026-09-04T01:00:46+00:00",
  storageKb: 2 * 1024 * 1024,
  egressKb: 512000,
  apiCallsToday: 1234,
  suspendedAt: null,
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

let urls: string[];
// The shell also loads the signed-in account; only the list requests matter here.
const listUrls = () => urls.filter((u) => u.includes("/api/operator/tenants?"));

beforeEach(() => {
  urls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/api/operator/tenants?")) {
        return Promise.resolve(json({ page: 1, pageSize: 20, total: 1, tenants: [acme] }));
      }
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
      <MemoryRouter initialEntries={["/operator/tenants"]}>
        <OperatorTenantsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OperatorTenantsPage triage columns", () => {
  it("renders last activity and sizes in readable units", async () => {
    renderPage();

    expect(await screen.findByText("Acme", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText("Last activity")).toBeInTheDocument();
    expect(screen.getByText("2.0 GB")).toBeInTheDocument();
    expect(screen.getByText("500.0 MB")).toBeInTheDocument();
    expect(listUrls()[0]).toContain("sort=created");
    expect(listUrls()[0]).not.toContain("types=");
  });

  it("sends the plan filter and the chosen sort to the server", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Acme", {}, { timeout: 3000 });

    await user.selectOptions(screen.getByLabelText("Filter by plan"), "Mini");
    await waitFor(() => expect(listUrls().at(-1)).toContain("types=Mini"));

    await user.selectOptions(screen.getByLabelText("Sort tenants"), "egress");
    await waitFor(() => expect(listUrls().at(-1)).toContain("sort=egress"));
    expect(listUrls().at(-1)).toContain("types=Mini");
  });
});

// The list shows today's keyed API calls and marks a suspended tenant.
describe("OperatorTenantsPage safeguards", () => {
  it("shows API calls today and the suspended badge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/operator/tenants?")) {
          return Promise.resolve(
            json({
              page: 1,
              pageSize: 20,
              total: 1,
              tenants: [{ ...acme, suspendedAt: "2026-09-06T20:00:00+00:00" }],
            }),
          );
        }
        if (url.endsWith("/api/auth/me")) return Promise.resolve(json(operator));
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );
    renderPage();

    expect(await screen.findByText("Acme", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText("API today")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("Suspended")).toBeInTheDocument();
  });
});
