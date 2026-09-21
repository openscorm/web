import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";

import { api, ApiError } from "@/lib/api";
import type { EnrollResponse, ProblemResponse } from "@/lib/types";
import { LobbyLayout } from "@/components/LobbyLayout";
import { usePageTitle } from "@/hooks/usePageTitle";

const schema = z.object({
  name: z.string().min(1, "Enter your first and last name.").max(80),
  email: z.string().min(1, "Email is required.").email("Enter a valid email."),
});

type FormValues = z.infer<typeof schema>;

// Reads {account, course, token} from query string. Invitation links are minted
// as /lobby/enroll/{account}/{course}?token=... and Slate.Api 302s them to this
// route with the segments moved into the query. Slugs are passed through as they
// arrive; the server verifies the token against the slug casing it has stored.
export function EnrollPage() {
  usePageTitle("Enroll in a course | OpenSCORM");
  const [search] = useSearchParams();
  const account = search.get("account") ?? "";
  const course = search.get("course") ?? "";
  const token = search.get("token") ?? "";
  const nav = useNavigate();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  // Set once the server answers 402 (the course is at enrollment capacity).
  // Keeps the Start button disabled so a second click cannot re-POST the same
  // doomed enrollment; the capacity detail already renders in the alert.
  const [atCapacity, setAtCapacity] = useState(false);

  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "" },
  });

  const enroll = useMutation({
    mutationFn: async (values: FormValues) =>
      api<EnrollResponse>("/api/public/enroll", {
        method: "POST",
        body: JSON.stringify({ account, course, token, ...values }),
      }),
    onSuccess: async (data) => {
      // refetchType "all" for the same reason as LoginPage: no observer here.
      // /courses carries no guard today, so this is prevention rather than
      // a live fix, but the enroll response seeds the session the same way.
      await qc.invalidateQueries({ queryKey: ["auth", "me"], refetchType: "all" });

      // Straight into the course the invitation named. This used to navigate to
      // /courses, which lists every course in the tenant: on a large one that is 121
      // cards with nothing marking the invited one, so a link whose button says
      // "Start course" started nothing. The listing stays the fallback
      // for the case where the reply carries no course, which should not happen
      // but is better than routing to /play/0.
      nav(data.courseKey ? `/play/${data.courseKey}` : "/courses");
    },
    onError: (err) => {
      if (err instanceof ApiError && err.problem) {
        const problem = err.problem as ProblemResponse;
        setServerError(problem.detail ?? problem.title ?? "Enrollment failed.");
        if (problem.status === 402) setAtCapacity(true);
      } else {
        setServerError("Enrollment failed. Please try again.");
      }
    },
  });

  if (!account || !course || !token) {
    return (
      <LobbyLayout>
        <div className="bg-card text-card-foreground border-border w-full max-w-md rounded-xl border p-8 shadow-sm">
          <h1 className="mb-2 text-2xl font-bold tracking-tight">Invalid invitation</h1>
          <p className="text-muted-foreground text-sm">
            The invitation link is missing required information. Ask the course owner for a new
            link.
          </p>
        </div>
      </LobbyLayout>
    );
  }

  return (
    <LobbyLayout>
      <div className="bg-card text-card-foreground border-border w-full max-w-md rounded-xl border p-8 shadow-sm">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Enroll in course</h1>
        <p className="text-muted-foreground mb-6 text-sm">
          You've been invited to a course on <span className="font-semibold">{account}</span>. Enter
          your name and email to begin.
        </p>

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
            enroll.mutate(values);
          })}
          noValidate
        >
          <div className="mb-4">
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
              Your name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              autoFocus
              className="bg-background text-foreground focus:border-primary block w-full rounded-lg border border-[color:var(--color-input-border)] px-4 py-3 text-[15px] transition-colors focus:ring-2 focus:ring-[color:var(--color-input-focus-ring)] focus:outline-none"
              {...register("name")}
            />
            {formState.errors.name && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="mb-6">
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
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
              disabled={enroll.isPending || atCapacity}
              className="bg-primary inline-flex items-center justify-center rounded-full px-6 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-[color:var(--color-primary-hover)] focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 md:px-8"
            >
              {atCapacity ? "Course full" : enroll.isPending ? "Starting…" : "Start course"}
            </button>
          </div>
        </form>
      </div>
    </LobbyLayout>
  );
}
