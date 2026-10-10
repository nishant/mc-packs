import { CommandPermissionLevel, CustomCommandStatus, Player, WeatherType, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get, getFor } from "./settings.js";

// Each player's journal is one player property, "journal:data" -> JSON
// { e: { page: [entry ids] }, l: { "page:entry": label } (labels of entries not in config.js),
//   r: [pages rewarded], lo: deepest y, hi: highest y, far: farthest from spawn }.
const PROP_DATA = "journal:data";
const PROP_WEATHER = "journal:weather"; // world: overworld weather from the last change; scripts can't read the current weather
const OVERWORLD = "minecraft:overworld";
const EXTRAS_PER_PAGE = 40; // entries other packs send that aren't in config.js, kept per page
const ENTRY_ID = /^[a-z0-9_:.-]{1,40}$/;
const LABEL_MAX = 40;
const DEEP_SKY = 24; // deeper under the surface than this, you can't see the weather
const FISH_TICKS = 20; // a catch appears within a second of its hook going

/** @typedef {typeof CONFIG.pages[number]} Page */
/** @typedef {Page["id"]} PageId */
/** @typedef {{ e: Record<string, string[]>, l: Record<string, string>, r: string[], lo?: number, hi?: number, far?: number }} Data */

/** @type {Map<string, { page: Page, labels: Map<string, string>, blurbs: Map<string, string> }>} */
const pages = new Map(
  CONFIG.pages.map((page) => [
    page.id,
    {
      page,
      labels: new Map(page.entries.map((e) => [e.id, e.label])),
      blurbs: new Map(page.entries.flatMap((e) => ("blurb" in e && e.blurb ? [[e.id, /** @type {string} */ (e.blurb)]] : []))),
    },
  ]),
);

/** "minecraft:cave_spider" -> "Cave Spider". @param {string} id */
const prettyId = (id) =>
  id
    .replace(/^[a-z0-9_.-]+:/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** 12345 -> "12,345". @param {number} n */
const fmt = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** @param {string} id */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);

/** "overworld" or "minecraft:overworld" -> "minecraft:overworld". @param {string} dim */
const dimId = (dim) => (dim.includes(":") ? dim : `minecraft:${dim}`);

// ---------------------------------------------------------------------------
// Crowns (the shared scoreboard; works without the Crowns pack)
// ---------------------------------------------------------------------------

function crownsObjective() {
  try {
    return world.scoreboard.getObjective("crowns") ?? world.scoreboard.addObjective("crowns", "Crowns");
  } catch {
    return world.scoreboard.getObjective("crowns"); // another pack added it this tick
  }
}

/** @param {Player} p @param {number} n */
function addCrowns(p, n) {
  const obj = crownsObjective();
  if (!obj) return false;
  obj.addScore(p, Math.floor(n));
  return true;
}

// ---------------------------------------------------------------------------
// Saved journals (cached per player)
// ---------------------------------------------------------------------------

/** @type {Map<string, Data>} */
const cache = new Map();

/** @param {Player} player @returns {Data} */
function dataOf(player) {
  let data = cache.get(player.id);
  if (data) return data;
  data = { e: {}, l: {}, r: [] };
  try {
    const raw = player.getDynamicProperty(PROP_DATA);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : undefined;
    if (parsed && typeof parsed === "object") {
      if (parsed.e && typeof parsed.e === "object") for (const [k, v] of Object.entries(parsed.e)) if (Array.isArray(v)) data.e[k] = v.filter((x) => typeof x === "string");
      if (parsed.l && typeof parsed.l === "object") for (const [k, v] of Object.entries(parsed.l)) if (typeof v === "string") data.l[k] = v;
      if (Array.isArray(parsed.r)) data.r = parsed.r.filter((/** @type {unknown} */ x) => typeof x === "string");
      for (const k of /** @type {const} */ (["lo", "hi", "far"])) if (typeof parsed[k] === "number") data[k] = parsed[k];
    }
  } catch {
    console.warn(`[journal] ${player.name}'s journal was unreadable; starting a new one`);
  }
  cache.set(player.id, data);
  return data;
}

