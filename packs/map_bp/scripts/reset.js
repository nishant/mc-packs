// /realm:map_reset: the operator's reset of every player's destination and marked spots, online now and offline
// players once on their next join. The world keeps a generation number; each player keeps the generation they were
// reset at, so a reset is applied once and data saved after it is never cleared by it.
export const WORLD_GEN = "map:reset"; // world: number, how many resets were run
export const PLAYER_GEN = "map:gen"; // player: the generation this player was reset at
export const CLEARED = ["map:wp", "map:marks"]; // player: what a reset clears; nothing else is touched

/** @param {unknown} v @returns {number} */
export const generationOf = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** @param {unknown} current the world's saved generation */
export const nextGeneration = (current) => generationOf(current) + 1;

/** Only the word "confirm" (any case) runs the reset. @param {unknown} arg */
export const confirmed = (arg) => typeof arg === "string" && arg.trim().toLowerCase() === "confirm";

/** A player is reset when a reset has run that they haven't seen. @param {unknown} worldGen @param {unknown} playerGen */
export const needsReset = (worldGen, playerGen) => generationOf(worldGen) > generationOf(playerGen);

/**
 * Clears the player's destination and marked spots, then records the generation (last, so a failure part way is
 * tried again next time). Returns true when something was cleared.
 * @param {{ getDynamicProperty(k: string): unknown, setDynamicProperty(k: string, v?: string | number): void }} player @param {number} generation
 */
export function resetPlayer(player, generation) {
  let cleared = false;
  for (const key of CLEARED) {
    if (player.getDynamicProperty(key) !== undefined) {
      player.setDynamicProperty(key, undefined);
      cleared = true;
    }
  }
  player.setDynamicProperty(PLAYER_GEN, generation);
  return cleared;
}
