import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, ApiError, download } from "@/lib/api";
import type { ProblemResponse } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/Table";

// The roster's CSV import. Choose a file, see what happens to every row, then
// confirm. Nothing is written until the confirm, and the server re-reads the
// file then rather than trusting this preview.

export interface ImportRow {
  line: number;
  firstName: string;
  lastName: string;
  email: string;
  status:
    "ready" | "invalid" | "duplicate" | "existing" | "deactivated" | "created" | "over_capacity";
  detail: string | null;
}

export interface ImportResponse {
  capacity: {
    limited: boolean;
    metered: boolean;
    headroom: number | null;
    ready: number;
    overBy: number;
    // A metered plan with a cap: the cap, the active learners so far this
    // period, and whether learners reached through dispatch are among them.
    // Null when there is no cap to quote.
    cap: number | null;
    active: number | null;
    includesDispatch: boolean;
  };
  counts: Record<ImportRow["status"], number>;
  rows: ImportRow[];
  resultsCsv: string | null;
}

const STATUS_LABEL: Record<ImportRow["status"], string> = {
  ready: "Ready",
  invalid: "Not valid",
  duplicate: "Duplicate",
  existing: "Skipped",
  deactivated: "Skipped",
  created: "Created",
  over_capacity: "Not created",
};

const STATUS_VARIANT: Record<
  ImportRow["status"],
  "success" | "destructive" | "warning" | "secondary"
> = {
  ready: "success",
  created: "success",
  invalid: "destructive",
  over_capacity: "destructive",
  duplicate: "warning",
  existing: "secondary",
  deactivated: "secondary",
};

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

function problemText(err: unknown, fallback: string) {
  if (err instanceof ApiError && err.problem) {
    const p = err.problem as ProblemResponse;
    return p.detail ?? p.title ?? fallback;
  }
  return fallback;
}

