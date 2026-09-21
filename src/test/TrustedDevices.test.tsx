import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TrustedDevices } from "@/components/TrustedDevices";
import type { DevicesResponse } from "@/lib/types";

// The list shows what the server says is still trusted, marks the
// device the request came from, and revokes by key.

function json(body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let state: DevicesResponse;
let deletes: string[];

beforeEach(() => {
  state = {
    trustDays: 14,
    devices: [
      {
        deviceKey: 5,
        label: "Mozilla/5.0 (Windows NT 10.0)",
        createdAt: "2026-09-05T01:00:00Z",
        lastUsedAt: null,
        expiresAt: "2026-09-19T01:00:00Z",
        current: true,
      },
      {
        deviceKey: 6,
        label: "",
        createdAt: "2026-09-01T01:00:00Z",
        lastUsedAt: "2026-09-04T01:00:00Z",
        expiresAt: "2026-09-15T01:00:00Z",
        current: false,
      },
    ],
  };
  deletes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "DELETE") {
        deletes.push(url);
        const key = Number(url.split("/").pop());
        state = { ...state, devices: state.devices.filter((d) => d.deviceKey !== key) };
        return Promise.resolve(json(null, 204));
      }
      if (url.endsWith("/api/auth/devices")) return Promise.resolve(json(state));
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderList() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TrustedDevices />
    </QueryClientProvider>,
  );
}

describe("TrustedDevices", () => {
  it("lists devices, marks this one, and names an unlabeled browser", async () => {
    renderList();

    expect(await screen.findByText("Mozilla/5.0 (Windows NT 10.0)")).toBeInTheDocument();
    expect(screen.getByText("This device")).toBeInTheDocument();
    expect(screen.getByText("Unknown browser")).toBeInTheDocument();
    expect(screen.getByText(/skip the code for 14 days/)).toBeInTheDocument();
  });

  it("revokes by key and refreshes the list", async () => {
    renderList();
    const user = userEvent.setup();

    const buttons = await screen.findAllByRole("button", { name: "Revoke" });
    await user.click(buttons[1]);

    expect(deletes).toEqual([expect.stringContaining("/api/auth/devices/6")]);
    expect(await screen.findByText("Mozilla/5.0 (Windows NT 10.0)")).toBeInTheDocument();
    expect(screen.queryByText("Unknown browser")).not.toBeInTheDocument();
  });

  it("explains an off window instead of listing", async () => {
    state = { trustDays: 0, devices: [] };
    renderList();

    expect(await screen.findByText(/asks for a code on every sign-in/)).toBeInTheDocument();
  });
});
