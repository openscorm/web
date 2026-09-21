import { Skeleton } from "@/components/ui/skeleton";

// Content-only loading placeholder, dropped in below a PageHeader in place of a
// bare "Loading…" line. Ported in shape from a sibling application; openscorm has
// no PageContainer, so this renders just the card skeletons and the caller keeps
// its own AppShell + PageHeader.
export function PageLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
