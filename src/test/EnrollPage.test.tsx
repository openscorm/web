import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { EnrollPage } from "@/routes/EnrollPage";
import type { EnrollResponse } from "@/lib/types";

// Regression cover. A public invitation link names exactly one course,
// and this page used to navigate to /courses on success. That route lists every
// course in the tenant, 121 of them on a large one, with nothing marking the invited
// one -- so a button labeled "Start course" started nothing and the learner was
// left to find it. The guard has to assert the destination, because the failure
// is silent: the request succeeds, the account is created, and the page renders
// a perfectly good listing.

const COURSE_KEY = 535;

const learner: EnrollResponse = {
  accountKey: 9,
  accountId: "6f1c1e5e-0000-4000-8000-000000000009",
  email: "alex@acme.test",
  name: "Alex",
  tenantKey: 2,
  tenantHandle: "acme",
  tenantType: "",
  isOperator: false,
  isManager: false,
  isLearner: true,
  dispatchEnabled: false,
  courseKey: COURSE_KEY,
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

let enrollBody: unknown = learner;

beforeEach(() => {
  enrollBody = learner;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/public/enroll")) return Promise.resolve(json(enrollBody));
      if (url.endsWith("/api/auth/me")) return Promise.resolve(json(learner));
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter
        initialEntries={[
          "/enroll?account=acme&course=notification-course-v1-0&token=TESTTOKEN0000",
        ]}
      >
        <Routes>
          <Route path="/enroll" element={<EnrollPage />} />
          <Route path="/play/:courseKey" element={<div>Player body</div>} />
          <Route path="/courses" element={<div>Course listing body</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function submitEnrollment() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Your name"), "Alex");
  await user.type(screen.getByLabelText("Email"), "alex@acme.test");
  await user.click(screen.getByRole("button", { name: "Start course" }));
}

describe("EnrollPage invitation redirect", () => {
  it("launches the invited course rather than the tenant listing", async () => {
    renderApp();
    await submitEnrollment();

    expect(await screen.findByText("Player body")).toBeInTheDocument();
    // The assertion that actually fails against the pre-fix code. Reaching the
    // player is the requirement; not reaching the listing is the defect.
    expect(screen.queryByText("Course listing body")).not.toBeInTheDocument();
  });

  it("falls back to the listing when the reply carries no course", async () => {
    // Guards the branch, not a shape the server should ever send: routing to
    // /play/0 would render a player pointed at nothing.
    enrollBody = { ...learner, courseKey: 0 };
    renderApp();
    await submitEnrollment();

    expect(await screen.findByText("Course listing body")).toBeInTheDocument();
  });
});
