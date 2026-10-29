// Time budgets for the minimap's per-tick work, with no game imports so tools/map-terrain.test.mjs can run it in Node.
// Scripts only have Date.now() (whole milliseconds), so work is timed with it and the differences are charged: one
// call reads 0 or 1 ms, but over many calls the charges add up to the real time. Each budget gets `perTick` ms a
// tick, saves up to `max` ms while there is little to do (a quiet server can catch up in a burst, such as a player
// who just joined) and spends at most `tickMax` ms in one tick, so a burst never makes one tick long.

export class Budget {
  /** @param {number} perTick ms added each tick @param {number} max ms saved at most @param {number} tickMax ms spent in one tick at most */
  constructor(perTick, max, tickMax) {
    this.perTick = perTick;
    this.max = max;
    this.tickMax = tickMax;
    this.left = max;
    this.used = 0;
  }
  /** The start of a tick: this tick's share comes in. */
  tick() {
    this.left = Math.min(this.max, this.left + this.perTick);
    this.used = 0;
  }
  /** Is there time left (saved, and within this tick's most)? */
  get ok() {
    return this.left > 0 && this.used < this.tickMax;
  }
  /** What may still be spent this tick (ms). */
  get room() {
    return Math.max(0, Math.min(this.left, this.tickMax - this.used));
  }
  /**
   * A debt is kept to at most `max`, and a clock step back is ignored: a hitch (a long garbage collection, or the
   * system clock stepping forward during the work) must not stop this kind of work for minutes or hours.
   * @param {number} ms what some work took (negative gives back time charged elsewhere)
   */
  spend(ms) {
    if (!Number.isFinite(ms) || ms < -1000) ms = 0;
    this.left = Math.max(-this.max, this.left - ms);
    this.used += ms;
  }
}

/**
 * The (at most `each`) items whose last turn was `interval` ticks ago or more, the longest-waiting first (never-served ones
 * first of all, ties in list order); when no more than `each` are due, they come in list order. One lookup per item and no
 * sorting of the whole list: with many players waiting on a small budget, the same few are picked every tick.
 * @template {{ id: string }} T
 * @param {readonly T[]} items @param {{ get(id: string): number | undefined }} lastAt @param {number} now @param {number} interval @param {number} each
 * @param {(item: T) => string} [key] an item's id (a player's `id` is a native read: the caller may know it already)
 * @returns {T[]}
 */
export function oldestDue(items, lastAt, now, interval, each, key = (item) => item.id) {
  /** @type {{ item: T, at: number, i: number }[]} */
  const best = [];
  let due = 0;
  for (let i = 0; i < items.length; i++) {
    const at = lastAt.get(key(items[i])) ?? -Infinity;
    if (now - at < interval) continue;
    due++;
    // Strictly older than the one it displaces, so an equal one that came earlier in the list stays ahead.
    let j = best.length;
    while (j > 0 && at < best[j - 1].at) j--;
    if (j >= each) continue;
    best.splice(j, 0, { item: items[i], at, i });
    if (best.length > each) best.pop();
  }
  if (due <= each) best.sort((a, b) => a.i - b.i);
  return best.map((b) => b.item);
}
