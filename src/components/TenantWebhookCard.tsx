import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import type { MeResponse, TenantWebhook } from "@/lib/types";

// The completion webhook, for managers and operators: one
// receiver URL, one signing secret. The secret is shown exactly once, when
// the receiver is created and again on each rotation; a URL change keeps it.
// "Send test event" queues a webhook.test delivery so the integrator can
// prove their receiver and signature check before a real learner finishes.
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

function problemMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.problem && typeof error.problem === "object") {
    const message = (error.problem as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return fallback;
}

function deliveryLine(webhook: TenantWebhook): string {
  if (!webhook.lastDeliveryAt) return "No deliveries yet";
  const when = formatDateTime(webhook.lastDeliveryAt);
  switch (webhook.lastDeliveryStatus) {
    case "sent":
      return `Last delivery ${when} succeeded`;
    case "retrying":
      return `Last delivery ${when} failed and will be retried${webhook.lastDeliveryError ? `: ${webhook.lastDeliveryError}` : ""}`;
    case "abandoned":
      return `Last delivery ${when} was abandoned${webhook.lastDeliveryError ? `: ${webhook.lastDeliveryError}` : ""}`;
    default:
      return `Last delivery ${when}`;
  }
}

export function TenantWebhookCard({ user }: { user: MeResponse }) {
  const qc = useQueryClient();
  const queryKey = ["tenants", user.tenantKey, "webhook"];
  const path = `/api/tenants/${user.tenantKey}/webhook`;

  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<"rotate" | "remove" | null>(null);
  const [testQueued, setTestQueued] = useState(false);

  const webhook = useQuery({
    queryKey,
    // 204 means none configured; api() yields undefined for an empty body.
    queryFn: async () => (await api<TenantWebhook | undefined>(path)) ?? null,
  });

  const save = useMutation({
    mutationFn: async (nextUrl: string) =>
      api<TenantWebhook>(path, { method: "PUT", body: JSON.stringify({ url: nextUrl }) }),
    onSuccess: (saved) => {
      if (saved.secret) setRevealed(saved.secret);
      setCopied(false);
      setEditing(false);
      setUrl("");
      void qc.invalidateQueries({ queryKey });
    },
  });

  const rotate = useMutation({
    mutationFn: async () => api<TenantWebhook>(`${path}/rotate`, { method: "POST" }),
    onSuccess: (rotated) => {
      if (rotated.secret) setRevealed(rotated.secret);
      setCopied(false);
      setConfirming(null);
      void qc.invalidateQueries({ queryKey });
    },
  });

  const test = useMutation({
    mutationFn: async () => api<void>(`${path}/test`, { method: "POST" }),
    onSuccess: () => {
      setTestQueued(true);
      window.setTimeout(() => {
        setTestQueued(false);
        void qc.invalidateQueries({ queryKey });
      }, 25_000);
    },
  });

  const remove = useMutation({
    mutationFn: async () => api<void>(path, { method: "DELETE" }),
    onSuccess: () => {
      setConfirming(null);
      setRevealed(null);
      void qc.invalidateQueries({ queryKey });
    },
  });

  const current = webhook.data ?? null;
  const busy =
    webhook.isLoading || save.isPending || rotate.isPending || remove.isPending || test.isPending;
  const failed =
    webhook.isError || save.isError || rotate.isError || remove.isError || test.isError;

  async function copySecret() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="border-border bg-card mx-auto mt-6 max-w-xl rounded-xl border p-6">
      <h2 className="text-lg font-semibold">Completion webhook</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        A signed POST to your system each time a learner completes a course
      </p>

      {failed && (
        <p className="mt-4 text-sm text-red-700 dark:text-red-400" role="alert">
          {webhook.isError
            ? "Could not load the webhook."
            : save.isError
              ? problemMessage(save.error, "Could not save the webhook. Try again.")
              : rotate.isError
                ? problemMessage(rotate.error, "Could not rotate the secret. Try again.")
                : test.isError
                  ? problemMessage(test.error, "Could not queue the test event. Try again.")
                  : problemMessage(remove.error, "Could not remove the webhook. Try again.")}
        </p>
      )}

      {revealed && (
        <div
          className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/40"
          role="status"
        >
          <p className="text-sm font-medium">
            Copy this signing secret now. It is shown only once.
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Verify <span className="font-mono">X-OpenSCORM-Signature</span> on every delivery with
            it.
          </p>
          <code
            className="bg-background mt-3 block overflow-x-auto rounded border px-3 py-2 font-mono text-sm break-all select-all"
            data-testid="webhook-secret"
          >
            {revealed}
          </code>
          <div className="mt-3 flex gap-2">
            <button type="button" className={primaryBtn} onClick={() => void copySecret()}>
              {copied ? "Copied" : "Copy secret"}
            </button>
            <button type="button" className={secondaryBtn} onClick={() => setRevealed(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {webhook.isLoading && <p className="text-muted-foreground mt-5 text-sm">Loading…</p>}

      {!webhook.isLoading && current && !editing && (
        <div className="mt-5">
          <p className="text-sm font-medium">Receiver</p>
          <p className="mt-0.5 font-mono text-sm break-all">{current.url}</p>
          <p className="text-muted-foreground mt-2 text-xs">
            Secret <span className="font-mono">{current.secretPrefix}…</span> rotated{" "}
            {formatDateTime(current.secretRotatedAt)}
          </p>
          <p className="text-muted-foreground mt-1 text-xs" data-testid="webhook-delivery">
            {testQueued
              ? "Test event queued, delivered within about 20 seconds"
              : deliveryLine(current)}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryBtn}
              disabled={busy}
              onClick={() => test.mutate()}
            >
              {test.isPending ? "Queueing…" : "Send test event"}
            </button>
            <button
              type="button"
              className={secondaryBtn}
              disabled={busy}
              onClick={() => {
                setUrl(current.url);
                setEditing(true);
              }}
            >
              Change URL
            </button>
            {confirming === null && (
              <>
                <button
                  type="button"
                  className={linkBtn}
                  disabled={busy}
                  onClick={() => setConfirming("rotate")}
                >
                  Rotate secret
                </button>
                <button
                  type="button"
                  className={linkBtn}
                  disabled={busy}
                  onClick={() => setConfirming("remove")}
                >
                  Remove
                </button>
              </>
            )}
          </div>

          {confirming === "rotate" && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
              <p className="text-sm">
                Rotate the signing secret? Deliveries from now on are signed with the new one, so
                install it in your receiver first.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className={dangerBtn}
                  disabled={rotate.isPending}
                  onClick={() => rotate.mutate()}
                >
                  {rotate.isPending ? "Rotating…" : "Rotate secret"}
                </button>
                <button
                  type="button"
                  className={secondaryBtn}
                  disabled={rotate.isPending}
                  onClick={() => setConfirming(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {confirming === "remove" && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
              <p className="text-sm">
                Remove the webhook? Completions stop being delivered at once.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className={dangerBtn}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  {remove.isPending ? "Removing…" : "Remove webhook"}
                </button>
                <button
                  type="button"
                  className={secondaryBtn}
                  disabled={remove.isPending}
                  onClick={() => setConfirming(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!webhook.isLoading && (!current || editing) && (
        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim().length === 0) return;
            save.mutate(url.trim());
          }}
        >
          <label htmlFor="webhook-url" className="block text-sm font-medium">
            Receiver URL
          </label>
          <input
            id="webhook-url"
            type="url"
            className={inputClass}
            maxLength={500}
            placeholder="https://your-lms.example.com/hooks/openscorm"
            value={url}
            disabled={busy}
            onChange={(e) => setUrl(e.target.value)}
          />
          <p className="text-muted-foreground mt-2 text-xs">
            {current
              ? "Changing the URL keeps your signing secret."
              : "Must be https. You get a signing secret when you save, shown once."}
          </p>
          <div className="mt-4 flex gap-2">
            <button type="submit" className={primaryBtn} disabled={busy || url.trim().length === 0}>
              {save.isPending ? "Saving…" : current ? "Save URL" : "Create webhook"}
            </button>
            {editing && (
              <button
                type="button"
                className={secondaryBtn}
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
