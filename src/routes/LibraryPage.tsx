import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError, apiBase } from "@/lib/api";
import { packageTooLarge } from "@/lib/packageSize";
import { capBand } from "@/lib/analytics";
import { formatDateTime } from "@/lib/dates";
import { tierLabel } from "@/lib/tiers";
import type { ProblemResponse } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { useImpression } from "@/hooks/useImpression";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FileDropzone } from "@/components/ui/file-dropzone";

interface CourseRow {
  courseKey: number;
  courseSlug: string;
  title: string;
  description: string | null;
  version: string;
  tag: string | null;
  standard: string;
  courseSizeInKB: number;
  courseSize: string;
  uploadedAt: string;
  uploadedByEmail: string;
  attempts: number;
  status: string | null;
  score: string | null;
  duration: string | null;
  launcherStatusHtml: string;
  launchUrl: string;
  manageUrl: string;
  restartUrl: string | null;
  // "package" for anything uploaded as a zip, "pdf" for an ingested
  // policy document. documentVersion is null unless sourceType is "pdf".
  sourceType: string | null;
  documentVersion: string | null;
}

interface CapacitySnapshot {
  tenantType: string;
  courseCount: number;
  courseLimit: number;
  isCoursesUnlimited: boolean;
  isCoursesOverLimit: boolean;
  isCoursesNearLimit: boolean;
  recommendedTier: string | null;
  // The plan's package ceiling, so an oversized file is
  // refused here before anyone waits through the upload to be refused there.
  packageLimitMb: number;
}

