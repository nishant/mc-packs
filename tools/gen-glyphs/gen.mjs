// Generates the minimap's glyph font and the file that names its characters:
//   packs/hud_rp/font/glyph_F3.png      Bedrock glyph page F3: 16 x 16 cells of 16 x 16 pixels, cell k is U+F300 + k
//   packs/hud_rp/pack_icon.png          Side HUD's pack icon (128 x 128): the HUD over a game view
//   packs/map_bp/scripts/glyphs.js      every private-use character the packs use, by name (the only file allowed them)
//   docs/media/map-hud.png              a render of the compass strip and the radar made from the same cells
// Page F3 (U+F300-U+F3FF) is in Unicode's Private Use Area, so no real text uses it, and it is away from the pages
// add-ons usually take (Mojang's E0 and E1, add-ons' E2-E9). Players without the font see a box for each glyph.
// The glyphs carry their own colors (text color multiplies them, and the packs draw them white). Every cell is
// drawn edge to edge (a baseline or a dark square), so each glyph is as wide as the next and markers placed by
// cell line up. Deterministic, so the same code always writes the same files.
//
//   node tools/gen-glyphs/gen.mjs           write them (npm run gen:glyphs)
//   node tools/gen-glyphs/gen.mjs --check   fail if a committed file differs or is missing (part of npm run check)
//   Add --output=<relative path> (repeatable) to write/check only named outputs, leaving other assets untouched.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { THEMES } from "./themes.mjs";
import { blank, decode, encode, samePixels } from "../gen-rain/png.mjs";

const outputRootArg=process.argv.find(a=>a.startsWith("--output-root="));
const root=outputRootArg?resolve(outputRootArg.slice(14)):join(import.meta.dirname,"..","..");
const themeId=process.argv.find(a=>a.startsWith("--theme="))?.slice(8)??"oak";
const THEME=THEMES[themeId];if(!THEME)throw new Error("Unknown minimap art theme: "+themeId);
const check = process.argv.includes("--check");
const selectedOutputs = process.argv.filter((arg) => arg.startsWith("--output=")).map((arg) => arg.slice("--output=".length));
const PAGE = 0xf3;
const CELL = 16;

/** @typedef {import("../gen-rain/png.mjs").Image} Image */
/** @typedef {[number, number, number, number]} RGBA */

/** @param {Image} img @param {number} x @param {number} y @param {RGBA} c */
function put(img, x, y, c) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height || c[3] <= 0) return;
  const i = (y * img.width + x) * 4;
  const a = c[3] / 255, b = img.data[i + 3] / 255;
  const out = a + b * (1 - a);
  for (let k = 0; k < 3; k++) img.data[i + k] = out ? Math.round((c[k] * a + img.data[i + k] * b * (1 - a)) / out) : 0;
  img.data[i + 3] = Math.round(out * 255);
}
/** @param {Image} img @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {RGBA} c inclusive */
function rect(img, x0, y0, x1, y1, c) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(img, x, y, c);
}
/** Is (x, y) inside the polygon? (even-odd) @param {number[][]} pts @param {number} x @param {number} y */
function inside(pts, x, y) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
/** A filled polygon, 4 x 4 samples a pixel. @param {Image} img @param {number} ox @param {number} oy @param {number[][]} pts @param {RGBA} c */
function poly(img, ox, oy, pts, c) {
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++) {
      let n = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (inside(pts, x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) n++;
      if (n) put(img, ox + x, oy + y, [c[0], c[1], c[2], Math.round((c[3] * n) / 16)]);
    }
}
/** A filled circle. @param {Image} img @param {number} ox @param {number} oy @param {number} cx @param {number} cy @param {number} r @param {RGBA} c */
function disc(img, ox, oy, cx, cy, r, c) {
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++) {
      let n = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (Math.hypot(x + (sx + 0.5) / 4 - cx, y + (sy + 0.5) / 4 - cy) <= r) n++;
      if (n) put(img, ox + x, oy + y, [c[0], c[1], c[2], Math.round((c[3] * n) / 16)]);
    }
}
/** A marker with a dark rim so it reads on snow and on sand. @param {Image} img @param {number} ox @param {number} oy @param {number[][]} pts @param {RGBA} c */
function rimmedPoly(img, ox, oy, pts, c) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const grow = pts.map(([x, y]) => {
    const d = Math.hypot(x - cx, y - cy) || 1;
    return [x + ((x - cx) / d) * 1.2, y + ((y - cy) / d) * 1.2];
  });
  poly(img, ox, oy, grow, RIM);
  poly(img, ox, oy, pts, c);
}
/** @param {Image} img @param {number} ox @param {number} oy @param {number} cx @param {number} cy @param {number} r @param {RGBA} c */
function rimmedDisc(img, ox, oy, cx, cy, r, c) {
  disc(img, ox, oy, cx, cy, r + 1.2, RIM);
  disc(img, ox, oy, cx, cy, r, c);
}

const RIM = /** @type {RGBA} */ ([20, 20, 20, 220]);
const WHITE = /** @type {RGBA} */ ([245, 245, 245, 255]);
const LINE = /** @type {RGBA} */ ([210, 210, 210, 150]);
const TICK = /** @type {RGBA} */ ([210, 210, 210, 210]);
const NORTH = /** @type {RGBA} */ ([255, 90, 80, 255]);
const BG = /** @type {RGBA} */ ([56, 128, 48, 255]);
const BG_ACCENT = /** @type {RGBA} */ ([72, 150, 60, 255]);
/** Marker colors. */
const COLOR = /** @type {Record<string, RGBA>} */ ({
  mob: [235, 55, 45, 255],
  folk: [255, 214, 50, 255],
  wander: [80, 210, 90, 255],
  party: [70, 150, 255, 255],
  star: [255, 176, 20, 255],
  camp: [235, 135, 55, 255],
  site: [190, 120, 255, 255],
  other: [240, 240, 240, 255],
});

// Pixel letters, 5 x 7: twice the size for the cardinal points, as they are for the two-letter ones.
const BIG = /** @type {Record<string, string[]>} */ ({
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
});
/** @param {Image} img @param {number} ox @param {number} oy @param {string[]} rows @param {number} x0 @param {number} y0 @param {number} s @param {RGBA} c */
function letter(img, ox, oy, rows, x0, y0, s, c) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === "1") rect(img, ox + x0 + x * s, oy + y0 + y * s, ox + x0 + x * s + s - 1, oy + y0 + y * s + s - 1, c);
  });
}

// Shapes, centered on the cell.
const star = (/** @type {number} */ r) => Array.from({ length: 10 }, (_, i) => {
  const a = (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
  return [8 + rr * Math.cos(a), 8.3 + rr * Math.sin(a)];
});
const TENT = [[8, 2.5], [14, 13], [2, 13]];
const DIAMOND = [[8, 2], [13.5, 8], [8, 14], [2.5, 8]];
/** The radar's player arrow, turned `deg` clockwise from north. @param {number} deg @param {number} [scale] */
function arrow(deg, scale = 1) {
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  return [[0, -6.5], [5, 6], [0, 3], [-5, 6]].map(([x, y]) => [8 + scale * (x * cos - y * sin), 8 + scale * (x * sin + y * cos)]);
}
const LEFT = [[2, 8], [12, 2.5], [12, 13.5]];
const RIGHT = [[14, 8], [4, 2.5], [4, 13.5]];

/** Strip cells: a thin baseline across the bottom, so every cell is full width. */
const baseline = (/** @type {Image} */ img, /** @type {number} */ ox, /** @type {number} */ oy) => rect(img, ox, oy + 15, ox + 15, oy + 15, LINE);
/** Radar cells: a seamless grass-toned ground tile with zero grid lines. */
/** While a background-matched marker variant is drawn, the tile colors that replace the grass ones (null otherwise). @type {{ base: RGBA, accent: RGBA } | null} */
let bgOverride = null;
const square = (/** @type {Image} */ img, /** @type {number} */ ox, /** @type {number} */ oy) => {
  const base = bgOverride ? bgOverride.base : BG, accent = bgOverride ? bgOverride.accent : BG_ACCENT;
  rect(img, ox, oy, ox + 15, oy + 15, base);
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++)
      if ((x * 5 + y * 7) % 11 === 0) put(img, ox + x, oy + y, accent);
};
/**
 * Radar terrain cell: an opaque, seamless borderless ground tile with deterministic pixel accents.
 * @param {Image} img
 * @param {number} ox
 * @param {number} oy
 * @param {RGBA} baseRGBA
 * @param {RGBA} accentRGBA
 * @param {(x: number, y: number) => boolean} patternFn
 */
const terrainSquare = (img, ox, oy, baseRGBA, accentRGBA, patternFn) => {
  if (bgOverride) { baseRGBA = bgOverride.base; accentRGBA = bgOverride.accent; }
  /** @type {RGBA} */
  const base = [baseRGBA[0], baseRGBA[1], baseRGBA[2], 255];
  /** @type {RGBA} */
  const accent = [accentRGBA[0], accentRGBA[1], accentRGBA[2], 255];
  rect(img, ox, oy, ox + 15, oy + 15, base);
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++)
      if (patternFn(x, y)) put(img, ox + x, oy + y, accent);
};

