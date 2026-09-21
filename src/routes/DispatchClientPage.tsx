import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError, download } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/dates";
import type { ProblemResponse } from "@/lib/types";
import type { ClientRow, DispatchDetail, DispatchRow } from "@/lib/dispatch";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface CourseOption {
  courseKey: number;
  title: string;
  courseSlug: string;
}

// One client organization's dispatches. Batch assignment is
// the load-bearing flow: provisioning a new client with a full
// catalog must be a session of work, so course selection is a filterable
// multi-select rather than one-dispatch-at-a-time.
export function DispatchClientPage() {
  const { user } = useAuth();
  const tenantKey = user?.tenantKey;
  const { clientKey: clientKeyParam } = useParams();
  const clientKey = Number(clientKeyParam);
  const qc = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [controlsFor, setControlsFor] = useState<DispatchRow | null>(null);
  const [registrationsFor, setRegistrationsFor] = useState<DispatchRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<string | null>(null);
  // The dispatch awaiting a revoke confirmation; null when the dialog is closed.
  const [pendingRevoke, setPendingRevoke] = useState<DispatchRow | null>(null);

  const clients = useQuery({
    queryKey: ["tenants", tenantKey, "clients"],
    queryFn: async () => api<ClientRow[]>(`/api/tenants/${tenantKey}/clients`),
    enabled: !!tenantKey,
  });

  const dispatches = useQuery({
    queryKey: ["tenants", tenantKey, "dispatches", clientKey],
    queryFn: async () =>
      api<DispatchRow[]>(`/api/tenants/${tenantKey}/dispatches?clientKey=${clientKey}`),
    enabled: !!tenantKey && Number.isFinite(clientKey),
  });

  const revoke = useMutation({
    mutationFn: async (dispatchId: string) =>
      api<void>(`/api/tenants/${tenantKey}/dispatches/${dispatchId}/revoke`, { method: "POST" }),
    onSuccess: () => {
      setPendingRevoke(null);
      return refresh();
    },
    onError: (err) => {
      setPendingRevoke(null);
      setActionError(problemText(err, "Could not revoke the dispatch."));
    },
  });

  function refresh() {
    return Promise.all([
      qc.invalidateQueries({ queryKey: ["tenants", tenantKey, "dispatches", clientKey] }),
      qc.invalidateQueries({ queryKey: ["tenants", tenantKey, "clients"] }),
    ]);
  }

  async function onDownload(d: DispatchRow) {
    setActionError(null);
    try {
      await download(
        `/api/tenants/${tenantKey}/dispatches/${d.dispatchId}/package`,
        `dispatch-${d.courseSlug}.zip`,
        "application/zip",
      );
    } catch (err) {
      setActionError(problemText(err, "Could not download the package."));
    }
  }

  const client = clients.data?.find((c) => c.clientKey === clientKey);
  const rows = dispatches.data ?? [];

  return (
    <AppShell>
      <PageHeader
        title={client?.clientName ?? "Client organization"}
        subtitle="Dispatches delivered to this client"
        actions={
          <button
            type="button"
            onClick={() => {
              setBatchStatus(null);
              setAddOpen(true);
            }}
            className={primaryBtn}
          >
            Add courses
          </button>
        }
      />

      <div className="mb-4 text-sm">
        <Link to="/dispatch" className="text-link hover:underline">
          All client organizations
        </Link>
      </div>

      {actionError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          {actionError}
        </div>
      )}
      {batchStatus && (
        <div className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
          {batchStatus}
        </div>
      )}

      {dispatches.isLoading && <p className="text-muted-foreground text-sm">Loading dispatches…</p>}

      {!dispatches.isLoading && rows.length === 0 && (
        <div className="border-border bg-card text-card-foreground rounded-xl border p-8 text-center">
          <h2 className="mb-2 text-lg font-semibold">No dispatches yet</h2>
          <p className="text-muted-foreground mx-auto mb-4 max-w-xl text-sm">
            Pick the courses this client should receive. Each course becomes one dispatch package
            you download and send to them.
          </p>
          <button type="button" onClick={() => setAddOpen(true)} className={primaryBtn}>
            Add courses
          </button>
        </div>
      )}

      {rows.length > 0 && (
        <div className="border-border bg-card text-card-foreground overflow-hidden rounded-xl border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Registrations</th>
                  <th className="px-4 py-3 text-right font-medium">Launches</th>
                  <th className="px-4 py-3 text-right font-medium">Completions</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.dispatchId} className="border-border border-t">
                    <td className="px-4 py-3">{d.courseTitle || d.courseSlug}</td>
                    <td className="px-4 py-3">
                      <DispatchStatusBadge status={d.status} />
                      {d.status !== "revoked" && d.expiresAt && (
                        <div className="text-muted-foreground/70 mt-0.5 text-xs">
                          {d.status === "expired" ? "Expired" : "Expires"} {formatDate(d.expiresAt)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {d.registrationCount}
                      {d.registrationCap != null && (
                        <span className="text-muted-foreground/70"> / {d.registrationCap}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{d.launchCount}</td>
                    <td className="px-4 py-3 text-right font-mono">{d.completionCount}</td>
                    <td className="text-muted-foreground px-4 py-3 font-mono text-xs">
                      {formatDate(d.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        {d.packageUrl && (
                          <button
                            type="button"
                            onClick={() => onDownload(d)}
                            className="text-link text-xs hover:underline"
                          >
                            Download
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setRegistrationsFor(d)}
                          className="text-muted-foreground hover:text-foreground text-xs hover:underline"
                        >
                          Learners
                        </button>
                        {d.status !== "revoked" && (
                          <>
                            <button
                              type="button"
                              onClick={() => setControlsFor(d)}
                              className="text-muted-foreground hover:text-foreground text-xs hover:underline"
                            >
                              Controls
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingRevoke(d)}
                              className="text-xs text-red-600 hover:underline dark:text-red-400"
                            >
                              Revoke
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {addOpen && (
        <AddCoursesDialog
          tenantKey={tenantKey!}
          clientKey={clientKey}
          existing={rows}
          onClose={() => setAddOpen(false)}
          onDone={async (created, skipped) => {
            setAddOpen(false);
            setBatchStatus(
              skipped > 0
                ? `Created ${created} ${plural(created, "dispatch", "dispatches")}. Skipped ${skipped} already dispatched to this client.`
                : `Created ${created} ${plural(created, "dispatch", "dispatches")}.`,
            );
            await refresh();
          }}
        />
      )}

      {controlsFor && (
        <ControlsDialog
          tenantKey={tenantKey!}
          dispatch={controlsFor}
          onClose={() => setControlsFor(null)}
          onSaved={async () => {
            setControlsFor(null);
            await refresh();
          }}
        />
      )}

      {registrationsFor && (
        <RegistrationsDialog
          tenantKey={tenantKey!}
          dispatch={registrationsFor}
          onClose={() => setRegistrationsFor(null)}
        />
      )}
      <ConfirmDialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRevoke(null);
        }}
        title={`Revoke the "${pendingRevoke?.courseTitle || pendingRevoke?.courseSlug || ""}" dispatch?`}
        description={`${pendingRevoke?.clientName ?? "This client"} loses access straight away: distributed packages stop working immediately. It cannot be undone.`}
        confirmLabel="Revoke dispatch"
        busyLabel="Revoking…"
        busy={revoke.isPending}
        onConfirm={() => {
          if (pendingRevoke) {
            setActionError(null);
            revoke.mutate(pendingRevoke.dispatchId);
          }
        }}
      />
    </AppShell>
  );
}

function AddCoursesDialog(props: {
  tenantKey: number;
  clientKey: number;
  existing: DispatchRow[];
  onClose: () => void;
  onDone: (created: number, skipped: number) => void;
}) {
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const courses = useQuery({
    queryKey: ["tenants", props.tenantKey, "courses"],
    queryFn: async () => api<CourseOption[]>(`/api/tenants/${props.tenantKey}/courses`),
  });

  // Courses with a live dispatch for this client are shown checked and
  // disabled rather than hidden: at catalog scale the manager's question is
  // "what does this client not have yet", and an absent row cannot answer it.
  const alreadyDispatched = useMemo(
    () => new Set(props.existing.filter((d) => d.status !== "revoked").map((d) => d.courseKey)),
    [props.existing],
  );

  const visible = useMemo(() => {
    const all = courses.data ?? [];
    const k = filter.trim().toLowerCase();
    if (!k) return all;
    return all.filter(
      (c) => (c.title ?? "").toLowerCase().includes(k) || c.courseSlug.toLowerCase().includes(k),
    );
  }, [courses.data, filter]);

  const selectable = visible.filter((c) => !alreadyDispatched.has(c.courseKey));
  const allVisibleSelected =
    selectable.length > 0 && selectable.every((c) => selected.has(c.courseKey));

  const create = useMutation({
    mutationFn: async () =>
      api<{ createdCount: number; skippedExisting: number }>(
        `/api/tenants/${props.tenantKey}/dispatches`,
        {
          method: "POST",
          body: JSON.stringify({
            clientKey: props.clientKey,
            courseKeys: Array.from(selected),
          }),
        },
      ),
    onSuccess: (result) => props.onDone(result.createdCount, result.skippedExisting),
    onError: (err) => setError(problemText(err, "Could not create the dispatches.")),
  });

  function toggle(courseKey: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(courseKey)) next.delete(courseKey);
      else next.add(courseKey);
      return next;
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add courses</DialogTitle>
          <DialogDescription>
            Each selected course becomes one dispatch package for this client.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            {error}
          </div>
        )}
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter courses"
          className={inputClass}
        />
        <div className="border-border max-h-64 overflow-y-auto rounded-lg border">
          {courses.isLoading && <p className="text-muted-foreground p-3 text-sm">Loading…</p>}
          {!courses.isLoading && visible.length === 0 && (
            <p className="text-muted-foreground p-3 text-sm">No courses match this filter</p>
          )}
          {visible.map((c) => {
            const dispatched = alreadyDispatched.has(c.courseKey);
            return (
              <label
                key={c.courseKey}
                className={`border-border flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 ${dispatched ? "text-muted-foreground/70" : "hover:bg-muted cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  checked={dispatched || selected.has(c.courseKey)}
                  disabled={dispatched}
                  onChange={() => toggle(c.courseKey)}
                />
                <span className="truncate">{c.title || c.courseSlug}</span>
                {dispatched && <span className="ml-auto shrink-0 text-xs">Dispatched</span>}
              </label>
            );
          })}
        </div>
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (allVisibleSelected) selectable.forEach((c) => next.delete(c.courseKey));
                else selectable.forEach((c) => next.add(c.courseKey));
                return next;
              })
            }
            className="text-link hover:underline"
            disabled={selectable.length === 0}
          >
            {allVisibleSelected ? "Clear visible" : "Select all visible"}
          </button>
          <span className="text-muted-foreground">{selected.size} selected</span>
        </div>
        <DialogFooter>
          <button type="button" onClick={props.onClose} className={secondaryBtn}>
            Cancel
          </button>
          <button
            type="button"
            disabled={create.isPending || selected.size === 0}
            onClick={() => {
              setError(null);
              create.mutate();
            }}
            className={primaryBtn}
          >
            {create.isPending
              ? "Creating…"
              : `Create ${selected.size} ${plural(selected.size, "dispatch", "dispatches")}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ControlsDialog(props: {
  tenantKey: number;
  dispatch: DispatchRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const d = props.dispatch;
  const [expires, setExpires] = useState(d.expiresAt ? d.expiresAt.slice(0, 10) : "");
  const [cap, setCap] = useState(d.registrationCap?.toString() ?? "");
  const [domains, setDomains] = useState(d.allowedDomains.join("\n"));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () =>
      api<void>(`/api/tenants/${props.tenantKey}/dispatches/${d.dispatchId}`, {
        method: "PATCH",
        body: JSON.stringify({
          // A date input means "through the end of that day"; the server
          // stores the timestamp. Enforcement arrives with step 5.
          expiresAt: expires ? `${expires}T23:59:59` : null,
          registrationCap: cap ? Number(cap) : null,
          allowedDomains: domains
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0),
        }),
      }),
    onSuccess: props.onSaved,
    onError: (err) => setError(problemText(err, "Could not save the controls.")),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dispatch controls</DialogTitle>
          <DialogDescription>
            {d.courseTitle || d.courseSlug} · {d.clientName}. All controls are optional; leave a
            field empty for no limit.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            {error}
          </div>
        )}
        <div>
          <label htmlFor="expires" className="mb-1.5 block text-sm font-medium">
            Expiry date
          </label>
          <input
            id="expires"
            type="date"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="cap" className="mb-1.5 block text-sm font-medium">
            Registration cap
          </label>
          <input
            id="cap"
            type="number"
            min={1}
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            placeholder="No cap"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="domains" className="mb-1.5 block text-sm font-medium">
            Allowed domains
          </label>
          <textarea
            id="domains"
            rows={3}
            value={domains}
            onChange={(e) => setDomains(e.target.value)}
            placeholder={"One domain per line, e.g.\nlms.example.com"}
            className={inputClass}
          />
          <p className="text-muted-foreground mt-1 text-xs">
            When set, the package only works when launched from these domains
          </p>
        </div>
        <div className="text-muted-foreground text-xs">
          Dispatch ID <span className="font-mono">{d.dispatchId}</span>
        </div>
        <DialogFooter>
          <button type="button" onClick={props.onClose} className={secondaryBtn}>
            Cancel
          </button>
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => {
              setError(null);
              save.mutate();
            }}
            className={primaryBtn}
          >
            {save.isPending ? "Saving…" : "Save controls"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegistrationsDialog(props: {
  tenantKey: number;
  dispatch: DispatchRow;
  onClose: () => void;
}) {
  const d = props.dispatch;

  const detail = useQuery({
    queryKey: ["tenants", props.tenantKey, "dispatches", "detail", d.dispatchId],
    queryFn: async () =>
      api<DispatchDetail>(`/api/tenants/${props.tenantKey}/dispatches/${d.dispatchId}`),
  });

  const registrations = detail.data?.registrations ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Learners</DialogTitle>
          <DialogDescription>
            {d.courseTitle || d.courseSlug} · {d.clientName}. Learner IDs come from the client's
            LMS. Each real learner counts as a billable registration; preview and test launches are
            marked and not billed.
          </DialogDescription>
        </DialogHeader>
        {detail.isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
        {!detail.isLoading && registrations.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No learners have launched this dispatch yet
          </p>
        )}
        {registrations.length > 0 && (
          <div className="max-h-80 overflow-x-auto overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Learner ID</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 text-right font-medium">Attempts</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {registrations.map((r) => (
                  <tr key={r.registrationId} className="border-border border-t">
                    <td className="px-3 py-2 font-mono text-xs">{r.externalLearnerId}</td>
                    <td className="px-3 py-2">
                      {r.externalLearnerName || "—"}
                      {r.archived && (
                        <span className="text-muted-foreground/70 ml-2 text-xs">Archived</span>
                      )}
                      {r.noTracking && (
                        <span className="bg-muted text-muted-foreground ml-2 rounded px-1.5 py-0.5 text-xs">
                          Test
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{r.attemptCount}</td>
                    <td className="px-3 py-2">{r.latestStatus || "—"}</td>
                    <td className="text-muted-foreground px-3 py-2 font-mono text-xs">
                      {formatDateTime(r.lastSeenAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DispatchStatusBadge({ status }: { status: DispatchRow["status"] }) {
  const styles =
    status === "active"
      ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300"
      : status === "expired"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        : "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${styles}`}>
      {status}
    </span>
  );
}

function problemText(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.problem) {
    const p = err.problem as ProblemResponse;
    return p.detail ?? p.title ?? fallback;
  }
  return fallback;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

const inputClass =
  "block w-full py-2.5 px-3 rounded-lg border border-[color:var(--color-input-border)] bg-background text-foreground text-[15px] focus:outline-none focus:border-primary focus:ring-2 focus:ring-[color:var(--color-input-focus-ring)] transition-colors";

const primaryBtn =
  "inline-flex items-center justify-center rounded-full py-2 px-4 font-semibold text-sm text-white bg-primary hover:bg-[color:var(--color-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

const secondaryBtn =
  "inline-flex items-center justify-center rounded-full py-2 px-4 font-semibold text-sm border border-border text-foreground hover:bg-muted transition-colors";
