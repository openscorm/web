import { LobbyLayout } from "@/components/LobbyLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";

import { usePageTitle } from "@/hooks/usePageTitle";
import {
  DISCLOSURE_EMAIL,
  STATUS_LABEL,
  SUBPROCESSORS,
  TRUST_LAST_REVIEWED,
  TRUST_SECTIONS,
  type ControlStatus,
} from "@/lib/trust";

// Public Trust page. Content lives in @/lib/trust so this file only
// renders it. Reachable at /trust; whether it is linked from public chrome and
// mirrored on the marketing site is not settled, so nothing here assumes it is
// discoverable yet.

const STATUS_VARIANT: Record<ControlStatus, "success" | "warning" | "secondary" | "outline"> = {
  "in-place": "success",
  "in-progress": "warning",
  planned: "secondary",
  // Green (ruled 2026-09-17). Regular internal penetration testing is work we
  // actually do, so it reads as a pass rather than a gap. The label says
  // Internal and the card body names who performs it and says the third-party
  // engagement is still only being evaluated, so the color does not carry a
  // claim the words withhold.
  internal: "success",
  // Green (ruled 2026-09-17). For a buyer with a residency requirement the
  // answer is yes under a scoped conversation, and grey would read as no. The
  // label says Available upon request rather than In place, so the color
  // promises a conversation rather than a region already provisioned.
  "on-request": "success",
  "not-claimed": "outline",
  // Green, and deliberately (ruled 2026-09-10). Infrastructure-level
  // compliance is what every client and prospect to date has actually
  // required, so in procurement it reads as a pass rather than as a
  // qualification. Application-level certification is planned for 2027 and no
  // procurement has asked for it yet. The label still says Infrastructure and
  // the card body still says whose certification it is, so the color carries
  // the procurement signal without the claim moving.
  infrastructure: "success",
};

export function TrustPage() {
  usePageTitle("Trust and security | OpenSCORM");

  return (
    <LobbyLayout>
      <div className="w-full max-w-3xl">
        <p className="text-muted-foreground text-sm font-medium">Trust</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Security and data handling</h1>
        <p className="text-muted-foreground mt-3 text-sm">
          Last reviewed <span className="font-mono">{TRUST_LAST_REVIEWED}</span>
        </p>

        <div className="mt-8 space-y-8">
          {TRUST_SECTIONS.map((section) => (
            <section key={section.id} aria-labelledby={`trust-${section.id}`}>
              <h2 id={`trust-${section.id}`} className="text-xl font-semibold">
                {section.heading}
              </h2>
              {section.intro && (
                <p className="text-muted-foreground mt-1 text-sm">{section.intro}</p>
              )}
              <div className="mt-3 space-y-3">
                {section.controls.map((control) => (
                  <Card key={control.title}>
                    <CardContent className="flex flex-col gap-2 pt-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="sm:flex-1">
                        <p className="font-medium">{control.title}</p>
                        <p className="text-muted-foreground mt-1 text-sm">{control.detail}</p>
                        {control.links && control.links.length > 0 && (
                          <ul className="mt-2">
                            {control.links.map((link) => (
                              <li
                                key={link.href}
                                className="text-muted-foreground flex items-center gap-1.5 text-sm"
                              >
                                {/* The href sits on the icon, so the label is
                                    plain text and five underlined lines stop
                                    competing with the card body. The icon
                                    therefore has no text of its own, which is
                                    why it carries an explicit name: the
                                    provider, not the whole label, so a screen
                                    reader hears "Open the Microsoft Azure
                                    compliance report" rather than the
                                    certificate list read as a sentence. The
                                    negative margin trades no visual space for
                                    a hit area bigger than a 14px glyph. */}
                                <a
                                  href={link.href}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  aria-label={`Open the ${link.label.split(":")[0].trim()} compliance report`}
                                  className="hover:text-foreground -m-1 shrink-0 p-1"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                </a>
                                <span>{link.label}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <Badge
                        variant={STATUS_VARIANT[control.status]}
                        className="w-fit shrink-0 whitespace-nowrap"
                      >
                        {control.label ?? STATUS_LABEL[control.status]}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}

          <section aria-labelledby="trust-subprocessors">
            <h2 id="trust-subprocessors" className="text-xl font-semibold">
              Subprocessors
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              The third parties that process data on our behalf, and what reaches each one.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-border text-muted-foreground border-b text-left">
                    <th className="py-2 pr-4 font-medium">Provider</th>
                    <th className="py-2 pr-4 font-medium">Purpose</th>
                    <th className="py-2 pr-4 font-medium">Location</th>
                    <th className="py-2 font-medium">Data it handles</th>
                  </tr>
                </thead>
                <tbody>
                  {SUBPROCESSORS.map((sub) => (
                    <tr key={sub.name} className="border-border border-b align-top last:border-0">
                      <td className="py-2 pr-4 font-medium">{sub.name}</td>
                      <td className="text-muted-foreground py-2 pr-4">{sub.purpose}</td>
                      <td className="text-muted-foreground py-2 pr-4">{sub.location}</td>
                      <td className="text-muted-foreground py-2">{sub.data}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="trust-disclosure">
            <h2 id="trust-disclosure" className="text-xl font-semibold">
              Report a vulnerability
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Found a security issue? Tell us at{" "}
              <a
                href={`mailto:${DISCLOSURE_EMAIL}`}
                className="text-foreground font-mono underline underline-offset-2"
              >
                {DISCLOSURE_EMAIL}
              </a>
              . We will acknowledge your report, keep you updated while we fix it, and credit you if
              you would like. Please give us a reasonable window to remediate before disclosing
              publicly.
            </p>
          </section>
        </div>
      </div>
    </LobbyLayout>
  );
}
