import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LoginPage } from "@/routes/LoginPage";
import { RequireManager } from "@/components/RequireManager";
import type { MeResponse } from "@/lib/types";

// Regression cover for the swallowed first Sign in click. A visit to a guarded
// route while signed out caches null under ["auth","me"], and null counts as
// data, so isLoading reads false on the next mount. Before the fix, the
// post-login invalidate used the default refetchType "active", which skips a
// query with no observers -- and nothing on the login page observes it. The
// guard on the landing route therefore read the stale null and redirected
// straight back to the login page, which looked like the button doing nothing.

const manager: MeResponse = {
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

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    // The real login response leaves tenantHandle and tenantType empty --
    // GetAccountByLogin does not join to security.tenant. Only the /me
    // refetch carries them, which is the second reason to wait for it.
    if (url.endsWith("/api/auth/login")) {
      return Promise.resolve(json({ ...manager, tenantHandle: "", tenantType: "" }));
    }
    if (url.endsWith("/api/auth/me")) return Promise.resolve(json(manager));
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderApp(cached?: MeResponse | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (cached !== undefined) qc.setQueryData(["auth", "me"], cached);

  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <RequireManager>
                <div>Dashboard body</div>
              </RequireManager>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return qc;
}

async function signIn() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), manager.email);
  await user.type(screen.getByLabelText("Password"), "correct-horse");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("LoginPage first-click sign in", () => {
  it("reaches the dashboard on the first click when a signed-out null is cached", async () => {
    renderApp(null);
    await signIn();

    expect(await screen.findByText("Dashboard body")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("reaches the dashboard on the first click with an empty cache", async () => {
    renderApp();
    await signIn();

    expect(await screen.findByText("Dashboard body")).toBeInTheDocument();
  });

  it("refetches /me before navigating so tenant fields are populated", async () => {
    const qc = renderApp(null);
    await signIn();
    await screen.findByText("Dashboard body");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/me"),
      expect.anything(),
    );
    expect(qc.getQueryData<MeResponse>(["auth", "me"])?.tenantHandle).toBe("acme");
  });
});

describe("RequireManager stale null", () => {
  it("holds instead of redirecting while a cached null is being refetched", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["auth", "me"], null);
    // Reproduce the state the guard actually mounts into: an invalidate with
    // no observer to serve marks the entry stale without refetching it. A
    // freshly set null is NOT stale under staleTime Infinity, nothing would
    // refetch, and redirecting on it is the correct call.
    await qc.invalidateQueries({ queryKey: ["auth", "me"], refetchType: "none" });

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route path="/login" element={<div>Login body</div>} />
            <Route
              path="/dashboard"
              element={
                <RequireManager>
                  <div>Dashboard body</div>
                </RequireManager>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Redirecting is one-way: if the guard bounces on the stale null, the
    // dashboard never renders no matter what /me later returns.
    expect(await screen.findByText("Dashboard body")).toBeInTheDocument();
    expect(screen.queryByText("Login body")).not.toBeInTheDocument();
  });
});

describe("LoginPage MFA challenge", () => {
  it("asks for a code when the account has MFA, then reaches the dashboard", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        // Password verified, but the account has a second factor: no session,
        // a challenge instead.
        if (url.endsWith("/api/auth/login")) {
          return Promise.resolve(json({ mfaRequired: true, mfaToken: "challenge-token" }));
        }
        if (url.endsWith("/api/auth/mfa/verify")) {
          return Promise.resolve(json({ ...manager, tenantHandle: "", tenantType: "" }));
        }
        if (url.endsWith("/api/auth/me")) return Promise.resolve(json(manager));
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );

    renderApp(null);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), manager.email);
    await user.type(screen.getByLabelText("Password"), "correct-horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    // The session is not issued yet; the page asks for the second factor.
    expect(await screen.findByRole("heading", { name: "Enter your code" })).toBeInTheDocument();
    expect(screen.queryByText("Dashboard body")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByText("Dashboard body")).toBeInTheDocument();
  });
});

describe("LoginPage mandated enrollment", () => {
  it("runs two-factor setup before any session when the tenant requires it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        // Password verified, but the tenant mandates MFA and this account has
        // none: no session, an enrollment token instead.
        if (url.endsWith("/api/auth/login")) {
          return Promise.resolve(json({ mfaEnrollmentRequired: true, mfaToken: "enroll-token" }));
        }
        if (url.endsWith("/api/auth/mfa/enroll/setup")) {
          return Promise.resolve(
            json({
              otpauthUri: "otpauth://totp/OpenSCORM:manager@acme.test?secret=ABCDEF",
              secret: "ABCDEF",
              recoveryCodes: ["1111-2222", "3333-4444"],
            }),
          );
        }
        if (url.endsWith("/api/auth/mfa/enroll/enable")) {
          return Promise.resolve(json({ ...manager, tenantHandle: "", tenantType: "" }));
        }
        if (url.endsWith("/api/auth/me")) return Promise.resolve(json(manager));
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );

    renderApp(null);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), manager.email);
    await user.type(screen.getByLabelText("Password"), "correct-horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    // Held at the door: the provisioning screen shows and nothing behind it does.
    expect(
      await screen.findByRole("heading", { name: "Set up two-factor authentication" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("1111-2222")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard body")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Code"), "123456");
    await user.click(screen.getByRole("button", { name: "Turn on two-factor and sign in" }));

    expect(await screen.findByText("Dashboard body")).toBeInTheDocument();
  });
});

describe("LoginPage trusted device", () => {
  it("offers the tenant window at the challenge and sends the choice with the code", async () => {
    let verifyBody: Record<string, unknown> | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/auth/login")) {
          return Promise.resolve(
            json({ mfaRequired: true, mfaToken: "challenge-token", mfaTrustDays: 14 }),
          );
        }
        if (url.endsWith("/api/auth/mfa/verify")) {
          verifyBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return Promise.resolve(json({ ...manager, tenantHandle: "", tenantType: "" }));
        }
        if (url.endsWith("/api/auth/me")) return Promise.resolve(json(manager));
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );

    renderApp(null);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), manager.email);
    await user.type(screen.getByLabelText("Password"), "correct-horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await user.click(await screen.findByLabelText("Trust this device for 14 days"));
    await user.type(screen.getByLabelText("Code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByText("Dashboard body")).toBeInTheDocument();
    expect(verifyBody).toEqual({ mfaToken: "challenge-token", code: "123456", trustDevice: true });
  });

  it("hides the option when the tenant asks for a code every sign-in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/auth/login")) {
          return Promise.resolve(
            json({ mfaRequired: true, mfaToken: "challenge-token", mfaTrustDays: 0 }),
          );
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );

    renderApp(null);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), manager.email);
    await user.type(screen.getByLabelText("Password"), "correct-horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Enter your code" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Trust this device/)).not.toBeInTheDocument();
  });
});

describe("LoginPage title", () => {
  it("names the page for a crawler that cannot run the app", () => {
    renderApp(null);

    expect(document.title).toBe("Sign in | OpenSCORM");
  });
});
