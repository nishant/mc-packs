import "./diag.js";
import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  DisplaySlotId,
  ObjectiveSortOrder,
  Player,
  ScoreboardIdentityType,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get, getFor, onChange, OPTIONS, set, setFor } from "./settings.js";
import { COLORS, STATS } from "./stats.js";
import { onScriptEvent } from "./script-events.js";

/** @typedef {import("@minecraft/server").ScoreboardObjective} ScoreboardObjective */
/** @typedef {(typeof STATS)[number]} Stat */
/** @typedef {(typeof OPTIONS)[number]} Option */

const PROP_FIRST_JOIN = "stats:firstJoin"; // player: epoch ms

/** @param {string} id @returns {ScoreboardObjective} */
function objective(id) {
  const stat = STATS.find((s) => s.id === id);
  const objId = `stats_${id}`;
  return world.scoreboard.getObjective(objId) ?? world.scoreboard.addObjective(objId, stat?.sidebar ?? id);
}

/**
 * Scores are kept under the player's *name* (a "fake player" participant)
 * rather than the player entity. Bedrock shows offline entity participants as
 * "Player Offline", so this way leaderboards and the sidebar keep real names.
 * @param {Player} player @param {string} id @param {number} [n]
 */
function add(player, id, n = 1) {
  if (n <= 0 || !player.isValid) return;
  try {
    objective(id).addScore(player.name, n);
  } catch (e) {
    console.warn(`[stats] ${id}: ${e}`);
  }
}

/**
 * A player's score on a stat, 0 if they have none. getScore throws "Failed to resolve identity" for a name
 * with no score on any objective yet (stats_bp added while they were online).
 * @param {string} id @param {string} name
 */
function scoreOf(id, name) {
  try {
    return objective(id).getScore(name) ?? 0;
  } catch {
    return 0;
  }
}

/** Moves scores stored on the player entity (pack v1.0.0) to their name. @param {Player} player */
function migrateEntityScores(player) {
  if (!player.scoreboardIdentity) return; // a new player has no entity scores to move
  for (const stat of STATS) {
    const obj = objective(stat.id);
    let old;
    try {
      old = obj.getScore(player);
    } catch {
      continue; // no score on this one
    }
    if (old === undefined) continue;
    obj.addScore(player.name, old);
    obj.removeParticipant(player);
  }
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

/**
 * Sub-unit progress kept in memory between ticks (seconds, fractional blocks).
 * @type {Map<string, { seconds: number, travelled: number, flown: number, last?: { x: number, y: number, z: number, dim: string } }>}
 */
const pending = new Map();
world.afterEvents.playerLeave.subscribe(({ playerId }) => pending.delete(playerId));

world.afterEvents.playerBreakBlock.subscribe(({ player }) => add(player, "mined"));
world.afterEvents.playerPlaceBlock.subscribe(({ player }) => add(player, "placed"));

world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  const killer = damageSource.damagingEntity;
  if (deadEntity instanceof Player) {
    add(deadEntity, "deaths");
    if (killer instanceof Player && killer.id !== deadEntity.id) add(killer, "pvpkills");
  } else if (killer instanceof Player) {
    add(killer, "mobkills");
  }
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  // Spawning (joining or respawning) moves the player without travelling.
  const p = pending.get(player.id);
  if (p) p.last = undefined;

  if (!initialSpawn) return;
  try {
    migrateEntityScores(player);
  } catch (e) {
    console.warn(`[stats] migrate: ${e}`);
  }
  add(player, "joins");
  if (player.getDynamicProperty(PROP_FIRST_JOIN) === undefined) {
    player.setDynamicProperty(PROP_FIRST_JOIN, Date.now());
  }
});

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    try {
      let p = pending.get(player.id);
      if (!p) pending.set(player.id, (p = { seconds: 0, travelled: 0, flown: 0 }));

      const afk = !!CONFIG.afkTag && player.hasTag(CONFIG.afkTag);
      if (!afk) {
        if (++p.seconds >= 60) {
          p.seconds -= 60;
          add(player, "playtime");
        }
      }

      const loc = player.location;
      const dim = player.dimension.id;
      // AFK players carried by water or a minecart loop don't climb the distance boards.
      if (!afk && p.last && p.last.dim === dim) {
        const d = Math.hypot(loc.x - p.last.x, loc.y - p.last.y, loc.z - p.last.z);
        if (d <= CONFIG.maxSpeed) {
          const key = player.isGliding ? "flown" : "travelled";
          p[key] += d;
          const whole = Math.floor(p[key]);
          if (whole > 0) {
            p[key] -= whole;
            add(player, key, whole);
          }
        }
      }
      p.last = { x: loc.x, y: loc.y, z: loc.z, dim };
    } catch (e) {
      console.warn(`[stats] ${e}`);
    }
  }
}, 20);

