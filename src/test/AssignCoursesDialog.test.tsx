import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AssignCoursesDialog, type AssignTarget } from "@/components/AssignCoursesDialog";

// The dialog sends picked learners as ids and "all matching" as the search,
// never both, and reports what the server did rather than what was asked.

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

let posts: unknown[];

beforeEach(() => {
  posts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/tenants/7/courses")) {
        return Promise.resolve(
          json([
            { courseKey: 3, courseSlug: "uk-export", title: "UK Export Control" },
            { courseKey: 4, courseSlug: "us-export", title: "US Export Control" },
            { courseKey: 5, courseSlug: "gdpr", title: "Data Protection" },
          ]),
        );
      }
      if (url.endsWith("/api/tenants/7/assignments") && init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return Promise.resolve(
          json({ assigned: 236, alreadyAssigned: 4, alreadyCompleted: 0, skippedDeactivated: 1 }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDialog(target: AssignTarget) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onAssigned = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <AssignCoursesDialog
        tenantKey={7}
        target={target}
        onAssigned={onAssigned}
        onClose={() => {}}
      />
    </QueryClientProvider>,
  );
  return onAssigned;
}

describe("AssignCoursesDialog", () => {
  it("assigns the picked courses to the picked learners", async () => {
    const onAssigned = renderDialog({ kind: "accounts", accountKeys: [12, 13] });
    const user = userEvent.setup();

    expect(screen.getByText("To 2 selected learners")).toBeInTheDocument();
    await user.click(await screen.findByLabelText("UK Export Control"));
    await user.click(screen.getByLabelText("US Export Control"));
    await user.click(screen.getByRole("button", { name: "Assign 2 courses" }));

    await waitFor(() => expect(posts).toEqual([{ accountKeys: [12, 13], courseKeys: [3, 4] }]));
    expect(await screen.findByText("236 new assignments")).toBeInTheDocument();
    expect(screen.getByText("4 already assigned")).toBeInTheDocument();
    expect(screen.getByText("1 deactivated learner skipped")).toBeInTheDocument();
    expect(onAssigned).toHaveBeenCalledOnce();
  });

  it("sends the search for every learner matching it", async () => {
    renderDialog({ kind: "search", search: " uk ", learnerCount: 120 });
    const user = userEvent.setup();

    expect(screen.getByText('To all 120 learners matching "uk"')).toBeInTheDocument();
    await user.click(await screen.findByLabelText("UK Export Control"));
    await user.click(screen.getByRole("button", { name: "Assign 1 course" }));

    await waitFor(() => expect(posts).toEqual([{ learnerSearch: "uk", courseKeys: [3] }]));
  });

  it("cannot assign until a course is picked", async () => {
    renderDialog({ kind: "accounts", accountKeys: [12], name: "Ann Lee" });

    expect(screen.getByText("To Ann Lee")).toBeInTheDocument();
    await screen.findByLabelText("UK Export Control");
    expect(screen.getByRole("button", { name: "Assign courses" })).toBeDisabled();
  });
});
