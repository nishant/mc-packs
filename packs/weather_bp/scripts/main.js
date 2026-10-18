import "./diag.js";
import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, Player, WeatherType, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get, getFor, onChange } from "./settings.js";

// The plan is a list of spells in real time: world property "weather:plan" -> JSON
// { v: 2, s: [{ w: "Clear" | "Rain" | "Thunder", s: start ms, e: end ms }] }, the first one being now.
const PROP_PLAN = "weather:plan";
const PLAN_V = 2;
const PROP_WEATHER = "weather:weather"; // world: overworld weather at the last change; scripts can't read the current weather
const PROP_CYCLE = "weather:cycle"; // world: doWeatherCycle as it was before the almanac took over; unset = not taken over
const PROP_DAY = "weather:day"; // player: UTC day number of the last daily forecast in chat
const PROP_STORY = "weather:story"; // world: Date.now() of the last story request honored (realm:sky_request)

const OVERWORLD = "minecraft:overworld";
const MIN = 60000;
const DAY = 86400000;
const MAX_SPELLS = 200; // keeps the saved plan far under the 32,000-character property limit
const NEXT_MAX = 24; // spells sent in realm:weather_plan (each about 40 characters, under the 2,048 limit)
const SLEEP_GRACE = 200; // ticks: a clear sky this soon after someone was in bed was slept through
const REVERT_LIMIT = 6; // weather put back at most this often a minute, so we never fight another script forever
const TOLD_GAP = 12000; // ticks (10 minutes) between telling operators that a /weather change was put back
const NOTICE_DELAY = 200; // ticks after joining before the daily forecast, so it isn't lost in the join popups
const SELF = "weather_bp";

/** @typedef {"Clear" | "Rain" | "Thunder"} Kind */
/** @typedef {{ w: Kind, s: number, e: number }} Spell */

/** @type {Kind[]} */
const KINDS = ["Clear", "Rain", "Thunder"];
/** @type {Record<Kind, string>} */
const NAME = { Clear: "Clear skies", Rain: "Rain", Thunder: "Thunderstorm" };
/** @type {Record<Kind, string>} what it is, in a sentence: "rain in about 25 minutes" */
const WORD = { Clear: "clear", Rain: "rain", Thunder: "a thunderstorm" };
/** @type {Record<Kind, string>} the config.js group with its durations */
const GROUP = { Clear: "clear", Rain: "rain", Thunder: "thunder" };
/** @type {Record<string, Kind>} command enum value -> kind */
const FROM_ENUM = { clear: "Clear", rain: "Rain", thunder: "Thunder" };

/** @type {Spell[]} */
let spells = [];
/** Is the almanac running the weather right now? */
let active = false;
/** @type {Kind} the overworld weather as far as we know */
let tracked = "Clear";
let lastSleepTick = -SLEEP_GRACE * 10;
/** @type {number | undefined} */
let lastAbsolute;
/** @type {number[]} ticks we put the weather back at, for REVERT_LIMIT */
let reverts = [];
let revertPending = false;
let warnedFight = false;
let toldOps = -Infinity; // tick operators were last told that a /weather change was put back
let warnedCycle = false;
/** Tick each player joined at, until they had their daily forecast check. @type {Map<string, number>} */
const joinedAt = new Map();

/** @param {unknown} w @returns {w is Kind} */
const isKind = (w) => typeof w === "string" && KINDS.includes(/** @type {Kind} */ (w));

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

function loadPlan() {
  spells = [];
  try {
    const raw = world.getDynamicProperty(PROP_PLAN);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : undefined;
    if (parsed && Array.isArray(parsed.s)) {
      for (const x of parsed.s) {
        if (x && isKind(x.w) && Number.isFinite(x.s) && Number.isFinite(x.e) && x.e > x.s) spells.push({ w: x.w, s: x.s, e: x.e });
      }
      spells.sort((a, b) => a.s - b.s);
      // A plan made with older defaults (v 1: clear spells of 20-60 minutes) keeps only the spell on now.
      if (parsed.v !== PLAN_V) spells = spells.slice(0, 1);
    }
  } catch {
    console.warn("[weather] weather:plan is corrupt; planning again");
    spells = [];
  }
}

