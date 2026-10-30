import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ReportsPage } from "@/routes/ReportsPage";
import type { MeResponse } from "@/lib/types";

// Reports answers "who has not done their training": the Assigned column and
// the two assignment filters appear once the organization has assigned a
// course, and Not started is offered either way, since it is what the Status
// column already shows for a launched record.

const manager: MeResponse = {
  accountKey: 5,
  accountId: "6f1c1e5e-0000-4000-8000-000000000005",
  email: "manager@acme.test",
  name: "Morgan Manager",
  tenantKey: 42,
  tenantHandle: "acme",
  tenantType: "Mini",
  isOperator: false,
  isManager: true,
  isLearner: false,
  dispatchEnabled: true,
  environment: "test",
};

const assignedRecord = {
  enrollmentKey: 1,
  enrollmentId: "00000000-0000-4000-8000-000000000001",
  accountKey: 7,
  learnerName: "Ann Lee",
  learnerEmail: "ann@acme.test",
  clientKey: null,
  clientName: null,
  courseKey: 3,
  courseTitle: "UK Export Control",
  courseSlug: "uk-export",
  scormVersion: "1.2",
  status: "Not started",
  score: "",
  duration: null,
  saveCount: 0,
  startedAt: null,
  lastActivityAt: null,
  documentVersion: null,
  sourceType: "package",
  identitySource: "Admin",
  emailVerified: false,
  assignedAt: "2026-10-29T09:00:00+00:00",
  assignedByName: "Zara Manager",
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

vi.mock("@/lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics")>();
  return { ...actual, capture: vi.fn() };
});

const requested: string[] = [];

function stubFetch(hasAssignments: boolean) {
  requested.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith("/api/auth/me")) return Promise.resolve(json(manager));
      if (url.includes("/reports/records"))
        return Promise.resolve(
          json({
            page: 1,
            pageSize: 20,
            total: hasAssignments ? 1 : 0,
            hasAssignments,
            records: hasAssignments ? [assignedRecord] : [],
          }),
        );
      if (url.endsWith("/courses") || url.endsWith("/clients")) return Promise.resolve(json([]));
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/reports"]}>
        <ReportsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Reports assignment columns and filters", () => {
  it("shows who assigned a course and filters to assigned learners who have not started", async () => {
    stubFetch(true);
    renderPage();

    const row = (await screen.findByText("UK Export Control", {}, { timeout: 3000 })).closest(
      "tr",
    )!;
    expect(within(row).getByText("by Zara Manager")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Assigned" })).toBeInTheDocument();
    // An assigned course nobody has opened has no last activity, rather than
    // the moment it was assigned.
    expect(within(row).getByText("Never")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Status"), "Assigned, not started");

    await waitFor(() =>
      expect(requested.some((u) => u.includes("status=assigned_not_started"))).toBe(true),
    );
  });

  it("offers Not started but no assignment column or filters before anything is assigned", async () => {
    stubFetch(false);
    renderPage();

    await screen.findByText("No records match these filters", {}, { timeout: 3000 });
    const status = screen.getByLabelText("Status");

    expect(within(status).getByRole("option", { name: "Not started" })).toBeInTheDocument();
    expect(
      within(status).queryByRole("option", { name: "Assigned, not started" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Assigned" })).not.toBeInTheDocument();
  });
});
