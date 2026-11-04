// The Library pre-check on a package's name. The drop zone's accept list only
// narrows the file picker, and a dropped file skips it, so without this a
// course page or a launcher would upload in full before the server refused it.
// The server still reads the file's first bytes, which is the real test, and
// answers a non-zip with the same sentence.

// Null when the name ends in .zip, else the sentence to show.
export function packageNotZip(fileName: string): string | null {
  if (fileName.trim().toLowerCase().endsWith(".zip")) return null;
  return `"${fileName}" isn't a zip file. Upload the .zip package your authoring tool exported.`;
}
