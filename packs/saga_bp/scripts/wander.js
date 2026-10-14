// Wanderers of the Wilds, the story side: the wanderer pack (wander_bp) decides who appears where and owns
// their entities; this module keeps each player's encounter (a Stranger's one-off or a hostile's fight),
// builds and moves the Recurring Wanderers' camps, and tells the wanderer pack what each player may meet.
//   realm:wander_spawn { player, wid, archetype, name, hostile?, dim, x, y, z }   <- wander_bp: someone appeared
//   realm:wander_turn  { player, wid, kind, dim, x, y, z, accused? }              <- wander_bp: a disguise dropped
//   realm:wander_gone  { player, wid, why }                                       <- wander_bp: a wanderer left
//   realm:wander_done  { player, wid, how }                                       -> accepted | left | turn | camp
//   realm:wander_state { player, ch, h, s, q }                                    -> what each player may meet
//   realm:wander_hide  { wid, player, seconds }                                   -> (objectives.js) during an escort
//   realm:place_ready  { name, state, dim, x, y?, z, wid? }                       -> (places.js) every place, camps too
import { system, world } from "@minecraft/server";
import { chapterDone, currentChapter, entries, finished, flagOf, hostileById, invalidate, markDirty, pickTemplate, requires, sagaOf, storyById, storyWaitsForPacks } from "./data.js";
import { mates, spawnGroup } from "./objectives.js";
import { campName, ensurePlace, locate, makeCamp, needCamp, placesOf, placeLabel } from "./places.js";
import { STORIES } from "./stories.js";
import { WANDERERS } from "./stories/index.js";
import { across, online, send, strangerNames } from "./util.js";

/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("./data.js").WanderState} WanderState */
/** @typedef {import("./types.js").Story} Story */
/** @typedef {import("./types.js").Chapter} Chapter */

const ACCEPTED_LIFE_MS = 31 * 60000; // the wanderer pack keeps an accepted one-off's stranger 30 minutes at most
const OFFER_LIFE_MS = 40 * 60000; // an encounter never accepted is forgotten after this
const ONEOFF_MAX_MS = 3 * 86400000; // an accepted one-off not finished in 3 real days is dropped
const FIGHT_MAX_MS = 2 * 3600000; // a hostile's fight nobody comes back to ends after 2 hours

export const WANDERER_BY_ID = new Map(WANDERERS.map((w) => [w.id, w]));
/** A Recurring Wanderer by NPC id (`w_pell`). @param {string} npc */
export const wandererOf = (npc) => (npc.startsWith("w_") ? WANDERER_BY_ID.get(npc.slice(2)) : undefined);
/** Each Recurring Wanderer's chain (the story they give). @type {Map<string, Story>} */
export const CHAINS = new Map();
for (const s of STORIES) if (s.kind === "wander" && s.giver.startsWith("w_")) CHAINS.set(s.giver.slice(2), s);

/** Where each player last met each Recurring Wanderer ("<player>|<wid>"), for a camp made "near the wanderer". @type {Map<string, { dim: string, x: number, y: number, z: number }>} */
const metAt = new Map();

const finite = (/** @type {unknown} */ n) => typeof n === "number" && Number.isFinite(n);

// ---------------------------------------------------------------------------
// Encounters
// ---------------------------------------------------------------------------

/** realm:wander_spawn: a wanderer appeared for a player. @param {any} msg */
export function onWanderSpawn(msg) {
  const player = typeof msg.player === "string" ? online(msg.player) : undefined;
  if (!player || typeof msg.wid !== "string" || !/^[a-z0-9_]{1,24}$/.test(msg.wid) || typeof msg.dim !== "string" || ![msg.x, msg.y, msg.z].every(finite)) return;
  const at = { dim: msg.dim, x: msg.x, y: msg.y, z: msg.z };
  if (WANDERER_BY_ID.has(msg.wid)) {
    metAt.set(`${player.id}|${msg.wid}`, at);
    if (metAt.size > 500) metAt.delete(/** @type {string} */ (metAt.keys().next().value));
    return; // a Recurring Wanderer: their chain is an ordinary story
  }
  const saga = sagaOf(player);
  if (saga.wv?.a && !saga.wv.c) return; // busy with a one-off (the wanderer pack shouldn't send one then)
  const name = typeof msg.name === "string" && msg.name ? msg.name.replace(/[^\x20-\x7e]/g, "").slice(0, 40) : "a stranger";
  /** @type {WanderState} */
  const wv = { w: msg.wid, ar: typeof msg.archetype === "string" ? msg.archetype.slice(0, 16) : "traveler", nm: name, at: { d: msg.dim, x: msg.x, y: msg.y, z: msg.z }, m: Date.now() };
  if (typeof msg.hostile === "string" && hostileById.has(/** @type {any} */ (msg.hostile))) wv.hk = msg.hostile;
  else {
    const pick = pickTemplate(saga, wv, player);
    if (pick) {
      wv.tp = pick.tp;
      wv.p = pick.p;
    }
  }
  if (strangerNames.size > 500) strangerNames.clear(); // saved encounters set theirs again when shown
  strangerNames.set(`w_${wv.w}`, name);
  saga.wv = wv;
  invalidate(player.id);
  markDirty(player);
}

