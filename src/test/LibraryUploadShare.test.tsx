import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LibraryPage } from "@/routes/LibraryPage";

// The share panel belongs to the latest upload. If a second upload is refused
// or fails while the first course's link is still on screen, the manager can
// copy the wrong course's link believing it is the new one.

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

const URL_ = "https://app.openscorm.com/lobby/enroll/acme/h2s-awareness?token=TocCohWvcOeq";

function json(body: unknown, status = 200, type = "application/json") {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": type } });
}

let uploads: number;

beforeEach(() => {
  uploads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/api/tenants/7/courses") && method === "POST") {
        uploads += 1;
        // The first upload lands; the second is refused as a duplicate name.
        return Promise.resolve(
          uploads === 1
            ? json({
                courseKey: 573,
                courseSlug: "h2s-awareness",
                title: "Hydrogen Sulfide Awareness",
                manageUrl: "/courses/573",
              })
            : json(
                { status: 409, title: "Conflict", detail: "A course with this name exists." },
                409,
                "application/problem+json",
              ),
        );
      }
      if (url.endsWith("/api/tenants/7/courses/573"))
        return Promise.resolve(json({ publicInvitationUrl: URL_, publicInvitationBlocked: false }));
      if (url.endsWith("/api/tenants/7/courses")) return Promise.resolve(json([]));
      if (url.endsWith("/api/tenants/7/capacity"))
        return Promise.resolve(
          json({
            tenantType: "Mini",
            courseCount: 1,
            courseLimit: 3,
            isCoursesUnlimited: false,
            isCoursesOverLimit: false,
            isCoursesNearLimit: false,
            recommendedTier: null,
            packageLimitMb: 500,
            userCount: 1,
            userLimit: 100,
            isUsersUnlimited: false,
          }),
        );
      return Promise.resolve(json({}));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/library"]}>
        <LibraryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  // The dropzone is replaced by a progress row while a file uploads, so the
  // input is a new element after every upload: look it up each time.
  return () => {
    const input = view.container.querySelector<HTMLInputElement>(
      'input[type="file"][accept=".zip"]',
    );
    if (!input) throw new Error("no package input");
    return input;
  };
}

function zip(name: string) {
  return new File(["PK"], name, { type: "application/zip" });
}

describe("LibraryPage share panel", () => {
  it("shows the new course's link after an upload", async () => {
    const input = renderPage();

    await userEvent.setup().upload(input(), zip("h2s.zip"));

    expect(await screen.findByText("Uploaded Hydrogen Sulfide Awareness")).toBeInTheDocument();
    expect(await screen.findByText(URL_)).toBeInTheDocument();
  });

  it("clears the panel when the next upload fails", async () => {
    const input = renderPage();
    const user = userEvent.setup();

    await user.upload(input(), zip("h2s.zip"));
    expect(await screen.findByText(URL_)).toBeInTheDocument();

    await user.upload(input(), zip("h2s-again.zip"));

    expect(await screen.findByText("A course with this name exists.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(URL_)).not.toBeInTheDocument());
    expect(screen.queryByText("Uploaded Hydrogen Sulfide Awareness")).not.toBeInTheDocument();
  });

  it("clears the panel when the next file is refused before it is sent", async () => {
    const input = renderPage();
    const user = userEvent.setup({ applyAccept: false });

    await user.upload(input(), zip("h2s.zip"));
    expect(await screen.findByText(URL_)).toBeInTheDocument();

    await user.upload(input(), new File(["%PDF"], "policy.pdf", { type: "application/pdf" }));

    await waitFor(() => expect(screen.queryByText(URL_)).not.toBeInTheDocument());
    expect(uploads).toBe(1);
  });
});
