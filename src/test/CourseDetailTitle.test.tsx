import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CourseDetailPage } from "@/routes/CourseDetailPage";

// A SCORM package is titled by its manifest, which is often the vendor's name
// for the course rather than the one the customer's staff know it by. Manage
// renames a package. A policy document keeps the title it was published with,
// so its page offers no title field and its save sends none.

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

function detail(sourceType: string | null) {
  return {
    courseKey: 573,
    courseSlug: "gdpr-essentials",
    title: "General Data Protection Regulation Essentials",
    description: null,
    version: "1.2",
    standard: "scorm",
    courseSize: "8 KB",
    courseSizeInKB: 8,
    tag: null,
    navigationPosition: "Left",
    navigationExitText: "Exit",
    publicInvitationUrl: "https://app.openscorm.com/lobby/enroll/acme/gdpr-essentials",
    publicInvitationBlocked: false,
    manifestHeading: "",
    manifestHtml: "",
    launchUrl: "/acme/scorm/gdpr-essentials",
    sourceType,
    documentVersion: sourceType === "pdf" ? "1" : null,
    generatorVersion: null,
    acknowledgmentText: sourceType === "pdf" ? "I have read this policy." : null,
    retiredAt: null,
    supersededBy: null,
    supersededByVersion: null,
    incompleteEnrollments: 0,
  };
}

let sourceType: string | null = null;
let patched: Record<string, unknown> | null = null;

beforeEach(() => {
  sourceType = null;
  patched = null;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        patched = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      const body = String(input).endsWith("/invitation-links") ? [] : detail(sourceType);
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
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

describe("Course title on Manage", () => {
  it("renames a package", async () => {
    renderPage();

    const input = await screen.findByLabelText("Title");
    expect(input).toHaveValue("General Data Protection Regulation Essentials");

    fireEvent.change(input, { target: { value: "Data Protection" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patched).not.toBeNull());
    expect(patched).toMatchObject({ title: "Data Protection" });
  });

  it("offers no title field for a policy document and sends no title", async () => {
    sourceType = "pdf";
    renderPage();

    await screen.findByLabelText("Tag");
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patched).not.toBeNull());
    expect(patched).not.toHaveProperty("title");
  });
});