// ---------------------------------------------------------------------------
// Sidebar (one for the whole world: Bedrock has no per-player sidebar)
// ---------------------------------------------------------------------------

/** @param {string} id */
function showOnSidebar(id) {
  world.scoreboard.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, {
    objective: objective(id),
    sortOrder: ObjectiveSortOrder.Descending,
  });
}

/** The stats the sidebar rotates through. */
const sidebarStats = () => STATS.filter((s) => get(`sidebarShows.${s.id}`) === true);

let cycleIndex = 0;
let cycleSeconds = 0;
// Counts seconds rather than scheduling every sidebarCycleSeconds, so a change in /realm:config applies at once.
system.runInterval(() => {
  try {
    if (get("sidebar") !== "cycle") return;
    if (++cycleSeconds < get("sidebarCycleSeconds")) return;
    cycleSeconds = 0;
    const list = sidebarStats();
    if (!list.length) return;
    cycleIndex = (cycleIndex + 1) % list.length;
    showOnSidebar(list[cycleIndex].id);
  } catch (e) {
    console.warn(`[stats] sidebar: ${e}`);
  }
}, 20);

/** Shows what the "sidebar" setting says, right away. */
function applySidebar() {
  const choice = get("sidebar");
  cycleSeconds = 0;
  cycleIndex = 0;
  if (choice === "off") world.scoreboard.clearObjectiveAtDisplaySlot(DisplaySlotId.Sidebar);
  else if (choice === "cycle") {
    const first = sidebarStats()[0];
    if (first) showOnSidebar(first.id);
  } else showOnSidebar(choice);
}

// ---------------------------------------------------------------------------
// Stats ticker: each player's own stats above the hotbar
// ---------------------------------------------------------------------------

/**
 * Send an unchanged ticker again after this many ticks, so the action bar doesn't fade. A number that changed on the
 * same stat waits for this too (shown within 2 seconds); a new stat, a setting change or the end of another pack's
 * note draws at once. Writing the bar is the ticker's biggest cost, so it writes only this often.
 */
const REFRESH_TICKS = 40;
/** Players are spread over the second: each is handled once every 20 ticks, in one of 4 groups 5 ticks apart. */
const TICKER_GROUPS = 4;
const TICKER_STEP = 20 / TICKER_GROUPS;
/**
 * How long a stat's ranking (every name's score, read from the board) is reused for the ticker's "#2 of 9": the
 * player's own score is read live and placed against it, so their own rank moves at once and only the others' scores
 * can be up to 5 seconds old. Reading a board reads every name on it (everyone who ever played).
 */
const RANK_TICKS = 100;

/**
 * Per player: the stat it's on, seconds on it, what was last drawn (and for which stat, `head`), when, and where
 * ("bar" = the action bar, "hud" = a line under the Coordinates HUD, which owns the bar while it's on).
 * @type {Map<string, { index: number, seconds: number, text: string, head?: string, at: number, via?: "bar" | "hud" }>}
 */
const tickers = new Map();
/** player id -> its ticker group (0 to TICKER_GROUPS - 1), from a hash of the id so it never shifts as players come and go. */
const tickerGroups = new Map();
/** @param {string} id */
function groupOf(id) {
  let g = tickerGroups.get(id);
  if (g === undefined) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    tickerGroups.set(id, (g = (h >>> 0) % TICKER_GROUPS));
  }
  return g;
}
/**
 * The players in each ticker group (id -> Player), kept up to date by playerSpawn and playerLeave, so a step handles
 * its own group without listing every player: listing them all 4 times a second cost more than the work it saved
 * (stats_bp 0.17-0.20 -> 0.22 ms a tick at 40 players). Rebuilt from the player list every ROSTER_TICKS anyway, in
 * case an event was missed.
 * @type {Map<string, Player>[]}
 */
