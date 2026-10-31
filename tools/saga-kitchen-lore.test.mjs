import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const objectives = readFileSync(new URL("../packs/saga_bp/scripts/objectives.js", import.meta.url), "utf8");
const cooking = readFileSync(new URL("../packs/cooking_bp/scripts/main.js", import.meta.url), "utf8");
const from = objectives.indexOf("const KITCHEN = {");
const code = objectives.slice(from, objectives.indexOf("/** @param {Player} player @param {string | undefined} item @param {string} [name] */\nexport function countItem"));
const plain = (s) => String(s).replace(/§./g, "");
const { same } = runInNewContext(`${code}\n({ same })`, { plain });

const stack = (typeId, nameTag, lore) => ({ typeId, nameTag, getLore: () => lore });
const rare = (name, base, extra = []) => stack(base, name, ["§7blurb", "§6Rare dish", ...extra]);

test("cooking writes the dish name into the dish's lore", () => {
  const lore = cooking.slice(cooking.indexOf("function dishLore"), cooking.indexOf("/** @param {Dish} d @param {number} n */"));
  assert.match(lore, /Dish: \$\{d\.name\}/);
});

test("a rare dish renamed to another rare dish of the same food is refused", () => {
  const pie = rare("Storm Eel Pie", "minecraft:pumpkin_pie", ["§8Dish: Storm Eel Pie"]);
  assert.equal(same(pie, "minecraft:pumpkin_pie", "Storm Eel Pie"), true);
  const renamed = rare("Lantern Cake", "minecraft:pumpkin_pie", ["§8Dish: Storm Eel Pie"]);
  assert.equal(same(renamed, "minecraft:pumpkin_pie", "Lantern Cake"), false, "the lore says it is the pie");
});

test("a dish from before the mark (no Dish line) is still taken", () => {
  assert.equal(same(rare("Lantern Cake", "minecraft:pumpkin_pie"), "minecraft:pumpkin_pie", "Lantern Cake"), true);
  assert.equal(same(stack("minecraft:bread", "Warden's Ration", ["§7blurb", "§8Kitchen dish"]), "minecraft:bread", "Warden's Ration"), true);
});

test("an anvil-renamed beetroot is not a Champion's Heart; the real one is", () => {
  assert.equal(same(stack("minecraft:beetroot", "Champion's Heart", []), "minecraft:beetroot", "Champion's Heart"), false);
  assert.equal(same(stack("minecraft:beetroot", "Champion's Heart", ["§7Rare ingredient", "§8Champion"]), "minecraft:beetroot", "Champion's Heart"), true);
});

test("a curly apostrophe and color codes in the name still match the marked dish", () => {
  const pasty = stack("minecraft:baked_potato", "§eMiner\u2019s Pasty", ["§7blurb", "§8Kitchen dish", "§8Dish: Miner's Pasty"]);
  assert.equal(same(pasty, "minecraft:baked_potato", "Miner's Pasty"), true);
});
