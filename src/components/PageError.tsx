import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Content-only error state, dropped in below a PageHeader in place of a bare red
// error line. Ported in shape from a sibling application (no PageContainer
// wrapper). onRetry adds a "Try again" button, omitted for states a refetch
// cannot fix (e.g. not-found).
export function PageError({
  message = "Something went wrong. Try again in a moment.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="flex items-center gap-3 p-4 text-sm">
      <i
        className="fa-sharp fa-regular fa-circle-exclamation text-danger shrink-0 text-lg"
        aria-hidden="true"
      />
      <span className="text-muted-foreground">{message}</span>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} className="ml-auto">
          Try again
        </Button>
      )}
    </Card>
  );
}
