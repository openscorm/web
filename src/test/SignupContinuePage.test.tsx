import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SignupContinuePage } from "@/routes/SignupContinuePage";

// The page the sign-up email's "Create my organization" link opens. It reads
// the held sign-up and creates nothing until the click, because mail scanners
// open every link in a message.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderPage(token = "abc") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/signup/continue?token=${token}`]}>
        <Routes>
          <Route path="/signup/continue" element={<SignupContinuePage />} />
          <Route path="/dashboard" element={<p>Dashboard</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function stub(pending: unknown) {
  // The second parameter is unused here; it is in the signature so the
  // recorded calls are typed to carry the request body.
  const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/auth/register/pending")) return Promise.resolve(json(pending));
    if (url.endsWith("/api/auth/register/complete"))
      return Promise.resolve(json({ accountKey: 1 }));
    if (url.endsWith("/api/auth/me")) return Promise.resolve(json({ accountKey: 1 }));
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function completeBody(fetchMock: ReturnType<typeof stub>) {
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/register/complete"));
  return JSON.parse(String((call?.[1] as RequestInit).body)) as {
    token: string;
    tenantHandle?: string;
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SignupContinuePage", () => {
  it("says an expired or used link is invalid and offers sign-up again", async () => {
    stub({ state: "invalid", handleTaken: false });
    renderPage();

    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign up again" })).toHaveAttribute(
      "href",
      "/register",
    );
  });

  it("names the organization and creates it only on the click", async () => {
    const fetchMock = stub({
      state: "valid",
      tenantName: "Acme Training",
      tenantHandle: "acme",
      handleTaken: false,
    });
    renderPage();

    expect(await screen.findByText("Acme Training")).toBeInTheDocument();
    expect(screen.getByText("acme")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/register/complete"))).toBe(
      false,
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Create my organization" }));

    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(completeBody(fetchMock)).toEqual({ token: "abc" });
  });

  it("asks for another portal name when the first was taken, and sends it", async () => {
    const fetchMock = stub({
      state: "valid",
      tenantName: "Acme Training",
      tenantHandle: "acme",
      handleTaken: true,
    });
    renderPage();
    const user = userEvent.setup();

    const field = await screen.findByLabelText("Portal name");
    const create = screen.getByRole("button", { name: "Create my organization" });
    expect(create).toBeDisabled();

    await user.type(field, "acme-training");
    await user.click(create);

    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(completeBody(fetchMock)).toEqual({ token: "abc", tenantHandle: "acme-training" });
  });
});
