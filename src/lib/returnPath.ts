// Where a signed-out visit was headed, carried through /login so that signing
// in lands there rather than on the home page. Every link in an account email
// opens a signed-in page, so without this the link's destination is lost at the
// sign-in screen.
//
// Only a path on this site is followed. Anything that could leave the origin
// ("//host", "/\host", a scheme) is dropped, so a crafted link cannot use the
// sign-in page to send someone elsewhere; so is /login itself, which would loop.

const NEXT = "next";

export function loginPathFor(location: { pathname: string; search: string }): string {
  const target = location.pathname + location.search;
  if (safeReturnPath(target) === null) return "/login";
  return `/login?${NEXT}=${encodeURIComponent(target)}`;
}

export function returnPathFrom(search: URLSearchParams): string | null {
  return safeReturnPath(search.get(NEXT));
}

export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 2000) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  // A line break or other control character has no place in a path.
  if ([...raw].some((c) => c.charCodeAt(0) < 0x20)) return null;

  const path = raw.split(/[?#]/)[0];
  if (path === "/" || path === "/login" || path.startsWith("/login/")) return null;
  return raw;
}
