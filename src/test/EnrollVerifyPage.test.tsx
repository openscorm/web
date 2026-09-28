import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { EnrollVerifyPage } from "@/routes/EnrollVerifyPage";

// The emailed sign-in link lands here. A good token opens the course the link
// was sent for; a bad one says so and does not leave the page spinning. It
// posts exactly once, because every post issues a session.

let verifyStatus = 200;
let posts = 0;

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": status === 200 ? "application/json" : "application/problem+json",
    },
  });
}

beforeEach(() => {
  verifyStatus = 200;
  posts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/public/enroll/verify")) {
        posts += 1;
        return Promise.resolve(
          verifyStatus === 200
            ? reply(200, { courseKey: 23, email: "new@acme.test" })
            : reply(400, { status: 400, title: "Sign-in link not valid" }),
        );
      }
      if (url.endsWith("/api/auth/me")) return Promise.resolve(reply(200, { accountKey: 9 }));
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/enroll/verify" element={<EnrollVerifyPage />} />
          <Route path="/play/:courseKey" element={<div>Player body</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("EnrollVerifyPage", () => {
  it("opens the course the link was sent for, after one post", async () => {
    renderAt("/enroll/verify?token=link.9.23.1.sig");

    expect(await screen.findByText("Player body")).toBeInTheDocument();
    expect(posts).toBe(1);
  });

  it("says the link is no good when the server refuses it", async () => {
    verifyStatus = 400;
    renderAt("/enroll/verify?token=bad");

    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
    expect(screen.queryByText("Player body")).not.toBeInTheDocument();
  });

  it("does not post at all without a token", async () => {
    renderAt("/enroll/verify");

    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
    expect(posts).toBe(0);
  });
});
