import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AppShell } from "@/components/AppShell";
import type { MeResponse } from "@/lib/types";

// The account identity moved from the bottom of the sidebar to a menu at the
// top right, and the environment marker arrived with it.
// Two things are worth pinning. The badge must be absent on live, because a
// permanent production marker is what teaches people to ignore the signal
// everywhere it matters. And it must be present everywhere else, because the
// whole point is knowing which data you are about to change.

const account: MeResponse = {
  accountKey: 1,
  accountId: "6f1c1e5e-0000-4000-8000-000000000001",
  email: "manager@acme.test",
  name: "Ada Manager",
  tenantKey: 1,
  tenantHandle: "acme",
  tenantType: "Mini",
  isOperator: false,
  isManager: true,
  isLearner: false,
  dispatchEnabled: true,
  environment: "live",
};

function renderShell(user: MeResponse) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["auth", "me"], user);

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppShell>
          <div>Page body</div>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppShell chrome", () => {
  it("shows the account name in the topbar", async () => {
    renderShell(account);
    expect(await screen.findByText("Ada Manager")).toBeInTheDocument();
  });

  it("shows the Dispatch nav item without a lock chip for a paid manager", async () => {
    renderShell({ ...account, tenantType: "Mini", dispatchEnabled: true });
    expect(await screen.findByRole("link", { name: /Dispatch/ })).toBeInTheDocument();
    expect(screen.queryByText("Paid")).not.toBeInTheDocument();
  });

  it("marks the Dispatch nav item with a lock chip for a gated Free manager", async () => {
    renderShell({ ...account, tenantType: "Trial", dispatchEnabled: false, dispatchGated: true });
    expect(await screen.findByRole("link", { name: /Dispatch/ })).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
  });

  it("hides the Dispatch nav item entirely when the kill switch is off", async () => {
    renderShell({ ...account, dispatchEnabled: false, dispatchGated: false });
    await screen.findByText("Page body");
    expect(screen.queryByRole("link", { name: /Dispatch/ })).not.toBeInTheDocument();
  });

  it("renders no environment badge or rule on live", async () => {
    const { container } = renderShell({ ...account, environment: "live" });
    await screen.findByText("Page body");

    expect(screen.queryByText("Live")).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="environment-rule"]')).toBeNull();
  });

  it("names the environment and paints the rule everywhere else", async () => {
    const { container } = renderShell({ ...account, environment: "test" });

    expect(await screen.findByText("Test")).toBeInTheDocument();
    expect(container.querySelector('[data-testid="environment-rule"]')).not.toBeNull();
  });

  // Deployed config carries aliases: Release:Environment says "prod" or "qa" on
  // some boxes. The badge shows the name the team says out loud, not the token.
  it("resolves a config alias to the canonical roster name", async () => {
    renderShell({ ...account, environment: "qa" });
    expect(await screen.findByText("Test")).toBeInTheDocument();
  });

  it("treats an alias for production as production", async () => {
    const { container } = renderShell({ ...account, environment: "prod" });
    await screen.findByText("Page body");

    expect(container.querySelector('[data-testid="environment-rule"]')).toBeNull();
  });

  // A session cached from before the field shipped, and any environment nobody
  // added to the roster. The first must render nothing; the second must render
  // something, because an unknown environment is the one worth a second look.
  it("renders nothing when the session carries no environment", async () => {
    const { environment: _dropped, ...withoutEnvironment } = account;
    const { container } = renderShell(withoutEnvironment as MeResponse);
    await screen.findByText("Page body");

    expect(container.querySelector('[data-testid="environment-rule"]')).toBeNull();
  });

  it("still marks an environment missing from the roster", async () => {
    renderShell({ ...account, environment: "hotfix" });
    expect(await screen.findByText("hotfix")).toBeInTheDocument();
  });

  // The sidebar brand block sized itself to its contents (p-4 around a
  // 44px theme control) while the header was a fixed h-12, so the rule under
  // each landed 24.67px apart and the corner where they meet read as broken.
  //
  // Class comparison rather than measurement: jsdom has no layout engine, so
  // getBoundingClientRect is all zeros here and cannot tell aligned from
  // misaligned. What regresses in practice is someone changing the height on
  // one block and not the other, and that is visible in the markup.
  it("gives the sidebar brand block and the header the same height", async () => {
    const { container } = renderShell(account);
    await screen.findByText("Page body");

    const brand = container.querySelector("aside > div");
    const header = container.querySelector("header");
    const heightOf = (el: Element | null) => el?.className.match(/\bh-\d+\b/)?.[0];

    expect(heightOf(brand)).toBe("h-12");
    expect(heightOf(header)).toBe("h-12");
  });
});
