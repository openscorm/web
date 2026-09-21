import * as React from "react";
import { cn } from "@/lib/cn";

// Shared detail-page primitives, promoted from the copies that had drifted
// across OperatorTenantDetailPage, OperatorAccountDetailPage, and
// AccountDetailPage. A DetailCard is a titled section with an optional action in
// its header (a sort control, a link); its body is usually a <dl> of Fields laid
// out on the standard responsive grid via DetailGrid.

export function DetailCard({
  title,
  action,
  className,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "border-border bg-card text-card-foreground overflow-hidden rounded-xl border",
        className,
      )}
    >
      <div className="bg-muted flex items-center justify-between gap-4 px-4 py-3">
        <h2 className="text-muted-foreground text-sm font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// The label/value pair used inside a DetailCard's <dl>. Machine identifiers
// should wrap their value in <span className="font-mono text-xs"> at the call
// site, matching the existing convention.
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

// The standard responsive field grid a DetailCard body wraps its Fields in.
export function DetailGrid({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-1 gap-x-8 gap-y-4 p-4 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </dl>
  );
}