/** realm:wander_gone: the wanderer left. An offer goes with them; an accepted one-off finishes without them, if it can. @param {any} msg */
export function onWanderGone(msg) {
  const player = typeof msg.player === "string" ? online(msg.player) : undefined;
  if (!player || typeof msg.wid !== "string") return;
  const saga = sagaOf(player);
  const wv = saga.wv;
  if (msg.why === "accused") {
    // Accused a friendly wanderer: they leave, and the story remembers.
    saga.g ??= {};
    saga.g.w_accused = String(Number(saga.g.w_accused ?? 0) + 1);
    invalidate(player.id);
    markDirty(player);
  }
  if (!wv || wv.w !== msg.wid || wv.tn) return;
  if (!wv.a) delete saga.wv;
  else wanderLeft(player, wv);
  invalidate(player.id);
  markDirty(player);
}

/** An accepted one-off's stranger left: it ends if a step still needs them, else it finishes without them. @param {Player} player @param {WanderState} wv */
function wanderLeft(player, wv) {
  if (wv.g) return;
  wv.g = 1;
  const e = entries(player).find((x) => x.wv === wv.w);
  const npc = `w_${wv.w}`;
  const needsThem = !!e && e.chapter.objectives.some((o, i) => o.npc === npc && (e.st.o?.[i] ?? 0) < (o.count ?? 1));
  if (!needsThem) {
    player.sendMessage(`§7[Story] ${wv.nm} has moved on. Finish the job anyway: they left word that you'll be paid.`);
    return;
  }
  player.sendMessage(`§7[Story] ${wv.nm} couldn't wait any longer and moved on. That job is over.`);
  delete sagaOf(player).wv;
}

/**
 * Housekeeping, once a second per player: an accepted one-off outlives its stranger (time-based, as the
 * wanderer pack's own limit), stale offers are forgotten, old one-offs and fights are dropped.
 * @param {Player} player
 */
export function wanderHousekeeping(player) {
  const saga = sagaOf(player);
  const wv = saga.wv;
  if (!wv) return;
  const now = Date.now();
  if (!wv.a) {
    if (now - wv.m > OFFER_LIFE_MS) delete saga.wv;
    else return;
  } else if (wv.tn) {
    if (now - (wv.t ?? wv.m) > FIGHT_MAX_MS) {
      player.sendMessage("§7[Story] The ambusher's trail has gone cold.");
      const tag = entries(player).find((x) => x.wv === wv.w)?.chapter.objectives[0]?.champion?.tag;
      try {
        if (tag) for (const ent of world.getDimension(wv.at.d).getEntities({ tags: [tag] })) ent.remove();
      } catch {
        // unloaded: Champions' own cleanup, or the next load's sweep, takes it
      }
      delete saga.wv;
    } else return;
  } else if (now - (wv.t ?? wv.m) > ONEOFF_MAX_MS) {
    player.sendMessage(`§7[Story] ${wv.nm}'s job is too old now: it's dropped.`);
    delete saga.wv;
  } else if (!wv.g && now - (wv.t ?? wv.m) > ACCEPTED_LIFE_MS) {
    wanderLeft(player, wv);
    if (saga.wv === wv) return markDirty(player);
  } else return;
  invalidate(player.id);
  markDirty(player);
}

/** A player joined: the wanderer pack has sent their stranger away meanwhile. @param {Player} player */
export function wanderJoined(player) {
  const saga = sagaOf(player);
  const wv = saga.wv;
  if (!wv || wv.tn) return;
  if (!wv.a) delete saga.wv;
  else wanderLeft(player, wv);
  send("realm:wander_done", { player: player.id, wid: wv.w, how: "left" }); // in case it's still standing there
  invalidate(player.id);
  markDirty(player);
}

// ---------------------------------------------------------------------------
// Hostile wanderers
// ---------------------------------------------------------------------------

