import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { OperatorAccountDetailPage } from "@/routes/OperatorAccountDetailPage";
import type { MeResponse } from "@/lib/types";

// A manager whose confirmation email never arrives cannot pay. Support has to
// be able to confirm the address from the console in under a minute, and the
// page has to show whether it is confirmed before anyone asks.

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

const account = {
  tenantHandle: "acme",
  tenantName: "Acme",
  tenantKey: 42,
  accountKey: 77,
  accountId: "6f1c1e5e-0000-4000-8000-00000000004d",
  email: "pat@acme.test",
  login: "acme/pat@acme.test",
  title: null,
  nameFirst: "Pat",
  nameLast: "Manager",
  name: "Pat Manager",
  isActive: true,
  isOperator: false,
  isManager: true,
  isLearner: false,
  totpEnabled: false,
  failedLoginCount: 0,
  lockedUntil: null,
  createdAt: "2026-11-01T10:00:00+00:00",
  invitedAt: null,
  acceptedAt: null,
  authenticatedAt: null,
  passwordResetAt: null,
  passwordExpiresAt: "2027-02-01T10:00:00+00:00",
  emailVerifiedAt: null as string | null,
  enrollments: [],
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

let confirmed: boolean;
let confirmPosts: number;

beforeEach(() => {
  confirmed = false;
  confirmPosts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST" && url.endsWith("/api/operator/accounts/77/confirm-email")) {
        confirmPosts++;
        confirmed = true;
        return Promise.resolve(json({ confirmed: true, changed: true }));
      }
      if (url.endsWith("/api/operator/accounts/77")) {
        return Promise.resolve(
          json({ ...account, emailVerifiedAt: confirmed ? "2026-11-05T15:00:00+00:00" : null }),
        );
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
  qc.setQueryData(["auth", "me"], operator);
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operator/accounts/77"]}>
        <Routes>
          <Route path="/operator/accounts/:accountKey" element={<OperatorAccountDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OperatorAccountDetailPage confirm email", () => {
  it("shows an unconfirmed address and confirms it in one click", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Not confirmed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm email" }));

    expect(await screen.findByText(/^2026-11-05/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm email" })).not.toBeInTheDocument();
    expect(confirmPosts).toBe(1);
  });
});