function savePlan() {
  try {
    world.setDynamicProperty(PROP_PLAN, spells.length ? JSON.stringify({ v: PLAN_V, s: spells }) : undefined);
  } catch (e) {
    console.warn(`[weather] ${e}`);
  }
}

/** A random length for a spell of this kind, from its min and max minutes (either order). @param {Kind} kind */
function length(kind) {
  const a = Number(get(`${GROUP[kind]}.minMinutes`)) || 1;
  const b = Number(get(`${GROUP[kind]}.maxMinutes`)) || a;
  const lo = Math.max(1, Math.min(a, b));
  const hi = Math.max(lo, a, b);
  return Math.round((lo + Math.random() * (hi - lo)) * 60) * 1000;
}

/** What follows a spell: clear always turns wet, rain may build into thunder, thunder may ease into rain. @param {Kind} prev @returns {Kind} */
function successor(prev) {
  const chance = (/** @type {string} */ key) => Math.min(1, Math.max(0, Number(get(key)) || 0));
  if (prev === "Clear") return Math.random() < chance("thunderAfterClear") ? "Thunder" : "Rain";
  if (prev === "Rain") return Math.random() < chance("thunderAfterRain") ? "Thunder" : "Clear";
  return Math.random() < chance("rainAfterThunder") ? "Rain" : "Clear";
}

const horizon = () => Math.max(0.5, Number(CONFIG.horizonHours) || 3) * 3600000;

/**
 * Drops finished spells and plans ahead to the horizon. Returns true when the current spell changed.
 * @param {number} now
 */
function extend(now) {
  const before = spells[0];
  const last = spells.at(-1);
  spells = spells.filter((s) => s.e > now);
  if (!spells.length) {
    // A new plan, or the realm was closed for longer than the plan reached: carry on from where it stopped.
    const kind = last ? successor(last.w) : tracked;
    spells.push({ w: kind, s: now, e: now + length(kind) });
  }
  // A gap (shouldn't happen) is closed by starting the first spell now.
  if (spells[0].s > now) spells[0].s = now;
  while (spells.length < MAX_SPELLS) {
    const tail = /** @type {Spell} */ (spells.at(-1));
    if (tail.e >= now + horizon()) break;
    const kind = successor(tail.w);
    spells.push({ w: kind, s: tail.e, e: tail.e + length(kind) });
  }
  return before !== spells[0];
}

/** Plays the current spell in the overworld. */
function apply() {
  const cur = spells[0];
  if (!cur) return;
  // With doWeatherCycle off the game keeps it until we change it; the duration is only a fallback in case
  // the gamerule is turned back on behind our back.
  const ticks = Math.min(1_000_000, Math.max(1200, Math.ceil((cur.e - Date.now()) / 50) + 1200));
  tracked = cur.w; // set first: the weatherChange this causes then matches the plan
  try {
    world.getDimension(OVERWORLD).setWeather(/** @type {WeatherType} */ (cur.w), ticks);
    world.setDynamicProperty(PROP_WEATHER, cur.w);
  } catch (e) {
    console.warn(`[weather] setWeather: ${e}`);
  }
}

/** Replans everything after the current spell (settings changed). */
function replanAfterCurrent() {
  if (!active || !spells.length) return;
  spells = [spells[0]];
  extend(Date.now());
  savePlan();
  broadcast();
}

/**
 * Starts a new spell now and replans after it.
 * @param {Kind} kind @param {number} ms
 */
function startSpell(kind, ms) {
  const now = Date.now();
  spells = [{ w: kind, s: now, e: now + ms }];
  extend(now);
  savePlan();
  apply();
  broadcast();
}

/** Someone slept through rain or a storm: like vanilla, that ends it. A clear spell starts now. */
function sleptThrough() {
  const cur = spells[0];
  if (!active || !cur || cur.w === "Clear") return;
  startSpell("Clear", length("Clear"));
}

// ---------------------------------------------------------------------------
// Taking over the weather, and giving it back
// ---------------------------------------------------------------------------

