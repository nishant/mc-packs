// A per-player sweep spread over its interval: every online player is visited once every `every` ticks, as
// before, but a share of the players on each of `parts` runs `every / parts` ticks apart, instead of all of them on
// the same tick. A full server then costs the same per second without a 10 ms tick every few seconds (C21).
//
// The players are read once a round (on its first run). Each player keeps the share (slot) they had in the last
// round, so their own cadence stays `every` ticks; only a share that grew past its fair size (players left or joined)
// hands its newest members to the emptiest shares. Slots are kept by player id, not by list position, so somebody
// leaving doesn't move everyone after them. A player who joins mid-round is first visited in the next round, as a
// plain runInterval(every) would. Players who left meanwhile are skipped.
//
// Packs never import each other: node tools/sync-spread.mjs copies this file into each pack that uses it, as
// scripts/spread.js. It takes the game's `system` and `world` as arguments, so it runs in node tests too.

/** @typedef {{ id: string, isValid: boolean }} Visitable */

/**
 * The shares for this round: everyone keeps their last slot while that share isn't over its fair size
 * (ceil(players / parts)); the rest go to the emptiest shares. Pure: `prev` isn't changed.
 * @template {Visitable} P
 * @param {Map<string, number>} prev player id -> slot in the last round
 * @param {P[]} players everyone online now
 * @param {number} parts
 * @returns {{ slots: Map<string, number>, shares: P[][] }}
 */
export function assignShares(prev, players, parts) {
  const cap = Math.max(1, Math.ceil(players.length / parts));
  /** @type {P[][]} */
  const shares = Array.from({ length: parts }, () => []);
  /** @type {Map<string, number>} */
  const slots = new Map();
  /** @type {P[]} */
  const rest = [];
  for (const p of players) {
    const s = prev.get(p.id);
    if (s !== undefined && s < parts && shares[s].length < cap) {
      shares[s].push(p);
      slots.set(p.id, s);
    } else rest.push(p);
  }
  for (const p of rest) {
    let best = 0;
    for (let s = 1; s < parts; s++) if (shares[s].length < shares[best].length) best = s;
    shares[best].push(p);
    slots.set(p.id, best);
  }
  return { slots, shares };
}

/**
 * Visits every online player once every `every` ticks, a share at a time (see the top of the file).
 * `every` must be a multiple of `parts`. `start` runs once a round, before its first share, with everyone online
 * (for anything a plain sweep read once per run, such as the time of day). `visit` gets the share (players still
 * valid; never called with none) and where the round is: `round` counts rounds from 1, `part` is the share's slot
 * (0 to parts - 1), so `(round + part) % n === 0` picks a different share each round for work done every n rounds.
 * @template {Visitable} P
 * @param {{ runInterval: (cb: () => void, ticks?: number) => number }} system
 * @param {{ getAllPlayers: () => P[] }} world
 * @param {{ every: number, parts: number, visit: (share: P[], at: { round: number, part: number }) => void, start?: (players: P[], round: number) => void }} o
 * @returns {number} the runInterval handle
 */
export function spreadPlayers(system, world, o) {
  const parts = Math.max(1, Math.floor(o.parts));
  const step = Math.max(1, Math.floor(o.every / parts));
  if (step * parts !== o.every) throw new Error(`spreadPlayers: every (${o.every}) must be a multiple of parts (${parts})`);
  /** @type {Map<string, number>} */
  let slots = new Map();
  /** @type {P[][]} */
  let shares = [];
  let part = 0;
  let round = 0;
  return system.runInterval(() => {
    const at = part;
    part = (part + 1) % parts;
    if (at === 0) {
      round++;
      /** @type {P[]} */
      let players = [];
      try {
        players = world.getAllPlayers();
        ({ slots, shares } = assignShares(slots, players, parts));
      } catch (e) {
        shares = [];
        console.warn(`[spread] ${e}`);
      }
      o.start?.(players, round);
    }
    const share = shares[at];
    if (!share?.length) return;
    /** @type {P[]} */
    const live = [];
    for (const p of share) if (p.isValid) live.push(p);
    if (live.length) o.visit(live, { round, part: at });
  }, step);
}
