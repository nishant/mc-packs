// Ticking-area input checks shared by the harness test pack (copied next to harness.js as scripts/tickingarea.js)
// and its unit tests. Bedrock accepts `tickingarea add circle <x> <y> <z> <radius>` only for a whole radius of 1 to 4
// chunks: anything else fails in the game, and a swallowed failure used to show up 400 ticks later as "chunk did not
// load" (an invalid radius 6 in the first O74 fixture).
export const MIN_RADIUS = 1;
export const MAX_RADIUS = 4;

/** Why a circle radius is not usable, or null. @param {unknown} radius */
export function radiusProblem(radius) {
  const n = typeof radius === "string" && /^[+-]?\d+$/.test(radius.trim()) ? Number(radius) : radius;
  if (typeof n === "number" && Number.isInteger(n) && n >= MIN_RADIUS && n <= MAX_RADIUS) return null;
  return `a ticking area circle radius must be a whole number from ${MIN_RADIUS} to ${MAX_RADIUS} (got ${JSON.stringify(radius)}): the game rejects any other radius`;
}

const ADD_CIRCLE = /(?:^|\s)tickingarea\s+add\s+circle\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/i;

/** For a `tickingarea add circle` command (also after `execute ... run`), why its radius is not usable; null for anything else. @param {string} command */
export function tickingAreaCommandProblem(command) {
  const m = ADD_CIRCLE.exec(String(command));
  return m ? radiusProblem(m[4]) : null;
}

/**
 * What loadArea does after its tickingarea command ran: wait for the chunk, or fail now with the game's own message.
 * A rejected command is only harmless when the column is already readable (a player stands there).
 * @param {{ x: number, z: number, radius: number, add: { ok: boolean, error?: string }, readable: boolean }} input
 * @returns {{ action: "wait" | "fail", message: string }}
 */
export function afterTickingAreaAdd({ x, z, radius, add, readable }) {
  if (add.ok) return { action: "wait", message: "" };
  const why = add.error ? add.error : "the command did not succeed";
  if (readable) return { action: "wait", message: `tickingarea add circle ${x} ${z} radius ${radius} failed (${why}) but the chunk is already readable` };
  return { action: "fail", message: `tickingarea add circle ${Math.floor(x)} 0 ${Math.floor(z)} ${radius} failed: ${why}` };
}

