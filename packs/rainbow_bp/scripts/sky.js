// Which way a rainbow's end lies. Plain math with no game imports, so tools can test it in Node.

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
