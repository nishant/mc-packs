// F31: old Kitchen dishes (no `§8Dish:` line) get the current lore so they stack with new servings again.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");
const { upgradeDishLore, DISH_MARK } = await import(pathToFileURL(join(root, "packs", "cooking_bp", "scripts", "dish-lore.js")).href);

const current = ["§7A warm bowl.", "§9Regeneration I (0:30)", "§8Kitchen dish", "§8Dish: Harbor Chowder"];
const tier = "§8Kitchen dish";

test("an old serving gets the current lore", () => {
  assert.deepEqual(upgradeDishLore(current.slice(0, 3), current, tier), current);
});

test("lines another pack appended stay after the dish's own", () => {
  assert.deepEqual(upgradeDishLore([...current.slice(0, 3), "§dSilly: Bouncy"], current, tier), [...current, "§dSilly: Bouncy"]);
});

test("old effect text is brought up to date too", () => {
  assert.deepEqual(upgradeDishLore(["§7A warm bowl.", "§9Regeneration I (0:20)", tier], current, tier), current);
});

test("a marked serving, another dish's lore or a lore without the tier line is left alone", () => {
  assert.equal(upgradeDishLore(current, current, tier), undefined);
  assert.equal(upgradeDishLore(["§7Something else.", "§9Regeneration I (0:30)", tier], current, tier), undefined);
  assert.equal(upgradeDishLore(["§7A warm bowl."], current, tier), undefined);
  assert.equal(upgradeDishLore([...current.slice(0, 3), `${DISH_MARK}Other`], current, tier), undefined);
});

test("cooking_bp upgrades old servings when they enter an inventory and on join", () => {
  const main = readFileSync(join(root, "packs", "cooking_bp", "scripts", "main.js"), "utf8");
  assert.match(main, /world\.afterEvents\.playerInventoryItemChange\.subscribe\(/);
  assert.match(main, /upgradeDishLore\(s\.getLore\(\), dishLore\(d\), tierLine\(d\)\)/);
  assert.match(main, /if \(player\.isValid\) upgradeInventory\(player\);/);
  assert.equal(DISH_MARK, "§8Dish: ", "the mark Story Questlines checks");
});
