import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, GameMode, Player, WeatherType, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

// Each player's titles, trails and built-in stats are one world property, `titles:p:<player id>`, so
// other packs can unlock titles for players who are offline and operators can give titles to them.
// The title a player wears is the tag `realm_title:<text>` (only this pack sets it); the Nicknames
// pack shows it under the name. Trails are particles from the Realm Skies resource pack: without it
// installed they just don't show.

/** @typedef {{ n: string, t: string[], r: string[], tr: string, s: { d: number, n: number, w: number } }} Data gamertag, titles, trails, chosen trail ("" = none), stats: distance, night seconds, storm seconds */

const KEY_PREFIX = "titles:p:";
const PROP_WEATHER = "titles:weather"; // world: overworld weather from the last change; scripts can't read the current weather
const TITLE_TAG = "realm_title:";
const OVERWORLD = "minecraft:overworld";
const DRY_GROUND = /sand|terracotta/; // deserts and badlands: thunder, but no storm to stand in
const SAVE_EVERY = 60; // seconds between saving stats that changed
/** The trails (particles from the Realm Skies resource pack), with their names and where they show. */
const TRAILS = /** @type {Record<string, { name: string, particle: string, y: number, behind: number }>} */ ({
  cloud: { name: "Rain cloud", particle: "realm:trail_cloud", y: 2.6, behind: 0 },
  leaves: { name: "Falling leaves", particle: "realm:trail_leaves", y: 1.2, behind: 0.6 },
  ember: { name: "Embers", particle: "realm:trail_ember", y: 0.2, behind: 0.6 },
  sparkle: { name: "Sparkles", particle: "realm:trail_sparkle", y: 0.9, behind: 0.6 },
});
const STAT_TEXT = /** @type {Record<string, (have: number, need: number) => string>} */ ({
  distance: (have, need) => `${fmt(have)}/${fmt(need)} blocks traveled`,
  night: (have, need) => `${fmt(have / 60)}/${fmt(need / 60)} minutes played at night`,
  storm: (have, need) => `${fmt(have / 60)}/${fmt(need / 60)} minutes outdoors in thunderstorms`,
});

const enabled = () => get("enabled") === true;
/** 12345 -> "12,345". @param {number} n */
const fmt = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** A title as players see it: plain ASCII, no color codes, at most maxTitleLength. @param {unknown} text */
const cleanTitle = (text) =>
  String(text ?? "")
    .replace(/§./g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/ +/g, " ")
    .trim()
    .slice(0, Math.max(1, CONFIG.maxTitleLength))
    .trim();

/** "cloud", "realm:trail_cloud" or "Rain cloud" -> "cloud", or undefined. @param {unknown} text */
function trailId(text) {
  const t = String(text ?? "").trim().toLowerCase();
  const id = t.replace(/^realm:trail_/, "").replace(/^trail:/, "");
  if (TRAILS[id]) return id;
  return Object.keys(TRAILS).find((k) => TRAILS[k].name.toLowerCase() === t);
}

// ---------------------------------------------------------------------------
// Saved data (cached; this pack is the only writer)
// ---------------------------------------------------------------------------

/** @type {Map<string, Data>} */
const cache = new Map();
/** Ids whose stats changed since they were saved. @type {Set<string>} */
const dirty = new Set();

/** @param {any} v @returns {Data} */
function parse(v) {
  const strings = (/** @type {any} */ a) => (Array.isArray(a) ? a.filter((x) => typeof x === "string") : []);
  const num = (/** @type {any} */ x) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : 0);
  return {
    n: typeof v?.n === "string" ? v.n : "",
    t: strings(v?.t),
    r: strings(v?.r).filter((r) => TRAILS[r]),
    tr: typeof v?.tr === "string" && TRAILS[v.tr] ? v.tr : "",
    s: { d: num(v?.s?.d), n: num(v?.s?.n), w: num(v?.s?.w) },
  };
}

