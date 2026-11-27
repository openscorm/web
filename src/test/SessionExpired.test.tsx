import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";

import { RequireDispatch } from "@/components/RequireDispatch";
import { RequireManager } from "@/components/RequireManager";
import { createQueryClient } from "@/lib/queryClient";
import { PricingPage } from "@/routes/PricingPage";

// A Free manager left a tab open past the 60-minute session, then pressed
// Upgrade on the locked Dispatch page. The API refused Checkout with 401, and
// the page showed "No active session." with no way to sign in again, because
// the cached /me still said signed in (Bump problem 384). Pricing has the same
// button and the same gap. A 401 now asks /me again: a lapsed session goes to
// sign-in with the page in ?next=, a live one stays put.

const user = {
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
  emailVerified: true,
  dispatchGated: true,
  dispatchEnabled: false,
};

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

let sessionAlive: boolean;
let meCalls: number;
let checkouts: number;

beforeEach(() => {
  sessionAlive = true;
  meCalls = 0;
  checkouts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/auth/me")) {
        meCalls++;
        return Promise.resolve(sessionAlive ? json(user) : json({ title: "Unauthenticated" }, 401));
      }
      if (url.endsWith("/api/billing/tiers")) return Promise.resolve(json(tiers));
      if (init?.method === "POST" && url.endsWith("/api/billing/checkout-session")) {
        checkouts++;
        return Promise.resolve(json({ message: "No active session." }, 401));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function SignInProbe() {
  const location = useLocation();
  return <p>sign-in at {location.pathname + location.search}</p>;
}

function renderAt(url: string) {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/billing"
            element={
              <RequireManager>
                <PricingPage />
              </RequireManager>
            }
          />
          <Route
            path="/dispatch"
            element={
              <RequireManager>
                <RequireDispatch>
                  <p>dispatch console</p>
                </RequireDispatch>
              </RequireManager>
            }
          />
          <Route path="/login" element={<SignInProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Checkout refused with 401", () => {
  it("sends a lapsed session on the locked Dispatch page to sign-in and back", async () => {
    const u = userEvent.setup();
    renderAt("/dispatch");
    const upgrade = await screen.findByRole("button", { name: "Upgrade to unlock dispatch" });

    sessionAlive = false;
    await u.click(upgrade);

    expect(await screen.findByText("sign-in at /login?next=%2Fdispatch")).toBeInTheDocument();
    expect(checkouts).toBe(1);
    expect(meCalls).toBe(2);
  });

  it("sends a lapsed session on Pricing to sign-in and back", async () => {
    const u = userEvent.setup();
    renderAt("/billing");
    const choose = await screen.findByRole("button", { name: "Choose Mini" });

    sessionAlive = false;
    await u.click(choose);

    expect(await screen.findByText("sign-in at /login?next=%2Fbilling")).toBeInTheDocument();
    expect(checkouts).toBe(1);
    expect(meCalls).toBe(2);
  });

  it("keeps the page when the session is still alive", async () => {
    const u = userEvent.setup();
    renderAt("/billing");

    await u.click(await screen.findByRole("button", { name: "Choose Mini" }));

    expect(await screen.findByText("No active session.")).toBeInTheDocument();
    await vi.waitFor(() => expect(meCalls).toBe(2));
    expect(screen.getByRole("button", { name: "Choose Mini" })).toBeInTheDocument();
    expect(screen.queryByText(/^sign-in at/)).not.toBeInTheDocument();
  });
});
