import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { EnrollResponse } from "@/lib/types";
import { LobbyLayout } from "@/components/LobbyLayout";
import { usePageTitle } from "@/hooks/usePageTitle";

// The landing page for the sign-in link an invitation emails when the
// organization requires a confirmed email. The signed token is the credential:
// the server confirms the address, signs the learner in, and names the course,
// and this page opens it. It posts once, even under a development double
// render, because each post issues a session.
export function EnrollVerifyPage() {
  usePageTitle("Confirm your email | OpenSCORM");
  const [params] = useSearchParams();
  const token = params.get("token");
  const [failed, setFailed] = useState(false);
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const posted = useRef(false);

  useEffect(() => {
    if (posted.current) return;
    posted.current = true;

    async function run() {
      if (!token) {
        setFailed(true);
        return;
      }
      try {
        const reply = await api<EnrollResponse>("/api/public/enroll/verify", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        await queryClient.invalidateQueries({ queryKey: ["auth", "me"], refetchType: "all" });
        nav(reply.courseKey ? `/play/${reply.courseKey}` : "/courses", { replace: true });
      } catch {
        setFailed(true);
      }
    }
    void run();
  }, [token, nav, queryClient]);

  return (
    <LobbyLayout>
      <div className="bg-card text-card-foreground border-border w-full max-w-md rounded-xl border p-8 shadow-sm">
        <h1 className="mb-4 text-3xl font-bold tracking-tight">Confirm your email</h1>
        {failed ? (
          <p className="text-muted-foreground text-sm">
            This sign-in link is invalid or has expired. Open your invitation link again to get a
            new one.
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">Confirming your email…</p>
        )}
      </div>
    </LobbyLayout>
  );
}
