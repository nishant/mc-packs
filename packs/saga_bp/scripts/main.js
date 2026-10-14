// Story Questlines: multi-chapter stories told by the townsfolk. This file wires the modules together:
// commands, script events, the loops and housekeeping.
//   data.js        saved progress, flags, requirements, which chapter is current
//   objectives.js  what counts for each objective type, scenes (characters, guards, escorts...)
//   actors.js      story characters and mobs the pack spawns, and their cleanup
//   places.js      story places, building their prefabs (prefabs.js), snapshots, the places menu
//   ui.js          offers, dialogues, hints, rewards, tracker, the story log menu
import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, Player, system, world } from "@minecraft/server";
import { ageAdds, expireAdds, sweep, tendActors } from "./actors.js";
import { calendar, entries, finished, flagOf, flush, flushAll, forget, installed, invalidate, markDirty, objKey, sagaOf, stateOf, storyById } from "./data.js";
import {
  beginRun,
  bountySlain,
  bump,
  championSlain,
  expireRaces,
  ageDefenses,
  isBountyTag,
  onBountyTargets,
  onMapLeg,
  racesForget,
  isChampionTag,
  endScenesOf,
  holdUntil,
  TRACKER_STEADY,
  loadWeather,
  moonState,
  open,
  playerGone,
  questDone,
  resolveAnswer,
  skyEvent,
  skyHousekeeping,
  sweepChampions,
  talked,
  tickPlayer,
} from "./objectives.js";
import { autoTick, campUpkeep, listPlaces, placeLabel, placesMenu, placesOf, placesReadyAll, setHere } from "./places.js";
import { get, getFor } from "./settings.js";
import { initFar } from "./scale.js";
import { PLACES, STORIES } from "./stories.js";
import { FAVORS, WANDERERS, WANDER_TEMPLATES } from "./stories/index.js";
import { choose, currentPage, hintOps, missingPlaces, offersAt, resetPlayer, showMenu, tidyFavors, resendTracks, sendTrack, track, wanderAuto } from "./ui.js";
import { onWanderGone, onWanderSpawn, onWanderTurn, sendWanderState, wanderForget, wanderHousekeeping, wanderJoined, wanderPing } from "./wander.js";
import { PACK, busy, online, send } from "./util.js";

const LOOP_TICKS = 20; // the player loop runs once a second
const TRACKER_RUNS = 2; // the tracker every 2 runs
const SAVE_RUNS = 5; // unsaved progress is written every 5 seconds
const PACK_SCAN_TICKS = 40; // installed packs: answers to realm:help_ping are collected for 2 seconds
const PACK_SCAN_EVERY = 12000; // ...every 10 minutes

// ---------------------------------------------------------------------------
// The player loop
// ---------------------------------------------------------------------------

let runs = 0;
system.runInterval(() => {
  runs++;
  try {
    if (runs % SAVE_RUNS === 0) flushAll();
    tendActors();
    if (runs % 2 === 0) autoTick();
    if (runs % 60 === 0) expireAdds();
    if (runs % 5 === 0) for (const p of world.getAllPlayers()) sendSeals(p);
    if (runs % 5 === 2) for (const p of world.getAllPlayers()) {
      sendFlags(p);
      sendProgress(p);
    }
    if (runs % 5 === 3) for (const p of world.getAllPlayers()) sendWanderState(p);
    if (runs % 60 === 30) campUpkeep(Number(get("campDays")) || 7);
    skyHousekeeping();
  } catch (e) {
    console.warn(`[saga] ${e}`);
  }
  if (get("enabled") !== true) return;
  beginRun();
  const tracking = runs % TRACKER_RUNS === 0;
  for (const player of world.getAllPlayers()) {
    try {
      wanderHousekeeping(player);
      wanderAuto(player);
      const list = entries(player);
      if (!list.length) {
        if (tracking) sendTrack(player, undefined);
        continue;
      }
      const saga = sagaOf(player);
      if (runs % 5 === 0) for (const e of list) for (const name of missingPlaces(e, saga)) hintOps(player, name, e.story);
      tickPlayer(player, list);
      if (tracking) track(player, list, getFor(player, "tracker") === true && !busy.has(player.id));
    } catch (e) {
      console.warn(`[saga] ${e}`);
    }
  }
}, LOOP_TICKS);