const tickerRoster = Array.from({ length: TICKER_GROUPS }, () => new Map());
const ROSTER_TICKS = 100;
let rosterAt = -Infinity;
/** @param {number} now */
function rebuildRoster(now) {
  for (const group of tickerRoster) group.clear();
  for (const player of world.getAllPlayers()) {
    const id = player.id;
    tickerRoster[groupOf(id)].set(id, player);
  }
  rosterAt = now;
}
/** player id -> tick until which another pack's action bar message is left alone (realm:actionbar) */
const pausedUntil = new Map();
/** Players who see the Coordinates HUD, from its realm:hud_state, and when it last said so. */
let hudPlayers = new Set();
let hudHeard = -Infinity;
/** The HUD repeats its state every 5 seconds: after 10 without one, it's gone. */
const HUD_STALE_TICKS = 200;
const HUD_PART_TIMEOUT = 100;
/** The realm:hud_state list still arriving: one `seq`, its parts so far. @type {{ parts: number, seq: unknown, got: Map<number, string[]>, tick: number } | null} */
let hudAssembly = null;

/** Seq and tick of the last completed list: an older publication replayed late must not replace it. @type {{ seq: number, tick: number } | null} */
let hudDone = null;

/** Takes one realm:hud_state part; the player list is replaced only when every part of one publication is here. Malformed messages change nothing. @param {any} msg */
function takeHudState(msg) {
  if (!Array.isArray(msg.players)) return;
  const now = system.currentTick;
  const parts = msg.parts === undefined ? 1 : msg.parts;
  const part = msg.part === undefined ? 1 : msg.part;
  if (typeof parts !== "number" || typeof part !== "number" || !Number.isInteger(parts) || !Number.isInteger(part)) return;
  if (!(parts >= 1 && parts <= 1000 && part >= 1 && part <= parts)) return;
  const seq = typeof msg.seq === "number" && Number.isFinite(msg.seq) ? msg.seq : undefined;
  // Older than what is already whole (or arriving): a late replay. After HUD_STALE_TICKS a restarted HUD's low numbers are accepted again.
  if (seq !== undefined && hudDone && now - hudDone.tick <= HUD_STALE_TICKS && seq < hudDone.seq) return;
  const ids = msg.players.map(String);
  const finish = (/** @type {string[]} */ list) => {
    hudAssembly = null;
    hudPlayers = new Set(list);
    hudHeard = now;
    hudDone = seq === undefined ? null : { seq, tick: now };
  };
  if (parts === 1) return finish(ids);
  let a = hudAssembly;
  if (a && now - a.tick <= HUD_PART_TIMEOUT && typeof a.seq === "number" && seq !== undefined && seq < a.seq) return; // a late part of an older publication
  if (!a || a.parts !== parts || a.seq !== seq || now - a.tick > HUD_PART_TIMEOUT) a = hudAssembly = { parts, seq, got: new Map(), tick: now };
  a.got.set(part, ids);
  if (a.got.size < parts) return;
  finish([...a.got.values()].flat());
}

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  tickers.delete(playerId);
  pausedUntil.delete(playerId);
  tickerPrefs.delete(playerId);
  tickerRoster[groupOf(playerId)].delete(playerId);
  tickerGroups.delete(playerId);
});
// A joining player is in its group's next step (within a second), not only after the next roster rebuild.
world.afterEvents.playerSpawn.subscribe(({ player }) => {
  try {
    const id = player.id;
    tickerRoster[groupOf(id)].set(id, player);
  } catch (e) {
    console.warn(`[stats] ticker roster: ${e}`);
  }
});

/** @param {unknown} id */
const colorCode = (id) => COLORS.find((c) => c.id === id)?.code ?? "§f";

/** @param {Stat} stat @param {number} n */
const fmt = (stat, n) => (stat.format ? stat.format(n) : n.toLocaleString());