/**
 * Every glyph: its name in glyphs.js, its cell (U+F300 + cell) and how it's drawn.
 * @type {{ name: string, cell: number, what: string, draw: (img: Image, ox: number, oy: number) => void }[]}
 */
const GLYPHS = [];
/** @param {string} name @param {number} cell @param {string} what @param {(img: Image, ox: number, oy: number) => void} draw */
const glyph = (name, cell, what, draw) => GLYPHS.push({ name, cell, what, draw });

// Row 0: the compass strip's ruler.
glyph("S_BLANK", 0x00, "strip: empty", (img, ox, oy) => baseline(img, ox, oy));
glyph("S_TICK", 0x01, "strip: a tick every 15 degrees", (img, ox, oy) => {
  baseline(img, ox, oy);
  rect(img, ox + 7, oy + 11, ox + 8, oy + 14, TICK);
});
glyph("S_CENTER", 0x02, "strip: where you face", (img, ox, oy) => {
  baseline(img, ox, oy);
  rect(img, ox + 7, oy + 5, ox + 8, oy + 14, WHITE);
  poly(img, ox, oy, [[4, 1], [12, 1], [8, 5]], WHITE);
});
for (const [i, l] of ["N", "E", "S", "W"].entries())
  glyph(`S_${l}`, 0x03 + i, `strip: ${l}`, (img, ox, oy) => {
    baseline(img, ox, oy);
    letter(img, ox, oy, BIG[l], 3, 0, 2, RIM);
    letter(img, ox, oy, BIG[l], 3, 0, 2, l === "N" ? NORTH : WHITE);
  });
for (const [i, l] of ["NE", "SE", "SW", "NW"].entries())
  glyph(`S_${l}`, 0x07 + i, `strip: ${l}`, (img, ox, oy) => {
    baseline(img, ox, oy);
    letter(img, ox, oy, BIG[l[0]], 2, 4, 1, TICK);
    letter(img, ox, oy, BIG[l[1]], 9, 4, 1, TICK);
  });

// Row 1: strip markers. Row 2: the strip's edge arrows (left, then right), for what is outside the strip.
const MARKS = /** @type {[string, string, (img: Image, ox: number, oy: number, c: RGBA) => void][]} */ ([
  ["MOB", "a mob (red)", (img, ox, oy, c) => rimmedDisc(img, ox, oy, 8, 7.5, 3.6, c)],
  ["FOLK", "a townsfolk (yellow)", (img, ox, oy, c) => rimmedDisc(img, ox, oy, 8, 7.5, 3.6, c)],
  ["WANDER", "a wanderer (green)", (img, ox, oy, c) => rimmedDisc(img, ox, oy, 8, 7.5, 3.6, c)],
  ["PARTY", "a party mate (blue)", (img, ox, oy, c) => rimmedDisc(img, ox, oy, 8, 7.5, 4.2, c)],
  ["STAR", "the destination (gold star)", (img, ox, oy, c) => rimmedPoly(img, ox, oy, star(6.8), c)],
  ["CAMP", "a wanderer camp (tent)", (img, ox, oy, c) => rimmedPoly(img, ox, oy, TENT, c)],
  ["SITE", "an Atlas site (diamond)", (img, ox, oy, c) => rimmedPoly(img, ox, oy, DIAMOND, c)],
  ["OTHER", "another player (white)", (img, ox, oy, c) => rimmedDisc(img, ox, oy, 8, 7.5, 3.2, c)],
]);
const KEYS = ["mob", "folk", "wander", "party", "star", "camp", "site", "other"];
MARKS.forEach(([name, what, draw], i) => {
  const c = COLOR[KEYS[i]];
  glyph(`S_${name}`, 0x10 + i, `strip: ${what}`, (img, ox, oy) => {
    baseline(img, ox, oy);
    draw(img, ox, oy, c);
  });
  glyph(`L_${name}`, 0x20 + i, `strip edge, left: ${what}`, (img, ox, oy) => {
    baseline(img, ox, oy);
    rimmedPoly(img, ox, oy, LEFT, c);
  });
  glyph(`R_${name}`, 0x28 + i, `strip edge, right: ${what}`, (img, ox, oy) => {
    baseline(img, ox, oy);
    rimmedPoly(img, ox, oy, RIGHT, c);
  });
  // Row 3: the same markers on a radar square.
  glyph(`Q_${name}`, 0x30 + i, `radar: ${what}`, (img, ox, oy) => {
    square(img, ox, oy);
    if (name === "OTHER") rimmedDisc(img, ox, oy, 8, 7.5, 3.8, c);
    else if (name === "PARTY") rimmedDisc(img, ox, oy, 8, 7.5, 4.8, c);
    else draw(img, ox, oy, c);
  });
});
// Unknown terrain (not cached or unavailable, not remembered exploration): muted stone/parchment neutral, not grass.
const UNKNOWN_RGBA = /** @type {RGBA} */ ([56, 128, 48, 255]);
glyph("Q_EMPTY", 0x38, "radar: unknown (cosmetic grass; unsampled)", (img, ox, oy) => rect(img, ox, oy, ox + 15, oy + 15, UNKNOWN_RGBA));
// Dimension-specific unknown/known-empty tiles (row E). Opaque, generated, never sampled terrain; OVERWORLD keeps Q_EMPTY green.
for (const cell of [0xe0, 0xe1, 0xe2, 0xe3]) if (GLYPHS.some((g) => g.cell === cell)) throw new Error("Dimension glyph slot collision");
const dimTile = (/** @type {RGBA} */ base, /** @type {RGBA | null} */ ink, /** @type {(x: number, y: number) => boolean} */ hatch) => (/** @type {Image} */ img, /** @type {number} */ ox, /** @type {number} */ oy) => {
  rect(img, ox, oy, ox + 15, oy + 15, base);
  if (ink) for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) if (hatch(x, y)) put(img, ox + x, oy + y, ink);
};
glyph("Q_NETHER_UNKNOWN", 0xe0, "radar: Nether unknown, dark ember with small orange hatch (not sampled lava)", dimTile([62, 28, 24, 255], [168, 82, 34, 255], (x, y) => (x + y) % 6 === 0 && x % 2 === 0));
glyph("Q_END_UNKNOWN", 0xe1, "radar: End unknown, muted purple hatch, clearly unread", dimTile([44, 34, 62, 255], [92, 74, 124, 255], (x, y) => (x - y + 16) % 4 === 0));
glyph("Q_VOID", 0xe2, "radar: End known empty void, solid near-black purple", dimTile([10, 6, 18, 255], null, () => false));
glyph("Q_NETHER_EMPTY", 0xe3, "radar: Nether known empty air, charcoal red", dimTile([48, 30, 32, 255], null, () => false));
// A champion (Champions, or a Choir siege's Singer): the mob's red dot in a bright orange ring, so it reads bigger.
// On the strip, at its edges and on the radar; it shows at the radar's edge too when it's beyond it.
const CHAMP_RING = /** @type {RGBA} */ ([255, 150, 20, 255]);
/** @param {Image} img @param {number} ox @param {number} oy */
const champDot = (img, ox, oy) => {
  disc(img, ox, oy, 8, 7.5, 6.6, RIM);
  disc(img, ox, oy, 8, 7.5, 5.6, CHAMP_RING);
  disc(img, ox, oy, 8, 7.5, 3.7, COLOR.mob);
};
/** An edge arrow in the champion's colors: dark rim, orange ring, red middle. @param {Image} img @param {number} ox @param {number} oy @param {number[][]} pts */
const champArrow = (img, ox, oy, pts) => {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const scale = (/** @type {number} */ k) => pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
  rimmedPoly(img, ox, oy, pts, CHAMP_RING);
  poly(img, ox, oy, scale(0.55), COLOR.mob);
};
glyph("S_CHAMP", 0x74, "strip: a champion or a Choir Singer (red, orange ring)", (img, ox, oy) => {
  baseline(img, ox, oy);
  champDot(img, ox, oy);
});
glyph("L_CHAMP", 0x72, "strip edge, left: a champion or a Choir Singer", (img, ox, oy) => {
  baseline(img, ox, oy);
  champArrow(img, ox, oy, LEFT);
});
glyph("R_CHAMP", 0x73, "strip edge, right: a champion or a Choir Singer", (img, ox, oy) => {
  baseline(img, ox, oy);
  champArrow(img, ox, oy, RIGHT);
});
glyph("Q_CHAMP", 0x3d, "radar: a champion or a Choir Singer (red, orange ring)", (img, ox, oy) => {
  square(img, ox, oy);
  champDot(img, ox, oy);
});

// Compass badges on the radar's edge: a dark rimmed disc with a bold letter, N in red, the rest warm white.
const COMPASS_WHITE = /** @type {RGBA} */ ([245, 240, 220, 255]);
for (const [i, l] of ["N", "E", "S", "W"].entries()) {
  const name = { N: "NORTH", E: "EAST", S: "SOUTH", W: "WEST" }[l];
  glyph(`Q_${name}`, 0x39 + i, `radar: compass ${l}, on the edge, turning as you turn`, (img, ox, oy) => {
    square(img, ox, oy);
    disc(img, ox, oy, 8, 8, 7.8, [235, 235, 235, 120]);
    disc(img, ox, oy, 8, 8, 7.2, [18, 20, 26, 235]);
    letter(img, ox, oy, BIG[l], 3, 1, 2, l === "N" ? [255, 85, 75, 255] : COMPASS_WHITE);
  });
}
// Row 4: the player in the radar's middle, facing N, NE, E, SE, S, SW, W, NW.
for (let k = 0; k < 8; k++)
  glyph(`Q_YOU_${k}`, 0x40 + k, `radar: you, facing ${["N", "NE", "E", "SE", "S", "SW", "W", "NW"][k]}`, (img, ox, oy) => {
    square(img, ox, oy);
    rimmedPoly(img, ox, oy, arrow(k * 45, 1.08), WHITE);
  });
