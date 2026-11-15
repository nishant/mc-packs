// Which way a rainbow's end lies, and the bands of the rainbow standing over it. Plain math with no game imports, so tools can test it in Node.

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

/** The rainbow standing over its end: this wide foot to foot, in blocks (half as tall). */
export const ARC_WIDTH = 20;
/** Color bands, outside (red) to inside (violet), as 0-1 RGB, this far apart in blocks. */
export const COLORS = [
  [0.95, 0.2, 0.2],
  [1, 0.55, 0.12],
  [1, 0.9, 0.25],
  [0.3, 0.85, 0.3],
  [0.22, 0.52, 1],
  [0.36, 0.3, 0.92],
  [0.62, 0.3, 0.95],
];
export const BAND = 0.5;

/**
 * A rainbow standing in a vertical plane, its outer (red) foot at `foot`, the other foot ARC_WIDTH away along `ang`
 * (x = cos, z = sin). Each band is a half circle of radius `r` around `center`, the middle point between the feet;
 * `ux`, `uz` is the plane's direction (angle 0 is the far foot, 180 the pot's foot).
 * @param {{ x: number, y: number, z: number }} foot @param {number} ang
 * @returns {{ center: { x: number, y: number, z: number }, ux: number, uz: number, bands: { r: number, color: number[] }[] }}
 */
export function arcBands(foot, ang) {
  const r0 = ARC_WIDTH / 2;
  const ux = Math.cos(ang), uz = Math.sin(ang);
  return {
    center: { x: foot.x + ux * r0, y: foot.y, z: foot.z + uz * r0 },
    ux,
    uz,
    bands: COLORS.map((color, band) => ({ r: r0 - band * BAND, color })),
  };
}
