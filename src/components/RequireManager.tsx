import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";

export function RequireManager({ children }: { children: ReactNode }) {
  const { user, loading, fetching } = useAuth();

  // Hold on fetching as well as loading: a cached null from an earlier
  // signed-out visit leaves loading false while /me is still in flight, and
  // redirecting on that stale null is what swallowed the first Sign in click.
  if (loading || (fetching && !user)) {
    return (
      <div className="text-muted-foreground flex min-h-screen items-center justify-center">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isManager && !user.isOperator) return <Navigate to="/courses" replace />;
  return <>{children}</>;
}
