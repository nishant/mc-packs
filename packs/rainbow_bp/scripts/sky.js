// Where the rainbow goes and how it's drawn. Plain math with no game imports, so tools can test it in Node.
//
// The rainbow is a real object in the world: one arc standing in a fixed vertical plane, one foot on the pot of
// gold, built from round glowing dots (7 color bands, one dot per band per point along the arc), plus a golden
// light beam rising from the pot. Every point has a fixed world position; points farther than PROXY blocks from a
// player are drawn for that player on the line from their eyes to the real point, PROXY blocks out and scaled
// down to match, so each one looks exactly where and as big as the real one (far particles are lost in fog and
// unloaded chunks, close ones are not). Walk toward it and it grows; walk around it and you see it from the side.

/** `size` in config.js is the width foot to foot in blocks; at this width a color band is 1 block wide. */
export const BASE_WIDTH = 80;
/** Color bands, outside (red) to inside (violet), as 0-1 RGB. */
export const COLORS = [
  [0.95, 0.2, 0.2],
  [1, 0.55, 0.12],
  [1, 0.9, 0.25],
  [0.3, 0.85, 0.3],
  [0.22, 0.52, 1],
  [0.36, 0.3, 0.92],
  [0.62, 0.3, 0.95],
];
/** Points along the arc (per band) seen up close; a band's dots overlap their neighbors so it reads as one stripe. */
export const POINTS = 56;
/** Dot radius as a fraction of the band width: neighbors overlap, so the bands blend softly like real ones. */
export const DOT = 1.25;
/** A point farther than this from a player is drawn this far out, on the same line of sight, scaled to match. */
export const PROXY = 48;
/** Beyond this many blocks from the arc's middle, the bands and the beam get bolder (and the dots fewer). */
export const BOLD_FROM = 100;
/** The most they get bolder (3 times as wide, a third as many points). */
export const MAX_BOLD = 3;
/** The beam: this many segments, as tall in total as the rainbow is wide times BEAM_HEIGHT. */
export const BEAM_SEGMENTS = 16;
export const BEAM_HEIGHT = 0.8;
/** Beam half-width in blocks seen up close (a beacon beam is about 0.4). */
export const BEAM_WIDTH = 0.5;
/** The rainbow's end is picked within this angle (radians) of straight opposite the sun. */
export const SPREAD = Math.PI / 4;

/**
 * The direction straight away from the sun (or the moon at night), as an angle where x = cos and z = sin:
 * 0 is east (+x), PI is west (-x). The sun rises in the east (time 23000-0), stands overhead at 6000 and sets
 * in the west (12000); the moon follows it 12000 later.
 * @param {number} timeOfDay 0-23999
 */
export function antisolarAngle(timeOfDay) {
  const t = ((timeOfDay % 24000) + 24000) % 24000;
  // Light from the east (morning sun, or the moon before midnight): the rainbow is in the west.
  const eastLight = t >= 22000 || t < 6000 || (t >= 12000 && t < 18000);
  return eastLight ? Math.PI : 0;
}

/**
 * The arc's plane: across the line of sight of the player it appeared for (seen side on from there), turned
 * left or right. Returned as the angle from the pot's foot toward the other foot (x = cos, z = sin).
 * @param {{ x: number, z: number }} from @param {{ x: number, z: number }} end @param {boolean} left
 */
export function arcAngle(from, end, left) {
  return Math.atan2(end.z - from.z, end.x - from.x) + (left ? Math.PI / 2 : -Math.PI / 2);
}

/** @typedef {{ x: number, z: number, y: number, ang: number }} Anchor the pot's block (x, z), the arc's ground height y, its plane's angle */
/** @typedef {{ x: number, y: number, z: number }} Vec */

/** The middle of the arc's base. @param {Anchor} a @param {number} size */
export function center(a, size) {
  const r = size / 2;
  return { x: a.x + 0.5 + Math.cos(a.ang) * r, y: a.y, z: a.z + 0.5 + Math.sin(a.ang) * r };
}

/** How much bolder to draw it for an eye this far from its middle (1 up close, up to MAX_BOLD). @param {Vec} eye @param {Vec} mid */
export function boldness(eye, mid) {
  const d = Math.hypot(eye.x - mid.x, eye.z - mid.z);
  return Math.min(MAX_BOLD, Math.max(1, d / BOLD_FROM));
}

/**
 * Every dot of the arc: band 0 (red) outermost, the middle band's foot on the pot's block. A semicircle from the
 * pot's foot (angle PI) over the top to the other foot (0), `size` blocks apart.
 * @param {Anchor} a @param {number} size @param {number} bold
 * @returns {{ x: number, y: number, z: number, r: number, band: number }[]} r: dot radius in blocks
 */
export function arcDots(a, size, bold = 1) {
  const R = size / 2, bw = (size / BASE_WIDTH) * bold;
  const n = Math.max(12, Math.round(POINTS / bold));
  const cx = a.x + 0.5 + Math.cos(a.ang) * R, cz = a.z + 0.5 + Math.sin(a.ang) * R;
  const ux = Math.cos(a.ang), uz = Math.sin(a.ang);
  const out = [];
  for (let j = 0; j <= n; j++) {
    const t = (Math.PI * j) / n, c = Math.cos(t), s = Math.sin(t);
    for (let band = 0; band < COLORS.length; band++) {
      const r = R + ((COLORS.length - 1) / 2 - band) * bw;
      out.push({ x: cx - c * r * ux, y: a.y + s * r, z: cz - c * r * uz, r: DOT * bw, band });
    }
  }
  return out;
}

/**
 * The beam's segments over the pot: centers, half-width and half-height (a little taller, so they overlap) and
 * an alpha that thins toward the top.
 * @param {{ x: number, z: number }} at the pot's block @param {number} y bottom of the beam @param {number} size @param {number} bold
 */
export function beamSegments(at, y, size, bold = 1) {
  const h = (size * BEAM_HEIGHT) / BEAM_SEGMENTS, out = [];
  for (let i = 0; i < BEAM_SEGMENTS; i++) {
    const f = i / BEAM_SEGMENTS;
    out.push({ x: at.x + 0.5, y: y + h * (i + 0.5), z: at.z + 0.5, w: BEAM_WIDTH * bold, hh: h * 0.55, alpha: 1 - 0.75 * f * f });
  }
  return out;
}

/**
 * Where to draw a world point for one eye: the point itself when within `d`, else `d` blocks out on the line
 * toward it, with k the scale for its size (d / distance), so it looks the same.
 * @param {Vec} eye @param {Vec} p @param {number} d
 * @returns {Vec & { k: number }}
 */
export function toward(eye, p, d = PROXY) {
  const dx = p.x - eye.x, dy = p.y - eye.y, dz = p.z - eye.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist <= d) return { x: p.x, y: p.y, z: p.z, k: 1 };
  const k = d / dist;
  return { x: eye.x + dx * k, y: eye.y + dy * k, z: eye.z + dz * k, k };
}
