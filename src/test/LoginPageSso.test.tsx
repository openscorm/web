import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LoginPage } from "@/routes/LoginPage";

// Home realm discovery on the sign-in page.
//
// The behaviour worth pinning is what happens when discovery says nothing, or
// fails: the page has to look exactly like it did before this feature existed.
// A federated organization is the interesting case, but a broken lookup that
// blocked the password box would be the expensive one.

const assign = vi.fn();
let fetchMock: ReturnType<typeof vi.fn>;
let discoverCalls: string[];

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// signInPath null means "not federated"; a string is the path to start SAML.
// "error" makes the lookup fail, which must be indistinguishable from null on
// the page.
function mountPage(discovery: string | null | "error") {
  discoverCalls = [];

  fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes("/api/auth/saml/discover")) {
      discoverCalls.push(url);
      if (discovery === "error") {
        return Promise.resolve(
          new Response(JSON.stringify({ title: "boom" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return Promise.resolve(json({ signInPath: discovery }));
    }

    return Promise.resolve(json({}));
  });

  vi.stubGlobal("fetch", fetchMock);

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/login"]}>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  assign.mockReset();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { ...window.location, assign },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ssoButton = () => screen.queryByRole("button", { name: /continue with single sign-on/i });

describe("sign-in page single sign-on discovery", () => {
  it("offers nothing until an address has been entered", () => {
    mountPage("/api/auth/saml/contoso/login");

    expect(ssoButton()).toBeNull();
    expect(discoverCalls).toHaveLength(0);
  });

  it("offers single sign-on for a federated address", async () => {
    const user = userEvent.setup();
    mountPage("/api/auth/saml/contoso/login");

    await user.type(screen.getByLabelText("Email"), "zara@contoso.test");
    await user.tab();

    await waitFor(() => expect(ssoButton()).not.toBeNull());
    expect(discoverCalls).toHaveLength(1);
    expect(discoverCalls[0]).toContain("email=zara%40contoso.test");
  });

  // The regression this file did not have. The first implementation asked on
  // blur, which a test never notices because typing is always followed by
  // leaving the field, while a password manager fills the form without focus
  // ever entering it. A returning person at a federated organization saw no
  // button at all.
  it("offers single sign-on without the field ever losing focus", async () => {
    const user = userEvent.setup();
    mountPage("/api/auth/saml/contoso/login");

    await user.type(screen.getByLabelText("Email"), "zara@contoso.test");
    // No tab, no click elsewhere: focus stays in the email box.

    await waitFor(() => expect(ssoButton()).not.toBeNull());
  });

  // The autofill case one step earlier: the value is in the element before the
  // form registers it, so react-hook-form starts out holding an empty string
  // and watching it would never fire. The mount-time read of the element is
  // what covers that, and this is the only thing that exercises it.
  it("offers single sign-on for an address a password manager already filled in", async () => {
    const realGetElementById = document.getElementById.bind(document);
    const spy = vi
      .spyOn(document, "getElementById")
      .mockImplementation((id: string) =>
        id === "email"
          ? ({ value: "zara@contoso.test" } as unknown as HTMLElement)
          : realGetElementById(id),
      );

    mountPage("/api/auth/saml/contoso/login");

    await waitFor(() => expect(ssoButton()).not.toBeNull());
    expect(discoverCalls[0]).toContain("email=zara%40contoso.test");

    spy.mockRestore();
  });

  it("starts the flow with a full navigation, not a router push", async () => {
    const user = userEvent.setup();
    mountPage("/api/auth/saml/contoso/login");

    await user.type(screen.getByLabelText("Email"), "zara@contoso.test");
    await user.tab();
    await waitFor(() => expect(ssoButton()).not.toBeNull());

    await user.click(ssoButton()!);

    // A router push would stay inside the SPA and never reach the endpoint
    // that redirects to the identity provider.
    expect(assign).toHaveBeenCalledWith("/api/auth/saml/contoso/login");
  });

  it("offers nothing for an address that is not federated", async () => {
    const user = userEvent.setup();
    mountPage(null);

    await user.type(screen.getByLabelText("Email"), "someone@gmail.test");
    await user.tab();

    await waitFor(() => expect(discoverCalls).toHaveLength(1));
    expect(ssoButton()).toBeNull();
  });

  // The one that matters most. A failed lookup must not put an error in front
  // of somebody who was about to type a password.
  it("stays quiet when the lookup fails", async () => {
    const user = userEvent.setup();
    mountPage("error");

    await user.type(screen.getByLabelText("Email"), "zara@contoso.test");
    await user.tab();

    await waitFor(() => expect(discoverCalls).toHaveLength(1));

    expect(ssoButton()).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  // SSO is additive in v1, so the password path stays reachable even for a
  // federated organization.
  it("keeps the password form when single sign-on is offered", async () => {
    const user = userEvent.setup();
    mountPage("/api/auth/saml/contoso/login");

    await user.type(screen.getByLabelText("Email"), "zara@contoso.test");
    await user.tab();
    await waitFor(() => expect(ssoButton()).not.toBeNull());

    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it("withdraws the offer when the address changes", async () => {
    const user = userEvent.setup();
    mountPage("/api/auth/saml/contoso/login");

    const email = screen.getByLabelText("Email");
    await user.type(email, "zara@contoso.test");
    await user.tab();
    await waitFor(() => expect(ssoButton()).not.toBeNull());

    // The answer belongs to the domain that was asked about, so editing the
    // address has to retract it rather than leave a button pointing at
    // somebody else's identity provider.
    await user.click(email);
    await user.type(email, "x");

    await waitFor(() => expect(ssoButton()).toBeNull());
  });

  it("does not ask about an address that cannot be federated", async () => {
    const user = userEvent.setup();
    mountPage("/api/auth/saml/contoso/login");

    await user.type(screen.getByLabelText("Email"), "zara@contoso");
    await user.tab();

    // No dotted domain, so the answer could only be null. Asking anyway spends
    // a request per abandoned attempt.
    expect(discoverCalls).toHaveLength(0);
    expect(ssoButton()).toBeNull();
  });
});