// ---------------------------------------------------------------------------
// Seals for the Relics pack's Lantern Shard: the seal places each player still has to relight
// ---------------------------------------------------------------------------

/** Seal place -> the Act IV chapter that relights it. */
const SEALS = [
  ["seal_tide", "tide_echo"],
  ["seal_stone", "stone_light"],
  ["seal_sky", "sky_vision"],
];
/** What each player was last sent. @type {Map<string, string>} */
const sealsSent = new Map();

/** Sends `realm:seals` for a player when it changed (or always with `force`). @param {Player} player @param {boolean} [force] */
function sendSeals(player, force = false) {
  const st = sagaOf(player).s.act4_seals;
  const all = placesOf();
  const seals = SEALS.filter(([place, chapter]) => all[place] && !st?.fin && !st?.dn.includes(chapter)).map(([place]) => {
    const p = all[place];
    return { name: placeLabel(place), dim: p.dim, x: p.x, z: p.z }; // the Lantern Shard shows the name
  });
  const json = JSON.stringify(seals);
  if (!force && sealsSent.get(player.id) === json) return;
  sealsSent.set(player.id, json);
  send("realm:seals", { player: player.id, seals });
}

// ---------------------------------------------------------------------------
// Townsfolk (Hearth & Hearsay): the story flags they react to, affinity and the calendar back
// ---------------------------------------------------------------------------

/** The flags `realm:npc_flags` sends: player-wide, other stories' (as `<story>.<flag>`) and `fin:<story>` = "1". */
const NPC_FLAGS = {
  g: ["ending", "hollis", "quill", "vesna", "fen", "allies", "mercy", "iron", "gull"],
  story: [
    "drowned_bell.bell",
    "act1_signs.act1:path",
    "act3_deep.elsie",
    "act3_deep.keys",
    "act4_seals.act4:promise",
    "mayors_burden.plaque",
    "hollis_faith.forgive",
    "wardens_oath.oath",
    "singing_forge.blade",
    "smugglers_run.profits",
    "hearth_and_table.marty",
    "graveyard_shift.stone",
    "lost_lambs.cat",
    "inn_ghost.lily",
    "edges_of_map.wonder",
  ],
  fin: [
    "drowned_bell",
    "last_map",
    "act1_signs",
    "act2_choir",
    "act3_deep",
    "act4_seals",
    "act5_lantern",
    "one_that_got_away",
    "hatchlings",
    "lost_lambs",
    "edges_of_map",
    "singing_forge",
    "smugglers_run",
    "hearth_and_table",
    "listening_deep",
    "graveyard_shift",
    "mayors_burden",
    "hollis_faith",
  ],
};
/** What each player was last sent. @type {Map<string, string>} */
const flagsSent = new Map();

/** Sends `realm:npc_flags` for a player when the flags changed (on join within 5 seconds). Only set flags go. @param {Player} player */
function sendFlags(player) {
  const saga = sagaOf(player);
  /** @type {Record<string, string>} */
  const flags = {};
  for (const k of NPC_FLAGS.g) {
    const v = saga.g?.[k];
    if (v !== undefined) flags[`g:${k}`] = v;
  }
  for (const k of NPC_FLAGS.story) {
    const v = flagOf(saga, "", k);
    if (v !== undefined) flags[k] = v;
  }
  for (const id of NPC_FLAGS.fin) {
    const story = storyById.get(id);
    if (story && finished(saga, story)) flags[`fin:${id}`] = "1";
  }
  const json = JSON.stringify(flags);
  if (flagsSent.get(player.id) === json) return;
  flagsSent.set(player.id, json);
  send("realm:npc_flags", { player: player.id, flags });
}

