import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  LearnerImportCard,
  type ImportResponse,
  type ImportRow,
} from "@/components/LearnerImportCard";

// The roster's CSV import: check the file, read what will happen to each row,
// then import. Nothing is sent to the import endpoint until the manager
// confirms.

const rows: ImportRow[] = [
  {
    line: 2,
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@acme.test",
    status: "ready",
    detail: null,
  },
  {
    line: 3,
    firstName: "Alan",
    lastName: "Turing",
    email: "alan@acme.test",
    status: "ready",
    detail: null,
  },
  {
    line: 4,
    firstName: "No",
    lastName: "Email",
    email: "",
    status: "invalid",
    detail: "Email is missing.",
  },
  {
    line: 5,
    firstName: "Kept",
    lastName: "Person",
    email: "kept@acme.test",
    status: "existing",
    detail: "Already in the organization.",
  },
];

function counts(overrides: Partial<ImportResponse["counts"]> = {}): ImportResponse["counts"] {
  return {
    ready: 0,
    invalid: 0,
    duplicate: 0,
    existing: 0,
    deactivated: 0,
    created: 0,
    over_capacity: 0,
    ...overrides,
  };
}

let calls: string[];
let committed: FormData[];
let previewBody: ImportResponse;

beforeEach(() => {
  calls = [];
  committed = [];
  previewBody = {
    capacity: {
      limited: false,
      metered: false,
      headroom: null,
      ready: 2,
      overBy: 0,
      cap: null,
      active: null,
      includesDispatch: false,
    },
    counts: counts({ ready: 2, invalid: 1, existing: 1 }),
    rows,
    resultsCsv: null,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      const json = (body: unknown) =>
        Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      if (url.endsWith("/api/tenants/7/courses"))
        return json([
          { courseKey: 3, courseSlug: "uk-export", title: "UK Export Control" },
          { courseKey: 4, courseSlug: "gdpr", title: "Data Protection" },
        ]);
      if (url.endsWith("/accounts/import/preview")) return json(previewBody);
      if (url.endsWith("/accounts/import")) {
        const form = init?.body as FormData;
        committed.push(form);
        return json({
          ...previewBody,
          counts: counts({ created: 2, invalid: 1, existing: 1 }),
          rows: rows.map((r) => (r.status === "ready" ? { ...r, status: "created" } : r)),
          resultsCsv: "Line,First name\r\n",
          assignment: form.has("courseKeys")
            ? { assigned: 6, alreadyAssigned: 0, alreadyCompleted: 0, existingNotified: 1 }
            : null,
        });
      }
      return json(null);
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
        <LearnerImportCard tenantKey={7} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function checkFile() {
  const user = userEvent.setup();
  const file = new File(["First name,Last name,Email\r\n"], "learners.csv", { type: "text/csv" });
  await user.upload(screen.getByLabelText("CSV file"), file);
  await user.click(screen.getByRole("button", { name: "Check file" }));
  return user;
}

describe("LearnerImportCard", () => {
  it("previews the file and lists only the rows that need attention", async () => {
    renderCard();
    await checkFile();

    expect(await screen.findByText(/2 learners are ready to import\./)).toBeInTheDocument();
    expect(screen.getByText("Email is missing.")).toBeInTheDocument();
    expect(screen.getByText("Already in the organization.")).toBeInTheDocument();
    expect(screen.queryByText("ada@acme.test")).not.toBeInTheDocument();
    expect(calls.some((u) => u.endsWith("/accounts/import"))).toBe(false);
  });

  it("imports on confirm and offers the results file", async () => {
    renderCard();
    const user = await checkFile();

    await user.click(await screen.findByRole("button", { name: "Import 2 learners" }));

    expect(await screen.findByText(/2 learners were added and invited\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download results" })).toBeInTheDocument();
    expect(calls.filter((u) => u.endsWith("/api/tenants/7/accounts/import"))).toHaveLength(1);
    expect(committed[0].has("courseKeys")).toBe(false);
  });

  // The courses go to everyone in the file, and each person gets one email:
  // a new learner's invitation lists them.
  it("sends the courses picked at the confirm step with the import", async () => {
    renderCard();
    const user = await checkFile();

    await user.click(await screen.findByLabelText("UK Export Control"));
    await user.click(screen.getByLabelText("Data Protection"));
    expect(screen.getByLabelText("Email learners about their new courses")).toBeChecked();
    await user.click(
      screen.getByRole("button", { name: "Import 2 learners and assign 2 courses" }),
    );

    expect(await screen.findByText("6 new assignments")).toBeInTheDocument();
    expect(
      screen.getByText("Each new learner's invitation lists their courses"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Emailing 1 person already in your organization about their new courses"),
    ).toBeInTheDocument();
    expect(committed[0].getAll("courseKeys")).toEqual(["3", "4"]);
    expect(committed[0].get("notify")).toBe("true");
  });

  it("can carry courses to a file of people who are all here already", async () => {
    previewBody.capacity = { ...previewBody.capacity, ready: 0 };
    previewBody.counts = counts({ existing: 1 });
    renderCard();
    const user = await checkFile();

    expect(await screen.findByRole("button", { name: "Import 0 learners" })).toBeDisabled();
    await user.click(await screen.findByLabelText("UK Export Control"));
    await user.click(screen.getByLabelText("Email learners about their new courses"));
    await user.click(screen.getByRole("button", { name: "Assign 1 course" }));

    expect(await screen.findByText("No course emails sent")).toBeInTheDocument();
    expect(committed[0].get("notify")).toBe("false");
  });

  it("says how many fit when the plan is full, and imports only those", async () => {
    previewBody.capacity = { ...previewBody.capacity, limited: true, headroom: 1, overBy: 1 };
    renderCard();
    await checkFile();

    expect(await screen.findByText(/Your plan has room for 1 more learner\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upgrade your plan" })).toHaveAttribute(
      "href",
      "/billing",
    );
    expect(screen.getByRole("button", { name: "Import 1 learner" })).toBeEnabled();
  });

  it("tells an uncapped metered organization how imported learners count", async () => {
    previewBody.capacity = { ...previewBody.capacity, metered: true };
    renderCard();
    await checkFile();

    expect(
      await screen.findByText(/count toward your active learners in the period they first launch/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Upgrade your plan" })).not.toBeInTheDocument();
  });

  // A paid plan counts a learner in a period they open a course, so the
  // preview quotes the cap and where the organization stands, and warns
  // without blocking when the file could carry them over.
  it("quotes the cap and this period's count, with the dispatch clause when it applies", async () => {
    previewBody.capacity = {
      ...previewBody.capacity,
      metered: true,
      cap: 250,
      active: 240,
      includesDispatch: true,
    };
    renderCard();
    await checkFile();

    expect(
      await screen.findByText(
        (_, el) =>
          el?.tagName === "P" &&
          el.textContent ===
            "Your plan covers 250 active learners a billing period. You're at 240 so far this period, including learners reached through dispatch. Imported learners count only in a period they open a course, so nothing changes until they do.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("leaves out the dispatch clause when no dispatch learners are counted", async () => {
    previewBody.capacity = { ...previewBody.capacity, metered: true, cap: 250, active: 240 };
    renderCard();
    await checkFile();

    expect(
      await screen.findByText(
        (_, el) =>
          el?.tagName === "P" &&
          el.textContent?.startsWith(
            "Your plan covers 250 active learners a billing period. You're at 240 so far this period. Imported",
          ) === true,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/reached through dispatch/)).not.toBeInTheDocument();
  });

  it("warns, without blocking, when the file could carry the plan over its cap", async () => {
    previewBody.capacity = { ...previewBody.capacity, metered: true, cap: 250, active: 249 };
    renderCard();
    await checkFile();

    expect(await screen.findByRole("status")).toHaveTextContent(
      "If everyone in this file opens a course this period, you'd be over your plan's cap. Nothing is blocked. How the cap works",
    );
    expect(screen.getByRole("link", { name: "How the cap works" })).toHaveAttribute(
      "href",
      "/billing",
    );
    expect(screen.getByRole("button", { name: "Import 2 learners" })).toBeEnabled();
  });

  it("does not warn when the file lands exactly on the cap", async () => {
    previewBody.capacity = { ...previewBody.capacity, metered: true, cap: 250, active: 248 };
    renderCard();
    await checkFile();

    expect(await screen.findByText(/Your plan covers/)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
