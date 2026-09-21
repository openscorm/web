import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import "@fontsource-variable/inter";
import { router } from "./router";
import { queryClient } from "./lib/queryClient";
import { api } from "./lib/api";
import type { PublicConfig } from "./lib/types";
import { AnalyticsBridge } from "./components/AnalyticsBridge";
import { configureAnalytics, capturePageview } from "./lib/analytics";
import "./styles/globals.css";

// Analytics config is served at runtime so the PostHog key is an
// deployment variable, not a build-time bake. Fetch it and hand it over; the app
// renders immediately regardless of this fetch. Nothing is captured until
// AnalyticsBridge has seen who the visitor is: the first pageview
// fires when the mode is decided, and route changes after that fire here.
router.subscribe(() => capturePageview(window.location.href));
void (async () => {
  try {
    const cfg = await api<PublicConfig>("/api/public/config");
    configureAnalytics({ key: cfg.posthogKey, host: cfg.posthogHost, uiHost: cfg.posthogUiHost });
  } catch {
    // Analytics stays inert if config cannot be fetched.
  }
})();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AnalyticsBridge />
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
