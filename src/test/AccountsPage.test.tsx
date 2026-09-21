import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AccountsPage } from "@/routes/AccountsPage";

// The roster reads one page at a time and searches server-side,
// so the two things that must not drift are the query string the page sends
// (page, pageSize, search) and that a search resets to page 1.

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: {
      accountKey: 1,
      accountId: "a",
      email: "m@x.com",
      name: "Manager",
      tenantKey: 7,
      tenantHandle: "acme",
      tenantType: "Mini",
      isOperator: false,
      isManager: true,
      isLearner: false,
    },
    loading: false,
  }),
}));

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function row(key: number, name: string) {
  return {
    accountKey: key,
    email: `${name.toLowerCase().replace(" ", ".")}@acme.test`,
    name,
    isActive: true,
    isManager: false,
    isLearner: true,
    isOperator: false,
    createdAt: "2026-09-06T14:00:00Z",
  };
}

let requests: string[];

beforeEach(() => {
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      const params = new URL(url, "http://localhost").searchParams;
      const page = Number(params.get("page") ?? "1");
      const search = params.get("search") ?? "";
      if (search === "ann")
        return Promise.resolve(
          json({ items: [row(1, "Ann Lee")], total: 1, page: 1, pageSize: 50 }),
        );
      if (page === 2)
        return Promise.resolve(
          json({ items: [row(51, "Zed Young")], total: 51, page: 2, pageSize: 50 }),
        );
      return Promise.resolve(
        json({
          items: Array.from({ length: 50 }, (_, i) =>
            row(i + 1, i === 0 ? "Ann Lee" : `Person ${i + 1}`),
          ),
          total: 51,
          page: 1,
          pageSize: 50,
        }),
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/accounts"]}>
        <AccountsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AccountsPage roster", () => {
  it("asks for one page and shows the pager total", async () => {
    renderPage();

    expect(await screen.findByText("Ann Lee")).toBeInTheDocument();
    expect(screen.getByText("1-50 of 51")).toBeInTheDocument();
    const first = requests.find((u) => u.includes("/api/tenants/7/accounts"));
    expect(first).toContain("page=1");
    expect(first).toContain("pageSize=50");
    expect(first).not.toContain("search=");
  });

  it("moves to the next page through the pager", async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByText("Ann Lee");

    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(await screen.findByText("Zed Young")).toBeInTheDocument();
    expect(requests.some((u) => u.includes("page=2"))).toBe(true);
  });

  it("searches server-side and resets to page 1", async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByText("Ann Lee");
    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Zed Young");

    await user.type(screen.getByLabelText(/search accounts/i), "ann");

    await waitFor(() =>
      expect(requests.some((u) => u.includes("search=ann") && u.includes("page=1"))).toBe(true),
    );
    expect(await screen.findByText("1-1 of 1")).toBeInTheDocument();
    expect(screen.queryByText("Zed Young")).not.toBeInTheDocument();
  });
});
