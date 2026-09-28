import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { InvitationLinksSection } from "@/components/InvitationLinksSection";
import type { InvitationLink } from "@/lib/types";

// A new link's URL exists only in the reply that creates it, so the section
// has to show it then and say it will not come back. Revoking goes through a
// confirmation, because a revoked link cannot be turned back on.

const PATH = "/api/tenants/7/courses/573/invitation-links";
const NEW_URL = "https://app.openscorm.com/lobby/enroll/acme/h2s?token=AbCdEfGhIjKlMnOpQrStUv";

function link(over: Partial<InvitationLink>): InvitationLink {
  return {
    linkKey: 1,
    isOriginal: true,
    url: "https://app.openscorm.com/lobby/enroll/acme/h2s?token=TocCohWvcOeq",
    tokenPrefix: null,
    createdAt: "2026-01-02T03:04:05Z",
    createdByEmail: null,
    expiresAt: null,
    revokedAt: null,
    status: "active",
    ...over,
  };
}

let listed: InvitationLink[];
let calls: { method: string; url: string }[];

beforeEach(() => {
  listed = [link({})];
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, url });
      const respond = (status: number, body?: unknown) =>
        Promise.resolve(
          body === undefined
            ? new Response(null, { status })
            : new Response(JSON.stringify(body), {
                status,
                headers: { "content-type": "application/json" },
              }),
        );
      if (url.endsWith(PATH) && method === "GET") return respond(200, listed);
      if (url.endsWith(PATH) && method === "POST") {
        const created = link({
          linkKey: 2,
          isOriginal: false,
          url: NEW_URL,
          tokenPrefix: "AbCdEf",
          createdByEmail: "m@acme.test",
        });
        listed = [{ ...created, url: null }, ...listed];
        return respond(201, created);
      }
      if (url.endsWith(`${PATH}/1`) && method === "DELETE") {
        listed = [link({ status: "revoked", revokedAt: "2026-09-28T12:00:00Z", url: null })];
        return respond(204);
      }
      return Promise.reject(new Error(`unexpected fetch: ${method} ${url}`));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <InvitationLinksSection tenantKey={7} courseKey={573} blocked={false} />
    </QueryClientProvider>,
  );
}

describe("InvitationLinksSection", () => {
  it("shows a new link once and warns that it will not be shown again", async () => {
    renderSection();

    await userEvent.setup().click(await screen.findByRole("button", { name: "Create link" }));

    const notice = await screen.findByRole("status");
    expect(
      within(notice).getByText("Copy this link now. It will not be shown again."),
    ).toBeInTheDocument();
    expect(within(notice).getByText(NEW_URL)).toBeInTheDocument();
    // In the list the new link is named by its prefix only.
    expect(await screen.findByText("AbCdEf…")).toBeInTheDocument();
  });

  it("revokes a link only after the confirmation", async () => {
    renderSection();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Revoke" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);

    await user.click(await screen.findByRole("button", { name: "Revoke link" }));

    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    expect(await screen.findByText("Revoked")).toBeInTheDocument();
  });
});

describe("InvitationLinksSection revoke failure", () => {
  it("says so in the dialog when the revoke is refused", async () => {
    // A session that changed underneath the page answers 403; the dialog
    // must not just sit there looking as if the click missed.
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (method === "DELETE") {
          return Promise.resolve(
            new Response(JSON.stringify({ status: 403, title: "Forbidden" }), {
              status: 403,
              headers: { "content-type": "application/problem+json" },
            }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify([link({})]), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }),
    );
    renderSection();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Revoke" }));
    await user.click(await screen.findByRole("button", { name: "Revoke link" }));

    expect(await screen.findByText(/Could not revoke this link/)).toBeInTheDocument();
  });
});