/**
 * Each player's ticker settings, read once and kept until one changes (onChange below): getFor reads and parses the
 * player's saved preferences on every call, and the ticker needed 15 of them per player each second (about 4 ms a
 * pass with 10 players).
 * @type {Map<string, { on: boolean, shown: Stat[], lc: string, vc: string, full: boolean, all: boolean, seconds: number }>}
 */
const tickerPrefs = new Map();

/** @param {Player} player @param {string} [id] the player's id, when the caller has it (one call into the game less) */
function prefsOf(player, id = player.id) {
  let p = tickerPrefs.get(id);
  if (!p) {
    tickerPrefs.set(
      id,
      (p = {
        on: get("tickerEnabled") === true && getFor(player, "ticker") === true,
        shown: STATS.filter((s) => getFor(player, `tickerShows.${s.id}`) === true),
        lc: colorCode(getFor(player, "tickerLabelColor")),
        vc: colorCode(getFor(player, "tickerValueColor")),
        full: getFor(player, "tickerStyle") === "full",
        all: getFor(player, "tickerMode") === "all",
        seconds: Number(getFor(player, "tickerSeconds")) || 5,
      })
    );
  }
  return p;
}

/**
 * Which stat the player's ticker is on, advancing to the next one when its time is up: a stat id, "all" (every
 * chosen stat on one line) or "" (none chosen: nothing to show). Reads no scores.
 * @param {Player} player @param {{ index: number, seconds: number }} t @param {string} [id]
 */
function tickerHead(player, t, id = player.id) {
  const { shown, all, seconds } = prefsOf(player, id);
  if (!shown.length) return "";
  if (all) return "all";
  if (t.seconds >= seconds) {
    t.seconds = 0;
    t.index++;
  }
  return shown[t.index % shown.length].id;
}

/**
 * The ticker's text for the stat `head` (from tickerHead). "" = nothing to show.
 * @param {Player} player @param {string} head @param {string} [id]
 */
function tickerText(player, head, id = player.id) {
  const { shown, lc, vc, full } = prefsOf(player, id);
  /** @param {Stat} stat */
  const one = (stat) => {
    const score = scoreOf(stat.id, player.name);
    if (!full) return `${lc}${stat.short} ${vc}${fmt(stat, score)}`;
    const { rank, of } = tickerPlace(stat.id, player.name, score);
    return `${lc}${stat.label} ${vc}${fmt(stat, score)}${rank > 0 ? ` ${lc}#${rank} of ${of}` : ""}`;
  };
  if (head === "all") return shown.map(one).join("§r   ");
  const stat = shown.find((st) => st.id === head);
  return stat ? one(stat) : "";
}

/**
 * The ticker's rankings, reused for RANK_TICKS: per stat, the scores above 0 from highest to lowest, and each name's
 * score in that list.
 * @type {Map<string, { tick: number, scores: number[], byName: Map<string, number> }>}
 */
const tickerBoards = new Map();

/**
 * Where `score` (the player's own, read now) places `name` on a stat's board: `rank` 1 = first (ties share a place),
 * 0 = not on it (a score of 0 or none); `of` = names on it. A binary search, never a walk of the board.
 * @param {string} id @param {string} name @param {number} score
 */
function tickerPlace(id, name, score) {
  const now = system.currentTick;
  let b = tickerBoards.get(id);
  if (!b || now - b.tick >= RANK_TICKS || now < b.tick) {
    const { list } = rankedInfo(id);
    /** @type {Map<string, number>} */
    const byName = new Map();
    for (const r of list) if (!byName.has(r.name)) byName.set(r.name, r.score);
    tickerBoards.set(id, (b = { tick: now, scores: list.map((r) => r.score), byName }));
  }
  const { scores, byName } = b;
  // How many saved scores are above `score` (scores run from highest to lowest).
  let lo = 0;
  let hi = scores.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (scores[mid] > score) lo = mid + 1;
    else hi = mid;
  }
  const saved = byName.get(name);
  const above = lo - (saved !== undefined && saved > score ? 1 : 0); // their own older entry is not someone else
  const of = scores.length - (saved !== undefined ? 1 : 0) + (score > 0 ? 1 : 0);
  return { rank: score > 0 ? above + 1 : 0, of };
}