function takeOver() {
  try {
    if (world.getDynamicProperty(PROP_CYCLE) === undefined) world.setDynamicProperty(PROP_CYCLE, world.gameRules.doWeatherCycle);
    world.gameRules.doWeatherCycle = false;
  } catch (e) {
    console.warn(`[weather] doWeatherCycle: ${e}`);
  }
  active = true;
  try {
    lastAbsolute = world.getAbsoluteTime(); // so time that passed while it was disabled doesn't look like a skipped night
  } catch {
    lastAbsolute = undefined;
  }
  loadPlan();
  extend(Date.now());
  savePlan();
  apply();
  broadcast();
}

function giveBack() {
  active = false;
  spells = [];
  savePlan();
  try {
    const before = world.getDynamicProperty(PROP_CYCLE);
    world.gameRules.doWeatherCycle = before === false ? false : true;
    world.setDynamicProperty(PROP_CYCLE, undefined);
  } catch (e) {
    console.warn(`[weather] doWeatherCycle: ${e}`);
  }
  broadcast();
}

function syncEnabled() {
  const want = get("enabled") === true;
  if (want && !active) takeOver();
  else if (!want && (active || world.getDynamicProperty(PROP_CYCLE) !== undefined)) giveBack();
}

onChange((key) => {
  try {
    if (key === "enabled" || key === "*") syncEnabled();
    if (key !== "enabled" && key !== "dailyForecast" && key !== "storyEvents") replanAfterCurrent();
  } catch (e) {
    console.warn(`[weather] ${e}`);
  }
});

world.afterEvents.worldLoad.subscribe(() => {
  try {
    const saved = world.getDynamicProperty(PROP_WEATHER);
    if (isKind(saved)) tracked = saved;
    lastAbsolute = world.getAbsoluteTime();
    syncEnabled();
  } catch (e) {
    console.warn(`[weather] ${e}`);
  }
  // After a script reload, players already online still get their forecast check.
  for (const p of world.getAllPlayers()) joinedAt.set(p.id, system.currentTick);
});

// ---------------------------------------------------------------------------
// Keeping to the plan
// ---------------------------------------------------------------------------

world.afterEvents.weatherChange.subscribe(({ dimension, newWeather }) => {
  if (dimension !== OVERWORLD && dimension !== "overworld") return; // the event names it "overworld" on BDS 1.26
  const w = /** @type {Kind} */ (String(newWeather));
  if (!isKind(w)) return;
  tracked = w;
  try {
    world.setDynamicProperty(PROP_WEATHER, w);
  } catch (e) {
    console.warn(`[weather] ${e}`);
  }
  const cur = spells[0];
  if (!active || !cur || w === cur.w) return;
  // Sleeping clears rain and thunder (vanilla, or Smart Sleep in the AFK pack): that spell is over, as in vanilla.
  if (w === "Clear" && system.currentTick - lastSleepTick < SLEEP_GRACE) {
    system.run(() => sleptThrough());
    return;
  }
  // Anything else (/weather, another pack) is put back, a second later.
  if (revertPending) return;
  revertPending = true;
  system.runTimeout(() => {
    revertPending = false;
    try {
      const now = system.currentTick;
      reverts = reverts.filter((t) => now - t < 1200);
      const current = spells[0];
      if (!active || !current || tracked === current.w) return;
      if (system.currentTick - lastSleepTick < SLEEP_GRACE && tracked === "Clear") {
        sleptThrough();
        return;
      }
      if (reverts.length >= REVERT_LIMIT) {
        if (!warnedFight) console.warn("[weather] something keeps changing the weather; not putting it back for a minute. Use /realm:weather_set to change it.");
        warnedFight = true;
        return;
      }
      reverts.push(now);
      const was = tracked;
      apply();
      tellOps(was, current.w);
    } catch (e) {
      console.warn(`[weather] ${e}`);
    }
  }, 20);
});

/**
 * Tells the operators online, at most every 10 minutes, that a weather change (/weather, or another pack) was put back
 * and how to change the weather for real.
 * @param {Kind} was @param {Kind} back
 */
function tellOps(was, back) {
  if (system.currentTick - toldOps < TOLD_GAP) return;
  const ops = world.getAllPlayers().filter((p) => {
    try {
      return isOp(p);
    } catch {
      return false;
    }
  });
  if (!ops.length) return;
  toldOps = system.currentTick;
  for (const p of ops) p.sendMessage(`§e[Weather] The Weather Almanac put the weather back to ${NAME[back]} (it was changed to ${NAME[was]} without the almanac, maybe by /weather). Use /realm:weather_set to change the weather.`);
}

