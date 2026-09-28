import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import type { InvitationLink } from "@/lib/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// A course's public invitation links. Each link can expire or be revoked on its
// own, so one group's link can be turned off without breaking another's. The
// original link is the one the course has always had; its URL can be shown at
// any time. A link created here is shown once, like an API key, because only
// a hash of its token is kept.
const primaryBtn =
  "bg-primary inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--color-primary-hover)] focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";
const secondaryBtn =
  "border-border text-foreground inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";

const statusStyle: Record<InvitationLink["status"], string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300",
  expired: "bg-muted text-muted-foreground",
  revoked: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
};

const statusLabel: Record<InvitationLink["status"], string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
};

function CopyButton({ url }: { url: string }) {
  const [label, setLabel] = useState("Copy");
  return (
    <button
      type="button"
      className={secondaryBtn}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setLabel("Copied");
          setTimeout(() => setLabel("Copy"), 1500);
        } catch {
          setLabel("Copy failed");
        }
      }}
    >
      {label}
    </button>
  );
}

export function InvitationLinksSection({
  tenantKey,
  courseKey,
  blocked,
}: {
  tenantKey: number;
  courseKey: number;
  blocked: boolean;
}) {
  const qc = useQueryClient();
  const queryKey = ["tenants", tenantKey, "courses", courseKey, "invitation-links"];
  const path = `/api/tenants/${tenantKey}/courses/${courseKey}/invitation-links`;
  const [fresh, setFresh] = useState<InvitationLink | null>(null);
  const [revoking, setRevoking] = useState<InvitationLink | null>(null);

  const links = useQuery({
    queryKey,
    queryFn: async () => api<InvitationLink[]>(path),
    enabled: !blocked,
  });

  const create = useMutation({
    mutationFn: async () => api<InvitationLink>(path, { method: "POST" }),
    onSuccess: async (link) => {
      setFresh(link);
      await qc.invalidateQueries({ queryKey });
    },
  });

  const revoke = useMutation({
    mutationFn: async (link: InvitationLink) =>
      api<void>(`${path}/${link.linkKey}`, { method: "DELETE" }),
    onSuccess: async (_, link) => {
      if (fresh?.linkKey === link.linkKey) setFresh(null);
      setRevoking(null);
      await qc.invalidateQueries({ queryKey });
      // The course detail carries the original link's URL, which revoking removes.
      await qc.invalidateQueries({ queryKey: ["tenants", tenantKey, "courses", courseKey] });
    },
  });

  if (blocked) {
    return (
      <p className="text-muted-foreground text-sm">
        Public invitation links are off because this organization requires two-factor authentication
        for all users. Provision learners by direct invite instead.
      </p>
    );
  }

  return (
    <div>
      <p className="text-muted-foreground mb-3 text-sm">
        Share a link with learners as a course enrollment link. A learner who opens it enters their
        name and email to start the course. Create a link per group so you can turn one off without
        affecting the others.
      </p>

      {fresh?.url && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-green-300 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950/40"
        >
          <p className="mb-2 text-sm font-medium">
            Copy this link now. It will not be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="bg-background flex-1 overflow-x-auto rounded px-3 py-2 font-mono text-xs">
              {fresh.url}
            </code>
            <CopyButton url={fresh.url} />
          </div>
        </div>
      )}

      {links.isError && (
        <p className="mb-3 text-sm text-red-700 dark:text-red-400" role="alert">
          Could not load the links.
        </p>
      )}

      <ul className="divide-border divide-y">
        {(links.data ?? []).map((link) => (
          <li key={link.linkKey} className="py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {link.isOriginal ? (
                    "Original link"
                  ) : (
                    <>
                      Link <span className="font-mono">{link.tokenPrefix}…</span>
                    </>
                  )}
                </p>
                <p className="text-muted-foreground text-xs">
                  Created {formatDate(link.createdAt)}
                  {link.createdByEmail ? ` by ${link.createdByEmail}` : ""}
                  {" · "}
                  {link.revokedAt
                    ? `Revoked ${formatDate(link.revokedAt)}`
                    : link.expiresAt
                      ? `Expires ${formatDate(link.expiresAt)}`
                      : "Never expires"}
                </p>
              </div>
              <span
                className={`inline-block shrink-0 rounded px-2 py-0.5 text-xs font-medium ${statusStyle[link.status]}`}
              >
                {statusLabel[link.status]}
              </span>
            </div>
            {link.status === "active" && (
              <div className="mt-2 flex items-center gap-2">
                {link.url && (
                  <>
                    <code className="bg-muted flex-1 overflow-x-auto rounded px-3 py-2 font-mono text-xs">
                      {link.url}
                    </code>
                    <CopyButton url={link.url} />
                  </>
                )}
                <button
                  type="button"
                  className={`${secondaryBtn} ${link.url ? "" : "ml-auto"}`}
                  onClick={() => setRevoking(link)}
                >
                  Revoke
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <button
        type="button"
        className={`${primaryBtn} mt-3`}
        disabled={create.isPending || links.isLoading}
        onClick={() => create.mutate()}
      >
        {create.isPending ? "Creating…" : "Create link"}
      </button>
      {create.isError && (
        <p className="mt-2 text-sm text-red-700 dark:text-red-400" role="alert">
          Could not create a link. Try again.
        </p>
      )}

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRevoking(null);
            revoke.reset();
          }
        }}
        title="Revoke link?"
        description={
          <>
            Anyone who opens this link will no longer be able to enroll. Learners already enrolled
            through it keep their access. This cannot be undone.
            {revoke.isError && (
              <span role="alert" className="mt-3 block text-red-700 dark:text-red-400">
                Could not revoke this link. Reload the page and try again.
              </span>
            )}
          </>
        }
        confirmLabel="Revoke link"
        busyLabel="Revoking…"
        tone="danger"
        busy={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking)}
      />
    </div>
  );
}