// Cells D4-DB: the same arrow with no square behind it, a transparent foreground layer for the player's own arrow
// (the map draws it in its own fixed-centre label above the terrain), facing N, NE, E, SE, S, SW, W, NW.
for (let k = 0; k < 8; k++)
  glyph(`Q_SELF_${k}`, 0xd4 + k, `radar: you (no background), facing ${["N", "NE", "E", "SE", "S", "SW", "W", "NW"][k]}`, (img, ox, oy) => {
    rimmedPoly(img, ox, oy, arrow(k * 45, 1.08), WHITE);
  });
// Row 5: inline icons for the strip's second line (no baseline, no square).
glyph("I_STAR", 0x50, "inline: the destination star", (img, ox, oy) => rimmedPoly(img, ox, oy, star(6.8), COLOR.star));
glyph("I_CHECK", 0x51, "inline: arrived", (img, ox, oy) => rimmedPoly(img, ox, oy, [[2, 8], [5, 5], [7, 8], [12, 2], [15, 5], [7, 13]], COLOR.wander));

// Rows 6-8: places on the strip (the nearest town, your bed or respawn point, the rainbow's pot of gold), the
// rainbow's edge arrows (left, right), and the same places on a radar square.
const RAINBOW = /** @type {RGBA[]} */ ([
  [235, 55, 45, 255],
  [255, 140, 30, 255],
  [255, 220, 50, 255],
  [80, 200, 80, 255],
  [70, 140, 255, 255],
  [160, 90, 240, 255],
]);
const HOUSE = [[8, 1.8], [14.2, 7.4], [12.6, 7.4], [12.6, 13.6], [3.4, 13.6], [3.4, 7.4], [1.8, 7.4]];
/** A house: the nearest town. @param {Image} img @param {number} ox @param {number} oy */
const town = (img, ox, oy) => {
  rimmedPoly(img, ox, oy, HOUSE, [235, 200, 130, 255]);
  rect(img, ox + 7, oy + 10, ox + 8, oy + 13, [110, 70, 40, 255]);
};
/** A bed seen from the side (headboard, white pillow, red blanket, wooden frame): your respawn point. @param {Image} img @param {number} ox @param {number} oy */
const bed = (img, ox, oy) => {
  const WOOD = /** @type {RGBA} */ ([150, 100, 60, 255]);
  const parts = /** @type {[number, number, number, number, RGBA][]} */ ([
    [1, 3, 2, 13, WOOD], // headboard
    [3, 6, 6, 8, WHITE], // pillow
    [3, 8, 14, 9, [215, 45, 45, 255]], // blanket
    [6, 6, 14, 7, [215, 45, 45, 255]],
    [1, 10, 14, 11, WOOD], // frame
    [13, 12, 14, 13, WOOD], // foot leg
  ]);
  for (const [x0, y0, x1, y1] of parts) rect(img, ox + x0 - 1, oy + y0 - 1, ox + x1 + 1, oy + y1 + 1, RIM);
  for (const [x0, y0, x1, y1, c] of parts) rect(img, ox + x0, oy + y0, ox + x1, oy + y1, c);
};
/** A rainbow arch, red outside to violet inside: the pot of gold. @param {Image} img @param {number} ox @param {number} oy */
const arch = (img, ox, oy) => {
  const cx = 8, cy = 13.5, outer = 7.4, band = 0.95;
  fill(img, ox, oy, ox + CELL, oy + CELL, (x, y) => {
    const d = Math.hypot(x - ox - cx, y - oy - cy);
    return y - oy <= cy && d <= outer + 1.1 && d >= outer - RAINBOW.length * band - 1.1;
  }, RIM);
  RAINBOW.forEach((c, i) =>
    fill(img, ox, oy, ox + CELL, oy + CELL, (x, y) => {
      const d = Math.hypot(x - ox - cx, y - oy - cy);
      return y - oy <= cy && d <= outer - i * band && d > outer - (i + 1) * band;
    }, c),
  );
};
/** An edge arrow striped like a rainbow. @param {Image} img @param {number} ox @param {number} oy @param {number[][]} pts */
const rainbowArrow = (img, ox, oy, pts) => {
  rimmedPoly(img, ox, oy, pts, RAINBOW[0]);
  RAINBOW.forEach((c, i) => fill(img, ox, oy, ox + CELL, oy + CELL, (x, y) => inside(pts, x - ox, y - oy) && y - oy >= 2.5 + i * (11 / 6) && y - oy < 2.5 + (i + 1) * (11 / 6), c));
};
const PLACES = /** @type {[string, string, (img: Image, ox: number, oy: number) => void][]} */ ([
  ["TOWN", "the nearest town (house)", town],
  ["HOME", "your bed or respawn point (bed)", bed],
  ["RAINBOW", "the rainbow's pot of gold (rainbow)", arch],
]);
PLACES.forEach(([name, what, draw], i) => {
  glyph(`S_${name}`, 0x60 + i, `strip: ${what}`, (img, ox, oy) => {
    baseline(img, ox, oy);
    draw(img, ox, oy);
  });
  glyph(`Q_${name}`, 0x80 + i, `radar: ${what}`, (img, ox, oy) => {
    square(img, ox, oy);
    draw(img, ox, oy);
  });
});
glyph("L_RAINBOW", 0x70, "strip edge, left: the rainbow's pot of gold", (img, ox, oy) => {
  baseline(img, ox, oy);
  rainbowArrow(img, ox, oy, LEFT);
});
glyph("R_RAINBOW", 0x71, "strip edge, right: the rainbow's pot of gold", (img, ox, oy) => {
  baseline(img, ox, oy);
  rainbowArrow(img, ox, oy, RIGHT);
});

// Rows 9-10: 8-way directional arrows on a radar square for off-map friends, party mates, and quest destinations.
const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const FRIEND_ARROW = /** @type {RGBA} */ ([110, 235, 255, 255]);
for (let k = 0; k < 8; k++) {
  glyph(`Q_FRIEND_${k}`, 0x90 + k, `radar: off-map friend arrow, facing ${DIRS[k]}`, (img, ox, oy) => {
    square(img, ox, oy);
    rimmedPoly(img, ox, oy, arrow(k * 45, 1.08), FRIEND_ARROW);
  });
  glyph(`Q_PARTY_${k}`, 0x98 + k, `radar: off-map party arrow, facing ${DIRS[k]}`, (img, ox, oy) => {
    square(img, ox, oy);
    rimmedPoly(img, ox, oy, arrow(k * 45, 1.08), COLOR.party);
  });
  glyph(`Q_STAR_${k}`, 0xa0 + k, `radar: off-map destination arrow, facing ${DIRS[k]}`, (img, ox, oy) => {
    square(img, ox, oy);
    rimmedPoly(img, ox, oy, arrow(k * 45), COLOR.star);
  });
}

