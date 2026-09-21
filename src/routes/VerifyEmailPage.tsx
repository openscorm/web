import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api } from "@/lib/api";
import { LobbyLayout } from "@/components/LobbyLayout";
import { usePageTitle } from "@/hooks/usePageTitle";

// The landing page a verification link opens. Anonymous - the
// signed token is the credential - so it works whether or not the visitor is
// signed in. Idempotent on the server, so a second visit still reads as verified.
export function VerifyEmailPage() {
  usePageTitle("Verify your email | OpenSCORM");
  const [params] = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<"verifying" | "done" | "error">("verifying");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!token) {
        setStatus("error");
        return;
      }
      try {
        await api("/api/auth/email/verify", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        if (!cancelled) setStatus("done");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <LobbyLayout>
      <div className="bg-card text-card-foreground border-border w-full max-w-md rounded-xl border p-8 shadow-sm">
        <h1 className="mb-4 text-3xl font-bold tracking-tight">Email verification</h1>
        {status === "verifying" && (
          <p className="text-muted-foreground text-sm">Verifying your email…</p>
        )}
        {status === "done" && (
          <>
            <p className="mb-6 text-sm">Your email is verified. Thank you.</p>
            <Link to="/dashboard" className="text-link text-sm hover:underline">
              Continue to your dashboard
            </Link>
          </>
        )}
        {status === "error" && (
          <>
            <p className="text-muted-foreground mb-6 text-sm">
              This verification link is invalid or has expired. Sign in and resend a new one from
              the prompt at the top of the app.
            </p>
            <Link to="/login" className="text-link text-sm hover:underline">
              Go to sign in
            </Link>
          </>
        )}
      </div>
    </LobbyLayout>
  );
}
