// Town news (Hearth & Hearsay): the gate every pack that sends realm:gossip puts in front of it. At most one piece per
// in-game hour (NEWS_GAP game ticks) from a pack, each event (key) once; a piece that comes too soon is dropped, not
// queued. The keys told are process memory (the last NEWS_SEEN), so a script restart clears them. Packs never import
// each other, so each keeps its own copy as scripts/gossip.js; node tools/sync-gossip.mjs keeps the copies the same
// (tools/w10-news.test.mjs, tools/saga-gossip.test.mjs).

/** Game ticks between two pieces of gossip from one pack: an in-game hour. */
export const NEWS_GAP = 1000;
/** Keys remembered, so each event is told once. */
export const NEWS_SEEN = 64;

/**
 * The pack's gossip gate.
 * @param {(msg: object) => void} post sends one realm:gossip message
 * @param {() => number} tick the current game tick (system.currentTick)
 * @returns {(key: string, msg: object) => boolean} true when the piece was sent
 */
export function createGossip(post, tick) {
  let newsAt = -NEWS_GAP;
  /** @type {Set<string>} */
  const newsSeen = new Set();
  return (key, msg) => {
    const now = tick();
    if (newsSeen.has(key) || now - newsAt < NEWS_GAP) return false;
    newsAt = now;
    newsSeen.add(key);
    if (newsSeen.size > NEWS_SEEN) newsSeen.delete(/** @type {string} */ (newsSeen.values().next().value));
    post(msg);
    return true;
  };
}
