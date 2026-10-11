import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LoginPage } from "@/routes/LoginPage";
import { RequireManager } from "@/components/RequireManager";
import { loginPathFor, safeReturnPath } from "@/lib/returnPath";
import type { MeResponse } from "@/lib/types";

// Every link in an account email opens a page that needs a session. Signed
// out, the guard sends the visit to /login with the page it wanted, and
// signing in goes on to that page instead of the home page.

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let signedIn = false;

beforeEach(() => {
  signedIn = false;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/login")) {
        signedIn = true;
        return Promise.resolve(json(manager));
      }
      if (url.endsWith("/api/auth/me")) {
        return Promise.resolve(signedIn ? json(manager) : json({ title: "Unauthenticated" }, 401));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname + location.search}</div>;
}

function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/login"
            element={
              <>
                <LoginPage />
                <Where />
              </>
            }
          />
          {["/dashboard", "/reports"].map((path) => (
            <Route
              key={path}
              path={path}
              element={
                <RequireManager>
                  <div>{path} body</div>
                </RequireManager>
              }
            />
          ))}
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function signIn() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), manager.email);
  await user.type(screen.getByLabelText("Password"), "correct-horse");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("sign-in return path", () => {
  it("sends a signed-out visit to /login with the page it wanted", async () => {
    renderAt("/reports?course=7");
    expect(await screen.findByTestId("where")).toHaveTextContent(
      "/login?next=%2Freports%3Fcourse%3D7",
    );
  });

  it("lands on that page after signing in", async () => {
    renderAt("/reports");
    await screen.findByTestId("where");
    await signIn();
    expect(await screen.findByText("/reports body")).toBeInTheDocument();
  });

  it("ignores a next that would leave the site and lands on the home page", async () => {
    renderAt("/login?next=%2F%2Fevil.example%2Fsteal");
    await signIn();
    expect(await screen.findByText("/dashboard body")).toBeInTheDocument();
  });
});

describe("safeReturnPath", () => {
  it.each(["/reports", "/reports?course=7", "/courses/12#top", "/billing"])("keeps %s", (path) => {
    expect(safeReturnPath(path)).toBe(path);
  });

  it.each([
    null,
    "",
    "reports",
    "//evil.example",
    "/\\evil.example",
    "https://evil.example/",
    "/login",
    "/login?next=%2Freports",
    "/",
    "/reports\nSet-Cookie: x",
  ])("refuses %j", (path) => {
    expect(safeReturnPath(path)).toBeNull();
  });

  it("does not carry a page it would refuse", () => {
    expect(loginPathFor({ pathname: "/", search: "" })).toBe("/login");
    expect(loginPathFor({ pathname: "/reports", search: "" })).toBe("/login?next=%2Freports");
  });
});
