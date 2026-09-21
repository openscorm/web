import * as React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/cn";

// The single full-width row a table shows instead of data: loading, empty, or
// error. Replaces the hand-typed `<tr><td colSpan={N} className="… text-center">`
// that was retyped in every list and detail table.
export function TableStateRow({
  colSpan,
  tone = "muted",
  children,
}: {
  colSpan: number;
  tone?: "muted" | "danger";
  children: React.ReactNode;
}) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className={cn(
          "py-6 text-center",
          tone === "danger" ? "text-danger" : "text-muted-foreground",
        )}
      >
        {children}
      </TableCell>
    </TableRow>
  );
}
