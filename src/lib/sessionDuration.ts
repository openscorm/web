// Who measures a sitting.
//
// SCORM leaves session duration to the content. A SCO reports
// cmi.core.session_time (1.2) or cmi.session_time (2004), and the LMS adds
// that to the running total. Nothing in either specification asks the LMS to
// keep its own clock, so this platform never did.
//
// That contract breaks in two ordinary cases, and both of them record a real
// sitting as zero:
//
// 1. The content never reports at all. Legal in 2004, where session_time is
//    optional, and common in content that assumes the LMS is timing it.
// 2. The content reports from its own exit routine, which is what the isEazy
//    packages do. The player's Exit button calls Terminate on the runtime
//    directly, so that routine never runs and its time is never sent.
//
// Case 2 is ours, not the content's: a learner who leaves the way we told them
// to leave loses their time. A learner's hour reading as "0 seconds" is worse
// than a missing number, because it looks like an answer.
//
// So the player times the sitting itself, and uses its own measurement only
// when the content has not reported one. Content that tracks real activity
// still wins, because it knows what counted as activity and a wall clock does
// not: a tab left open all afternoon is an afternoon to us and five minutes to
// the course. Preferring the course keeps every package that already behaves
// exactly as accurate as it is today.
//
// Injectable clock so a test can drive elapsed time instead of sleeping.

export interface SessionClock {
  /** Seconds since the runtime was created, never negative. */
  elapsedSeconds(): number;

  /**
   * Freezes the measurement. The sitting ends when the SCO terminates, and a
   * snapshot taken after that (an unload beacon firing while the page tears
   * down, say) must report the sitting that happened rather than keep counting
   * against a course nobody is in any more.
   */
  stop(): void;
}

export function createSessionClock(now: () => number = () => Date.now()): SessionClock {
  const startedAt = now();
  let frozen: number | null = null;

  function measure(): number {
    // Two decimal places is the resolution both time formats carry, and
    // rounding here keeps the formatters from rendering float noise.
    const elapsed = (now() - startedAt) / 1000;
    return elapsed > 0 ? Math.round(elapsed * 100) / 100 : 0;
  }

  return {
    elapsedSeconds() {
      return frozen === null ? measure() : frozen;
    },
    stop() {
      if (frozen === null) frozen = measure();
    },
  };
}
