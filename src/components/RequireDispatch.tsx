import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { DispatchLockedPage } from "@/routes/DispatchLockedPage";

// Route guard for the dispatch console. Composes with
// RequireManager rather than replacing it: RequireManager answers "may this
// account use manager surfaces", this answers "does dispatch serve this
// tenant, and in which state". Hiding the nav item alone would leave
// /dispatch reachable by typing it, and the harm being prevented is package
// generation, not menu clutter.
//
// Three outcomes, matching the server (DispatchAccess.Resolve):
//   gated (Free tenant)       -> the locked upgrade explainer, not the console
//   enabled (paid/operator)   -> the real console children
//   neither (kill switch off) -> the dashboard; the feature is not meant to be
//                                discoverable where it is switched off, and the
//                                API returns 404 on the same condition.
export function RequireDispatch({ children }: { children: ReactNode }) {
  const { user, loading, fetching } = useAuth();

  // Same hold-on-fetching reasoning as RequireManager: a cached null from an
  // earlier signed-out visit would otherwise bounce a legitimate visit.
  if (loading || (fetching && !user)) {
    return (
      <div className="text-muted-foreground flex min-h-screen items-center justify-center">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.dispatchGated) return <DispatchLockedPage />;
  if (!user.dispatchEnabled) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
