// Town Projects' placed-block cells (F37): natural-kind blocks players place in a town (dirt, sand, stone...) look
// like the ground, so the town remembers where they went, as 4 x 4 x 4 cells, and never levels there. No
// @minecraft import, so the unit tests (tools/town-placed.test.mjs) run it in node.
//
// A cell is packed into one number relative to the town's center: x and z cells within 65 of the center's cell
// (townRadius is at most 256), y cells from -16 to 79 (y -64 to 319). Saved as 4 base-36 characters a cell in
// `town:pl:<town>:0` and `:1`, 2,500 cells each. With 5,000 cells the oldest are dropped and the town is marked full
// (`plf`): from then on it never levels at all.

export const CELL = 4;
export const PER_PROP = 2500;
export const MAX_CELLS = 2 * PER_PROP;
const SPAN = 130; // x and z cells: -65 .. 64 around the center's cell
const OFF = 65;
const YS = 96; // y cells: -16 .. 79
const YOFF = 16;

/** @param {number} n */
const cellIndex = (n) => Math.floor(n / CELL);

/**
 * The packed cell of a block, or -1 when it is too far from the center to store.
 * @param {{ x: number, z: number }} center @param {number} x @param {number} y @param {number} z
 */
export function cellOf(center, x, y, z) {
  const dx = cellIndex(x) - cellIndex(center.x) + OFF;
  const dz = cellIndex(z) - cellIndex(center.z) + OFF;
  const dy = cellIndex(y) + YOFF;
  if (dx < 0 || dx >= SPAN || dz < 0 || dz >= SPAN || dy < 0 || dy >= YS) return -1;
  return (dx * SPAN + dz) * YS + dy;
}

/** @param {number[]} cells */
export const encodeCells = (cells) => cells.map((n) => n.toString(36).padStart(4, "0")).join("");

/** @param {unknown} s @returns {number[]} */
export function decodeCells(s) {
  if (typeof s !== "string") return [];
  /** @type {number[]} */
  const out = [];
  for (let i = 0; i + 4 <= s.length; i += 4) {
    const chunk = s.slice(i, i + 4);
    const n = /^[0-9a-z]{4}$/.test(chunk) ? parseInt(chunk, 36) : NaN;
    if (Number.isInteger(n) && n >= 0 && n < SPAN * SPAN * YS) out.push(n);
  }
  return out;
}

/**
 * A town's cells, oldest first, with a set to look them up.
 * @typedef {{ list: number[], set: Set<number>, full: boolean, dirty: boolean }} Cells
 */

/** @param {unknown[]} parts the saved properties, in order @param {boolean} full @returns {Cells} */
export function loadCells(parts, full) {
  const set = new Set(parts.flatMap((p) => decodeCells(p)));
  const list = [...set].slice(-MAX_CELLS);
  return { list, set: new Set(list), full: !!full, dirty: false };
}

/**
 * Adds a cell; past MAX_CELLS the oldest is dropped and the town is marked full. Returns true when it was new.
 * @param {Cells} c @param {number} cell
 */
export function addCell(c, cell) {
  if (cell < 0 || c.set.has(cell)) return false;
  c.list.push(cell);
  c.set.add(cell);
  c.dirty = true;
  while (c.list.length > MAX_CELLS) {
    const old = /** @type {number} */ (c.list.shift());
    c.set.delete(old);
    c.full = true;
  }
  return true;
}

/** The two properties to save. @param {Cells} c @returns {[string, string]} */
export const saveParts = (c) => [encodeCells(c.list.slice(0, PER_PROP)), encodeCells(c.list.slice(PER_PROP, MAX_CELLS))];

/**
 * Every cell a box covers, or undefined when that is more than `max` cells (the caller then marks the town full).
 * @param {{ x: number, z: number }} center @param {number[]} box [x1, y1, z1, x2, y2, z2] @param {number} [max]
 * @returns {number[] | undefined}
 */
export function boxCells(center, box, max = MAX_CELLS) {
  const [x1, y1, z1, x2, y2, z2] = box;
  const cx1 = cellIndex(Math.min(x1, x2));
  const cx2 = cellIndex(Math.max(x1, x2));
  const cy1 = cellIndex(Math.min(y1, y2));
  const cy2 = cellIndex(Math.max(y1, y2));
  const cz1 = cellIndex(Math.min(z1, z2));
  const cz2 = cellIndex(Math.max(z1, z2));
  if ((cx2 - cx1 + 1) * (cy2 - cy1 + 1) * (cz2 - cz1 + 1) > max) return undefined;
  /** @type {number[]} */
  const out = [];
  for (let a = cx1; a <= cx2; a++)
    for (let b = cy1; b <= cy2; b++)
      for (let d = cz1; d <= cz2; d++) {
        const n = cellOf(center, a * CELL, b * CELL, d * CELL);
        if (n >= 0) out.push(n);
      }
  return out;
}

/**
 * Does any marked cell touch the box (x and z inclusive, y from y1 to y2)?
 * @param {Cells | undefined} c @param {{ x: number, z: number }} center @param {{ x1: number, z1: number, x2: number, z2: number }} r @param {number} y1 @param {number} y2
 */
export function touches(c, center, r, y1, y2) {
  if (!c || !c.set.size) return false;
  for (let a = cellIndex(r.x1); a <= cellIndex(r.x2); a++)
    for (let d = cellIndex(r.z1); d <= cellIndex(r.z2); d++)
      for (let b = cellIndex(y1); b <= cellIndex(y2); b++) if (c.set.has(cellOf(center, a * CELL, b * CELL, d * CELL))) return true;
  return false;
}
