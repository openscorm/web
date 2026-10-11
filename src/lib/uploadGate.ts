// Upload stays open at the course limit and closes only once a tenant is over
// it, as after a drop to Free. At the limit the server refuses the attempt, and
// that refusal is what raises the course-wall email: disabling the control at
// the limit would mean no attempt, no refusal and no email, with nothing
// anywhere saying so.
export function uploadDisabledFor(capacity: { isCoursesOverLimit: boolean } | undefined): boolean {
  return capacity?.isCoursesOverLimit ?? false;
}
