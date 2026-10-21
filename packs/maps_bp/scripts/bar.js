// The Warmer / Colder line above the hotbar: a steady line of the action bar protocol (see "How the packs work
// together" in docs/PACKS.md). Each redraw announces itself with `realm:actionbar` and its rank (`steady`), skips the
// write while a note or a higher-ranked line holds the player's bar, and so lets the Elytra HUD, the relic readouts
// and an expedition's run line draw over it, while the lower ones (the story tracker, the finder, build mode) wait
// for it as long as the map is held. Kept free of game imports so it can be tested alone (tools/maps-warmth.test.mjs).

const FROM = "maps_bp";
/** Between build mode (30) and an expedition's run line (40). */
export const WARM_STEADY = 35;
/** Ticks one request holds the bar: just over the 40-tick redraw, so lower lines wait only while a map is held. */
export const WARM_HOLD = 45;
const MAX_HOLD = 200;

/** @param {string} playerId */
export function warmthRequest(playerId) {
  return { player: playerId, ticks: WARM_HOLD, from: FROM, steady: WARM_STEADY };
}

/**
 * Whether another pack's request keeps the warmth line off the bar: notes (no `steady`) and higher steady lines do;
 * lower ones, `background` lines and our own do not (a tie goes to the `from` that sorts first).
 * @param {any} msg
 */
export function foreignHolds(msg) {
  if (!msg || typeof msg.player !== "string") return false;
  if (msg.from === FROM || msg.background === true) return false;
  if (Number.isFinite(msg.steady) && (msg.steady < WARM_STEADY || (msg.steady === WARM_STEADY && String(msg.from) > FROM))) return false;
  return true;
}

/**
 * Remembers a request that holds a player's bar until `now + ticks` (at most 200 ticks).
 * @param {Map<string, number>} held player id -> tick until which the bar is held @param {any} msg @param {number} now
 */
export function noteRequest(held, msg, now) {
  if (!foreignHolds(msg)) return;
  const until = now + Math.min(MAX_HOLD, Math.max(0, Number(msg.ticks) || 0));
  if (until > now && until > (held.get(msg.player) ?? 0)) held.set(msg.player, until);
}

/** @param {Map<string, number>} held @param {string} playerId */
export const holdsUntil = (held, playerId) => held.get(playerId) ?? 0;

/**
 * One redraw: announce the line first (so lower steady lines keep waiting and this one gets the bar back before them),
 * then write it unless a note or a higher line holds the bar. Returns whether it wrote.
 * @param {{ id: string, onScreenDisplay: { setActionBar: (text: string) => void } }} player
 * @param {string} text @param {Map<string, number>} held @param {number} now @param {(id: string, data: object) => void} send
 */
export function drawWarmth(player, text, held, now, send) {
  send("realm:actionbar", warmthRequest(player.id));
  if (holdsUntil(held, player.id) > now) return false;
  player.onScreenDisplay.setActionBar(text);
  return true;
}