/** @param {Player} player @param {string} [id] */
const tickerOn = (player, id = player.id) => prefsOf(player, id).on;

/** @param {string} playerId @param {string} text */
const toHud = (playerId, text) => system.sendScriptEvent("realm:hud_line", JSON.stringify({ player: playerId, key: "stats", text, ticks: 80 }));

/** Takes the ticker off the screen. @param {Player} player @param {{ text: string, via?: "bar" | "hud" }} t */
function clearTicker(player, t) {
  if (t.via === "hud") toHud(player.id, "");
  // Not while another pack's note is up (it goes away by itself): an empty bar would wipe it.
  else if (t.via === "bar" && t.text && (pausedUntil.get(player.id) ?? 0) <= system.currentTick) player.onScreenDisplay.setActionBar("");
}

system.runInterval(() => {
  const now = system.currentTick;
  const group = Math.floor(now / TICKER_STEP) % TICKER_GROUPS;
  const hudAlive = now - hudHeard < HUD_STALE_TICKS;
  if (now - rosterAt >= ROSTER_TICKS || now < rosterAt) rebuildRoster(now);
  const members = tickerRoster[group]; // the others' turns come in the other ticks of this second
  for (const [id, player] of members) {
    try {
      if (!player.isValid) {
        members.delete(id);
        continue;
      }
      let t = tickers.get(id);
      if (!tickerOn(player, id)) {
        if (t) {
          clearTicker(player, t);
          tickers.delete(id);
        }
        continue;
      }
      if (!t) tickers.set(id, (t = { index: 0, seconds: 0, text: "", at: -Infinity }));
      t.seconds++;
      /** @type {"bar" | "hud"} */
      const via = hudAlive && hudPlayers.has(id) ? "hud" : "bar";
      if (t.via === "hud" && via === "bar") toHud(id, ""); // the HUD went off: its line goes too
      if (via === "bar" && (pausedUntil.get(id) ?? 0) > now) continue; // another pack's message is on the bar
      const head = tickerHead(player, t, id);
      // The same stat in the same place, drawn less than REFRESH_TICKS ago: unchanged, or only its number moved,
      // which shows with the next refresh. Nothing is read or written for it this second.
      if (head === t.head && via === t.via && now - t.at < REFRESH_TICKS) continue;
      const text = head ? tickerText(player, head, id) : "";
      if (!text && !t.text) continue; // nothing to show, and nothing of ours to take off
      if (via === "hud") toHud(id, text);
      else player.onScreenDisplay.setActionBar(text);
      t.text = text;
      t.head = head;
      t.via = via;
      t.at = now;
    } catch (e) {
      console.warn(`[stats] ticker: ${e}`);
    }
  }
}, TICKER_STEP);

onScriptEvent(
  ["realm:actionbar", "realm:hud_state"],
  ({ id, message }) => {
    if (id !== "realm:actionbar" && id !== "realm:hud_state") return;
    try {
      const msg = JSON.parse(message);
      if (!msg || typeof msg !== "object") return;
      if (id === "realm:hud_state") {
        takeHudState(msg);
      } else if (typeof msg.player === "string") {
        // Another pack put a message on this player's bar (the Coordinates HUD does the same): wait, then redraw.
        const ticks = Math.min(Math.max(Number(msg.ticks) || 40, 0), 200);
        pausedUntil.set(msg.player, system.currentTick + ticks);
        const t = tickers.get(msg.player);
        if (t) t.at = -Infinity;
      }
    } catch {
      // not for us
    }
  },
);
// Ask the HUD who sees it, rather than wait up to 5 seconds for its next update.
world.afterEvents.worldLoad.subscribe(() => system.sendScriptEvent("realm:hud_ping", "{}"));

