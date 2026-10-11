import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PricingPage } from "@/routes/PricingPage";

// The words a buyer reads at the point of paying. A free tenant's plan is
// "Free", never the internal "Trial", and a paid plan is sold on active
// learners per billing period, the same words as the public pricing page: it
// caps no accounts, so "5000 users" would tell a buyer something untrue.

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: {
      accountKey: 1,
      accountId: "a",
      email: "m@x.com",
      name: "Manager",
      tenantKey: 1,
      tenantHandle: "acme",
      tenantType: "Trial",
      isOperator: false,
      isManager: true,
      isLearner: false,
    },
    loading: false,
  }),
}));

const tiers = {
  tiers: [
    { name: "Trial", courseLimit: 1, userLimit: 10, monthlyPriceUsd: 0, annualPriceUsd: 0 },
    { name: "Mini", courseLimit: 3, userLimit: 100, monthlyPriceUsd: 30, annualPriceUsd: 324 },
    {
      name: "Large",
      courseLimit: 300,
      userLimit: 5000,
      monthlyPriceUsd: 450,
      annualPriceUsd: 4860,
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/billing/tiers"))
        return Promise.resolve(
          new Response(JSON.stringify(tiers), {
            headers: { "content-type": "application/json" },
          }),
        );
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
      <MemoryRouter initialEntries={["/billing"]}>
        <PricingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PricingPage wording", () => {
  it("names a free tenant's plan Free", () => {
    renderPage();

    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.queryByText("Trial")).not.toBeInTheDocument();
  });

  it("sells each plan on active learners per billing period", async () => {
    renderPage();

    expect(
      await screen.findByText("Up to 5,000 active learners per billing period"),
    ).toBeInTheDocument();
    expect(screen.getByText("Up to 100 active learners per billing period")).toBeInTheDocument();
    expect(screen.queryByText(/\busers\b/)).not.toBeInTheDocument();
  });
});
