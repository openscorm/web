import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api";

// A 401 from any call means the session may have ended under the page: the
// API's 60-minute sliding expiry passed while the tab sat open, or the account
// signed out in another tab. The cached /me never hears about that, because
// its staleTime is Infinity. A Free manager left a tab open for two days, then
// pressed Upgrade on the locked Dispatch page: the page still acted signed in
// and answered the refused Checkout with "No active session." and no way to
// sign in again (Bump problem 384).
//
// The fix asks /me again rather than clearing it. Some 401s are not about the
// session, such as a wrong password, and only /me knows. If the session is
// gone, /me answers null and the route guard sends the person to sign in with
// the page in ?next=, so they come back to where they were. If the session is
// still alive, nothing changes. useAuth turns a 401 from /me into null rather
// than an error, so this cannot loop on its own answer.
function recheckSession(client: QueryClient, err: unknown): void {
  if (err instanceof ApiError && err.status === 401) {
    void client.invalidateQueries({ queryKey: ["auth", "me"] });
  }
}

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (err) => recheckSession(client, err) }),
    mutationCache: new MutationCache({ onError: (err) => recheckSession(client, err) }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
  return client;
}

export const queryClient = createQueryClient();
