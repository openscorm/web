import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { FileDropzone } from "@/components/ui/file-dropzone";

// Upload-on-select with no second click is the requirement, so the contract that
// matters is that choosing a file and dropping a file both reach the caller by
// themselves. The disabled case is here because the Library card uses it as the
// at-capacity state, where handing back a File would start an upload the server
// is going to refuse.

const LABEL = "Upload a SCORM package";

function zip(name = "course.zip") {
  return new File(["x"], name, { type: "application/zip" });
}

function fileInput(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("dropzone rendered no file input");
  return input;
}

describe("FileDropzone", () => {
  it("hands the caller the file as soon as one is chosen", () => {
    const onFile = vi.fn();
    const { container } = render(<FileDropzone label={LABEL} onFile={onFile} />);

    const file = zip();
    fireEvent.change(fileInput(container), { target: { files: [file] } });

    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile.mock.calls[0][0].name).toBe("course.zip");
  });

  it("hands the caller the file when one is dropped", () => {
    const onFile = vi.fn();
    render(<FileDropzone label={LABEL} onFile={onFile} />);

    fireEvent.drop(screen.getByRole("button", { name: LABEL }), {
      dataTransfer: { files: [zip("dropped.zip")] },
    });

    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile.mock.calls[0][0].name).toBe("dropped.zip");
  });

  it("stays silent when disabled, on both paths", () => {
    const onFile = vi.fn();
    const { container } = render(<FileDropzone label={LABEL} onFile={onFile} disabled />);

    fireEvent.change(fileInput(container), { target: { files: [zip()] } });
    fireEvent.drop(screen.getByRole("button", { name: LABEL }), {
      dataTransfer: { files: [zip()] },
    });

    expect(onFile).not.toHaveBeenCalled();
  });

  it("is reachable by keyboard", () => {
    const { container } = render(<FileDropzone label={LABEL} onFile={vi.fn()} />);
    const input = fileInput(container);
    const click = vi.spyOn(input, "click");

    fireEvent.keyDown(screen.getByRole("button", { name: LABEL }), { key: "Enter" });

    expect(click).toHaveBeenCalled();
  });

  it("shows the hint and takes its accessible name from the label", () => {
    render(<FileDropzone label={LABEL} onFile={vi.fn()} hint="Drop a .zip here" />);

    expect(screen.getByRole("button", { name: LABEL })).toBeInTheDocument();
    expect(screen.getByText("Drop a .zip here")).toBeInTheDocument();
  });
});