// Ticking areas outlive the server: the world saves them, so the areas a phase's loadArea added are still there when
// t.restart() starts the next phase, and the game refuses a second area with the same name (the first native run of
// rainbow-race failed its second phase with "tickingarea add circle 163 0 170 2 failed: the command did not succeed").
// Two rules keep the phases apart: an area's name holds its phase, and the next phase removes the areas the harness
// added itself (and only those: the harness saves a list of them, and a scenario's own areas are never touched).
export const OWNED_AREAS_KEY = "harness:tickingAreas";
const OWNED_NAME = /^harness_\d+_\d+$/;
const DIMENSIONS = new Set(["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]);
// The game allows far fewer areas than this; the bound only keeps a damaged list from being walked forever.
const MAX_OWNED_AREAS = 100;

/**
 * Where an area is (x, z, radius) is kept too, so the next phase can wait for its chunks to load from the save before it
 * removes it (see circleChunks). A list saved without them still works: its areas are removed at once.
 * @typedef {{ name: string, dimension: string, x?: number, z?: number, radius?: number }} OwnedArea
 */

/** The area's place, when the entry has a usable one. @param {any} entry */
function placeOf(entry) {
  const { x, z, radius } = entry;
  return Number.isFinite(x) && Number.isFinite(z) && radiusProblem(radius) === null ? { x, z, radius } : {};
}

/** The name of the n-th area (from 1) that loadArea adds in a phase (from 1). @param {number} phase @param {number} n */
export const ownedAreaName = (phase, n) => `harness_${phase}_${n}`;

/** Whether a name is one the harness gave an area. @param {unknown} name */
export const isOwnedAreaName = (name) => typeof name === "string" && OWNED_NAME.test(name);

const shown = (/** @type {unknown} */ value) => {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
};

/**
 * The areas in the saved list, and what was wrong with the rest. Anything that is not a harness-named area in a known
 * dimension is refused, so a damaged or edited list cannot make the harness remove someone else's area.
 * @param {unknown} raw the saved dynamic property
 * @returns {{ areas: OwnedArea[], problems: string[] }}
 */
export function readOwnedAreas(raw) {
  if (raw === undefined || raw === null) return { areas: [], problems: [] };
  let list;
  try {
    if (typeof raw !== "string") throw new TypeError(`it is ${typeof raw}, not text`);
    list = JSON.parse(raw);
  } catch (e) {
    return { areas: [], problems: [`the saved list is not valid JSON (${/** @type {Error} */ (e).message}): ignored, no area is removed`] };
  }
  if (!Array.isArray(list)) return { areas: [], problems: ["the saved list is not a list: ignored, no area is removed"] };
  /** @type {OwnedArea[]} */
  const areas = [];
  /** @type {string[]} */
  const problems = [];
  for (const entry of list) {
    const ok = entry && typeof entry === "object" && isOwnedAreaName(entry.name) && DIMENSIONS.has(entry.dimension);
    if (!ok || areas.length >= MAX_OWNED_AREAS) {
      problems.push(`refused ${shown(entry)}: not a ticking area the harness added`);
      continue;
    }
    if (!areas.some((a) => a.name === entry.name && a.dimension === entry.dimension)) areas.push({ name: entry.name, dimension: entry.dimension, ...placeOf(entry) });
  }
  return { areas, problems };
}

/** The list with one more area (a new list; the same area twice is one entry). @param {OwnedArea[]} areas @param {OwnedArea} area */
export function addOwnedArea(areas, area) {
  if (!isOwnedAreaName(area.name)) throw new Error(`${shown(area.name)} is not a harness area name (harness_<phase>_<n>)`);
  if (!DIMENSIONS.has(area.dimension)) throw new Error(`${shown(area.dimension)} is not a known dimension for a harness area`);
  if (areas.some((a) => a.name === area.name && a.dimension === area.dimension)) return areas;
  return [...areas, { name: area.name, dimension: area.dimension, ...placeOf(area) }];
}

/**
 * Removes every area in the saved list through `remove` (one call per area, never for a refused entry). A removal that
 * fails or throws is reported with its reason and never stops the others; the caller decides what a report means.
 * @param {unknown} raw the saved dynamic property
 * @param {(area: OwnedArea) => { ok: boolean, error?: string }} remove
 * @returns {{ removed: OwnedArea[], problems: string[] }}
 */
export function releaseOwnedAreas(raw, remove) {
  const { areas, problems } = readOwnedAreas(raw);
  /** @type {OwnedArea[]} */
  const removed = [];
  for (const area of areas) {
    let result;
    try {
      result = remove(area);
    } catch (e) {
      result = { ok: false, error: String(/** @type {Error} */ (e)?.message ?? e) };
    }
    if (result.ok) removed.push(area);
    else problems.push(`could not remove ${area.name} (${area.dimension}): ${result.error ? result.error : "the command did not succeed"}; it is left as it is`);
  }
  return { removed, problems };
}

// A ticking area has to finish loading before it is removed. `tickingarea add circle <x> <y> <z> <r>` loads the whole
// square of (2r + 1) x (2r + 1) chunks around the chunk of x, z (measured on BDS 1.26.52 for r = 1, 2 and 4: the
// corners load too), and its middle can be read up to 30 ticks before its corners. An area removed while some of its
// chunks are still loading leaves those chunks unloadable for the rest of the run: no area added over them later
// loads them, and a simulated player standing on one is in an unloaded chunk. That was every "chunk at x,z did not
// load in 400 ticks" spawn failure of the perf soak, saga-perf-quests and maps-hunt (F73, F75), because those
// scenarios remove each spawn's area right after the spawn. So loadArea returns only once every chunk is readable (harness.js).

/**
 * The chunks a `tickingarea add circle <x> <y> <z> <radius>` loads. Despite the name, BDS 1.26 loads a square: every
 * chunk up to `radius` chunks from the center chunk on both axes, 3x3 for radius 1, 5x5 for 2, 7x7 for 3 (measured on
 * fresh terrain 300 ticks after the add, with no player near). @param {number} x @param {number} z
 * @param {number} radius @returns {{ x: number, z: number }[]}
 */
export function circleChunks(x, z, radius) {
  const cx = Math.floor(Math.floor(x) / 16), cz = Math.floor(Math.floor(z) / 16);
  const chunks = [];
  for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) chunks.push({ x: cx + dx, z: cz + dz });
  return chunks;
}
