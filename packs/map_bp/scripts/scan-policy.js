// Two-block-first policy. These are explicit v2 experiment limits, not measured CPU guarantees.
import { COL, PREVIEW } from "./terrain.js";
export const SCAN_POLICY = Object.freeze({ previewScanning: true, steadyOps: 24, catchupOps: 48, steadyMs: 0.75, catchupMs: 2, featureMs: 3, catchupTicks: 40, cooldownTicks: 200, minimumMissing: 64 });
/** @param {import('./terrain.js').Pick} p */
const identity = p => `${p.store?.id ?? ""}|${p.resolution ?? COL}|${p.key}`;
/** Preserve request age across replans and give foreground detail service immediately.
 * @param {import('./terrain.js').Pick[]} incoming @param {import('./terrain.js').Pick[]} previous @param {number} now @param {boolean} fine
 */
export function orderTerrainWork(incoming, previous, now, fine = false) {
  const ages = new Map(previous.map(p => [identity(p), p.queuedAt ?? now]));
  /** @type {import('./terrain.js').Pick[][]} */
  const queues = [[], [], [], []];
  for (const p of incoming) {
    if (p.resolution === 1 && !fine) continue;
    p.queuedAt = Math.min(p.queuedAt ?? now, ages.get(identity(p)) ?? now, now);
    const group = p.stale ? 2 : p.resolution === PREVIEW ? 1 : p.resolution === 1 ? 3 : 0;
    queues[group].push(p);
  }
  // Original order breaks age ties, retaining each producer's distance ordering.
  for (const q of queues) q.sort((a, b) => (a.queuedAt ?? now) - (b.queuedAt ?? now));
  const positions = [0, 0, 0, 0];
  /** @type {import('./terrain.js').Pick[]} */
  const result = [];
  // Three foreground samples per preview; refresh gets a slot every round. Empty shares are work-conserving.
  const schedule = fine ? [0, 0, 1, 0, 2, 3] : [0, 0, 1, 0, 2];
  let left = queues.reduce((n, q) => n + q.length, 0);
  while (left > 0) for (const group of schedule) {
    const p = queues[group][positions[group]];
    if (!p) continue;
    positions[group]++; result.push(p); left--;
  }
  return result;
}
/** One global episode, never one grant per viewer. Small moving edges cannot renew it. */
export class CatchupWindow {
  until = -1;
  next = 0;
  wasMissing = false;
  /** @param {number} now @param {number} missing @param {boolean} pressure */
  active(now, missing, pressure = false) {
    if (missing === 0) { this.wasMissing = false; this.until = -1; return false; }
    // Pressure skips this tick; one startup raster/JIT spike must not cancel the entire foreground episode.
    if (pressure) return false;
    if (!this.wasMissing && missing >= SCAN_POLICY.minimumMissing) {
      this.wasMissing = true; // A cohort blocked by cooldown cannot silently renew later while still missing.
      if (!pressure && now >= this.next) {
        this.until = now + SCAN_POLICY.catchupTicks;
        this.next = this.until + SCAN_POLICY.cooldownTicks;
      }
    }
    return !pressure && now < this.until;
  }
  reset() { this.until = -1; this.next = 0; this.wasMissing = false; }
}
/** Measured phase time for the current game tick. A native call itself cannot be interrupted. */
export class FeatureEnvelope {
  tick = -1;
  used = 0;
  peak = 0;
  last = 0;
  /** @param {number} tick */
  begin(tick) { if (tick !== this.tick) { this.last = this.used; this.peak = Math.max(this.peak, this.used); this.tick = tick; this.used = 0; } return Date.now(); }
  /** @param {number} started */
  end(started) { this.used += Math.max(0, Date.now() - started); }
  get room() { return Math.max(0, SCAN_POLICY.featureMs - this.used); }
}
