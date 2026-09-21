export const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "") as string;

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[2]) : null;
}

export class ApiError extends Error {
  status: number;
  problem?: unknown;
  constructor(status: number, message: string, problem?: unknown) {
    super(message);
    this.status = status;
    this.problem = problem;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const csrf = getCookie("openscorm_csrf");
  if (csrf) headers.set("X-OpenSCORM-Csrf", csrf);

  const res = await fetch(apiBase + path, {
    ...init,
    credentials: "include",
    headers,
  });
  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    let problem: unknown = undefined;
    if (contentType.includes("json")) {
      try {
        problem = await res.json();
      } catch {
        /* ignore */
      }
    }
    throw new ApiError(res.status, res.statusText, problem);
  }
  if (contentType.includes("json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

// Fetches an attachment and saves it via a temporary object URL. A plain <a
// href> would skip the CSRF header and the Accept negotiation that api() sets
// up, and would surface a failed export as a blank tab instead of an error we
// can show. Filename comes from the server's Content-Disposition so the API
// stays the single source of truth for what an export is called.
export async function download(
  path: string,
  fallbackFileName: string,
  accept = "text/csv",
): Promise<void> {
  const headers = new Headers({ Accept: accept });
  const csrf = getCookie("openscorm_csrf");
  if (csrf) headers.set("X-OpenSCORM-Csrf", csrf);

  const res = await fetch(apiBase + path, { credentials: "include", headers });
  if (!res.ok) {
    let problem: unknown = undefined;
    if ((res.headers.get("content-type") ?? "").includes("json")) {
      try {
        problem = await res.json();
      } catch {
        /* ignore */
      }
    }
    throw new ApiError(res.status, res.statusText, problem);
  }

  const disposition = res.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const fileName = match ? match[1] : fallbackFileName;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
