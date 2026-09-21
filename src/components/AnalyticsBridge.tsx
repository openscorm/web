import { useEffect } from "react";

import { useAuth } from "@/hooks/useAuth";
import { applyAnalyticsUser } from "@/lib/analytics";

// Hands the analytics identity to one place. useAuth is a shared react-query
// hook many components call; putting the hand-off here (rather than inside the
// hook) fires it once per identity change, not once per consumer. The mode
// decision itself (off / anonymous / identified) lives in analytics.ts.
export function AnalyticsBridge() {
  const { user } = useAuth();
  useEffect(() => {
    // undefined is "still loading"; null is a resolved signed-out visit.
    if (user !== undefined) applyAnalyticsUser(user);
  }, [user]);
  return null;
}
