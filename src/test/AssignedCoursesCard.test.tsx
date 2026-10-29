import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AssignedCoursesCard } from "@/components/AssignedCoursesCard";

// Unassign is offered only for a course the learner never opened, and it
// names the learner and the course in the DELETE.

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

let assigned: unknown[];
let deletes: string[];

beforeEach(() => {
  assigned = [
    {
      courseKey: 3,
      courseTitle: "UK Export Control",
      courseSlug: "uk-export",
      courseDeleted: false,
      status: "launched",
      assignedAt: "2026-10-29T09:00:00Z",
      assignedByName: "Zara Manager",
      launched: false,
    },
    {
      courseKey: 4,
      courseTitle: "Data Protection",
      courseSlug: "gdpr",
      courseDeleted: false,
      status: "incomplete",
      assignedAt: "2026-10-28T09:00:00Z",
      assignedByName: "Zara Manager",
      launched: true,
    },
  ];
  deletes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "DELETE") {
        deletes.push(url);
        assigned = assigned.filter((r) => (r as { courseKey: number }).courseKey !== 3);
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url.includes("/api/tenants/7/assignments?accountKey=12")) {
        return Promise.resolve(json(assigned));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AssignedCoursesCard tenantKey={7} accountKey={12} name="Ann Lee" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AssignedCoursesCard", () => {
  it("lists assignments with who made them and offers Unassign only before a launch", async () => {
    renderCard();

    const uk = (await screen.findByText("UK Export Control")).closest("tr")!;
    const gdpr = screen.getByText("Data Protection").closest("tr")!;

    expect(within(uk).getByText("Not started")).toBeInTheDocument();
    expect(within(uk).getByText("Zara Manager")).toBeInTheDocument();
    expect(within(uk).getByRole("button", { name: "Unassign" })).toBeInTheDocument();
    expect(within(gdpr).queryByRole("button", { name: "Unassign" })).not.toBeInTheDocument();
  });

  it("unassigns after a confirmation", async () => {
    renderCard();
    const user = userEvent.setup();

    const uk = (await screen.findByText("UK Export Control")).closest("tr")!;
    await user.click(within(uk).getByRole("button", { name: "Unassign" }));
    await user.click(await screen.findByRole("button", { name: "Unassign course" }));

    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0]).toContain("/api/tenants/7/assignments?accountKey=12&courseKey=3");
    await waitFor(() => expect(screen.queryByText("UK Export Control")).not.toBeInTheDocument());
  });
});
