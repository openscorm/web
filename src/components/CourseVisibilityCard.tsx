import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { MeResponse } from "@/lib/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// Whether learners see the whole library or only the courses assigned to
// them. Managers and operators switch it, and it binds at the learner's next
// page load. Turning it on asks first, because a learner with no assignments
// is left with an empty My courses.
const primaryBtn =
  "bg-primary inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--color-primary-hover)] focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";
const secondaryBtn =
  "border-border text-foreground inline-flex items-center justify-center rounded-full border px-6 py-3 text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";

interface CourseVisibility {
  assignedCoursesOnly: boolean;
}

export function CourseVisibilityCard({ user }: { user: MeResponse }) {
  const qc = useQueryClient();
  const queryKey = ["tenants", user.tenantKey, "course-visibility"];
  const path = `/api/tenants/${user.tenantKey}/course-visibility`;
  const [confirming, setConfirming] = useState(false);

  const setting = useQuery({
    queryKey,
    queryFn: async () => api<CourseVisibility>(path),
  });

  const save = useMutation({
    mutationFn: async (assignedCoursesOnly: boolean) =>
      api<CourseVisibility>(path, {
        method: "PUT",
        body: JSON.stringify({ assignedCoursesOnly }),
      }),
    onSuccess: (r) => {
      setConfirming(false);
      qc.setQueryData(queryKey, r);
    },
  });

  const on = setting.data?.assignedCoursesOnly ?? false;
  const busy = setting.isLoading || save.isPending || !setting.data;

  const status = setting.isLoading
    ? "Loading…"
    : on
      ? "Learners see only the courses assigned to them"
      : "Learners see every course in your library";

  return (
    <div className="border-border bg-card mx-auto mt-6 max-w-xl rounded-xl border p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Course visibility</h2>
          <p className="text-muted-foreground mt-1 text-sm">{status}</p>
        </div>
        <span
          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
            on
              ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {on ? "Assigned only" : "Whole library"}
        </span>
      </div>

      {(setting.isError || save.isError) && (
        <p className="mt-4 text-sm text-red-700 dark:text-red-400" role="alert">
          {setting.isError
            ? "Could not load this setting."
            : "Could not save this setting. Try again."}
        </p>
      )}

      <p className="text-muted-foreground mt-4 text-xs">
        When this is on, My courses lists the courses assigned to each learner, plus any course they
        already opened. Managers still see the whole library. Assign courses from the Accounts page.
      </p>

      <button
        type="button"
        className={`${on ? secondaryBtn : primaryBtn} mt-5`}
        disabled={busy}
        onClick={() => (on ? save.mutate(false) : setConfirming(true))}
      >
        {save.isPending && !confirming
          ? "Saving…"
          : on
            ? "Show the whole library"
            : "Show only assigned courses"}
      </button>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        tone="default"
        title="Show learners only their assigned courses?"
        description="A learner with no assigned courses and nothing opened will see an empty My courses until you assign them one."
        confirmLabel="Show only assigned courses"
        busyLabel="Saving…"
        busy={save.isPending}
        onConfirm={() => save.mutate(true)}
      />
    </div>
  );
}
