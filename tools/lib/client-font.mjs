// How a Bedrock client lays out HUD label text in its default font: pixels per character and word wrap, for checking
// Side HUD boxes against what a phone or PC draws rather than against a pack's own column estimate.
// ASCII glyphs come from the default bitmap font (font/default8.png, 8 px cells): a glyph's advance is its ink width
// plus 1 px. Most letters and digits are 5 px of ink (6 px advance); the narrow ones are listed. Bold (§l) adds 1 px a
// glyph; § codes take no room. A label wraps at spaces when the next word does not fit its max width, and breaks a
// word that is wider than a whole row between characters. A line break (\n) starts a new row.
// Keep the table in step with the copy in tools/test-bds/examples/saga-quest-wrap.js (scenarios cannot import it;
// tools/saga-quest-box.test.mjs checks the copy).
// CLIENT-FONT-TABLE-START
export const NARROW = { " ": 4, "!": 2, '"': 4, "'": 2, "(": 4, ")": 4, "*": 4, ",": 2, ".": 2, ":": 2, ";": 2, "<": 5, ">": 5, "@": 7, I: 4, "[": 4, "]": 4, "`": 3, f: 5, i: 2, k: 5, l: 3, t: 4, "{": 4, "|": 2, "}": 4, "~": 7 };
export const DEFAULT_ADVANCE = 6;
// CLIENT-FONT-TABLE-END

/** Pixel width of one glyph. @param {string} ch @param {boolean} bold */
export function advance(ch, bold = false) {
  return (NARROW[ch] ?? DEFAULT_ADVANCE) + (bold && ch !== " " ? 1 : 0);
}

/**
 * Rows a text takes in a label `width` pixels wide, wrapped the way the client does.
 * @param {string} text @param {number} [width] @returns {number}
 */
export function clientRows(text, width = 200) {
  let rows = 0;
  let bold = false;
  for (const line of text.split("\n")) {
    rows++;
    let used = 0;
    // Words with their formatting codes; a code changes bold for what follows (§l on; §r off).
    const words = line.split(" ");
    for (let w = 0; w < words.length; w++) {
      /** @type {number[]} */
      const glyphs = [];
      const word = words[w];
      for (let i = 0; i < word.length; i++) {
        if (word[i] === "§" && i + 1 < word.length) {
          const code = word[i + 1].toLowerCase();
          if (code === "l") bold = true;
          else if (code === "r") bold = false;
          i++;
          continue;
        }
        glyphs.push(advance(word[i], bold));
      }
      const wordWidth = glyphs.reduce((a, b) => a + b, 0);
      const space = advance(" ", bold);
      if (used > 0 && used + space + wordWidth <= width) {
        used += space + wordWidth;
        continue;
      }
      if (used > 0) rows++;
      used = 0;
      for (const g of glyphs) {
        if (used + g > width) {
          rows++;
          used = 0;
        }
        used += g;
      }
    }
  }
  return rows;
}