// Rows 10-12: opaque, borderless terrain radar tiles and 3D topographic elevation-shaded variants.
glyph("Q_GRASS", 0xa8, "radar terrain: lush meadow green", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [56, 128, 48, 255], [72, 150, 60, 255], (x, y) => (x * 5 + y * 9) % 11 === 0),
);
glyph("Q_WATER", 0xa9, "radar terrain: ocean/river blue", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [36, 98, 185, 255], [64, 132, 218, 255], (x, y) => y % 4 === 2 && (x + (y >> 1)) % 4 < 2),
);
glyph("Q_SAND", 0xaa, "radar terrain: desert/beach gold", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [198, 174, 102, 255], [216, 192, 120, 255], (x, y) => (x * 7 + y * 3) % 13 === 0),
);
glyph("Q_SNOW", 0xab, "radar terrain: crisp snow/ice", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [210, 228, 240, 255], [235, 245, 255, 255], (x, y) => (x * 11 + y * 5) % 14 === 0),
);
glyph("Q_STONE", 0xac, "radar terrain: rocky mountain gray", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [108, 114, 122, 255], [132, 138, 146, 255], (x, y) => (x * 3 + y * 7) % 9 === 0),
);
glyph("Q_FOREST", 0xad, "radar terrain: deep canopy green", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [34, 88, 36, 255], [48, 112, 48, 255], (x, y) => (x + y) % 4 === 0 && (x * 3 + y) % 5 < 2),
);
glyph("Q_LAVA", 0xae, "radar terrain: glowing magma/nether orange-red", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [195, 68, 28, 255], [240, 120, 35, 255], (x, y) => (x * 5 + y * 3) % 8 < 2),
);
glyph("Q_CAVE", 0xaf, "radar terrain: dark underground cavern slate", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [32, 36, 46, 255], [48, 52, 66, 255], (x, y) => (x * 7 + y * 11) % 15 === 0),
);
glyph("Q_PATH", 0xb0, "radar terrain: town road/wood/cobble warm brown", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [136, 102, 68, 255], [162, 124, 86, 255], (x, y) => (x + (y >> 1) * 2) % 5 === 0 && y % 3 === 1),
);
glyph("Q_GRASS_LO", 0xb1, "radar terrain: shadowed grass slope", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [32, 78, 28, 255], [44, 96, 36, 255], (x, y) => (x * 5 + y * 9) % 11 === 0),
);
glyph("Q_GRASS_HI", 0xb2, "radar terrain: sunlit grass hill", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [96, 180, 78, 255], [116, 200, 94, 255], (x, y) => (x * 5 + y * 9) % 11 === 0),
);
glyph("Q_FOREST_LO", 0xb3, "radar terrain: shadowed forest", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [24, 66, 26, 255], [34, 84, 36, 255], (x, y) => (x + y) % 4 === 0 && (x * 3 + y) % 5 < 2),
);
glyph("Q_FOREST_HI", 0xb4, "radar terrain: sunlit forest", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [48, 114, 48, 255], [64, 136, 62, 255], (x, y) => (x + y) % 4 === 0 && (x * 3 + y) % 5 < 2),
);
glyph("Q_WATER_DEEP", 0xb5, "radar terrain: deep ocean/lake water", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [22, 64, 142, 255], [34, 84, 168, 255], (x, y) => y % 4 === 2 && (x + (y >> 1)) % 4 < 2),
);
glyph("Q_WATER_SHALLOW", 0xb6, "radar terrain: shallow coastal/river water", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [58, 138, 218, 255], [88, 168, 240, 255], (x, y) => y % 4 === 2 && (x + (y >> 1)) % 4 < 2),
);
glyph("Q_SAND_LO", 0xb7, "radar terrain: shadowed sand/dune", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [166, 144, 82, 255], [184, 160, 96, 255], (x, y) => (x * 7 + y * 3) % 13 === 0),
);
glyph("Q_SAND_HI", 0xb8, "radar terrain: sunlit sand/dune", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [224, 202, 128, 255], [240, 220, 148, 255], (x, y) => (x * 7 + y * 3) % 13 === 0),
);
glyph("Q_STONE_LO", 0xb9, "radar terrain: shadowed cliff/rock", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [62, 66, 74, 255], [78, 84, 92, 255], (x, y) => (x * 3 + y * 7) % 9 === 0),
);
glyph("Q_STONE_HI", 0xba, "radar terrain: sunlit mountain peak/rock", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [170, 176, 186, 255], [190, 196, 206, 255], (x, y) => (x * 3 + y * 7) % 9 === 0),
);
glyph("Q_SNOW_LO", 0xbb, "radar terrain: shadowed snow slope", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [174, 194, 212, 255], [192, 212, 228, 255], (x, y) => (x * 11 + y * 5) % 14 === 0),
);
glyph("Q_SNOW_HI", 0xbc, "radar terrain: sunlit snow peak", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [238, 246, 255, 255], [250, 252, 255, 255], (x, y) => (x * 11 + y * 5) % 14 === 0),
);
glyph("Q_PATH_LO", 0xbd, "radar terrain: shadowed road/roof", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [84, 58, 36, 255], [104, 76, 48, 255], (x, y) => (x + (y >> 1) * 2) % 5 === 0 && y % 3 === 1),
);
glyph("Q_PATH_HI", 0xbe, "radar terrain: sunlit road/roof", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [192, 148, 100, 255], [212, 170, 118, 255], (x, y) => (x + (y >> 1) * 2) % 5 === 0 && y % 3 === 1),
);
glyph("Q_MESA", 0xbf, "radar terrain: terracotta/badlands/brick", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [178, 92, 58, 255], [202, 112, 74, 255], (x, y) => y % 4 === 1 || (x * 5 + y * 3) % 13 === 0),
);
glyph("Q_NETHER", 0xc0, "radar terrain: crimson/netherrack", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [118, 32, 32, 255], [148, 46, 42, 255], (x, y) => (x * 5 + y * 7) % 9 === 0),
);
glyph("Q_END", 0xc1, "radar terrain: pale end stone", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [206, 210, 152, 255], [224, 228, 174, 255], (x, y) => (x * 7 + y * 5) % 11 === 0),
);
glyph("Q_ROUTE", 0xc2, "radar: gold route breadcrumb dot", (img, ox, oy) => {
  terrainSquare(img, ox, oy, [56, 128, 48, 255], [72, 150, 60, 255], (x, y) => (x * 5 + y * 9) % 11 === 0);
  rimmedDisc(img, ox, oy, 8, 8, 2.6, COLOR.star);
});
glyph("Q_CHERRY", 0xc3, "radar terrain: cherry blossom pink canopy", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [232, 132, 168, 255], [246, 156, 190, 255], (x, y) => (x + y) % 3 === 0 && (x * 3 + y * 5) % 7 < 3),
);
glyph("Q_BIRCH", 0xc4, "radar terrain: birch/olive forest", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [98, 136, 62, 255], [114, 154, 74, 255], (x, y) => (x + y) % 4 === 0 && (x * 5 + y) % 5 < 2),
);
glyph("Q_SPRUCE", 0xc5, "radar terrain: dark pine/taiga canopy", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [42, 74, 52, 255], [54, 90, 66, 255], (x, y) => (x * 3 + y * 5) % 8 < 2),
);
glyph("Q_SAVANNA", 0xc6, "radar terrain: dry savanna/hay gold-olive", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [146, 138, 66, 255], [164, 156, 78, 255], (x, y) => (x * 5 + y * 7) % 11 === 0),
);
glyph("Q_SWAMP", 0xc7, "radar terrain: dark marsh/mangrove green", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [58, 78, 44, 255], [72, 94, 56, 255], (x, y) => (x + y * 3) % 7 === 0),
);
glyph("Q_DEEPSLATE", 0xc8, "radar terrain: dark deepslate/basalt/obsidian", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [56, 58, 66, 255], [70, 72, 82, 255], (x, y) => (x * 5 + y * 3) % 9 === 0),
);
glyph("Q_BRICK", 0xc9, "radar terrain: red brick/copper/terracotta roof", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [164, 76, 56, 255], [186, 92, 68, 255], (x, y) => y % 4 === 0 || (x + (y >> 2) * 3) % 6 === 0),
);
glyph("Q_WARPED", 0xca, "radar terrain: warped nylium/stem teal", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [28, 134, 128, 255], [42, 158, 150, 255], (x, y) => (x * 3 + y * 7) % 9 < 2),
);
glyph("Q_ICE", 0xcb, "radar terrain: packed/blue glacial ice", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [132, 178, 238, 255], [158, 200, 250, 255], (x, y) => (x + y) % 6 === 0),
);
glyph("Q_CAVE_FLOOR", 0xcc, "radar terrain: walkable underground cavern floor", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [68, 72, 82, 255], [82, 86, 98, 255], (x, y) => (x * 5 + y * 9) % 12 === 0),
);
glyph("Q_CAVE_WALL", 0xcd, "radar terrain: solid underground rock wall", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [24, 26, 34, 255], [32, 36, 46, 255], (x, y) => (x * 7 + y * 11) % 15 === 0),
);
glyph("Q_MESA_LO", 0xce, "radar terrain: shadowed mesa canyon", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [144, 72, 44, 255], [160, 82, 52, 255], (x, y) => y % 4 === 1 || (x * 5 + y * 3) % 13 === 0),
);
glyph("Q_MESA_HI", 0xcf, "radar terrain: sunlit mesa plateau", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [208, 114, 74, 255], [226, 130, 88, 255], (x, y) => y % 4 === 1 || (x * 5 + y * 3) % 13 === 0),
);
glyph("Q_SANDSTONE", 0xd0, "radar terrain: pale sandstone masonry, not beach sand", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [202, 190, 150, 255], [228, 216, 176, 255], (x, y) => y % 5 === 0 || (x + (y >> 2) * 3) % 8 === 0),
);
glyph("Q_SANDSTONE_LO", 0xd1, "radar terrain: shadowed sandstone wall", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [146, 136, 104, 255], [172, 162, 126, 255], (x, y) => y % 5 === 0 || (x + (y >> 2) * 3) % 8 === 0),
);
glyph("Q_SANDSTONE_HI", 0xd2, "radar terrain: sunlit sandstone roof", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [236, 226, 190, 255], [250, 242, 210, 255], (x, y) => y % 5 === 0 || (x + (y >> 2) * 3) % 8 === 0),
);
glyph("Q_CROP", 0xd3, "radar terrain: planted green and gold crop rows", (img, ox, oy) =>
  terrainSquare(img, ox, oy, [100, 132, 44, 255], [174, 164, 74, 255], (x, y) => x % 6 < 2),
);

