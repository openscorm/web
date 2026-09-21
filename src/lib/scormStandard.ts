// Which SCORM runtime a course needs, and what the SCO will look for on the
// window when it goes hunting.
//
// Both players need this and neither should own it. The session player
// (PlayerPage) and the dispatch content shim install the runtime into
// different scopes with different transports, but the rule for choosing one is
// the same rule, and a rule written twice is a rule that will disagree with
// itself eventually.
//
// The global name is the whole reason this matters. A SCORM 1.2 SCO walks its
// ancestor windows looking for a property called API. A SCORM 2004 SCO walks
// the same chain looking for API_1484_11, ignores API entirely, and reports
// that it could not find an LMS if that property is absent. Installing the
// wrong one produces a course that loads, shows its first slide, and tracks
// nothing.

import type { ScormRuntime } from "@/lib/scormDataModel";
import type { Scorm2004Runtime } from "@/lib/scormDataModel2004";

export type ScormStandardVersion = "1.2" | "2004";

export const SCORM_12_GLOBAL = "API";
export const SCORM_2004_GLOBAL = "API_1484_11";

export type AnyScormRuntime = ScormRuntime | Scorm2004Runtime;

/**
 * Maps a stored scorm_version token onto the runtime it needs.
 *
 * The tokens come from Slate.Content's ScormVersions: "1.2", "2004",
 * "2004-2nd", "2004-3rd", "2004-4th". Anything unrecognized, absent or empty
 * answers "1.2", which is what the platform delivered before 2004 existed
 * here, so an unexpected value degrades to today's behavior rather than to a
 * course that cannot find an API at all.
 */
export function standardFromVersion(token: string | null | undefined): ScormStandardVersion {
  if (!token) return "1.2";
  return token.trim().toLowerCase().startsWith("2004") ? "2004" : "1.2";
}

export function globalNameFor(standard: ScormStandardVersion): string {
  return standard === "2004" ? SCORM_2004_GLOBAL : SCORM_12_GLOBAL;
}

type ApiScope = Record<string, unknown>;

/**
 * Publishes the runtime under the name the SCO will search for.
 *
 * Only one name is ever installed. Publishing both so that "either kind of
 * content works" would be worse than useless: a 2004 SCO that finds an API
 * property containing a 1.2 runtime does not check whether the methods it
 * needs are there, it calls Initialize on an object that has none.
 */
export function installRuntime(
  scope: Window,
  standard: ScormStandardVersion,
  runtime: AnyScormRuntime,
): void {
  (scope as unknown as ApiScope)[globalNameFor(standard)] = runtime;
}

/**
 * Removes the runtime, but only if it is still the one that was installed. A
 * relaunch that built a new runtime has already replaced the property, and
 * deleting it then would strip the live course of its API.
 */
export function uninstallRuntime(
  scope: Window,
  standard: ScormStandardVersion,
  runtime: AnyScormRuntime,
): void {
  const name = globalNameFor(standard);
  const target = scope as unknown as ApiScope;
  if (target[name] === runtime) delete target[name];
}

/** Ends the attempt, whichever standard the runtime speaks. */
export function terminateRuntime(runtime: AnyScormRuntime): void {
  if ("Terminate" in runtime) runtime.Terminate("");
  else runtime.LMSFinish("");
}
