// Which life of a player a page belongs to. A page opened before the player left, died or respawned is stale:
// it stops quietly instead of reopening forms or clearing what a newer page set.
/** @type {Map<string, number>} */
const gens = new Map();
let counter = 0;

/** The player's current generation (a new number after every bump). @param {string} id */
export function genOf(id) {
  let g = gens.get(id);
  if (!g) {
    g = ++counter;
    gens.set(id, g);
  }
  return g;
}

/** Ends the player's current generation: pages that captured it are stale. @param {string} id */
export function bump(id) {
  gens.delete(id);
}

/** True while the player is there and in the same life as when `gen` was captured. @param {{ id: string, isValid: boolean }} player @param {number} gen */
export function alive(player, gen) {
  return player.isValid && genOf(player.id) === gen;
}
