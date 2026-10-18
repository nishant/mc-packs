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

/** Send an unchanged ticker again after this many ticks, so the action bar doesn't fade. */
const REFRESH_TICKS = 40;

/**
 * Per player: the stat it's on, seconds on it, what was last drawn, when, and where ("bar" = the action bar,
 * "hud" = a line under the Coordinates HUD, which owns the bar while it's on).
 * @type {Map<string, { index: number, seconds: number, text: string, at: number, via?: "bar" | "hud" }>}
 */
const tickers = new Map();
/** player id -> tick until which another pack's action bar message is left alone (realm:actionbar) */
const pausedUntil = new Map();
/** Players who see the Coordinates HUD, from its realm:hud_state, and when it last said so. */
let hudPlayers = new Set();
let hudHeard = -Infinity;
/** The HUD repeats its state every 5 seconds: after 10 without one, it's gone. */
const HUD_STALE_TICKS = 200;

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  tickers.delete(playerId);
  pausedUntil.delete(playerId);
  tickerPrefs.delete(playerId);
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

/** @param {Player} player */
function prefsOf(player) {
  let p = tickerPrefs.get(player.id);
  if (!p) {
    tickerPrefs.set(
      player.id,
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
 * The ticker's text for a player, advancing to the next stat when its time is up. "" = nothing to show.
 * @param {Player} player @param {{ index: number, seconds: number }} t
 */
function tickerText(player, t) {
  const { shown, lc, vc, full, all, seconds } = prefsOf(player);
  if (!shown.length) return "";
  /** @param {Stat} stat */
  const one = (stat) => {
    if (!full) return `${lc}${stat.short} ${vc}${fmt(stat, scoreOf(stat.id, player.name))}`;
    const list = ranked(stat.id);
    const rank = placeOf(stat.id, player.name) + 1;
    // A ranked player's score is in the list already (read this tick); an unranked one has 0 or none.
    const score = rank > 0 ? list[rank - 1].score : scoreOf(stat.id, player.name);
    return `${lc}${stat.label} ${vc}${fmt(stat, score)}${rank > 0 ? ` ${lc}#${rank} of ${list.length}` : ""}`;
  };
  if (all) return shown.map(one).join("§r   ");
  if (t.seconds >= seconds) {
    t.seconds = 0;
    t.index++;
  }
  return one(shown[t.index % shown.length]);
}

/** @param {Player} player */
const tickerOn = (player) => prefsOf(player).on;

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
  const hudAlive = now - hudHeard < HUD_STALE_TICKS;
  for (const player of world.getAllPlayers()) {
    try {
      let t = tickers.get(player.id);
      if (!tickerOn(player)) {
        if (t) {
          clearTicker(player, t);
          tickers.delete(player.id);
        }
        continue;
      }
      if (!t) tickers.set(player.id, (t = { index: 0, seconds: 0, text: "", at: -Infinity }));
      t.seconds++;
      const text = tickerText(player, t);
      /** @type {"bar" | "hud"} */
      const via = hudAlive && hudPlayers.has(player.id) ? "hud" : "bar";
      if (t.via === "hud" && via === "bar") toHud(player.id, ""); // the HUD went off: its line goes too
      const same = text === t.text && via === t.via;
      if (same && (!text || now - t.at < REFRESH_TICKS)) continue; // nothing new (and an empty ticker isn't resent)
      if (via === "hud") toHud(player.id, text);
      else {
        if ((pausedUntil.get(player.id) ?? 0) > now) continue; // another pack's message is on the bar
        player.onScreenDisplay.setActionBar(text);
      }
      t.text = text;
      t.via = via;
      t.at = now;
    } catch (e) {
      console.warn(`[stats] ticker: ${e}`);
    }
  }
}, 20);

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:actionbar" && id !== "realm:hud_state") return;
    try {
      const msg = JSON.parse(message);
      if (!msg || typeof msg !== "object") return;
      if (id === "realm:hud_state") {
        if (!Array.isArray(msg.players)) return;
        hudPlayers = new Set(msg.players.map(String));
        hudHeard = system.currentTick;
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
  { namespaces: ["realm"] }
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
 * @type {Map<string, { tick: number, list: Ranked[], rank: Map<string, number> }>}
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
  list.forEach((r, i) => {
    if (!rank.has(r.name)) rank.set(r.name, i);
  });
  const info = { tick: now, list, rank };
  rankedCache.set(id, info);
  return info;
}

/** @param {string} id */
const ranked = (id) => rankedInfo(id).list;

/** A name's place on a stat's board (0 = first), or -1 when it isn't on it. @param {string} id @param {string} name */
const placeOf = (id, name) => rankedInfo(id).rank.get(name) ?? -1;

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
  const list = ranked(stat.id);
  const medals = ["§6§l1.§r", "§7§l2.§r", "§c§l3.§r"];
  const size = get("leaderboardSize");
  const lines = list.slice(0, size).map((s, i) => {
    const me = s.name === player.name;
    const place = medals[i] ?? `§8${i + 1}.`;
    return `${place} ${me ? "§b§l" : "§r"}${s.name}§r  ${fmt(stat, s.score)}`;
  });
  const myRank = placeOf(stat.id, player.name);
  if (myRank >= size) {
    lines.push("§8...", `§8${myRank + 1}. §b${player.name}§r  ${fmt(stat, list[myRank].score)}`);
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
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "stats_bp");
  },
  { namespaces: ["realm"] }
);