/** @param {string} id @returns {Data} */
function dataOf(id) {
  let d = cache.get(id);
  if (d) return d;
  try {
    const raw = world.getDynamicProperty(KEY_PREFIX + id);
    d = parse(typeof raw === "string" ? JSON.parse(raw) : undefined);
  } catch {
    d = parse(undefined); // corrupt or not loaded: start empty
  }
  cache.set(id, d);
  return d;
}

/** @param {string} id */
function save(id) {
  const d = cache.get(id);
  if (!d) return;
  dirty.delete(id);
  try {
    world.setDynamicProperty(KEY_PREFIX + id, JSON.stringify({ ...d, s: { d: Math.floor(d.s.d), n: Math.floor(d.s.n), w: Math.floor(d.s.w) } }));
  } catch (e) {
    console.warn(`[titles] save: ${e}`);
  }
}

/** @param {string} id */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);

// ---------------------------------------------------------------------------
// Unlocking and wearing
// ---------------------------------------------------------------------------

/**
 * Records a title; true when it's new. Repeats are ignored quietly (packs may send them again).
 * @param {string} id @param {unknown} text @param {string} [name] the gamertag, when known
 */
function unlockTitle(id, text, name) {
  const title = cleanTitle(text);
  if (!title) return false;
  const d = dataOf(id);
  if (name) d.n = name;
  if (d.t.some((t) => t.toLowerCase() === title.toLowerCase())) return false;
  d.t.push(title);
  save(id);
  const player = online(id);
  if (player) {
    player.sendMessage(`§6New title unlocked: ${title}. §7Wear it with /realm:titles`);
    player.playSound("random.levelup", { pitch: 1.5, volume: 0.7 });
    if (get("announceUnlocks") === true) {
      for (const p of world.getAllPlayers()) if (p.id !== id) p.sendMessage(`§6${player.name} unlocked the title ${title}!`);
    }
  }
  return true;
}

/** Records a trail; true when it's new. @param {string} id @param {unknown} text @param {string} [name] */
function unlockTrail(id, text, name) {
  const trail = trailId(text);
  if (!trail) return false;
  const d = dataOf(id);
  if (name) d.n = name;
  if (d.r.includes(trail)) return false;
  d.r.push(trail);
  save(id);
  const player = online(id);
  if (player) {
    player.sendMessage(`§6New trail unlocked: ${TRAILS[trail].name}. §7Use it with /realm:titles`);
    player.playSound("random.orb", { pitch: 1.2, volume: 0.7 });
  }
  return true;
}

/** The title the player wears, or "". @param {Player} player */
function worn(player) {
  const tag = player.getTags().find((t) => t.startsWith(TITLE_TAG));
  return tag ? tag.slice(TITLE_TAG.length) : "";
}

/** Wears a title ("" = none): the one `realm_title:` tag. @param {Player} player @param {string} title */
function wear(player, title) {
  for (const t of player.getTags()) if (t.startsWith(TITLE_TAG)) player.removeTag(t);
  if (title) player.addTag(TITLE_TAG + title);
}

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:title_unlock" && id !== "realm:trail_unlock") return;
    try {
      const req = JSON.parse(message);
      if (!req || typeof req !== "object" || typeof req.player !== "string" || !req.player) return;
      const name = online(req.player)?.name;
      if (id === "realm:title_unlock") unlockTitle(req.player, req.title, name);
      else unlockTrail(req.player, req.trail, name);
    } catch {
      // not JSON: ignore
    }
  },
  { namespaces: ["realm"] }
);

// ---------------------------------------------------------------------------
// Built-in titles: distance, night and storm time, once a second
// ---------------------------------------------------------------------------

/** @type {WeatherType} */
let weather = WeatherType.Clear;

