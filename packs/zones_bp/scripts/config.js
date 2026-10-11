export const CONFIG = {
  /** Radius the "Add a safe zone here" slider starts at, in blocks (8 to `maxRadius`, in steps of 8). */
  defaultRadius: 64,

  /** Largest safe zone radius, in blocks (at most 512). */
  maxRadius: 512,

  /** Seconds the outline of a new zone shows before you confirm it (and "Show outline" shows a zone's). */
  previewSeconds: 20,

  /** Players who aren't operators can add safe zones too, within the two limits below. Operators can always. */
  playersCreate: false,

  /** Most safe zones one player (not an operator) can have. */
  playerMaxZones: 1,

  /** Largest radius a player (not an operator) can give a safe zone, in blocks. */
  playerMaxRadius: 64,
};
