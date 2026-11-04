import { describe, expect, it } from "vitest";

import { packageNotZip } from "@/lib/packageName";

// The Library refuses a file whose name is not a .zip before it uploads, in
// the words the server uses for a file that is not a zip.
describe("packageNotZip", () => {
  it("is quiet for a .zip in any case", () => {
    expect(packageNotZip("course.zip")).toBeNull();
    expect(packageNotZip("Course.ZIP")).toBeNull();
    expect(packageNotZip("course.zip ")).toBeNull();
  });

  it("names the file and asks for the exported .zip", () => {
    expect(packageNotZip("scormlauncher.html")).toBe(
      '"scormlauncher.html" isn\'t a zip file. Upload the .zip package your authoring tool exported.',
    );
  });

  it("refuses a name with no extension or a zip-like one", () => {
    expect(packageNotZip("vw-622")).not.toBeNull();
    expect(packageNotZip("course.zip.html")).not.toBeNull();
    expect(packageNotZip("course.rar")).not.toBeNull();
  });
});
