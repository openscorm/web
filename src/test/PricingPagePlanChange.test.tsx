import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PricingPage } from "@/routes/PricingPage";

// A subscribed manager who picks another plan sees the
// price of the change before anything is charged, and the confirm button says
// which way the money goes. The mocked user is on Mini, so every pick is an
// in-place change rather than a Checkout redirect.

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: {
      accountKey: 1,
      accountId: "a",
      email: "m@x.com",
      name: "Manager",
      tenantKey: 1,
      tenantHandle: "acme",
      tenantType: "Mini",
      isOperator: false,
      isManager: true,
      isLearner: false,
    },
    loading: false,
  }),
}));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" },
  });
}

const tiers = {
  tiers: [
    { name: "Trial", courseLimit: 1, userLimit: 10, monthlyPriceUsd: 0, annualPriceUsd: 0 },
    { name: "Mini", courseLimit: 3, userLimit: 100, monthlyPriceUsd: 30, annualPriceUsd: 324 },
    { name: "Starter", courseLimit: 10, userLimit: 200, monthlyPriceUsd: 60, annualPriceUsd: 648 },
  ],
};

const upgradePreview = {
  direction: "upgrade",
  fromTier: "Mini",
  toTier: "Starter",
  interval: "Monthly",
  amountDueTodayCents: 1500,
  currency: "usd",
  nextInvoiceAt: "2026-09-25T12:00:00Z",
  nextInvoiceAmountCents: 6000,
};

let posts: { path: string; body: Record<string, unknown> }[];
let previewResponse: () => Response;

beforeEach(() => {
  posts = [];
  previewResponse = () => json(upgradePreview);
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/billing/tiers")) return Promise.resolve(json(tiers));
      if (init?.method === "POST") {
        posts.push({ path: url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
        if (url.endsWith("/api/billing/plan-change/preview"))
          return Promise.resolve(previewResponse());
        if (url.endsWith("/api/billing/plan-change")) {
          return Promise.resolve(
            json({
              direction: "upgrade",
              fromTier: "Mini",
              toTier: "Starter",
              interval: "Monthly",
              amountChargedCents: 1500,
              currency: "usd",
              invoiceUrl: "https://invoice.stripe.com/i/in_1",
            }),
          );
        }
      }
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

describe("PricingPage plan change", () => {
  it("prices the change, confirms it, and reports what was charged", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Choose Starter" }));

    // The preview, not a redirect: the charge and the next invoice in words.
    expect(
      await screen.findByText(
        /You'll be charged \$15\.00 today for the rest of your current billing period\. From 2026-09-2\d, you'll pay \$60\.00 a month\./,
      ),
    ).toBeInTheDocument();
    expect(posts).toHaveLength(1);
    expect(posts[0].path).toMatch(/\/api\/billing\/plan-change\/preview$/);
    expect(posts[0].body).toMatchObject({
      tenantKey: 1,
      targetTier: "Starter",
      interval: "monthly",
    });

    await user.click(screen.getByRole("button", { name: "Upgrade to Starter" }));

    expect(await screen.findByText(/Your plan is now Starter\./)).toBeInTheDocument();
    expect(screen.getByText(/\$15\.00 was charged today\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View invoice" })).toHaveAttribute(
      "href",
      "https://invoice.stripe.com/i/in_1",
    );
    expect(posts).toHaveLength(2);
    expect(posts[1].path).toMatch(/\/api\/billing\/plan-change$/);
    expect(posts[1].body).toMatchObject({ targetTier: "Starter", interval: "monthly" });
  });

  it("names the no-refund rule on a downgrade and labels the button accordingly", async () => {
    previewResponse = () =>
      json({
        ...upgradePreview,
        direction: "downgrade",
        toTier: "Starter",
        amountDueTodayCents: 0,
      });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Choose Starter" }));

    expect(
      await screen.findByText(
        /Your plan changes right away\. There's no refund for the unused part of your current plan\. From 2026-09-2\d, you'll pay \$60\.00 a month\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Downgrade to Starter" })).toBeInTheDocument();
    expect(screen.queryByText(/charged/)).not.toBeInTheDocument();
  });

  it("shows the server's refusal instead of a dialog", async () => {
    previewResponse = () =>
      json(
        {
          title: "Switch at renewal",
          status: 409,
          detail:
            "Annual billing runs to the end of the paid year. Switch to monthly billing when it renews.",
        },
        409,
      );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Choose Starter" }));

    expect(
      await screen.findByText(
        "Annual billing runs to the end of the paid year. Switch to monthly billing when it renews.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(posts).toHaveLength(1);
  });
});
