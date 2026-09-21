import { CircleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Content-only error state, dropped in below a PageHeader in place of a bare red
// error line. Ported in shape from a sibling application (lucide icon rather
// than Font Awesome, no PageContainer wrapper). onRetry adds a "Try again" button,
// omitted for states a refetch cannot fix (e.g. not-found).
export function PageError({
  message = "Something went wrong. Try again in a moment.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="flex items-center gap-3 p-4 text-sm">
      <CircleAlert className="text-danger h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="text-muted-foreground">{message}</span>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} className="ml-auto">
          Try again
        </Button>
      )}
    </Card>
  );
}
