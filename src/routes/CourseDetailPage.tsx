import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ChevronDown, Download } from "lucide-react";

import { api, ApiError, download } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import type { ProblemResponse } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { InvitationLinksSection } from "@/components/InvitationLinksSection";

interface CourseDetail {
  courseKey: number;
  courseSlug: string;
  title: string;
  description: string | null;
  version: string;
  standard: string;
  courseSize: string;
  courseSizeInKB: number;
  tag: string | null;
  navigationPosition: string;
  navigationExitText: string;
  publicInvitationUrl: string;
  publicInvitationBlocked: boolean;
  manifestHeading: string;
  manifestHtml: string;
  launchUrl: string;
  // Present only for an ingested policy document.
  sourceType: string | null;
  documentVersion: string | null;
  generatorVersion: string | null;
  acknowledgmentText: string | null;
  retiredAt: string | null;
  supersededBy: number | null;
  supersededByVersion: string | null;
  incompleteEnrollments: number;
}

// The stranded-learner sentence is omitted at zero rather
// than rendered as "0 learners", because naming a consequence that does not
// exist trains managers to click through the one that does.
// Title and body are returned separately so the confirmation can be a dialog
// rather than one run-on string in a browser prompt.
function buildRevisionConfirmation(
  c: CourseDetail,
  newVersion: string,
): { title: string; description: string } {
  const head = `Version ${c.documentVersion} is retired: no new enrollments, all records kept.`;
  const title = `Publish version ${newVersion}?`;

  if (c.incompleteEnrollments === 0) return { title, description: head };

  const learners = c.incompleteEnrollments === 1 ? "learner hasn't" : "learners haven't";
  return {
    title,
    description:
      `${head} ${c.incompleteEnrollments} ${learners} completed version ${c.documentVersion}; ` +
      "you can re-enroll them in the new version from reports.",
  };
}

const positions = ["Left", "Center", "Right"];