onChange((key, player) => {
  // First, so a sidebar that fails to apply can't leave the ticker on its old settings.
  if (player) tickerPrefs.delete(player.id);
  else tickerPrefs.clear();
  if (key === "*" || key === "sidebar" || key.startsWith("sidebarShows.")) {
    if (!player) applySidebar();
  }
  // A changed ticker setting shows on the next second, from the first chosen stat.
  for (const p of player ? [player] : world.getAllPlayers()) {
    const t = tickers.get(p.id);
    if (t) Object.assign(t, { index: 0, seconds: 0, at: -Infinity });
  }
});

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

/**
 * Shows a form, retrying while the client is busy (e.g. chat still closing).
 * @template {ActionFormData | ModalFormData} F
 * @param {Player} player @param {F} form
 * @returns {Promise<Awaited<ReturnType<F["show"]>> | undefined>}
 */
async function show(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = /** @type {any} */ (await form.show(player));
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await system.waitTicks(10);
  }
  return undefined;
}

/** @param {Player} player */
const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

/** @typedef {{ name: string, score: number }} Ranked a name on a stat's board and its score */

/**
 * Ranked lists worked out this tick: getScores() reads every participant, so the ticker ranks all players from one
 * read per stat a tick instead of one per player per stat. Each participant's name, score and type are read once
 * (every read is a call into the game), and `rank` finds a name's place without walking the list: on a big server the
 * boards hold everyone who ever played, and walking them for each ticker cost about 16 ms a second with 40 players
 * and 1,000 names.
 * `rank` is a name's index in the list; `place` its place (0 = first), shared by tied scores (the number of higher scores).
 * @type {Map<string, { tick: number, list: Ranked[], rank: Map<string, number>, place: Map<string, number> }>}
 */
const rankedCache = new Map();

/** @param {string} id */
function rankedInfo(id) {
  const now = system.currentTick;
  const cached = rankedCache.get(id);
  if (cached && cached.tick === now) return cached;
  /** @type {Ranked[]} */
  const list = [];
  for (const s of objective(id).getScores()) {
    const score = s.score;
    if (score <= 0) continue;
    const who = s.participant;
    // Skip entity participants: v1.0.0 scores not migrated yet (the player hasn't rejoined), shown as "Player Offline".
    if (who.type === ScoreboardIdentityType.Player) continue;
    list.push({ name: who.displayName, score });
  }
  list.sort((a, b) => b.score - a.score);
  /** @type {Map<string, number>} */
  const rank = new Map();
  /** @type {Map<string, number>} */
  const place = new Map();
  let first = 0; // index of the first entry with this entry's score: tied scores share a place, as on the ticker
  list.forEach((r, i) => {
    if (i > 0 && r.score !== list[i - 1].score) first = i;
    if (!rank.has(r.name)) {
      rank.set(r.name, i);
      place.set(r.name, first);
    }
  });
  const info = { tick: now, list, rank, place };
  rankedCache.set(id, info);
  return info;
}

/** @param {string} id */
const ranked = (id) => rankedInfo(id).list;

/**
 * A name's place on a stat's board (0 = first; tied scores share a place, as on the ticker), or -1 when it isn't on it.
 * @param {string} id @param {string} name
 */
const placeOf = (id, name) => rankedInfo(id).place.get(name) ?? -1;

/** @param {boolean} on */
const state = (on) => (on ? "Enabled" : "Disabled");

/** @param {Player} player */
async function mainMenu(player) {
  while (player.isValid) {
    const op = isOp(player);
    const tickerAllowed = get("tickerEnabled") === true;
    const form = new ActionFormData()
      .title("§lRealm Stats")
      .body("Your stats, the leaderboards, and the stats ticker: your own stats above the hotbar.")
      .button("My stats")
      .button("Leaderboards")
      .button(tickerAllowed ? `Stats ticker: ${state(getFor(player, "ticker") === true)}\n§8Tap to switch` : "Stats ticker\n§8Disabled on this realm")
      .button("My ticker settings\n§8Which stats, speed, colors");
    if (op) form.button("§4Sidebar (everyone)\n§8Operators");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
    if (res.selection === 0 && !(await myStats(player))) return;
    if (res.selection === 1 && !(await leaderboardMenu(player))) return;
    if (res.selection === 2) player.sendMessage(toggleTicker(player));
    if (res.selection === 3 && !(await optionsForm(player, "My ticker settings", tickerOptions(), player))) return;
    if (res.selection === 4 && isOp(player) && !(await optionsForm(player, "Sidebar (everyone)", sidebarOptions()))) return;
  }
}

