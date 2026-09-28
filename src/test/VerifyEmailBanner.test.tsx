import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";

import { VerifyEmailBanner } from "@/components/VerifyEmailBanner";
import { VerifyEmailPage } from "@/routes/VerifyEmailPage";
import type { MeResponse } from "@/lib/types";
import type { ReactNode } from "react";

// The verify banner reads the cached /api/auth/me answer, which useAuth keeps
// forever. Verifying the address must clear the banner without a reload: at
// once in the tab that verified, and on focus in any tab left behind.

const me = (emailVerified: boolean) =>
  ({
    accountKey: 1,
    accountId: "a",
    email: "ada@acme.test",
    name: "Ada",
    tenantKey: 1,
    tenantHandle: "acme",
    tenantType: "Mini",
    isOperator: false,
    isManager: false,
    isLearner: true,
    emailVerified,
  }) as MeResponse;

let meCalls: number;
let serverVerified: boolean;

beforeEach(() => {
  meCalls = 0;
  serverVerified = true;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/email/verify")) {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url.endsWith("/api/auth/me")) {
        meCalls++;
        return Promise.resolve(Response.json(me(serverVerified)));
      }
      return Promise.resolve(new Response("null", { status: 200 }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  focusManager.setFocused(undefined);
});

function renderWithCachedMe(verified: boolean, page?: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["auth", "me"], me(verified));
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/verify-email?token=t0k3n"]}>
        <VerifyEmailBanner />
        {page}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const banner = () => screen.queryByText(/Verify your email to keep receiving account notices/);

describe("VerifyEmailBanner", () => {
  it("clears in the tab that verified, without a reload", async () => {
    renderWithCachedMe(false, <VerifyEmailPage />);
    expect(banner()).toBeInTheDocument();

    await screen.findByText("Your email is verified. Thank you.");
    await waitFor(() => expect(banner()).not.toBeInTheDocument());
  });

  it("clears in a tab left behind once it regains focus", async () => {
    renderWithCachedMe(false);
    expect(banner()).toBeInTheDocument();

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() => expect(banner()).not.toBeInTheDocument());
    expect(meCalls).toBe(1);
  });

  it("does not ask again on focus once the account is verified", async () => {
    renderWithCachedMe(true);

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(meCalls).toBe(0);
    expect(banner()).not.toBeInTheDocument();
  });
});
