import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TenantWebhookCard } from "@/components/TenantWebhookCard";
import type { MeResponse, TenantWebhook } from "@/lib/types";

// The card creates the receiver and shows the secret once,
// changes the URL without a secret, rotates through a two-step control and
// shows the new secret once, queues a test event, and removes through a
// two-step control. The one-time secret panel is the behaviour that must not
// drift: it is the only moment the secret exists on a screen.

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

function json(body: unknown, status = 200) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { "content-type": "application/json" },
  });
}

function hook(url: string, secret?: string): TenantWebhook {
  return {
    url,
    secretPrefix: "whsec_abc123",
    secret: secret ?? null,
    createdAt: "2026-09-06T14:32:00Z",
    updatedAt: "2026-09-06T14:32:00Z",
    secretRotatedAt: "2026-09-06T14:32:00Z",
    lastDeliveryAt: null,
    lastDeliveryStatus: null,
    lastDeliveryError: null,
  };
}

let current: TenantWebhook | null;
let calls: { method: string; url: string; body?: string }[];

beforeEach(() => {
  current = null;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const base = "/api/tenants/7/webhook";
      calls.push({ method, url, body: init?.body ? String(init.body) : undefined });
      if (url.endsWith(base) && method === "GET")
        return Promise.resolve(current ? json(current) : json(undefined, 204));
      if (url.endsWith(base) && method === "PUT") {
        const { url: nextUrl } = JSON.parse(String(init?.body)) as { url: string };
        const created = current === null;
        current = hook(nextUrl);
        return Promise.resolve(
          json({ ...current, secret: created ? "whsec_NEWSECRET" : null }, created ? 201 : 200),
        );
      }
      if (url.endsWith(`${base}/rotate`)) {
        current = { ...current!, secretPrefix: "whsec_rotate" };
        return Promise.resolve(json({ ...current, secret: "whsec_ROTATED" }));
      }
      if (url.endsWith(`${base}/test`)) return Promise.resolve(json({ message: "queued" }, 202));
      if (url.endsWith(base) && method === "DELETE") {
        current = null;
        return Promise.resolve(json(undefined, 204));
      }
      return Promise.reject(new Error(`unexpected fetch: ${method} ${url}`));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TenantWebhookCard user={manager} />
    </QueryClientProvider>,
  );
}

describe("TenantWebhookCard", () => {
  it("creates the receiver and shows the secret exactly once", async () => {
    renderCard();
    const user = userEvent.setup();

    await user.type(
      await screen.findByLabelText(/receiver url/i),
      "https://lms.example.test/hooks",
    );
    await user.click(screen.getByRole("button", { name: /create webhook/i }));

    expect(await screen.findByTestId("webhook-secret")).toHaveTextContent("whsec_NEWSECRET");
    expect(screen.getByText(/shown only once/i)).toBeInTheDocument();
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.body).toBe(JSON.stringify({ url: "https://lms.example.test/hooks" }));

    await user.click(screen.getByRole("button", { name: /^done$/i }));
    expect(screen.queryByTestId("webhook-secret")).not.toBeInTheDocument();
    expect(await screen.findByText("https://lms.example.test/hooks")).toBeInTheDocument();
  });

  it("changing the URL keeps the secret and shows none", async () => {
    current = hook("https://a.test/h");
    renderCard();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /change url/i }));
    const input = screen.getByLabelText(/receiver url/i);
    await user.clear(input);
    await user.type(input, "https://b.test/h");
    await user.click(screen.getByRole("button", { name: /save url/i }));

    expect(await screen.findByText("https://b.test/h")).toBeInTheDocument();
    expect(screen.queryByTestId("webhook-secret")).not.toBeInTheDocument();
  });

  it("rotates through a two-step control and shows the new secret once", async () => {
    current = hook("https://a.test/h");
    renderCard();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /rotate secret/i }));
    expect(calls.some((c) => c.url.endsWith("/rotate"))).toBe(false);
    await user.click(screen.getByRole("button", { name: /^rotate secret$/i, hidden: false }));

    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/rotate"))).toBe(true));
    expect(await screen.findByTestId("webhook-secret")).toHaveTextContent("whsec_ROTATED");
  });

  it("queues a test event and says so", async () => {
    current = hook("https://a.test/h");
    renderCard();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /send test event/i }));

    await waitFor(() =>
      expect(calls.some((c) => c.url.endsWith("/test") && c.method === "POST")).toBe(true),
    );
    expect(await screen.findByTestId("webhook-delivery")).toHaveTextContent(/test event queued/i);
  });

  it("removes through a two-step control", async () => {
    current = hook("https://a.test/h");
    renderCard();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /^remove$/i }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    await user.click(screen.getByRole("button", { name: /remove webhook/i }));

    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    expect(await screen.findByLabelText(/receiver url/i)).toBeInTheDocument();
  });
});
