import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import type { ProblemResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { CoursePicker } from "@/components/CoursePicker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Who an assignment goes to: any active account, managers included, since
// managers take courses too. "search" is the roster's select-all-matching: the
// server resolves the search itself, because the roster pages and a large
// organization has thousands of people.
export type AssignTarget =
  | { kind: "accounts"; accountKeys: number[]; name?: string }
  | { kind: "search"; search: string; count: number };

interface AssignResult {
  assigned: number;
  alreadyAssigned: number;
  alreadyCompleted: number;
  skippedDeactivated: number;
  // One per person with something new, however many courses that was.
  emailsQueued: number;
}

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

function audience(target: AssignTarget): string {
  if (target.kind === "search") {
    const people = plural(target.count, "person", "people");
    return target.search.trim()
      ? `To all ${people} matching "${target.search.trim()}"`
      : `To all ${people} in your organization`;
  }
  if (target.accountKeys.length === 1 && target.name) return `To ${target.name}`;
  return `To ${plural(target.accountKeys.length, "selected person", "selected people")}`;
}

// The counts are person and course pairs, except deactivated accounts, which
// are counted once each however many courses were picked.
function summary(r: AssignResult, notify: boolean): string[] {
  const lines = [plural(r.assigned, "new assignment", "new assignments")];
  if (r.alreadyAssigned > 0) lines.push(`${r.alreadyAssigned.toLocaleString()} already assigned`);
  if (r.alreadyCompleted > 0)
    lines.push(`${r.alreadyCompleted.toLocaleString()} already completed, left as they were`);
  if (r.skippedDeactivated > 0)
    lines.push(
      `${plural(r.skippedDeactivated, "deactivated account", "deactivated accounts")} skipped`,
    );
  if (!notify) lines.push("No emails sent");
  else if (r.emailsQueued > 0)
    lines.push(`Emailing ${plural(r.emailsQueued, "person", "people")} about their new courses`);
  return lines;
}

export function AssignCoursesDialog({
  tenantKey,
  target,
  onAssigned,
  onClose,
}: {
  tenantKey: number;
  // Null while the dialog is closed.
  target: AssignTarget | null;
  onAssigned?: () => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssignResult | null>(null);
  // On by default: an assignment nobody hears about leaves the manager to
  // email everyone by hand. Untick it to stage assignments quietly.
  const [notify, setNotify] = useState(true);

  const assign = useMutation({
    mutationFn: async () => {
      const courseKeys = [...chosen];
      const body =
        target?.kind === "search"
          ? { learnerSearch: target.search.trim(), courseKeys, notify }
          : { accountKeys: target?.accountKeys ?? [], courseKeys, notify };
      return api<AssignResult>(`/api/tenants/${tenantKey}/assignments`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: async (r) => {
      setError(null);
      setResult(r);
      onAssigned?.();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["tenants", tenantKey, "assignments"] }),
        qc.invalidateQueries({ queryKey: ["tenants", tenantKey, "reports"] }),
      ]);
    },
    onError: (err) => {
      const p = err instanceof ApiError ? (err.problem as ProblemResponse | undefined) : undefined;
      setError(p?.detail ?? p?.title ?? "Could not assign these courses. Try again.");
    },
  });

  function close() {
    setChosen(new Set());
    setError(null);
    setResult(null);
    setNotify(true);
    assign.reset();
    onClose();
  }

  function toggle(courseKey: number) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(courseKey)) next.delete(courseKey);
      else next.add(courseKey);
      return next;
    });
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{result ? "Courses assigned" : "Assign courses"}</DialogTitle>
          {target && <DialogDescription>{audience(target)}</DialogDescription>}
        </DialogHeader>

        {result ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {summary(result, notify).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col gap-3">
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              >
                {error}
              </div>
            )}
            {target && <CoursePicker tenantKey={tenantKey} chosen={chosen} onToggle={toggle} />}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
              />
              <span>Email learners about their new courses</span>
            </label>
            <p className="text-muted-foreground text-xs">
              One email per person, listing every course new to them. Someone who has never set a
              password gets their invitation with the courses in it. A course a learner already
              completed is left as it is, and nobody is emailed about a course they already had.
            </p>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={close} disabled={assign.isPending}>
                Cancel
              </Button>
              <Button
                onClick={() => assign.mutate()}
                disabled={chosen.size === 0 || assign.isPending}
              >
                {assign.isPending
                  ? "Assigning…"
                  : chosen.size === 0
                    ? "Assign courses"
                    : `Assign ${plural(chosen.size, "course", "courses")}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
