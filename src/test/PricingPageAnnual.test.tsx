import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PricingPage } from "@/routes/PricingPage";

// A tier with no annual price is monthly-only. The annual view leaves it out
// instead of offering it at $0, which Checkout would refuse anyway.

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
    {
      name: "Large",
      courseLimit: 300,
      userLimit: 5000,
      monthlyPriceUsd: 450,
      annualPriceUsd: 4860,
    },
    {
      name: "Provider",
      courseLimit: 1000,
      userLimit: 15000,
      monthlyPriceUsd: 850,
      annualPriceUsd: 0,
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

describe("PricingPage annual view", () => {
  it("offers a monthly-only tier monthly and leaves it out of the annual view", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("button", { name: "Choose Provider" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Annual (save 10%)" }));

    expect(screen.getByRole("button", { name: "Choose Large" })).toBeInTheDocument();
    expect(screen.getByText("$4860 billed annually")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose Provider" })).not.toBeInTheDocument();
  });
});
