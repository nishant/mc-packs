import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { decode } from "../gen-rain/png.mjs";

const root = join(import.meta.dirname, "..", "..");
const buttons = [
  ["inv_prev", "Previous Inventory Page"],
  ["inv_menu", "Inventory Pages Menu"],
  ["inv_next", "Next Inventory Page"],
];
const json = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));

for (const [id, name] of buttons) {
  test(`${id} is a dark RGBA8 slot button with transparent margins and a bright glyph`, () => {
    const path = join(root, "packs", "build_rp", "textures", "items", `${id}.png`);
    assert.ok(existsSync(path), `${id}.png is missing`);
    const png = readFileSync(path);
    assert.equal(png[24], 8, "PNG bit depth");
    assert.equal(png[25], 6, "PNG RGBA color type");
    const img = decode(png);
    assert.equal(img.width, 128);
    assert.equal(img.height, 128);
    const pixel = (x, y) => Array.from(img.data.slice((y * 128 + x) * 4, (y * 128 + x + 1) * 4));
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        if (x < 4 || x > 123 || y < 4 || y > 123) assert.equal(pixel(x, y)[3], 0, `margin at ${x},${y}`);
      }
    }
    for (const [x, y] of [[4, 4], [123, 4], [4, 123], [123, 123]]) assert.equal(pixel(x, y)[3], 0);
    assert.deepEqual(pixel(64, 4), [8, 9, 12, 255]);
    assert.deepEqual(pixel(64, 8), [46, 52, 66, 255]);
    assert.deepEqual(pixel(8, 64), [46, 52, 66, 255]);
    assert.deepEqual(pixel(64, 119), [14, 16, 22, 255]);
    assert.deepEqual(pixel(119, 64), [14, 16, 22, 255]);
    assert.deepEqual(pixel(64, 12), [22, 25, 34, 255]);
    assert.deepEqual(pixel(64, 115), [12, 14, 19, 255]);
    assert.deepEqual(pixel(64, 18), [32, 36, 48, 255]);
    let glowPixels = 0, antialiasedPixels = 0;
    for (let y = 28; y <= 99; y++) {
      for (let x = 24; x <= 103; x++) {
        const [r, g, b] = pixel(x, y);
        if (r < 100 && g > r + 20 && b > 80) glowPixels++;
        if (r > 100 && r < 235 && b > 200) antialiasedPixels++;
      }
    }
    assert.ok(glowPixels > 0, "glyph has a subtle cyan glow");
    assert.ok(antialiasedPixels > 0, "glyph edges are anti-aliased");
    const core = [235, 245, 255, 255];
    if (id === "inv_menu") {
      for (const y of [46, 64, 82]) {
        for (const x of [46, 64, 82]) assert.deepEqual(pixel(x, y), core, `grid cell ${x},${y}`);
      }
      assert.ok(pixel(55, 55)[0] < 50, "grid cells remain separate");
    } else {
      assert.deepEqual(pixel(id === "inv_prev" ? 48 : 80, 64), core, "chevron points in the correct direction");
      assert.ok(pixel(id === "inv_prev" ? 72 : 56, 64)[0] < 50, "chevron has an open center");
    }
  });

  test(`${id} has matching item, atlas, and all locale registrations`, () => {
    const item = json(`packs/stash_bp/items/${id}.json`);
    assert.equal(item.format_version, "1.21.60");
    assert.deepEqual(item["minecraft:item"].description, {
      identifier: `custom:${id}`,
      menu_category: { category: "items", is_hidden_in_commands: false },
    });
    assert.deepEqual(item["minecraft:item"].components, {
      "minecraft:max_stack_size": 1,
      "minecraft:icon": { textures: { default: id } },
      "minecraft:display_name": { value: name },
    });
    assert.deepEqual(json("packs/build_rp/textures/item_texture.json").texture_data[id], { textures: `textures/items/${id}` });
    const dir = join(root, "packs", "build_rp", "texts");
    const locales = readdirSync(dir).filter((file) => file.endsWith(".lang"));
    assert.equal(locales.length, 14);
    for (const file of locales) {
      const lines = readFileSync(join(dir, file), "utf8").split(/\r?\n/);
      for (const suffix of ["", ".name"]) {
        const prefix = `item.custom:${id}${suffix}=`;
        assert.deepEqual(lines.filter((line) => line.startsWith(prefix)), [`${prefix}${name}`], file);
      }
    }
  });
}

test("inventory packs have the required versions and standalone data module", () => {
  assert.deepEqual(json("packs/build_rp/manifest.json").header.version, [2, 1, 4]);
  const stash = json("packs/stash_bp/manifest.json");
  assert.deepEqual(stash.header.version, [1, 6, 0]);
  assert.deepEqual(stash.modules.filter((module) => module.type === "data"), [{
    type: "data",
    uuid: "a6d37198-47d6-4f63-91b7-36e98962a418",
    version: [1, 0, 0],
  }]);
});

test("the generator reproduces all seven committed pictures", () => {
  const result = spawnSync(process.execPath, [join(import.meta.dirname, "gen.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\(7 files\)/);
});