// Background-matched radar markers. The legacy Q markers sit on an opaque grass tile, which shows as a green patch on
// native water, snow or stone. These variants are the same artwork (the same draw functions) on one of 16 tiles, pages
// F6-F8 (768 cells = 16 backgrounds x 48 markers). The 16 colors are our own small palette; each of the 512 native
// colors maps to the nearest one (squared RGB distance, lowest index on a tie), so the match is approximate, not exact.
/** Snaps a channel to the 3-bit cube the native palette uses (the same 8 levels as pages F4/F5). @param {number} v */
const cube = (v) => Math.round((Math.round((v * 7) / 255) * 255) / 7);
// The first five are the native colors seen in probes (grass, forest, water, shallow water, deep water), so they snap
// exactly; every center is in the 512-color cube, so a fallback material also lands on its own background.
const BG16 = /** @type {[string, number, number, number][]} */ (/** @type {[string, number, number, number][]} */ ([
  ["grass", 146, 182, 73], ["forest", 73, 109, 36], ["water", 36, 73, 255], ["shallow water", 73, 109, 255],
  ["deep water", 0, 36, 219], ["sand", 208, 186, 128], ["snow", 232, 238, 244], ["stone", 116, 120, 126],
  ["deepslate", 64, 68, 76], ["path", 148, 114, 80], ["lava", 224, 88, 24], ["mesa", 178, 102, 66],
  ["nether", 122, 42, 40], ["end/sandstone", 216, 218, 164], ["ice", 148, 194, 238], ["swamp", 104, 120, 56],
]).map(([n, r, g, b]) => [n, cube(r), cube(g), cube(b)]));const OVERLAY_NAMES = /** @type {string[]} */ ([
  ...Array.from({ length: 8 }, (_, k) => `Q_YOU_${k}`),
  ...Array.from({ length: 8 }, (_, k) => `Q_FRIEND_${k}`),
  ...Array.from({ length: 8 }, (_, k) => `Q_PARTY_${k}`),
  ...Array.from({ length: 8 }, (_, k) => `Q_STAR_${k}`),
  "Q_MOB", "Q_FOLK", "Q_WANDER", "Q_PARTY", "Q_STAR", "Q_CAMP", "Q_SITE", "Q_OTHER",
  "Q_TOWN", "Q_HOME", "Q_RAINBOW", "Q_ROUTE", "Q_NORTH", "Q_EAST", "Q_SOUTH", "Q_WEST",
]);
const OVERLAY_PAGE = 0xf6, OVERLAY_COUNT = OVERLAY_NAMES.length;
if (OVERLAY_COUNT > 48 || BG16.length * OVERLAY_COUNT > 768) throw new Error("background variants overflow pages F6-F8");
/** Nearest of the 16 backgrounds to each of the 512 native colors (index = r << 6 | g << 3 | b, each 0-7). */
const NEAREST_BG = Array.from({ length: 512 }, (_, i) => {
  const rgb = [(i >> 6) & 7, (i >> 3) & 7, i & 7].map((v) => Math.round((v * 255) / 7));
  let best = 0, bestD = Infinity;
  BG16.forEach((c, k) => {
    const d = (c[1] - rgb[0]) ** 2 + (c[2] - rgb[1]) ** 2 + (c[3] - rgb[2]) ** 2;
    if (d < bestD) { bestD = d; best = k; }
  });
  return best;
});
function overlayPages() {
  const pages = [0, 1, 2].map(() => blank(16 * CELL, 16 * CELL));
  const byName = new Map(GLYPHS.map((g) => [g.name, g]));
  BG16.forEach(([, r, g, b], v) => {
    /** @type {RGBA} */
    const base = [r, g, b, 255];
    /** @type {RGBA} */
    const accent = base; // a flat tile: native terrain has no grass checker
    OVERLAY_NAMES.forEach((name, j) => {
      const cell = v * OVERLAY_COUNT + j;
      const page = cell >> 8, c = cell & 255;
      bgOverride = { base, accent };
      try {
        /** @type {{ draw: (img: Image, ox: number, oy: number) => void }} */ (byName.get(name)).draw(pages[page], (c % 16) * CELL, Math.floor(c / 16) * CELL);
      } finally {
        bgOverride = null;
      }
    });
  });
  return pages;
}

// ---------------------------------------------------------------------------
// The outputs
// ---------------------------------------------------------------------------

function page() {
  const img = blank(16 * CELL, 16 * CELL);
  for (const g of GLYPHS) g.draw(img, (g.cell % 16) * CELL, Math.floor(g.cell / 16) * CELL);
  return img;
}

// Original solid RGB glyphs for the hybrid cartographic prototype: 3 bits per channel, not reference-addon art.
function colorPage(pageIndex) {
  const img = blank(16 * CELL, 16 * CELL);
  for (let cell = 0; cell < 256; cell++) {
    const index = pageIndex * 256 + cell;
    const r = Math.round(((index >> 6) & 7) * 255 / 7);
    const g = Math.round(((index >> 3) & 7) * 255 / 7);
    const b = Math.round((index & 7) * 255 / 7);
    const x = (cell % 16) * CELL, y = Math.floor(cell / 16) * CELL;
    rect(img, x, y, x + CELL - 1, y + CELL - 1, [r, g, b, 255]);
  }
  return img;
}

/** The same palette and opaque extent as F4/F5, with an uncertainty cue confined to the final 4x4 pixels.
 * Only eight pixels change: two diagonal 2x2 blocks, never invented material or sampled terrain detail.
 * @param {number} pageIndex */
function estimatedColorPage(pageIndex) {
  const img = colorPage(pageIndex);
  const darkInk = /** @type {RGBA} */ ([20, 20, 20, 255]);
  for (let cell = 0; cell < 256; cell++) {
    const x0 = (cell % 16) * CELL, y0 = Math.floor(cell / 16) * CELL;
    const offset = (y0 * img.width + x0) * 4;
    // Choose light ink for very dark colors, including black, instead of an invisible dark-on-dark mark.
    const linear = [0, 1, 2].map((k) => {
      const channel = img.data[offset + k] / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    });
    const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
    const ink = luminance < .18 ? COMPASS_WHITE : darkInk;
    for (let y = 12; y < CELL; y++) for (let x = 12; x < CELL; x++)
      if ((x >> 1 & 1) === (y >> 1 & 1)) put(img, x0 + x, y0 + y, ink);
  }
  return img;
}

const char = (/** @type {number} */ cell) => String.fromCodePoint((PAGE << 8) + cell);

function glyphsJs() {
  const lines = [
    "// Generated by tools/gen-glyphs/gen.mjs (npm run gen:glyphs): edit the generator, not this file.",
    "// The minimap's icons: Private Use Area characters drawn by the glyph page in Side HUD (hud_rp/font/glyph_F3.png,",
    "// U+F300-U+F3FF). This is the only pack file allowed characters outside ASCII (tools/check-ascii.mjs), and they go",
    "// only into the map's HUD strings (the compass strip and the radar), never chat, forms or story text: players",
    "// without Realm Resources see a box for each one.",
    "",
    "export const G = {",
  ];
  for (const g of [...GLYPHS].sort((a, b) => a.cell - b.cell)) lines.push(`  /** U+${((PAGE << 8) + g.cell).toString(16).toUpperCase()} ${g.what} */`, `  ${g.name}: "${char(g.cell)}",`);
  lines.push("};", "", "/** The player's own arrow with no background, facing N, NE, E, SE, S, SW, W, NW (cells D4-DB): drawn over the terrain. */", `export const SELF_ARROWS = [${Array.from({ length: 8 }, (_, k) => `G.Q_SELF_${k}`).join(", ")}];`, "", "/** Original 512-color glyph atlas on pages F4/F5; used only in map HUD text. @param {number} index */", "export function paletteGlyph(index) {", "  return Number.isInteger(index) && index >= 0 && index < 512 ? String.fromCharCode(0xf400 + index) : G.Q_EMPTY;", "}", "");
  const slots = Array.from({ length: 256 }, () => -1);
  OVERLAY_NAMES.forEach((name, j) => { slots[/** @type {{ cell: number }} */ (GLYPHS.find((g) => g.name === name)).cell] = j; });
  lines.push(
    "/** Slot (0-47) of each legacy F3 radar marker that has background-matched variants, by cell; -1 for every other glyph. */",
    "const OVERLAY_SLOT = [",
  );
  for (let i = 0; i < 256; i += 32) lines.push(`  ${slots.slice(i, i + 32).join(", ")},`);
  lines.push(
    "];",
    "/** Nearest of the 16 backgrounds for each of the 512 native colors: letter a-p, from our own small palette (an approximation). */",
    `const NEAREST_BG = ${JSON.stringify(NEAREST_BG.map((k) => String.fromCharCode(97 + k)).join(""))};`,
    `const OVERLAY_GLYPHS = Array.from({ length: ${BG16.length * OVERLAY_COUNT} }, (_, i) => String.fromCharCode(0x${(OVERLAY_PAGE << 8).toString(16)} + i));`,
    "",
    "/**",
    ` * A radar marker drawn on a background that approximates the terrain under it (pages F6-F8: ${BG16.length} backgrounds x ${OVERLAY_COUNT} markers).`,
    " * A known F3 marker over actual F4/F5 or estimated F1/F2 terrain uses the same background; other inputs stay legacy.",
    " * @param {string} legacyGlyph @param {string} backgroundGlyph",
    " */",
    "export function overlayGlyph(legacyGlyph, backgroundGlyph) {",
    '  if (typeof legacyGlyph !== "string" || typeof backgroundGlyph !== "string" || legacyGlyph.length !== 1 || backgroundGlyph.length !== 1) return legacyGlyph;',
    "  const code = backgroundGlyph.charCodeAt(0);",
    "  const bg = code >= 0xf100 && code < 0xf300 ? code - 0xf100 : code - 0xf400;",
    "  const slot = OVERLAY_SLOT[legacyGlyph.charCodeAt(0) - 0xf300];",
    "  if (!(bg >= 0 && bg < 512) || !(slot >= 0)) return legacyGlyph;",
    `  return OVERLAY_GLYPHS[(NEAREST_BG.charCodeAt(bg) - 97) * ${OVERLAY_COUNT} + slot];`,
    "}",
    "",
    "/** Visually marked estimated color, never proof of a genuine sample; same 512-color index as paletteGlyph. @param {number} index */",
    "export function estimatedPaletteGlyph(index) {",
    "  return Number.isInteger(index) && index >= 0 && index < 512 ? String.fromCharCode(0xf100 + index) : G.Q_EMPTY;",
    "}",
    "",
  );
  return lines.join("\n");
}

