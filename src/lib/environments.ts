/**
 * Environment roster. The canonical source is an internal infrastructure
 * document, under the runtime directory convention. Keep this file in step with
 * it: tokens, aliases, and descriptions come from there, not from here.
 *
 * Ported from a sibling application so both name and color the same
 * environments the same way. Deliberately dropped on the way over: loginUrl and
 * hostPrefix, which are that application's hostnames and mean nothing here.
 */

export interface EnvDef {
  name: string;
  slug: string;
  description: string;
  /**
   * Any CSS color. Consumers hand it to `backgroundColor` and must not parse
   * it.
   */
  color: string;
  /**
   * This environment's data is copied from production. True for the `derived`
   * group and nothing else; live is not derived from itself.
   *
   * A second axis, independent of `color`. Hue answers "how many gates stand
   * between a change made here and production"; this answers "is what I am
   * looking at real customer data". OpenSCORM has no environments page yet, so
   * nothing renders it today - it is carried so this roster stays a faithful
   * copy of canon rather than a subset that silently disagrees. The sibling
   * application draws it as a ring in live's own color.
   */
  derivedFromLive?: boolean;
  aliases: string[];
}

/**
 * Listed in lifecycle order, the order work moves through them.
 *
 * The colors carry no traffic-light meaning. Green is deliberately absent:
 * green means "healthy" and "passing" everywhere else in the app, so a green
 * Test badge would describe a state rather than a place, and the green/red pair
 * it made with live gave a red-green color blind operator no signal at all.
 * What the ramp says is promotion distance: how many gates stand between a
 * change made here and production. Work has three, test two, stage one, live
 * none because it is production. Violet, blue, amber, then no hue, because
 * production is the ordinary place to be and the color is spent marking the
 * environments that are not it. Anything off that path takes the gray.
 *
 * The wording was "how far a mistake travels" until that was found to carry
 * three readings that disagree - a change propagating, the blast radius of a
 * destructive action, and who sees it. Canon is the infrastructure document,
 * under "Environment colors".
 */
export const lifecycle: EnvDef[] = [
  {
    name: "Work",
    slug: "work",
    color: "rgb(150, 122, 214)",
    description:
      "Local development work environment (internal and private) for rapid iteration and debugging",
    aliases: ["local", "work"],
  },
  {
    name: "Test",
    slug: "test",
    color: "rgb(74, 144, 217)",
    description:
      "Testing environment for: automated tests, unit tests, integration tests (test); manual quality assurance tests by internal teams (qa); manual user acceptance tests by external teams for customer/user signoff (uat)",
    aliases: ["dev", "development", "qa", "test", "uat"],
  },
  {
    name: "Stage",
    slug: "stage",
    color: "rgb(245, 166, 35)",
    description: "Pre-production gate with near-parity to production, optional and rarely needed",
    aliases: ["sandbox", "stage", "staging"],
  },
  {
    name: "Live",
    slug: "live",
    // The theme token, shared with the sibling apps. This held the off-ramp gray
    // literal until 2026-08-15, on the reasoning that live is never rendered by
    // the app chrome and a literal avoided shipping a CSS variable nothing
    // defined. Both halves of that had rotted: the token is now defined in
    // globals.css, and the literal was not a neutral placeholder but the exact
    // gray cold, echo, and demo share - so the first screen to render the full
    // roster would have shown production as indistinguishable from an icebox.
    color: "var(--color-env-live)",
    description: "Production environment with real users and real data",
    aliases: ["live", "prod", "production"],
  },
];

/** Derived from live: no work passes through, and the data comes from production. */
export const derived: EnvDef[] = [
  {
    // Cold means stale, not slow: not the Glacier-style retrieval tier, just a
    // copy nobody keeps current. Canon is the infrastructure document.
    name: "Cold",
    slug: "cold",
    color: "rgb(93, 100, 114)",
    derivedFromLive: true,
    description:
      "Copy of live data that is not kept current: archival, data warehousing, and offline analysis. Cold means stale, not slow - it may be queried freely; it simply is not tracking live",
    aliases: ["cold"],
  },
  {
    // Echo is the hot copy and cold is the icebox; the difference is
    // temperature, not purpose. Two jobs on one copy: the disaster-recovery
    // mirror you fail over to, and operator reporting off live-shaped data. It
    // is not a backup - it tracks production's mistakes within the refresh
    // interval.
    name: "Echo",
    slug: "echo",
    color: "rgb(93, 100, 114)",
    derivedFromLive: true,
    description:
      "Hot, continuously refreshed duplicate of live, for disaster recovery and for operator reporting without loading the live database",
    aliases: ["echo"],
  },
];

/** Neither a stage on the way to production nor a copy of it. */
export const independent: EnvDef[] = [
  {
    // Gray rather than a lifecycle hue, and specifically not work's violet.
    // Demo is a working environment, which makes sharing work's color
    // tempting, but the ramp is ordinal: violet means a rank on the path to
    // live, and demo is off that path rather than at the far end of it.
    name: "Demo",
    slug: "demo",
    color: "rgb(93, 100, 114)",
    description:
      "Demonstration environment shown to prospects and customers, and the working environment for sales, marketing, and customer support: prospect demos, customer onboarding, and training on how to use the platform. Curated data chosen to look good rather than to match production",
    aliases: ["demo", "preview", "promo"],
  },
];

const all = [...lifecycle, ...derived, ...independent];

/** Match an environment by name, slug, or alias (case-insensitive). */
export function findEnvironment(value: string): EnvDef | undefined {
  const v = value.trim().toLowerCase();
  return all.find((e) => e.name.toLowerCase() === v || e.slug === v || e.aliases.includes(v));
}

/**
 * The color the chrome should paint, or undefined when it should paint nothing.
 *
 * Live is the default place to be, so it gets no rule and no badge: a permanent
 * production marker trains people to ignore the signal everywhere else. An
 * unrecognized token still gets a badge, in neutral, because an environment
 * nobody put in the roster is exactly the one worth noticing.
 */
export function environmentAccent(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const env = findEnvironment(value);
  if (env?.slug === "live") return undefined;
  return env?.color ?? "rgb(93, 100, 114)";
}