/** Main acts a player has finished, last sent (realm:saga_progress, for Atlas of the Realm's tablets). @type {Map<string, number>} */
const progressSent = new Map();
const MAIN_ACTS = ["act1_signs", "act2_choir", "act3_deep", "act4_seals", "act5_lantern"];

/** Sends `realm:saga_progress` { player, act } (0-5: main acts finished, in order) when it changed. @param {Player} player */
function sendProgress(player) {
  const saga = sagaOf(player);
  let act = 0;
  for (const id of MAIN_ACTS) {
    const story = storyById.get(id);
    if (!story || !finished(saga, story)) break;
    act++;
  }
  if (progressSent.get(player.id) === act) return;
  progressSent.set(player.id, act);
  send("realm:saga_progress", { player: player.id, act });
}

/** realm:affinity from Townsfolk: `g:aff_<npc>` = the level (0-4), saved, for heart stories. @param {any} msg */
function onAffinity(msg) {
  const player = typeof msg.player === "string" ? online(msg.player) : undefined;
  if (!player) return;
  const saga = sagaOf(player);
  /** @type {[string, unknown][]} */
  const pairs = msg.all && typeof msg.all === "object" ? Object.entries(msg.all) : typeof msg.npc === "string" ? [[msg.npc, msg.level]] : [];
  let changed = false;
  for (const [npc, level] of pairs) {
    if (!/^[a-z0-9_]{1,24}$/.test(npc) || typeof level !== "number" || !Number.isFinite(level)) continue;
    const v = String(Math.max(0, Math.min(4, Math.floor(level))));
    if ((saga.g ??= {})[`aff_${npc}`] === v) continue;
    saga.g[`aff_${npc}`] = v;
    changed = true;
  }
  if (!changed) return;
  invalidate(player.id);
  markDirty(player);
}

/**
 * realm:calling from Skills: `g:calling_ready` = "1" once the player's skills add up to the Calling level (saved, it
 * never goes back), `g:calling` = the Calling id or "none" (saved), for *The Calling*. @param {any} msg
 */
function onCalling(msg) {
  const player = typeof msg.player === "string" ? online(msg.player) : undefined;
  if (!player) return;
  const saga = sagaOf(player);
  saga.g ??= {};
  let changed = false;
  if (msg.ready === true && saga.g.calling_ready !== "1") {
    saga.g.calling_ready = "1";
    changed = true;
  }
  const calling = typeof msg.calling === "string" && /^[a-z_]{1,24}$/.test(msg.calling) ? msg.calling : "none";
  if (saga.g.calling !== calling && (calling !== "none" || saga.g.calling !== undefined || msg.ready === true)) {
    saga.g.calling = calling;
    changed = true;
  }
  if (!changed) return;
  invalidate(player.id);
  markDirty(player);
}

/** realm:calendar: the live `cal:` flags. @param {any} msg */
function onCalendar(msg) {
  if (typeof msg.day !== "number" || !Number.isFinite(msg.day)) return;
  calendar.day = String(Math.floor(msg.day));
  calendar.season = typeof msg.season === "string" ? msg.season.slice(0, 32) : undefined;
  calendar.festival = typeof msg.festival === "string" && msg.festival ? msg.festival.slice(0, 32) : undefined;
  for (const p of world.getAllPlayers()) invalidate(p.id);
}

// ---------------------------------------------------------------------------
// Installed packs, for `pack:<folder>` flags: the same ping /realm:help uses
// ---------------------------------------------------------------------------

/** The answers of the scan in progress. @type {Set<string> | undefined} */
let scanAnswers;

/** Asks every pack to answer realm:help_ping; after 2 seconds the answers are the installed packs. */
function scanPacks() {
  const answers = new Set([PACK]);
  scanAnswers = answers;
  try {
    system.sendScriptEvent("realm:help_ping", "");
  } catch (e) {
    console.warn(`[saga] help_ping: ${e}`);
  }
  system.runTimeout(() => {
    if (scanAnswers !== answers) return;
    scanAnswers = undefined;
    installed.set = answers;
    installed.ready = true;
  }, PACK_SCAN_TICKS);
}

