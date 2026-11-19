import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { capture } from "@/lib/analytics";
import { UploadSharePanel } from "@/components/UploadSharePanel";
import { shareState, type ShareCapacity } from "@/lib/uploadShare";

// The panel hands a manager the new course's invitation link the moment an
// upload finishes. Its states must not offer a link that cannot work: a full
// Free plan refuses every new person, and an organization with links off
// refuses everyone. The copy event must never carry the link itself.

vi.mock("@/lib/analytics", () => ({ capture: vi.fn() }));

const URL_ = "https://app.openscorm.com/lobby/enroll/acme/h2s-awareness?token=TocCohWvcOeq";

const free: ShareCapacity = {
  tenantType: "Trial",
  userCount: 1,
  userLimit: 10,
  isUsersUnlimited: false,
};

let detail: { publicInvitationUrl: string; publicInvitationBlocked: boolean };

beforeEach(() => {
  detail = { publicInvitationUrl: URL_, publicInvitationBlocked: false };
  vi.mocked(capture).mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      if (!String(input).endsWith("/api/tenants/7/courses/573"))
        return Promise.reject(new Error(`unexpected fetch: ${String(input)}`));
      return Promise.resolve(
        new Response(JSON.stringify(detail), {
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

function renderPanel(capacity?: ShareCapacity) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <UploadSharePanel
          tenantKey={7}
          courseKey={573}
          title="Hydrogen Sulfide Awareness"
          manageUrl="/courses/573"
          capacity={capacity}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return screen.getByRole("status");
}

describe("UploadSharePanel", () => {
  it("shows the link, Copy and the places left on Free", async () => {
    const panel = renderPanel(free);

    expect(within(panel).getByText("Uploaded Hydrogen Sulfide Awareness")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Manage" })).toHaveAttribute(
      "href",
      "/courses/573",
    );
    expect(await within(panel).findByText(URL_)).toBeInTheDocument();
    expect(
      within(panel).getByText(
        "Share this link with your learners. You'll see their progress in Reports.",
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(within(panel).getByText("Free plan: 9 more people can join.")).toBeInTheDocument();
  });

  it("shows no places line on a paid plan, which has a people limit too", async () => {
    const panel = renderPanel({ ...free, tenantType: "Mini", userLimit: 100 });

    expect(await within(panel).findByText(URL_)).toBeInTheDocument();
    expect(within(panel).queryByText(/more .* can join/)).not.toBeInTheDocument();
  });

  it("shows no places line on a Free plan whose limits are waived", async () => {
    const panel = renderPanel({ ...free, isUsersUnlimited: true });

    expect(await within(panel).findByText(URL_)).toBeInTheDocument();
    expect(within(panel).queryByText(/more .* can join/)).not.toBeInTheDocument();
  });

  it("offers no link when the Free plan is full", async () => {
    const panel = renderPanel({ ...free, userCount: 10 });

    expect(
      await within(panel).findByText(/Your Free plan is full, so new learners can't join/),
    ).toBeInTheDocument();
    expect(within(panel).queryByText(URL_)).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Copy" })).not.toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "View plans" })).toHaveAttribute(
      "href",
      "/billing?from=library_upload",
    );
    expect(within(panel).getByRole("link", { name: "Accounts" })).toHaveAttribute(
      "href",
      "/accounts",
    );
  });

  it("points to Accounts when invitation links are off", async () => {
    detail.publicInvitationBlocked = true;
    const panel = renderPanel(free);

    expect(
      await within(panel).findByText(/Invitation links are off. Add learners on/),
    ).toBeInTheDocument();
    expect(within(panel).queryByText(URL_)).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Copy" })).not.toBeInTheDocument();
  });

  it("points to the course page when the course has no active link", async () => {
    detail.publicInvitationUrl = "";
    const panel = renderPanel(free);

    expect(
      await within(panel).findByText(/This course has no active invitation link/),
    ).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "course page" })).toHaveAttribute(
      "href",
      "/courses/573",
    );
  });

  it("reports a copy with the surface only, never the link", async () => {
    const user = userEvent.setup();
    const panel = renderPanel(free);

    await user.click(await within(panel).findByRole("button", { name: "Copy" }));

    expect(await within(panel).findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith("invitation_link_copied", { surface: "library_upload" });
  });
});

describe("shareState", () => {
  const ok = { publicInvitationUrl: URL_, publicInvitationBlocked: false };

  it("waits for the course detail before choosing a state", () => {
    expect(shareState(undefined, free)).toEqual({ kind: "pending" });
  });

  it("puts a full Free plan ahead of links being off", () => {
    expect(
      shareState({ ...ok, publicInvitationBlocked: true }, { ...free, userCount: 12 }),
    ).toEqual({ kind: "full" });
  });

  it("still offers the link while the capacity call is outstanding", () => {
    expect(shareState(ok, undefined)).toEqual({ kind: "link", url: URL_, placesLeft: null });
  });
});
