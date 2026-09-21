import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { api } from "@/lib/api";
import { LobbyLayout } from "@/components/LobbyLayout";
import { usePageTitle } from "@/hooks/usePageTitle";

const schema = z.object({
  email: z.string().min(1, "Email is required.").email("Enter a valid email."),
});

type FormValues = z.infer<typeof schema>;

// Mirrors the server's generic message. The server's copy is what a caller
// normally sees; this is the fallback when the response carries none, so the
// two have to say the same thing. On timing: Mailgun's first retry is 600
// seconds, so one transient failure at the recipient's mail host puts delivery
// past ten minutes, which is why the copy never promises "a few minutes".
const genericMessage =
  "If that email is registered, a reset link is on the way. It usually arrives within a minute, but can take up to 15 if the receiving mail server is busy. Check spam before requesting another.";

export function ForgotPasswordPage() {
  usePageTitle("Forgot password | OpenSCORM");
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const start = useMutation({
    mutationFn: async (values: FormValues) =>
      api<{ message: string }>("/api/auth/password-reset/start", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    // Whitelisted IPs get a specific outcome from the server; everyone else
    // gets the generic non-enumerable message.
    onSuccess: (data) => setResultMessage(data.message || genericMessage),
    // Server always returns 202 so error handling here is defensive only.
    onError: () => setResultMessage(genericMessage),
  });

  return (
    <LobbyLayout>
      <div className="bg-card text-card-foreground border-border w-full max-w-md rounded-xl border p-8 shadow-sm">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Reset password</h1>
        <p className="text-muted-foreground mb-6 text-sm">
          Enter the email on your account and we'll send a reset link.
        </p>

        {resultMessage ? (
          <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
            {resultMessage}
          </div>
        ) : (
          <form onSubmit={handleSubmit((values) => start.mutate(values))} noValidate>
            <div className="mb-4">
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                className="bg-background text-foreground focus:border-primary block w-full rounded-lg border border-[color:var(--color-input-border)] px-4 py-3 text-[15px] transition-colors focus:ring-2 focus:ring-[color:var(--color-input-focus-ring)] focus:outline-none"
                {...register("email")}
              />
              {formState.errors.email && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="grid">
              <button
                type="submit"
                disabled={start.isPending}
                className="bg-primary inline-flex items-center justify-center rounded-full px-6 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-[color:var(--color-primary-hover)] focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 md:px-8"
              >
                {start.isPending ? "Sending…" : "Send reset link"}
              </button>
            </div>
          </form>
        )}

        <p className="text-muted-foreground mt-6 text-center text-sm">
          <Link to="/login" className="text-link hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </LobbyLayout>
  );
}
