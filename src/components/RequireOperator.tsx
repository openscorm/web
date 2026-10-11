import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { loginPathFor } from "@/lib/returnPath";

export function RequireOperator({ children }: { children: ReactNode }) {
  const { user, loading, fetching } = useAuth();
  const location = useLocation();

  // Same stale-null hold as RequireManager.
  if (loading || (fetching && !user)) {
    return (
      <div className="text-muted-foreground flex min-h-screen items-center justify-center">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to={loginPathFor(location)} replace />;
  if (!user.isOperator) {
    const home = user.isManager ? "/dashboard" : "/courses";
    return <Navigate to={home} replace />;
  }
  return <>{children}</>;
}
