// Which letters from packs (a townsfolk, Community Goals) may be delivered, and which of them go first.
// A letter with no writer (`f` is "") came from a pack. Letters from players are never touched here.
const DAY = 86400000;

/** @param {{ f?: unknown }} l */
export const isSystem = (l) => l.f === "";

/**
 * @typedef {{ id: number, f: string, t: string, at: number, r: number, di: number }} Mail
 * @typedef {{ systemInboxLimit: number, systemLetterDays: number, systemReserve: number, maxLetters: number, inboxLimit: number }} Policy
 */

/**
 * What delivering one pack letter to `to` changes. A pack letter is not delivered once the realm holds
 * `maxLetters - systemReserve` letters, so players can always write. A letter with no usable sent time is never
 * counted as old. The recipient's whole inbox (`inboxLimit`) is kept too, but only by dropping their oldest read pack\n * letters: a letter from a player is never dropped here, and the pack letter isn't delivered when that isn't enough.
 * @param {Iterable<Mail>} letters @param {string} to @param {number} now @param {Policy} policy
 * @returns {{ ok: boolean, drop: number[], reason?: string }} `drop`: ids to delete first (expired, and the recipient's oldest over the limit;
 *   only the expired ones when the letter is refused)
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
  const expired = [...drop];
  for (const l of over) {
    drop.push(l.id);
    gone.add(l.id);
  }
  const inbox = live.filter((l) => l.t === to && !l.di && !gone.has(l.id));
  const roomTotal = Math.max(1, policy.inboxLimit) - 1;
  const need = inbox.length - roomTotal;
  if (need > 0) {
    const spare = inbox.filter((l) => isSystem(l) && l.r).sort((a, b) => (a.at || 0) - (b.at || 0) || a.id - b.id);
    if (spare.length < need) return { ok: false, drop: expired, reason: "the inbox is full of letters from players and unread ones" };
    for (const l of spare.slice(0, need)) {
      drop.push(l.id);
      gone.add(l.id);
    }
  }
  // Refused for a full realm: delete only the expired letters, never the recipient's own (unread ones included)
  // for a letter that isn't delivered anyway.
  if (live.length - gone.size + expired.length >= ceiling) return { ok: false, drop: expired, reason: "the realm's mail is full" };
  return { ok: true, drop };
}
