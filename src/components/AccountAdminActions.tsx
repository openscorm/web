import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// The two operator actions that reach into somebody else's account: assign a
// password, or sign in as them. Shared by the tenant account page and the
// operator console so the guards and the wording cannot drift apart; both
// surfaces address the same two endpoints.
interface AccountAdminActionsProps {
  /** Owning tenant of the target account, not the operator's own tenant. */
  tenantKey: number;
  accountKey: number;
  name: string;
  isActive: boolean;
  /** True when the TARGET holds the operator role. Both endpoints refuse those. */
  isOperator: boolean;
  /** Ran after a password is assigned, for whatever the host page caches. */
  onPasswordSet?: () => void | Promise<void>;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && typeof error.problem === "string") return error.problem;
  return fallback;
}

export function AccountAdminActions({
  tenantKey,
  accountKey,
  name,
  isActive,
  isOperator,
  onPasswordSet,
}: AccountAdminActionsProps) {
  const { user } = useAuth();

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [impersonateOpen, setImpersonateOpen] = useState(false);

  const setPasswordMutation = useMutation({
    mutationFn: async (value: string) =>
      api<void>(`/api/tenants/${tenantKey}/accounts/${accountKey}/password`, {
        method: "POST",
        body: JSON.stringify({ password: value }),
      }),
    onSuccess: async () => {
      setPasswordOpen(false);
      setPassword("");
      setRevealed(false);
      await onPasswordSet?.();
    },
  });

  // A full reload rather than a client navigation: the session cookie now
  // belongs to a different account, so every cached query in memory describes
  // the wrong person.
  //
  // The destination comes from the server, which is the only side that knows
  // the target's roles. Never send this to "/": that route redirects to /login
  // for everyone, and the login page does not check for an existing session, so
  // a working impersonated cookie renders as a sign-in form and reads as having
  // been signed out.
  const impersonate = useMutation({
    mutationFn: async () =>
      api<{ impersonating: string; redirect: string }>(`/api/auth/impersonate/${accountKey}`, {
        method: "POST",
      }),
    onSuccess: (result) => {
      window.location.href = result.redirect ?? "/courses";
    },
  });

  // Both endpoints are operator-only and both refuse an operator target, so
  // rendering either button in those cases only offers a guaranteed error.
  if (!user?.isOperator || isOperator) return null;

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPasswordOpen(true)}
          className="border-border hover:bg-muted rounded-lg border px-3 py-1.5 text-sm"
        >
          Set password
        </button>
        <button
          type="button"
          disabled={!isActive}
          onClick={() => setImpersonateOpen(true)}
          className="border-border hover:bg-muted rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Impersonate
        </button>
      </div>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set password</DialogTitle>
            <DialogDescription>
              Assigns a password for {name} immediately. They are not notified, and the change is
              recorded against your account.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium">
              New password
            </label>
            <div className="flex items-center gap-2">
              <input
                id="new-password"
                type={revealed ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-border bg-background focus:border-primary w-full rounded-lg border px-3 py-2 font-mono text-sm focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setRevealed((v) => !v)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                {revealed ? "Hide" : "Show"}
              </button>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">At least 8 characters</p>
            {setPasswordMutation.isError && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {errorMessage(setPasswordMutation.error, "Could not set the password.")}
              </p>
            )}
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setPasswordOpen(false)}
              className="border-border hover:bg-muted rounded-lg border px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={password.trim().length < 8 || setPasswordMutation.isPending}
              onClick={() => setPasswordMutation.mutate(password)}
              className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {setPasswordMutation.isPending ? "Saving…" : "Set password"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={impersonateOpen} onOpenChange={setImpersonateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Impersonate {name}?</DialogTitle>
            <DialogDescription>
              You will be signed in as this account until you stop. Anything you do is recorded
              against them, including course progress and completions, and the session is logged
              against your account from start to stop.
            </DialogDescription>
          </DialogHeader>
          {impersonate.isError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {errorMessage(impersonate.error, "Could not start impersonation.")}
            </p>
          )}
          <DialogFooter>
            <button
              type="button"
              onClick={() => setImpersonateOpen(false)}
              className="border-border hover:bg-muted rounded-lg border px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={impersonate.isPending}
              onClick={() => impersonate.mutate()}
              className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {impersonate.isPending ? "Starting…" : "Impersonate"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