/** Once a second: who's in bed, did the night get skipped, did the spell end, and the daily forecasts. */
system.runInterval(() => {
  try {
    const players = world.getAllPlayers();
    for (const p of players) {
      try {
        if (p.isSleeping) lastSleepTick = system.currentTick;
      } catch {
        // a player mid-leave
      }
    }
    if (active) tick();
    notices(players);
  } catch (e) {
    console.warn(`[weather] ${e}`);
  }
}, 20);

let seconds = 0;
function tick() {
  seconds++;
  const now = Date.now();
  // A night skipped by sleeping may not report a weather change: a jump in time right after someone was in bed
  // ends a wet spell too.
  const abs = world.getAbsoluteTime();
  const jumped = lastAbsolute !== undefined && abs - lastAbsolute > 1000;
  lastAbsolute = abs;
  if (jumped && system.currentTick - lastSleepTick < SLEEP_GRACE && spells[0] && spells[0].w !== "Clear") {
    sleptThrough();
    return;
  }
  if (!spells.length || now >= spells[0].e) {
    extend(now);
    savePlan();
    apply();
    broadcast();
  }
  if (seconds % 10 === 0) {
    if (world.gameRules.doWeatherCycle) {
      // Something turned the weather cycle back on: the almanac only lets go when it's disabled in its settings.
      world.gameRules.doWeatherCycle = false;
      if (!warnedCycle) console.warn("[weather] doWeatherCycle was turned on; set back to false. Disable the Weather Almanac in /realm:config to give the weather back.");
      warnedCycle = true;
    }
    if (seconds % 60 === 0) warnedFight = false;
  }
}

// ---------------------------------------------------------------------------
// Sharing the plan: realm:weather_plan, and answering realm:weather_ask
// ---------------------------------------------------------------------------

function planMessage() {
  const cur = spells[0];
  if (!active || !cur) return { now: tracked, until: 0, next: [], off: true };
  return { now: cur.w, until: cur.e, next: spells.slice(1, 1 + NEXT_MAX).map((s) => ({ weather: s.w, at: s.s })) };
}

