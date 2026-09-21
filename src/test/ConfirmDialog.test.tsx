import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// The point of this component is that a destructive action is confirmed
// in the app rather than by window.confirm, which blocks the renderer and can be
// neither styled nor driven. The guards below are the properties that make it a
// replacement: it asks before acting, the escape and the outcome are both
// reachable, and the outcome button is the one that fires onConfirm.

function setup(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title={'Delete "Fire safety"?'}
      description="This removes the package and all learner progress. It cannot be undone."
      confirmLabel="Delete course"
      busyLabel="Deleting…"
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { onConfirm, onOpenChange };
}

describe("ConfirmDialog", () => {
  it("names the target and states that the action cannot be undone", () => {
    setup();

    expect(screen.getByRole("heading", { name: 'Delete "Fire safety"?' })).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });

  it("fires onConfirm only from the outcome button", async () => {
    const { onConfirm, onOpenChange } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);

    await userEvent.click(screen.getByRole("button", { name: "Delete course" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows the busy label and refuses a second click while the action runs", async () => {
    const { onConfirm } = setup({ busy: true });

    const confirm = screen.getByRole("button", { name: "Deleting…" });
    expect(confirm).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    await userEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("styles the outcome as destructive by default and plainly when told to", () => {
    const { unmount } = render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Delete course?"
        confirmLabel="Delete course"
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Delete course" }).className).toContain("bg-danger");
    unmount();

    // A revision publish retires the previous version but destroys nothing, so
    // it asks for confirmation without borrowing the delete styling.
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Publish version 2?"
        confirmLabel="Publish revision"
        tone="default"
        onConfirm={() => {}}
      />,
    );
    const publish = screen.getByRole("button", { name: "Publish revision" });
    expect(publish.className).toContain("bg-primary");
    expect(publish.className).not.toContain("bg-danger");
  });

  it("renders nothing when closed", () => {
    setup({ open: false });

    expect(screen.queryByRole("button", { name: "Delete course" })).not.toBeInTheDocument();
  });
});
