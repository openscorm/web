import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { RegisterPage } from "@/routes/RegisterPage";
import { slugify } from "@/lib/slug";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// The signup form had no Terms acceptance step, which undercut every
// agreed-at-signup mechanism (self-serve DPA, ToS billing clause). The fix is
// the by-clicking pattern: a line beside the create button naming both legal
// pages, and the click itself is the acceptance, carried to the server as
// termsAccepted: true. Both halves are pinned here because either can fail
// silently: the line can vanish in a layout pass, and the flag can drop out
// of the body in a refactor of the mutation, and signup keeps working either way.
describe("RegisterPage terms acceptance", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/auth/register")) return Promise.resolve(json({}));
        if (url.endsWith("/api/auth/me")) return Promise.resolve(json({}));
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the by-clicking line with links to the live Terms and Privacy pages", () => {
    renderPage();

    expect(screen.getByText(/by creating an account, you agree to our/i)).toBeInTheDocument();
    // The CASL notice rides the same build, at the email-capture point.
    expect(screen.getByText(/we'll send account and product emails/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute(
      "href",
      "https://www.openscorm.com/terms",
    );
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "https://www.openscorm.com/privacy",
    );
  });

  it("sends termsAccepted: true with the register call", async () => {
    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/organization name/i), "Acme Training");
    await user.type(screen.getByLabelText(/your name/i), "Dan");
    await user.type(screen.getByLabelText(/^email$/i), "alex@acme.test");
    await user.type(screen.getByLabelText(/^password$/i), "correct horse battery");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    const fetchMock = vi.mocked(fetch);
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/api/auth/register"))).toBe(
        true,
      );
    });

    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/api/auth/register"));
    const body = JSON.parse(String((call?.[1] as RequestInit).body)) as {
      termsAccepted?: boolean;
    };
    expect(body.termsAccepted).toBe(true);
  });
});

// AI assistants became a larger referrer than LinkedIn in GA4 while the
// select had no value for them, so those signups landed in Other or blank. The
// option carries the server's stored token, not the display label, and the
// four original options stay as they were so the historical data compares.
describe("RegisterPage signup source", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/auth/register")) return Promise.resolve(json({}));
        if (url.endsWith("/api/auth/me")) return Promise.resolve(json({}));
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers the original four sources plus AI assistant, with stored tokens as values", () => {
    renderPage();

    const options = screen
      .getAllByRole("option")
      .filter((o) => (o as HTMLOptionElement).value !== "")
      .map((o) => [(o as HTMLOptionElement).value, o.textContent]);
    expect(options).toEqual([
      ["LinkedIn", "LinkedIn"],
      ["Search", "Search engine"],
      ["Referral", "Referral"],
      ["AIAssistant", "AI assistant (ChatGPT, Claude, Gemini, other)"],
      ["Other", "Other"],
    ]);
  });

  it("sends the AI assistant token as source with the register call", async () => {
    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/organization name/i), "Acme Training");
    await user.type(screen.getByLabelText(/your name/i), "Dan");
    await user.type(screen.getByLabelText(/^email$/i), "alex@acme.test");
    await user.type(screen.getByLabelText(/^password$/i), "correct horse battery");
    await user.selectOptions(screen.getByLabelText(/how did you hear about us/i), "AIAssistant");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    const fetchMock = vi.mocked(fetch);
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/api/auth/register"))).toBe(
        true,
      );
    });

    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/api/auth/register"));
    const body = JSON.parse(String((call?.[1] as RequestInit).body)) as { source?: string };
    expect(body.source).toBe("AIAssistant");
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Acme Training Ltd")).toBe("acme-training-ltd");
  });

  it("collapses punctuation runs and trims hyphens", () => {
    expect(slugify("  Bob's -- Burgers! ")).toBe("bob-s-burgers");
  });

  it("caps at 30 characters without a trailing hyphen", () => {
    const slug = slugify("a".repeat(28) + " zz");
    expect(slug.length).toBeLessThanOrEqual(30);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("RegisterPage portal name auto-fill", () => {
  it("fills portal name from organization name", async () => {
    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/organization name/i), "Acme Training Ltd");

    expect(screen.getByLabelText(/portal name/i)).toHaveValue("acme-training-ltd");
    expect(screen.getByText("Your links will include /acme-training-ltd")).toBeInTheDocument();
  });

  it("stops auto-filling once the user edits the portal name", async () => {
    renderPage();
    const user = userEvent.setup();
    const portal = screen.getByLabelText(/portal name/i);

    await user.type(screen.getByLabelText(/organization name/i), "Acme");
    await user.clear(portal);
    await user.type(portal, "custom-name");
    await user.type(screen.getByLabelText(/organization name/i), " Training");

    expect(portal).toHaveValue("custom-name");
  });

  it("resumes auto-filling when the portal name is cleared", async () => {
    renderPage();
    const user = userEvent.setup();
    const portal = screen.getByLabelText(/portal name/i);

    await user.type(screen.getByLabelText(/organization name/i), "Acme");
    await user.type(portal, "x");
    await user.clear(portal);
    await user.type(screen.getByLabelText(/organization name/i), " Training");

    expect(portal).toHaveValue("acme-training");
  });
});
