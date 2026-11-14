// suite.mjs's hard time limit per scenario (PIPE-16): header timeouts go up to 30,000 s, so a hung scenario used to
// hold its shard until the job limit and the shard then wrote no report. With the last run's seconds (--times, the
// cached suite-times.json), a run is killed at 3x its usual time, 300 s at least, and never later than its header asks.
import fs from "node:fs";

/** Scenario name -> seconds from a suite --json report (or the cached suite-times.json); empty when unreadable. @param {string} file */
export function readTimes(file) {
  /** @type {Map<string, number>} */
  const times = new Map();
  try {
    for (const r of JSON.parse(fs.readFileSync(file, "utf8")).results ?? []) if (r && typeof r.seconds === "number" && r.seconds > 0) times.set(r.name, r.seconds);
  } catch { /* no times: header limits only */ }
  return times;
}

/**
 * Seconds before the suite kills a run: the header's --timeout plus 120 s of setup slack, capped at
 * max(300, 3 x usual) when the usual seconds are known.
 * @param {number} timeoutS the run's --timeout @param {number | undefined} usual the scenario's seconds last time
 */
export function hardLimitSeconds(timeoutS, usual) {
  const header = timeoutS + 120;
  return usual && usual > 0 ? Math.min(header, Math.max(300, 3 * usual)) : header;
}
