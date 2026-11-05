import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { api, ApiError, describeApiError } from "@/lib/api";
import type {
  LoginRequest,
  MeResponse,
  OrganizationChoice,
  OrganizationChoiceItem,
} from "@/lib/types";
import { PasswordInput } from "@/components/PasswordInput";

const inputClass =
  "bg-background text-foreground focus:border-primary block w-full rounded-lg border border-[color:var(--color-input-border)] px-4 py-3 text-[15px] transition-colors focus:ring-2 focus:ring-[color:var(--color-input-focus-ring)] focus:outline-none";
const smallBtn =
  "bg-primary inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--color-primary-hover)] focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";

const ACTION: Record<OrganizationChoiceItem["access"], string> = {
  password: "Sign in",
  email: "Email me a link",
  sso: "Single sign-on",
};

// The server's problem type for a correct password that has expired.
const EXPIRED_PASSWORD_TYPE = "https://openscorm.com/errors/password-expired";

function isExpiredPassword(err: ApiError): boolean {
  return (err.problem as { type?: string } | undefined)?.type === EXPIRED_PASSWORD_TYPE;
}

interface OrganizationChooserProps {
  choice: OrganizationChoice;
  email: string;
  // The password typed on the sign-in form, tried first on whichever
  // password organization is picked, since most people use one password.
  password: string;
  // The sign-in page's own handling of a login response, so a pick that
  // needs a second factor goes through the same steps as any sign-in.
  onLoginResponse: (me: MeResponse, values: LoginRequest) => Promise<void>;
  onBack: () => void;
}

// Shown after the password checks out for an address that belongs to more
// than one organization. Nothing is signed in until the person picks: a
// password organization is signed in to by name, single sign-on starts its own
// flow, and an organization they have no password in emails them a link.
export function OrganizationChooser({
  choice,
  email,
  password,
  onLoginResponse,
  onBack,
}: OrganizationChooserProps) {
  // The password organization whose own password differs from the one typed.
  const [retryHandle, setRetryHandle] = useState<string | null>(null);
  const [retryPassword, setRetryPassword] = useState("");
  const [linkSentFor, setLinkSentFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = useMutation({
    mutationFn: (values: LoginRequest) =>
      api<MeResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: (me, values) => onLoginResponse(me, values),
    onError: (err, values) => {
      // The typed password did not open this one, so ask for its own. An
      // expired password is a different refusal: its own message says what
      // to do, and asking for another password would not help.
      if (
        err instanceof ApiError &&
        err.status === 401 &&
        !isExpiredPassword(err) &&
        values.password === password
      ) {
        setRetryHandle(values.tenantHandle ?? null);
        setRetryPassword("");
        return;
      }
      setError(describeApiError(err, "Sign in failed. Please try again."));
    },
  });

  const emailLink = useMutation({
    mutationFn: (organization: OrganizationChoiceItem) =>
      api<{ sent: boolean }>("/api/auth/login/email-link", {
        method: "POST",
        body: JSON.stringify({ token: choice.token, tenantHandle: organization.handle }),
      }),
    onSuccess: (_, organization) => setLinkSentFor(organization.name),
    onError: (err) =>
      setError(describeApiError(err, "We couldn't send the link. Please try again.")),
  });

  const pick = (organization: OrganizationChoiceItem) => {
    setError(null);
    setLinkSentFor(null);
    if (organization.access === "sso" && organization.signInUrl) {
      window.location.assign(organization.signInUrl);
      return;
    }
    if (organization.access === "email") {
      emailLink.mutate(organization);
      return;
    }
    setRetryHandle(null);
    signIn.mutate({ email, password, tenantHandle: organization.handle });
  };

  const busy = signIn.isPending || emailLink.isPending;

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Your email belongs to more than one organization. Choose the one to open.
      </p>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {linkSentFor && (
        <div
          role="status"
          className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200"
        >
          Check your inbox for a link to {linkSentFor}.
        </div>
      )}

      <ul className="divide-border border-border divide-y rounded-lg border">
        {choice.organizations.map((organization) => (
          <li key={organization.handle} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{organization.name}</p>
                <p className="text-muted-foreground truncate font-mono text-xs">
                  {organization.handle}
                </p>
              </div>
              <button
                type="button"
                className={smallBtn}
                disabled={busy}
                onClick={() => pick(organization)}
              >
                {ACTION[organization.access]}
              </button>
            </div>

            {retryHandle === organization.handle && (
              <form
                className="mt-3 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setError(null);
                  signIn.mutate({
                    email,
                    password: retryPassword,
                    tenantHandle: organization.handle,
                  });
                }}
              >
                <label
                  htmlFor={`password-${organization.handle}`}
                  className="block text-sm font-medium"
                >
                  Password for {organization.name}
                </label>
                <p className="text-muted-foreground text-xs">
                  This organization has a different password.
                </p>
                <PasswordInput
                  id={`password-${organization.handle}`}
                  autoComplete="current-password"
                  autoFocus
                  className={inputClass}
                  value={retryPassword}
                  onChange={(e) => setRetryPassword(e.target.value)}
                />
                <button type="submit" className={smallBtn} disabled={busy || !retryPassword}>
                  {signIn.isPending ? "Signing in…" : "Sign in"}
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="text-link w-full text-center text-sm hover:underline"
        onClick={onBack}
      >
        Back to sign in
      </button>
    </div>
  );
}
