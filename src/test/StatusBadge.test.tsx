import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { StatusBadge } from "@/components/StatusBadge";

// Badges read in sentence case on screen; the stored value stays lowercase
// for the CSV and the API.
describe("StatusBadge", () => {
  it.each([
    ["passed", "Passed"],
    ["not attempted", "Not attempted"],
    ["INCOMPLETE", "Incomplete"],
    ["launched", "Not started"],
    ["", "Unknown"],
  ])("shows %j as %s", (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
