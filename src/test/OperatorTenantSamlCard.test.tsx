import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { OperatorTenantSamlCard } from "@/components/OperatorTenantSamlCard";
import type { OperatorTenantSaml } from "@/lib/types";

// Single sign-on shipped live and configurable only by an ops script on
// the server, so this card is the whole point of the record: an operator can
// see whether a tenant has a provider, save one, claim the domains discovery
// resolves, and switch it on separately from saving it.
//
// The separation is the part worth pinning. Saving must never enable, because
// getting a certificate and two URLs into place is a two-party exercise and it
// wants a state where the configuration is stored and testable before a single
// learner is redirected.

const UNCONFIGURED: OperatorTenantSaml = {
  configured: false,
  isEnabled: false,
  idpEntityId: null,
  idpSignInUrl: null,
  idpSignOutUrl: null,
  nameIdFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
  emailAttribute: null,
  firstNameAttribute: null,
  lastNameAttribute: null,
  jitProvision: true,
  hasCertificate: false,
  hasNextCertificate: false,
  updatedAt: null,
  domains: [],
};

const SAVED_BUT_OFF: OperatorTenantSaml = {
  ...UNCONFIGURED,
  configured: true,
  isEnabled: false,
  idpEntityId: "https://sts.windows.net/contoso/",
  idpSignInUrl: "https://login.microsoftonline.test/contoso/saml2",
  hasCertificate: true,
  updatedAt: "2026-09-12T18:00:00Z",
  domains: ["contoso.com"],
};

let payload: OperatorTenantSaml = UNCONFIGURED;
let calls: { url: string; method: string }[] = [];

beforeEach(() => {
  payload = UNCONFIGURED;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? "GET" });
      if ((init?.method ?? "GET") === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return Promise.resolve(new Response(null, { status: 204 }));
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
      <OperatorTenantSamlCard tenantKey="7" />
    </QueryClientProvider>,
  );
}

describe("operator single sign-on card", () => {
  it("says a tenant with no provider signs in with a password", async () => {
    renderCard();

    expect(await screen.findByText("Not configured")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add provider" })).toBeInTheDocument();
    expect(screen.getByText("No domains claimed")).toBeInTheDocument();

    // Nothing to switch on before a provider exists.
    expect(screen.queryByRole("button", { name: "Switch on" })).not.toBeInTheDocument();
  });

  it("separates a saved provider from a live one", async () => {
    payload = SAVED_BUT_OFF;
    renderCard();

    expect(await screen.findByText("Saved, off")).toBeInTheDocument();
    expect(screen.getByText("https://sts.windows.net/contoso/")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch on" })).toBeInTheDocument();
    expect(screen.getByText("contoso.com")).toBeInTheDocument();
  });

  it("will not offer to switch on a provider with no certificate stored", async () => {
    payload = { ...SAVED_BUT_OFF, hasCertificate: false };
    renderCard();

    expect(await screen.findByRole("button", { name: "Switch on" })).toBeDisabled();
  });

  it("claims a domain against the tenant's own endpoint", async () => {
    payload = SAVED_BUT_OFF;
    renderCard();
    await screen.findByText("Saved, off");

    await userEvent.type(screen.getByLabelText("Add a domain"), "fabrikam.com");
    await userEvent.click(screen.getByRole("button", { name: "Claim domain" }));

    const claim = calls.find((c) => c.method === "POST");
    expect(claim?.url).toContain("/api/operator/tenants/7/saml/domains");
  });

  it("releases a domain by query value, never as a path segment", async () => {
    payload = SAVED_BUT_OFF;
    renderCard();
    await screen.findByText("Saved, off");

    await userEvent.click(screen.getByRole("button", { name: "Release" }));

    // A trailing ".com" in the last route segment reads as a file extension,
    // which is why this one is a query value.
    const release = calls.find((c) => c.method === "DELETE");
    expect(release?.url).toContain("/api/operator/tenants/7/saml/domains?emailDomain=contoso.com");
  });
});
