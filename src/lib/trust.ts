// Content source for the in-app Trust page (/trust).
//
// This file is the single source of truth for what OpenSCORM claims about its
// security and data handling. The page renders it; Product can lift copy from
// it; a future security questionnaire or the www marketing surface should read
// the same facts rather than restating them.
//
// The one rule this file exists to enforce: every line is verifiable and
// honestly graded. A compliance buyer reads a Trust page adversarially, so an
// unearned claim is worse than an omission. Grades:
//   in-place    Live in production today and demonstrable on request.
//   in-progress Being built now, landing this quarter.
//   planned     Committed direction, not yet started.
//   internal    Done by our own team today, where the same control also has
//               an external form we have not bought yet. Renders green: the
//               work is real and running, so it is a pass rather than a gap.
//               What keeps it honest is that the label says Internal and the
//               body says who performs it, so a reader never mistakes it for
//               third-party assurance.
//   on-request  Not standard and not self-serve, but something we will do
//               under a scoped conversation. Renders green: the answer to
//               "can you do this" is yes, and burying that under Planned
//               loses a deal we could have won. What keeps it honest is that
//               the label says Available upon request rather than In place,
//               so nobody reads it as already switched on for their tenant.
//   not-claimed Stated plainly so a reader never has to infer it.
//   infrastructure Inherited from a provider we build on, evidenced by that
//               provider's own audit report, and NOT a statement about
//               OpenSCORM's own application or its configuration of that
//               provider. Use it only where the provider's report is linked.
//               Renders green (ruled 2026-09-10): infrastructure-level
//               compliance is what clients and prospects have actually
//               required, so it is a pass in procurement rather than a
//               caveat. What keeps that honest is the label and the body,
//               which never claim the certification is ours.
//
// Reviewer provenance does not belong in this file in any form, field or
// comment. This module is compiled into the bundle any visitor can read, and
// the whole web/ tree is mirrored to a public repository, so a comment is
// stripped from the first and not from the second. TrustControl has no ref
// member, so excess property checking rejects a literal that adds one back,
// and trust.test.ts asserts at runtime that no control carries a key beyond
// title, detail, status and links.

export type ControlStatus =
  | "in-place"
  | "in-progress"
  | "planned"
  | "internal"
  | "on-request"
  | "not-claimed"
  | "infrastructure";

export interface TrustControl {
  title: string;
  detail: string;
  status: ControlStatus;
  /**
   * Replaces the status label on the badge where the answer is a value rather
   * than a grade (a region, for example). The status still sets the color.
   */
  label?: string;
  /** Outbound evidence links rendered under the detail (e.g. audit reports). */
  links?: { label: string; href: string }[];
}

export interface TrustSection {
  id: string;
  heading: string;
  intro?: string;
  controls: TrustControl[];
}

export interface Subprocessor {
  name: string;
  purpose: string;
  /** Where the provider processes and stores the data it receives from us. */
  location: string;
  data: string;
}

export const STATUS_LABEL: Record<ControlStatus, string> = {
  "in-place": "In place",
  "in-progress": "In progress",
  planned: "Planned",
  internal: "Internal",
  "on-request": "Available upon request",
  "not-claimed": "Not claimed",
  infrastructure: "Infrastructure",
};

/** Last time Engineering reviewed every line on this page for accuracy. */
export const TRUST_LAST_REVIEWED = "2026-09-17";

/** Where to report a suspected vulnerability. */
export const DISCLOSURE_EMAIL = "security@openscorm.com";

