import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { api, ApiError } from "@/lib/api";
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
const COPY = {
  reset: {
    pageTitle: "Reset your password | OpenSCORM",
    invalidTitle: "Invalid reset link",
    invalidAction: "Request a new link",
    heading: "Set new password",
    done: "Password updated. Sign in with your new password.",
    passwordLabel: "New password",
    submit: "Change password",
    busy: "Updating…",
    failed: "Reset failed.",
  },
  welcome: {
    pageTitle: "Set up your account | OpenSCORM",
    invalidTitle: "Invalid invitation link",
    invalidAction: "Request a password reset",
    heading: "Set up your account",
    done: "Your password is set. Sign in to see your courses.",
    passwordLabel: "Choose a password",
    submit: "Set password",
    busy: "Saving…",
    failed: "Setting your password failed.",
  },
} as const;

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
  const [done, setDone] = useState(false);

  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

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
      if (err instanceof ApiError && err.problem) {
        const problem = err.problem as ProblemResponse;
        setServerError(problem.detail ?? problem.title ?? copy.failed);
      } else {
        setServerError(`${copy.failed} Please try again.`);
      }
    },
  });

  if (!token) {
    return (
      <LobbyLayout>
        <div className="bg-card text-card-foreground border-border w-full max-w-md rounded-xl border p-8 shadow-sm">
          <h1 className="mb-2 text-2xl font-bold tracking-tight">{copy.invalidTitle}</h1>
          <p className="text-muted-foreground mb-6 text-sm">
            The link is missing required information. Start over.
          </p>
          <Link to="/forgot" className="text-link text-sm hover:underline">
            {copy.invalidAction}
          </Link>
        </div>
      </LobbyLayout>
    );
  }

  return (
    <LobbyLayout>
      <div className="bg-card text-card-foreground border-border w-full max-w-md rounded-xl border p-8 shadow-sm">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">{copy.heading}</h1>

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