/** The player's ticker preferences, the same ones as in /realm:prefs. */
const tickerOptions = () => OPTIONS.filter((o) => o.scope === "player");
/** The sidebar's world options, the same ones as in /realm:config. */
const sidebarOptions = () => OPTIONS.filter((o) => o.scope === "world" && o.key.startsWith("sidebar"));

/** @param {Player} player @returns {string} what happened, for chat */
function toggleTicker(player) {
  if (get("tickerEnabled") !== true) return "§7The stats ticker is disabled on this realm. An operator can enable it in /realm:config (Stats & Leaderboards).";
  const on = getFor(player, "ticker") !== true;
  const error = setFor(player, "ticker", on);
  if (error) return `§cStats ticker not changed: ${error}`;
  return on
    ? "Stats ticker: Enabled. Pick its stats, speed and colors in /realm:stats > My ticker settings or /realm:prefs."
    : "Stats ticker: Disabled.";
}

/**
 * A form of this pack's own settings, read and saved the same way as Realm Settings does (get/set, getFor/setFor),
 * so both always show the same values.
 * @param {Player} player @param {string} title @param {Option[]} options @param {Player} [forPlayer] player options: whose
 * @returns {Promise<boolean>} true = back to the menu
 */
async function optionsForm(player, title, options, forPlayer) {
  const value = (/** @type {Option} */ o) => (forPlayer ? getFor(forPlayer, o.key) : get(o.key));
  const form = new ModalFormData().title(title).submitButton("Save");
  /** @type {number[]} what each control showed, to leave untouched ones exactly as they were */
  const shown = [];
  for (const o of options) {
    const v = value(o);
    const tooltip = o.help;
    if (o.type === "bool") {
      form.toggle(o.label, { defaultValue: v === true, tooltip });
      shown.push(v === true ? 1 : 0);
    } else if (o.type === "enum") {
      const at = Math.max(0, (o.choices ?? []).indexOf(v));
      form.dropdown(o.label, (o.choices ?? []).map((c, i) => o.names?.[i] ?? c), { defaultValueIndex: at, tooltip });
      shown.push(at);
    } else {
      const n = Math.min(o.max ?? v, Math.max(o.min ?? v, Number(v) || 0));
      form.slider(o.label, o.min ?? 0, o.max ?? Math.max(1, n), { defaultValue: n, valueStep: o.step ?? 1, tooltip });
      shown.push(n);
    }
  }
  const res = await show(player, form);
  if (!res || !player.isValid) return false;
  if (res.canceled) return true;
  const values = res.formValues ?? [];
  /** @type {string[]} */
  const lines = [];
  options.forEach((o, i) => {
    const raw = values[i];
    if (raw === undefined || (o.type !== "bool" && raw === shown[i])) return;
    const next = o.type === "bool" ? raw === true : o.type === "enum" ? (o.choices ?? [])[Number(raw)] : Number(raw);
    const before = value(o);
    if (next === undefined || next === before) return;
    if (!forPlayer && !isOp(player)) return;
    const error = forPlayer ? setFor(forPlayer, o.key, next) : set(o.key, next);
    const name = (/** @type {unknown} */ x) => (o.type === "bool" ? state(x === true) : o.type === "enum" ? o.names?.[(o.choices ?? []).indexOf(String(x))] ?? String(x) : String(x));
    lines.push(error ? `§c- ${o.label}:§r not saved, ${error}` : `§a- ${o.label}:§r ${name(before)} -> §e${name(next)}`);
  });
  player.sendMessage(lines.length ? [`§l${title}§r`, ...lines].join("\n") : "§7No changes.");
  return true;
}

