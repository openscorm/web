import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import type { ProblemResponse } from "@/lib/types";
import type { ClientRow } from "@/lib/dispatch";
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

// Dispatch console, client-organization level. The default
// path is deliberately short by design: pick a client, pick
// courses, download. Controls live behind the per-dispatch screens.
export function DispatchPage() {
  const { user } = useAuth();
  const tenantKey = user?.tenantKey;
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const clients = useQuery({
    queryKey: ["tenants", tenantKey, "clients"],
    queryFn: async () => api<ClientRow[]>(`/api/tenants/${tenantKey}/clients`),
    enabled: !!tenantKey,
  });

  const create = useMutation({
    mutationFn: async (name: string) =>
      api<ClientRow>(`/api/tenants/${tenantKey}/clients`, {
        method: "POST",
        body: JSON.stringify({ clientName: name }),
      }),
    onSuccess: async () => {
      setCreateOpen(false);
      setClientName("");
      setCreateError(null);
      await qc.invalidateQueries({ queryKey: ["tenants", tenantKey, "clients"] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.problem) {
        const p = err.problem as ProblemResponse;
        setCreateError(p.detail ?? p.title ?? "Could not create the client organization.");
      } else {
        setCreateError("Could not create the client organization.");
      }
    },
  });

  const rows = clients.data ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Dispatch"
        subtitle="Deliver your hosted courses inside your clients' own LMSs"
        actions={
          <button type="button" onClick={() => setCreateOpen(true)} className={primaryBtn}>
            Add client organization
          </button>
        }
        restricted={[
          "Manager or operator access only.",
          "The /dispatch route is wrapped in RequireManager.",
          <>
            Enforced server-side by the{" "}
            <code className="font-mono">/api/tenants/&#123;tenantKey&#125;/clients</code> and{" "}
            <code className="font-mono">/api/tenants/&#123;tenantKey&#125;/dispatches</code>{" "}
            endpoints, which require manager or operator for every call.
          </>,
        ]}
      />

      {clients.isLoading && <p className="text-muted-foreground text-sm">Loading clients…</p>}

      {!clients.isLoading && rows.length === 0 && (
        <div className="border-border bg-card text-card-foreground rounded-xl border p-8 text-center">
          <h2 className="mb-2 text-lg font-semibold">No client organizations yet</h2>
          <p className="text-muted-foreground mx-auto mb-4 max-w-xl text-sm">
            A dispatch is a small SCORM package you hand to a client. They import it into their own
            LMS, and when their learners launch it, the course runs from here and reports results
            back to you. Start by adding the client organization you deliver training to.
          </p>
          <button type="button" onClick={() => setCreateOpen(true)} className={primaryBtn}>
            Add client organization
          </button>
        </div>
      )}

      {rows.length > 0 && (
        <div className="border-border bg-card text-card-foreground overflow-hidden rounded-xl border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Client organization</th>
                  <th className="px-4 py-3 text-right font-medium">Dispatches</th>
                  <th className="px-4 py-3 text-right font-medium">Registrations</th>
                  <th className="px-4 py-3 font-medium">Added</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.clientKey} className="border-border border-t">
                    <td className="px-4 py-3">
                      <Link to={`/dispatch/${c.clientKey}`} className="text-link hover:underline">
                        {c.clientName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{c.activeDispatchCount}</td>
                    <td className="px-4 py-3 text-right font-mono">{c.registrationCount}</td>
                    <td className="text-muted-foreground px-4 py-3 font-mono text-xs">
                      {formatDate(c.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <p className="text-muted-foreground mt-3 text-xs">
          Registrations are learners who launched a dispatched course from a client's LMS. They
          count toward your plan's user total.
        </p>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add client organization</DialogTitle>
            <DialogDescription>
              The organization you deliver training to. Its name groups dispatches, reporting, and
              capacity subtotals.
            </DialogDescription>
          </DialogHeader>
          {createError && (
            <div
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            >
              {createError}
            </div>
          )}
          <div>
            <label htmlFor="client-name" className="mb-1.5 block text-sm font-medium">
              Name
            </label>
            <input
              id="client-name"
              type="text"
              value={clientName}
              maxLength={100}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Acme Hardware"
              className={inputClass}
            />
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setCreateOpen(false)} className={secondaryBtn}>
              Cancel
            </button>
            <button
              type="button"
              disabled={create.isPending || clientName.trim().length === 0}
              onClick={() => create.mutate(clientName.trim())}
              className={primaryBtn}
            >
              {create.isPending ? "Adding…" : "Add client"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

const inputClass =
  "block w-full py-2.5 px-3 rounded-lg border border-[color:var(--color-input-border)] bg-background text-foreground text-[15px] focus:outline-none focus:border-primary focus:ring-2 focus:ring-[color:var(--color-input-focus-ring)] transition-colors";

const primaryBtn =
  "inline-flex items-center justify-center rounded-full py-2 px-4 font-semibold text-sm text-white bg-primary hover:bg-[color:var(--color-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

const secondaryBtn =
  "inline-flex items-center justify-center rounded-full py-2 px-4 font-semibold text-sm border border-border text-foreground hover:bg-muted transition-colors";