function broadcast() {
  try {
    system.sendScriptEvent("realm:weather_plan", JSON.stringify(planMessage()));
  } catch (e) {
    console.warn(`[weather] ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Forecast text
// ---------------------------------------------------------------------------

/** "12 min", "1 h 20 min". @param {number} ms */
function short(ms) {
  const m = Math.max(1, Math.round(ms / MIN));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

/** "about 25 minutes", "about 1 hour 20 minutes". @param {number} ms */
function long(ms) {
  const m = Math.max(1, Math.round(ms / MIN));
  if (m < 60) return `about ${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return `about ${h} hour${h === 1 ? "" : "s"}${rest ? ` ${rest} minute${rest === 1 ? "" : "s"}` : ""}`;
}

/** "14:40 UTC". @param {number} ms */
function utc(ms) {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
}

/** The one-line summary: "Rain in 25 min, for about 12 min. Thunderstorm likely around 14:40 UTC." */
function summary() {
  const now = Date.now();
  const cur = spells[0];
  if (!cur) return "";
  /** @type {string[]} */
  const parts = [];
  const nextWet = spells.find((s, i) => i > 0 && s.w !== "Clear");
  if (cur.w === "Clear") {
    parts.push(nextWet ? `${NAME[nextWet.w]} in ${short(nextWet.s - now)}, for about ${short(nextWet.e - nextWet.s)}.` : `No rain in the next ${short(horizon())}.`);
  } else {
    const after = spells[1];
    const change = !after ? "" : after.w === "Clear" ? "clearing" : after.w === "Rain" ? "easing to rain" : "building to a thunderstorm";
    parts.push(`${NAME[cur.w]} now${change ? `, ${change} in ${short(cur.e - now)}` : ""}.`);
  }
  // A thunderstorm further on (the one the first sentence already names isn't repeated).
  const named = cur.w === "Clear" ? nextWet : spells[1];
  const storm = spells.find((s, i) => i > 0 && s.w === "Thunder" && s !== named);
  if (storm) parts.push(`Thunderstorm likely around ${utc(storm.s)}.`);
  return parts.join(" ");
}

/** The daily chat line: "clear now, rain in about 25 minutes." */
function chatLine() {
  const now = Date.now();
  const cur = spells[0];
  if (!cur) return "";
  const after = spells[1];
  if (cur.w === "Clear") {
    const wet = spells.find((s, i) => i > 0 && s.w !== "Clear");
    return wet ? `clear now, ${WORD[wet.w]} in ${long(wet.s - now)}.` : `clear for the next ${long(horizon()).replace("about ", "")}.`;
  }
  const what = cur.w === "Rain" ? "rain now" : "thunderstorm now";
  if (!after) return `${what}.`;
  const change = after.w === "Clear" ? "clearing" : after.w === "Rain" ? "easing to rain" : "a thunderstorm";
  return `${what}, ${change} in ${long(cur.e - now)}.`;
}

/** @param {Player} player */
async function showForecast(player) {
  /** @type {string} */
  let body;
  if (!active || !spells.length) {
    body = `The Weather Almanac isn't running the weather on this realm right now, so there's no forecast: the weather is the game's own.\n\nLast seen: ${NAME[tracked]}.`;
  } else {
    const now = Date.now();
    const cur = spells[0];
    const lines = [`§l${summary()}§r`, "", `§fNow: §b${NAME[cur.w]}§f, for about ${short(cur.e - now)} more (until ${utc(cur.e)}).`, "", "§fComing up:"];
    for (const s of spells.slice(1)) {
      if (s.s > now + horizon()) break;
      lines.push(`§7${utc(s.s)}  §f${NAME[s.w]}§7, about ${short(s.e - s.s)} (in ${short(s.s - now)})`);
    }
    lines.push("", `§7Times are real time, UTC. It's now ${utc(now)}. Sleeping through rain or a storm ends it early.`);
    body = lines.join("\n");
  }
  const form = new ActionFormData().title("§lWeather Forecast").body(body).button("OK");
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return;
    const res = await form.show(player);
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return;
    await new Promise((r) => system.runTimeout(() => r(undefined), 20));
  }
}

// ---------------------------------------------------------------------------
// Daily forecast in chat
// ---------------------------------------------------------------------------

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (initialSpawn) joinedAt.set(player.id, system.currentTick);
});
world.afterEvents.playerLeave.subscribe(({ playerId }) => joinedAt.delete(playerId));

