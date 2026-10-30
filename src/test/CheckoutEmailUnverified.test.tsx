import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { DispatchLockedPage } from "@/routes/DispatchLockedPage";
import { PricingPage } from "@/routes/PricingPage";

// A Free manager who has not verified their email is refused Checkout with
// { code, message }, not a problem detail. Both upgrade buttons must show that
// sentence. A bare "Checkout failed." leaves the manager with no way forward,
// and because the refusal is a 403 rather than a fault, nothing reports it to
// us either: the customer is the only one who sees it.

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
      emailVerified: false,
    },
    loading: false,
  }),
}));

const refusal =
  "Verify your email before upgrading. Check your inbox, or resend the verification email from the prompt at the top of the app.";

const tiers = {
  tiers: [
    { name: "Trial", courseLimit: 1, userLimit: 10, monthlyPriceUsd: 0, annualPriceUsd: 0 },
    { name: "Mini", courseLimit: 3, userLimit: 100, monthlyPriceUsd: 30, annualPriceUsd: 324 },
  ],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

let posts: string[];

beforeEach(() => {
  posts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/billing/tiers")) return Promise.resolve(json(tiers));
      if (init?.method === "POST" && url.endsWith("/api/billing/checkout-session")) {
        posts.push(url);
        return Promise.resolve(json({ code: "email_unverified", message: refusal }, 403));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage(page: ReactNode, url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>{page}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Checkout refused for an unverified email", () => {
  it("shows the server's sentence on the pricing page", async () => {
    const user = userEvent.setup();
    renderPage(<PricingPage />, "/billing");

    await user.click(await screen.findByRole("button", { name: "Choose Mini" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(refusal);
    expect(screen.queryByText("Checkout failed.")).not.toBeInTheDocument();
    expect(posts).toHaveLength(1);
  });

  it("shows the server's sentence on the locked dispatch page", async () => {
    const user = userEvent.setup();
    renderPage(<DispatchLockedPage />, "/dispatch");

    await user.click(screen.getByRole("button", { name: "Upgrade to unlock dispatch" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(refusal);
    expect(screen.queryByText("Checkout failed.")).not.toBeInTheDocument();
    expect(posts).toHaveLength(1);
  });
});
