// The story champions this session spawned itself (the fallback when no Champions pack makes them). A tagged champion
// whose id is not here is a leftover from a chunk that was unloaded at world load, and is removed when it loads.
// An id is forgotten when the champion dies. It is not forgotten on entityRemove, which also fires when the chunk
// unloads: a live champion forgotten there would be swept as a leftover when its chunk loads again mid-fight. So the
// list is also bounded, the oldest first. Imports nothing, so unit tests run it in node.

/** At most this many ids are kept; one is added per fallback champion spawned. */
export const MAX_SESSION_CHAMPIONS = 256;

/** @type {Set<string>} */
const ids = new Set();

/** @param {string} id */
export function trackChampion(id) {
  ids.delete(id);
  ids.add(id);
  while (ids.size > MAX_SESSION_CHAMPIONS) ids.delete(/** @type {string} */ (ids.values().next().value));
}

/** On death: the id never comes back. @param {string} id */
export function forgetChampion(id) {
  ids.delete(id);
}

/** @param {string} id */
export const sessionChampion = (id) => ids.has(id);

/** How many are kept (for tests and diagnostics). */
export const sessionChampionCount = () => ids.size;