function saveCsv(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// Only the rows that need a person's attention are listed; the ready ones are
// a count, since a 2,000-row table of "Ready" says nothing.
function ProblemRows({ rows }: { rows: ImportRow[] }) {
  const shown = rows.filter((r) => r.status !== "ready" && r.status !== "created");
  if (shown.length === 0) return null;
  return (
    <div className="border-border mt-4 max-h-80 overflow-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Line</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Result</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((r) => (
            <TableRow key={r.line}>
              <TableCell className="font-mono">{r.line}</TableCell>
              <TableCell>{`${r.firstName} ${r.lastName}`.trim()}</TableCell>
              <TableCell>{r.email}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                {r.detail && <span className="text-muted-foreground ml-2 text-xs">{r.detail}</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// A metered plan counts a learner in a period they open a course, not when
// they are added, so an import changes nothing on the bill by itself. The
// manager is told the cap and where they stand, and warned, without being
// stopped, when the file could carry them over it. The words are Product's.
function MeteredCapNote({
  cap,
  active,
  ready,
  includesDispatch,
}: {
  cap: number;
  active: number;
  ready: number;
  includesDispatch: boolean;
}) {
  return (
    <>
      <p className="text-muted-foreground mt-3 text-sm">
        Your plan covers <strong>{cap.toLocaleString()}</strong> active learners a billing period.
        You're at <strong>{active.toLocaleString()}</strong> so far this period
        {includesDispatch && ", including learners reached through dispatch"}. Imported learners
        count only in a period they open a course, so nothing changes until they do.
      </p>
      {ready + active > cap && (
        <div
          role="status"
          className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          If everyone in this file opens a course this period, you'd be over your plan's cap.
          Nothing is blocked.{" "}
          <Link to="/billing" className="font-medium underline">
            How the cap works
          </Link>
        </div>
      )}
    </>
  );
}

function CapacityNote({ capacity }: { capacity: ImportResponse["capacity"] }) {
  if (capacity.metered && capacity.cap != null && capacity.active != null) {
    return (
      <MeteredCapNote
        cap={capacity.cap}
        active={capacity.active}
        ready={capacity.ready}
        includesDispatch={capacity.includesDispatch}
      />
    );
  }
  if (capacity.metered) {
    return (
      <p className="text-muted-foreground mt-3 text-sm">
        Imported learners count toward your active learners in the period they first launch a
        course.
      </p>
    );
  }
  if (!capacity.limited || capacity.overBy === 0) return null;

  const room = capacity.headroom ?? 0;
  return (
    <div
      role="status"
      className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
    >
      Your plan has room for {plural(room, "more learner", "more learners")}. The first{" "}
      {room.toLocaleString()} will be added and {plural(capacity.overBy, "learner", "learners")}{" "}
      will not.{" "}
      <Link to="/billing" className="font-medium underline">
        Upgrade your plan
      </Link>{" "}
      to add everyone.
    </div>
  );
}

export function LearnerImportCard({ tenantKey }: { tenantKey: number }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = (path: string) => {
    const body = new FormData();
    body.append("file", file!);
    return api<ImportResponse>(`/api/tenants/${tenantKey}/accounts/import${path}`, {
      method: "POST",
      body,
    });
  };

  const preview = useMutation({
    mutationFn: () => send("/preview"),
    onMutate: () => setError(null),
    onError: (err) => setError(problemText(err, "The file could not be read.")),
  });

  const commit = useMutation({
    mutationFn: () => send(""),
    onMutate: () => setError(null),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tenants", tenantKey, "users"] });
    },
    onError: (err) => setError(problemText(err, "The import failed.")),
  });

  const startOver = () => {
    setFile(null);
    setError(null);
    preview.reset();
    commit.reset();
    if (input.current) input.current.value = "";
  };

  const result = commit.data;
  const plan = preview.data;
  const importable = plan
    ? plan.capacity.limited
      ? Math.min(plan.capacity.ready, plan.capacity.headroom ?? 0)
      : plan.capacity.ready
    : 0;

  return (
    <Card className="mb-6 p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Import learners</h2>
        <button
          type="button"
          className="text-link text-sm hover:underline"
          onClick={() =>
            void download(
              `/api/tenants/${tenantKey}/accounts/import/template`,
              "learners-template.csv",
            )
          }
        >
          Download the template
        </button>
      </div>
      <p className="text-muted-foreground mb-4 text-sm">
        A CSV with First name, Last name and Email columns, up to 2,000 learners. Each new learner
        is emailed an invitation to set a password. Anyone already in your organization is skipped.
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {result ? (
        <>
          <p className="text-sm">
            {plural(result.counts.created, "learner was", "learners were")} added and invited.
            {result.counts.over_capacity > 0 &&
              ` ${plural(result.counts.over_capacity, "learner was", "learners were")} not added because the plan is full.`}
          </p>
          <ProblemRows rows={result.rows} />
          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              onClick={() => saveCsv(result.resultsCsv ?? "", "import-results.csv")}
            >
              Download results
            </Button>
            <Button variant="ghost" onClick={startOver}>
              Import another file
            </Button>
          </div>
        </>
      ) : plan ? (
        <>
          <p className="text-sm">
            {plural(plan.capacity.ready, "learner is", "learners are")} ready to import.
            {plan.counts.existing + plan.counts.deactivated > 0 &&
              ` ${plural(plan.counts.existing + plan.counts.deactivated, "is", "are")} already in your organization and will be skipped.`}
            {plan.counts.invalid + plan.counts.duplicate > 0 &&
              ` ${plural(plan.counts.invalid + plan.counts.duplicate, "line needs", "lines need")} fixing and will be skipped.`}
          </p>
          <CapacityNote capacity={plan.capacity} />
          <ProblemRows rows={plan.rows} />
          <div className="mt-4 flex gap-2">
            <Button onClick={() => commit.mutate()} disabled={importable === 0 || commit.isPending}>
              {commit.isPending
                ? "Importing…"
                : `Import ${plural(importable, "learner", "learners")}`}
            </Button>
            <Button variant="ghost" onClick={startOver} disabled={commit.isPending}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="import-file" className="sr-only">
            CSV file
          </label>
          <input
            ref={input}
            id="import-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <Button onClick={() => preview.mutate()} disabled={!file || preview.isPending}>
            {preview.isPending ? "Checking…" : "Check file"}
          </Button>
        </div>
      )}
    </Card>
  );
}
