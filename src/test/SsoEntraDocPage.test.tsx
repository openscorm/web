import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { SSO_URLS, SsoEntraDocPage } from "@/routes/SsoEntraDocPage";

// The SSO help page tells a customer's IT department what to type into Entra.
//
// The values it publishes have to be the ones the API composes, or every
// customer who follows the page builds an application that refuses their
// sign-ins. SamlServiceProviderIdentity composes "{EntityIdBase}/auth/saml/{handle}"
// with EntityIdBase set to https://app.openscorm.com/api in production, and
// SamlController serves /metadata, /login and /acs under it. If either side
// moves, this is the test that should fail first.

describe("SsoEntraDocPage", () => {
  it("publishes the URLs the API composes", () => {
    expect(SSO_URLS).toEqual({
      metadata: "https://app.openscorm.com/api/auth/saml/<handle>/metadata",
      identifier: "https://app.openscorm.com/api/auth/saml/<handle>",
      replyUrl: "https://app.openscorm.com/api/auth/saml/<handle>/acs",
      signOnUrl: "https://app.openscorm.com/api/auth/saml/<handle>/login",
    });
  });

  it("renders every URL a reader has to copy", () => {
    render(<SsoEntraDocPage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Set up single sign-on with Microsoft Entra ID",
      }),
    ).toBeInTheDocument();

    for (const url of Object.values(SSO_URLS)) {
      expect(screen.getAllByText(url).length).toBeGreaterThan(0);
    }
  });

  it("sets the page title", () => {
    render(<SsoEntraDocPage />);
    expect(document.title).toBe("Set up single sign-on with Microsoft Entra ID | OpenSCORM");
  });
});