/** Nearest-neighbor art compositing, without changing the source palette or pixel edges.
 * @param {Image} target @param {Image} source @param {number} x @param {number} y @param {number} width @param {number} height */
function stamp(target, source, x, y, width, height) {
  for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) {
    const sx = Math.min(source.width - 1, Math.floor(dx * source.width / width));
    const sy = Math.min(source.height - 1, Math.floor(dy * source.height / height));
    const i = (sy * source.width + sx) * 4;
    put(target, Math.round(x) + dx, Math.round(y) + dy, [source.data[i], source.data[i + 1], source.data[i + 2], source.data[i + 3]]);
  }
}

/** A render of the HUD (not a screenshot): the unchanged compass strip and the circular 33x33 radar.
 * Badge, bezel and shade ink comes from the generated UI textures, not a separate illustration.
 * @param {Image} sheet */
function render(sheet) {
  if (THEME.oakFrame) return renderOak(sheet);
  const MINI = 6;
  const W = 25 * CELL + 24, H = 33 * MINI + 2 * CELL + 48;
  const img = blank(W, H);
  // Sky over grass, roughly what's behind the HUD.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = y / (H - 1);
      const c = t < 0.55 ? [Math.round(120 + 60 * t), Math.round(165 + 40 * t), 235, 255] : [Math.round(70 - 20 * t), Math.round(140 - 30 * t), Math.round(50 - 10 * t), 255];
      put(img, x, y, /** @type {RGBA} */ (c));
    }
  const byName = new Map(GLYPHS.map((g) => [g.name, g.cell]));
  /** @param {string} name @param {number} x @param {number} y */
  const blit = (name, x, y) => {
    const cell = /** @type {number} */ (byName.get(name));
    const sx = (cell % 16) * CELL, sy = Math.floor(cell / 16) * CELL;
    for (let j = 0; j < CELL; j++)
      for (let i = 0; i < CELL; i++) {
        const k = ((sy + j) * sheet.width + sx + i) * 4;
        put(img, x + i, y + j, [sheet.data[k], sheet.data[k + 1], sheet.data[k + 2], sheet.data[k + 3]]);
      }
  };
  /** @param {string} name @param {number} x @param {number} y */
  const blitMini = (name, x, y) => {
    const cell = /** @type {number} */ (byName.get(name));
    const sx = (cell % 16) * CELL, sy = Math.floor(cell / 16) * CELL;
    for (let j = 0; j < MINI; j++)
      for (let i = 0; i < MINI; i++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let dy = 0; dy < 3; dy++)
          for (let dx = 0; dx < 3; dx++) {
            const px = Math.min(CELL - 1, Math.floor(((i * 3 + dx + 0.5) * CELL) / (MINI * 3)));
            const py = Math.min(CELL - 1, Math.floor(((j * 3 + dy + 0.5) * CELL) / (MINI * 3)));
            const k = ((sy + py) * sheet.width + sx + px) * 4;
            const pa = sheet.data[k + 3];
            r += sheet.data[k] * pa;
            g += sheet.data[k + 1] * pa;
            b += sheet.data[k + 2] * pa;
            a += pa;
          }
        if (a > 0) put(img, x + i, y + j, [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a / 9)]);
      }
  };
  // Facing 70 degrees: 5 degrees a cell, so N sits 14 cells left of the middle (off the strip) and E 4 cells right.
  const strip = Array(25).fill("S_BLANK");
  for (let i = 0; i < 25; i++) if ((70 + (i - 12) * 5) % 15 === 0) strip[i] = "S_TICK";
  strip[12] = "S_CENTER";
  strip[3] = "S_NE";
  strip[16] = "S_E";
  Object.assign(strip, { 0: "L_MOB", 2: "S_CHAMP", 5: "S_TOWN", 7: "S_PARTY", 10: "S_STAR", 14: "S_MOB", 19: "S_OTHER", 21: "S_SITE", 22: "S_HOME", 24: "R_RAINBOW" });
  const dim = /** @type {RGBA} */ ([0, 0, 0, 120]);
  rect(img, 9, 3, 9 + 25 * CELL + 5, 3 + CELL + 3, dim);
  strip.forEach((g, i) => blit(g, 12 + i * CELL, 5));
  // GENERATED33-circle visual preview, not a client screenshot or a sampled world.
  const N=33,rx0=W-12-N*MINI,ry0=CELL+24,cx=rx0+N*MINI/2,cy=ry0+N*MINI/2;
  const drawSize=N*MINI+8,bx=cx-drawSize/2,by=cy-drawSize/2;
  stamp(img,radarShade(),bx,by,drawSize,drawSize);
  for(let row=0;row<N;row++)for(let col=0;col<N;col++){
    const x=col-16,z=row-16;if(x*x+z*z>256)continue;
    const river=3+Math.round(Math.sin(z/5)*2);let g="Q_GRASS";
    if(x>river+3)g="Q_WATER_DEEP";else if(x>river+1)g="Q_WATER";else if(x>=river)g="Q_WATER_SHALLOW";else if(x>=river-2)g="Q_SAND";
    else if(x<-7&&z<-2)g=(x+z)%3?"Q_FOREST":"Q_FOREST_HI";
    else if(z>8&&x<-3)g=(x-z)%3?"Q_STONE":"Q_STONE_HI";
    if(Math.abs(z+1)<=1&&x<river-2)g="Q_PATH";
    if(x>=-7&&x<=-4&&z>=-5&&z<=-3)g="Q_BRICK";
    if(x>=-2&&x<=0&&z>=3&&z<=5)g="Q_SANDSTONE_HI";
    blitMini(g,rx0+col*MINI,ry0+row*MINI);
  }
  stamp(img,radarFrame(),bx,by,drawSize,drawSize);
  for(const[g,x,z]of[["Q_STAR",-4,-7],["Q_PARTY",7,6],["Q_CAMP",-9,3],["Q_CHAMP",-7,9]])blitMini(String(g),rx0+(Number(x)+16)*MINI,ry0+(Number(z)+16)*MINI);
  blit("Q_SELF_2",cx-8,cy-8);
  for(const[l,x,y]of[["N",cx,ry0],["E",rx0+N*MINI,cy],["S",cx,ry0+N*MINI],["W",rx0,cy]])
    stamp(img,cardinalBadge(String(l)),Number(x)-8,Number(y)-8,16,16);
  return img;
}

// ---------------------------------------------------------------------------
// Side HUD's pack_icon.png (128 x 128): a game view with the HUD over it, the compass strip across the top, dark
// side boxes left and right, the crosshair with its box below, and the hotbar. Drawn big enough to read at 64 px.
// ---------------------------------------------------------------------------

/** Fills where inside(x, y) holds in the box [x0, x1) x [y0, y1), 4 x 4 samples a pixel. @param {Image} img @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {(x: number, y: number) => boolean} test @param {RGBA} c */
function fill(img, x0, y0, x1, y1, test, c) {
  for (let y = Math.floor(y0); y < Math.ceil(y1); y++)
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      let n = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (test(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) n++;
      if (n) put(img, x, y, [c[0], c[1], c[2], Math.round((c[3] * n) / 16)]);
    }
}
/** A rounded rectangle covering [x0, x1) x [y0, y1). @param {Image} img @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {number} r @param {RGBA} c */
function roundRect(img, x0, y0, x1, y1, r, c) {
  fill(img, x0, y0, x1, y1, (x, y) => Math.hypot(Math.max(0, Math.abs(x - (x0 + x1) / 2) - ((x1 - x0) / 2 - r)), Math.max(0, Math.abs(y - (y0 + y1) / 2) - ((y1 - y0) / 2 - r))) <= r, c);
}

