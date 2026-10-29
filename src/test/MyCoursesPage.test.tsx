import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { MyCoursesPage } from "@/routes/MyCoursesPage";
import type { MeResponse } from "@/lib/types";

// A course a manager assigned shows the day it was assigned, and sits above
// the rest until the learner starts it, newest assignment first.

const learner: MeResponse = {
  accountKey: 7,
  accountId: "6f1c1e5e-0000-4000-8000-000000000007",
  email: "ann@acme.test",
  name: "Ann Lee",
  tenantKey: 42,
  tenantHandle: "acme",
  tenantType: "Mini",
  isOperator: false,
  isManager: false,
  isLearner: true,
  dispatchEnabled: false,
  environment: "test",
};

function course(courseKey: number, title: string, extra: Record<string, unknown>) {
  return {
    courseKey,
    courseSlug: `c${courseKey}`,
    title,
    version: "1.2",
    attempts: 0,
    status: null,
    assignedAt: null,
    launcherStatusHtml: "You have not started this course.",
    launchUrl: `/play/${courseKey}`,
    restartUrl: null,
    ...extra,
  };
}

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

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/me")) return Promise.resolve(json(learner));
      if (url.endsWith("/api/tenants/42/courses"))
        return Promise.resolve(
          json([
            course(1, "Fire Safety", {}),
            course(2, "Data Protection", {
              attempts: 1,
              status: "incomplete",
              assignedAt: "2026-10-27T12:00:00+00:00",
              launcherStatusHtml: "Your status is incomplete.",
            }),
            course(3, "UK Export Control", {
              status: "launched",
              assignedAt: "2026-10-20T12:00:00+00:00",
            }),
            course(4, "US Export Control", {
              status: "launched",
              assignedAt: "2026-10-28T12:00:00+00:00",
            }),
          ]),
        );
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MyCoursesPage", () => {
  it("puts assigned courses not yet started first and labels every assignment", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/courses"]}>
          <MyCoursesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("Fire Safety", {}, { timeout: 3000 });
    const titles = screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent);
    expect(titles).toEqual([
      "US Export Control",
      "UK Export Control",
      "Fire Safety",
      "Data Protection",
    ]);

    expect(screen.getByText("Assigned 2026-10-28")).toBeInTheDocument();
    expect(screen.getByText("Assigned 2026-10-20")).toBeInTheDocument();
    expect(screen.getByText("Assigned 2026-10-27")).toBeInTheDocument();
    expect(screen.getAllByText(/^Assigned /)).toHaveLength(3);
  });
});
