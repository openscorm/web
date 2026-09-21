import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AccountManagerActions } from "@/components/AccountManagerActions";
import type { MeResponse } from "@/lib/types";

// The account editor a tenant's own manager never had: PATCH .../accounts/{key}
// shipped with the accounts page and had no UI, so correcting a name, an
// address or a role meant asking us to do it in the operator console.
//
// Two of these carry properties rather than behaviour. Nobody can take their
// own manager role off, because a tenant's last manager doing that leaves it
// unadministrable from inside the product. And a refusal at the user cap has to
// show the sentence the server sent, since "your plan is full" is the whole
// content of that answer.

const manager: MeResponse = {
  accountKey: 1,
  accountId: "6f1c1e5e-0000-4000-8000-000000000001",
  email: "manager@acme.test",
  name: "Manager Person",
  tenantKey: 42,
  tenantHandle: "acme",
  tenantType: "Mini",
  isOperator: false,
  isManager: true,
  isLearner: false,
  dispatchEnabled: true,
  environment: "test",
};

const target = {
  tenantKey: 42,
  accountKey: 7,
  name: "Lee Learner",
  email: "lee@acme.test",
  isActive: true,
  isManager: false,
  isLearner: true,
};

let fetchMock: ReturnType<typeof vi.fn>;
let calls: { url: string; method: string; body: unknown }[];

function stubFetch(status = 204, body: unknown = null) {
  calls = [];
  fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });

    if (status === 204) return Promise.resolve(new Response(null, { status: 204 }));

    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/problem+json" },
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
}

function renderActions(user: MeResponse, props: Partial<typeof target> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["auth", "me"], user);

  return render(
    <QueryClientProvider client={qc}>
      <AccountManagerActions {...target} {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => stubFetch());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AccountManagerActions", () => {
  it("renders nothing for a learner, since the endpoints refuse them", () => {
    const { container } = renderActions({ ...manager, isManager: false, isLearner: true });
    expect(container).toBeEmptyDOMElement();
  });

  it("offers Edit to a manager", async () => {
    renderActions(manager);
    expect(await screen.findByRole("button", { name: "Edit" })).toBeEnabled();
  });

  it("offers Reactivate only for a deactivated account", async () => {
    renderActions(manager);
    expect(screen.queryByRole("button", { name: "Reactivate" })).toBeNull();

    renderActions(manager, { isActive: false });
    expect(await screen.findByRole("button", { name: "Reactivate" })).toBeEnabled();
  });

  it("opens prefilled with what is stored", async () => {
    const user = userEvent.setup();
    renderActions(manager);

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect((await screen.findByLabelText("Name")) as HTMLInputElement).toHaveValue("Lee Learner");
    expect(screen.getByLabelText("Email")).toHaveValue("lee@acme.test");
    expect(screen.getByLabelText("Manager")).not.toBeChecked();
    expect(screen.getByLabelText("Learner")).toBeChecked();
  });

  it("saves the edit as a PATCH", async () => {
    const user = userEvent.setup();
    renderActions(manager);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Lee Manager");
    await user.click(screen.getByLabelText("Manager"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toContain("/api/tenants/42/accounts/7");
    expect(calls[0].body).toEqual({
      name: "Lee Manager",
      email: "lee@acme.test",
      isManager: true,
      isLearner: true,
    });
  });

  // Same rule and the same words as the create form on the accounts page, so
  // adding somebody and editing them refuse identically.
  it("refuses an account with no role, before it reaches the server", async () => {
    const user = userEvent.setup();
    renderActions(manager);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(await screen.findByLabelText("Learner"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Pick at least one role.")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it("refuses a blank name or address before it reaches the server", async () => {
    const user = userEvent.setup();
    renderActions(manager);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(await screen.findByLabelText("Name"));
    await user.clear(screen.getByLabelText("Email"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Name is required.")).toBeTruthy();
    expect(screen.getByText("Email is required.")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  // Mirrors the server guard. A tenant's last manager unticking Manager leaves
  // that organization with nobody able to administer it and no way back.
  it("will not let a manager take their own manager role off", async () => {
    const user = userEvent.setup();
    renderActions(manager, { accountKey: manager.accountKey, isManager: true });

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(await screen.findByLabelText("Manager")).toBeDisabled();
    expect(screen.getByText(/cannot remove your own manager role/i)).toBeTruthy();
  });

  it("reactivates with a POST", async () => {
    const user = userEvent.setup();
    renderActions(manager, { isActive: false });

    await user.click(screen.getByRole("button", { name: "Reactivate" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/api/tenants/42/accounts/7/reactivate");
  });

  // The cap refusal's whole content is its sentence, and the older helper on
  // these pages only read a string problem, which would have swallowed it.
  it("shows the server's sentence when the plan is full", async () => {
    stubFetch(403, {
      title: "Organization is at its user limit",
      detail:
        "Reactivating this account would exceed the number of users this plan allows. Deactivate somebody else or upgrade the plan.",
      status: 403,
    });

    const user = userEvent.setup();
    renderActions(manager, { isActive: false });

    await user.click(screen.getByRole("button", { name: "Reactivate" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/exceed the number of users/i);
  });
});
