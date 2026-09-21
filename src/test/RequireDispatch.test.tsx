import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { RequireDispatch } from "@/components/RequireDispatch";
import type { MeResponse } from "@/lib/types";

// Three outcomes the guard must keep straight: a paid tenant
// gets the console, a Free (Trial) manager gets the locked upgrade explainer
// (not the console, not a redirect), and an environment with dispatch switched
// off bounces to the dashboard. Hiding the nav item alone would leave
// /dispatch reachable by typing it, so the guard is what actually closes the
// hole. These tests pin that, because a guard that silently stops guarding
// looks exactly like a guard that works.

const account: MeResponse = {
  accountKey: 1,
  accountId: "6f1c1e5e-0000-4000-8000-000000000001",
  email: "manager@acme.test",
  name: "Manager",
  tenantKey: 1,
  tenantHandle: "acme",
  tenantType: "Mini",
  isOperator: false,
  isManager: true,
  isLearner: false,
  dispatchEnabled: true,
};

function renderAt(user: MeResponse) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Seed the cache so the guard resolves without a /me round trip; useAuth
  // reads this key.
  qc.setQueryData(["auth", "me"], user);

  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/dispatch"]}>
        <Routes>
          <Route
            path="/dispatch"
            element={
              <RequireDispatch>
                <div>Dispatch console</div>
              </RequireDispatch>
            }
          />
          <Route path="/dashboard" element={<div>Dashboard body</div>} />
          <Route path="/login" element={<div>Login body</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("RequireDispatch", () => {
  it("renders the console where the environment enables dispatch", async () => {
    renderAt({ ...account, dispatchEnabled: true });
    expect(await screen.findByText("Dispatch console")).toBeInTheDocument();
  });

  it("redirects to the dashboard where the environment disables dispatch", async () => {
    renderAt({ ...account, dispatchEnabled: false });
    expect(await screen.findByText("Dashboard body")).toBeInTheDocument();
    expect(screen.queryByText("Dispatch console")).not.toBeInTheDocument();
  });

  it("still blocks an operator, who can bake a dead launch URL just as easily", async () => {
    renderAt({ ...account, isOperator: true, dispatchEnabled: false });
    expect(await screen.findByText("Dashboard body")).toBeInTheDocument();
    expect(screen.queryByText("Dispatch console")).not.toBeInTheDocument();
  });

  it("shows the locked upgrade explainer to a gated Free manager, not the console", async () => {
    renderAt({ ...account, tenantType: "Trial", dispatchEnabled: false, dispatchGated: true });
    expect(await screen.findByText("Upgrade to unlock dispatch")).toBeInTheDocument();
    expect(screen.queryByText("Dispatch console")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard body")).not.toBeInTheDocument();
  });
});
