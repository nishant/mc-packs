// Failing contracts for Easy Building W9 (O47-O51) against the current pack sources.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const JAVA_BEDS = [
  "minecraft:white_bed", "minecraft:orange_bed", "minecraft:magenta_bed", "minecraft:light_blue_bed",
  "minecraft:yellow_bed", "minecraft:lime_bed", "minecraft:pink_bed", "minecraft:gray_bed",
  "minecraft:light_gray_bed", "minecraft:cyan_bed", "minecraft:purple_bed", "minecraft:blue_bed",
  "minecraft:brown_bed", "minecraft:green_bed", "minecraft:red_bed", "minecraft:black_bed",
];

test("O47 color-bed ids are not a placeable special case", () => {
  const src = read("packs/build_bp/scripts/core/BlockPlacer.js");
  for (const id of JAVA_BEDS) assert.equal(src.includes(id), false, id);
  assert.equal(src.includes("expandBeds"), true);
});

test("O49 end_gateway stays unbreakable until a native resolve proves the id", () => {
  const src = read("packs/build_bp/scripts/core/BlockDestroyer.js");
  assert.match(src, /UNBREAKABLE[\s\S]*"minecraft:end_gateway"/);
  const allow = read("tools/check-ids.allow.json");
  assert.match(allow, /minecraft:end_gateway/);
  assert.match(allow, /Kept unbreakable until a native BlockTypes or command resolve proves the id invalid/);
});

test("O49 idle loops use a per-invocation clock", () => {
  for (const rel of [
    "packs/build_bp/scripts/core/Preview.js",
    "packs/build_bp/scripts/core/ModifierVisualizer.js",
    "packs/build_bp/scripts/core/GuideBook.js",
    "packs/build_bp/scripts/main.js",
  ]) {
    const src = read(rel);
    assert.equal(src.includes("createIdleClock"), true, rel);
    assert.equal(src.includes("nextIdlePhase"), false, rel);
  }
});

test("O48 interval-1 visualization is gated on a held tool", () => {
  assert.equal(read("packs/build_bp/scripts/core/Preview.js").includes("beginVisualizationTick"), true);
  assert.equal(read("packs/build_bp/scripts/core/ModifierVisualizer.js").includes("beginVisualizationTick"), true);
  assert.equal(read("packs/build_bp/scripts/core/Preview.js").includes("visualizationIdle"), true);
  assert.equal(read("packs/build_bp/scripts/core/PlayerState.js").includes("markHolderDirty"), true);
  assert.equal(read("packs/build_bp/scripts/utils/build-tool.js").includes("unplaceableIds"), true);
});

test("O51 an absent player limit is not the live cap", () => {
  const src = read("packs/build_bp/scripts/core/Settings.js");
  assert.equal(src.includes("let base = adminCap"), false);
  assert.equal(src.includes("resolvePlayerMaxBlocks"), true);
  assert.equal(read("packs/build_bp/scripts/config.js").includes("defaultMaxBlocks"), true);
});

test("O50 lang files have no duplicate keys and keep the last guided label", () => {
  const dir = join(root, "packs/build_rp/texts");
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".lang"))) {
    const counts = new Map();
    for (const line of readFileSync(join(dir, name), "utf8").split(/\r?\n/)) {
      const eq = line.indexOf("=");
      if (eq <= 0 || line.startsWith("##")) continue;
      const key = line.slice(0, eq);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [key, n] of counts) assert.equal(n, 1, `${name} ${key} x${n}`);
  }
  const en = read("packs/build_rp/texts/en_US.lang");
  assert.match(en, /^eb\.help\.btn\.guided=.*Live Tutorial/m);
  assert.equal(en.includes("Guided First Build"), false);
});
