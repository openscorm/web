import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LinkVerificationCard } from "@/components/LinkVerificationCard";
import type { MeResponse, TenantSecurityPolicy } from "@/lib/types";

// The switch saves as part of the whole security policy, so turning it on must
// carry the two-factor fields through unchanged, and the card has to say when
// two-factor for all users has switched the links off altogether.

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
  stored = {
    mfaRequired: true,
    mfaScope: "managers",
    mfaTrustDays: 14,
    linkRequiresVerifiedEmail: false,
    invitationLinkDays: 0,
  };
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
      <LinkVerificationCard user={manager} />
    </QueryClientProvider>,
  );
}

describe("LinkVerificationCard", () => {
  it("turns the switch on and keeps the two-factor settings as they were", async () => {
    renderCard();

    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Require a confirmed email" }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      mfaRequired: true,
      mfaScope: "managers",
      mfaTrustDays: 14,
      linkRequiresVerifiedEmail: true,
      invitationLinkDays: 0,
    });
    expect(
      await screen.findByText("Learners confirm their email before a link signs them in"),
    ).toBeInTheDocument();
  });

  it("says the links are off while two-factor is required for all users", async () => {
    stored = { ...stored, mfaScope: "all" };
    renderCard();

    expect(
      await screen.findByText(
        "Invitation links are off while two-factor is required for all users",
      ),
    ).toBeInTheDocument();
  });
});