/** realm:help_pong: a pack's folder name (any time: a pack that answers someone else's ping counts at once). @param {string} folder */
function onPong(folder) {
  if (!/^[a-z0-9_]{1,40}$/.test(folder)) return;
  scanAnswers?.add(folder);
  installed.set.add(folder);
}

system.runInterval(scanPacks, PACK_SCAN_EVERY);

// ---------------------------------------------------------------------------
// Townsfolk: offers, talk and deliver objectives
// ---------------------------------------------------------------------------

/** realm:npc_talk: count talk and deliver objectives, then answer with our offers. @param {any} msg */
function onTalk(msg) {
  if (typeof msg.player !== "string" || typeof msg.npc !== "string") return;
  if (get("enabled") !== true) return;
  const player = online(msg.player);
  if (!player) return;
  talked(player, msg.npc);
  if (typeof msg.req !== "string") return;
  tidyFavors(player);
  for (const o of offersAt(player, msg.npc)) send("realm:npc_offer", { req: msg.req, pack: PACK, key: o.key, label: o.label, order: o.order });
}

/** realm:npc_choose: the player picked one of our offers. @param {any} msg */
function onChoose(msg) {
  if (msg.pack !== PACK || typeof msg.player !== "string" || typeof msg.key !== "string") return;
  const player = online(msg.player);
  if (player) choose(player, msg.key).catch((e) => console.warn(`[saga] ${e}`));
}

/**
 * realm:saga_debug (operators and test scenarios; /scriptevent needs operator rights):
 * `{ player, action: "answer", text }` answers the player's first open riddle, `{ player, action: "finish", story, flags? }`
 * marks a whole story finished, `{ player, action: "places" }` tells the player every saved place, `{ player, action: "state" }`
 * prints their saved progress to the content log, `{ player, action: "wander_finish" }` finishes their stranger's one-off,
 * `{ player, action: "race_expire" }` ends their running races now (lost, unless the target falls first),
 * `{ player, action: "age_adds", seconds? }` makes every story monster and the player's running defenses `seconds` (600)
 * older, and runs the 10-minute story monster expiry 2 seconds later.
 * @param {any} msg
 */
function onDebug(msg) {
  const player = typeof msg.player === "string" ? online(msg.player) ?? world.getAllPlayers().find((p) => p.name === msg.player) : undefined;
  if (!player) return;
  if (msg.action === "answer" && typeof msg.text === "string") {
    const [hit] = open(player, "answer");
    if (hit) resolveAnswer(player, hit.e, hit.i, msg.text);
  } else if (msg.action === "jump" && typeof msg.story === "string" && typeof msg.chapter === "string") {
    // Every chapter before `chapter` counts as finished; that chapter is offered next.
    const story = storyById.get(msg.story);
    const k = story ? story.chapters.findIndex((c) => c.id === msg.chapter) : -1;
    if (!story || k < 0) return;
    endScenesOf(player.id);
    const st = stateOf(sagaOf(player), story);
    st.dn = story.chapters.slice(0, k).map((c) => c.id);
    st.a = 0;
    delete st.cur;
    delete st.o;
    delete st.x;
    delete st.fin;
    debugFlags(player, st, msg.flags);
    invalidate(player.id);
    markDirty(player, true);
  } else if (msg.action === "finish" && typeof msg.story === "string") {
    // Marks a whole story finished (to test what it unlocks).
    const story = storyById.get(msg.story);
    if (!story) return;
    endScenesOf(player.id);
    const st = stateOf(sagaOf(player), story);
    st.dn = story.chapters.map((c) => c.id);
    st.a = 0;
    delete st.cur;
    delete st.o;
    delete st.x;
    st.fin = Date.now();
    debugFlags(player, st, msg.flags);
    invalidate(player.id);
    markDirty(player, true);
  } else if (msg.action === "wander_finish") {
    // Every step of the player's stranger's one-off (or fight) done.
    const e = entries(player).find((x) => x.wv);
    if (e) e.chapter.objectives.forEach((o, i) => bump(player, e, i, 1e9));
  } else if (msg.action === "race_expire") {
    expireRaces(player);
  } else if (msg.action === "age_adds") {
    const ticks = Math.max(0, Math.floor(Number(msg.seconds ?? 600) * 20)) || 0;
    ageAdds(ticks);
    ageDefenses(player.id, ticks);
    system.runTimeout(expireAdds, 40);
  } else if (msg.action === "places") {
    player.sendMessage(`[saga places] ${JSON.stringify(placesOf())}`);
  } else if (msg.action === "state") {
    console.warn(`[saga] state of ${player.name}: ${JSON.stringify(sagaOf(player))}`);
    for (const e of entries(player)) console.warn(`[saga] entry ${e.story.id}/${e.chapter.id} o=${JSON.stringify(e.st.o)} keys=${e.chapter.objectives.map((_, i) => objKey(e, i)).join(",")}`);
  }
}

