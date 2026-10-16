// Which way a rainbow's end lies, and the dots of the rainbow standing over it. Plain math with no game imports, so tools can test it in Node.

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
/** About this many blocks between dots along a band. */
export const STEP = 0.75;

/**
 * The dots of a rainbow standing in a vertical plane, its outer (red) foot at `foot`, the other foot ARC_WIDTH
 * away along `ang` (x = cos, z = sin). Each band is a half circle around the middle point between the feet.
 * @param {{ x: number, y: number, z: number }} foot @param {number} ang
 * @returns {{ x: number, y: number, z: number, band: number }[]}
 */
export function arcDots(foot, ang) {
  const r0 = ARC_WIDTH / 2;
  const ux = Math.cos(ang), uz = Math.sin(ang);
  const cx = foot.x + ux * r0, cz = foot.z + uz * r0;
  /** @type {{ x: number, y: number, z: number, band: number }[]} */
  const out = [];
  COLORS.forEach((_, band) => {
    const r = r0 - band * BAND;
    const n = Math.max(2, Math.ceil((Math.PI * r) / STEP));
    for (let i = 0; i <= n; i++) {
      const a = (Math.PI * i) / n; // 0 at the far foot, PI at the pot's foot
      out.push({ x: cx + ux * Math.cos(a) * r, y: foot.y + Math.sin(a) * r, z: cz + uz * Math.cos(a) * r, band });
    }
  });
  return out;
}
