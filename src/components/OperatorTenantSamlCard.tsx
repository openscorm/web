import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import type { OperatorTenantSaml } from "@/lib/types";
import { DetailCard } from "@/components/DetailCard";

// Single sign-on was live and configurable only by an ops script on the
// server, so onboarding a customer meant an Engineering task. This is the
// operator's half of that: save a provider, claim the email domains discovery
// resolves, then switch it on once the round trip has been proved.
//
// Operator-only by design. A tenant that could claim any email domain could
// send anyone typing that domain at our sign-in page to a provider it controls,
// so self-serve claims wait for DNS verification.
const primaryBtn =
  "bg-primary inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--color-primary-hover)] focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";
const secondaryBtn =
  "border-border text-foreground inline-flex items-center justify-center rounded-full border px-6 py-3 text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";
const dangerBtn =
  "inline-flex items-center justify-center rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";
const linkBtn =
  "text-sm font-medium text-red-700 hover:underline focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400";
const inputClass =
  "bg-background text-foreground focus:border-primary mt-1 block w-full rounded-lg border border-[color:var(--color-input-border)] px-3 py-2.5 text-[15px] transition-colors focus:ring-2 focus:ring-[color:var(--color-input-focus-ring)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60";

interface SamlForm {
  idpEntityId: string;
  idpSignInUrl: string;
  idpSignOutUrl: string;
  idpCertificate: string;
  idpCertificateNext: string;
  nameIdFormat: string;
  emailAttribute: string;
  firstNameAttribute: string;
  lastNameAttribute: string;
  jitProvision: boolean;
}

const EMAIL_NAME_ID = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress";

function problemMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.problem && typeof error.problem === "object") {
    const message = (error.problem as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return fallback;
}

function blank(): SamlForm {
  return {
    idpEntityId: "",
    idpSignInUrl: "",
    idpSignOutUrl: "",
    idpCertificate: "",
    idpCertificateNext: "",
    nameIdFormat: EMAIL_NAME_ID,
    emailAttribute: "",
    firstNameAttribute: "",
    lastNameAttribute: "",
    jitProvision: true,
  };
}

function fromSaved(saved: OperatorTenantSaml): SamlForm {
  return {
    idpEntityId: saved.idpEntityId ?? "",
    idpSignInUrl: saved.idpSignInUrl ?? "",
    idpSignOutUrl: saved.idpSignOutUrl ?? "",
    // Never echoed back by the API, so an edit always re-supplies it.
    idpCertificate: "",
    idpCertificateNext: "",
    nameIdFormat: saved.nameIdFormat,
    emailAttribute: saved.emailAttribute ?? "",
    firstNameAttribute: saved.firstNameAttribute ?? "",
    lastNameAttribute: saved.lastNameAttribute ?? "",
    jitProvision: saved.jitProvision,
  };
}

export function OperatorTenantSamlCard({ tenantKey }: { tenantKey: string }) {
  const qc = useQueryClient();
  const queryKey = ["operator", "tenant", tenantKey, "saml"];
  const path = `/api/operator/tenants/${tenantKey}/saml`;

  const [form, setForm] = useState<SamlForm | null>(null);
  const [domain, setDomain] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const saml = useQuery({
    queryKey,
    queryFn: async () => api<OperatorTenantSaml>(path),
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey });
  };

  const save = useMutation({
    mutationFn: async (next: SamlForm) =>
      api<void>(path, { method: "PUT", body: JSON.stringify(next) }),
    onSuccess: async () => {
      setForm(null);
      await refresh();
    },
  });

  const setEnabled = useMutation({
    mutationFn: async (on: boolean) =>
      api<void>(`${path}/${on ? "enable" : "disable"}`, { method: "POST" }),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async () => api<void>(path, { method: "DELETE" }),
    onSuccess: async () => {
      setConfirmingDelete(false);
      setForm(null);
      await refresh();
    },
  });

  const claimDomain = useMutation({
    mutationFn: async (emailDomain: string) =>
      api<void>(`${path}/domains`, { method: "POST", body: JSON.stringify({ emailDomain }) }),
    onSuccess: async () => {
      setDomain("");
      await refresh();
    },
  });

  const releaseDomain = useMutation({
    mutationFn: async (emailDomain: string) =>
      api<void>(`${path}/domains?emailDomain=${encodeURIComponent(emailDomain)}`, {
        method: "DELETE",
      }),
    onSuccess: refresh,
  });

  const current = saml.data;
  const busy =
    saml.isLoading ||
    save.isPending ||
    setEnabled.isPending ||
    remove.isPending ||
    claimDomain.isPending ||
    releaseDomain.isPending;

  const error =
    save.error ?? setEnabled.error ?? remove.error ?? claimDomain.error ?? releaseDomain.error;

  function field(label: string, key: keyof SamlForm, placeholder = "", hint?: string) {
    if (!form) return null;
    return (
      <label className="mt-4 block text-sm font-medium">
        {label}
        <input
          className={inputClass}
          value={String(form[key])}
          placeholder={placeholder}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
        {hint && (
          <span className="text-muted-foreground mt-1 block text-xs font-normal">{hint}</span>
        )}
      </label>
    );
  }

  return (
    <DetailCard title="Single sign-on">
      {saml.isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}

      {saml.isError && (
        <p className="text-sm text-red-700 dark:text-red-400" role="alert">
          Could not load the single sign-on configuration.
        </p>
      )}

      {error != null && (
        <p className="mb-4 text-sm text-red-700 dark:text-red-400" role="alert">
          {problemMessage(error, "That did not work. Try again.")}
        </p>
      )}

      {current && !form && (
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                current.isEnabled
                  ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {!current.configured ? "Not configured" : current.isEnabled ? "On" : "Saved, off"}
            </span>
            {current.updatedAt && (
              <span className="text-muted-foreground text-xs">
                Updated {formatDateTime(current.updatedAt)}
              </span>
            )}
          </div>

          {!current.configured && (
            <p className="text-muted-foreground mt-3 text-sm">
              This organization signs in with a password. Add an identity provider to offer single
              sign-on.
            </p>
          )}

          {current.configured && (
            <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted-foreground">Entity id</dt>
              <dd className="font-mono break-all">{current.idpEntityId}</dd>
              <dt className="text-muted-foreground">Sign-in URL</dt>
              <dd className="font-mono break-all">{current.idpSignInUrl}</dd>
              {current.idpSignOutUrl && (
                <>
                  <dt className="text-muted-foreground">Sign-out URL</dt>
                  <dd className="font-mono break-all">{current.idpSignOutUrl}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Certificate</dt>
              <dd>
                {current.hasCertificate ? "Stored" : "Missing"}
                {current.hasNextCertificate && ", successor stored"}
              </dd>
              <dt className="text-muted-foreground">New accounts</dt>
              <dd>{current.jitProvision ? "Created on first sign-in" : "Must already exist"}</dd>
            </dl>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryBtn}
              disabled={busy}
              onClick={() => setForm(current.configured ? fromSaved(current) : blank())}
            >
              {current.configured ? "Edit provider" : "Add provider"}
            </button>

            {current.configured && (
              <button
                type="button"
                className={secondaryBtn}
                disabled={busy || !current.hasCertificate}
                onClick={() => setEnabled.mutate(!current.isEnabled)}
              >
                {current.isEnabled ? "Switch off" : "Switch on"}
              </button>
            )}

            {current.configured && !confirmingDelete && (
              <button
                type="button"
                className={linkBtn}
                disabled={busy}
                onClick={() => setConfirmingDelete(true)}
              >
                Remove
              </button>
            )}
          </div>

          {confirmingDelete && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
              <p className="text-sm">
                Remove this provider? Everyone in the organization goes back to signing in with a
                password, and its claimed domains are released for another organization to take.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className={dangerBtn}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  {remove.isPending ? "Removing…" : "Remove provider"}
                </button>
                <button
                  type="button"
                  className={secondaryBtn}
                  disabled={remove.isPending}
                  onClick={() => setConfirmingDelete(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <h3 className="mt-6 text-sm font-medium">Email domains</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            Anyone signing in with an address at one of these is sent to this provider, once it is
            switched on.
          </p>

          {current.domains.length === 0 && (
            <p className="text-muted-foreground mt-2 text-sm">No domains claimed</p>
          )}

          <ul className="mt-2">
            {current.domains.map((d) => (
              <li key={d} className="flex items-center justify-between gap-4 py-1">
                <span className="font-mono text-sm">{d}</span>
                <button
                  type="button"
                  className={linkBtn}
                  disabled={busy}
                  onClick={() => releaseDomain.mutate(d)}
                >
                  Release
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-sm font-medium">
              Add a domain
              <input
                className={inputClass}
                value={domain}
                placeholder="contoso.com"
                onChange={(e) => setDomain(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={secondaryBtn}
              disabled={busy || domain.trim().length === 0}
              onClick={() => claimDomain.mutate(domain.trim())}
            >
              {claimDomain.isPending ? "Claiming…" : "Claim domain"}
            </button>
          </div>
        </div>
      )}

      {form && (
        <div>
          <p className="text-muted-foreground text-sm">
            From the customer's identity provider. In Entra these are the Microsoft Entra
            Identifier, the Login URL, and the Base64 signing certificate.
          </p>

          {field("Entity id", "idpEntityId", "https://sts.windows.net/<directory-id>/")}
          {field("Sign-in URL", "idpSignInUrl", "https://login.microsoftonline.com/…/saml2")}
          {field("Sign-out URL", "idpSignOutUrl", "", "Optional.")}

          <label className="mt-4 block text-sm font-medium">
            Signing certificate
            <textarea
              className={`${inputClass} font-mono`}
              rows={5}
              value={form.idpCertificate}
              placeholder="-----BEGIN CERTIFICATE----- or bare base64"
              onChange={(e) => setForm({ ...form, idpCertificate: e.target.value })}
            />
            <span className="text-muted-foreground mt-1 block text-xs font-normal">
              {current?.hasCertificate
                ? "A certificate is already stored. Paste it again to keep single sign-on working."
                : "PEM wrapping and bare base64 are both accepted."}
            </span>
          </label>

          <label className="mt-4 block text-sm font-medium">
            Successor certificate
            <textarea
              className={`${inputClass} font-mono`}
              rows={3}
              value={form.idpCertificateNext}
              onChange={(e) => setForm({ ...form, idpCertificateNext: e.target.value })}
            />
            <span className="text-muted-foreground mt-1 block text-xs font-normal">
              Optional. Both are accepted while this is set, so a certificate rotation on their side
              does not need a deploy on ours.
            </span>
          </label>

          {field("NameID format", "nameIdFormat")}
          {field("Email attribute", "emailAttribute", "", "Optional. Falls back to the NameID.")}
          {field("First name attribute", "firstNameAttribute", "", "Optional.")}
          {field("Last name attribute", "lastNameAttribute", "", "Optional.")}

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.jitProvision}
              onChange={(e) => setForm({ ...form, jitProvision: e.target.checked })}
            />
            Create an account the first time someone signs in
          </label>

          <p className="text-muted-foreground mt-4 text-xs">
            Saving does not switch single sign-on on. Prove the round trip first, then switch it on.
          </p>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className={primaryBtn}
              disabled={save.isPending}
              onClick={() => save.mutate(form)}
            >
              {save.isPending ? "Saving…" : "Save provider"}
            </button>
            <button
              type="button"
              className={secondaryBtn}
              disabled={save.isPending}
              onClick={() => setForm(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </DetailCard>
  );
}