/** A debug action's flags: `g:<name>` player-wide, the rest the story's own. @param {Player} player @param {import("./data.js").StoryState} st @param {unknown} flags */
function debugFlags(player, st, flags) {
  if (!flags || typeof flags !== "object") return;
  const saga = sagaOf(player);
  for (const [k, v] of Object.entries(flags)) {
    if (k.startsWith("g:")) (saga.g ??= {})[k.slice(2)] = String(v);
    else st.f[k] = String(v);
  }
}

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message, sourceEntity }) => {
    if (id === "realm:seals_ping") {
      for (const p of world.getAllPlayers()) sendSeals(p, true);
      return;
    }
    if (id === "realm:help_pong") {
      onPong(message);
      return;
    }
    if (id === "realm:npc_flags_ping") {
      flagsSent.clear(); // sent again within 5 seconds
      return;
    }
    if (id === "realm:saga_progress_ping") {
      progressSent.clear(); // sent again within 5 seconds
      return;
    }
    if (id === "realm:wander_ping") {
      wanderPing(); // sent again within 5 seconds
      return;
    }
    if (id === "realm:place_ping") {
      placesReadyAll();
      return;
    }
    if (id === "realm:track_ping") {
      try {
        const msg = JSON.parse(message);
        resendTracks(typeof msg?.player === "string" ? msg.player : undefined);
      } catch {
        // not ours
      }
      return;
    }
    if (id === "realm:wander_spawn" || id === "realm:wander_turn" || id === "realm:wander_gone") {
      try {
        const msg = JSON.parse(message);
        if (msg && typeof msg === "object" && get("enabled") === true) (id === "realm:wander_spawn" ? onWanderSpawn : id === "realm:wander_turn" ? onWanderTurn : onWanderGone)(msg);
      } catch (e) {
        console.warn(`[saga] ${id}: ${e}`);
      }
      return;
    }
    if (id === "realm:bounty_targets" || id === "realm:map_leg") {
      try {
        const msg = JSON.parse(message);
        if (msg && typeof msg === "object") (id === "realm:bounty_targets" ? onBountyTargets : onMapLeg)(msg);
      } catch {
        // not ours to fix
      }
      return;
    }
    if (id === "realm:affinity" || id === "realm:calendar" || id === "realm:calling") {
      try {
        const msg = JSON.parse(message);
        if (msg && typeof msg === "object") (id === "realm:affinity" ? onAffinity : id === "realm:calling" ? onCalling : onCalendar)(msg);
      } catch {
        // not ours to fix
      }
      return;
    }
    if (
      id !== "realm:npc_talk" &&
      id !== "realm:npc_choose" &&
      id !== "realm:champion_slain" &&
      id !== "realm:actionbar" &&
      id !== "realm:saga_debug" &&
      id !== "realm:sky_event" &&
      id !== "realm:moon" &&
      id !== "realm:quest_done"
    )
      return;
    /** @type {any} */
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    try {
      if (id === "realm:actionbar") {
        // Another pack's note: the tracker waits. Not for a `background` line (the Party HUD) or a lower steady line
        // (`steady` below the tracker's, or equal from a pack named after ours): those wait for the tracker instead.
        const lower = msg.background === true || (Number.isFinite(msg.steady) && (msg.steady < TRACKER_STEADY || (msg.steady === TRACKER_STEADY && String(msg.from) > PACK)));
        if (msg.from !== PACK && !lower && typeof msg.player === "string" && typeof msg.ticks === "number" && msg.ticks > 0) {
          const until = system.currentTick + Math.min(200, msg.ticks);
          if (until > (holdUntil.get(msg.player) ?? 0)) holdUntil.set(msg.player, until);
        }
      } else if (id === "realm:npc_talk") onTalk(msg);
      else if (id === "realm:sky_event") {
        if (get("enabled") === true) skyEvent(msg);
      } else if (id === "realm:moon") moonState(msg);
      else if (id === "realm:quest_done") {
        if (get("enabled") === true) questDone(msg);
      }
      else if (id === "realm:npc_choose") onChoose(msg);
      else if (id === "realm:saga_debug") {
        if (!(sourceEntity instanceof Player) || sourceEntity.commandPermissionLevel >= CommandPermissionLevel.GameDirectors) onDebug(msg);
      } else if (typeof msg.tag === "string" && (isChampionTag(msg.tag) || isBountyTag(msg.tag))) {
        const ids = [msg.player, ...(Array.isArray(msg.helpers) ? msg.helpers : [])].filter((x) => typeof x === "string");
        const at = [msg.x, msg.y, msg.z].every((n) => typeof n === "number") ? { x: msg.x, y: msg.y, z: msg.z } : undefined;
        if (isBountyTag(msg.tag)) {
          // A Bounty Board target with no player to thank (lava, a fall) ends no race.
          if (get("enabled") === true && typeof msg.player === "string") bountySlain(msg.tag, ids, at, typeof msg.dim === "string" ? msg.dim : undefined);
        } else championSlain(msg.tag, ids, at, typeof msg.dim === "string" ? msg.dim : undefined);
      }
    } catch (e) {
      console.warn(`[saga] ${id}: ${e}`);
    }
  },
  { namespaces: ["realm"] },
);

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const PLACE_NAMES = Object.keys(PLACES);