export function LibraryPage() {
  const { user } = useAuth();
  const tenantKey = user?.tenantKey;
  const isManager = !!user && (user.isManager || user.isOperator);
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  // The card names the file while it uploads, and Cancel needs
  // something to abort. api() spreads its init into fetch, so an AbortSignal
  // costs nothing in the shared helper.
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // One dialog, no wizard.
  const docFileRef = useRef<HTMLInputElement>(null);
  const [docOpen, setDocOpen] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docVersion, setDocVersion] = useState("");
  const [docAck, setDocAck] = useState(DEFAULT_ACKNOWLEDGMENT);
  const [docError, setDocError] = useState<string | null>(null);
  const [docStatus, setDocStatus] = useState<string | null>(null);
  // The course awaiting a delete confirmation; null when the dialog is closed.
  const [pendingDelete, setPendingDelete] = useState<{ courseSlug: string; title: string } | null>(
    null,
  );

  const list = useQuery({
    queryKey: ["tenants", tenantKey, "courses"],
    queryFn: async () => api<CourseRow[]>(`/api/tenants/${tenantKey}/courses`),
    enabled: !!tenantKey,
  });

  const capacity = useQuery({
    queryKey: ["tenants", tenantKey, "capacity"],
    queryFn: async () => api<CapacitySnapshot>(`/api/tenants/${tenantKey}/capacity`),
    enabled: !!tenantKey && isManager,
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const controller = new AbortController();
      abortRef.current = controller;
      const form = new FormData();
      form.append("file", file);
      return api<CourseRow>(`/api/tenants/${tenantKey}/courses`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
    },
    onSuccess: async (row) => {
      setUploadError(null);
      setUploadStatus(`Uploaded "${row.title || row.courseSlug}".`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["tenants", tenantKey, "courses"] }),
        qc.invalidateQueries({ queryKey: ["tenants", tenantKey, "capacity"] }),
      ]);
    },
    onError: (err) => {
      setUploadStatus(null);
      // A cancel is the person's own act. Reporting it back at them as a
      // failure would be the app telling them something went wrong when
      // exactly what they asked for happened.
      if (err instanceof DOMException && err.name === "AbortError") {
        setUploadError(null);
        return;
      }
      if (err instanceof ApiError && err.problem) {
        const p = err.problem as ProblemResponse;
        setUploadError(p.detail ?? p.title ?? "Upload failed.");
      } else {
        setUploadError("Upload failed.");
      }
    },
    onSettled: () => {
      abortRef.current = null;
      setUploadingName(null);
    },
  });

  // Selecting a file is the whole action, so validation runs here
  // rather than behind a second click. The size rule stays on this side
  // because the capacity snapshot lives here.
  const beginUpload = (file: File) => {
    const tooLarge = packageTooLarge(file.size, capacity.data);
    if (tooLarge) {
      setUploadStatus(null);
      setUploadError(tooLarge);
      return;
    }
    setUploadError(null);
    setUploadStatus(null);
    setUploadingName(file.name);
    upload.mutate(file);
  };

  // Separate mutation from the zip upload because the two send
  // different things: one posts an artifact, the other posts a document plus
  // the facts the record needs. Sharing one mutation would mean a mode flag.
  const ingest = useMutation({
    mutationFn: async (form: FormData) =>
      api<CourseRow>(`/api/tenants/${tenantKey}/courses/pdf`, {
        method: "POST",
        body: form,
      }),
    onSuccess: async (row) => {
      setDocError(null);
      setDocStatus(`Added "${row.title}" version ${row.documentVersion} to your library.`);
      setDocTitle("");
      setDocVersion("");
      setDocAck(DEFAULT_ACKNOWLEDGMENT);
      if (docFileRef.current) docFileRef.current.value = "";
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["tenants", tenantKey, "courses"] }),
        qc.invalidateQueries({ queryKey: ["tenants", tenantKey, "capacity"] }),
      ]);
    },
    onError: (err) => {
      setDocStatus(null);
      if (err instanceof ApiError && err.problem) {
        const p = err.problem as ProblemResponse;
        setDocError(p.detail ?? p.title ?? "Upload failed.");
      } else {
        setDocError("Upload failed.");
      }
    },
  });

  const remove = useMutation({
    mutationFn: async (slug: string) =>
      api<void>(`/api/tenants/${tenantKey}/courses/${encodeURIComponent(slug)}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      setPendingDelete(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["tenants", tenantKey, "courses"] }),
        qc.invalidateQueries({ queryKey: ["tenants", tenantKey, "capacity"] }),
      ]);
    },
  });

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    const k = filter.trim().toLowerCase();
    if (!k) return rows;
    return rows.filter(
      (r) =>
        (r.title ?? "").toLowerCase().includes(k) ||
        r.courseSlug.toLowerCase().includes(k) ||
        (r.tag ?? "").toLowerCase().includes(k),
    );
  }, [list.data, filter]);

  const banner = buildBanner(capacity.data);
  const uploadDisabled = capacity.data?.isCoursesOverLimit ?? false;

  // Group 3 client impressions, deduped per page-view. The
  // banner always carries a View plans CTA; upload_blocked_shown is the
  // disabled-upload state every at-cap trial actually meets.
  useImpression("capacity_warning_shown", Boolean(isManager && banner), {
    dimension: "course",
    surface: "library_banner",
    cta_present: true,
    pct_of_cap_band: capacity.data
      ? capBand(capacity.data.courseCount, capacity.data.courseLimit)
      : null,
  });
  useImpression("upload_blocked_shown", Boolean(isManager && uploadDisabled), {
    dimension: "course",
    surface: "library_upload",
  });

  return (
    <AppShell>
      <PageHeader
        title="Library"
        subtitle="SCORM and xAPI packages available to your tenant"
        restricted={[
          "Manager or operator access only. Learners are redirected to My courses.",
          "The /library route is wrapped in RequireManager.",
          <>
            Server-side, uploads and deletes on{" "}
            <code className="font-mono">/api/tenants/&#123;tenantKey&#125;/courses</code> require
            manager or operator; the course list itself is readable by any member of the tenant (it
            also feeds My courses).
          </>,
        ]}
      />

      {isManager && banner && (
        <div
          role="alert"
          className={`mb-6 rounded-lg border px-4 py-3 text-sm ${banner.className}`}
        >
          <strong>{banner.title}</strong> {banner.body}{" "}
          <a href="/billing?from=library_banner" className="underline">
            View plans
          </a>
        </div>
      )}

      {isManager && (
        <div className="border-border bg-card text-card-foreground mb-6 rounded-xl border p-6">
          <h2 className="mb-3 text-lg font-semibold">Upload a SCORM package</h2>
          {uploadError && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            >
              {uploadError}
            </div>
          )}
          {uploadStatus && !uploadError && (
            <div className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
              {uploadStatus}
            </div>
          )}
          {upload.isPending ? (
            <div className="border-border bg-muted/40 flex items-center gap-3 rounded-lg border px-4 py-3">
              <span
                aria-hidden="true"
                className="border-muted-foreground/30 border-t-primary h-4 w-4 animate-spin rounded-full border-2"
              />
              <span className="text-sm">
                Uploading <span className="font-mono">{uploadingName}</span>
              </span>
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="text-muted-foreground hover:text-foreground ml-auto text-sm underline"
              >
                Cancel
              </button>
            </div>
          ) : (
            <FileDropzone
              accept=".zip"
              disabled={uploadDisabled}
              label="Upload a SCORM package"
              onFile={beginUpload}
              hint={
                uploadDisabled
                  ? "Upload disabled - upgrade plan"
                  : capacity.data?.packageLimitMb
                    ? `Drop a .zip here, or click to browse. Up to ${capacity.data.packageLimitMb} MB`
                    : "Drop a .zip here, or click to browse"
              }
            />
          )}
        </div>
      )}

      {isManager && (
        <div className="border-border bg-card text-card-foreground mb-6 rounded-xl border p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Add a document</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Upload a PDF and we build the course. Learners read every page, then confirm
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDocOpen((v) => !v)}
              className={secondaryBtn}
              aria-expanded={docOpen}
            >
              {docOpen ? "Cancel" : "Add document"}
            </button>
          </div>

          {docOpen && (
            <div className="mt-5 grid gap-4">
              {docError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                >
                  {docError}
                </div>
              )}

              <label className="block text-sm">
                <span className="mb-1 block font-medium">Document (PDF)</span>
                <input
                  ref={docFileRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={uploadDisabled || ingest.isPending}
                  className="file:bg-muted file:text-foreground hover:file:bg-muted/80 text-sm file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-2 file:text-sm file:font-medium"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium">Title</span>
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  disabled={uploadDisabled || ingest.isPending}
                  className={inputClass}
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium">Document version</span>
                <input
                  type="text"
                  value={docVersion}
                  onChange={(e) => setDocVersion(e.target.value)}
                  disabled={uploadDisabled || ingest.isPending}
                  placeholder="3.2"
                  className={`${inputClass} font-mono`}
                />
                <span className="text-muted-foreground mt-1 block text-xs">
                  Shown on every completion record. New versions are published as revisions
                </span>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium">Acknowledgment statement</span>
                <textarea
                  value={docAck}
                  onChange={(e) => setDocAck(e.target.value)}
                  rows={2}
                  disabled={uploadDisabled || ingest.isPending}
                  className={inputClass}
                />
                <span className="text-muted-foreground mt-1 block text-xs">
                  This is what the learner confirms. It cannot be changed after publishing
                </span>
              </label>

              <div>
                <button
                  type="button"
                  disabled={uploadDisabled || ingest.isPending}
                  onClick={() => {
                    const file = docFileRef.current?.files?.[0];
                    if (!file) {
                      setDocError("Choose a PDF document first.");
                      return;
                    }
                    if (!docTitle.trim()) {
                      setDocError("Enter a title for the document.");
                      return;
                    }
                    if (!docVersion.trim()) {
                      setDocError("Enter a document version.");
                      return;
                    }
                    const tooLarge = packageTooLarge(file.size, capacity.data);
                    if (tooLarge) {
                      setDocError(tooLarge);
                      return;
                    }
                    setDocError(null);
                    const form = new FormData();
                    form.append("file", file);
                    form.append("title", docTitle.trim());
                    form.append("documentVersion", docVersion.trim());
                    form.append("acknowledgmentText", docAck.trim());
                    ingest.mutate(form);
                  }}
                  className={primaryBtn}
                >
                  {ingest.isPending
                    ? "Adding…"
                    : uploadDisabled
                      ? "Upload disabled - upgrade plan"
                      : "Add document"}
                </button>
              </div>
            </div>
          )}

          {docStatus && !docError && (
            <div className="mt-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
              {docStatus}
            </div>
          )}
        </div>
      )}

      <div className="mb-4">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by course title, tag, or package ID..."
          className={inputClass}
        />
      </div>

      {list.isLoading && <p className="text-muted-foreground text-sm">Loading courses…</p>}
      {list.data?.length === 0 && (
        <p className="text-muted-foreground text-sm">No courses yet. Upload a SCORM zip above.</p>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <div
            key={c.courseKey}
            className="border-border bg-card text-card-foreground flex flex-col rounded-xl border p-5"
          >
            <h4 className="mb-3 text-lg font-semibold">{c.title || c.courseSlug}</h4>
            {/*
              A document leads with its revision because that is
              the fact the record turns on; a package has no revision to show
              and keeps the line it always had.
            */}
            {c.sourceType === "pdf" && c.documentVersion && (
              <div className="text-muted-foreground mb-1 text-xs">
                Policy document, version <span className="font-mono">{c.documentVersion}</span>
              </div>
            )}
            <div className="text-muted-foreground mb-1 text-xs">Package ID {c.courseSlug}</div>
            <div className="text-muted-foreground mb-1 text-xs">
              SCORM {c.version} — {c.courseSize}
            </div>
            <div className="text-muted-foreground mb-3 text-xs">
              Uploaded {formatDateTime(c.uploadedAt)} by {c.uploadedByEmail}
            </div>
            {c.tag && (
              <div className="mb-3">
                <span className="bg-accent text-accent-foreground inline-block rounded px-2 py-0.5 text-xs">
                  {c.tag}
                </span>
              </div>
            )}
            <div
              className="text-muted-foreground mb-4 text-xs"
              dangerouslySetInnerHTML={{ __html: c.launcherStatusHtml }}
            />
            {c.restartUrl && (
              <a
                href={absoluteUrl(c.restartUrl)}
                className="text-muted-foreground hover:text-foreground mb-3 text-xs hover:underline"
              >
                Restart
              </a>
            )}
            <div className="mt-auto flex flex-wrap items-center gap-2">
              <Link to={c.launchUrl} className={primaryBtn}>
                Launch
              </Link>
              {isManager && (
                <>
                  <Link to={c.manageUrl} className={secondaryBtn}>
                    Manage
                  </Link>
                  <button
                    type="button"
                    onClick={() =>
                      setPendingDelete({
                        courseSlug: c.courseSlug,
                        title: c.title || c.courseSlug,
                      })
                    }
                    className="ml-auto text-xs text-red-600 hover:underline dark:text-red-400"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Delete "${pendingDelete?.title ?? ""}"?`}
        description="This removes the package and all learner progress. It cannot be undone."
        confirmLabel="Delete course"
        busyLabel="Deleting…"
        busy={remove.isPending}
        onConfirm={() => {
          if (pendingDelete) remove.mutate(pendingDelete.courseSlug);
        }}
      />
    </AppShell>
  );
}