/** @param {Player} player @param {Data} data */
function save(player, data) {
  cache.set(player.id, data);
  player.setDynamicProperty(PROP_DATA, JSON.stringify(data));
}

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  cache.delete(playerId);
  firstNote.delete(playerId);
});

/** @param {Data} data @param {Page} page */
function progressOf(data, page) {
  const have = new Set(data.e[page.id] ?? []);
  const found = page.entries.filter((e) => have.has(e.id)).length;
  return { found, total: page.entries.length };
}

/** @type {Set<string>} players told where to read the journal this session */
const firstNote = new Set();

/**
 * Records an entry. Returns true if it was new.
 * @param {Player} player @param {string} pageId @param {string} entry @param {string} [label]
 */
function addEntry(player, pageId, entry, label) {
  if (get("enabled") !== true || !player.isValid) return false;
  const p = pages.get(pageId);
  if (!p || !ENTRY_ID.test(entry)) return false;
  const data = dataOf(player);
  const list = (data.e[pageId] ??= []);
  if (list.includes(entry)) return false;
  const known = p.labels.has(entry);
  if (!known) {
    const extras = list.filter((id) => !p.labels.has(id)).length;
    if (extras >= EXTRAS_PER_PAGE) return false;
    data.l[`${pageId}:${entry}`] = (label || prettyId(entry)).slice(0, LABEL_MAX);
  }
  list.push(entry);
  save(player, data);
  if (getFor(player, "notes") === true) {
    const name = known ? p.labels.get(entry) : data.l[`${pageId}:${entry}`];
    const hint = firstNote.has(player.id) ? "" : " §7(/realm:journal)";
    firstNote.add(player.id);
    player.sendMessage(`§aJournal: New entry in ${p.page.label} - ${name}${hint}`);
  }
  if (known) checkComplete(player, data, p.page);
  return true;
}

