import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { api, ApiError } from "@/lib/api";
import { slugify } from "@/lib/slug";
import type { MeResponse, ProblemResponse } from "@/lib/types";
import { LobbyLayout } from "@/components/LobbyLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { PasswordInput } from "@/components/PasswordInput";

const schema = z.object({
  tenantHandle: z
    .string()
    .min(3, "Portal name must be at least 3 characters.")
    .max(30, "Portal name must be at most 30 characters.")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, digits, and single hyphens only."),
  tenantName: z.string().min(1, "Organization name is required.").max(80),
  name: z.string().min(1, "Your name is required.").max(80),
  email: z.string().min(1, "Email is required.").email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  // Optional signup attribution. Whitelisted server-side, so the client
  // stays lenient and an empty selection just sends nothing.
  source: z.string().max(40).optional(),
});

type FormValues = z.infer<typeof schema>;

// The click on "Create account" is the acceptance act (by-clicking
// pattern), so the body always carries termsAccepted: true and the server
// rejects a register call without it.
type RegisterBody = FormValues & { termsAccepted: true };

export function RegisterPage() {
  usePageTitle("Create your account | OpenSCORM");
  const [serverError, setServerError] = useState<string | null>(null);
  // Portal name auto-fills from Organization name until the user edits it
  // directly; clearing the field hands control back to auto-fill.
  const [slugEdited, setSlugEdited] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();
  const [search] = useSearchParams();
  // /register?plan=mini and friends deep-link from pricing. Signup always
  // creates a Free tenant; a named paid plan only changes the copy so the page
  // does not tell a Mini visitor they are getting Free. Activating the
  // paid tier still happens through billing after the account exists.
  const requestedPlan = PLAN_LABELS[(search.get("plan") ?? "").toLowerCase()];

  const { register, handleSubmit, formState, watch, setValue } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      tenantHandle: "",
      tenantName: "",
      name: "",
      email: "",
      password: "",
      source: "",
    },
  });

  const tenantNameField = register("tenantName");
  const tenantHandleField = register("tenantHandle");

  const create = useMutation({
    mutationFn: async (values: RegisterBody) =>
      api<MeResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: async () => {
      // account_created fires server-side from the register endpoint.
      // refetchType "all" for the same reason as LoginPage: no observer here.
      await qc.invalidateQueries({ queryKey: ["auth", "me"], refetchType: "all" });
      nav("/dashboard");
    },
    onError: (err) => {
      if (err instanceof ApiError && err.problem) {
        const problem = err.problem as ProblemResponse;
        setServerError(problem.detail ?? problem.title ?? "Registration failed.");
      } else {
        setServerError("Registration failed. Please try again.");
      }
    },
  });

  const slugPreview = watch("tenantHandle");

  return (
    <LobbyLayout>
      <div className="bg-card text-card-foreground border-border w-full max-w-lg rounded-xl border p-8 shadow-sm">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Sign up</h1>
        <p className="text-muted-foreground mb-6 text-sm">
          {requestedPlan
            ? `Sign up for the ${requestedPlan} plan. We'll create your account first, then you can activate ${requestedPlan} from billing.`
            : "Create a Free tenant. 1 course, up to 10 users. Upgrade any time."}
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
            create.mutate({ ...values, termsAccepted: true });
          })}
          noValidate
        >
          <Field
            id="tenantName"
            label="Organization name"
            error={formState.errors.tenantName?.message}
          >
            <input
              id="tenantName"
              type="text"
              autoComplete="organization"
              autoFocus
              className={inputClass}
              {...tenantNameField}
              onChange={(e) => {
                void tenantNameField.onChange(e);
                if (!slugEdited) {
                  setValue("tenantHandle", slugify(e.target.value), {
                    shouldValidate: formState.isSubmitted,
                  });
                }
              }}
            />
          </Field>

          <Field
            id="tenantHandle"
            label="Portal name"
            tooltip="A short identifier for your organization. It appears in your course invitation links and cannot be changed later."
            hint={
              slugPreview
                ? `Your links will include /${slugPreview}`
                : "Lowercase letters, digits, hyphens. 3-30 chars."
            }
            error={formState.errors.tenantHandle?.message}
          >
            <input
              id="tenantHandle"
              type="text"
              autoComplete="off"
              className={inputClass}
              {...tenantHandleField}
              onChange={(e) => {
                setSlugEdited(e.target.value !== "");
                void tenantHandleField.onChange(e);
              }}
            />
          </Field>

          <Field id="name" label="Your name" error={formState.errors.name?.message}>
            <input
              id="name"
              type="text"
              autoComplete="name"
              className={inputClass}
              {...register("name")}
            />
          </Field>

          {/* CASL / CAN-SPAM notice at the email-capture point. Net-new
              signups are implied consent under CASL already, so this is belt and
              braces, folded into the same acceptance build. */}
          <Field
            id="email"
            label="Email"
            hint={EMAIL_NOTICE}
            error={formState.errors.email?.message}
          >
            <input
              id="email"
              type="email"
              autoComplete="email"
              className={inputClass}
              {...register("email")}
            />
          </Field>

          <Field
            id="password"
            label="Password"
            hint="At least 8 characters."
            error={formState.errors.password?.message}
          >
            <PasswordInput
              id="password"
              autoComplete="new-password"
              className={inputClass}
              {...register("password")}
            />
          </Field>

          <Field
            id="source"
            label="How did you hear about us?"
            error={formState.errors.source?.message}
          >
            <select id="source" className={inputClass} {...register("source")}>
              <option value="">Select one (optional)</option>
              <option value="LinkedIn">LinkedIn</option>
              <option value="Search">Search engine</option>
              <option value="Referral">Referral</option>
              {/* The value is the stored token (SignupSources.AIAssistant
                  on the server, varchar(20)); the label is Growth's wording. */}
              <option value="AIAssistant">AI assistant (ChatGPT, Claude, Gemini, other)</option>
              <option value="Other">Other</option>
            </select>
          </Field>

          <div className="mt-2 grid">
            <button type="submit" disabled={create.isPending} className={submitClass}>
              {create.isPending ? "Creating account…" : "Create account"}
            </button>
          </div>

          <p className="text-muted-foreground mt-3 text-center text-xs">
            By creating an account, you agree to our{" "}
            <a
              href={TERMS_URL}
              className="text-link hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href={PRIVACY_URL}
              className="text-link hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy Policy
            </a>
            .
          </p>
        </form>

        <p className="text-muted-foreground mt-6 text-center text-sm">
          Already have an account?{" "}
          <Link to="/login" className="text-link hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </LobbyLayout>
  );
}

