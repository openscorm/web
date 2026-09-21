import { Navigate, useLocation } from "react-router-dom";

// Redirect to /billing that carries the query string and hash through, unlike a
// bare <Navigate to="/billing">, which would drop ?checkout=success and lose the
// post-checkout banner. Serves the legacy /pricing path now that
// /billing the canonical plan route.
export function RedirectToBilling() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: "/billing", search, hash }} replace />;
}
