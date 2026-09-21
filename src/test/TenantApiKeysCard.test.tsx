import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { MAX_ACTIVE_KEYS, TenantApiKeysCard } from "@/components/TenantApiKeysCard";
import type { IssuedApiKey, MeResponse, TenantApiKey } from "@/lib/types";

// The card lists live keys, mints one and shows the secret
// exactly once, and revokes through a two-step control. The one-time secret
// panel and the at-limit refusal are the two behaviours that must not drift:
// the first is the only moment the secret exists on a screen, the second is
// what stops a tenant from accumulating keys nobody remembers.

const manager: MeResponse = {
  accountKey: 1,
  accountId: "6f1c1e5e-0000-4000-8000-000000000001",
  email: "manager@acme.test",
  name: "Manager",
  tenantKey: 7,
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

function key(apiKeyKey: number, label: string, revoked = false): TenantApiKey {
  return {
    apiKeyKey,
    label,
    prefix: `osk_k${apiKeyKey}abcd`.slice(0, 10),
    createdAt: "2026-09-06T14:32:00Z",
    createdBy: "Manager",
    lastUsedAt: null,
    revokedAt: revoked ? "2026-09-06T15:00:00Z" : null,
  };
}

let stored: TenantApiKey[];
let posts: string[];
let deletes: number[];

beforeEach(() => {
  stored = [key(1, "CI runner"), key(2, "Old integration", true)];
  posts = [];
  deletes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const base = "/api/tenants/7/api-keys";
      if (init?.method === "POST" && url.endsWith(base)) {
        const body = JSON.parse(String(init.body)) as { label: string };
        posts.push(body.label);
        const created: IssuedApiKey = {
          ...key(stored.length + 1, body.label),
          secret: "osk_0123456789012345678901234567890123456789012",
        };
        stored = [created, ...stored];
        return Promise.resolve(json(created, 201));
      }
      const revokeMatch = url.match(/\/api\/tenants\/7\/api-keys\/(\d+)$/);
      if (init?.method === "DELETE" && revokeMatch) {
        const id = Number(revokeMatch[1]);
        deletes.push(id);
        stored = stored.map((k) =>
          k.apiKeyKey === id ? { ...k, revokedAt: "2026-09-06T16:00:00Z" } : k,
        );
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url.endsWith(base)) {
        return Promise.resolve(json(stored));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TenantApiKeysCard user={manager} />
    </QueryClientProvider>,
  );
}

describe("TenantApiKeysCard", () => {
  it("lists live keys by label and prefix and leaves revoked ones out", async () => {
    renderCard();

    expect(await screen.findByText("CI runner")).toBeInTheDocument();
    expect(screen.getByText("osk_k1abcd…")).toBeInTheDocument();
    expect(screen.queryByText("Old integration")).not.toBeInTheDocument();
  });

  it("creates a key and shows the secret once with a copy control", async () => {
    const user = userEvent.setup();
    renderCard();
    await screen.findByText("CI runner");

    await user.type(screen.getByLabelText("New key label"), "Acme production");
    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(
      await screen.findByText("Copy this key now. It is shown only once."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("issued-secret")).toHaveTextContent(
      "osk_0123456789012345678901234567890123456789012",
    );
    expect(posts).toEqual(["Acme production"]);
    expect(await screen.findByText("Acme production")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByTestId("issued-secret")).not.toBeInTheDocument();
  });

  it("revokes only after the second step and cancel backs out", async () => {
    const user = userEvent.setup();
    renderCard();
    await screen.findByText("CI runner");

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    expect(
      screen.getByText("Revoke CI runner? Anything using it stops working at once."),
    ).toBeInTheDocument();
    expect(deletes).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Revoke key" })).not.toBeInTheDocument();
    expect(deletes).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    await user.click(screen.getByRole("button", { name: "Revoke key" }));

    await waitFor(() => expect(deletes).toEqual([1]));
    await waitFor(() => expect(screen.queryByText("CI runner")).not.toBeInTheDocument());
    expect(screen.getByText("No API keys yet")).toBeInTheDocument();
  });

  it("refuses to create past the active-key limit", async () => {
    stored = Array.from({ length: MAX_ACTIVE_KEYS }, (_, i) => key(i + 1, `Key ${i + 1}`));
    renderCard();
    await screen.findByText("Key 1");

    expect(
      screen.getByText(
        `Limit of ${MAX_ACTIVE_KEYS} active keys reached. Revoke one to create another.`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("New key label")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create key" })).toBeDisabled();
  });
});
