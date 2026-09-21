import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PricingPage } from "@/routes/PricingPage";

// AppShell redirects to /login without an authenticated user.
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: {
      accountKey: 1,
      accountId: "a",
      email: "m@x.com",
      name: "Manager",
      tenantKey: 1,
      tenantHandle: "acme",
      tenantType: "Mini",
      isOperator: false,
      isManager: true,
      isLearner: false,
    },
    loading: false,
  }),
}));

function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <PricingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PricingPage checkout banner", () => {
  it("shows the success banner after a completed checkout", () => {
    renderAt("/billing?checkout=success");
    expect(screen.getByText("Payment received. Your plan has been updated.")).toBeInTheDocument();
  });

  it("shows the canceled banner after an abandoned checkout", () => {
    renderAt("/billing?checkout=canceled");
    expect(screen.getByText("Checkout canceled. Your plan has not changed.")).toBeInTheDocument();
  });

  it("shows no banner without the checkout param", () => {
    renderAt("/billing");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
