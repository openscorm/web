import { useEffect, useRef } from "react";

import { capture } from "@/lib/analytics";

// Fire a PostHog impression event once per mount, the first
// time `when` is true. Impressions must fire at
// render, deduped per page-view, not per React re-render. The ref latches after
// the first emit, so a re-render - or a later prop change that keeps `when`
// true - does not re-emit.
export function useImpression(event: string, when: boolean, props?: Record<string, unknown>): void {
  const fired = useRef(false);
  useEffect(() => {
    if (when && !fired.current) {
      fired.current = true;
      capture(event, props);
    }
  }, [event, when, props]);
}
