import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TenantSecurityCard } from "@/components/TenantSecurityCard";
import type { MeResponse, TenantSecurityPolicy } from "@/lib/types";

// The card reads the tenant's mandate and window, saves
// every change on the spot as the whole policy, and only shows the scope once
// the mandate is on. The all-users warning about public invitation links is
// the one line of copy that must not go missing, because it is the
// amendment's stated consequence of that scope.

const manager: MeResponse = {
  accountKey: 1,
  accountId: "6f1c1e5e-0000-4000-8000-000000000001",
  email: "manager@acme.test",
  name: "Manager",
  tenantKey: 7,
  tenantHandle: "acme",
  tenantType: "Mini",
  isOperator: false,
  isManager: true,
  isLearner: false,
  dispatchEnabled: true,
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

let stored: TenantSecurityPolicy;
let puts: TenantSecurityPolicy[];

beforeEach(() => {
  stored = { mfaRequired: false, mfaScope: "all", mfaTrustDays: 30 };
  puts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.endsWith("/api/tenants/7/security")) {
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }
      if (init?.method === "PUT") {
        stored = JSON.parse(String(init.body)) as TenantSecurityPolicy;
        puts.push(stored);
      }
      return Promise.resolve(json(stored));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TenantSecurityCard user={manager} />
    </QueryClientProvider>,
  );
}

describe("TenantSecurityCard", () => {
  it("shows the mandate as optional and hides the scope until it is required", async () => {
    renderCard();

    expect(
      await screen.findByText("Optional. Anyone can turn it on for their own account."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("All users")).not.toBeInTheDocument();
  });

  it("saves the mandate on the spot and then offers the scope with the link warning", async () => {
    renderCard();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Require two-factor" }));

    expect(
      await screen.findByText("Required for all users. Public invitation links are off."),
    ).toBeInTheDocument();
    expect(puts).toEqual([{ mfaRequired: true, mfaScope: "all", mfaTrustDays: 30 }]);
    expect(screen.getByLabelText("All users")).toBeChecked();
    expect(screen.getByText(/turns off this organization/)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Managers and operators only"));

    expect(await screen.findByText("Required for managers and operators.")).toBeInTheDocument();
    expect(puts[1]).toEqual({ mfaRequired: true, mfaScope: "managers", mfaTrustDays: 30 });
  });

  // The window is offered whether or not the mandate is on, and a change
  // carries the rest of the policy unchanged.
  it("saves the trusted-device window without touching the mandate", async () => {
    renderCard();
    const user = userEvent.setup();

    // The select is disabled until the policy loads, and the fallback also
    // reads 30, so wait for a line that only the loaded policy renders.
    await screen.findByText("Optional. Anyone can turn it on for their own account.");
    const select = screen.getByLabelText("Trusted devices");
    expect(select).toHaveValue("30");

    await user.selectOptions(select, "0");

    await waitFor(() =>
      expect(puts).toEqual([{ mfaRequired: false, mfaScope: "all", mfaTrustDays: 0 }]),
    );
    await waitFor(() => expect(screen.getByLabelText("Trusted devices")).toHaveValue("0"));
  });
});
