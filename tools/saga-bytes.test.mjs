// Story Questlines' save size (PRG-31): utf8Length (native regular expressions) gives the same count as the loop it
// replaced, and as Buffer.byteLength, for ASCII, section signs, CJK text and surrogate pairs, raw and as JSON.
import assert from "node:assert/strict";
import test from "node:test";
import { utf8Length } from "../packs/saga_bp/scripts/bytes.js";

/** The old loop from saga_bp/scripts/data.js. @param {string} s */
function oldByteLength(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

const SAMPLES = [
  "",
  "plain ascii {\"s\":{\"bell\":{\"c\":3}}}",
  "\u00a7eQuest \u00a7f12/64",
  "caf\u00e9 \u00fc\u00df \u07ff \u0800",
  "\u4e16\u754c \uffff \ud7ff",
  "\ud83d\ude00 emoji \ud83c\udf89 and \u00a7 mixed \u4e16",
  "x".repeat(10000) + "\u00a7".repeat(500) + "\ud83d\ude00".repeat(20),
];

test("utf8Length matches the old loop and Buffer.byteLength", () => {
  for (const s of SAMPLES) {
    for (const v of [s, JSON.stringify({ t: s, lone: "\ud800" })]) {
      assert.equal(utf8Length(v), oldByteLength(v), JSON.stringify(v.slice(0, 40)));
      assert.equal(utf8Length(v), Buffer.byteLength(v, "utf8"), JSON.stringify(v.slice(0, 40)));
    }
  }
});