/** Gives a page's reward once every entry is found. @param {Player} player @param {Data} data @param {Page} page */
function checkComplete(player, data, page) {
  const { found, total } = progressOf(data, page);
  if (!total || found < total || data.r.includes(page.id)) return;
  data.r.push(page.id);
  save(player, data);
  player.playSound("random.levelup", { pitch: 0.9 });
  if (get("rewards") !== true) {
    player.sendMessage(`§6Journal page complete: ${page.label}!`);
    return;
  }
  const r = page.reward;
  /** @type {string[]} */
  const got = [];
  if (r.levels > 0) {
    player.addLevels(r.levels);
    got.push(`${r.levels} level${r.levels === 1 ? "" : "s"}`);
  }
  if (r.title) {
    system.sendScriptEvent("realm:title_unlock", JSON.stringify({ player: player.id, title: r.title, from: "journal_bp" }));
    got.push(`the title ${r.title}`);
  }
  player.sendMessage(`§6Journal page complete: ${page.label}!${got.length ? ` §7Reward: ${got.join(", ")}` : ""}`);
  try {
    if (r.crowns > 0 && addCrowns(player, r.crowns)) player.sendMessage(`§6+${r.crowns} Crowns §7(Journal: ${page.label})`);
  } catch (e) {
    console.warn(`[journal] crowns: ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Mobs
// ---------------------------------------------------------------------------

world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  const killer = damageSource.damagingEntity;
  if (!(killer instanceof Player) || deadEntity instanceof Player) return;
  try {
    const type = deadEntity.typeId;
    if (type === "minecraft:npc" || type === "minecraft:armor_stand") return;
    addEntry(killer, "mobs", type.startsWith("minecraft:") ? type.slice(10) : type);
  } catch (e) {
    console.warn(`[journal] ${e}`);
  }
});

// ---------------------------------------------------------------------------
// Places and weather: each player every 2 seconds, a few block lookups
// ---------------------------------------------------------------------------

/** @type {WeatherType} */
let weather = WeatherType.Clear;

world.afterEvents.weatherChange.subscribe(({ dimension, newWeather }) => {
  if (dimension !== OVERWORLD) return;
  weather = newWeather;
  try {
    world.setDynamicProperty(PROP_WEATHER, newWeather);
  } catch (e) {
    console.warn(`[journal] ${e}`);
  }
});

world.afterEvents.worldLoad.subscribe(() => {
  try {
    const saved = world.getDynamicProperty(PROP_WEATHER);
    if (saved === WeatherType.Rain || saved === WeatherType.Thunder) weather = saved;
  } catch (e) {
    console.warn(`[journal] ${e}`);
  }
});

const DIMENSIONS = { "minecraft:overworld": "overworld", "minecraft:nether": "nether", "minecraft:the_end": "the_end" };
const biomes = CONFIG.biomes.map((b) => ({ ...b, set: new Set(b.blocks.map((id) => (id.includes(":") ? id : `minecraft:${id}`))), dim: b.dim ? dimId(b.dim) : undefined }));

/** @param {import("@minecraft/server").Dimension} dimension @param {import("@minecraft/server").Vector3} at */
function blockAt(dimension, at) {
  try {
    return dimension.getBlock(at);
  } catch {
    return undefined; // unloaded
  }
}

/** @param {Player} player */
function explore(player) {
  const dim = player.dimension;
  const loc = player.location;
  const x = Math.floor(loc.x), y = Math.floor(loc.y), z = Math.floor(loc.z);
  const dimName = DIMENSIONS[/** @type {keyof DIMENSIONS} */ (dim.id)];
  if (dimName) addEntry(player, "places", dimName);
  const overworld = dim.id === OVERWORLD;

  // Heights and distance, kept as numbers too for the Places page.
  const data = dataOf(player);
  let changed = false;
  if (data.lo === undefined || y < data.lo) {
    data.lo = y;
    changed = true;
  }
  if (data.hi === undefined || y > data.hi) {
    data.hi = y;
    changed = true;
  }
  let far = 0;
  if (overworld) {
    const spawn = world.getDefaultSpawnLocation();
    far = Math.floor(Math.hypot(loc.x - spawn.x, loc.z - spawn.z));
    if (data.far === undefined || far > data.far + 9) {
      // saved in steps of 10 blocks, so walking away doesn't save every 2 seconds
      data.far = far;
      changed = true;
    }
  }
  if (changed) save(player, data);
  if (overworld) {
    if (y < 0) addEntry(player, "places", "below_0");
    if (y < -55) addEntry(player, "places", "bottom");
    if (y > 200) addEntry(player, "places", "above_200");
    if (y > 300) addEntry(player, "places", "above_300");
    for (const d of CONFIG.farDistances) if (far >= d) addEntry(player, "places", `far_${d}`);
  }

  // Biomes, guessed from blocks.
  let top;
  try {
    top = dim.getTopmostBlock({ x, z });
  } catch {
    top = undefined;
  }
  const headroom = top ? top.location.y - y : Infinity; // how far the surface is over the player's feet
  const nearSurface = top !== undefined && headroom >= -3 && headroom <= 16;
  const under = blockAt(dim, { x, y: y - 1, z });
  const feet = blockAt(dim, { x, y, z });
  for (const b of biomes) {
    if (b.dim && b.dim !== dim.id) continue;
    if (b.maxY !== undefined && y > b.maxY) continue;
    if (b.minY !== undefined && y < b.minY) continue;
    const hit = b.at === "top" ? nearSurface && top && b.set.has(top.typeId) : (under && b.set.has(under.typeId)) || (feet && b.set.has(feet.typeId));
    if (hit) {
      addEntry(player, "places", b.entry);
      break;
    }
  }
  if (overworld && nearSurface && top && top.typeId === "minecraft:water") {
    const deep = blockAt(dim, { x, y: top.location.y - 8, z });
    if (deep && deep.typeId === "minecraft:water") addEntry(player, "places", "ocean");
  }

  // Weather you're out in (or at least not deep underground for).
  if (overworld && weather !== WeatherType.Clear && headroom <= DEEP_SKY) {
    addEntry(player, "weather", "rain");
    if (weather === WeatherType.Thunder) addEntry(player, "weather", "thunderstorm");
  }
}

system.runInterval(() => {
  if (get("enabled") !== true) return;
  for (const player of world.getAllPlayers()) {
    try {
      if (player.isValid) explore(player);
    } catch (e) {
      console.warn(`[journal] ${e}`);
    }
  }
}, 40);

// ---------------------------------------------------------------------------
// Fish: a hook belongs to the player nearest to it when it appears; an item that appears where a
// hook just was is that player's catch (the same way the Daily Quests pack sees catches).
// ---------------------------------------------------------------------------

const fishPage = pages.get("fish");
/** "minecraft:cod" -> "cod", for the fish entries in config.js. */
const fishItems = new Map((fishPage?.page.entries ?? []).map((e) => [`minecraft:${e.id}`, e.id]));
/** @type {Map<string, { hook: import("@minecraft/server").Entity, owner: Player, dim: string, at: import("@minecraft/server").Vector3, seen: number }>} */
const hooks = new Map();

world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  try {
    if (entity.typeId === "minecraft:fishing_hook") {
      if (get("enabled") !== true) return;
      const [owner] = entity.dimension.getPlayers({ location: entity.location, maxDistance: 4, closest: 1 });
      if (owner) hooks.set(entity.id, { hook: entity, owner, dim: entity.dimension.id, at: entity.location, seen: system.currentTick });
      return;
    }
    if (entity.typeId !== "minecraft:item" || !hooks.size) return;
    const stack = entity.getComponent("minecraft:item")?.itemStack;
    if (!stack) return;
    const at = entity.location;
    for (const [id, h] of hooks) {
      if (h.dim !== entity.dimension.id) continue;
      if (Math.abs(h.at.x - at.x) > 3 || Math.abs(h.at.y - at.y) > 3 || Math.abs(h.at.z - at.z) > 3) continue;
      hooks.delete(id);
      const fish = fishItems.get(stack.typeId);
      if (fish && h.owner.isValid) addEntry(h.owner, "fish", fish);
      break;
    }
  } catch (e) {
    console.warn(`[journal] ${e}`);
  }
});

system.runInterval(() => {
  if (!hooks.size) return;
  for (const [id, h] of hooks) {
    if (h.hook.isValid) {
      try {
        h.at = h.hook.location;
        h.seen = system.currentTick;
      } catch {
        // unloaded
      }
    } else if (system.currentTick - h.seen > FISH_TICKS) hooks.delete(id);
  }
}, 2);

// ---------------------------------------------------------------------------
// Other packs: realm:journal, realm:sky_event, realm:moon
// ---------------------------------------------------------------------------

/** Players who saw a sky event: in its dimension, within skyEventRadius of it (everyone there if it has no spot). @param {any} msg */
function witnesses(msg) {
  const dim = typeof msg.dim === "string" ? dimId(msg.dim) : undefined;
  const hasSpot = Number.isFinite(msg.x) && Number.isFinite(msg.z);
  return world.getAllPlayers().filter((p) => {
    if (dim && p.dimension.id !== dim) return false;
    if (!hasSpot) return true;
    return Math.hypot(p.location.x - msg.x, p.location.z - msg.z) <= CONFIG.skyEventRadius;
  });
}

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:journal" && id !== "realm:sky_event" && id !== "realm:moon") return;
    /** @type {any} */
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    try {
      if (id === "realm:journal") {
        if (typeof msg.player !== "string" || typeof msg.page !== "string" || typeof msg.entry !== "string") return;
        const player = online(msg.player);
        if (player) addEntry(player, msg.page, msg.entry, typeof msg.label === "string" ? msg.label : undefined);
        return;
      }
      const weatherPage = pages.get("weather");
      if (id === "realm:sky_event") {
        // Only kinds the Weather page lists (a caravan or a tournament isn't weather).
        if (typeof msg.kind !== "string" || !weatherPage?.labels.has(msg.kind)) return;
        for (const p of witnesses(msg)) addEntry(p, "weather", msg.kind);
        return;
      }
      // realm:moon: everyone in the overworld sees a Blood Moon or Harvest Moon rise.
      const entry = msg.state === "blood" ? "blood_moon" : msg.state === "harvest" ? "harvest_moon" : undefined;
      if (!entry) return;
      for (const p of world.getAllPlayers()) if (p.dimension.id === OVERWORLD) addEntry(p, "weather", entry);
    } catch (e) {
      console.warn(`[journal] ${id}: ${e}`);
    }
  },
  { namespaces: ["realm"] },
);

// ---------------------------------------------------------------------------
// The book
// ---------------------------------------------------------------------------

/** @param {number} found @param {number} total */
const pct = (found, total) => (total ? Math.floor((found / total) * 100) : 0);

/** @param {Page} page */
function rewardText(page) {
  const r = page.reward;
  return [r.levels > 0 ? `${r.levels} levels` : "", r.crowns > 0 ? `${r.crowns} Crowns` : "", r.title ? `the title ${r.title}` : ""].filter(Boolean).join(", ");
}

/** Shows a form, waiting while the player is busy (chat open, another menu). @param {Player} player @param {ActionFormData} form */
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
async function showJournal(player) {
  const data = dataOf(player);
  let found = 0, total = 0;
  for (const page of CONFIG.pages) {
    const p = progressOf(data, page);
    found += p.found;
    total += p.total;
  }
  const form = new ActionFormData()
    .title("§lField Journal")
    .body(`Overall: ${pct(found, total)}% (${found} of ${total} entries)\n\n§7The journal fills itself as you play. Find every entry on a page to finish it and earn its reward.`);
  for (const page of CONFIG.pages) {
    const p = progressOf(data, page);
    const n = (data.e[page.id] ?? []).length;
    form.button(p.total ? `${page.label}\n§8${p.found}/${p.total} (${pct(p.found, p.total)}%)${data.r.includes(page.id) ? " - done" : ""}` : `${page.label}\n§8${n} entr${n === 1 ? "y" : "ies"}`);
  }
  form.button("Close");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined) return;
  const page = CONFIG.pages[res.selection];
  if (page) await showPage(player, page);
}

/** @param {Player} player @param {Page} page */
async function showPage(player, page) {
  const data = dataOf(player);
  const p = /** @type {NonNullable<ReturnType<typeof pages.get>>} */ (pages.get(page.id));
  const have = new Set(data.e[page.id] ?? []);
  const { found, total } = progressOf(data, page);
  /** @type {string[]} */
  const lines = [];
  if (total) {
    lines.push(`${found} of ${total} found (${pct(found, total)}%)`);
    const reward = rewardText(page);
    if (data.r.includes(page.id)) lines.push("§aPage complete!");
    else if (reward && get("rewards") === true) lines.push(`§7Finish this page for: ${reward}`);
  }
  if (page.id === "places") {
    const stats = [
      data.lo !== undefined ? `Deepest: y ${data.lo}` : "",
      data.hi !== undefined ? `Highest: y ${data.hi}` : "",
      data.far !== undefined ? `Farthest from spawn: ${fmt(data.far)} blocks` : "",
    ].filter(Boolean);
    if (stats.length) lines.push(`§f${stats.join("\n")}`);
  }
  if (page.entries.length) {
    lines.push(
      page.entries
        .map((e) => {
          if (!have.has(e.id)) return `§8[ ] ${e.label}`;
          const blurb = p.blurbs.get(e.id);
          return `§a[x] ${e.label}${blurb ? `\n§7    ${blurb}` : ""}`;
        })
        .join("\n"),
    );
  }
  const extras = [...have].filter((id) => !p.labels.has(id)).map((id) => data.l[`${page.id}:${id}`] ?? prettyId(id));
  if (extras.length) lines.push(`${page.entries.length ? "§7Also found: " : "§f"}${extras.join(page.entries.length ? ", " : "\n")}`);
  if (!page.entries.length && !extras.length) lines.push("§7Nothing here yet.");
  const form = new ActionFormData().title(`§l${page.label}`).body(lines.join("\n\n")).button("Back").button("Close");
  const res = await show(player, form);
  if (res && !res.canceled && res.selection === 0) await showJournal(player);
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:journal",
      description: "Field Journal: the mobs, places, fish, weather, relics and story you've found",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => showJournal(player).catch((e) => console.warn(`[journal] ${e}`)));
      return { status: CustomCommandStatus.Success };
    },
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "journal_bp");
  },
  { namespaces: ["realm"] },
);