/** realm:wander_turn: the disguise dropped (its time came, or the player accused it). @param {any} msg */
export function onWanderTurn(msg) {
  const player = typeof msg.player === "string" ? online(msg.player) : undefined;
  if (!player || typeof msg.wid !== "string") return;
  const wv = sagaOf(player).wv;
  if (!wv || wv.w !== msg.wid || !wv.hk || wv.tn) return;
  if ([msg.x, msg.y, msg.z].every(finite) && typeof msg.dim === "string") wv.at = { d: msg.dim, x: msg.x, y: msg.y, z: msg.z };
  startHostile(player, msg.accused === true);
}

/**
 * The fight: the encounter becomes an accepted one-off (defeat the champion where it stood), its adds come at
 * once (one more per party mate within 32 blocks, up to 3). Accused first: it is slowed, and the Wardens hear of it.
 * @param {Player} player @param {boolean} accused
 */
export function startHostile(player, accused) {
  const saga = sagaOf(player);
  const wv = saga.wv;
  const h = wv?.hk ? hostileById.get(/** @type {any} */ (wv.hk)) : undefined;
  if (!wv || !h || wv.tn) return;
  wv.tp = `h:${h.id}`;
  wv.a = 1;
  wv.tn = 1;
  wv.o = [];
  wv.t = Date.now();
  delete wv.x;
  invalidate(player.id);
  markDirty(player, true);
  send("realm:wander_done", { player: player.id, wid: wv.w, how: "turn" });
  player.sendMessage(`§c[Story] ${h.reveal}`);
  player.playSound("mob.evocation_illager.prepare_attack", { pitch: 0.8 });
  const e = entries(player).find((x) => x.wv === wv.w);
  const tag = e?.chapter.objectives[0]?.champion?.tag;
  if (!tag) return;
  try {
    const dim = world.getDimension(wv.at.d);
    const near = mates(player).filter((m) => m.dimension.id === dim.id && across(m.location, player.location) <= 32).length;
    spawnGroup(player, dim, wv.at, { mobs: h.adds.mobs, count: h.adds.count + Math.min(3, near) }, tag, 3, 7);
  } catch (err) {
    console.warn(`[saga] hostile adds: ${err}`);
  }
  if (accused) {
    send("realm:rep_add", { player: player.id, guild: "wardens", amount: 10, reason: "Saw through a disguise" });
    saga.g ??= {};
    saga.g.iron = String(Number(saga.g.iron ?? 0) + 1);
    player.sendMessage("§e[Story] You saw through it: it stumbles, slowed. (+10 Wardens reputation)");
    // Slow it (and its friends) once it has appeared: a few seconds after the turn.
    for (const delay of [40, 90]) {
      system.runTimeout(() => {
        try {
          const dim = world.getDimension(wv.at.d);
          for (const ent of dim.getEntities({ tags: [tag] })) if (!ent.hasTag("saga:slowed")) {
            ent.addTag("saga:slowed");
            ent.addEffect("slowness", 100, { amplifier: 1 });
          }
          for (const ent of dim.getEntities({ location: wv.at, maxDistance: 12, tags: ["saga:add"] })) ent.addEffect("slowness", 100, { amplifier: 1 });
        } catch {
          // unloaded
        }
      }, delay);
    }
  }
}

// ---------------------------------------------------------------------------
// Camps
// ---------------------------------------------------------------------------

/**
 * A chapter with a `camp` was accepted: build (or move) the giver's camp near the wanderer or a place. A camp
 * that moved sends its other players a letter.
 * @param {Player} player @param {Story} story @param {Chapter} chapter
 */
export function campForChapter(player, story, chapter) {
  const w = wandererOf(story.giver);
  if (!w) return;
  if (!chapter.camp) {
    needCamp(w.id, player.id);
    return;
  }
  const near = campSpot(player, w.id, chapter.camp.near);
  if (!near) return;
  const before = placesOf()[campName(w.id)];
  const moved = makeCamp(w.id, chapter.camp.prefab, near.dim, near, player.id);
  send("realm:wander_done", { player: player.id, wid: w.id, how: "camp" });
  if (moved && before) {
    const where = chapter.camp.near === "wanderer" ? "somewhere new" : `near ${placeLabel(chapter.camp.near)}`;
    player.sendMessage(`§e[Story] ${w.short} is moving camp ${where}. The tracker points the way once it's up.`);
    for (const pid of Object.keys(before.u ?? {})) {
      if (pid === player.id) continue;
      send("realm:mail_send", {
        to: pid,
        from: w.name,
        subject: `${w.short} has moved camp`.slice(0, 40),
        body: `Friend, I've packed up and moved camp ${where} (about ${Math.floor(near.x)}, ${Math.floor(near.z)}). Come find me there when you're ready to go on. - ${w.short}`.slice(0, 600),
      });
    }
  }
}

