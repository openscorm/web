import { environmentAccent, findEnvironment } from "@/lib/environments";

/**
 * Names the environment answering this session, in its roster color.
 *
 * Renders nothing on live. Production is where users expect to be, and a
 * permanent live badge trains people to ignore the marker everywhere it
 * matters. An unrecognized token still renders, in neutral: an environment
 * nobody added to the roster is exactly the one worth looking at twice.
 */
export function EnvironmentBadge({ environment }: { environment: string | null | undefined }) {
  const accent = environmentAccent(environment);
  if (!accent || !environment) return null;

  // Canonical roster name, so a config alias ("prod", "qa", "local") still
  // renders the name the team uses out loud.
  const label = findEnvironment(environment)?.name ?? environment;

  return (
    <span
      className="rounded px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: accent }}
    >
      {label}
    </span>
  );
}

/**
 * Ambient environment signal: full width, above all chrome, in the
 * environment's color. Readable in peripheral vision on every page, where the
 * badge has to be looked at directly. Both are absent on live.
 */
export function EnvironmentRule({ environment }: { environment: string | null | undefined }) {
  const accent = environmentAccent(environment);
  if (!accent) return null;

  return (
    <div
      className="h-[3px] shrink-0"
      style={{ backgroundColor: accent }}
      aria-hidden="true"
      data-testid="environment-rule"
    />
  );
}
