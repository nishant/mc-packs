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

/**
 * Brings each member's last-seen time (the third item of [id, name, seen]) up to date and decides whether the party
 * is a solo party nobody has played in for `days`. Only a party of one member is ever dropped; a member with no time
 * starts counting now.
 * @param {{ m: [string, string, number?][] }} party @param {number} now @param {(id: string) => boolean} isOnline @param {number} days
 * @returns {{ changed: boolean, drop: boolean }}
 */
export function planParty(party, now, isOnline, days) {
  let changed = false;
  for (const m of party.m) {
    const seen = m[2];
    const known = typeof seen === "number" && Number.isFinite(seen) && seen > 0 && seen <= now;
    if (isOnline(m[0]) ? !known || now - /** @type {number} */ (seen) > DAY : !known) {
      m[2] = now;
      changed = true;
    }
  }
  return { changed, drop: party.m.length === 1 && verdict(party.m[0][2], now, days) === "drop" };
}

/** Writes at most one refresh a day per player. @param {unknown} seen @param {number} now */
export const stale = (seen, now) => typeof seen !== "number" || !Number.isFinite(seen) || seen <= 0 || now - seen > DAY || seen > now;

/** The fields of a saved party this pack doesn't know, kept as they are. @param {unknown} v @param {string[]} known @returns {Record<string, unknown>} */
export function unknownFields(v, known) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v).filter(([k]) => !known.includes(k)));
}

/** A member tuple as [id, name, seen, ...whatever else was saved after those]. @param {any[]} m @returns {any[]} */
export function memberOf(m) {
  return [m[0], String(m[1] ?? ""), typeof m[2] === "number" && Number.isFinite(m[2]) && m[2] > 0 ? m[2] : 0, ...m.slice(3)];
}