/** @param {Player[]} players */
function notices(players) {
  if (!joinedAt.size) return;
  const today = Math.floor(Date.now() / DAY);
  for (const p of players) {
    const at = joinedAt.get(p.id);
    if (at === undefined || system.currentTick - at < NOTICE_DELAY) continue;
    joinedAt.delete(p.id);
    try {
      if (!active || !spells.length || getFor(p, "dailyForecast") !== true) continue;
      if (p.getDynamicProperty(PROP_DAY) === today) continue;
      p.setDynamicProperty(PROP_DAY, today);
      p.sendMessage(`§bForecast: ${chatLine()} §7More with /realm:weather`);
    } catch (e) {
      console.warn(`[weather] ${e}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Other packs: the plan on request, and the Townsfolk "Forecast" offer
// ---------------------------------------------------------------------------

/** @param {string} id @returns {Player | undefined} */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id === "realm:weather_ask") {
      broadcast();
      return;
    }
    if (id !== "realm:npc_talk" && id !== "realm:npc_choose") return;
    try {
      const msg = JSON.parse(message);
      if (!msg || typeof msg !== "object") return;
      if (id === "realm:npc_talk") {
        const role = CONFIG.npcRole;
        if (!active || !role || !Array.isArray(msg.roles) || !msg.roles.includes(role)) return;
        system.sendScriptEvent("realm:npc_offer", JSON.stringify({ req: msg.req, pack: SELF, key: "forecast", label: "Forecast", order: 40 }));
      } else if (msg.pack === SELF && msg.key === "forecast" && typeof msg.player === "string") {
        const player = online(msg.player);
        if (player) showForecast(player).catch((e) => console.warn(`[weather] ${e}`));
      }
    } catch {
      // not ours, or malformed
    }
  },
  { namespaces: ["realm"] }
);

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerEnum("realm:weather_kind", ["clear", "rain", "thunder"]);

  customCommandRegistry.registerCommand(
    {
      name: "realm:weather",
      description: "Weather Almanac: the forecast (operators get a menu with the forecast and setting the weather)",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => (isOp(player) ? mainMenu(player) : showForecast(player)).catch((e) => console.warn(`[weather] ${e}`)));
      return { status: CustomCommandStatus.Success };
    }
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:weather_forecast",
      description: "Weather Almanac: the forecast for the next few hours, in real time",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => showForecast(player).catch((e) => console.warn(`[weather] ${e}`)));
      return { status: CustomCommandStatus.Success };
    }
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:weather_set",
      description: "Weather Almanac: start clear, rain or thunder now for some real minutes; the plan carries on after it",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [
        { name: "realm:weather_kind", type: CustomCommandParamType.Enum },
        { name: "minutes", type: CustomCommandParamType.Integer },
      ],
    },
    (origin, /** @type {unknown} */ kindArg, /** @type {unknown} */ minutes) => {
      const kind = FROM_ENUM[String(kindArg)];
      if (!kind) return { status: CustomCommandStatus.Failure, message: "Choose clear, rain or thunder." };
      if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
        return { status: CustomCommandStatus.Failure, message: "Minutes must be 1 to 1440." };
      }
      const wasActive = active;
      const by = origin.sourceEntity instanceof Player ? origin.sourceEntity.id : undefined;
      system.run(() => {
        try {
          setWeatherNow(kind, minutes, by);
        } catch (e) {
          console.warn(`[weather] ${e}`);
        }
      });
      return { status: CustomCommandStatus.Success, message: setMessage(kind, minutes, wasActive) };
    }
  );
});

/** @param {Player} player */
const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

/**
 * Starts `kind` now for `minutes` real minutes; the plan carries on after it. Everyone else online hears about it,
 * since the sky changes for them too and the forecast they read is no longer what's coming.
 * @param {Kind} kind @param {number} minutes @param {string} [byId] the operator, who gets their own answer
 */
function setWeatherNow(kind, minutes, byId) {
  if (active) startSpell(kind, minutes * MIN);
  else world.getDimension(OVERWORLD).setWeather(/** @type {WeatherType} */ (kind), minutes * 1200);
  const line = `§7An operator set the weather: ${NAME[kind]} for ${minutes} minute${minutes === 1 ? "" : "s"}.${active ? " The forecast is updated." : ""}`;
  for (const p of world.getAllPlayers()) {
    try {
      if (p.id !== byId) p.sendMessage(line);
    } catch {
      // a player mid-leave
    }
  }
}

/** @param {Kind} kind @param {number} minutes @param {boolean} wasActive */
function setMessage(kind, minutes, wasActive) {
  const what = `${NAME[kind]} for ${minutes} minute${minutes === 1 ? "" : "s"}`;
  return wasActive ? `${what} starting now; the plan carries on after it.` : `${what} (the Weather Almanac is disabled, so the game's weather cycle takes over after).`;
}

/**
 * Shows a form, retrying while the player still has chat or another screen open.
 * @template {ActionFormData | ModalFormData} F
 * @param {Player} player @param {F} form
 * @returns {Promise<Awaited<ReturnType<F["show"]>> | undefined>}
 */
async function showForm(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = /** @type {any} */ (await form.show(player));
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await new Promise((r) => system.runTimeout(() => r(undefined), 20));
  }
  return undefined;
}

/** Operators: what weather, for how long. @param {Player} player */
async function setForm(player) {
  const form = new ModalFormData()
    .title("§lSet the weather")
    .dropdown("Weather", KINDS.map((k) => NAME[k]), { defaultValueIndex: 1 })
    .slider("For how many real minutes", 5, 240, { valueStep: 5, defaultValue: 30 })
    .submitButton("Start it now");
  const res = await showForm(player, form);
  if (!res || res.canceled || !res.formValues || !player.isValid) return;
  if (!isOp(player)) return player.sendMessage("§cOnly operators can set the weather."); // de-opped while the form was open
  const v = res.formValues.filter((x) => x !== undefined);
  const kind = KINDS[Number(v[0])] ?? "Rain";
  const minutes = Math.max(1, Math.min(1440, Math.round(Number(v[1])) || 30));
  const wasActive = active;
  setWeatherNow(kind, minutes, player.id);
  player.sendMessage(`§7${setMessage(kind, minutes, wasActive)}`);
}

/** /realm:weather for operators. @param {Player} player */
async function mainMenu(player) {
  /** @type {{ text: string, run: () => unknown }[]} */
  const actions = [
    { text: "Forecast\n§8The next few hours", run: () => showForecast(player) },
    { text: "§4Set the weather (operator)\n§8Clear, rain or thunder, for a while", run: () => setForm(player) },
  ];
  const form = new ActionFormData().title("§lWeather Almanac").body(active ? summary() : "The Weather Almanac is disabled: the game runs the weather.");
  for (const a of actions) form.button(a.text);
  const res = await showForm(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  await actions[res.selection]?.run();
}

// ---------------------------------------------------------------------------
// Story requests: realm:sky_request { kind: "thunder" | "rain", minutes?, within?, dim?, from, player?, reason? }
// ---------------------------------------------------------------------------

const STORY_GAP = 20 * MIN; // at most one honored story request per 20 real minutes, realm-wide
/** @type {Record<string, Kind>} */
const FROM_STORY = { thunder: "Thunder", rain: "Rain" };

/** @param {unknown} v @param {number} max */
const optText = (v, max) => v === undefined || (typeof v === "string" && v.length <= max);
/** An optional number in min..max, or the default. NaN when it's there but not allowed. @param {unknown} v @param {number} min @param {number} max @param {number} def */
const optNumber = (v, min, max, def) => (v === undefined ? def : typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : NaN);

/**
 * Plans `kind` into the almanac: it starts within `within` real minutes (when the current spell ends, if that's
 * soon enough, else partway through the window) and lasts `minutes`; the plan carries on after it and the
 * forecast shows it. Ignored silently when the almanac or its Story events setting is disabled, that weather
 * (or thunder, for rain) is already here or planned to start within the window, a request was honored in the
 * last 20 minutes, or the message is malformed.
 * @param {string} message
 */
function skyRequest(message) {
  let req;
  try {
    req = JSON.parse(message);
  } catch {
    return;
  }
  if (!req || typeof req !== "object" || Array.isArray(req)) return;
  const kind = typeof req.kind === "string" ? FROM_STORY[req.kind] : undefined;
  if (!kind || !optText(req.from, 64) || !optText(req.player, 64) || !optText(req.reason, 200)) return;
  if (req.dim !== undefined && req.dim !== OVERWORLD) return;
  const minutes = optNumber(req.minutes, 1, 120, 6);
  const within = optNumber(req.within, 1, 60, 8);
  if (Number.isNaN(minutes) || Number.isNaN(within)) return;
  if (!active || get("storyEvents") !== true || !spells.length) return;
  const now = Date.now();
  const last = world.getDynamicProperty(PROP_STORY);
  if (typeof last === "number" && now - last < STORY_GAP && now >= last) return;
  const covers = (/** @type {Kind} */ w) => w === kind || (kind === "Rain" && w === "Thunder");
  const cur = spells[0];
  if (covers(cur.w) || covers(tracked)) return;
  const windowEnd = now + within * MIN;
  if (spells.some((s, i) => i > 0 && s.s <= windowEnd && covers(s.w))) return;
  const start = cur.e <= windowEnd ? cur.e : Math.round(now + within * MIN * (0.5 + Math.random() * 0.5));
  world.setDynamicProperty(PROP_STORY, now);
  spells = [{ w: cur.w, s: cur.s, e: start }, { w: kind, s: start, e: start + Math.round(minutes * MIN) }];
  extend(now);
  savePlan();
  broadcast();
}

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "weather_bp");
    else if (id === "realm:sky_request") {
      try {
        skyRequest(message);
      } catch (e) {
        console.warn(`[weather] ${e}`);
      }
    }
  },
  { namespaces: ["realm"] }
);
