import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { decode } from "./gen-rain/png.mjs";
const root = path.resolve(import.meta.dirname, "..");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
test("default oak exactly matches approved art while rollback themes preserve every font, glyph meaning, and icon", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "minimap-art-themes-")), real = fs.realpathSync(temp);
  const fonts = [], frames = [], names = [];
  try {
    for (const theme of ["oak", "classic", "slate", "parchment"]) {
      const out = path.join(temp, theme), themeArgs = theme === "oak" ? [] : [`--theme=${theme}`];
      const generated = spawnSync(process.execPath, [path.join(root, "tools/gen-glyphs/gen.mjs"), ...themeArgs, `--output-root=${out}`], { stdio: "ignore" });
      assert.equal(generated.status, 0);
      const file = (rel) => fs.readFileSync(path.join(out, rel));
      const resources = [...[1, 2, 3, 4, 5, 6, 7, 8].map((p) => `packs/hud_rp/font/glyph_F${p}.png`), "packs/hud_rp/pack_icon.png"];
      const resourceHashes = Object.fromEntries(resources.map((rel) => {
        assert.deepEqual(file(rel), fs.readFileSync(path.join(root, rel)), `unchanged baseline resource ${rel}`);
        return [rel, hash(file(rel))];
      }));
      fonts.push(resourceHashes);
      names.push(hash(file("packs/map_bp/scripts/glyphs.js")));
      assert.deepEqual(file("packs/map_bp/scripts/glyphs.js"), fs.readFileSync(path.join(root, "packs/map_bp/scripts/glyphs.js")));
      frames.push(hash(file("packs/hud_rp/textures/ui/radar_frame.png")));
      const image = decode(file("packs/hud_rp/font/glyph_F3.png"));
      assert.equal(hash(image.data.subarray(0, 256 * 48 * 4)), "ebe32002d650c0b2698de595c7f22dbe4fc5e66498af1c35c9aded3228d4635f", "published compass ink is unchanged");
      if (theme === "oak") {
        for (const name of ["radar_frame", "radar_shade", "map_cardinal_n", "map_cardinal_e", "map_cardinal_s", "map_cardinal_w"]) {
          const bytes = file(`packs/hud_rp/textures/ui/${name}.png`), png = decode(bytes);
          assert.deepEqual(bytes, fs.readFileSync(path.join(root, `packs/hud_rp/textures/ui/${name}.png`)), `generated ${name} matches the checked-in resource`);
          assert.deepEqual([png.width, png.height], name.startsWith("map_cardinal") ? [24, 24] : [238, 248]);
          for (const [x, y] of [[0, 0], [png.width - 1, 0], [0, png.height - 1], [png.width - 1, png.height - 1]])
            assert.equal(png.data[(y * png.width + x) * 4 + 3], 0, "no opaque square corners");
        }
        const preview = decode(file("docs/media/map/map-hud.png"));
        assert.deepEqual([preview.width, preview.height], [476, 496], "illustrative oak render keeps the original source aspect");
      } else if (theme === "parchment") {
        assert.equal(frames.at(-1), "b1c0c2820e54fcb1633d955e7db7f435f9c78b9e394a5351e087363ffac9a25f", "previous selected Parchment remains available unchanged");
      }
      const again = spawnSync(process.execPath, [path.join(root, "tools/gen-glyphs/gen.mjs"), `--theme=${theme}`, `--output-root=${out}`, "--check"], { stdio: "ignore" });
      assert.equal(again.status, 0);
    }
    for (const font of fonts) assert.deepEqual(font, fonts[0]);
    assert.equal(new Set(names).size, 1);
    assert.equal(new Set(frames).size, 4, "one default oak plus three existing rollback definitions, not candidate packages");
  } finally {
    assert.equal(fs.realpathSync(temp), real);
    assert.ok(path.basename(temp).startsWith("minimap-art-themes-"));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
