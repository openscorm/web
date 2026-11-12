import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ForgotPasswordPage } from "@/routes/ForgotPasswordPage";

// The form's messages come from its zod schema through the react-hook-form
// resolver, so this pins them across a zod or resolver upgrade: an empty or
// malformed address is refused on the page with the schema's own words, and
// nothing is sent.

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ message: "If that email is registered, a reset link is on the way." }),
        {
          status: 202,
          headers: { "content-type": "application/json" },
        },
      ),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/forgot"]}>
        <ForgotPasswordPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ForgotPasswordPage", () => {
  it("asks for an email when the field is empty and sends nothing", async () => {
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText("Email is required.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a malformed address and sends nothing", async () => {
    renderPage();

    await userEvent.type(screen.getByLabelText("Email"), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText("Enter a valid email.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a well-formed address", async () => {
    renderPage();

    await userEvent.type(screen.getByLabelText("Email"), "ann.o'neil+training@acme.test");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(
      await screen.findByText("If that email is registered, a reset link is on the way."),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
