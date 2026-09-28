import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { MeResponse } from "@/lib/types";

export function useAuth() {
  const q = useQuery<MeResponse | null>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        return await api<MeResponse>("/api/auth/me");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: Infinity,
    // An unverified account is usually verified from another tab, the one the
    // email link opens, which this cache never hears about. Asking again on
    // focus while unverified is what clears the verify banner in the tab left
    // behind. "always" because the answer is never stale by staleTime; once
    // the account reads verified this is false and focus costs nothing.
    refetchOnWindowFocus: (query) => (query.state.data?.emailVerified === false ? "always" : false),
  });
  // fetching is exposed separately from loading because a signed-out visit
  // caches null, and null counts as data: isLoading goes false while a
  // refetch is still in flight. Route guards need to hold their redirect
  // over that window or they bounce a just-signed-in account back to the
  // login page. See RequireManager.
  return { user: q.data, loading: q.isLoading, fetching: q.isFetching, refetch: q.refetch };
}
