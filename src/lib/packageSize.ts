// The plan's package ceiling as the Library pre-check reads
// it: refuse an oversized file before anyone waits through the upload to be
// refused by the server (CoursesController answers 413 with the same words).
export interface PackageLimit {
  tenantType: string;
  packageLimitMb: number;
}

export const PAID_PACKAGE_LIMIT_MB = 800;

// Null when the file fits, else the sentence the server would answer.
export function packageTooLarge(sizeBytes: number, limit: PackageLimit | undefined): string | null {
  if (!limit || !limit.packageLimitMb) return null;
  if (sizeBytes <= limit.packageLimitMb * 1024 * 1024) return null;
  const sizeMb = Math.round(sizeBytes / 1024 / 1024);
  const free = limit.tenantType.toLowerCase() === "trial";
  return free
    ? `This package is ${sizeMb} MB and the Free plan accepts packages up to ${limit.packageLimitMb} MB. Upgrade to Mini for packages up to ${PAID_PACKAGE_LIMIT_MB} MB, or split the course into smaller packages.`
    : `This package is ${sizeMb} MB and packages are limited to ${limit.packageLimitMb} MB. Split the course into smaller packages.`;
}
