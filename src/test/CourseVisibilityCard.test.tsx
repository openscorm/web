import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CourseVisibilityCard } from "@/components/CourseVisibilityCard";
import type { MeResponse } from "@/lib/types";

// Turning the setting on can leave a learner with an empty My courses, so it
// asks first; turning it off does not. Either way the card says which state
// learners are in.

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

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

let stored: { assignedCoursesOnly: boolean };
let puts: unknown[];

beforeEach(() => {
  stored = { assignedCoursesOnly: false };
  puts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.endsWith("/api/tenants/7/course-visibility")) {
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }
      if (init?.method === "PUT") {
        stored = JSON.parse(String(init.body)) as { assignedCoursesOnly: boolean };
        puts.push(stored);
      }
      return Promise.resolve(json(stored));
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
      <CourseVisibilityCard user={manager} />
    </QueryClientProvider>,
  );
}

describe("CourseVisibilityCard", () => {
  it("asks before showing learners only their assigned courses", async () => {
    renderCard();
    const user = userEvent.setup();

    expect(
      await screen.findByText("Learners see every course in your library"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show only assigned courses" }));
    expect(puts).toHaveLength(0);

    const dialog = await screen.findByRole("dialog");
    await user.click(
      Array.from(dialog.querySelectorAll("button")).find(
        (b) => b.textContent === "Show only assigned courses",
      )!,
    );

    await waitFor(() => expect(puts).toEqual([{ assignedCoursesOnly: true }]));
    expect(
      await screen.findByText("Learners see only the courses assigned to them"),
    ).toBeInTheDocument();
  });

  it("goes back to the whole library without asking", async () => {
    stored = { assignedCoursesOnly: true };
    renderCard();

    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Show the whole library" }));

    await waitFor(() => expect(puts).toEqual([{ assignedCoursesOnly: false }]));
    expect(
      await screen.findByText("Learners see every course in your library"),
    ).toBeInTheDocument();
  });
});