// Prefilled and editable: compliance buyers frequently have
// legally reviewed wording, and forcing platform copy would make the record say
// something their counsel did not approve. Whatever ships is immutable per
// version, so this default is a starting point and never a rewrite of
// an existing record.
const DEFAULT_ACKNOWLEDGMENT = "I confirm that I have read and understood this document.";

function buildBanner(cap?: CapacitySnapshot) {
  if (!cap) return null;
  if (cap.isCoursesOverLimit) {
    return {
      title: "Over capacity.",
      body: `You have ${cap.courseCount} active courses but your ${tierLabel(cap.tenantType)} plan allows ${cap.courseLimit}. Archive courses or upgrade to keep uploading.`,
      className:
        "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
    };
  }
  if (cap.isCoursesNearLimit) {
    return {
      title: "Approaching course limit.",
      body: `You are using ${cap.courseCount} of ${cap.courseLimit} courses on the ${tierLabel(cap.tenantType)} plan.`,
      className:
        "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
    };
  }
  return null;
}

function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (!apiBase) return path;
  return apiBase + path;
}

const inputClass =
  "block w-full py-2.5 px-3 rounded-lg border border-[color:var(--color-input-border)] bg-background text-foreground text-[15px] focus:outline-none focus:border-primary focus:ring-2 focus:ring-[color:var(--color-input-focus-ring)] transition-colors";

const primaryBtn =
  "inline-flex items-center justify-center rounded-full py-2 px-4 font-semibold text-sm text-white bg-primary hover:bg-[color:var(--color-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

const secondaryBtn =
  "inline-flex items-center justify-center rounded-full py-2 px-4 font-semibold text-sm border border-border text-foreground hover:bg-muted transition-colors";
