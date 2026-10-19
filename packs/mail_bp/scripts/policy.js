// Which letters from packs (a townsfolk, Community Goals) may be delivered, and which of them go first.
// A letter with no writer (`f` is "") came from a pack. Letters from players are never touched here.
const DAY = 86400000;

/** @param {{ f?: unknown }} l */
export const isSystem = (l) => l.f === "";

/**
 * @typedef {{ id: number, f: string, t: string, at: number, r: number, di: number }} Mail
 * @typedef {{ systemInboxLimit: number, systemLetterDays: number, systemReserve: number, maxLetters: number }} Policy
 */

/**
 * What delivering one pack letter to `to` changes. A pack letter is not delivered once the realm holds
 * `maxLetters - systemReserve` letters, so players can always write. A letter with no usable sent time is never
 * counted as old.
 * @param {Iterable<Mail>} letters @param {string} to @param {number} now @param {Policy} policy
 * @returns {{ ok: boolean, drop: number[], reason?: string }} `drop`: ids to delete first (expired, and the recipient's oldest over the limit)
 */
export function planSystemLetter(letters, to, now, policy) {
  const all = [...letters];
  const cutoff = now - Math.max(1, policy.systemLetterDays) * DAY;
  const old = (/** @type {Mail} */ l) => isSystem(l) && Number.isFinite(l.at) && l.at > 0 && l.at < cutoff;
  /** @type {number[]} */
  const drop = all.filter(old).map((l) => l.id);
  const gone = new Set(drop);
  const live = all.filter((l) => !gone.has(l.id));
  const ceiling = Math.max(0, policy.maxLetters - Math.max(0, policy.systemReserve));
  const mine = live.filter((l) => isSystem(l) && l.t === to && !l.di).sort((a, b) => (a.at || 0) - (b.at || 0) || a.id - b.id);
  const room = Math.max(1, policy.systemInboxLimit) - 1;
  const over = mine.slice(0, Math.max(0, mine.length - room));
  for (const l of over) {
    drop.push(l.id);
    gone.add(l.id);
  }
  if (live.length - over.length >= ceiling) return { ok: false, drop, reason: "the realm's mail is full" };
  return { ok: true, drop };
}