world.afterEvents.weatherChange.subscribe(({ dimension, newWeather }) => {
  if (dimension !== OVERWORLD) return;
  weather = newWeather;
  try {
    world.setDynamicProperty(PROP_WEATHER, newWeather);
  } catch (e) {
    console.warn(`[titles] ${e}`);
  }
});

world.afterEvents.worldLoad.subscribe(() => {
  const saved = world.getDynamicProperty(PROP_WEATHER);
  if (saved === WeatherType.Rain || saved === WeatherType.Thunder) weather = saved;
});

/** Outdoors in the Overworld, under the open sky (not in a desert)? @param {Player} player */
function underStorm(player) {
  if (player.dimension.id !== OVERWORLD) return false;
  const feet = player.location;
  try {
    const top = player.dimension.getTopmostBlock({ x: Math.floor(feet.x), z: Math.floor(feet.z) });
    if (!top || DRY_GROUND.test(top.typeId)) return false;
    return top.location.y - Math.floor(feet.y) < 2; // 0 or 1: grass or a fence at your side; 2+: a roof
  } catch {
    return false;
  }
}

/** The stat a built-in title counts. @param {Data} d @param {string} stat */
const statOf = (d, stat) => (stat === "distance" ? d.s.d : stat === "night" ? d.s.n : stat === "storm" ? d.s.w : 0);

/** @type {Map<string, { x: number, y: number, z: number, dim: string }>} */
const lastSpot = new Map();

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  lastSpot.delete(player.id); // respawning or joining isn't traveling
  if (!initialSpawn) return;
  const d = dataOf(player.id);
  if (d.n !== player.name) {
    d.n = player.name;
    save(player.id);
  }
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  if (dirty.has(playerId)) save(playerId);
  cache.delete(playerId);
  lastSpot.delete(playerId);
  trailSpot.delete(playerId);
});

let seconds = 0;
system.runInterval(() => {
  seconds++;
  if (!enabled()) {
    lastSpot.clear();
    return;
  }
  const time = world.getTimeOfDay();
  const night = time >= 13000 && time < 23000;
  const storm = weather === WeatherType.Thunder;
  for (const player of world.getAllPlayers()) {
    try {
      const d = dataOf(player.id);
      const loc = player.location;
      const dim = player.dimension.id;
      const last = lastSpot.get(player.id);
      if (last && last.dim === dim) {
        const dist = Math.hypot(loc.x - last.x, loc.y - last.y, loc.z - last.z);
        if (dist <= CONFIG.maxSpeed) d.s.d += dist;
      }
      lastSpot.set(player.id, { x: loc.x, y: loc.y, z: loc.z, dim });
      if (night) d.s.n += 1;
      if (storm && underStorm(player)) d.s.w += 1;
      dirty.add(player.id);
      for (const b of CONFIG.builtins) {
        if (statOf(d, b.stat) < b.amount) continue;
        unlockTitle(player.id, b.title, player.name);
        if (b.trail) unlockTrail(player.id, b.trail, player.name); // also when the title came first from an operator
      }
      if (seconds % SAVE_EVERY === 0) save(player.id);
    } catch (e) {
      console.warn(`[titles] ${e}`);
    }
  }
}, 20);

// ---------------------------------------------------------------------------
// Trails
// ---------------------------------------------------------------------------

/** Where each player was at the last trail check. @type {Map<string, { x: number, y: number, z: number, dim: string }>} */
const trailSpot = new Map();
let lastTrail = 0;
let rotate = 0;

