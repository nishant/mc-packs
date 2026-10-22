// Original circular frame styles. Terrain colors, font mapping and compositor layout do not vary.
/** @typedef {[number, number, number, number]} RGBA */
/** @typedef {{label: string, rim: RGBA, inner: RGBA, background: RGBA, accent: RGBA, north: RGBA, letter: RGBA, ticks: number, pixelFrame?: boolean, oakFrame?: boolean}} Theme */
/** @type {Record<string, Theme>} */
export const THEMES = {
  oak: { label: "Oak", rim: [58, 38, 23, 255], inner: [165, 124, 65, 255], background: [66, 45, 26, 255], accent: [216, 177, 106, 255], north: [255, 211, 177, 255], letter: [255, 239, 191, 255], ticks: 4, oakFrame: true },
  classic: { label: "Classic", rim: [26, 35, 28, 250], inner: [113, 143, 110, 255], background: [16, 25, 19, 214], accent: [220, 204, 150, 255], north: [244, 130, 106, 255], letter: [242, 237, 218, 255], ticks: 4 },
  slate: { label: "Slate", rim: [9, 16, 25, 250], inner: [109, 158, 184, 255], background: [11, 20, 31, 220], accent: [173, 220, 237, 255], north: [255, 137, 126, 255], letter: [223, 240, 248, 255], ticks: 8 },
  parchment: { label: "Parchment", rim: [50, 37, 27, 255], inner: [173, 136, 80, 255], background: [48, 38, 25, 220], accent: [240, 219, 163, 255], north: [144, 44, 32, 255], letter: [50, 37, 27, 255], ticks: 8, pixelFrame: true },
};
