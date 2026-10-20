// Kitchen dishes from before the `§8Dish: <name>` lore line (cooking_bp 1.1.13) don't stack with newer servings of the
// same dish, because Bedrock only stacks items with the same lore. A player's old servings are given the current lore
// (main.js: when one enters their inventory, and once on join). Lines another pack appended after the dish's own
// (Silly Enchants) are kept.

export const DISH_MARK = "§8Dish: ";

/**
 * The lore an old serving should have now, or undefined when it needs nothing (already marked, or not this dish's
 * lore: the first line must be the dish's blurb and its tier line must be there).
 * @param {string[]} lore the stack's lore @param {string[]} current `dishLore(d)` @param {string} tier the dish's tier line
 * @returns {string[] | undefined}
 */
export function upgradeDishLore(lore, current, tier) {
  if (!Array.isArray(lore) || lore[0] !== current[0]) return undefined;
  if (lore.some((l) => typeof l === "string" && l.startsWith(DISH_MARK))) return undefined;
  const at = lore.indexOf(tier);
  if (at < 0) return undefined;
  return [...current, ...lore.slice(at + 1)];
}
