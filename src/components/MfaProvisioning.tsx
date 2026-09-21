import { QRCodeSVG } from "qrcode.react";

import type { MfaSetupResponse } from "@/lib/types";

// The provisioning half of two-factor enrollment: the QR code an authenticator
// scans, the key for the ones that cannot, and the recovery codes shown once.
// Shared by the signed-in setup on Settings and the sign-in enrollment a
// tenant mandate forces, so the two never drift on what a person
// is shown and asked to save.
export function MfaProvisioning({ setup }: { setup: MfaSetupResponse }) {
  return (
    <>
      <div className="flex justify-center rounded-lg bg-white p-4">
        <QRCodeSVG value={setup.otpauthUri} size={176} />
      </div>
      <p className="text-muted-foreground text-xs">
        Can&apos;t scan? Enter this key manually:{" "}
        <span className="text-foreground font-mono break-all">{setup.secret}</span>
      </p>

      <div className="border-border rounded-lg border p-3">
        <p className="text-sm font-medium">Recovery codes</p>
        <p className="text-muted-foreground mb-2 text-xs">
          Save these now. Each works once if you lose your authenticator. They are not shown again.
        </p>
        <ul className="grid grid-cols-2 gap-1 font-mono text-xs">
          {setup.recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
