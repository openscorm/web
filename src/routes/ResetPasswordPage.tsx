import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { ProblemResponse } from "@/lib/types";
import { LobbyLayout } from "@/components/LobbyLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { PasswordInput } from "@/components/PasswordInput";

const schema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirm: z.string().min(1, "Confirm your password."),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Passwords do not match.",
  });

type FormValues = z.infer<typeof schema>;

// The same page serves two links. A reset is asked for by someone who had a
// password; a welcome is the invitation a learner gets when a manager adds
// them, and they have never had one. Same token, same endpoint, different words.
//
// A link that ran out answers 410 and gets its own state, so the person is
// offered a new link rather than told to try again. The welcome words are
// Product's; the reset ones follow the same pattern.
const COPY = {
  reset: {
    pageTitle: "Reset your password | OpenSCORM",
    invalidTitle: "Invalid reset link",
    invalidBody: "The link is missing required information. Start over.",
    invalidAction: "Request a new link",
    expiredTitle: "This reset link has expired",
    expiredBody: "Request a new one and we'll email it to you.",
    expiredAction: "Request a new link",
    replacedTitle: "This reset link has been replaced",
    replacedBody:
      "A newer link was sent to you. Use the one in the most recent email, or request a new one.",
    usedTitle: "This reset link has already been used",
    usedBody: "Your password was changed with it. Sign in with your new password.",
    heading: "Set new password",
    intro: null,
    done: "Password updated. Sign in with your new password.",
    passwordLabel: "New password",
    submit: "Change password",
    busy: "Updating…",
    failed: "Reset failed.",
  },
  welcome: {
    pageTitle: "Set up your account | OpenSCORM",
    invalidTitle: "Invalid invitation link",
    invalidBody: "This link isn't complete. Request a new one and we'll email it to you.",
    invalidAction: "Request a password reset",
    expiredTitle: "This invitation link has expired",
    expiredBody: "Request a new one and we'll email it to you.",
    expiredAction: "Request a new link",
    replacedTitle: "This invitation link has been replaced",
    replacedBody:
      "A newer invitation was sent to you. Use the link in the most recent email, or request a new one and we'll email it to you.",
    usedTitle: "Your password is already set",
    usedBody: "This invitation has been used. Sign in to see your courses.",
    heading: "Set up your account",
    intro:
      "Your organization has added you to OpenSCORM. Choose a password to sign in and see your courses.",
    done: "Your password is set. Sign in to see your courses.",
    passwordLabel: "Choose a password",
    submit: "Set password",
    busy: "Saving…",
    failed: "Setting your password failed.",
  },
} as const;

// A link the page cannot use: missing its token, run out, or replaced by a
// newer one, where the way forward is a new link; or already used, where it is
// signing in.
function LinkProblem({
  title,
  body,
  action,
  to = "/forgot",
}: {
  title: string;
  body: string;
  action: string;
  to?: string;
}) {
  return (
    <LobbyLayout>
      <div className="bg-card text-card-foreground border-border w-full max-w-md rounded-xl border p-8 shadow-sm">
        <h1 className="mb-2 text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mb-6 text-sm">{body}</p>
        <Link to={to} className="text-link text-sm hover:underline">
          {action}
        </Link>
      </div>
    </LobbyLayout>
  );
}

// What the server says the link is when the page loads.
type LinkState = "valid" | "invalid" | "expired" | "replaced" | "used";