export function CourseDetailPage() {
  const { courseKey } = useParams<{ courseKey: string }>();
  const { user } = useAuth();
  const tenantKey = user?.tenantKey;
  const qc = useQueryClient();
  const nav = useNavigate();

  const [tag, setTag] = useState("");
  const [position, setPosition] = useState("Left");
  const [exitText, setExitText] = useState("Exit");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // The new-revision action is the only mutation path a document
  // has, so it lives here rather than in the library grid.
  const revFileRef = useRef<HTMLInputElement>(null);
  const [revOpen, setRevOpen] = useState(false);
  const [revVersion, setRevVersion] = useState("");
  const [revAck, setRevAck] = useState("");
  const [revError, setRevError] = useState<string | null>(null);
  // The already-validated revision upload awaiting confirmation. Holding the
  // built FormData means the file is captured at click time: the input can be
  // cleared or changed while the dialog is open without changing what ships.
  const [pendingRevision, setPendingRevision] = useState<FormData | null>(null);

  const detail = useQuery({
    queryKey: ["tenants", tenantKey, "courses", courseKey],
    queryFn: async () => api<CourseDetail>(`/api/tenants/${tenantKey}/courses/${courseKey}`),
    enabled: !!tenantKey && !!courseKey,
  });

  useEffect(() => {
    if (detail.data) {
      setTag(detail.data.tag ?? "");
      setPosition(detail.data.navigationPosition || "Left");
      setExitText(detail.data.navigationExitText || "Exit");
    }
  }, [detail.data]);

  const save = useMutation({
    mutationFn: async () =>
      api<void>(`/api/tenants/${tenantKey}/courses/${courseKey}`, {
        method: "PATCH",
        body: JSON.stringify({
          tag: tag.trim() || null,
          navigationPosition: position,
          navigationExitText: exitText,
        }),
      }),
    onSuccess: async () => {
      setSaveError(null);
      setSaveStatus("Saved.");
      await qc.invalidateQueries({ queryKey: ["tenants", tenantKey, "courses", courseKey] });
      await qc.invalidateQueries({ queryKey: ["tenants", tenantKey, "courses"] });
    },
    onError: (err) => {
      setSaveStatus(null);
      if (err instanceof ApiError && err.problem) {
        const p = err.problem as ProblemResponse;
        setSaveError(p.detail ?? p.title ?? "Save failed.");
      } else {
        setSaveError("Save failed.");
      }
    },
  });

  const publishRevision = useMutation({
    mutationFn: async (form: FormData) =>
      api<{ courseKey: number }>(`/api/tenants/${tenantKey}/courses/${courseKey}/revisions`, {
        method: "POST",
        body: form,
      }),
    onSuccess: async (row) => {
      setRevError(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["tenants", tenantKey, "courses"] }),
        qc.invalidateQueries({ queryKey: ["tenants", tenantKey, "capacity"] }),
      ]);
      // The old detail page now describes a retired revision, so the manager
      // lands on the one that is actually current.
      nav(`/courses/${row.courseKey}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.problem) {
        const p = err.problem as ProblemResponse;
        setRevError(p.detail ?? p.title ?? "Upload failed.");
      } else {
        setRevError("Upload failed.");
      }
      setPendingRevision(null);
    },
  });

  async function onDownload() {
    setDownloadError(null);
    setDownloading(true);
    try {
      await download(
        `/api/tenants/${tenantKey}/courses/${courseKey}/download`,
        `${detail.data?.courseSlug ?? "course"}.zip`,
        "application/zip",
      );
    } catch (err) {
      const message =
        err instanceof ApiError && err.problem
          ? ((err.problem as ProblemResponse).detail ??
            (err.problem as ProblemResponse).title ??
            "Download failed.")
          : "Download failed.";
      setDownloadError(message);
    } finally {
      setDownloading(false);
    }
  }

  if (detail.isLoading) {
    return (
      <AppShell>
        <p className="text-muted-foreground text-sm">Loading…</p>
      </AppShell>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <AppShell>
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Course not found</h1>
        </div>
        <button type="button" onClick={() => nav("/library")} className={secondaryBtn}>
          Back to library
        </button>
      </AppShell>
    );
  }

  const c = detail.data;
  const isDocument = c.sourceType === "pdf";
  const isRetired = !!c.retiredAt;

  return (
    <AppShell>
      <div className="text-muted-foreground mb-1 text-xs">
        <a href="/dashboard" className="hover:underline">
          Admin
        </a>{" "}
        ·{" "}
        <a href="/library" className="hover:underline">
          Courses
        </a>{" "}
        · Detail
      </div>
      <PageHeader
        title={c.title || c.courseSlug}
        restricted={[
          "Manager or operator access only. Learners are redirected to the library.",
          "The /courses/:courseKey route is wrapped in RequireManager.",
          <>
            Server-side,{" "}
            <code className="font-mono">
              GET /api/tenants/&#123;tenantKey&#125;/courses/&#123;courseKey&#125;
            </code>{" "}
            allows any member of the tenant; course deletion requires manager or operator. Accounts
            outside the tenant get 403 (operators exempt).
          </>,
        ]}
      />

      {/* Retired banner: the existing inactive treatment, with no new visual
          state invented for this feature. */}
      {isDocument && isRetired && (
        <div
          role="status"
          className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          Version <span className="font-mono">{c.documentVersion}</span>, retired{" "}
          {formatDateTime(c.retiredAt!)}.{" "}
          {c.supersededByVersion && (
            <>
              Superseded by version <span className="font-mono">{c.supersededByVersion}</span>.{" "}
            </>
          )}
          Records remain in reports and exports.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-4">
        <div className="space-y-6 lg:col-span-1">
          <div className="border-border bg-card text-card-foreground rounded-xl border p-5">
            <h5 className="mb-3 font-semibold">
              {isDocument ? "Policy document details" : "SCORM package details"}
            </h5>
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              {isDocument && (
                <>
                  <dt className="text-muted-foreground pr-2 text-right">Document version</dt>
                  <dd className="font-mono">{c.documentVersion}</dd>
                  <dt className="text-muted-foreground pr-2 text-right">Generator build</dt>
                  <dd className="font-mono">{c.generatorVersion}</dd>
                </>
              )}
              <dt className="text-muted-foreground pr-2 text-right">File format</dt>
              <dd>SCORM {c.version}</dd>
              <dt className="text-muted-foreground pr-2 text-right">File size</dt>
              <dd>{c.courseSize}</dd>
            </dl>
            {isDocument && c.acknowledgmentText && (
              <div className="mt-3">
                <div className="text-muted-foreground text-xs">Learners confirm</div>
                <p className="mt-1 text-sm italic">“{c.acknowledgmentText}”</p>
              </div>
            )}

            <div className="mt-4">
              <button
                type="button"
                disabled={downloading}
                onClick={onDownload}
                className={secondaryBtn}
              >
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                {downloading ? "Preparing…" : "Download package"}
              </button>
              <p className="text-muted-foreground mt-1.5 text-xs">
                Downloads the extracted package as a zip
              </p>
              {downloadError && (
                <div
                  role="alert"
                  className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                >
                  {downloadError}
                </div>
              )}
            </div>
          </div>

          {/*
            Only mutation path a document has: no edit-in-place
            for the PDF, the version, or the wording.
          */}
          {isDocument && !isRetired && (
            <div className="border-border bg-card text-card-foreground rounded-xl border p-5">
              <h5 className="mb-1 font-semibold">Publish a revision</h5>
              <p className="text-muted-foreground mb-3 text-xs">
                Version <span className="font-mono">{c.documentVersion}</span> cannot be edited.
                Upload a revised document to replace it
              </p>

              {revError && (
                <div
                  role="alert"
                  className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                >
                  {revError}
                </div>
              )}

              {!revOpen ? (
                <button type="button" onClick={() => setRevOpen(true)} className={secondaryBtn}>
                  New revision
                </button>
              ) : (
                <div className="grid gap-3">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Revised document (PDF)</span>
                    <input
                      ref={revFileRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      disabled={publishRevision.isPending}
                      className="file:bg-muted file:text-foreground hover:file:bg-muted/80 text-sm file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-2 file:text-sm file:font-medium"
                    />
                  </label>

                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">New document version</span>
                    <input
                      type="text"
                      value={revVersion}
                      onChange={(e) => setRevVersion(e.target.value)}
                      disabled={publishRevision.isPending}
                      className={`${inputClass} font-mono`}
                    />
                  </label>

                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Acknowledgment statement</span>
                    <textarea
                      value={revAck}
                      onChange={(e) => setRevAck(e.target.value)}
                      rows={2}
                      placeholder={c.acknowledgmentText ?? ""}
                      disabled={publishRevision.isPending}
                      className={inputClass}
                    />
                    <span className="text-muted-foreground mt-1 block text-xs">
                      Leave blank to keep the current wording
                    </span>
                  </label>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={publishRevision.isPending}
                      onClick={() => {
                        const file = revFileRef.current?.files?.[0];
                        if (!file) {
                          setRevError("Choose the revised PDF first.");
                          return;
                        }
                        if (!revVersion.trim()) {
                          setRevError("Enter the new document version.");
                          return;
                        }
                        setRevError(null);
                        const form = new FormData();
                        form.append("file", file);
                        form.append("documentVersion", revVersion.trim());
                        if (revAck.trim()) form.append("acknowledgmentText", revAck.trim());
                        setPendingRevision(form);
                      }}
                      className={primaryBtn}
                    >
                      {publishRevision.isPending ? "Publishing…" : "Publish revision"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRevOpen(false);
                        setRevError(null);
                      }}
                      className={secondaryBtn}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="border-border bg-card text-card-foreground rounded-xl border p-5">
            <h5 className="mb-3 font-semibold">Settings</h5>
            {saveError && (
              <div
                role="alert"
                className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              >
                {saveError}
              </div>
            )}
            {saveStatus && !saveError && (
              <div className="mb-3 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
                {saveStatus}
              </div>
            )}
            <div className="mb-3">
              <label htmlFor="tag" className="mb-1.5 block text-sm font-medium">
                Tag
              </label>
              <input
                id="tag"
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className={inputClass}
              />
            </div>
            <h5 className="mt-4 mb-2 font-semibold">Navigation menu</h5>
            <div className="mb-3">
              <label htmlFor="position" className="mb-1.5 block text-sm font-medium">
                Position
              </label>
              <div className="relative">
                <select
                  id="position"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  className={`${inputClass} appearance-none pr-10`}
                >
                  {positions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2"
                  aria-hidden="true"
                />
              </div>
            </div>
            <div className="mb-4">
              <label htmlFor="exitText" className="mb-1.5 block text-sm font-medium">
                Exit button text
              </label>
              <input
                id="exitText"
                type="text"
                value={exitText}
                onChange={(e) => setExitText(e.target.value)}
                className={inputClass}
              />
            </div>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate()}
              className={primaryBtn}
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <div className="space-y-6 lg:col-span-3">
          <div className="border-border bg-card text-card-foreground rounded-xl border p-5">
            <h5 className="mb-2 font-semibold">Public invitation links</h5>
            {/* The mandate switches these links off and the enrollment page
                refuses to redeem one, so offering a copyable URL here would hand
                a manager something that dead-ends for the learner who opens it. */}
            {tenantKey && (
              <InvitationLinksSection
                tenantKey={tenantKey}
                courseKey={c.courseKey}
                blocked={c.publicInvitationBlocked}
              />
            )}
          </div>

          <div className="border-border bg-card text-card-foreground rounded-xl border p-5">
            <h5 className="mb-3 font-semibold">{c.manifestHeading}</h5>
            {c.manifestHtml ? (
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-sm"
                dangerouslySetInnerHTML={{ __html: c.manifestHtml }}
              />
            ) : (
              <p className="text-muted-foreground text-sm">No manifest available.</p>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={pendingRevision !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRevision(null);
        }}
        title={buildRevisionConfirmation(c, revVersion.trim()).title}
        description={buildRevisionConfirmation(c, revVersion.trim()).description}
        confirmLabel="Publish revision"
        busyLabel="Publishing…"
        tone="default"
        busy={publishRevision.isPending}
        onConfirm={() => {
          if (pendingRevision) publishRevision.mutate(pendingRevision);
        }}
      />
    </AppShell>
  );
}

const inputClass =
  "block w-full py-2 px-3 rounded-lg border border-[color:var(--color-input-border)] bg-background text-foreground text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-[color:var(--color-input-focus-ring)] transition-colors";

const primaryBtn =
  "inline-flex items-center justify-center rounded-full py-2 px-4 font-semibold text-sm text-white bg-primary hover:bg-[color:var(--color-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

const secondaryBtn =
  "inline-flex items-center justify-center rounded-full py-2 px-4 font-semibold text-sm border border-border text-foreground hover:bg-muted transition-colors";
