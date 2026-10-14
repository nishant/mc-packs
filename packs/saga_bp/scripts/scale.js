// Far story spots: `farScale` brings story spots and auto-picked places that lie more than KNEE blocks
// from world spawn closer to it. A spot keeps its direction; only the part of its distance past KNEE
// shrinks (0.5: a spot 1,200 blocks out is at 300 + 900 x 0.5 = 750). Story text names those distances
// with tokens, so what players read matches where the tracker points:
//   {far:x,z}          the scaled distance of the spot at offset (x, z) from spawn: "750"
//   {leg:x1,z1,x2,z2}  the scaled distance between two such spots
//   {band:place}       where a place is: "about 1,150" once it is set, else its scaled auto-pick band: "550 to 900"
import { get, onChange } from "./settings.js";
import { PREFABS } from "./prefabs.js";

/** Spots within this many blocks of world spawn never move. */
export const KNEE = 300;

/** @returns {number} */
const factor = () => {
  const f = Number(get("farScale"));
  return Number.isFinite(f) ? Math.min(1, Math.max(0.25, f)) : 1;
};

/** A distance from spawn after scaling. @param {number} d */
export const farDist = (d) => (d <= KNEE ? d : KNEE + (d - KNEE) * factor());

/** An offset from spawn, moved along its own direction. @param {{ x: number, z: number }} o */
export function farOffset(o) {
  const d = Math.hypot(o.x, o.z);
  if (d <= KNEE) return o;
  const k = farDist(d) / d;
  return { x: Math.round(o.x * k), z: Math.round(o.z * k) };
}

/** Rounds a distance the way the stories write it: to 10 below 600 blocks, to 50 from there. @param {number} d */
const say = (d) => {
  const r = d < 600 ? Math.round(d / 10) * 10 : Math.round(d / 50) * 50;
  return String(r).replace(/\B(?=(\d{3})+$)/g, ","); // toLocaleString has no separators in the game
};

/** How far a set place is from spawn (undefined while it isn't set): given by places.js. @type {(name: string) => number | undefined} */
let placeDist = () => undefined;
/** @param {(name: string) => number | undefined} fn */
export const setPlaceDist = (fn) => {
  placeDist = fn;
};

const TOKEN = /\{(far|leg|band):([^}]+)\}/g;

/** @param {string} kind @param {string} arg */
function render(kind, arg) {
  if (kind === "band") {
    const at = placeDist(arg);
    if (at !== undefined) return `about ${say(at)}`;
    const p = PREFABS[arg];
    return p ? `${say(farDist(p.minDist))} to ${say(farDist(p.maxDist))}` : arg;
  }
  const n = arg.split(",").map(Number);
  if (kind === "far") return say(farDist(Math.hypot(n[0], n[1])));
  const a = farOffset({ x: n[0], z: n[1] });
  const b = farOffset({ x: n[2], z: n[3] });
  return say(Math.hypot(a.x - b.x, a.z - b.z));
}

/** Fills the tokens in one string. @param {string} s */
export const fillFar = (s) => s.replace(TOKEN, (_, kind, arg) => render(kind, arg));

/** Every story string that has a token: [object, key, the string as written]. @type {[any, string | number, string][]} */
const raw = [];

/** @param {any} v @param {Set<any>} seen */
function scan(v, seen) {
  if (!v || typeof v !== "object" || seen.has(v)) return;
  seen.add(v);
  for (const k of Object.keys(v)) {
    const x = v[k];
    if (typeof x === "string") {
      if (x.includes("{far:") || x.includes("{leg:") || x.includes("{band:")) raw.push([v, k, x]);
    } else scan(x, seen);
  }
}

/** Writes the current distances into the stories (again when a place is set or moved). */
export function refresh() {
  for (const [o, k, s] of raw) o[k] = fillFar(s);
}

/**
 * Finds the tokens in the story data once and fills them, and again whenever `farScale` changes.
 * @param {...any} roots story lists, favors, templates
 */
export function initFar(...roots) {
  const seen = new Set();
  for (const r of roots) scan(r, seen);
  refresh();
  onChange((key) => {
    if (key === "farScale" || key === "*") refresh();
  });
}