// The reset URL is emailed as
//   https://app.openscorm.com/reset?token=<id>.<secret>
// One opaque value: the server finds the reset request by the id and takes the
// account from it, so the link carries no login and no email. A link sent
// before that change reads ?username=<login>&email=<email>&token=<secret>; it
// still works until it expires, two hours after it was sent, so those two
// values are passed along when present and ignored when not.
export function ResetPasswordPage({ variant = "reset" }: { variant?: "reset" | "welcome" }) {
  const copy = COPY[variant];
  usePageTitle(copy.pageTitle);
  const [search] = useSearchParams();
  const email = search.get("email") ?? "";
  const login = search.get("username") ?? "";
  const token = search.get("token") ?? "";
  const nav = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [done, setDone] = useState(false);

  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  // Checked as the page loads, so a link that ran out or was replaced by a
  // resent invitation says so before anyone types a password into it. The
  // form shows meanwhile, and stays if the check itself fails: submitting
  // still checks the link. An older link carrying its login and email
  // expired long ago and is not checked.
  const legacy = !!(email && login);
  const check = useQuery({
    queryKey: ["reset-link", token],
    queryFn: () =>
      api<{ state?: LinkState } | null>("/api/auth/password-reset/check", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    enabled: !!token && !legacy,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const linkState = done ? "valid" : check.data?.state;

  const complete = useMutation({
    mutationFn: async (values: FormValues) =>
      api<void>("/api/auth/password-reset/complete", {
        method: "POST",
        body: JSON.stringify(
          email && login
            ? { email, login, token, password: values.password }
            : { token, password: values.password },
        ),
      }),
    onSuccess: () => setDone(true),
    onError: (err) => {
      if (err instanceof ApiError && err.status === 410) {
        setExpired(true);
      } else if (err instanceof ApiError && err.problem) {
        const problem = err.problem as ProblemResponse;
        setServerError(problem.detail ?? problem.title ?? copy.failed);
      } else {
        setServerError(`${copy.failed} Please try again.`);
      }
    },
  });

  if (!token) {
    return (
      <LinkProblem title={copy.invalidTitle} body={copy.invalidBody} action={copy.invalidAction} />
    );
  }

  if (expired || linkState === "expired") {
    return (
      <LinkProblem title={copy.expiredTitle} body={copy.expiredBody} action={copy.expiredAction} />
    );
  }

  if (linkState === "replaced") {
    return (
      <LinkProblem
        title={copy.replacedTitle}
        body={copy.replacedBody}
        action={copy.expiredAction}
      />
    );
  }

  if (linkState === "used") {
    return (
      <LinkProblem title={copy.usedTitle} body={copy.usedBody} action="Go to sign in" to="/login" />
    );
  }

  if (linkState === "invalid") {
    return (
      <LinkProblem title={copy.invalidTitle} body={copy.invalidBody} action={copy.invalidAction} />
    );
  }

  const intro = done ? null : copy.intro;

  return (
    <LobbyLayout>
      <div className="bg-card text-card-foreground border-border w-full max-w-md rounded-xl border p-8 shadow-sm">
        <h1 className={cn("text-3xl font-bold tracking-tight", intro ? "mb-2" : "mb-6")}>
          {copy.heading}
        </h1>
        {intro && <p className="text-muted-foreground mb-6 text-sm">{intro}</p>}

        {done ? (
          <>
            <div className="mb-6 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
              {copy.done}
            </div>
            <div className="grid">
              <button
                type="button"
                onClick={() => nav("/login")}
                className="bg-primary inline-flex items-center justify-center rounded-full px-6 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-[color:var(--color-primary-hover)] focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 focus-visible:outline-none md:px-8"
              >
                Go to sign in
              </button>
            </div>
          </>
        ) : (
          <>
            {serverError && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              >
                {serverError}
              </div>
            )}

            <form
              onSubmit={handleSubmit((values) => {
                setServerError(null);
                complete.mutate(values);
              })}
              noValidate
            >
              {email && (
                <div className="mb-4">
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    readOnly
                    className="bg-muted text-muted-foreground block w-full rounded-lg border border-[color:var(--color-input-border)] px-4 py-3 text-[15px]"
                  />
                </div>
              )}

              <div className="mb-4">
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
                  {copy.passwordLabel}
                </label>
                <PasswordInput
                  id="password"
                  autoComplete="new-password"
                  autoFocus
                  className="bg-background text-foreground focus:border-primary block w-full rounded-lg border border-[color:var(--color-input-border)] px-4 py-3 text-[15px] transition-colors focus:ring-2 focus:ring-[color:var(--color-input-focus-ring)] focus:outline-none"
                  {...register("password")}
                />
                {formState.errors.password && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {formState.errors.password.message}
                  </p>
                )}
              </div>

              <div className="mb-6">
                <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium">
                  Confirm password
                </label>
                <PasswordInput
                  id="confirm"
                  autoComplete="new-password"
                  className="bg-background text-foreground focus:border-primary block w-full rounded-lg border border-[color:var(--color-input-border)] px-4 py-3 text-[15px] transition-colors focus:ring-2 focus:ring-[color:var(--color-input-focus-ring)] focus:outline-none"
                  {...register("confirm")}
                />
                {formState.errors.confirm && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {formState.errors.confirm.message}
                  </p>
                )}
              </div>

              <div className="grid">
                <button
                  type="submit"
                  disabled={complete.isPending}
                  className="bg-primary inline-flex items-center justify-center rounded-full px-6 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-[color:var(--color-primary-hover)] focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 md:px-8"
                >
                  {complete.isPending ? copy.busy : copy.submit}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </LobbyLayout>
  );
}
