import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AccountAdminActions } from "@/components/AccountAdminActions";
import type { MeResponse } from "@/lib/types";

// Set password and Impersonate are both operator-only, and both endpoints
// refuse an operator target. The buttons have to agree with that, or the
// console offers an action whose only outcome is an error dialog.

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

const target = {
  tenantKey: 42,
  accountKey: 7,
  name: "Lee Learner",
  isActive: true,
  isOperator: false,
};

function renderActions(user: MeResponse, props: Partial<typeof target> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["auth", "me"], user);

  return render(
    <QueryClientProvider client={qc}>
      <AccountAdminActions {...target} {...props} />
    </QueryClientProvider>,
  );
}

describe("AccountAdminActions", () => {
  it("offers both actions to an operator against an ordinary account", async () => {
    renderActions(operator);

    expect(await screen.findByRole("button", { name: "Set password" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Impersonate" })).toBeEnabled();
  });

  it("renders nothing for a manager", async () => {
    const { container } = renderActions({ ...operator, isOperator: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the target is an operator", async () => {
    const { container } = renderActions(operator, { isOperator: true });
    expect(container).toBeEmptyDOMElement();
  });

  // A deactivated account cannot hold a session, so the server refuses to
  // impersonate one. Assigning it a password is still allowed, and is how a
  // reactivated account becomes reachable again.
  it("disables only impersonation for a deactivated account", async () => {
    renderActions(operator, { isActive: false });

    expect(await screen.findByRole("button", { name: "Set password" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Impersonate" })).toBeDisabled();
  });
});
