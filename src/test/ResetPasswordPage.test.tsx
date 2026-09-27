import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ResetPasswordPage } from "@/routes/ResetPasswordPage";

// The reset link carries one opaque token and nothing else, so the page sends
// only the token and the new password. A link sent before that change still
// carries the login and email beside a bare secret, and is sent through as it
// was until it expires.

let bodies: unknown[];

beforeEach(() => {
  bodies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/auth/password-reset/complete")) {
        bodies.push(JSON.parse(String(init?.body)));
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(new Response("null", { status: 200 }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/reset" element={<ResetPasswordPage />} />
          <Route path="/welcome" element={<ResetPasswordPage variant="welcome" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function submit(password = "a-new-password-1") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("New password"), password);
  await user.type(screen.getByLabelText("Confirm password"), password);
  await user.click(screen.getByRole("button", { name: "Change password" }));
}

describe("ResetPasswordPage", () => {
  it("sends only the token and the new password for a token-only link", async () => {
    renderAt("/reset?token=0123456789abcdef0123456789abcdef.s3cret");

    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    await submit();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      token: "0123456789abcdef0123456789abcdef.s3cret",
      password: "a-new-password-1",
    });
  });

  it("still sends the login and email for a link sent before the change", async () => {
    renderAt("/reset?username=acme%2Fada%40acme.test&email=ada%40acme.test&token=s3cret");

    expect(screen.getByLabelText("Email")).toHaveValue("ada@acme.test");
    await submit();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      email: "ada@acme.test",
      login: "acme/ada@acme.test",
      token: "s3cret",
      password: "a-new-password-1",
    });
  });

  it("calls a link with no token invalid", () => {
    renderAt("/reset");

    expect(screen.getByText("Invalid reset link")).toBeInTheDocument();
  });

  // A learner a manager added has never had a password, so the invitation
  // link asks them to set one, through the same token and endpoint.
  it("welcomes an invited learner and sends the same token-only body", async () => {
    renderAt("/welcome?token=0123456789abcdef0123456789abcdef.s3cret");

    expect(screen.getByRole("heading", { name: "Set up your account" })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Choose a password"), "a-new-password-1");
    await user.type(screen.getByLabelText("Confirm password"), "a-new-password-1");
    await user.click(screen.getByRole("button", { name: "Set password" }));

    expect(await screen.findByText(/Your password is set\./)).toBeInTheDocument();
    expect(bodies).toEqual([
      { token: "0123456789abcdef0123456789abcdef.s3cret", password: "a-new-password-1" },
    ]);
  });
});
