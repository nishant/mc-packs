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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { blank, decode, encode, samePixels } from "../gen-rain/png.mjs";

const root = join(import.meta.dirname, "..", "..");
const check = process.argv.includes("--check");
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
const BG = /** @type {RGBA} */ ([10, 14, 18, 150]);
const RING = /** @type {RGBA} */ ([255, 255, 255, 34]);
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
/** The radar's player arrow, turned `deg` clockwise from north. @param {number} deg */
function arrow(deg) {
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  return [[0, -6.5], [5, 6], [0, 3], [-5, 6]].map(([x, y]) => [8 + x * cos - y * sin, 8 + x * sin + y * cos]);
}
const LEFT = [[2, 8], [12, 2.5], [12, 13.5]];
const RIGHT = [[14, 8], [4, 2.5], [4, 13.5]];

/** Strip cells: a thin baseline across the bottom, so every cell is full width. */
const baseline = (/** @type {Image} */ img, /** @type {number} */ ox, /** @type {number} */ oy) => rect(img, ox, oy + 15, ox + 15, oy + 15, LINE);
/** Radar cells: a dark see-through square with a faint grid line. */
const square = (/** @type {Image} */ img, /** @type {number} */ ox, /** @type {number} */ oy) => {
  rect(img, ox, oy, ox + 15, oy + 15, BG);
  rect(img, ox, oy, ox + 15, oy, RING);
  rect(img, ox, oy + 1, ox, oy + 15, RING);
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
    draw(img, ox, oy, c);
  });
});
glyph("Q_EMPTY", 0x38, "radar: empty", (img, ox, oy) => square(img, ox, oy));
glyph("Q_NORTH", 0x39, "radar: which way north is (when it turns with you)", (img, ox, oy) => {
  square(img, ox, oy);
  letter(img, ox, oy, BIG.N, 3, 1, 2, NORTH);
});
// Row 4: the player in the radar's middle, facing N, NE, E, SE, S, SW, W, NW.
for (let k = 0; k < 8; k++)
  glyph(`Q_YOU_${k}`, 0x40 + k, `radar: you, facing ${["N", "NE", "E", "SE", "S", "SW", "W", "NW"][k]}`, (img, ox, oy) => {
    square(img, ox, oy);
    rimmedPoly(img, ox, oy, arrow(k * 45), WHITE);
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

// ---------------------------------------------------------------------------
// The outputs
// ---------------------------------------------------------------------------

function page() {
  const img = blank(16 * CELL, 16 * CELL);
  for (const g of GLYPHS) g.draw(img, (g.cell % 16) * CELL, Math.floor(g.cell / 16) * CELL);
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
  lines.push("};", "");
  return lines.join("\n");
}

/** A render of the HUD (not a screenshot): the strip facing east-northeast with markers, and the radar. @param {Image} sheet */
function render(sheet) {
  const W = 25 * CELL + 24, H = 7 * CELL + 2 * CELL + 36;
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
  // Facing 70 degrees: 5 degrees a cell, so N sits 14 cells left of the middle (off the strip) and E 4 cells right.
  const strip = Array(25).fill("S_BLANK");
  for (let i = 0; i < 25; i++) if ((70 + (i - 12) * 5) % 15 === 0) strip[i] = "S_TICK";
  strip[12] = "S_CENTER";
  strip[3] = "S_NE";
  strip[16] = "S_E";
  Object.assign(strip, { 0: "L_MOB", 5: "S_TOWN", 7: "S_FOLK", 10: "S_STAR", 14: "S_MOB", 19: "S_WANDER", 21: "S_SITE", 22: "S_HOME", 24: "R_RAINBOW" });
  const dim = /** @type {RGBA} */ ([0, 0, 0, 120]);
  rect(img, 9, 3, 9 + 25 * CELL + 5, 3 + CELL + 3, dim);
  strip.forEach((g, i) => blit(g, 12 + i * CELL, 5));
  // The radar, turning with the player: the townsfolk ahead and to the left, a mob to the right, the star ahead.
  const grid = Array.from({ length: 7 }, () => Array(7).fill("Q_EMPTY"));
  grid[3][3] = "Q_YOU_0";
  grid[0][3] = "Q_STAR";
  grid[2][1] = "Q_FOLK";
  grid[3][5] = "Q_MOB";
  grid[4][6] = "Q_MOB";
  grid[5][4] = "Q_WANDER";
  grid[1][0] = "Q_NORTH";
  grid.forEach((row, r) => row.forEach((g, c) => blit(g, 12 + c * CELL, CELL + 30 + r * CELL)));
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

const sheet = page();
/** @type {Map<string, Image | string>} */
const outputs = new Map();
outputs.set("packs/hud_rp/font/glyph_F3.png", sheet);
outputs.set("packs/hud_rp/pack_icon.png", packIcon());
outputs.set("packs/map_bp/scripts/glyphs.js", glyphsJs());
outputs.set("docs/media/map/map-hud.png", render(sheet));

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
