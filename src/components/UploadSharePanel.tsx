import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { capture } from "@/lib/analytics";
import { shareState, type ShareCapacity, type CourseShareDetail } from "@/lib/uploadShare";
import { CopyButton } from "@/components/ui/copy-button";

// What the Library shows right after an upload: the new course's invitation
// link, ready to copy. The link has always existed, but only on the course
// page, and most people who upload a first course never open that page.

const linkClass = "font-medium underline";

export function UploadSharePanel({
  tenantKey,
  courseKey,
  title,
  manageUrl,
  capacity,
}: {
  tenantKey: number;
  courseKey: number;
  title: string;
  manageUrl: string;
  capacity?: ShareCapacity;
}) {
  const detail = useQuery({
    queryKey: ["tenants", tenantKey, "courses", courseKey],
    queryFn: async () => api<CourseShareDetail>(`/api/tenants/${tenantKey}/courses/${courseKey}`),
  });

  const state = shareState(detail.data, capacity);

  return (
    // role="status" is a polite live region: it waits for the screen reader to
    // finish, unlike the capacity banner's alert.
    <div
      role="status"
      className="mb-6 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 font-semibold break-words">Uploaded {title}</p>
        <Link to={manageUrl} className={`${linkClass} shrink-0`}>
          Manage
        </Link>
      </div>

      {state.kind === "link" && (
        <>
          <p className="mt-1">
            Share this link with your learners. You'll see their progress in Reports.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code
              title={state.url}
              className="bg-background text-foreground min-w-0 flex-1 truncate rounded px-3 py-2 font-mono text-xs"
            >
              {state.url}
            </code>
            <CopyButton
              url={state.url}
              onCopied={() => capture("invitation_link_copied", { surface: "library_upload" })}
            />
          </div>
          {state.placesLeft !== null && (
            <p className="mt-2">
              Free plan: {state.placesLeft.toLocaleString()} more{" "}
              {state.placesLeft === 1 ? "person" : "people"} can join.
            </p>
          )}
        </>
      )}

      {state.kind === "full" && (
        <p className="mt-1">
          Your Free plan is full, so new learners can't join until you make room.{" "}
          <Link to="/billing?from=library_upload" className={linkClass}>
            View plans
          </Link>
          , or remove someone on{" "}
          <Link to="/accounts" className={linkClass}>
            Accounts
          </Link>
          .
        </p>
      )}

      {state.kind === "off" && (
        <p className="mt-1">
          Invitation links are off. Add learners on{" "}
          <Link to="/accounts" className={linkClass}>
            Accounts
          </Link>
          .
        </p>
      )}

      {state.kind === "inactive" && (
        <p className="mt-1">
          This course has no active invitation link. Create one on the{" "}
          <Link to={manageUrl} className={linkClass}>
            course page
          </Link>
          .
        </p>
      )}
    </div>
  );
}
