import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { OperatorTenantDetailPage } from "@/routes/OperatorTenantDetailPage";
import type { MeResponse } from "@/lib/types";

// The cap waiver is granted here and nowhere else, and it has to reach the
// server as its own field. Sending it as a tier or a limit would be undone by
// the next Stripe subscription webhook, which rewrites both from the catalog.

const operator: MeResponse = {
  accountKey: 1,
  accountId: "6f1c1e5e-0000-4000-8000-000000000001",
  email: "operator@mail.openscorm.test",
  name: "Ops Person",
  tenantKey: 1,
  tenantHandle: "openscorm",
  tenantType: "Custom",
  isOperator: true,
  isManager: true,
  isLearner: false,
  dispatchEnabled: true,
  environment: "test",
};

const tenant = {
  canRestart: false,
  canDelete: false,
  canSuspend: false,
  suspendedAt: null as string | null,
  suspensionNote: null as string | null,
  apiCallsToday: 0,
  apiDailyLimit: 50000 as number | null,
  tenantKey: 42,
  tenantId: "6f1c1e5e-0000-4000-8000-00000000002a",
  tenantHandle: "acme",
  tenantName: "Acme",
  tenantType: "Mini",
  platformEdition: "Commercial",
  platformReferral: null,
  courseLimit: 3,
  userLimit: 100,
  capWaived: false,
  // Widened deliberately: the waived variants below assign a note, and the
  // literal would otherwise fix this field's type at null.
  capWaiverNote: null as string | null,
  coursesAlwaysShared: false,
  courseCount: 3,
  userCount: 100,
  stripeCustomerId: null,
  stripeSubscriptionId: null as string | null,
  subscriptionStatus: null as string | null,
  createdAt: "2026-08-01T00:00:00+00:00",
  courses: [],
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;
let patchBodies: string[];
// Seeded cache data is stale on mount, so the page refetches immediately and
// the served payload is what the Edit dialog opens against. The mock has to
// answer with the same tenant the test seeded, or the dialog opens on the
// wrong waiver state.
let served: typeof tenant;

beforeEach(() => {
  patchBodies = [];
  served = tenant;
  fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "PATCH") {
      patchBodies.push(String(init.body));
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (url.includes("/api/operator/tenants/42/accounts")) {
      return Promise.resolve(json({ page: 1, pageSize: 20, total: 0, accounts: [] }));
    }
    if (url.endsWith("/api/operator/tenants/42")) return Promise.resolve(json(served));
    if (url.endsWith("/api/auth/me")) return Promise.resolve(json(operator));
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage(waived = false, overrides: Partial<typeof tenant> = {}) {
  served = {
    ...tenant,
    capWaived: waived,
    capWaiverNote: waived ? "Enterprise pilot, approved by an operator" : null,
    ...overrides,
  };

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["auth", "me"], operator);
  qc.setQueryData(["operator", "tenant", "42"], served);

  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operator/tenants/42"]}>
        <Routes>
          <Route path="/operator/tenants/:tenantKey" element={<OperatorTenantDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OperatorTenantDetailPage cap waiver", () => {
  it("sends the waiver and its note as their own fields", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("checkbox", { name: /exceed its course and user limits/i }));
    await user.type(screen.getByLabelText("Waiver note"), "Pilot overage, approved by an operator");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(patchBodies).toHaveLength(1);
    const body = JSON.parse(patchBodies[0]);
    expect(body.capWaived).toBe(true);
    expect(body.capWaiverNote).toBe("Pilot overage, approved by an operator");
  });

  // The tier and both limits belong to billing, which rewrites them from the
  // catalog on every subscription webhook. A waiver that also touched them
  // would be reverted by the next renewal with nothing to show it existed.
  it("changes nothing about the plan or its limits", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("checkbox", { name: /exceed its course and user limits/i }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const body = JSON.parse(patchBodies[0]);
    expect(body).not.toHaveProperty("tenantType");
    expect(body).not.toHaveProperty("courseLimit");
    expect(body).not.toHaveProperty("userLimit");
  });

  // Lifting the waiver has to take the note with it, or the next operator
  // reads an explanation for a grant that is no longer in force.
  it("clears the note when the waiver is lifted", async () => {
    const user = userEvent.setup();
    renderPage(true);

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("checkbox", { name: /exceed its course and user limits/i }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const body = JSON.parse(patchBodies[0]);
    expect(body.capWaived).toBe(false);
    expect(body.capWaiverNote).toBe("");
  });

  it("shows the waiver on the capacity card when one is in force", async () => {
    renderPage(true);

    expect(await screen.findByText("Permitted to exceed both caps")).toBeInTheDocument();
    expect(screen.getByText("Enterprise pilot, approved by an operator")).toBeInTheDocument();
  });
});

// The plan rides only when it changed; under an active subscription the
// control is locked, because the API would refuse it and the next webhook would
// undo it anyway.
describe("OperatorTenantDetailPage plan edit", () => {
  it("sends the new plan when it changed", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.selectOptions(screen.getByLabelText("Plan"), "Large");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const body = JSON.parse(patchBodies[0]);
    expect(body.tenantType).toBe("Large");
  });

  it("locks the plan while a Stripe subscription is active", async () => {
    const user = userEvent.setup();
    renderPage(false, { stripeSubscriptionId: "sub_123", subscriptionStatus: "active" });

    await user.click(await screen.findByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Plan")).toBeDisabled();
    expect(screen.getByText(/Change its plan through Stripe/)).toBeInTheDocument();
  });
});

// The switch is shown only to a whitelisted operator, posts the
// note as its own field, and the page says plainly when a tenant is off.
describe("OperatorTenantDetailPage suspend switch", () => {
  it("is absent without the gate and present with it", async () => {
    renderPage();
    await screen.findByText("Acme");
    expect(screen.queryByRole("button", { name: "Suspend tenant" })).not.toBeInTheDocument();
  });

  it("posts the note and shows the suspended state", async () => {
    const user = userEvent.setup();
    const posts: { url: string; body: string }[] = [];
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        posts.push({ url, body: String(init.body ?? "") });
        served = {
          ...served,
          suspendedAt: "2026-09-06T20:00:00+00:00",
          suspensionNote: "abuse report 4412",
        };
        return Promise.resolve(
          json({ suspendedAt: served.suspendedAt, note: served.suspensionNote }),
        );
      }
      if (url.includes("/api/operator/tenants/42/accounts")) {
        return Promise.resolve(json({ page: 1, pageSize: 20, total: 0, accounts: [] }));
      }
      if (url.endsWith("/api/operator/tenants/42")) return Promise.resolve(json(served));
      if (url.endsWith("/api/auth/me")) return Promise.resolve(json(operator));
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    renderPage(false, { canSuspend: true });

    await user.click(await screen.findByRole("button", { name: "Suspend tenant" }));
    await user.type(screen.getByLabelText(/Note/), "abuse report 4412");
    await user.click(screen.getByRole("button", { name: "Suspend tenant", hidden: false }));

    expect(posts[0].url).toContain("/api/operator/tenants/42/suspend");
    expect(JSON.parse(posts[0].body).note).toBe("abuse report 4412");
    expect(await screen.findByRole("button", { name: "Unsuspend tenant" })).toBeInTheDocument();
    expect(screen.getByText(/abuse report 4412/)).toBeInTheDocument();
  });
});
