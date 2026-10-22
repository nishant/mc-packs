// Offline generator contracts only: no BDS/client, pack-root writes, native queries, or estimator state.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { decode } from "../gen-rain/png.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const generator = path.join(root, "tools/gen-glyphs/gen.mjs");
const fontPath = (page) => `packs/hud_rp/font/glyph_F${page}.png`;
const mappingBlock = (source) => source.match(/export const G = \{[\s\S]*?\n\};/)?.[0];
const loadSource = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
let temp, real, generated, api, baseline, baselineSource;

before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "minimap-estimated-glyphs-"));
  real = fs.realpathSync(temp);
  const result = spawnSync(process.execPath, [generator, "--theme=parchment", `--output-root=${temp}`], { stdio: "ignore" });
  assert.equal(result.status, 0, result.error?.message ?? "isolated generator succeeds");
  generated = fs.readFileSync(path.join(temp, "packs/map_bp/scripts/glyphs.js"), "utf8");
  baselineSource = fs.readFileSync(path.join(root, "packs/map_bp/scripts/glyphs.js"), "utf8");
  [api, baseline] = await Promise.all([loadSource(generated), loadSource(baselineSource)]);
});

after(() => {
  if (!temp) return;
  // Verify the exact owned temporary directory before removing anything.
  assert.equal(fs.realpathSync(temp), real);
  assert.ok(path.basename(temp).startsWith("minimap-estimated-glyphs-"));
  assert.equal(path.resolve(path.dirname(temp)), path.resolve(os.tmpdir()));
  fs.rmSync(temp, { recursive: true, force: true });
});

test("F1/F2 add exactly two estimated pages without changing F3-F8, pack icon, or existing G mapping bytes", () => {
  const files = fs.readdirSync(temp, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());
  assert.equal(files.length, 17, "exactly two new outputs, not extra theme/algorithm packages");
  for (const rel of [...[3, 4, 5, 6, 7, 8].map(fontPath), "packs/hud_rp/pack_icon.png"])
    assert.deepEqual(fs.readFileSync(path.join(temp, rel)), fs.readFileSync(path.join(root, rel)), `published bytes unchanged: ${rel}`);
  assert.ok(mappingBlock(generated));
  assert.equal(mappingBlock(generated), mappingBlock(baselineSource), "existing G mapping block is byte-identical");
  assert.deepEqual(api.G, baseline.G);
  assert.deepEqual(api.SELF_ARROWS, baseline.SELF_ARROWS);
});

test("every estimated color keeps full opaque extent and exact original RGB outside eight corner pixels", () => {
  for (let page = 0; page < 2; page++) {
    const estimated = decode(fs.readFileSync(path.join(temp, fontPath(page + 1))));
    const actual = decode(fs.readFileSync(path.join(temp, fontPath(page + 4))));
    assert.deepEqual([estimated.width, estimated.height], [256, 256]);
    for (let cell = 0; cell < 256; cell++) {
      const x0 = cell % 16 * 16, y0 = Math.floor(cell / 16) * 16;
      const base = [...actual.data.subarray((y0 * 256 + x0) * 4, (y0 * 256 + x0) * 4 + 4)];
      const linear = base.slice(0, 3).map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
      const ink = luminance < .18 ? [245, 240, 220, 255] : [20, 20, 20, 255];
      let changed = 0;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const offset = ((y0 + y) * 256 + x0 + x) * 4;
        const rgba = [...estimated.data.subarray(offset, offset + 4)];
        const marked = x >= 12 && y >= 12 && (x >> 1 & 1) === (y >> 1 & 1);
        assert.deepEqual(rgba, marked ? ink : base, `estimated index ${page * 256 + cell}, pixel ${x},${y}`);
        assert.equal(rgba[3], 255, "including every edge/corner: encoded glyph extent cannot collapse");
        if (marked) { changed++; assert.notDeepEqual(rgba, base, "even black has a visible contrast-aware mark"); }
      }
      assert.equal(changed, 8, "two diagonal 2x2 blocks only; the whole 4x4 region is not filled");
    }
  }
});

test("estimatedPaletteGlyph retains three-byte PUA encoding and validates the same 512-color index contract", () => {
  const used = new Set(Object.values(api.G));
  for (let index = 0; index < 512; index++) {
    const estimated = api.estimatedPaletteGlyph(index);
    assert.equal(estimated.charCodeAt(0), 0xf100 + index);
    assert.equal(estimated.length, 1);
    assert.equal(Buffer.byteLength(estimated, "utf8"), 3);
    assert.ok(!used.has(estimated), "estimated pages do not claim existing named glyph slots");
    assert.equal(api.paletteGlyph(index), baseline.paletteGlyph(index), "actual palette helper remains unchanged");
  }
  for (const invalid of [-1, 512, .5, NaN, Infinity, undefined, null, "2", {}, true])
    assert.equal(api.estimatedPaletteGlyph(invalid), api.G.Q_EMPTY, "invalid estimates use the existing unknown fallback");
});

test("all 48 markers retain identical background/collision semantics across all 512 actual and estimated colors", () => {
  const markers = Object.values(api.G).filter((glyph) => api.overlayGlyph(glyph, api.paletteGlyph(0)) !== glyph);
  assert.equal(markers.length, 48);
  for (let index = 0; index < 512; index++) for (const marker of markers) {
    const actual = api.overlayGlyph(marker, api.paletteGlyph(index));
    assert.equal(actual, baseline.overlayGlyph(marker, baseline.paletteGlyph(index)), "current overlay mappings do not move");
    assert.equal(api.overlayGlyph(marker, api.estimatedPaletteGlyph(index)), actual, "estimated colors normalize to the same background index");
  }
  for (const background of ["", "xx", "A", "\uf000", "\uf300", "\uf3ff", "\uf600", undefined, null, {}, true])
    assert.equal(api.overlayGlyph(api.G.Q_PARTY, background), api.G.Q_PARTY, "unrelated/invalid background pages stay legacy");
  for (const legacy of [api.G.S_N, api.G.Q_OUTSIDE, "\uf3fe", "", "xx", undefined, null])
    assert.equal(api.overlayGlyph(legacy, api.estimatedPaletteGlyph(298)), legacy, "non-overlay glyphs retain their original identity");
});

test("all seventeen isolated outputs remain deterministic under the generator check", () => {
  const result = spawnSync(process.execPath, [generator, "--theme=parchment", `--output-root=${temp}`, "--check"], { stdio: "ignore" });
  assert.equal(result.status, 0, result.error?.message ?? "isolated generated output matches source");
});
