import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";

interface LibraryCourse {
  courseKey: number;
  courseSlug: string;
  title: string;
}

// Past this many courses the list gets a filter box.
const FILTER_THRESHOLD = 8;

// The library as a list of checkboxes, for picking courses to assign. Shared
// by the assign dialog and the import's confirm step, so both offer the same
// courses the same way. It reads the same query the library page does, so an
// open library page and the picker share one fetch.
export function CoursePicker({
  tenantKey,
  chosen,
  onToggle,
}: {
  tenantKey: number;
  chosen: ReadonlySet<number>;
  onToggle: (courseKey: number) => void;
}) {
  const filterId = useId();
  const [filter, setFilter] = useState("");

  const courses = useQuery({
    queryKey: ["tenants", tenantKey, "courses"],
    queryFn: async () => api<LibraryCourse[]>(`/api/tenants/${tenantKey}/courses`),
  });

  const all = courses.data ?? [];
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? all.filter(
        (c) =>
          (c.title || "").toLowerCase().includes(needle) ||
          c.courseSlug.toLowerCase().includes(needle),
      )
    : all;

  return (
    <div className="flex flex-col gap-3">
      {all.length > FILTER_THRESHOLD && (
        <div>
          <label htmlFor={filterId} className="sr-only">
            Filter courses
          </label>
          <Input
            id={filterId}
            type="search"
            placeholder="Filter courses"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      )}
      <fieldset className="border-border max-h-72 overflow-y-auto rounded-lg border p-3">
        <legend className="sr-only">Courses</legend>
        {courses.isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
        {courses.isError && (
          <p className="text-sm text-red-700 dark:text-red-400" role="alert">
            Could not load your courses.
          </p>
        )}
        {courses.data && all.length === 0 && (
          <p className="text-muted-foreground text-sm">No courses in your library yet</p>
        )}
        {courses.data && all.length > 0 && shown.length === 0 && (
          <p className="text-muted-foreground text-sm">No courses match</p>
        )}
        <div className="space-y-2">
          {shown.map((c) => (
            <label key={c.courseKey} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={chosen.has(c.courseKey)}
                onChange={() => onToggle(c.courseKey)}
              />
              <span>{c.title || c.courseSlug}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
