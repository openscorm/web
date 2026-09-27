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
let previewBody: ImportResponse;

beforeEach(() => {
  calls = [];
  previewBody = {
    capacity: { limited: false, metered: false, headroom: null, ready: 2, overBy: 0 },
    counts: counts({ ready: 2, invalid: 1, existing: 1 }),
    rows,
    resultsCsv: null,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      const json = (body: unknown) =>
        Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      if (url.endsWith("/accounts/import/preview")) return json(previewBody);
      if (url.endsWith("/accounts/import")) {
        return json({
          ...previewBody,
          counts: counts({ created: 2, invalid: 1, existing: 1 }),
          rows: rows.map((r) => (r.status === "ready" ? { ...r, status: "created" } : r)),
          resultsCsv: "Line,First name\r\n",
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
  });

  it("says how many fit when the plan is full, and imports only those", async () => {
    previewBody.capacity = { limited: true, metered: false, headroom: 1, ready: 2, overBy: 1 };
    renderCard();
    await checkFile();

    expect(await screen.findByText(/Your plan has room for 1 more learner\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upgrade your plan" })).toHaveAttribute(
      "href",
      "/billing",
    );
    expect(screen.getByRole("button", { name: "Import 1 learner" })).toBeEnabled();
  });

  it("tells a metered organization how imported learners count", async () => {
    previewBody.capacity = { limited: false, metered: true, headroom: null, ready: 2, overBy: 0 };
    renderCard();
    await checkFile();

    expect(
      await screen.findByText(/count toward your active learners in the period they first launch/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Upgrade your plan" })).not.toBeInTheDocument();
  });
});
