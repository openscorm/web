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
  });
  // fetching is exposed separately from loading because a signed-out visit
  // caches null, and null counts as data: isLoading goes false while a
  // refetch is still in flight. Route guards need to hold their redirect
  // over that window or they bounce a just-signed-in account back to the
  // login page. See RequireManager.
  return { user: q.data, loading: q.isLoading, fetching: q.isFetching, refetch: q.refetch };
}
