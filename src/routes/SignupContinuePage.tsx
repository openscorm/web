import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError, describeApiError } from "@/lib/api";
import type { MeResponse, PendingSignupState } from "@/lib/types";
import { LobbyLayout } from "@/components/LobbyLayout";
import { usePageTitle } from "@/hooks/usePageTitle";

const handlePattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const inputClass =
  "bg-background text-foreground focus:border-primary block w-full rounded-lg border border-[color:var(--color-input-border)] px-4 py-3 font-mono text-[15px] transition-colors focus:ring-2 focus:ring-[color:var(--color-input-focus-ring)] focus:outline-none";
const submitBtn =
  "bg-primary inline-flex items-center justify-center rounded-full px-6 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-[color:var(--color-primary-hover)] focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 md:px-8";

// The page the "Create my organization" link in the sign-up email opens, for
// an address that already had an account. It shows what the link would
// create and waits for a click: mail scanners open every link in a message,
// and visiting this page must not create an organization on their behalf.
export function SignupContinuePage() {
  usePageTitle("Create your organization | OpenSCORM");
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const nav = useNavigate();
  const qc = useQueryClient();
  const [handle, setHandle] = useState("");
  // Set when the create call says the portal name was taken after the page
  // loaded; the page then asks for another one.
  const [takenSinceLoad, setTakenSinceLoad] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = useQuery({
    queryKey: ["signup", "pending", token],
    queryFn: () =>
      api<PendingSignupState>("/api/auth/register/pending", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    enabled: token.length > 0,
    retry: false,
    staleTime: Infinity,
  });

  const askHandle = takenSinceLoad || pending.data?.handleTaken === true;
  const handleValid = handle.length >= 3 && handle.length <= 30 && handlePattern.test(handle);

  const create = useMutation({
    mutationFn: () =>
      api<MeResponse>("/api/auth/register/complete", {
        method: "POST",
        body: JSON.stringify({ token, tenantHandle: askHandle ? handle : undefined }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["auth", "me"], refetchType: "all" });
      nav("/dashboard", { replace: true });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) setTakenSinceLoad(true);
      setError(describeApiError(err, "We couldn't create your organization. Please try again."));
    },
  });

  const invalid = token.length === 0 || pending.isError || pending.data?.state === "invalid";

  return (
    <LobbyLayout>
      <div className="bg-card text-card-foreground border-border w-full max-w-md rounded-xl border p-8 shadow-sm">
        <h1 className="mb-4 text-3xl font-bold tracking-tight">Create your organization</h1>

        {invalid ? (
          <p className="text-muted-foreground text-sm">
            This link is invalid or has expired.{" "}
            <Link to="/register" className="text-link hover:underline">
              Sign up again
            </Link>{" "}
            to get a new one.
          </p>
        ) : !pending.data ? (
          <p className="text-muted-foreground text-sm">Checking your link…</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              create.mutate();
            }}
          >
            {error && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              >
                {error}
              </div>
            )}

            <p className="mb-4 text-[15px]">
              You're about to create <span className="font-medium">{pending.data.tenantName}</span>{" "}
              on OpenSCORM. You'll be its manager, and you'll sign in with the password you chose
              when you signed up.
            </p>

            {askHandle ? (
              <div className="mb-4">
                <label htmlFor="tenantHandle" className="mb-1.5 block text-sm font-medium">
                  Portal name
                </label>
                <p className="text-muted-foreground mb-2 text-xs">
                  <span className="font-mono">{pending.data.tenantHandle}</span> has been taken
                  since you signed up. Choose another.
                </p>
                <input
                  id="tenantHandle"
                  type="text"
                  autoComplete="off"
                  className={inputClass}
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.trim().toLowerCase())}
                />
              </div>
            ) : (
              <p className="text-muted-foreground mb-4 text-sm">
                Portal name <span className="font-mono">{pending.data.tenantHandle}</span>
              </p>
            )}

            <div className="grid">
              <button
                type="submit"
                disabled={create.isPending || (askHandle && !handleValid)}
                className={submitBtn}
              >
                {create.isPending ? "Creating…" : "Create my organization"}
              </button>
            </div>
          </form>
        )}
      </div>
    </LobbyLayout>
  );
}
