// Watchdog and slow-tick lines in the BDS log (counted by run.mjs, written into the profile JSON and the validation
// report). The script watchdog prints "[Watchdog] ..." lines for slow scripts, single-tick spikes, hangs and memory;
// the settings it runs with are written into server.properties by lib/server.mjs (WATCHDOG_PROPS), so a BDS update
// cannot change them silently.

/**
 * The kind of a watchdog or slow-tick log line, or null for any other line.
 * @param {string} text a log line's text after the level
 * @returns {"memory" | "hang" | "spike" | "slow" | "slow-tick" | "other" | null}
 */
export function watchdogKind(text) {
  if (/watchdog/i.test(text)) {
    if (/memory/i.test(text)) return "memory";
    if (/\bhang|hung\b/i.test(text)) return "hang";
    if (/spike/i.test(text)) return "spike";
    if (/\bslow\b/i.test(text)) return "slow";
    return "other";
  }
  if (/can'?t keep up|running behind|server is overloaded|ticks? behind/i.test(text)) return "slow-tick";
  return null;
}

/** A performance warning (never an error, whatever the level BDS logs it at): spike, slow script, slow tick. */
export function isPerfWarning(kind) {
  return kind === "spike" || kind === "slow" || kind === "slow-tick";
}

/**
 * { count, byKind, first } over collected lines ({ phase, kind, text }), for the JSON and the report.
 * @param {{ phase?: string, kind: string, text: string }[]} lines
 */
export function watchdogSummary(lines) {
  /** @type {Record<string, number>} */
  const byKind = {};
  for (const l of lines) byKind[l.kind] = (byKind[l.kind] ?? 0) + 1;
  return { count: lines.length, byKind, first: lines.slice(0, 5).map((l) => `${l.phase ? `[${l.phase}] ` : ""}${l.text.replace(/\s+/g, " ").slice(0, 200)}`) };
}
