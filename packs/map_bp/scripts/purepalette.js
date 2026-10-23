// Pure 3-bit RGB palette helpers for the minimap's generated F4/F5 glyph pages.
// Map colors expose normalized channels; alpha is validated but deliberately does not affect RGB. Bedrock may report
// a fully transparent tintedColor while its RGB is still meaningful (for example, grass and water).
export const PALETTE_CHANNELS = 8;
export const PALETTE_SIZE = PALETTE_CHANNELS ** 3;
const MAX_LEVEL = PALETTE_CHANNELS - 1;

/** @param {unknown} value @returns {value is number} */
function channel(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Quantizes a normalized RGBA color into its own 3-bit-per-channel RGB palette index, or rejects malformed values.
 * The index is RRR GGG BBB (0..511). Alpha must be finite and normalized, but alpha=0 is valid and ignored.
 * @param {{ red?: unknown, green?: unknown, blue?: unknown, alpha?: unknown } | undefined | null} rgba
 */
export function quantizeRGBA(rgba) {
  if (!rgba || !channel(rgba.red) || !channel(rgba.green) || !channel(rgba.blue) || !channel(rgba.alpha)) return undefined;
  const r = Math.round(rgba.red * MAX_LEVEL);
  const g = Math.round(rgba.green * MAX_LEVEL);
  const b = Math.round(rgba.blue * MAX_LEVEL);
  return (r << 6) | (g << 3) | b;
}

/**
 * Applies one quantized shade step to each RGB channel, clamping at black and white. Invalid indices are rejected.
 * @param {number} index
 * @param {number} direction -1: darker; 0: unchanged; 1: brighter
 */
export function shadePaletteIndex(index, direction) {
  if (!Number.isInteger(index) || index < 0 || index >= PALETTE_SIZE || !Number.isInteger(direction)) return undefined;
  const step = Math.max(-1, Math.min(1, direction));
  const r = Math.max(0, Math.min(MAX_LEVEL, ((index >> 6) & 7) + step));
  const g = Math.max(0, Math.min(MAX_LEVEL, ((index >> 3) & 7) + step));
  const b = Math.max(0, Math.min(MAX_LEVEL, (index & 7) + step));
  return (r << 6) | (g << 3) | b;
}

/** @param {number} index */
export function validPaletteIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < PALETTE_SIZE;
}