/** @param {Player} player @returns {Promise<boolean>} true = back to the menu */
async function myStats(player) {
  const lines = STATS.map((stat) => {
    const list = ranked(stat.id);
    const score = scoreOf(stat.id, player.name);
    const rank = placeOf(stat.id, player.name) + 1;
    return `§7${stat.label}:§r ${fmt(stat, score)}${rank > 0 ? ` §8(#${rank} of ${list.length})` : ""}`;
  });
  const first = player.getDynamicProperty(PROP_FIRST_JOIN);
  if (typeof first === "number") {
    lines.push("", `§7First joined:§r ${new Date(first).toISOString().slice(0, 10)}`);
  }

  const res = await show(
    player,
    new ActionFormData().title(`§l${player.name}`).body(lines.join("\n")).button("Leaderboards").button("Back")
  );
  if (!res || res.canceled) return false;
  if (res.selection === 0) return leaderboardMenu(player);
  return true;
}

/** @param {Player} player @returns {Promise<boolean>} true = back to the menu */
async function leaderboardMenu(player) {
  while (player.isValid) {
    const form = new ActionFormData().title("§lLeaderboards");
    for (const stat of STATS) form.button(stat.label);
    form.button("Back");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined) return false;
    if (res.selection >= STATS.length) return true;
    if (!(await leaderboard(player, STATS[res.selection]))) return false;
  }
  return false;
}

/** @param {Player} player @param {Stat} stat @returns {Promise<boolean>} true = back to the list */
async function leaderboard(player, stat) {
  const { list, rank } = rankedInfo(stat.id);
  const medals = ["§6§l1.§r", "§7§l2.§r", "§c§l3.§r"];
  const size = get("leaderboardSize");
  // Numbered by place: tied scores share a number, as in My stats and on the ticker.
  let n = 0;
  const lines = list.slice(0, size).map((s, i) => {
    if (i > 0 && s.score !== list[i - 1].score) n = i;
    const me = s.name === player.name;
    const place = medals[n] ?? `§8${n + 1}.`;
    return `${place} ${me ? "§b§l" : "§r"}${s.name}§r  ${fmt(stat, s.score)}`;
  });
  const myIndex = rank.get(player.name) ?? -1;
  if (myIndex >= size) {
    lines.push("§8...", `§8${placeOf(stat.id, player.name) + 1}. §b${player.name}§r  ${fmt(stat, list[myIndex].score)}`);
  }

  const res = await show(
    player,
    new ActionFormData()
      .title(`§l${stat.label}`)
      .body(lines.length ? lines.join("\n") : "§7Nobody yet.")
      .button("Back")
      .button("Close")
  );
  return !!res && !res.canceled && res.selection === 0;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** @param {import("@minecraft/server").CustomCommandOrigin} origin */
const playerOf = (origin) => {
  const p = origin.initiator ?? origin.sourceEntity;
  return p instanceof Player ? p : undefined;
};

/** @type {Set<string>} players with the menu open, so running the command again doesn't stack another */
const open = new Set();
world.afterEvents.playerLeave.subscribe(({ playerId }) => open.delete(playerId));

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerEnum("realm:sidebar_stat", [...STATS.map((s) => s.id), "cycle", "off"]);

  customCommandRegistry.registerCommand(
    {
      name: "realm:stats",
      description: "Your stats, the leaderboards and the stats ticker (operators: the sidebar)",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = playerOf(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => {
        if (open.has(player.id)) return;
        open.add(player.id);
        mainMenu(player)
          .catch((e) => console.warn(`[stats] ${e}`))
          .finally(() => open.delete(player.id));
      });
      return { status: CustomCommandStatus.Success };
    }
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:stats_ticker",
      description: "Show or hide your own stats above the hotbar",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = playerOf(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => player.sendMessage(toggleTicker(player)));
      return { status: CustomCommandStatus.Success };
    }
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:stats_sidebar",
      description: "Show a stat on everyone's sidebar, rotate through them, or hide it",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "realm:sidebar_stat", type: CustomCommandParamType.Enum }],
    },
    (_origin, /** @type {string} */ choice) => {
      system.run(() => {
        // Saved where /realm:config keeps it; the change listener shows it (again, if something else took the slot).
        const error = set("sidebar", choice);
        if (error) console.warn(`[stats] sidebar ${choice}: ${error}`);
      });
      return { status: CustomCommandStatus.Success, message: `Sidebar: ${choice}` };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
onScriptEvent(
  "realm:help_ping",
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "stats_bp");
  },
);