// The live legal pages on the marketing site, the same targets the
// LobbyLayout footer links to.
const TERMS_URL = "https://www.openscorm.com/terms";
const EMAIL_NOTICE =
  "We'll send account and product emails to this address. You can unsubscribe from product emails at any time.";
const PRIVACY_URL = "https://www.openscorm.com/privacy";

// Paid plan handles that a pricing deep-link may pass as ?plan=. Free is the
// default and is intentionally not listed. Keyed lowercase to match the query
// value after normalization.
const PLAN_LABELS: Record<string, string> = {
  mini: "Mini",
  starter: "Starter",
  small: "Small",
  medium: "Medium",
  large: "Large",
  provider: "Provider",
};

const inputClass =
  "block w-full py-3 px-4 rounded-lg border border-[color:var(--color-input-border)] bg-background text-foreground text-[15px] focus:outline-none focus:border-primary focus:ring-2 focus:ring-[color:var(--color-input-focus-ring)] transition-colors";

const submitClass =
  "inline-flex items-center justify-center rounded-full py-3.5 px-6 md:px-8 font-semibold text-[15px] text-white bg-primary hover:bg-[color:var(--color-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

function Field({
  id,
  label,
  tooltip,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  tooltip?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
        {tooltip && (
          <span
            title={tooltip}
            aria-label={tooltip}
            role="img"
            className="text-muted-foreground ml-1.5 cursor-help align-middle text-xs"
          >
            &#9432;
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : hint ? (
        <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
      ) : null}
    </div>
  );
}
