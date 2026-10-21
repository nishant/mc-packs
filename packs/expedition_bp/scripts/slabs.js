// Splitting a dungeon build's fills into steps small enough for one tick (no imports: tools/expedition-slabs.test.mjs
// loads it in Node).

/** Blocks one fill step may cover: about 8 ms on the BDS test server with 40 players on (a 16 x 16 x 20 fill was 20). */
export const STEP_BLOCKS = 2048;

/** Time (ms) a step that places many single blocks (a room's parts) runs before it waits for the next turn. */
export const STEP_MS = 8;

/**
 * The box from `from` to `to` (corners in any order) as horizontal slabs of at most `most` blocks each (at least one
 * layer each), bottom first. Together they cover the box exactly once.
 * @param {{ x: number, y: number, z: number }} from @param {{ x: number, y: number, z: number }} to @param {number} [most]
 * @returns {{ from: { x: number, y: number, z: number }, to: { x: number, y: number, z: number } }[]}
 */
export function slabs(from, to, most = STEP_BLOCKS) {
  const a = { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), z: Math.min(from.z, to.z) };
  const b = { x: Math.max(from.x, to.x), y: Math.max(from.y, to.y), z: Math.max(from.z, to.z) };
  const area = (b.x - a.x + 1) * (b.z - a.z + 1);
  const layers = Math.max(1, Math.floor(most / area));
  const out = [];
  for (let y = a.y; y <= b.y; y += layers) out.push({ from: { x: a.x, y, z: a.z }, to: { x: b.x, y: Math.min(b.y, y + layers - 1), z: b.z } });
  return out;
}
