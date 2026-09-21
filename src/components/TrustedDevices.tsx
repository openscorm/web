import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import type { DevicesResponse } from "@/lib/types";

// The devices this person chose to trust at a two-factor
// challenge, still inside their expiry and the tenant's window. Revoking one
// takes effect at that device's next sign-in; the current device loses its
// cookie on the spot.
const revokeBtn =
  "border-border text-foreground inline-flex items-center justify-center rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";

export function TrustedDevices() {
  const qc = useQueryClient();
  const devices = useQuery({
    queryKey: ["auth", "devices"],
    queryFn: async () => api<DevicesResponse>("/api/auth/devices"),
  });

  const revoke = useMutation({
    mutationFn: async (deviceKey: number) =>
      api<void>(`/api/auth/devices/${deviceKey}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth", "devices"] }),
  });

  if (!devices.data) return null;

  if (devices.data.trustDays === 0) {
    return (
      <p className="text-muted-foreground mt-5 text-sm">
        Your organization asks for a code on every sign-in, so devices cannot be trusted.
      </p>
    );
  }

  return (
    <div className="mt-5">
      <h3 className="text-sm font-medium">Trusted devices</h3>
      <p className="text-muted-foreground mt-1 text-xs">
        Sign-ins from these skip the code for {devices.data.trustDays} days.
      </p>

      {revoke.isError && (
        <p className="mt-2 text-sm text-red-700 dark:text-red-400" role="alert">
          Could not revoke that device. Try again.
        </p>
      )}

      {devices.data.devices.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-sm">No trusted devices</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {devices.data.devices.map((d) => (
            <li
              key={d.deviceKey}
              className="border-border flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm" title={d.label || undefined}>
                  {d.label || "Unknown browser"}
                  {d.current && (
                    <span className="bg-muted text-muted-foreground ml-2 rounded px-1.5 py-0.5 text-xs font-medium">
                      This device
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground text-xs">
                  Trusted {formatDate(d.createdAt)}, until {formatDate(d.expiresAt)}
                </p>
              </div>
              <button
                type="button"
                className={revokeBtn}
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(d.deviceKey)}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