function packIcon() {
  const N = 128;
  const img = blank(N, N);
  // Sky over blocky hills and grass.
  const hill = (/** @type {number} */ x) => 78 - 8 * Math.floor(Math.max(0, 3 - Math.abs(x - 34) / 9)) - 6 * Math.floor(Math.max(0, 2 - Math.abs(x - 100) / 10));
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const t = y / (N - 1);
      /** @type {RGBA} */
      const sky = [Math.round(100 + 70 * t), Math.round(150 + 50 * t), 235, 255];
      /** @type {RGBA} */
      const grass = y < hill(x) + 4 ? [96, 168, 64, 255] : [Math.round(78 - 24 * t), Math.round(140 - 36 * t), Math.round(54 - 12 * t), 255];
      put(img, x, y, y < hill(x) ? sky : grass);
    }
  const panel = /** @type {RGBA} */ ([10, 14, 18, 175]);
  const text = /** @type {RGBA} */ ([235, 235, 235, 255]);
  const dimText = /** @type {RGBA} */ ([170, 176, 184, 255]);

  // The compass strip: ticks, N in red, E, a star marker and the white pointer where you face.
  roundRect(img, 8, 6, 120, 34, 5, panel);
  rect(img, 13, 29, 114, 30, LINE);
  for (const x of [22, 46, 82, 106]) rect(img, x - 1, 24, x, 28, TICK);
  letter(img, 0, 0, BIG.N, 29, 11, 2, NORTH);
  letter(img, 0, 0, BIG.E, 89, 11, 2, WHITE);
  rect(img, 63, 15, 64, 28, WHITE);
  fill(img, 56, 8, 72, 16, (x, y) => inside([[57, 8.5], [71, 8.5], [64, 15]], x, y), WHITE);
  fill(img, 70, 10, 86, 26, (x, y) => inside(star(6.5).map(([px, py]) => [px + 70, py + 9]), x, y), COLOR.star);

  // Side boxes: two on each side, each with a line of text and a bar or a second line.
  /** @param {number} x0 @param {number} y0 @param {RGBA} accent @param {number} fillTo how much of the bar is full (0-1), or -1 for a second line of text */
  const box = (x0, y0, accent, fillTo) => {
    roundRect(img, x0, y0, x0 + 40, y0 + 22, 4, panel);
    rect(img, x0 + 5, y0 + 5, x0 + 9, y0 + 9, accent);
    rect(img, x0 + 12, y0 + 6, x0 + 34, y0 + 8, text);
    if (fillTo < 0) rect(img, x0 + 5, y0 + 13, x0 + 27, y0 + 15, dimText);
    else {
      rect(img, x0 + 5, y0 + 13, x0 + 34, y0 + 16, [40, 44, 50, 255]);
      rect(img, x0 + 5, y0 + 13, x0 + 5 + Math.round(29 * fillTo), y0 + 16, accent);
    }
  };
  box(4, 42, COLOR.mob, 0.7);
  box(4, 68, COLOR.folk, -1);
  box(84, 42, COLOR.party, -1);
  box(84, 68, COLOR.wander, 0.45);

  // The crosshair, and the box under it.
  rect(img, 63, 49, 64, 61, WHITE);
  rect(img, 58, 54, 69, 55, WHITE);
  roundRect(img, 48, 68, 80, 82, 4, panel);
  rect(img, 53, 73, 75, 76, text);

  // The hotbar.
  rect(img, 18, 103, 109, 117, [20, 20, 20, 200]);
  for (let i = 0; i < 9; i++) rect(img, 20 + i * 10, 105, 27 + i * 10, 115, [120, 120, 120, 150]);
  for (const [x0, x1, y0, y1] of [[18, 29, 102, 103], [18, 29, 117, 118], [18, 19, 102, 118], [28, 29, 102, 118]]) rect(img, x0, y0, x1, y1, WHITE);
  return img;
}

/** Any-size absolute disc for generated UI art, unlike the16px glyph-cell disc. @param {Image} img @param {number} cx @param {number} cy @param {number} r @param {RGBA} color */
function disk(img,cx,cy,r,color){fill(img,cx-r,cy-r,cx+r,cy+r,(x,y)=>Math.hypot(x-cx,y-cy)<=r,color);}
const RADAR_W=128,RADAR_H=128;
/** Two-source-pixel steps, with no filtered edge colors or partially covered texels.
 * @param {number} x @param {number} y @param {number} [cx] @param {number} [cy] */
function steppedRadius(x, y, cx = 64, cy = 64) {
  return Math.hypot(Math.floor(x / 2) * 2 + 1 - cx, Math.floor(y / 2) * 2 + 1 - cy);
}
/** Original map-paper bezel; its transparent center never paints over terrain or markers. */
function paperFrame() {
  const img = blank(RADAR_W, RADAR_H);
  const paper = /** @type {RGBA} */ ([221, 194, 138, 255]);
  for (let y = 0; y < RADAR_H; y++) for (let x = 0; x < RADAR_W; x++) {
    const r = steppedRadius(x, y);
    if (r > 63.5 || r <= 58.5) continue;
    let c = THEME.rim;
    if (r <= 62 && r > 59.5) c = paper;
    // A restrained upper-left paper bevel, never a noisy checker or simulated terrain detail.
    if (r <= 62 && r > 61) c = x + y < 128 ? THEME.accent : THEME.inner;
    put(img, x, y, c);
  }
  // Four square registration nicks, aligned with the circular frame rather than the terrain grid.
  for (const [x, y, w, h] of [[63, 4, 2, 3], [121, 63, 3, 2], [63, 121, 2, 3], [4, 63, 3, 2]])
    rect(img, x, y, x + w - 1, y + h - 1, THEME.rim);
  return img;
}
// Exact approved Astra oak pixel geometry, selectively ported from oak-art.mjs.
// Keep the source dimensions, integer wood grain, recessed letters, and palette byte-for-byte reproducible.
const OAK = /** @type {Record<string, RGBA>} */ ({
  edge: [58, 38, 23, 255], dark: [91, 60, 32, 255], seam: [113, 78, 41, 255],
  oak: [165, 124, 65, 255], grain: [151, 109, 55, 255], light: [190, 148, 83, 255],
  shine: [216, 177, 106, 255], cream: [255, 239, 191, 255],
});
const OAK_FONT = /** @type {Record<string, string[]>} */ ({
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  S: ["11111", "10000", "10000", "11111", "00001", "00001", "11111"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
});
/** @param {number} x @param {number} y */
const oakNoise = (x, y) => (Math.imul(x + 521, 374761393) ^ Math.imul(y + 197, 668265263)) >>> 0;
/** @param {number} x @param {number} y */
function wood(x, y) {
  const row = Math.floor(y / 8), joint = ((x + (row % 2) * 13) % 27 + 27) % 27;
  if (y % 8 === 0 || joint === 0) return OAK.seam;
  if (y % 8 === 1) return OAK.light;
  const n = oakNoise(Math.floor(x / 5), y);
  return n % 7 === 0 ? OAK.grain : n % 13 === 0 ? OAK.light : OAK.oak;
}
/** @param {number} x @param {number} y @param {number} rx @param {number} ry */
const insideOak = (x, y, rx, ry) => ((Math.floor(x / 2) * 2 + 1 - 119) / rx) ** 2 + ((Math.floor(y / 2) * 2 + 1 - 124) / ry) ** 2 <= 1;
function oakFrame() {
  const img = blank(238, 248);
  for (let y = 0; y < 248; y++) for (let x = 0; x < 238; x++) {
    if (!insideOak(x, y, 118, 123) || insideOak(x, y, 99, 105)) continue;
    let c = wood(Math.floor(x / 2), Math.floor(y / 2));
    if (!insideOak(x, y, 116, 121)) c = OAK.edge;
    else if (!insideOak(x, y, 113, 118)) c = y < 124 ? OAK.shine : OAK.dark;
    else if (insideOak(x, y, 102, 108)) c = y < 124 ? OAK.dark : OAK.light;
    put(img, x, y, c);
  }
  return img;
}
/** Width/height rectangle used by the original oak artwork, unlike the inclusive glyph helper.
 * @param {Image} img @param {number} x @param {number} y @param {number} width @param {number} height @param {RGBA} color */
const oakRect = (img, x, y, width, height, color) => rect(img, x, y, x + width - 1, y + height - 1, color);
/** @param {string} l */
function oakBadge(l) {
  const img = blank(24, 24);
  oakRect(img, 2, 0, 20, 24, OAK.edge);
  oakRect(img, 0, 2, 24, 20, OAK.edge);
  for (let y = 2; y < 22; y++) for (let x = 2; x < 22; x++) put(img, x, y, wood(x, y));
  oakRect(img, 2, 2, 20, 2, OAK.shine);
  oakRect(img, 2, 20, 20, 2, OAK.dark);
  const color = l === "N" ? /** @type {RGBA} */ ([255, 211, 177, 255]) : OAK.cream;
  oakRect(img, 6, 4, 12, 16, l === "N" ? [111, 48, 30, 255] : OAK.dark);
  letter(img, 0, 0, OAK_FONT[l], 7, 5, 2, color);
  return img;
}
function oakShade() {
  const img = blank(238, 248);
  for (let y = 0; y < 248; y++) for (let x = 0; x < 238; x++)
    if (insideOak(x, y, 116, 121)) put(img, x, y, [66, 45, 26, 255]);
  return img;
}
/** Exact oak-art.mjs illustrative scene, assembled from our unchanged glyph pages; not a screenshot.
 * @param {Image} sheet */
function renderOak(sheet) {
  const sheets = new Map([[0xf3, sheet], [0xf4, colorPage(0)], [0xf5, colorPage(1)]]);
  overlayPages().forEach((img, i) => sheets.set(0xf6 + i, img));
  const named = new Map(GLYPHS.map((g) => [g.name, (PAGE << 8) + g.cell]));
  /** @param {Image} dst @param {number} code @param {number} dx @param {number} dy @param {number} width @param {number} height */
  const tile = (dst, code, dx, dy, width, height) => {
    const source = /** @type {Image} */ (sheets.get(code >> 8));
    const x0 = (code & 15) * CELL, y0 = ((code >> 4) & 15) * CELL;
    const cell = blank(CELL, CELL);
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
      const i = ((y + y0) * source.width + x + x0) * 4;
      put(cell, x, y, [source.data[i], source.data[i + 1], source.data[i + 2], source.data[i + 3]]);
    }
    stamp(dst, cell, dx, dy, width, height);
  };
  /** @param {string} name @param {number} palette */
  const overlayCode = (name, palette) => (OVERLAY_PAGE << 8) + NEAREST_BG[palette] * OVERLAY_COUNT + OVERLAY_NAMES.indexOf(name);
  const preview = blank(476, 496);
  stamp(preview, oakShade(), 0, 0, 476, 496);
  for (let r = -16; r <= 16; r++) for (let c = -16; c <= 16; c++) {
    if (c * c + r * r > 256) continue;
    const river = 4 * Math.sin(r / 5) + 3;
    let palette = (((3 << 3) | 5) << 3) | 2;
    if (Math.abs(c - river) < 2.3) palette = (((1 << 3) | 3) << 3) | 6;
    else if (Math.abs(c - river) < 3.3) palette = (((6 << 3) | 5) << 3) | 3;
    else if ((c + 8) ** 2 + (r + 6) ** 2 < 52) palette = (((2 << 3) | 4) << 3) | 1;
    else if (c > 7 && r < -3) palette = (((4 << 3) | 4) << 3) | 4;
    else if (oakNoise(c, r) % 11 < 3) palette = (((3 << 3) | 4) << 3) | 2;
    if (Math.abs(r - 5) < 1 && c < -2) palette = (((6 << 3) | 4) << 3) | 2;
    let code = 0xf400 + palette;
    if (c === -7 && r === -7) code = overlayCode("Q_STAR", palette);
    if (c === 9 && r === 5) code = overlayCode("Q_PARTY", palette);
    if (c === -5 && r === 9) code = overlayCode("Q_MOB", palette);
    tile(preview, code, Math.round(40 + (c + 16) * 12), Math.round(40 + (r + 16) * 12.6), 12, 13);
  }
  stamp(preview, oakFrame(), 0, 0, 476, 496);
  for (const [l, x, y] of [["N", 218, 8], ["E", 428, 228], ["S", 218, 448], ["W", 8, 228]])
    stamp(preview, oakBadge(String(l)), Number(x), Number(y), 40, 40);
  tile(preview, /** @type {number} */ (named.get("Q_SELF_0")), 226, 236, 24, 24);
  return preview;
}

