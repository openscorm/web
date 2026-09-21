import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CourseDetailPage } from "@/routes/CourseDetailPage";

// A tenant's public invitation links switch off when it
// requires two-factor for all users, and the enrollment page refuses to redeem
// one. The card that hands managers the URL said nothing about it, so the
// manager learned the link was dead from the learner who opened it. The
// failure is silent by construction: the URL is well formed and copies fine.

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: {
      accountKey: 1,
      accountId: "a",
      email: "m@acme.test",
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

const INVITATION_URL = "https://app.openscorm.com/lobby/enroll/acme/h2s-awareness";

function detail(publicInvitationBlocked: boolean) {
  return {
    courseKey: 573,
    courseSlug: "h2s-awareness",
    title: "Hydrogen Sulfide Awareness",
    description: null,
    version: "1.2",
    standard: "scorm",
    courseSize: "4 MB",
    courseSizeInKB: 4096,
    tag: null,
    navigationPosition: "Left",
    navigationExitText: "Exit",
    publicInvitationUrl: INVITATION_URL,
    publicInvitationBlocked,
    manifestHeading: "",
    manifestHtml: "",
    launchUrl: "/acme/scorm/h2s-awareness",
    sourceType: null,
    documentVersion: null,
    generatorVersion: null,
    acknowledgmentText: null,
    retiredAt: null,
    supersededBy: null,
    supersededByVersion: null,
    incompleteEnrollments: 0,
  };
}

let blocked = false;

beforeEach(() => {
  blocked = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(detail(blocked)), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/courses/573"]}>
        <Routes>
          <Route path="/courses/:courseKey" element={<CourseDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Public invitation link card", () => {
  it("offers the URL when the organization allows public links", async () => {
    renderPage();

    expect(await screen.findByText(INVITATION_URL)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("explains itself instead of offering a link the learner cannot use", async () => {
    blocked = true;
    renderPage();

    expect(
      await screen.findByText(/Public invitation links are off because this organization requires/),
    ).toBeInTheDocument();
    expect(screen.queryByText(INVITATION_URL)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy" })).not.toBeInTheDocument();
  });
});
