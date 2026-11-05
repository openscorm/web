import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { DispatchLockedPage } from "@/routes/DispatchLockedPage";
import { PricingPage } from "@/routes/PricingPage";

// A Free manager who has not verified their email is refused Checkout with
// { code, message }, not a problem detail. Both upgrade buttons must answer it
// with the confirm dialog: why paying is blocked, a resend, and a way to reach
// us. A bare "Checkout failed." left the manager with no way forward. The
// click still reaches the server, which records the refusal, because that
// record is how a stuck buyer reaches us the same day.

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
let resends: number;

beforeEach(() => {
  posts = [];
  resends = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/billing/tiers")) return Promise.resolve(json(tiers));
      if (init?.method === "POST" && url.endsWith("/api/billing/checkout-session")) {
        posts.push(url);
        return Promise.resolve(json({ code: "email_unverified", message: refusal }, 403));
      }
      if (init?.method === "POST" && url.endsWith("/api/auth/email/resend")) {
        resends++;
        return Promise.resolve(json({ message: "A new verification link is on the way." }, 202));
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
  it("opens the confirm dialog on the pricing page", async () => {
    const user = userEvent.setup();
    renderPage(<PricingPage />, "/billing");

    await user.click(await screen.findByRole("button", { name: "Choose Mini" }));

    const dialog = await screen.findByRole("dialog", { name: "Confirm your email to upgrade" });
    expect(dialog).toHaveTextContent("m@x.com");
    // Card customers get no emailed receipts, so the popup must not promise them.
    expect(dialog).toHaveTextContent("so your billing notices reach you");
    expect(dialog).not.toHaveTextContent(/receipts/i);
    expect(screen.getByRole("link", { name: "support@openscorm.com" })).toHaveAttribute(
      "href",
      "mailto:support@openscorm.com",
    );
    expect(screen.queryByText("Checkout failed.")).not.toBeInTheDocument();
    expect(posts).toHaveLength(1);
  });

  it("opens the confirm dialog on the locked dispatch page", async () => {
    const user = userEvent.setup();
    renderPage(<DispatchLockedPage />, "/dispatch");

    await user.click(screen.getByRole("button", { name: "Upgrade to unlock dispatch" }));

    expect(
      await screen.findByRole("dialog", { name: "Confirm your email to upgrade" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Checkout failed.")).not.toBeInTheDocument();
    expect(posts).toHaveLength(1);
  });

  it("resends the confirmation link from the dialog", async () => {
    const user = userEvent.setup();
    renderPage(<DispatchLockedPage />, "/dispatch");

    await user.click(screen.getByRole("button", { name: "Upgrade to unlock dispatch" }));
    await screen.findByRole("dialog", { name: "Confirm your email to upgrade" });
    await user.click(screen.getByRole("button", { name: "Resend email" }));

    expect(await screen.findByText(/^Sent\. Check your inbox/)).toBeInTheDocument();
    expect(resends).toBe(1);
  });
});
