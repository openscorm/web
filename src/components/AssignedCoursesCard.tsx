import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import type { ProblemResponse } from "@/lib/types";
import { DetailCard } from "@/components/DetailCard";
import { StatusBadge } from "@/components/StatusBadge";
import { TableStateRow } from "@/components/TableStateRow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/Table";
import { AssignCoursesDialog, type AssignTarget } from "@/components/AssignCoursesDialog";

interface AssignedCourse {
  courseKey: number;
  courseTitle: string | null;
  courseSlug: string;
  courseDeleted: boolean;
  status: string;
  assignedAt: string;
  assignedByName: string | null;
  // Whether the learner ever opened it. Unassign applies only until then;
  // after that the record is evidence and stays.
  launched: boolean;
}

// One learner's assigned courses on their account page, with Assign and
// Unassign. A course they opened without an assignment is not listed here;
// Reports has every record.
export function AssignedCoursesCard({
  tenantKey,
  accountKey,
  name,
}: {
  tenantKey: number;
  accountKey: number;
  name: string;
}) {
  const qc = useQueryClient();
  const queryKey = ["tenants", tenantKey, "assignments", accountKey];
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [pending, setPending] = useState<AssignedCourse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey,
    queryFn: async () =>
      api<AssignedCourse[]>(`/api/tenants/${tenantKey}/assignments?accountKey=${accountKey}`),
  });

  const unassign = useMutation({
    mutationFn: async (courseKey: number) =>
      api<void>(
        `/api/tenants/${tenantKey}/assignments?accountKey=${accountKey}&courseKey=${courseKey}`,
        { method: "DELETE" },
      ),
    onSuccess: async () => {
      setPending(null);
      setError(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey }),
        qc.invalidateQueries({ queryKey: ["tenants", tenantKey, "reports"] }),
      ]);
    },
    onError: async (err) => {
      setPending(null);
      const p = err instanceof ApiError ? (err.problem as ProblemResponse | undefined) : undefined;
      setError(p?.detail ?? p?.title ?? "Could not unassign this course. Try again.");
      await qc.invalidateQueries({ queryKey });
    },
  });

  const rows = list.data ?? [];

  return (
    <DetailCard
      title="Assigned courses"
      action={
        <Button
          type="button"
          size="sm"
          onClick={() => setAssignTarget({ kind: "accounts", accountKeys: [accountKey], name })}
        >
          Assign courses
        </Button>
      }
    >
      {error && (
        <div
          role="alert"
          className="m-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Course</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Assigned</TableHead>
            <TableHead>Assigned by</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.isLoading && <TableStateRow colSpan={5}>Loading…</TableStateRow>}
          {list.isError && (
            <TableStateRow colSpan={5}>Could not load assigned courses</TableStateRow>
          )}
          {list.data && rows.length === 0 && (
            <TableStateRow colSpan={5}>No courses assigned yet</TableStateRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.courseKey}>
              <TableCell>
                {r.courseDeleted ? (
                  <span>{r.courseTitle || r.courseSlug}</span>
                ) : (
                  <Link to={`/courses/${r.courseKey}`} className="text-link hover:underline">
                    {r.courseTitle || r.courseSlug}
                  </Link>
                )}
                {r.courseDeleted && (
                  <Badge variant="secondary" className="ml-2">
                    Deleted
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <StatusBadge status={r.status} />
              </TableCell>
              <TableCell className="text-muted-foreground font-mono text-xs">
                {formatDate(r.assignedAt)}
              </TableCell>
              <TableCell>{r.assignedByName ?? "Not recorded"}</TableCell>
              <TableCell className="text-right">
                {!r.launched && (
                  <Button type="button" size="sm" variant="outline" onClick={() => setPending(r)}>
                    Unassign
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={`Unassign ${pending?.courseTitle || pending?.courseSlug || "course"}?`}
        description={`${name} has not opened it, so no record is lost. It stops showing in Reports as Not started.`}
        confirmLabel="Unassign course"
        busyLabel="Unassigning…"
        busy={unassign.isPending}
        onConfirm={() => pending && unassign.mutate(pending.courseKey)}
      />

      <AssignCoursesDialog
        tenantKey={tenantKey}
        target={assignTarget}
        onClose={() => setAssignTarget(null)}
      />
    </DetailCard>
  );
}
