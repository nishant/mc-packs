import fs from "node:fs";
import test from "node:test";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
import {decode} from "./gen-rain/png.mjs";
import {G} from "../packs/map_bp/scripts/glyphs.js";
// Cell hashes of the latest tested F3 page: unknown grass, the Nish champion glyphs (Q 0x3d, S 0x72..74) and the four dimension tiles.
const CELLS = {
  Q_VOID: "d97829314bbfcd6fc79bdbd3cd9e7b198a66b363e0a0af5eac820f82163cf484",
  Q_EMPTY: "e125f2299d5c724a976f2d9f7ef7bdb1b5022e31cb989a50d3ac0a7f1d5d0024",
  R_CHAMP: "644768db71747878d4c4bf87d6d0c0549ee533ee02f4911123b8d0d31fbc17b8",
  Q_CHAMP: "f617dc32863dac1cd9bedcadc06a328fdfcf10f9f1ac3d97aa67bacfcf32117f",
  L_CHAMP: "8f55b1493357462fd33f8a96d20dfcbf3c8b6182cfb3a12caadaddf11af8e657",
  Q_NETHER_EMPTY: "75b1be9a5b43146fe026d845d825af439b9a9554ef8b147d77c6cbc6400f917c",
  Q_NETHER_UNKNOWN: "0fbf6fe880b865695044360a10b138861f971f16fc19163a36a64e83f3f91349",
  Q_END_UNKNOWN: "4cb7679d0080333e73a6cb62bf2a44170cd13e79492ab3696cb208d2759f510c",
  S_CHAMP: "5a5bbc7945fcb328012d8ec8c4134e442b078d65ca6a363bea1a5344208c796d",
};
const CODE = {Q_EMPTY: 0xf338, Q_CHAMP: 0xf33d, L_CHAMP: 0xf372, R_CHAMP: 0xf373, S_CHAMP: 0xf374, Q_NETHER_UNKNOWN: 0xf3e0, Q_END_UNKNOWN: 0xf3e1, Q_VOID: 0xf3e2, Q_NETHER_EMPTY: 0xf3e3};
test("F3 keeps distinct unknown grass, latest champion glyphs and the new dimension tiles, with 151 unique valid glyphs", () => {
  const image = decode(fs.readFileSync(new URL("../packs/hud_rp/font/glyph_F3.png", import.meta.url)));
  const cell = (c) => {
    const bytes = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const i = ((((c >> 4) & 15) * 16 + y) * image.width + (c & 15) * 16 + x) * 4;
      bytes.push(...image.data.slice(i, i + 4));
    }
    return Buffer.from(bytes);
  };
  const values = Object.values(G);
  assert.equal(values.length, 151);
  assert.equal(new Set(values).size, 151);
  for (const v of values) assert.match(v, /^[\uE000-\uF8FF]$/u);
  assert.notEqual(G.Q_EMPTY, G.Q_GRASS);
  for (const [name, hash] of Object.entries(CELLS)) {
    assert.equal(G[name].charCodeAt(0), CODE[name], name + " mapping");
    assert.equal(createHash("sha256").update(cell(CODE[name] & 255)).digest("hex"), hash, name + " bitmap");
  }
  const unknown = cell(0x38);
  for (let i = 0; i < unknown.length; i += 4) assert.deepEqual([...unknown.subarray(i, i + 4)], [56, 128, 48, 255]);
});
