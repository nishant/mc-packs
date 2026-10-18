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
  /** @param {number} ms what some work took */
  spend(ms) {
    this.left -= ms;
    this.used += ms;
  }
}