/** Where a camp goes: by the wanderer (where this player met them), or beside a story place. @param {Player} player @param {string} wid @param {string} near */
function campSpot(player, wid, near) {
  if (near === "wanderer") {
    const met = metAt.get(`${player.id}|${wid}`);
    const p = player.location;
    return met ?? { dim: player.dimension.id, x: p.x, y: p.y, z: p.z };
  }
  const loc = ensurePlace(near) ? locate({ place: near }) : undefined;
  if (!loc || typeof loc === "string") {
    // The place can't be set (picking places is disabled): the camp goes where the player is.
    const p = player.location;
    return { dim: player.dimension.id, x: p.x, y: p.y, z: p.z };
  }
  // Beside the place, not on it: about 20 blocks off, on the side toward the player.
  const p = player.location;
  const d = Math.max(1, across(p, loc));
  const k = loc.dim === player.dimension.id ? 20 / d : 0;
  return { dim: loc.dim, x: loc.x + (k ? (p.x - loc.x) * k : 20), y: loc.y, z: loc.z + (k ? (p.z - loc.z) * k : 0) };
}

/**
 * A player on a chain talks to its wanderer and the camp is gone (taken down after a week unvisited): set it up
 * again where they are. @param {Player} player @param {string} npc
 */
export function campCheck(player, npc) {
  const w = wandererOf(npc);
  const story = w ? CHAINS.get(w.id) : undefined;
  if (!w || !story || placesOf()[campName(w.id)]) return;
  const st = sagaOf(player).s[story.id];
  if (!st || (!st.a && !st.dn.length) || finished(sagaOf(player), story)) return;
  const met = metAt.get(`${player.id}|${w.id}`);
  const p = player.location;
  const near = met ?? { dim: player.dimension.id, x: p.x, y: p.y, z: p.z };
  makeCamp(w.id, w.camp, near.dim, near, player.id);
  send("realm:wander_done", { player: player.id, wid: w.id, how: "camp" });
}

// ---------------------------------------------------------------------------
// What each player may meet: realm:wander_state
// ---------------------------------------------------------------------------

/** What each player was last sent. @type {Map<string, string>} */
const stateSent = new Map();

/**
 * Sends `realm:wander_state` { player, ch, h, s, q } when it changed: per Recurring Wanderer "n" (their chain can
 * start), "o" (something waits at them: the next chapter or a report), "a" (on the chain), "d" (done); `h` the
 * hostile kinds this player may meet; `s` 1 = "Something's off..." (Reyes a Friend or more, or `g:iron` 3+);
 * `q` 1 = a one-off or fight is going on (no Strangers now).
 * @param {Player} player @param {boolean} [force]
 */
export function sendWanderState(player, force = false) {
  const saga = sagaOf(player);
  /** @type {Record<string, string>} */
  const ch = {};
  for (const [wid, story] of CHAINS) {
    const st = saga.s[story.id];
    if (finished(saga, story)) ch[wid] = "d";
    else if (st && (st.a || st.dn.length)) {
      const cur = currentChapter(saga, story);
      const giver = cur ? cur.chapter.npc ?? story.giver : "";
      const ender = cur ? cur.chapter.end ?? giver : "";
      const e = st.a ? entries(player).find((x) => x.story.id === story.id) : undefined;
      const waiting = !st.a ? giver === story.giver : !!e && chapterDone(e, saga) && ender === story.giver;
      ch[wid] = waiting ? "o" : "a";
    } else if (!storyWaitsForPacks(story) && requires(story.requires, saga, story.id, player).ok) ch[wid] = "n";
  }
  const fin = (/** @type {string} */ id) => {
    const s = storyById.get(id);
    return !!s && finished(saga, s);
  };
  /** @type {string[]} */
  const h = [];
  if (fin("drowned_bell") && fin("last_map")) {
    h.push("toll");
    h.push("sailor");
    if (fin("act2_choir")) h.push("spy");
    if (fin("act3_deep")) h.push("hermit");
  }
  const s = Number(flagOf(saga, "", "g:aff_reyes") ?? 0) >= 2 || Number(flagOf(saga, "", "g:iron") ?? 0) >= 3 ? 1 : 0;
  const q = saga.wv?.a && !saga.wv.c ? 1 : 0;
  const msg = { player: player.id, ch, h, s, q };
  const json = JSON.stringify(msg);
  if (!force && stateSent.get(player.id) === json) return;
  stateSent.set(player.id, json);
  send("realm:wander_state", msg);
}

/** realm:wander_ping: everything again. */
export function wanderPing() {
  stateSent.clear();
}

/** @param {string} pid */
export function wanderForget(pid) {
  stateSent.delete(pid);
  for (const k of [...metAt.keys()]) if (k.startsWith(`${pid}|`)) metAt.delete(k);
}
