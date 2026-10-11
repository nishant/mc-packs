// Where the rainbow goes. Plain math with no game imports, so tools can test it in Node.

/** `size` in config.js is the rainbow's width as it looks from this far away. */
export const SIZE_AT = 100;
/**
 * The rainbow is drawn this close (scaled down so it looks the same size). Far particles are fogged like
 * everything else: rain fog ends at about half the render distance, and the render distance fog at its edge,
 * so a rainbow 100 blocks out was invisible during and right after rain, or on a short render distance.
 */
export const DRAW_DISTANCE = 32;
/** If the drawing spot isn't loaded, this closer one is tried. */
export const FALLBACK_DISTANCE = 20;
/** Smallest the rainbow gets when you stand right at its end. */
export const MIN_SIZE = 12;
/** Its feet sit this far under eye level per block of distance, just under the horizon. */
export const FOOT_DROP = 0.05;
const EYE = 1.62;
/**
 * Where the band's feet are, as a fraction of the half width: the Realm Skies texture's bands run from 0.7 to
 * 0.97 of the half width from the middle, so the middle of a foot is 0.835 of it.
 */
export const FOOT = 0.835;
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
 * Where to spawn the rainbow particle for one player. The arc stands on the line toward its end with one foot
 * exactly on that line, DRAW_DISTANCE away (at its real spot when closer). The particle faces the player and
 * its position is the middle of the arc's base, so it goes FOOT half widths to the side of the line.
 * @param {{ x: number, y: number, z: number }} player feet
 * @param {{ x: number, z: number, y?: number }} end the pot's block
 * @param {number} size config width, as seen from SIZE_AT blocks
 * @param {number} d how far to draw it (DRAW_DISTANCE, or FALLBACK_DISTANCE when that isn't loaded)
 * @returns {{ x: number, y: number, z: number, size: number, real: boolean }}
 */
export function placement(player, end, size, d = DRAW_DISTANCE) {
  const fx = end.x + 0.5 - player.x, fz = end.z + 0.5 - player.z;
  const dist = Math.max(1, Math.hypot(fx, fz));
  const ux = fx / dist, uz = fz / dist;
  const real = dist <= d;
  const at = real ? dist : d;
  const width = Math.max(MIN_SIZE, (size * at) / SIZE_AT);
  const y = real && typeof end.y === "number" ? end.y : player.y + EYE - FOOT_DROP * at;
  const side = (width / 2) * FOOT;
  return { x: player.x + ux * at - uz * side, y, z: player.z + uz * at + ux * side, size: width, real };
}
