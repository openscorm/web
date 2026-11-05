import { ApiError } from "@/lib/api";

export const SUPPORT_EMAIL = "support@openscorm.com";

// The billing endpoints refuse a manager whose email is not confirmed with
// 403 { code: "email_unverified" }. The refusal still goes to the server on
// every click rather than being predicted in the browser, because the server
// records it, and that record is how a stuck buyer reaches us the same day.
export function isEmailUnverifiedRefusal(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 403 &&
    (err.problem as { code?: string } | undefined)?.code === "email_unverified"
  );
}