export const TRUST_SECTIONS: TrustSection[] = [
  {
    id: "access",
    heading: "Access and authentication",
    intro: "Who can reach an account, and what a signed-in user is allowed to do.",
    controls: [
      {
        title: "Role-based access control",
        detail:
          "Every request is authorized on the server against the caller's role. Operators, tenant managers, and learners see only what their role permits; the browser is never trusted to enforce it.",
        status: "in-place",
      },
      {
        title: "Multi-factor authentication",
        detail:
          "Accounts can enable time-based one-time-password (TOTP) two-factor sign-in, remember trusted devices for a chosen window, and a tenant can require two-factor for its members.",
        status: "in-place",
      },
      {
        title: "Passwords are hashed at rest",
        detail:
          "Passwords are stored only as salted hashes. We never hold a plaintext password, and a database read yields nothing a person could sign in with.",
        status: "in-place",
      },
      {
        title: "Brute-force protection",
        detail:
          "Repeated failed sign-ins lock the account for a cooldown period, and the sign-in endpoint is rate limited by source address. The lockout is what stops guessing at one account; the rate limit throttles a single source.",
        status: "in-place",
      },
      {
        title: "Single sign-on (SAML 2.0)",
        detail:
          "SAML 2.0 single sign-on, so a customer manages access from their own directory and a person who leaves it loses access here. Proven end to end against Microsoft Entra ID, and built to the SAML 2.0 standard rather than to one vendor. Setup is configured with your IT team rather than self-serve, and roles stay managed in OpenSCORM: we do not map them from directory groups.",
        status: "in-place",
      },
    ],
  },
  {
    id: "data",
    heading: "Data protection",
    intro: "How customer and learner data is separated, encrypted, and recoverable.",
    controls: [
      {
        title: "Encryption in transit",
        detail:
          "All traffic to the application and API is served over HTTPS (TLS). There is no unencrypted path to your data.",
        status: "in-place",
      },
      {
        title: "Encryption at rest",
        detail:
          "The live database and application disks are Azure managed disks, encrypted at rest with platform-managed keys.",
        status: "in-place",
      },
      {
        title: "Tenant data isolation",
        detail:
          "Each customer is a separate tenant. Records carry their tenant, and every read and write is scoped to the tenant of the signed-in user, so one customer cannot reach another's data.",
        status: "in-place",
      },
      {
        title: "Encrypted offsite backups",
        detail:
          "The database is backed up nightly and stored offsite in object storage. It is encrypted before it leaves the host with keys we hold, so the storage provider holds encrypted data it cannot read.",
        status: "in-place",
      },
      {
        title: "Restores are tested",
        detail:
          "Backups are test-restored into a scratch database to confirm they are usable, and that check runs on a fixed weekly schedule.",
        status: "in-place",
      },
      {
        title: "Payment data stays with Stripe",
        detail:
          "Card numbers are entered directly into Stripe's hosted checkout. OpenSCORM never sees or stores a card number.",
        status: "in-place",
      },
      {
        title: "Data minimization in internal analytics",
        detail:
          "Internal reporting reads a masked view of the database that carries no learner names or email addresses. Email is reduced to its domain, and external learner identifiers are hashed.",
        status: "in-place",
      },
      {
        title: "Retention, deletion, and offboarding",
        detail:
          "When a tenant is offboarded its data is purged after a grace window that allows export first, with a legal-hold exemption where retention is legally required.",
        status: "in-place",
      },
    ],
  },
  {
    id: "privacy",
    heading: "Privacy and consent",
    intro: "What we collect beyond the product itself, and the control you keep over it.",
    controls: [
      {
        title: "Product analytics, minimized",
        detail:
          "Product-usage analytics run for all user accounts. Events are tied to the account, not the person, and what we collect and why is set out in our privacy policy.",
        status: "in-place",
      },
      {
        title: "Subprocessor transparency",
        detail:
          "The third parties that process data on our behalf are listed on this page, with what each one does and what data reaches it.",
        status: "in-place",
      },
    ],
  },
  {
    id: "assurance",
    heading: "Transparency and assurance",
    intro: "How you can verify these claims.",
    controls: [
      {
        title: "Open-source web client",
        detail:
          "The web client that runs in your browser is open source under the GNU AGPL v3 and published on GitHub, so you can see exactly what it does.",
        status: "in-place",
      },
      {
        title: "Error monitoring",
        detail:
          "Runtime faults are written to server-side logs on infrastructure we operate and uptime is watched by our own external probes, so a defect is seen and fixed rather than discovered by a customer. No third-party error-tracking service receives application data.",
        status: "in-place",
      },
      {
        title: "Penetration testing",
        detail:
          "Our team performs regular internal penetration tests on the application. We are currently evaluating external vendors to run independent third-party PEN tests.",
        status: "internal",
      },
      {
        title: "SOC 2 / ISO 27001",
        detail:
          "All infrastructure for OpenSCORM is certified by SOC 2 and/or ISO 27001. Audit reports are linked below. Additional application-level certification for OpenSCORM is planned for 2027.",
        status: "infrastructure",
        links: [
          {
            label: "Microsoft Azure: SOC 2, ISO 27001",
            href: "https://servicetrust.microsoft.com/viewpage/SOC",
          },
          {
            label: "Cloudflare: SOC 2, ISO 27001",
            href: "https://www.cloudflare.com/en-ca/trust-hub/compliance-resources/",
          },
          {
            label: "Stripe: SOC 2, ISO 27001, PCI DSS",
            href: "https://docs.stripe.com/security",
          },
          {
            label: "Mailgun: SOC 2, ISO 27001",
            href: "https://trust.sinch.com/?product=mailgun",
          },
          {
            label: "PostHog: SOC 2",
            href: "https://posthog.com/docs/privacy/soc2",
          },
        ],
      },
      {
        title: "Data location",
        detail: "Hosted in Azure West US. Need your data held somewhere else? Talk to us.",
        status: "in-place",
        label: "United States",
      },
    ],
  },
];

// Subprocessors: the third parties that touch customer or learner data. Keep
// this list complete and current; it is the first thing a procurement reviewer
// asks for. Hosting is Azure today (a move to a container host is planned and
// is not a fact until it ships). Locations mirror the DPA subprocessor annex.
// Not listed on purpose: our own uptime and version monitor,
// which receives no customer or learner data. Loops joined on 2026-09-27,
// ahead of any customer send, so the DPA clause 5.2 notice runs before
// lifecycle email reaches a customer.
export const SUBPROCESSORS: Subprocessor[] = [
  {
    name: "Microsoft Azure",
    purpose: "Application and database hosting",
    location: "United States (West US)",
    data: "All platform data, at rest on the host",
  },
  {
    name: "Cloudflare",
    purpose: "DNS, content delivery, and encrypted backup storage",
    location: "Western North America (WNAM)",
    data: "Traffic metadata and encrypted backup archives",
  },
  {
    name: "Stripe",
    purpose: "Subscription billing and payments",
    location: "United States",
    data: "Billing contact and payment details (card data never reaches OpenSCORM)",
  },
  {
    name: "Mailgun",
    purpose: "Transactional email (verification and password reset)",
    location: "United States",
    data: "Recipient email address and message contents",
  },
  {
    name: "Loops",
    purpose: "Lifecycle email",
    location: "United States",
    data: "Customer contact data only",
  },
  {
    name: "PostHog",
    purpose: "Product-usage analytics",
    location: "United States (US Cloud)",
    data: "Product-interaction events, keyed to an account",
  },
];
