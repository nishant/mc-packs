const DAY = 86400000;

/**
 * What to do with a record last seen at `seen` (ms). A record with no usable time is never read as epoch 0 (and so
 * as ancient): it is "start": begin counting from now. `days` of 0 or less turns pruning off.
 * @param {unknown} seen @param {number} now @param {number} days
 * @returns {"keep" | "start" | "drop"}
 */
export function verdict(seen, now, days) {
  if (!(days > 0)) return "keep";
  if (typeof seen !== "number" || !Number.isFinite(seen) || seen <= 0) return "start";
  return now - seen > days * DAY ? "drop" : "keep";
}

/** Writes at most one refresh a day per player. @param {unknown} seen @param {number} now */
export const stale = (seen, now) => typeof seen !== "number" || !Number.isFinite(seen) || seen <= 0 || now - seen > DAY || seen > now;