/** Original circular bezels; old themes remain available for rollback. */
function radarFrame() {
  if (THEME.oakFrame) return oakFrame();
  if (THEME.pixelFrame) return paperFrame();
  const img = blank(RADAR_W, RADAR_H), cx = RADAR_W / 2, cy = RADAR_H / 2;
  fill(img, 0, 0, RADAR_W, RADAR_H, (x, y) => Math.hypot(x - cx, y - cy) <= 63.7 && Math.hypot(x - cx, y - cy) >= 59.8, THEME.rim);
  fill(img, 0, 0, RADAR_W, RADAR_H, (x, y) => Math.hypot(x - cx, y - cy) <= 62.8 && Math.hypot(x - cx, y - cy) >= 61.7, THEME.inner);
  fill(img, 0, 0, RADAR_W, RADAR_H, (x, y) => Math.hypot(x - cx, y - cy) <= 60.7 && Math.hypot(x - cx, y - cy) >= 60.1, THEME.accent);
  for (let i = 0; i < THEME.ticks; i++) {
    const angle = i * Math.PI * 2 / THEME.ticks;
    for (let r = 57.5; r < 60; r += .4) disk(img, cx + Math.sin(angle) * r, cy - Math.cos(angle) * r, .45, THEME.accent);
  }
  return img;
}
/** A transparent-corner disc, not a square panel behind transparent text. */
function radarShade() {
  if (THEME.oakFrame) return oakShade();
  const img = blank(RADAR_W, RADAR_H);
  if (THEME.pixelFrame) {
    for (let y = 0; y < RADAR_H; y++) for (let x = 0; x < RADAR_W; x++)
      if (steppedRadius(x, y) <= 62.2) put(img, x, y, THEME.background);
  } else fill(img, 0, 0, RADAR_W, RADAR_H, (x, y) => Math.hypot(x - 64, y - 64) <= 62.2, THEME.background);
  return img;
}
// UI-only microletters, distinct from the published seven-row compass/font glyphs above.
// Five by five at 4x source resolution keeps all five columns legible in the unchanged 8x8 UI tabs.
const CARDINAL_PIXEL = /** @type {Record<string, string[]>} */ ({
  N: ["10001", "11001", "10101", "10011", "10001"],
  E: ["11111", "10000", "11110", "10000", "11111"],
  S: ["01111", "10000", "01110", "00001", "11110"],
  W: ["10001", "10001", "10101", "11011", "10001"],
});
/** Original chiseled cardinal tabs: high-contrast ink on paper, north in muted brick red.
 * @param {string} l */
function cardinalBadge(l) {
  if (THEME.oakFrame) return oakBadge(l);
  const img = blank(32, 32);
  if (THEME.pixelFrame) {
    const paper = /** @type {RGBA} */ ([221, 194, 138, 255]);
    for (let y = 1; y < 31; y++) for (let x = 1; x < 31; x++) {
      const edge = Math.min(x, y, 31 - x, 31 - y);
      if (x + y < 8 || x + y > 54 || x - y > 23 || y - x > 23) continue;
      let c = THEME.rim;
      if (edge >= 2 && x + y >= 10 && x + y <= 52 && Math.abs(x - y) <= 21)
        c = x + y < 31 && edge <= 3 ? THEME.accent : paper;
      put(img, x, y, c);
    }
    letter(img, 0, 0, CARDINAL_PIXEL[l], 6, 6, 4, l === "N" ? THEME.north : THEME.letter);
  } else {
    fill(img, 0, 0, 32, 32, (x, y) => Math.hypot(x - 16, y - 16) <= 15.8, THEME.inner);
    fill(img, 0, 0, 32, 32, (x, y) => Math.hypot(x - 16, y - 16) <= 14.5, THEME.background);
    letter(img, 0, 0, BIG[l], 8, 5, 3, l === "N" ? THEME.north : THEME.letter);
  }
  return img;
}
// The tile is visually transparent (two alpha1 extent anchors, not a visible baseline).
// Completely empty glyphs can collapse native advance; actual client extent remains a visual gate.
if(GLYPHS.some(g=>g.cell===0xff))throw new Error("Outside-mask glyph slot collision");
glyph("Q_OUTSIDE",0xff,"radar: policy-excluded transparent tile, full encoded extent",(img,ox,oy)=>{put(img,ox,oy,[0,0,0,1]);put(img,ox+15,oy+15,[0,0,0,1]);});

const sheet = page();
/** @type {Map<string, Image | string>} */
const outputs = new Map();
outputs.set("packs/hud_rp/font/glyph_F1.png", estimatedColorPage(0));
outputs.set("packs/hud_rp/font/glyph_F2.png", estimatedColorPage(1));
outputs.set("packs/hud_rp/font/glyph_F3.png", sheet);
outputs.set("packs/hud_rp/font/glyph_F4.png", colorPage(0));
outputs.set("packs/hud_rp/font/glyph_F5.png", colorPage(1));
overlayPages().forEach((img, i) => outputs.set(`packs/hud_rp/font/glyph_F${6 + i}.png`, img));
outputs.set("packs/hud_rp/textures/ui/radar_frame.png", radarFrame());
outputs.set("packs/hud_rp/textures/ui/radar_shade.png", radarShade());
for (const l of ["N", "E", "S", "W"]) outputs.set(`packs/hud_rp/textures/ui/map_cardinal_${l.toLowerCase()}.png`, cardinalBadge(l));
outputs.set("packs/hud_rp/pack_icon.png", packIcon());
outputs.set("packs/map_bp/scripts/glyphs.js", glyphsJs());
outputs.set("docs/media/map/map-hud.png", render(sheet));

if (selectedOutputs.length) {
  for (const rel of selectedOutputs) if (!outputs.has(rel)) throw new Error(`unknown glyph output: ${rel}`);
  for (const rel of outputs.keys()) if (!selectedOutputs.includes(rel)) outputs.delete(rel);
}

if (check) {
  const stale = [];
  for (const [rel, want] of outputs) {
    const file = join(root, rel);
    if (!existsSync(file)) stale.push(`${rel} (missing)`);
    else if (typeof want === "string" ? readFileSync(file, "utf8") !== want : !samePixels(decode(readFileSync(file)), want)) stale.push(rel);
  }
  if (stale.length) {
    console.error(`minimap glyphs out of date: ${stale.join(", ")} (run npm run gen:glyphs)`);
    process.exit(1);
  }
  console.log(`minimap glyphs match tools/gen-glyphs/gen.mjs (${GLYPHS.length} glyphs, ${outputs.size} files).`);
} else {
  for (const [rel, out] of outputs) {
    const file = join(root, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof out === "string" ? out : encode(out));
  }
  console.log(`wrote ${GLYPHS.length} glyphs: ${[...outputs.keys()].join(", ")}`);
}
