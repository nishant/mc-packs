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
  assert.deepEqual(json("packs/build_rp/manifest.json").header.version, [2, 1, 7]);
  const stash = json("packs/stash_bp/manifest.json");
  assert.deepEqual(stash.header.version, [1, 6, 1]);
  assert.deepEqual(stash.modules.filter((module) => module.type === "data"), [{
    type: "data",
    uuid: "a6d37198-47d6-4f63-91b7-36e98962a418",
    version: [1, 0, 0],
  }]);
});

test("Run Away is the vanilla disc silhouette scaled 8x with red grooves, gold, and a black center", () => {
  const path = join(root, "packs", "build_rp", "textures", "items", "music_disc_run_away.png");
  assert.ok(existsSync(path), "Run Away disc texture is missing");
  const png = readFileSync(path);
  assert.equal(png[24], 8, "PNG bit depth");
  assert.equal(png[25], 6, "PNG RGBA color type");
  const img = decode(png);
  assert.equal(img.width, 128);
  assert.equal(img.height, 128);
  const pixel = (x, y) => Array.from(img.data.slice((y * 128 + x) * 4, (y * 128 + x + 1) * 4));
  const sourcePixel = (x, y) => pixel(x * 8, y * 8);
  const spans = [[5, 9], [2, 12], [1, 13], [0, 14], [0, 14], [0, 14], [0, 14], [1, 13], [2, 12], [5, 9]];
  const palette = [
    [92, 12, 18, 255], [44, 5, 9, 255], [125, 18, 26, 255],
    [186, 26, 36, 255], [232, 46, 56, 255], [255, 96, 104, 255],
    [150, 93, 55, 255], [253, 245, 95, 255], [249, 177, 34, 255],
    [233, 125, 21, 255], [14, 14, 18, 255], [24, 24, 30, 255],
  ].map((color) => color.join(","));
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const span = spans[y - 3];
      const opaque = span && x >= span[0] && x <= span[1];
      const want = sourcePixel(x, y);
      assert.equal(want[3], opaque ? 255 : 0, `silhouette at ${x},${y}`);
      if (opaque) assert.ok(palette.includes(want.join(",")), `palette at ${x},${y}`);
      for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 8; dx++) {
          assert.deepEqual(pixel(x * 8 + dx, y * 8 + dy), want, `nearest-neighbor texel at ${x},${y}`);
        }
      }
    }
  }
  for (const [x, y] of [[5, 6], [9, 6], [5, 8], [9, 8]]) {
    assert.deepEqual(sourcePixel(x, y), [150, 93, 55, 255], "antique gold label transition");
  }
  for (const [x, y] of [[6, 6], [7, 6], [8, 6], [5, 7], [7, 8]]) {
    assert.deepEqual(sourcePixel(x, y), [253, 245, 95, 255], "gleaming gold ring");
  }
  for (const [x, y] of [[9, 7], [6, 8], [8, 8]]) {
    assert.deepEqual(sourcePixel(x, y), [249, 177, 34, 255], "warm gold ring");
  }
  assert.deepEqual(sourcePixel(7, 7), [14, 14, 18, 255], "jet-black spindle");
  for (const x of [6, 8]) assert.deepEqual(sourcePixel(x, 7), [24, 24, 30, 255], "dark inner ring");
  assert.deepEqual(sourcePixel(7, 3), [92, 12, 18, 255], "crimson top rim");
  assert.deepEqual(sourcePixel(7, 12), [44, 5, 9, 255], "crimson-black bottom rim");
  for (const color of [[186, 26, 36, 255], [232, 46, 56, 255], [255, 96, 104, 255]]) {
    assert.ok(Array.from({ length: 256 }, (_, i) => sourcePixel(i % 16, Math.floor(i / 16)))
      .some((pixel) => pixel.join(",") === color.join(",")), `red body/sheen ${color}`);
  }
});

test("Run Away has an atlas entry and both name keys in every locale", () => {
  const id = "music_disc_run_away";
  assert.deepEqual(json("packs/build_rp/textures/item_texture.json").texture_data[id], {
    textures: `textures/items/${id}`,
  });
  const dir = join(root, "packs", "build_rp", "texts");
  const locales = readdirSync(dir).filter((file) => file.endsWith(".lang"));
  assert.equal(locales.length, 14);
  for (const file of locales) {
    const lines = readFileSync(join(dir, file), "utf8").split(/\r?\n/);
    for (const suffix of ["", ".name"]) {
      const prefix = `item.custom:${id}${suffix}=`;
      assert.deepEqual(lines.filter((line) => line.startsWith(prefix)), [`${prefix}Music Disc - Run Away`], file);
    }
  }
});

test("Run Away streams the same Ogg through spatial and personal record sounds", () => {
  const sounds = json("packs/build_rp/sounds/sound_definitions.json").sound_definitions;
  const sound = {
    name: "sounds/records/run_away",
    stream: true,
    volume: 1.0,
    pitch: 1.0,
    is3D: true,
    load_on_low_memory: true,
  };
  assert.deepEqual(sounds["realm.disc.run_away"], {
    category: "record", max_distance: 64.0, sounds: [sound],
  });
  assert.deepEqual(sounds["realm.disc.run_away_personal"], {
    category: "record", sounds: [{ ...sound, volume: 0.85, is3D: false }],
  });
  const path = join(root, "packs", "build_rp", "sounds", "records", "run_away.ogg");
  assert.ok(existsSync(path), "Run Away audio is missing");
  const ogg = readFileSync(path);
  assert.ok(ogg.length > 0, "Ogg is non-empty");
  assert.equal(ogg.toString("ascii", 0, 4), "OggS");
  assert.equal(ogg[28], 1, "Vorbis identification packet");
  assert.equal(ogg.toString("ascii", 29, 35), "vorbis");
  assert.equal(ogg[39], 1, "mono");
  assert.equal(ogg.readUInt32LE(40), 44100, "44.1 kHz");
});

test("the generator reproduces all eight committed pictures", () => {
  const result = spawnSync(process.execPath, [join(import.meta.dirname, "gen.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\(8 files\)/);
});