/**
 * Runs `fn` with the player who ran the command, outside the read-only command context.
 * @param {import("@minecraft/server").CustomCommandOrigin} origin @param {(player: Player) => unknown} fn
 * @returns {import("@minecraft/server").CustomCommandResult}
 */
function withPlayer(origin, fn) {
  const player = origin.initiator ?? origin.sourceEntity;
  if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
  system.run(() => {
    try {
      const r = fn(player);
      if (r instanceof Promise) r.catch((e) => console.warn(`[saga] ${e}`));
    } catch (e) {
      console.warn(`[saga] ${e}`);
    }
  });
  return { status: CustomCommandStatus.Success };
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerEnum("realm:saga_place_name", PLACE_NAMES);
  customCommandRegistry.registerCommand(
    { name: "realm:saga", description: "Story Questlines: your story log (quests, hints, codex, daily favors)", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => withPlayer(origin, showMenu),
  );
  customCommandRegistry.registerCommand(
    { name: "realm:saga_log", description: "Story Questlines: your current quests and what to do next", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => withPlayer(origin, currentPage),
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:saga_place",
      description: "Story Questlines (operators): set a story place where you stand, or list them",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      optionalParameters: [{ name: "realm:saga_place_name", type: CustomCommandParamType.Enum }],
    },
    (origin, name) =>
      withPlayer(origin, (player) => {
        if (typeof name !== "string" || !name) return listPlaces(player);
        try {
          setHere(player, name);
        } catch (e) {
          console.warn(`[saga] place: ${e}`);
          player.sendMessage("§c[Story] Couldn't save the place.");
        }
      }),
  );
  customCommandRegistry.registerCommand(
    { name: "realm:saga_places", description: "Story Questlines (operators): every story place: set, build with a preview, remove, relocate", permissionLevel: CommandPermissionLevel.GameDirectors, cheatsRequired: false },
    (origin) => withPlayer(origin, placesMenu),
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:saga_reset",
      description: "Story Questlines (operators): reset a player's stories, choices and progress",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "player", type: CustomCommandParamType.PlayerSelector }],
    },
    (origin, targets) => {
      const list = Array.isArray(targets) ? targets.filter((t) => t instanceof Player) : [];
      if (!list.length) return { status: CustomCommandStatus.Failure, message: "No player matched." };
      const by = origin.initiator ?? origin.sourceEntity;
      system.run(() => {
        for (const p of list) {
          try {
            resetPlayer(p, by instanceof Player ? by : undefined);
          } catch (e) {
            console.warn(`[saga] reset: ${e}`);
          }
        }
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

world.afterEvents.worldLoad.subscribe(() => {
  initFar(STORIES, FAVORS, WANDERERS, WANDER_TEMPLATES);
  loadWeather();
  // Story characters and champions don't outlive a restart: scenes spawn new ones when needed.
  sweep();
  sweepChampions();
  checkStories();
  system.runTimeout(scanPacks, 60);
  system.runTimeout(() => send("realm:calendar_ping", {}), 80); // the calendar's live flags, if Townsfolk (or Realm Calendar) is here
  system.runTimeout(() => send("realm:calling_ping", {}), 90); // Callings (Skills), for The Calling
  system.runTimeout(() => {
    for (const p of world.getAllPlayers()) sendSeals(p, true);
  }, 100);
  system.runTimeout(placesReadyAll, 110); // places (and wanderers' camps) for the wanderer pack
  system.runTimeout(() => {
    // Rook's races: today's bounty targets and every treasure hunt's leg.
    send("realm:bounty_targets_ping", {});
    send("realm:map_leg_ping", {});
  }, 120);
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  system.run(() => {
    try {
      if (player.isValid) wanderJoined(player);
    } catch (e) {
      console.warn(`[saga] ${e}`);
    }
  });
});

world.beforeEvents.playerLeave.subscribe(({ player }) => {
  try {
    flush(player.id);
  } catch {
    // saved every few seconds anyway
  }
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  playerGone(playerId);
  sealsSent.delete(playerId);
  flagsSent.delete(playerId);
  progressSent.delete(playerId);
  wanderForget(playerId);
  racesForget(playerId);
  forget(playerId);
  busy.delete(playerId);
});

/** Warns in the content log about mistakes in the stories, once at start (tools/check-stories.mjs checks more). */
function checkStories() {
  const ids = new Set();
  for (const s of STORIES) {
    if (ids.has(s.id)) console.warn(`[saga] story id "${s.id}" is used twice`);
    ids.add(s.id);
    const chapterIds = new Set();
    for (const c of s.chapters) {
      if (chapterIds.has(c.id)) console.warn(`[saga] ${s.id} has chapter id "${c.id}" twice`);
      chapterIds.add(c.id);
      for (const o of c.objectives) {
        if (o.place && !PLACES[o.place] && !o.place.startsWith("camp:")) console.warn(`[saga] ${s.id}/${c.id} uses place "${o.place}", which isn't in PLACES`);
        if (o.champion && !/^realm:[\w:.-]{1,60}$/.test(o.champion.tag)) console.warn(`[saga] ${s.id}/${c.id}: champion tag "${o.champion.tag}" must start with "realm:"`);
      }
    }
  }
  if (!storyById.size) console.warn("[saga] no stories");
}

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "saga_bp");
  },
  { namespaces: ["realm"] },
);
