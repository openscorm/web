import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LoginPage } from "@/routes/LoginPage";

// An address in more than one organization used to open whichever one the
// password fitted first. Sign-in now answers with the list and no session,
// and the person picks: a password organization by name, an organization
// with no password of theirs by an emailed link.

const choice = {
  organizationChoice: {
    token: "orgs-token",
    organizations: [
      { name: "Acme Training", handle: "acme", access: "password" },
      { name: "Wildfire Service", handle: "bcws", access: "email" },
    ],
  },
};

const manager = { accountKey: 1, isManager: true, isOperator: false, email: "pat@x.test" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type LoginBody = { email: string; password: string };

// Sign-in answers with the chooser for the bare email, and with `byName` for
// a "handle/email" login, which is how the chooser signs in to a pick.
function stub(byName: (body: LoginBody) => Response) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/auth/login")) {
      const body = JSON.parse(String(init?.body)) as LoginBody;
      return Promise.resolve(body.email.includes("/") ? byName(body) : json(choice));
    }
    if (url.endsWith("/api/auth/login/email-link")) {
      return Promise.resolve(json({ sent: true }, 202));
    }
    if (url.endsWith("/api/auth/me")) return Promise.resolve(json(manager));
    if (url.includes("/api/auth/saml/discover")) return Promise.resolve(json({ signInPath: null }));
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function loginEmails(fetchMock: ReturnType<typeof stub>) {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).endsWith("/api/auth/login"))
    .map(([, init]) => (JSON.parse(String((init as RequestInit).body)) as LoginBody).email);
}

async function signIn() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<p>Dashboard</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/^email$/i), "pat@x.test");
  await user.type(screen.getByLabelText(/^password$/i), "typed-password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("heading", { name: "Choose an organization" });
  return user;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Organization chooser", () => {
  it("lists every organization and signs in to a password one by name", async () => {
    const fetchMock = stub(() => json(manager));

    const user = await signIn();
    expect(screen.getByText("Acme Training")).toBeInTheDocument();
    expect(screen.getByText("Wildfire Service")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(loginEmails(fetchMock)).toEqual(["pat@x.test", "acme/pat@x.test"]);
  });

  it("emails a link for an organization with no password of theirs", async () => {
    const fetchMock = stub(() => json(manager));

    const user = await signIn();
    await user.click(screen.getByRole("button", { name: "Email me a link" }));

    expect(
      await screen.findByText(/check your inbox for a link to wildfire service/i),
    ).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/email-link"));
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({
      token: "orgs-token",
      tenantHandle: "bcws",
    });
  });

  it("asks for that organization's own password when the typed one does not open it", async () => {
    stub((body) =>
      body.password === "acme-password"
        ? json(manager)
        : json({ title: "Invalid credentials" }, 401),
    );

    const user = await signIn();
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const field = await screen.findByLabelText("Password for Acme Training");
    await user.type(field, "acme-password");
    await user.click(screen.getAllByRole("button", { name: "Sign in" })[1]!);

    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
  });
});
