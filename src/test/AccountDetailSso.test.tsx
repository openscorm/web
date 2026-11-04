import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AccountDetailPage } from "@/routes/AccountDetailPage";

// A customer whose organization signs in through its identity provider read
// "Password last set: Never" beside a learner who had signed in, and asked
// whether something was wrong. For such an organization, an account that has
// never set a password shows its sign-in method instead of password dates.

const manager = {
  accountKey: 1,
  accountId: "6f1c1e5e-0000-4000-8000-000000000001",
  email: "zara@tt.test",
  name: "Zara",
  tenantKey: 7,
  tenantHandle: "tt",
  tenantType: "Small",
  isOperator: false,
  isManager: true,
  isLearner: false,
};

const learner = {
  accountKey: 42,
  accountId: "8457b10e-9a94-5431-905d-909501d79ca6",
  email: "karol@tt.test",
  name: "Karol Zelinski",
  isActive: true,
  isManager: false,
  isLearner: true,
  isOperator: false,
  createdAt: "2026-11-02T10:00:00Z",
  invitedAt: null,
  acceptedAt: null,
  authenticatedAt: "2026-11-03T14:36:39Z",
  passwordResetAt: null,
  passwordExpiresAt: "2027-02-02T10:00:00Z",
  canSignIn: false,
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function renderWith(detail: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/me")) return Promise.resolve(json(manager));
      if (url.endsWith("/api/tenants/7/accounts/42")) return Promise.resolve(json(detail));
      if (url.includes("/assignments")) return Promise.resolve(json({ items: [] }));
      return Promise.resolve(json({}));
    }),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/accounts/42"]}>
        <Routes>
          <Route path="/accounts/:accountKey" element={<AccountDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Account detail sign-in fields", () => {
  it("shows single sign-on, not password dates, for an organization that uses it", async () => {
    renderWith({ ...learner, ssoEnabled: true });

    expect(await screen.findByText("Single sign-on")).toBeInTheDocument();
    expect(screen.getByText("Sign-in method")).toBeInTheDocument();
    expect(screen.queryByText("Password last set")).not.toBeInTheDocument();
    expect(screen.queryByText("Password expires")).not.toBeInTheDocument();
    expect(screen.queryByText("Never")).not.toBeInTheDocument();
  });

  it("keeps the password dates for an organization that signs in with passwords", async () => {
    renderWith({ ...learner, ssoEnabled: false });

    expect(await screen.findByText("Password last set")).toBeInTheDocument();
    expect(screen.getByText("Password expires")).toBeInTheDocument();
    expect(screen.queryByText("Single sign-on")).not.toBeInTheDocument();
  });
});
