import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import { api, ApiError } from "@/lib/api";
import { discoverSso, isDiscoverable } from "@/lib/sso";
import type { LoginRequest, MeResponse, MfaSetupResponse, ProblemResponse } from "@/lib/types";
import { LobbyLayout } from "@/components/LobbyLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { MfaProvisioning } from "@/components/MfaProvisioning";
import { PasswordInput } from "@/components/PasswordInput";

const schema = z.object({
  email: z.string().min(1, "Email is required.").email("Enter a valid email."),
  password: z.string().min(1, "Password is required."),
});

type FormValues = z.infer<typeof schema>;

const inputClass =
  "bg-background text-foreground focus:border-primary block w-full rounded-lg border border-[color:var(--color-input-border)] px-4 py-3 text-[15px] transition-colors focus:ring-2 focus:ring-[color:var(--color-input-focus-ring)] focus:outline-none";
const submitBtn =
  "bg-primary inline-flex items-center justify-center rounded-full px-6 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-[color:var(--color-primary-hover)] focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 md:px-8";

function problemText(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.problem) {
    const problem = err.problem as ProblemResponse;
    return problem.detail ?? problem.title ?? fallback;
  }
  return fallback;
}

export function LoginPage() {
  usePageTitle("Sign in | OpenSCORM");
  const [serverError, setServerError] = useState<string | null>(null);
  // Set once the password verifies against an MFA-enabled account: the page
  // then holds this challenge and asks for a second factor instead of a
  // session.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  // The tenant's trusted-device window, from the challenge
  // response; 0 hides the option. The choice rides on the verify call.
  const [trustDays, setTrustDays] = useState(0);
  const [trustDevice, setTrustDevice] = useState(false);
  // Set once the password verifies against an account its tenant mandates
  // MFA for and that has none yet: no session was issued, and
  // enrollment runs here, before the app, on this token alone.
  const [enrollToken, setEnrollToken] = useState<string | null>(null);
  const [setup, setSetup] = useState<MfaSetupResponse | null>(null);
  const [code, setCode] = useState("");
  // The address we have asked home realm discovery about.
  // Cleared whenever the field stops holding a usable one, because the answer
  // belongs to the domain that was asked about and a stale offer would point at
  // another organization's identity provider. It feeds a query key rather than
  // being fetched directly, so returning to the same address costs nothing.
  const [discoverEmail, setDiscoverEmail] = useState<string | null>(null);
  const nav = useNavigate();
  const qc = useQueryClient();

  const { register, handleSubmit, formState, watch } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const emailValue = watch("email");

  // Driven by the value, not by the field losing focus. Blur was the first
  // implementation and it missed the case that matters most: a password
  // manager fills the form on load, so focus never enters the email box, no
  // blur ever happens, and a returning person at a federated organization
  // never saw the button at all. Found in a real browser on test, because a
  // test types and typing always blurs eventually.
  useEffect(() => {
    const value = (emailValue ?? "").trim();

    if (!isDiscoverable(value)) {
      setDiscoverEmail(null);
      return;
    }

    // Debounced so typing an address spends one request at the pause rather
    // than one per character. The query cache absorbs the repeats after that.
    const timer = setTimeout(() => setDiscoverEmail(value), 400);
    return () => clearTimeout(timer);
  }, [emailValue]);

  // And the same case one step earlier: autofill can land before this form
  // registers the input, leaving react-hook-form holding an empty string while
  // the element itself carries an address. Read the element once on mount so
  // that ordering does not decide whether the offer appears.
  useEffect(() => {
    const element = document.getElementById("email") as HTMLInputElement | null;
    const filled = element?.value?.trim();
    if (filled && isDiscoverable(filled)) setDiscoverEmail(filled);
  }, []);

  // Deliberately silent on failure, and deliberately not retried. Discovery is
  // an improvement on the password form, not a step in it: if it errors or the
  // address is not federated there is simply no button, and the person signs in
  // the way they always could.
  const sso = useQuery({
    queryKey: ["sso", "discover", discoverEmail],
    queryFn: () => discoverSso(discoverEmail as string),
    enabled: discoverEmail !== null,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const ssoPath = sso.data?.signInPath ?? null;

  // refetchType "all" because nothing on this page observes ["auth","me"], and
  // the default "active" skips queries with no observers: the await would
  // return without refetching and the guard on the landing route would then
  // read whatever /me returned before sign-in. It also fills in tenantHandle
  // and tenantType, which the login response leaves empty.
  const finishLogin = async (me: MeResponse) => {
    await qc.invalidateQueries({ queryKey: ["auth", "me"], refetchType: "all" });
    // login_succeeded fires server-side from the login endpoint.
    nav(me.isManager || me.isOperator ? "/dashboard" : "/courses");
  };

  const beginEnrollment = useMutation({
    mutationFn: async (token: string) =>
      api<MfaSetupResponse>("/api/auth/mfa/enroll/setup", {
        method: "POST",
        body: JSON.stringify({ mfaToken: token }),
      }),
    onSuccess: (r) => setSetup(r),
    onError: (err) => setServerError(problemText(err, "Could not start two-factor setup.")),
  });

  const login = useMutation({
    mutationFn: async (values: LoginRequest) =>
      api<MeResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: async (me) => {
      if (me.mfaEnrollmentRequired && me.mfaToken) {
        setEnrollToken(me.mfaToken);
        beginEnrollment.mutate(me.mfaToken);
        return;
      }
      if (me.mfaRequired && me.mfaToken) {
        setMfaToken(me.mfaToken);
        setTrustDays(me.mfaTrustDays ?? 0);
        return;
      }
      await finishLogin(me);
    },
    onError: (err) => setServerError(problemText(err, "Sign in failed. Please try again.")),
  });

  const verify = useMutation({
    mutationFn: async () =>
      api<MeResponse>("/api/auth/mfa/verify", {
        method: "POST",
        body: JSON.stringify({ mfaToken, code, trustDevice }),
      }),
    onSuccess: async (me) => {
      await finishLogin(me);
    },
    onError: (err) => setServerError(problemText(err, "Verification failed. Please try again.")),
  });

  const completeEnrollment = useMutation({
    mutationFn: async () =>
      api<MeResponse>("/api/auth/mfa/enroll/enable", {
        method: "POST",
        body: JSON.stringify({ mfaToken: enrollToken, code }),
      }),
    onSuccess: async (me) => {
      await finishLogin(me);
    },
    onError: (err) => setServerError(problemText(err, "That code did not match.")),
  });

  const backToSignIn = () => {
    setMfaToken(null);
    setTrustDays(0);
    setTrustDevice(false);
    setEnrollToken(null);
    setSetup(null);
    setCode("");
    setServerError(null);
  };

  const heading = enrollToken
    ? "Set up two-factor authentication"
    : mfaToken
      ? "Enter your code"
      : "Sign in";

  return (
    <LobbyLayout>
      <div className="bg-card text-card-foreground border-border w-full max-w-md rounded-xl border p-8 shadow-sm">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">{heading}</h1>

        {serverError && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            {serverError}
          </div>
        )}

        {enrollToken ? (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Your organization requires two-factor authentication. Scan this with your
              authenticator app, save your recovery codes, then enter the 6-digit code it shows.
            </p>

            {setup ? (
              <MfaProvisioning setup={setup} />
            ) : (
              beginEnrollment.isPending && (
                <p className="text-muted-foreground text-sm">Preparing setup…</p>
              )
            )}

            {setup && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setServerError(null);
                  completeEnrollment.mutate();
                }}
              >
                <div className="mb-4">
                  <label htmlFor="code" className="mb-1.5 block text-sm font-medium">
                    Code
                  </label>
                  <input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className={`${inputClass} font-mono`}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </div>
                <div className="grid">
                  <button
                    type="submit"
                    disabled={completeEnrollment.isPending || !code}
                    className={submitBtn}
                  >
                    {completeEnrollment.isPending
                      ? "Turning on…"
                      : "Turn on two-factor and sign in"}
                  </button>
                </div>
              </form>
            )}

            <button
              type="button"
              className="text-link w-full text-center text-sm hover:underline"
              onClick={backToSignIn}
            >
              Back to sign in
            </button>
          </div>
        ) : mfaToken ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setServerError(null);
              verify.mutate();
            }}
          >
            <p className="text-muted-foreground mb-4 text-sm">
              Enter the 6-digit code from your authenticator app, or one of your recovery codes.
            </p>
            <div className="mb-4">
              <label htmlFor="code" className="mb-1.5 block text-sm font-medium">
                Code
              </label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                className={`${inputClass} font-mono`}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            {trustDays > 0 && (
              <label className="mb-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={trustDevice}
                  onChange={(e) => setTrustDevice(e.target.checked)}
                />
                Trust this device for {trustDays} days
              </label>
            )}
            <div className="grid">
              <button type="submit" disabled={verify.isPending || !code} className={submitBtn}>
                {verify.isPending ? "Verifying…" : "Verify"}
              </button>
            </div>
            <button
              type="button"
              className="text-link mt-4 w-full text-center text-sm hover:underline"
              onClick={backToSignIn}
            >
              Back to sign in
            </button>
          </form>
        ) : (
          <>
            <form
              onSubmit={handleSubmit((values) => {
                setServerError(null);
                login.mutate(values);
              })}
              noValidate
            >
              <div className="mb-4">
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  className={inputClass}
                  {...register("email")}
                />
                {formState.errors.email && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {formState.errors.email.message}
                  </p>
                )}
              </div>

              {/* Offered rather than taken. An automatic jump the moment the
                  field loses focus would move the page out from under someone
                  who was reaching for the password box, and password sign-in
                  keeps working for a federated organization. */}
              {ssoPath && (
                <div className="border-border bg-background mb-4 rounded-lg border px-4 py-3">
                  <p className="mb-3 text-sm">Your organization uses single sign-on.</p>
                  <div className="grid">
                    <button
                      type="button"
                      className={submitBtn}
                      onClick={() => window.location.assign(ssoPath)}
                    >
                      Continue with single sign-on
                    </button>
                  </div>
                  <p className="text-muted-foreground mt-3 text-xs">
                    Or sign in with your password below
                  </p>
                </div>
              )}

              <div className="mb-2">
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
                  Password
                </label>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  className={inputClass}
                  {...register("password")}
                />
                {formState.errors.password && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {formState.errors.password.message}
                  </p>
                )}
              </div>

              <div className="mb-6 text-right">
                <Link to="/forgot" className="text-link text-sm hover:underline">
                  Forgot password?
                </Link>
              </div>

              <div className="grid">
                <button type="submit" disabled={login.isPending} className={submitBtn}>
                  {login.isPending ? "Signing in…" : "Sign in"}
                </button>
              </div>
            </form>

            <p className="text-muted-foreground mt-6 text-center text-sm">
              Need an account?{" "}
              <Link to="/register" className="text-link hover:underline">
                Sign up
              </Link>
            </p>
          </>
        )}
      </div>
    </LobbyLayout>
  );
}