system.runInterval(() => {
  if (system.currentTick - lastTrail < get("trailTicks")) return;
  lastTrail = system.currentTick;
  if (!enabled() || get("trails") !== true) return;
  const players = world.getAllPlayers();
  if (!players.length) return;
  let budget = Math.max(1, get("trailBudget"));
  // Start at a different player each time, so a busy realm shares the budget fairly.
  rotate = (rotate + 1) % players.length;
  for (let i = 0; i < players.length && budget > 0; i++) {
    const player = players[(rotate + i) % players.length];
    try {
      const d = cache.get(player.id) ?? dataOf(player.id);
      const trail = d.tr ? TRAILS[d.tr] : undefined;
      if (!trail) continue;
      const loc = player.location;
      const dim = player.dimension.id;
      const prev = trailSpot.get(player.id);
      trailSpot.set(player.id, { x: loc.x, y: loc.y, z: loc.z, dim });
      if (!prev || prev.dim !== dim) continue;
      const dx = loc.x - prev.x;
      const dz = loc.z - prev.z;
      const moved = Math.hypot(dx, loc.y - prev.y, dz);
      if (moved < 0.1 || moved > 20) continue; // standing still, or teleported
      if (player.getEffect("invisibility") || player.getGameMode() === GameMode.Spectator) continue;
      const flat = Math.hypot(dx, dz);
      const back = flat > 0.01 ? trail.behind / flat : 0;
      player.dimension.spawnParticle(trail.particle, { x: loc.x - dx * back, y: loc.y + trail.y, z: loc.z - dz * back });
      budget--;
    } catch {
      // unloaded chunk, or the player left
    }
  }
}, 2);

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

/**
 * Shows a form, retrying while the player still has chat or another screen open.
 * @param {Player} player @param {ActionFormData} form
 */
async function show(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await new Promise((r) => system.runTimeout(() => r(undefined), 20));
  }
  return undefined;
}

/** @param {Player} player */
async function mainMenu(player) {
  const d = dataOf(player.id);
  const title = worn(player);
  const lines = [
    `Title: ${title ? `§e${title}§r` : "§7none§r"} §7(shown under your name with the Nicknames pack)`,
    `Trail: ${d.tr ? `§e${TRAILS[d.tr]?.name ?? d.tr}§r` : "§7none§r"}${get("trails") === true && enabled() ? "" : " §c(trails are off on this realm)"}`,
    "",
    "§eTitles to earn:",
  ];
  for (const b of CONFIG.builtins) {
    const have = d.t.some((t) => t.toLowerCase() === cleanTitle(b.title).toLowerCase());
    const extra = b.trail && TRAILS[b.trail] ? ` §7(+ ${TRAILS[b.trail].name} trail)` : "";
    const text = STAT_TEXT[b.stat]?.(Math.min(statOf(d, b.stat), b.amount), b.amount) ?? "";
    lines.push(have ? `§a[x] ${b.title}${extra}` : `§f[ ] ${b.title}: ${text}${extra}`);
  }
  lines.push("§7Other packs give titles too, such as reaching level 50 in a skill.");
  const form = new ActionFormData()
    .title("§lTitles & Trails")
    .body(lines.join("\n"))
    .button(`Choose a title\n§8${d.t.length} unlocked`)
    .button(`Choose a trail\n§8${d.r.length} unlocked`)
    .button("Close");
  const res = await show(player, form);
  if (!res || res.canceled || !player.isValid) return;
  if (res.selection === 0) await titleMenu(player);
  else if (res.selection === 1) await trailMenu(player);
}

/** @param {Player} player */
async function titleMenu(player) {
  const d = dataOf(player.id);
  const current = worn(player);
  const titles = [...d.t].sort((a, b) => a.localeCompare(b));
  const form = new ActionFormData()
    .title("§lChoose a title")
    .body(titles.length ? "Your title shows on a line under your name." : "You have no titles yet. Earn them on your adventures: see /realm:titles.")
    .button(current ? "None" : "None §8(now)");
  for (const t of titles) form.button(t === current ? `§l${t}§r §8(now)` : t);
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  if (res.selection === 0) {
    wear(player, "");
    player.sendMessage("§7You no longer wear a title.");
  } else if (titles[res.selection - 1] !== undefined) {
    const t = /** @type {string} */ (titles[res.selection - 1]);
    wear(player, t);
    player.sendMessage(`§6You now wear the title ${t}.`);
  } else return mainMenu(player);
}

