// Spawning an entity you are going to tag and later remove or edit. Every pack that does keeps this same file as
// scripts/spawn.js: edit tools/spawn-shared.js, then run node tools/sync-spawn.mjs (npm run check fails on a stale copy).

/**
 * @typedef {import("@minecraft/server").SpawnEntityOptions & {
 *   attempts?: number,
 *   fresh?: boolean,
 * }} SpawnFreshOptions
 * `attempts`: spawns tried before giving up (default 8). `fresh`: also insist the entity stands where it was spawned,
 * in the dimension asked for, with no tags, for callers whose type is one players own too (a chest minecart, a pet
 * wolf). Every other option goes to spawnEntity untouched (only when there is one).
 */

/**
 * spawnEntity, but never another entity: a world whose entity ids repeat (an old level.dat put back) can hand back an
 * entity that already exists (a dropped item, a pet), and what a pack spawns it tags and later removes. Spawns again
 * (the next id is usually free); throws when it never gets a new one, so the caller's own try/catch decides what a
 * failed spawn means. Synchronous: nothing here waits, so no entity is held across a tick.
 * @param {import("@minecraft/server").Dimension} dim @param {string} type @param {import("@minecraft/server").Vector3} at
 * @param {SpawnFreshOptions} [opts]
 * @returns {import("@minecraft/server").Entity}
 */
export function spawnFresh(dim, type, at, opts) {
  const { attempts = 8, fresh = false, ...spawn } = opts ?? {};
  const hasSpawn = Object.keys(spawn).length > 0;
  // typeId always has the namespace; a caller's id may be written without it ("zombie").
  const want = type.includes(":") ? type : `minecraft:${type}`;
  for (let k = 0; k < attempts; k++) {
    const e = hasSpawn ? dim.spawnEntity(/** @type {any} */ (type), at, spawn) : dim.spawnEntity(/** @type {any} */ (type), at);
    if (e.typeId !== want) continue;
    if (!fresh) return e;
    if (e.dimension.id !== dim.id) continue;
    const l = e.location;
    if (Math.abs(l.x - at.x) < 0.5 && Math.abs(l.z - at.z) < 0.5 && Math.abs(l.y - at.y) < 1.5 && !e.getTags().length) return e;
  }
  throw new Error(`spawnEntity(${type}) kept returning another entity`);
}