/** @param {Player} player */
async function trailMenu(player) {
  const d = dataOf(player.id);
  const trails = Object.keys(TRAILS).filter((k) => d.r.includes(k));
  const form = new ActionFormData()
    .title("§lChoose a trail")
    .body(trails.length ? "Your trail follows you as you move (the Realm Skies resource pack draws it)." : "You have no trails yet. Some titles come with one: see /realm:titles.")
    .button(d.tr ? "None" : "None §8(now)");
  for (const k of trails) form.button(k === d.tr ? `§l${TRAILS[k].name}§r §8(now)` : TRAILS[k].name);
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  if (res.selection === 0) {
    d.tr = "";
    save(player.id);
    player.sendMessage("§7Trail off.");
  } else if (trails[res.selection - 1] !== undefined) {
    d.tr = /** @type {string} */ (trails[res.selection - 1]);
    save(player.id);
    player.sendMessage(`§6Your trail is now ${TRAILS[d.tr].name}.`);
  } else return mainMenu(player);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * A player by gamertag: online (exact, else the only one whose name starts with it), else any saved
 * player with that gamertag. @param {string} name @returns {{ id: string, name: string } | undefined}
 */
function findPlayer(name) {
  const want = name.trim().toLowerCase();
  if (!want) return undefined;
  const players = world.getAllPlayers();
  const exact = players.find((p) => p.name.toLowerCase() === want);
  if (exact) return { id: exact.id, name: exact.name };
  const starts = players.filter((p) => p.name.toLowerCase().startsWith(want));
  if (starts.length === 1) return { id: starts[0].id, name: starts[0].name };
  for (const key of world.getDynamicPropertyIds()) {
    if (!key.startsWith(KEY_PREFIX)) continue;
    const id = key.slice(KEY_PREFIX.length);
    const d = dataOf(id);
    if (d.n.toLowerCase() === want) return { id, name: d.n };
  }
  return undefined;
}

/** @param {Player} op @param {string} who @param {string} what */
function give(op, who, what) {
  const target = findPlayer(who);
  if (!target) return op.sendMessage(`§cNo player called "${who.replace(/§/g, "")}" (online, or seen by this pack). Put names with spaces in quotes.`);
  const t = String(what ?? "").trim();
  if (/^trail:/i.test(t)) {
    const trail = trailId(t);
    if (!trail) return op.sendMessage(`§cTrails: ${Object.keys(TRAILS).map((k) => `trail:${k}`).join(", ")}`);
    const isNew = unlockTrail(target.id, trail, undefined);
    return op.sendMessage(isNew ? `§aGave ${target.name} the ${TRAILS[trail].name} trail.` : `§7${target.name} already has the ${TRAILS[trail].name} trail.`);
  }
  const title = cleanTitle(t);
  if (!title) return op.sendMessage("§cA title needs letters (plain text, no color codes).");
  const isNew = unlockTitle(target.id, title, undefined);
  op.sendMessage(isNew ? `§aGave ${target.name} the title ${title}.` : `§7${target.name} already has the title ${title}.`);
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:titles",
      description: "Titles & Trails: choose the title under your name and the trail that follows you",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => mainMenu(player).catch((e) => console.warn(`[titles] ${e}`)));
      return { status: CustomCommandStatus.Success };
    }
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:titles_give",
      description: 'Operators: give a player a title (or a trail: "trail:cloud", leaves, ember, sparkle)',
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [
        { name: "player", type: CustomCommandParamType.String },
        { name: "title", type: CustomCommandParamType.String },
      ],
    },
    (origin, /** @type {string} */ who, /** @type {string} */ what) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => {
        try {
          give(player, String(who ?? ""), String(what ?? ""));
        } catch (e) {
          console.warn(`[titles] give: ${e}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "titles_bp");
  },
  { namespaces: ["realm"] }
);
