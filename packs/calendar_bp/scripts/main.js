// Realm Calendar: the 96-day Realm Year (4 seasons, a 4-day festival in each), the festival activities and
// Festival Ribbons, the ribbon stall, the regatta and the Lantern Fair vote, and the Gray Choir's sieges on
// the realm's towns at night (three Ritual Circles, bells to silence, Heartened or Shaken towns).
//
// Script events (JSON, each under 2048 characters):
//   realm:calendar        { day, doy, year, season, festival?, ends?, from }  -> at dawn, on join, on realm:calendar_ping, every 5 min
//                          <- Townsfolk's counter, read once (the first day) and then owned here
//   realm:siege           { state: "warn" | "on" | "end", town, result? }    -> held | failed | scattered
//   realm:sky_event       { kind: "siege", dim, x, z, text }                 -> inn news, Journal
//   realm:town_state      { town, mood, until }                             -> Town Projects (Heartened: deliveries x1.25); realm:town_state_ping
//   realm:town_list       <- Town Projects: every town, and whether it is kept safe from world events; realm:town_list_ping
//   realm:quest_done      -> { kind: "festival" | "siege" }; <- Atlas cairns (atlas:cairn:*) shrink the Choir
//   realm:npc_gift        <- Townsfolk: a gift given (Gift Round)
//   realm:saga_progress   <- Story Questlines: Act II finished lets one player draw a siege
//   realm:place_ready     <- the lighthouse, a siege's second choice of target
//   realm:npc_talk / realm:npc_offer / realm:npc_choose   the Festival Ribbon stall at the merchant
//   realm:gossip, realm:rep_add, realm:skill_xp, realm:title_unlock, realm:trail_unlock, realm:recipe_learn, realm:sky_request
//   realm:calendar_debug  { action, ... } (console, scripts, operators) -> realm:calendar_state
// See "Realm Calendar" in docs/PACKS.md.
import { BlockPermutation, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, GameMode, ItemStack, Player, StructureSaveMode, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, MessageFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { ACTIVITIES, FESTIVALS, SEASON_DAYS, SEASONS, SIEGE_LINES, STOCK, TALES, YEAR_DAYS } from "./lore.js";
import { get, onChange } from "./settings.js";
import { holdTitle, sideBoxes } from "./side.js";
import { escapeZones, protectedBox } from "./zones.js";

/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Block} Block */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

const PACK = "calendar_bp";
const OVERWORLD = "minecraft:overworld";
const PROP_DAY = "cal:day"; // world: JSON { d: Realm day, n: 1 once the night was seen }
const PROP_META = "cal:meta"; // world: JSON { fk, last, tried, cairns: [keys], course? }
const PROP_SIEGE = "cal:siege"; // world: JSON Siege while one runs
const PROP_HIST = "cal:hist"; // world: JSON [[day, town, result], ...] newest first
const PROP_MOODS = "cal:moods"; // world: JSON { <town id>: [name, mood, until] }
const PROP_TOWNS = "cal:towns"; // world: JSON { <town id>: 0 } towns with sieges switched off
const PROP_FAIR = "cal:fair"; // world: JSON { k, e: { <pid>: [name, x, y, z] }, v: { <pid>: votes } }
const PROP_BOARD = "cal:board"; // world: JSON { k, top: [[pid, name, ms]], best?: [name, ms, year] }
const PROP_RESTORE = "cal:restore"; // world: JSON [[structure id, dim, x, y, z]] circles still to put back
const PROP_PLAYER = "cal:p"; // player: JSON Pdata
const SIEGE_TAG = "realm:siege";
const FX_TAG = "realm:cal_fx";
const RIBBON = "§dFestival Ribbon";
const RIBBON_MARK = "§8Spend at a Festival Ribbon stall.";
const NIGHT_FROM = 13000;
const NIGHT_TO = 23000;
const MAX_MOBS = 24;
const CIRCLE_KINDS = new Set(["minecraft:gray_concrete", "minecraft:bell", "minecraft:white_candle"]);
/** Blocks players make and nature doesn't (as Atlas checks): a circle never covers them. */
const BUILT =
  /planks|glass|chest|barrel|sign|bed$|torch|lantern|door|fence|wool|carpet|concrete|glazed|crafting_table|furnace|smoker|bookshelf|lectern|anvil|hopper|_rail|^minecraft:rail|banner|campfire|loom|smithing|cartography|fletching|grindstone|stonecutter|enchanting|beacon|bell|composter|cauldron|brewing|jukebox|note_block|scaffolding|ladder|stairs|slab|brick|polished|item_frame|flower_pot|candle|shulker|dispenser|dropper|piston|observer|repeater|comparator|redstone_lamp|lever|button|pressure_plate|_wall$|chiseled|path|farmland|hay_block|bone_block|tinted|end_rod|pumpkin|portal|spawner/;
const SOFT = /grass$|short_grass|tall_grass|fern|flower|bush|tulip|orchid|poppy|dandelion|allium|bluet|daisy|lily_of|cornflower|snow_layer|petals|leaf_litter|sapling|deadbush|lilac|peony|sunflower|rose_bush|mushroom$|^minecraft:air$/;
const TREE = /_leaves$|_log$|_wood$|mushroom_block|azalea|mangrove_roots$|bamboo|cactus/;

const isOp = (/** @type {Player} */ p) => p.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
/** @param {string} id */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);
/** @param {string} id @param {unknown} msg */
const send = (id, msg) => {
  try {
    system.sendScriptEvent(id, JSON.stringify(msg));
  } catch (e) {
    console.warn(`[calendar] ${id}: ${e}`);
  }
};
const num = (/** @type {unknown} */ v) => typeof v === "number" && Number.isFinite(v);
const int = (/** @type {string} */ key) => Math.floor(Number(get(key)) || 0);
/** @param {number} ticks */
const wait = (ticks) => new Promise((r) => system.runTimeout(() => r(undefined), ticks));
/** 0:42 @param {number} ms */
const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const side = sideBoxes("calendar");
const night = () => {
  const t = world.getTimeOfDay();
  return t >= NIGHT_FROM && t < NIGHT_TO;
};

/** @param {string} key @returns {any} */
function readJson(key) {
  try {
    const raw = world.getDynamicProperty(key);
    return typeof raw === "string" ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}
/** @param {string} key @param {unknown} v */
function writeJson(key, v) {
  try {
    world.setDynamicProperty(key, v === undefined ? undefined : JSON.stringify(v));
  } catch (e) {
    console.warn(`[calendar] save ${key}: ${e}`);
  }
}

/** A note on the action bar (the action bar protocol). @param {Player} player @param {string} text */
function actionbar(player, text) {
  send("realm:actionbar", { player: player.id, ticks: 40, from: PACK });
  try {
    player.onScreenDisplay.setActionBar(text);
  } catch {
    // left
  }
}

/** Other packs' action bar requests (the action bar protocol): player id -> tick until which to wait. @type {Map<string, number>} */
const barHeld = new Map();
/** A steady line (the regatta, a Nest Watch): skipped while another pack's note is on the bar. @param {Player} player @param {string} text */
function steadyBar(player, text) {
  if ((barHeld.get(player.id) ?? 0) > system.currentTick) return;
  actionbar(player, text);
}

/** A title (the title protocol: holdTitle sends realm:title first). @param {Player} player @param {string} title @param {string} sub */
function title(player, title, sub) {
  try {
    holdTitle(player, 90);
    player.onScreenDisplay.setTitle(title, { subtitle: sub, fadeInDuration: 10, stayDuration: 60, fadeOutDuration: 20 });
  } catch {
    // left
  }
}

/** @param {Player} player @param {number} amount */
function addCrowns(player, amount) {
  if (amount <= 0) return;
  try {
    const obj = world.scoreboard.getObjective("crowns") ?? world.scoreboard.addObjective("crowns", "Crowns");
    obj.addScore(player, Math.floor(amount));
  } catch (e) {
    console.warn(`[calendar] crowns: ${e}`);
  }
}

/** Is this player AFK (the AFK pack's tag)? @param {Player} p */
const afk = (p) => {
  try {
    return p.hasTag("afk");
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Installed packs (the realm:help_ping scan)
// ---------------------------------------------------------------------------

/** @type {Set<string>} */
let installed = new Set();
/** @type {Set<string> | undefined} */
let scanning;
function scanPacks() {
  scanning = new Set([PACK]);
  send("realm:help_ping", {});
  system.runTimeout(() => {
    if (scanning) installed = scanning;
    scanning = undefined;
  }, 40);
}
/** Before the first scan answers, assume a pack is there. @param {string} folder */
const has = (folder) => !installed.size || installed.has(folder);

// ---------------------------------------------------------------------------
// The Realm day and the calendar
// ---------------------------------------------------------------------------

let day = 1;
let nightSeen = false;
/** False until the first day is known: read from Townsfolk's broadcast once, or day 1. */
let owned = false;
let loaded = false;

function loadDay() {
  const d = readJson(PROP_DAY);
  if (d && num(d.d) && d.d >= 1) {
    day = Math.floor(d.d);
    nightSeen = d.n === 1;
    owned = true;
  }
}
const saveDay = () => writeJson(PROP_DAY, { d: day, n: nightSeen ? 1 : 0 });

/**
 * The calendar on a Realm day: day of the year (1-96), year, season and festival (the same math as Townsfolk's).
 * @param {number} d
 */
function calendarOf(d) {
  const doy = ((d - 1) % YEAR_DAYS) + 1;
  const year = Math.floor((d - 1) / YEAR_DAYS) + 1;
  const si = Math.min(SEASONS.length - 1, Math.floor((doy - 1) / SEASON_DAYS));
  const s = SEASONS[si];
  const f = doy >= s.festival[0] && doy <= s.festival[1] ? s : undefined;
  return { day: d, doy, year, season: s.id, si, festival: f ? f.fid : undefined, ends: f ? d + (f.festival[1] - doy) : undefined };
}
const today = () => calendarOf(day);
/** The festival running now, when festivals are enabled. */
const festivalNow = () => (get("festivals") === true ? today().festival : undefined);
/** A festival's key: one per festival and year (activity limits and the vote are per festival). */
const festKey = () => {
  const c = today();
  return c.festival ? `${c.year}:${c.festival}` : "";
};

function broadcast() {
  if (!owned) return;
  const c = today();
  /** @type {Record<string, unknown>} */
  const msg = { day: c.day, doy: c.doy, year: c.year, season: c.season, from: PACK };
  // With festivals switched off, nobody hears of one (no festival chapters, no double gifts).
  if (c.festival && get("festivals") === true) {
    msg.festival = c.festival;
    msg.ends = c.ends;
  }
  send("realm:calendar", msg);
}

/** Twice a second: +1 at each dawn seen (night first: a /time set back to morning never counts). */
function dayTick() {
  if (!owned) return;
  const t = world.getTimeOfDay();
  if (t >= 12000) {
    if (!nightSeen) {
      nightSeen = true;
      saveDay();
    }
  } else if (nightSeen && t < 6000) {
    nightSeen = false;
    day++;
    saveDay();
    broadcast();
    festivalCheck();
  }
}

/** Sets the day (operators): the day of this year, 1-96. @param {number} doy */
function setDay(doy) {
  const c = today();
  day = Math.max(1, (c.year - 1) * YEAR_DAYS + Math.max(1, Math.min(YEAR_DAYS, Math.floor(doy))));
  nightSeen = world.getTimeOfDay() >= 12000;
  owned = true;
  // An earlier day: the siege gap and tonight's roll count from it, not from a day that now lies ahead.
  if (meta.last > day) meta.last = day;
  if (meta.tried > day) meta.tried = 0;
  saveMeta();
  saveDay();
  broadcast();
  festivalCheck();
}

/** Days until the next festival's first day, and which. */
function nextFestival() {
  for (let k = 1; k <= YEAR_DAYS; k++) {
    const n = calendarOf(day + k);
    const s = SEASONS[n.si];
    if (n.festival && n.doy === s.festival[0]) return { in: k, fid: n.festival, s };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Saved world state
// ---------------------------------------------------------------------------

/** @type {{ fk: string, last: number, tried: number, cairns: string[], course?: { x: number, y: number, z: number, h: number } }} */
let meta = { fk: "", last: 0, tried: 0, cairns: [] };
function loadMeta() {
  const m = readJson(PROP_META);
  if (!m || typeof m !== "object") return;
  meta = {
    fk: typeof m.fk === "string" ? m.fk : "",
    last: num(m.last) ? m.last : 0,
    tried: num(m.tried) ? m.tried : 0,
    cairns: Array.isArray(m.cairns) ? m.cairns.filter((/** @type {unknown} */ k) => typeof k === "string").slice(0, 18) : [],
  };
  if (m.course && num(m.course.x) && num(m.course.z) && num(m.course.y)) meta.course = { x: m.course.x, y: m.course.y, z: m.course.z, h: num(m.course.h) ? m.course.h : 0 };
}
const saveMeta = () => writeJson(PROP_META, meta);

/** @returns {Record<string, [string, string, number]>} */
function moods() {
  const m = readJson(PROP_MOODS);
  return m && typeof m === "object" ? m : {};
}
/** @param {string} townId */
function moodOf(townId) {
  const m = moods()[townId];
  return m && m[2] > Date.now() ? m[1] : undefined;
}
/** @param {string} townId @param {string} name @param {"heartened" | "shaken"} mood */
function setMood(townId, name, mood) {
  const all = moods();
  const until = Date.now() + Math.max(1, Number(get("moodHours")) || 24) * 3600000;
  for (const [k, v] of Object.entries(all)) if (!Array.isArray(v) || v[2] < Date.now()) delete all[k];
  all[townId] = [name.slice(0, 32), mood, until];
  writeJson(PROP_MOODS, all);
  send("realm:town_state", { town: townId, name, mood, until });
}
function sendMoods() {
  for (const [town, v] of Object.entries(moods())) if (Array.isArray(v) && v[2] > Date.now()) send("realm:town_state", { town, name: v[0], mood: v[1], until: v[2] });
}

/** @returns {Record<string, number>} */
const townSwitches = () => readJson(PROP_TOWNS) ?? {};
/** @param {string} townId */
const siegesAt = (townId) => townSwitches()[townId] !== 0;

/** @param {string} town @param {string} result */
function addHistory(town, result) {
  const h = readJson(PROP_HIST);
  const list = Array.isArray(h) ? h : [];
  list.unshift([day, town.slice(0, 32), result]);
  writeJson(PROP_HIST, list.slice(0, 12));
}

// ---------------------------------------------------------------------------
// Player data: this festival's counts
// ---------------------------------------------------------------------------

/**
 * @typedef {object} Pdata
 * @property {string} k the festival these counts are for ("<year>:<festival>")
 * @property {Record<string, number>} a activities done this festival
 * @property {number} r ribbons earned this festival
 * @property {number} c Crowns earned this festival
 * @property {string} [v] whose carve-off entry they voted for
 * @property {number} [f] seagrass feeds toward the next Turtle Feeding
 * @property {string[]} [e] foods eaten toward the next picnic
 * @property {string[]} [g] townsfolk given a gift toward the next Gift Round
 * @property {number} [cd] candles placed toward the next vigil
 * @property {number} [ln] the Realm day of the last lantern let go
 * @property {number} [sn] the Realm day of the last Long Night shooting star asked for
 * @property {string[]} [b] titles, trails and recipe cards bought at the stall (kept from festival to festival)
 */
/** @type {Map<string, Pdata>} */
const pcache = new Map();
/** @param {Player} player @returns {Pdata} */
function pdata(player) {
  const key = festKey();
  let d = pcache.get(player.id);
  if (!d) {
    try {
      const raw = player.getDynamicProperty(PROP_PLAYER);
      d = typeof raw === "string" ? JSON.parse(raw) : undefined;
    } catch {
      d = undefined;
    }
    if (!d || typeof d !== "object" || typeof d.a !== "object") d = { k: key, a: {}, r: 0, c: 0 };
    pcache.set(player.id, d);
  }
  // A new festival: everything counts from zero again.
  if (key && d.k !== key) {
    const keep = { ln: d.ln, sn: d.sn, b: d.b };
    d = { k: key, a: {}, r: 0, c: 0, ...keep };
    pcache.set(player.id, d);
  }
  return d;
}
/** @param {Player} player */
function savePdata(player) {
  const d = pcache.get(player.id);
  if (!d) return;
  try {
    player.setDynamicProperty(PROP_PLAYER, JSON.stringify(d));
  } catch (e) {
    console.warn(`[calendar] save player: ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Festival Ribbons and activities
// ---------------------------------------------------------------------------

/** @param {Player} player @param {number} n */
function giveRibbons(player, n) {
  if (n <= 0) return;
  const c = today();
  const f = c.festival ? FESTIVALS[c.festival] : undefined;
  const item = new ItemStack("minecraft:paper", n);
  item.nameTag = RIBBON;
  item.setLore([`§7${f ? f.name : "A festival"}, Year ${c.year}`, RIBBON_MARK]);
  const inv = player.getComponent("minecraft:inventory")?.container;
  const left = inv ? inv.addItem(item) : item;
  if (left) player.dimension.spawnItem(left, player.location);
}

/** @param {import("@minecraft/server").ItemStack | undefined} it */
const isRibbon = (it) => {
  if (!it || it.typeId !== "minecraft:paper" || it.nameTag !== RIBBON) return false;
  try {
    return it.getLore().includes(RIBBON_MARK);
  } catch {
    return false;
  }
};
/** @param {Player} player */
function ribbonsCarried(player) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  let n = 0;
  if (inv) for (let i = 0; i < inv.size; i++) if (isRibbon(inv.getItem(i))) n += /** @type {ItemStack} */ (inv.getItem(i)).amount;
  return n;
}
/** @param {Player} player @param {number} n */
function takeRibbons(player, n) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv || ribbonsCarried(player) < n) return false;
  let left = n;
  for (let i = 0; i < inv.size && left > 0; i++) {
    const it = inv.getItem(i);
    if (!it || !isRibbon(it)) continue;
    const k = Math.min(it.amount, left);
    if (k >= it.amount) inv.setItem(i, undefined);
    else {
      it.amount -= k;
      inv.setItem(i, it);
    }
    left -= k;
  }
  return true;
}

/**
 * Ribbons up to this festival's cap. Returns how many were given.
 * @param {Player} player @param {Pdata} d @param {number} n
 */
function earnRibbons(player, d, n) {
  const give = Math.max(0, Math.min(n, int("ribbonCap") - d.r));
  if (give > 0) {
    d.r += give;
    giveRibbons(player, give);
  }
  return give;
}

/** @param {string} id */
const activity = (id) => ACTIVITIES.find((a) => a.id === id);

/**
 * One activity done: ribbons and Crowns (within this festival's caps), realm:quest_done, a message.
 * Returns false when it no longer counts (not its festival, or done `activityMax` times).
 * @param {Player} player @param {string} id @param {number} [ribbons]
 */
function complete(player, id, ribbons) {
  const a = activity(id);
  if (!a || festivalNow() !== a.fid) return false;
  const d = pdata(player);
  const max = Math.max(1, int("activityMax"));
  const n = d.a[id] ?? 0;
  if (n >= max) {
    actionbar(player, `§7${a.name}: already done ${max} times this festival.`);
    return false;
  }
  d.a[id] = n + 1;
  const got = earnRibbons(player, d, ribbons ?? int("activityRibbons"));
  const crowns = Math.max(0, Math.min(int("activityCrowns"), int("crownCap") - d.c));
  d.c += crowns;
  addCrowns(player, crowns);
  savePdata(player);
  const parts = [];
  if (got) parts.push(`+${got} Festival Ribbon${got === 1 ? "" : "s"}`);
  if (crowns) parts.push(`+${crowns} Crowns`);
  player.sendMessage(`§6[Festival] ${a.name} (${n + 1}/${max})${parts.length ? `: ${parts.join(", ")}` : ""}.${got < (ribbons ?? int("activityRibbons")) ? " §7(ribbons for this festival are all earned)" : ""}`);
  player.playSound("random.levelup", { pitch: 1.4, volume: 0.6 });
  send("realm:quest_done", { player: player.id, pack: PACK, id: `cal:${id}`, label: a.name, kind: "festival", guild: a.guild });
  return true;
}

/** Is the activity open for this player now (its festival, not used up)? @param {Player} player @param {string} id */
function open(player, id) {
  const a = activity(id);
  return !!a && festivalNow() === a.fid && (pdata(player).a[id] ?? 0) < Math.max(1, int("activityMax"));
}

// ---------------------------------------------------------------------------
// Festival start and end
// ---------------------------------------------------------------------------

/** At load and every dawn: did a festival start or end? */
function festivalCheck() {
  const key = get("festivals") === true ? festKey() : "";
  if (key === meta.fk) return;
  const prev = meta.fk;
  meta.fk = key;
  saveMeta();
  if (prev) festivalEnd(prev);
  if (key) festivalStart(key);
}

/** @param {string} key */
function festivalStart(key) {
  const fid = key.split(":")[1];
  const f = FESTIVALS[fid];
  if (!f) return;
  if (get("announce") === true) {
    world.sendMessage(`${f.color}[Festival] ${f.start} §7${f.blurb} /realm:calendar`);
    for (const p of world.getAllPlayers()) {
      title(p, `${f.color}${f.name}`, "§7A festival begins: /realm:calendar");
      p.playSound("random.levelup", { pitch: 0.9, volume: 0.6 });
    }
  }
  // The same festival again (an operator set the day back): its entries, votes and times stay.
  if (fid === "lantern_fair" && readJson(PROP_FAIR)?.k !== key) writeJson(PROP_FAIR, { k: key, e: {}, v: {} });
  const board = readJson(PROP_BOARD);
  if (fid === "midsummer_regatta" && board?.k !== key) writeJson(PROP_BOARD, { k: key, top: [], best: board?.best });
}

/** @param {string} key */
function festivalEnd(key) {
  const fid = key.split(":")[1];
  const f = FESTIVALS[fid];
  if (!f) return;
  if (get("announce") === true) world.sendMessage(`${f.color}[Festival] ${f.end}`);
  if (fid === "lantern_fair") fairResult(key);
  if (fid === "midsummer_regatta") regattaResult(key);
}

/** The carve-off's winner: the entry with the most votes (ties: the first entered). @param {string} key */
function fairResult(key) {
  const fair = readJson(PROP_FAIR);
  if (!fair || fair.k !== key || !fair.e || fair.done) return;
  let best = "";
  let votes = 0;
  for (const pid of Object.keys(fair.e)) {
    const v = Number(fair.v?.[pid]) || 0;
    if (v > votes) {
      best = pid;
      votes = v;
    }
  }
  const entries = Object.keys(fair.e);
  // A lone entry can't get a vote (nobody votes for their own): on a quiet realm it wins unopposed.
  const unopposed = !best && entries.length === 1;
  if (unopposed) best = entries[0];
  if (!best) {
    world.sendMessage("§6[Lantern Fair] Nobody voted in the carve-off this year. The pumpkins are very disappointed.");
    return;
  }
  const name = String(fair.e[best][0]);
  world.sendMessage(
    unopposed
      ? `§6[Lantern Fair] ${name}'s pumpkin was the only entry, so ${name} wins the Pumpkin Carve-off unopposed!`
      : `§6[Lantern Fair] ${name} won the Pumpkin Carve-off with ${votes} vote${votes === 1 ? "" : "s"}!`,
  );
  send("realm:title_unlock", { player: best, title: "Pumpkin Champion" });
  send("realm:gossip", { kind: "carve_off", player: best, name, n: votes });
  fair.done = 1;
  writeJson(PROP_FAIR, fair);
}

/** The regatta's winner: the best time of this festival. @param {string} key */
function regattaResult(key) {
  const b = readJson(PROP_BOARD);
  if (!b || b.k !== key || !Array.isArray(b.top) || !b.top[0] || b.done) return;
  b.done = 1;
  writeJson(PROP_BOARD, b);
  const [pid, name, ms] = b.top[0];
  world.sendMessage(`§e[Regatta] ${name} won the Midsummer Regatta with ${clock(ms)}!`);
  send("realm:title_unlock", { player: pid, title: "Regatta Champion" });
  send("realm:gossip", { kind: "regatta", player: pid, name, place: clock(ms) });
}

// ---------------------------------------------------------------------------
// Activities that watch what players do
// ---------------------------------------------------------------------------

/** Tide Swim distance and High Dive peaks, in memory. @type {Map<string, { sx?: number, sz?: number, sw: number, peak?: number, dive: number, tale: number, sky: number }>} */
const track = new Map();
/** @param {Player} p */
const trackOf = (p) => {
  let t = track.get(p.id);
  if (!t) track.set(p.id, (t = { sw: 0, dive: 0, tale: 0, sky: 0 }));
  return t;
};

/**
 * The water surface over a column's topmost block, or undefined when it's dry. getTopmostBlock skips water (it
 * answers the bed under it), so this climbs through the water (and kelp, seagrass) above it.
 * @param {import("@minecraft/server").Block | undefined} top @returns {number | undefined}
 */
function waterOver(top) {
  if (!top) return undefined;
  if (/water/.test(top.typeId)) return top.y; // a lily pad, or water reported after all
  let b = top;
  let wet = false;
  try {
    for (let i = 0; i < 64; i++) {
      const up = b.above();
      if (!up || !(up.isLiquid || /water|kelp|seagrass|bubble_column/.test(up.typeId))) break;
      b = up;
      wet = true;
    }
  } catch {
    // the top of the world, or unloaded above
  }
  return wet ? b.y : undefined;
}

/** Is there open sky above the player? @param {Player} p */
function openSky(p) {
  try {
    const top = p.dimension.getTopmostBlock({ x: p.location.x, z: p.location.z });
    return !top || top.y < p.location.y + 0.5;
  } catch {
    return false;
  }
}

/** A lit campfire within 2 blocks? @param {Player} p */
function byCampfire(p) {
  const { x, y, z } = p.location;
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++)
      for (let dy = -1; dy <= 0; dy++) {
        try {
          const b = p.dimension.getBlock({ x: Math.floor(x) + dx, y: Math.floor(y) + dy, z: Math.floor(z) + dz });
          if (b && (b.typeId === "minecraft:campfire" || b.typeId === "minecraft:soul_campfire") && b.permutation.getState("extinguished") !== true) return true;
        } catch {
          // unloaded
        }
      }
  return false;
}

/** Water next to the player's feet (or under them)? @param {Player} p */
function atWater(p) {
  const { x, y, z } = p.location;
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++)
      for (let dy = -1; dy <= 0; dy++) {
        try {
          const b = p.dimension.getBlock({ x: Math.floor(x) + dx, y: Math.floor(y) + dy, z: Math.floor(z) + dz });
          if (b && (b.typeId === "minecraft:water" || b.typeId === "minecraft:flowing_water")) return true;
        } catch {
          // unloaded
        }
      }
  return false;
}

/** The item in the player's hand. @param {Player} p */
function held(p) {
  try {
    return p.getComponent("minecraft:inventory")?.container?.getItem(p.selectedSlotIndex);
  } catch {
    return undefined;
  }
}

/** Every 10 ticks, for each player: swimming, diving, lanterns, campfires, the open sky. */
function watchPlayers() {
  const fid = festivalNow();
  if (!fid) return;
  const dark = night();
  for (const p of world.getAllPlayers()) {
    try {
      if (!p.isValid || p.dimension.id !== OVERWORLD) continue;
      const t = trackOf(p);
      const { x, y, z } = p.location;
      if (fid === "hatchling_tide" && open(p, "tide_swim")) {
        if (p.isInWater && !p.getComponent("minecraft:riding")) {
          if (t.sx !== undefined && t.sz !== undefined) t.sw += Math.min(8, Math.hypot(x - t.sx, z - t.sz));
          t.sx = x;
          t.sz = z;
          if (t.sw >= 100) {
            t.sw = 0;
            complete(p, "tide_swim");
          } else if (Math.floor(t.sw) % 25 < 2 && t.sw > 5) actionbar(p, `§bTide Swim: ${Math.floor(t.sw)}/100 blocks`);
        } else {
          t.sw = 0;
          t.sx = t.sz = undefined;
        }
      }
      if (fid === "midsummer_regatta" && open(p, "high_dive")) {
        if (p.isOnGround || p.isFlying || p.isGliding || p.getComponent("minecraft:riding")) t.peak = y;
        else if (p.isInWater) {
          if (t.peak !== undefined && t.peak - y >= 20 && system.currentTick - t.dive > 200) {
            t.dive = system.currentTick;
            p.sendMessage(`§e[Festival] What a dive! ${Math.floor(t.peak - y)} blocks.`);
            complete(p, "high_dive");
          }
          t.peak = y;
        } else t.peak = Math.max(t.peak ?? y, y);
      }
      if (fid === "lantern_fair" && dark) {
        const d = pdata(p);
        if (p.isSneaking && d.ln !== day && open(p, "lantern_float")) {
          const it = held(p);
          if (it && (it.typeId === "minecraft:lantern" || it.typeId === "minecraft:soul_lantern") && atWater(p)) {
            const inv = p.getComponent("minecraft:inventory")?.container;
            if (inv) {
              if (it.amount > 1) {
                it.amount -= 1;
                inv.setItem(p.selectedSlotIndex, it);
              } else inv.setItem(p.selectedSlotIndex, undefined);
              d.ln = day;
              floatLantern(p);
              p.sendMessage("§6[Festival] Your lantern drifts out over the water and up into the dark.");
              complete(p, "lantern_float");
            }
          }
        }
        if (open(p, "ghost_tale") && system.currentTick % 40 < 10) {
          if (byCampfire(p)) {
            t.tale += 2;
            if (t.tale === 2) actionbar(p, "§6Ghost Tales: sit by the fire and listen...");
            if (t.tale >= 60) {
              t.tale = 0;
              p.sendMessage(TALES[Math.floor(Math.random() * TALES.length)]);
              complete(p, "ghost_tale");
            }
          } else t.tale = 0;
        }
      }
      if (fid === "long_night" && dark) {
        const d = pdata(p);
        // One shooting star a night for everyone (Aurora & Shooting Stars decides if the sky allows it).
        if (d.sn !== day && openSky(p)) {
          d.sn = day;
          savePdata(p);
          send("realm:sky_request", { kind: "shooting_star", player: p.id, from: PACK, reason: "Starwright's Long Night" });
        }
        if (open(p, "stargaze") && system.currentTick % 40 < 10) {
          if (openSky(p)) {
            t.sky += 2;
            if (t.sky === 2) actionbar(p, "§dStarwatch: stay under the open sky...");
            if (t.sky >= 60) {
              t.sky = 0;
              send("realm:sky_request", { kind: "shooting_star", player: p.id, from: PACK, reason: "Starwatch" });
              complete(p, "stargaze");
            }
          } else t.sky = 0;
        }
      }
    } catch (e) {
      console.warn(`[calendar] watch: ${e}`);
    }
  }
}

/** A lantern rising: flame particles going up for a few seconds. @param {Player} p */
function floatLantern(p) {
  const dim = p.dimension;
  const at = { ...p.location };
  let k = 0;
  const h = system.runInterval(() => {
    k++;
    try {
      dim.spawnParticle("minecraft:basic_flame_particle", { x: at.x + Math.sin(k / 3), y: at.y + 1 + k * 0.4, z: at.z + Math.cos(k / 3) });
    } catch {
      // unloaded
    }
    if (k >= 30) system.clearRun(h);
  }, 2);
}

world.afterEvents.playerPlaceBlock.subscribe(({ player, block }) => {
  try {
    const fid = festivalNow();
    if (!fid) return;
    const id = block.typeId;
    if (fid === "lantern_fair" && (id === "minecraft:carved_pumpkin" || id === "minecraft:lit_pumpkin")) enterCarveOff(player, block);
    else if (fid === "long_night" && /candle$/.test(id) && night() && open(player, "candle_vigil")) {
      const d = pdata(player);
      d.cd = (d.cd ?? 0) + 1;
      if (d.cd >= 4) {
        d.cd = 0;
        complete(player, "candle_vigil");
      } else {
        savePdata(player);
        actionbar(player, `§dCandle Vigil: ${d.cd}/4 candles`);
      }
    }
  } catch (e) {
    console.warn(`[calendar] place: ${e}`);
  }
});

world.afterEvents.playerInteractWithEntity.subscribe(({ player, target, beforeItemStack }) => {
  try {
    if (festivalNow() !== "hatchling_tide" || target.typeId !== "minecraft:turtle" || beforeItemStack?.typeId !== "minecraft:seagrass") return;
    feedTurtle(player);
  } catch (e) {
    console.warn(`[calendar] feed: ${e}`);
  }
});

/** @param {Player} player */
function feedTurtle(player) {
  if (!open(player, "turtle_feed")) return;
  const d = pdata(player);
  d.f = (d.f ?? 0) + 1;
  if (d.f >= 5) {
    d.f = 0;
    complete(player, "turtle_feed");
  } else {
    savePdata(player);
    actionbar(player, `§bTurtle Feeding: ${d.f}/5`);
  }
}

world.afterEvents.itemCompleteUse.subscribe(({ source, itemStack }) => {
  try {
    if (!(source instanceof Player) || festivalNow() !== "midsummer_regatta" || !itemStack) return;
    if (!itemStack.getComponent("minecraft:food")) return;
    eatAtPicnic(source, itemStack.typeId);
  } catch (e) {
    console.warn(`[calendar] eat: ${e}`);
  }
});

/** @param {Player} player @param {string} food */
function eatAtPicnic(player, food) {
  const t = world.getTimeOfDay();
  if (!open(player, "picnic") || t >= 12000 || !openSky(player)) return;
  const d = pdata(player);
  const e = (d.e ?? []).filter((x) => x !== food);
  e.push(food);
  d.e = e.slice(-3);
  if (d.e.length >= 3) {
    d.e = [];
    complete(player, "picnic");
  } else {
    savePdata(player);
    actionbar(player, `§eMidsummer Picnic: ${d.e.length}/3 foods`);
  }
}

/** realm:npc_gift { player, npc }: a gift to a townsfolk. @param {any} msg */
function onGift(msg) {
  if (festivalNow() !== "long_night" || typeof msg.player !== "string" || typeof msg.npc !== "string") return;
  const player = online(msg.player);
  if (!player || !open(player, "gift_round")) return;
  const d = pdata(player);
  const g = (d.g ?? []).filter((x) => x !== msg.npc);
  g.push(msg.npc.slice(0, 24));
  d.g = g.slice(-3);
  if (d.g.length >= 3) {
    d.g = [];
    complete(player, "gift_round");
  } else {
    savePdata(player);
    player.sendMessage(`§d[Festival] Gift Round: ${d.g.length}/3 townsfolk.`);
  }
}

// ---------------------------------------------------------------------------
// The Lantern Fair carve-off and vote
// ---------------------------------------------------------------------------

/** @returns {{ k: string, e: Record<string, [string, number, number, number]>, v: Record<string, number>, done?: number }} */
function fairNow() {
  const key = festKey();
  const f = readJson(PROP_FAIR);
  if (f && f.k === key && f.e && f.v) return f;
  return { k: key, e: {}, v: {} };
}

/** @param {Player} player @param {Block} block */
function enterCarveOff(player, block) {
  const fair = fairNow();
  const first = !fair.e[player.id];
  if (!first || Object.keys(fair.e).length < 60) fair.e[player.id] = [player.name.slice(0, 32), block.x, block.y, block.z];
  else return;
  writeJson(PROP_FAIR, fair);
  if (first) {
    player.sendMessage(`§6[Lantern Fair] Your pumpkin at ${block.x}, ${block.y}, ${block.z} is entered in the carve-off. Place another to move your entry. Votes in /realm:calendar.`);
    complete(player, "carve_off");
  } else actionbar(player, `§6Carve-off entry moved to ${block.x}, ${block.z}`);
}

/** @param {Player} player */
async function voteMenu(player) {
  const fair = fairNow();
  const d = pdata(player);
  const entries = Object.entries(fair.e).filter(([pid]) => pid !== player.id);
  const form = new ActionFormData().title("Pumpkin Carve-off");
  if (d.v) {
    const who = fair.e[d.v]?.[0] ?? "someone";
    form.body(`You voted for ${who}'s pumpkin. One vote per festival.\n\nEntries:\n${Object.values(fair.e).map((e) => `${e[0]}: ${e[1]}, ${e[2]}, ${e[3]}`).join("\n") || "none yet"}`).button("OK");
    await show(player, form);
    return;
  }
  if (!entries.length) {
    form.body("No entries from anyone else yet. Place a carved pumpkin or a jack o'lantern to enter your own.").button("OK");
    await show(player, form);
    return;
  }
  form.body("Go and look at them first! Then vote for your favorite. One vote per festival; you can't vote for your own.");
  for (const [, e] of entries) form.button(`${e[0]}'s pumpkin\n§8at ${e[1]}, ${e[2]}, ${e[3]}`);
  form.button("Not yet");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || res.selection >= entries.length || !player.isValid) return;
  const [pid, e] = entries[res.selection];
  const now = fairNow();
  const d2 = pdata(player);
  if (!now.e[pid] || d2.v) return;
  now.v[pid] = (now.v[pid] ?? 0) + 1;
  writeJson(PROP_FAIR, now);
  d2.v = pid;
  savePdata(player);
  player.sendMessage(`§6[Lantern Fair] You voted for ${e[0]}'s pumpkin.`);
  complete(player, "carve_off");
}

// ---------------------------------------------------------------------------
// Nest Watch (Hatchling Tide)
// ---------------------------------------------------------------------------

/** @type {Map<string, { pid: string, id: number, x: number, y: number, z: number, until: number, next: number }>} */
const nests = new Map();
let nestNext = 1;

/** @param {Player} player */
function startNest(player, force = false) {
  if (!force && (!night() || festivalNow() !== "hatchling_tide")) return player.sendMessage("§7[Festival] A Nest Watch is kept at night during the Hatchling Tide.");
  if (!open(player, "nest_watch")) return player.sendMessage("§7[Festival] You've kept your Nest Watches for this festival. The turtles thank you.");
  if (nests.has(player.id)) return player.sendMessage("§7[Festival] You're already keeping a Nest Watch.");
  if (nests.size >= 4) return player.sendMessage("§7[Festival] Four Nest Watches are going already. Try again in a minute.");
  if (player.dimension.id !== OVERWORLD) return player.sendMessage("§7[Festival] The turtles nest in the Overworld.");
  const id = nestNext++;
  const { x, y, z } = player.location;
  const dim = player.dimension;
  const n = Math.max(1, int("nestHatchlings"));
  for (let k = 0; k < n; k++) {
    try {
      const a = (k / n) * Math.PI * 2;
      const e = spawnFresh(dim, "minecraft:turtle", { x: x + Math.cos(a) * 1.5, y: y + 0.2, z: z + Math.sin(a) * 1.5 }, { spawnEvent: "minecraft:entity_born" });
      if (!e) continue;
      e.addTag(FX_TAG);
      e.addTag(`realm:cal_nest_${id}`);
      e.nameTag = "Hatchling";
    } catch (e) {
      console.warn(`[calendar] hatchling: ${e}`);
    }
  }
  nests.set(player.id, { pid: player.id, id, x, y, z, until: system.currentTick + Math.max(20, int("nestSeconds")) * 20, next: system.currentTick + 100 });
  player.sendMessage(`§b[Festival] Nest Watch: ${n} hatchlings are heading for the sea. Keep the mobs off them for ${int("nestSeconds")} seconds! Stay close.`);
}

function nestTick() {
  for (const w of [...nests.values()]) {
    const player = online(w.pid);
    const dim = world.getDimension(OVERWORLD);
    const hatch = dim.getEntities({ tags: [`realm:cal_nest_${w.id}`] }).filter((e) => e.typeId === "minecraft:turtle");
    if (!player || player.dimension.id !== OVERWORLD || Math.hypot(player.location.x - w.x, player.location.z - w.z) > 40) {
      endNest(w, false, player, "§7[Festival] You left the nest. The hatchlings scatter into the water.");
      continue;
    }
    const now = system.currentTick;
    if (now >= w.until) {
      const saved = hatch.length;
      const need = Math.max(1, int("nestSaved"));
      endNest(w, saved >= need, player, saved >= need ? `§b[Festival] ${saved} hatchlings made it to the sea!` : `§7[Festival] Only ${saved} hatchling${saved === 1 ? "" : "s"} made it. ${need} were needed. Try again another night.`);
      continue;
    }
    if (!hatch.length) {
      endNest(w, false, player, "§7[Festival] The hatchlings are lost. Try again another night.");
      continue;
    }
    steadyBar(player, `§bNest Watch: ${hatch.length} hatchlings, ${clock((w.until - now) * 50)}`);
    if (now >= w.next) {
      w.next = now + 300;
      const alive = dim.getEntities({ tags: [`realm:cal_nest_${w.id}`] }).length - hatch.length;
      for (let k = 0; k < 2 && alive + k < 6; k++) {
        const a = Math.random() * Math.PI * 2;
        const d = 12 + Math.random() * 4;
        const at = { x: w.x + Math.cos(a) * d, z: w.z + Math.sin(a) * d };
        try {
          const top = dim.getTopmostBlock(at);
          const water = waterOver(top) !== undefined; // a drowned on the bed under it
          const type = water ? "minecraft:drowned" : Math.random() < 0.3 ? "minecraft:husk" : "minecraft:zombie";
          const e = spawnFresh(dim, type, { x: at.x, y: (top?.y ?? w.y) + 1, z: at.z });
          if (!e) continue;
          e.addTag(FX_TAG);
          e.addTag(`realm:cal_nest_${w.id}`);
        } catch {
          // unloaded
        }
      }
    }
  }
}

/**
 * spawnEntity, checked: a world whose entity ids repeat (an old level.dat put back) can hand back an existing entity
 * (a pet, a dropped item). Tagging that one would have the nest's end remove it, so it's left alone and we spawn again.
 * @param {Dimension} dim @param {string} type @param {Vector3} at @param {import("@minecraft/server").SpawnEntityOptions} [opts]
 */
function spawnFresh(dim, type, at, opts) {
  for (let k = 0; k < 4; k++) {
    const e = dim.spawnEntity(/** @type {any} */ (type), at, opts);
    if (e.typeId === type) return e;
  }
  console.warn(`[calendar] spawning ${type} kept returning another entity`);
  return undefined;
}

/** @param {{ pid: string, id: number }} w @param {boolean} ok @param {Player | undefined} player @param {string} text */
function endNest(w, ok, player, text) {
  nests.delete(w.pid);
  for (const e of world.getDimension(OVERWORLD).getEntities({ tags: [`realm:cal_nest_${w.id}`] })) {
    try {
      e.remove();
    } catch {
      // gone
    }
  }
  if (!player) return;
  player.sendMessage(text);
  if (ok) complete(player, "nest_watch");
}

// ---------------------------------------------------------------------------
// The regatta (Midsummer Regatta)
// ---------------------------------------------------------------------------

/** @type {Map<string, { pid: string, cps: Vector3[], i: number, start: number, off: number, last: number, force?: boolean }>} */
const races = new Map();

/** @param {Entity} e */
const isBoat = (e) => e.typeId === "minecraft:boat" || e.typeId === "minecraft:chest_boat";
/** @param {Player} p */
function inBoat(p) {
  try {
    const r = p.getComponent("minecraft:riding")?.entityRidingOn;
    return !!r && isBoat(r);
  } catch {
    return false;
  }
}

/**
 * The course: `checkpoints` points on a loop that starts and ends at the start, the way the player faces.
 * Each point prefers water (it moves toward the loop's middle until it finds some).
 * @param {Dimension} dim @param {{ x: number, y: number, z: number, h: number }} s
 */
function course(dim, s) {
  const R = Math.max(12, int("regatta.radius"));
  const n = Math.max(3, int("regatta.checkpoints"));
  const h = (s.h * Math.PI) / 180;
  // Facing: Minecraft yaw 0 = +z (south); the loop's center is R to the player's right.
  const fx = -Math.sin(h);
  const fz = Math.cos(h);
  const cx = s.x - fz * R;
  const cz = s.z + fx * R;
  const a0 = Math.atan2(s.z - cz, s.x - cx);
  /** @type {Vector3[]} */
  const cps = [];
  for (let k = 1; k <= n; k++) {
    const a = a0 + (k / (n + 1)) * Math.PI * 2;
    let pt = { x: cx + Math.cos(a) * R, y: s.y, z: cz + Math.sin(a) * R };
    for (const f of [1, 0.8, 0.6, 1.2]) {
      const q = { x: cx + Math.cos(a) * R * f, z: cz + Math.sin(a) * R * f };
      try {
        const surface = waterOver(dim.getTopmostBlock(q));
        if (surface !== undefined) {
          pt = { x: q.x, y: surface + 1, z: q.z };
          break;
        }
      } catch {
        // unloaded: keep the plain point
      }
    }
    cps.push(pt);
  }
  cps.push({ x: s.x, y: s.y, z: s.z });
  return cps;
}

/** @param {Player} player */
function startRace(player, force = false) {
  if (!force && festivalNow() !== "midsummer_regatta") return player.sendMessage("§7[Festival] The regatta is raced during the Midsummer Regatta.");
  if (races.has(player.id)) return player.sendMessage("§7[Festival] You're racing already!");
  if (!force && !inBoat(player)) return player.sendMessage("§7[Festival] Get in a boat on open water first, then start the race.");
  if (player.dimension.id !== OVERWORLD) return player.sendMessage("§7[Festival] The regatta is raced in the Overworld.");
  const c = meta.course;
  const atCourse = c && Math.hypot(player.location.x - c.x, player.location.z - c.z) <= 32;
  const s = atCourse && c ? c : { x: player.location.x, y: player.location.y, z: player.location.z, h: player.getRotation().y };
  const cps = course(player.dimension, s);
  races.set(player.id, { pid: player.id, cps, i: 0, start: system.currentTick, off: 0, last: 0 });
  player.sendMessage(`§e[Regatta] Go! ${cps.length - 1} checkpoints (sparkles mark the next), then back to the start. ${atCourse ? "§7(the realm's course)" : "§7(a course from where you are)"}`);
  player.playSound("note.pling", { pitch: 1.5, volume: 1 });
}

function raceTick() {
  const now = system.currentTick;
  for (const r of [...races.values()]) {
    const p = online(r.pid);
    if (!p || p.dimension.id !== OVERWORLD) {
      races.delete(r.pid);
      continue;
    }
    const elapsed = (now - r.start) * 50;
    if (elapsed > Math.max(30, int("regatta.seconds")) * 1000) {
      races.delete(r.pid);
      p.sendMessage("§7[Regatta] Out of time. The judges have gone for lunch. Try again!");
      continue;
    }
    if (!inBoat(p) && !r.force) {
      r.off++;
      if (r.off > 25) {
        races.delete(r.pid);
        p.sendMessage("§7[Regatta] You left your boat. The race is off.");
        continue;
      }
    } else r.off = 0;
    const cp = r.cps[r.i];
    const dist = Math.hypot(p.location.x - cp.x, p.location.z - cp.z);
    if (dist <= Math.max(3, int("regatta.reach"))) {
      r.i++;
      p.playSound("note.pling", { pitch: 1 + r.i * 0.1, volume: 1 });
      if (r.i >= r.cps.length) {
        races.delete(r.pid);
        finishRace(p, elapsed);
        continue;
      }
    }
    if (now - r.last >= 10) {
      r.last = now;
      const next = r.cps[r.i];
      for (let k = 0; k < 4; k++) {
        try {
          p.spawnParticle("minecraft:villager_happy", { x: next.x + (Math.random() - 0.5) * 2, y: next.y + k * 0.8, z: next.z + (Math.random() - 0.5) * 2 });
        } catch {
          // unloaded
        }
      }
      const label = r.i >= r.cps.length - 1 ? "back to the start" : `checkpoint ${r.i + 1}/${r.cps.length - 1}`;
      steadyBar(p, `§eRegatta: ${label} - ${clock(elapsed)} - ${Math.round(Math.hypot(p.location.x - next.x, p.location.z - next.z))} blocks`);
    }
  }
}

/** @param {Player} p @param {number} ms */
function finishRace(p, ms) {
  const b = readJson(PROP_BOARD);
  const key = festKey();
  const board = b && b.k === key && Array.isArray(b.top) ? b : { k: key, top: [], best: b?.best };
  const mine = board.top.find((/** @type {any[]} */ e) => e[0] === p.id);
  if (!mine || ms < mine[2]) {
    board.top = board.top.filter((/** @type {any[]} */ e) => e[0] !== p.id);
    board.top.push([p.id, p.name.slice(0, 32), ms]);
    board.top.sort((/** @type {any[]} */ a, /** @type {any[]} */ c) => a[2] - c[2]);
    board.top = board.top.slice(0, 10);
  }
  let record = false;
  if (!board.best || ms < board.best[1]) {
    board.best = [p.name.slice(0, 32), ms, today().year];
    record = true;
  }
  writeJson(PROP_BOARD, board);
  const rank = board.top.findIndex((/** @type {any[]} */ e) => e[0] === p.id) + 1;
  p.sendMessage(`§e[Regatta] Finished in ${clock(ms)}! ${rank ? `Place ${rank} on this year's board.` : ""}${record ? " §6A new realm record!" : ""}`);
  complete(p, "regatta", int("regattaRibbons"));
}

// ---------------------------------------------------------------------------
// Choir sieges
// ---------------------------------------------------------------------------

/**
 * @typedef {object} Circle
 * @property {number} x @property {number} y @property {number} z  the bell (the floor is y - 1)
 * @property {number} h bell hits
 * @property {number} s 1 once silenced
 * @property {string} snap the structure that holds the ground from before
 * @property {number} [p] Choir Chanters (pillagers) still to beat there: one that despawns comes back while players are near
 */
/**
 * @typedef {object} Siege
 * @property {number} id
 * @property {"warn" | "on"} st
 * @property {{ id: string, n: string, dim: string, x: number, y: number, z: number, src: string }} town
 * @property {number} t0 warning started (ms)
 * @property {number} t1 circles rise (ms)
 * @property {number} t2 the song is done (ms)
 * @property {number} wave 1 once the reinforcements came
 * @property {Circle[]} c
 * @property {Record<string, [string, number, number]>} who participants: [name, hit 0/1, seconds near]
 * @property {number} [fix] tests: this many pillagers at every circle
 */
/** @type {Siege | undefined} */
let siege;
const saveSiege = () => writeJson(PROP_SIEGE, siege);

/** Towns from Town Projects (realm:town_list). @type {Map<string, { id: string, n: string, dim: string, x: number, y: number, z: number, safe: boolean }>} */
let towns = new Map();
/** @type {Map<string, { id: string, n: string, dim: string, x: number, y: number, z: number, safe: boolean }> | undefined} */
let townsIncoming;
let townParts = 0;
/** @type {Set<number>} */
let townSeen = new Set();
/** @type {{ dim: string, x: number, y: number, z: number } | undefined} */
let lighthouse;
/** Finished main acts by player id (realm:saga_progress). @type {Map<string, number>} */
const acts = new Map();

/** realm:town_list { part, parts, towns: [...] } @param {any} msg */
function onTownList(msg) {
  const parts = Math.floor(Number(msg.parts) || 0);
  if (parts <= 0 || !Array.isArray(msg.towns)) {
    towns = new Map();
    townsIncoming = undefined;
    return;
  }
  const part = Math.floor(Number(msg.part) || 1);
  if (!townsIncoming || townSeen.has(part) || townParts !== parts) {
    townsIncoming = new Map();
    townSeen = new Set();
    townParts = parts;
  }
  townSeen.add(part);
  for (const t of msg.towns) {
    if (!t || typeof t.id !== "string" || !num(t.x) || !num(t.z)) continue;
    townsIncoming.set(t.id, { id: t.id, n: String(t.n ?? t.id).slice(0, 32), dim: typeof t.dim === "string" ? t.dim : OVERWORLD, x: t.x, y: num(t.y) ? t.y : 64, z: t.z, safe: t.safe === true });
  }
  if (townSeen.size >= parts) {
    towns = townsIncoming;
    townsIncoming = undefined;
  }
}

/** Towns a siege may come to now. */
function siegeTowns() {
  const spare = get("spareSafeTowns") === true;
  return [...towns.values()].filter((t) => t.dim === OVERWORLD && !(spare && t.safe) && siegesAt(t.id));
}

/** The Choir's mobs: one less for every 3 Atlas cairns silenced, up to 6. */
const reduction = () => Math.min(6, Math.floor(meta.cairns.length / 3));

/** Who could draw a siege: non-AFK Overworld players. */
function eligible() {
  const list = world.getAllPlayers().filter((p) => p.isValid && p.dimension.id === OVERWORLD && !afk(p) && p.getGameMode() !== GameMode.Spectator);
  const enough = list.length >= Math.max(1, int("siegeMinPlayers")) || list.some((p) => (acts.get(p.id) ?? 0) >= 2);
  return enough ? list : [];
}

/** The best target near the players: a town (the one with most players near), the lighthouse, world spawn. @param {Player[]} players */
function pickTarget(players, anyTown = false) {
  const near = (/** @type {{ x: number, z: number }} */ c, r = 192) => players.filter((p) => Math.hypot(p.location.x - c.x, p.location.z - c.z) <= r).length;
  const list = siegeTowns()
    .map((t) => ({ t, n: near(t) }))
    .filter((e) => anyTown || e.n > 0)
    .sort((a, b) => b.n - a.n);
  if (list[0]) {
    const t = list[0].t;
    return { id: t.id, n: t.n, dim: t.dim, x: t.x, y: t.y, z: t.z, src: "town" };
  }
  if (lighthouse && lighthouse.dim === OVERWORLD && (anyTown || near(lighthouse) > 0)) return { id: "lighthouse", n: "the Lighthouse", dim: OVERWORLD, x: lighthouse.x, y: lighthouse.y, z: lighthouse.z, src: "place" };
  const sp = world.getDefaultSpawnLocation();
  if (anyTown || near(sp) > 0) return { id: "spawn", n: "the town square", dim: OVERWORLD, x: sp.x, y: sp.y < 32000 ? sp.y : 64, z: sp.z, src: "spawn" };
  return undefined;
}

/** Every 10 seconds: may a siege start tonight? @param {boolean} [force] skip the rules @param {number} [chanceOverride] */
function siegeRoll(force = false, chanceOverride) {
  if (siege || !owned) return;
  if (!force) {
    if (get("sieges") !== true || !night()) return;
    if (meta.tried === day) return;
    if (day - meta.last < Math.max(1, int("siegeGapDays"))) return;
    if (today().festival === "long_night" && get("festivals") === true) return; // the truce
  }
  const players = eligible();
  if (!players.length && !force) return;
  const target = pickTarget(players.length ? players : world.getAllPlayers(), force);
  if (!target) return;
  if (!force) {
    meta.tried = day;
    saveMeta();
    const chance = Math.max(0, Math.min(100, chanceOverride ?? (Number(get("siegeChance")) || 0))) * (festivalNow() === "lantern_fair" ? 2 : 1);
    if (Math.random() * 100 >= chance) return;
  }
  startSiege(target);
}

/** @param {Siege["town"]} town @param {number} [warnMs] */
function startSiege(town, warnMs) {
  const now = Date.now();
  const warn = warnMs ?? Math.max(0, Number(get("warnMinutes")) || 0) * 60000;
  siege = { id: (now % 1e8) + Math.floor(Math.random() * 1000), st: "warn", town, t0: now, t1: now + warn, t2: 0, wave: 0, c: [], who: {} };
  saveSiege();
  const min = Math.round(warn / 60000);
  const line = SIEGE_LINES.warn.replace("{town}", town.n).replace("{min}", min < 1 ? "moments" : `${min} minute${min === 1 ? "" : "s"}`);
  for (const p of world.getAllPlayers()) {
    if (p.dimension.id !== OVERWORLD) continue;
    p.sendMessage(line);
    title(p, "§cThe Choir is coming", `§7to ${town.n}`);
    p.playSound("mob.evocation_illager.prepare_summon", { volume: 0.6, pitch: 0.7 });
  }
  send("realm:siege", { state: "warn", town: town.n, id: town.id });
  sendMarks();
  send("realm:sky_event", { kind: "siege", dim: OVERWORLD, x: Math.round(town.x), z: Math.round(town.z), text: `The Gray Choir comes to ${town.n}` });
}

/** Asks Land Claims whether a claim covers the box (no answer within a second: none). @type {Map<string, (n: number) => void>} */
const claimAsks = new Map();
/** @param {number} x @param {number} z @param {number} r */
function claimsNear(x, z, r) {
  if (installed.size && !installed.has("claims_bp")) return Promise.resolve(0);
  const id = `cal${system.currentTick}${Math.floor(Math.random() * 1e6)}`;
  return new Promise((resolve) => {
    claimAsks.set(id, resolve);
    send("realm:claims_check", { id, player: "", dim: OVERWORLD, x1: x - r, z1: z - r, x2: x + r, z2: z + r });
    system.runTimeout(() => {
      if (claimAsks.delete(id)) resolve(0);
    }, 20);
  });
}

/** The ground at x, z: the top block's height, or undefined if it won't do for a circle. @param {Dimension} dim @param {number} x @param {number} z */
function groundAt(dim, x, z) {
  try {
    const top = dim.getTopmostBlock({ x, z });
    if (!top) return undefined;
    const id = top.typeId;
    if (top.isLiquid || TREE.test(id) || BUILT.test(id)) return undefined;
    // Plants on top: the ground is the block under them.
    if (SOFT.test(id)) {
      const below = top.below();
      if (!below || below.isLiquid || below.isAir || BUILT.test(below.typeId) || TREE.test(below.typeId) || SOFT.test(below.typeId)) return undefined;
      return below.y;
    }
    return top.y;
  } catch {
    return undefined;
  }
}

/** A spot for a Ritual Circle: open, flat, natural ground, outside zones and claims. @param {Dimension} dim @param {number} x @param {number} z */
async function circleSpot(dim, x, z) {
  x = Math.floor(x);
  z = Math.floor(z);
  const no = (/** @type {string} */ why) => {
    spotRejects[why] = (spotRejects[why] ?? 0) + 1;
    return undefined;
  };
  if (protectedBox(OVERWORLD, { x: x - 4, z: z - 4 }, { x: x + 4, z: z + 4 })) {
    const out = escapeZones(OVERWORLD, x, z, 6);
    if (!out || !siege || Math.hypot(out.x - siege.town.x, out.z - siege.town.z) > 180) return no("zone");
    x = Math.floor(out.x);
    z = Math.floor(out.z);
  }
  const y0 = groundAt(dim, x, z);
  if (y0 === undefined) return no("ground");
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++) {
      const y = groundAt(dim, x + dx, z + dz);
      if (y === undefined || Math.abs(y - y0) > 1) return no("uneven");
      // Nothing built over the circle (a roof, a tree) and nothing of a player's on it.
      for (let yy = y + 1; yy <= y0 + 3; yy++) {
        try {
          const b = dim.getBlock({ x: x + dx, y: yy, z: z + dz });
          if (!b || (!b.isAir && !SOFT.test(b.typeId))) return no("covered");
        } catch {
          return no("unloaded");
        }
      }
    }
  if ((await claimsNear(x, z, 8)) > 0) return no("claim");
  return { x, y: y0, z };
}

/** Ticking areas that load the circles' ground (a town's safe zone pushes them past what players keep loaded). */
const AREA_SLOTS = 3;
const areaName = (/** @type {number} */ i) => `realm_siege_${i}`;
/** Some of the siege's ticking areas may be up (true after a load: one may be left from before a restart). */
let areasUp = true;
/** @param {Dimension} dim @param {string} command */
function tryCommand(dim, command) {
  try {
    return dim.runCommand(command).successCount > 0;
  } catch {
    return false;
  }
}
/** @param {Dimension} dim @param {number} x @param {number} z */
function isLoaded(dim, x, z) {
  try {
    // getTopmostBlock can answer before the chunk ticks (air at the top of the world): the block under it must read too.
    const top = dim.getTopmostBlock({ x, z });
    return !!top && !top.isAir && !!dim.getBlock({ x, y: top.y - 1, z });
  } catch {
    return false;
  }
}
/** Loads the ground around x, z with ticking area `i` (2 chunks around) and waits up to 15 seconds for it. @param {Dimension} dim @param {number} i @param {number} x @param {number} z */
async function loadGround(dim, i, x, z) {
  x = Math.floor(x);
  z = Math.floor(z);
  if (isLoaded(dim, x, z) && isLoaded(dim, x + 24, z + 24) && isLoaded(dim, x - 24, z - 24)) return true;
  tryCommand(dim, `tickingarea remove ${areaName(i)}`);
  if (!tryCommand(dim, `tickingarea add circle ${x} 64 ${z} 2 ${areaName(i)} true`)) console.warn(`[calendar] tickingarea add ${areaName(i)} failed (10 ticking areas already?)`);
  areasUp = true;
  for (let k = 0; k < 30; k++) {
    await system.waitTicks(10);
    if (isLoaded(dim, x, z) && isLoaded(dim, x + 24, z + 24) && isLoaded(dim, x - 24, z - 24)) return true;
  }
  return isLoaded(dim, x, z);
}
/** @param {number} [i] one slot, or every slot */
function dropAreas(i) {
  const dim = world.getDimension(OVERWORLD);
  for (let k = 0; k < AREA_SLOTS; k++) if (i === undefined || i === k) tryCommand(dim, `tickingarea remove ${areaName(k)}`);
  if (i === undefined) areasUp = false;
}

/** Why spots were turned down while the circles rose (for the content log when none fit). @type {Record<string, number>} */
let spotRejects = {};

/** @param {string} id @param {Record<string, string | number | boolean>} [states] */
function perm(id, states) {
  try {
    return BlockPermutation.resolve(id, states);
  } catch {
    return BlockPermutation.resolve(id);
  }
}

/** Builds a circle: snapshot first, then the 3x3 gray concrete floor, the bell and 4 lit candles. @param {Dimension} dim @param {{ x: number, y: number, z: number }} s @param {number} i */
function buildCircle(dim, s, i) {
  if (!siege) return undefined;
  const snap = `cal:circle_${siege.id}_${i}`;
  const min = { x: s.x - 1, y: s.y, z: s.z - 1 };
  const max = { x: s.x + 1, y: s.y + 2, z: s.z + 1 };
  try {
    if (world.structureManager.get(snap)) world.structureManager.delete(snap);
    world.structureManager.createFromWorld(snap, dim, min, max, { includeBlocks: true, includeEntities: false, saveMode: StructureSaveMode.World });
  } catch (e) {
    console.warn(`[calendar] snapshot: ${e}`);
    return undefined;
  }
  // Saved before anything changes, so a restart now still puts the ground back.
  writePending([...pendingCache, [snap, OVERWORLD, min.x, min.y, min.z]].slice(-30));
  const air = perm("minecraft:air");
  const floor = perm("minecraft:gray_concrete");
  const candle = perm("minecraft:white_candle", { candles: 0, lit: true });
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) {
      dim.getBlock({ x: s.x + dx, y: s.y, z: s.z + dz })?.setPermutation(floor);
      for (let dy = 1; dy <= 2; dy++) dim.getBlock({ x: s.x + dx, y: s.y + dy, z: s.z + dz })?.setPermutation(air);
      if (dx !== 0 && dz !== 0) dim.getBlock({ x: s.x + dx, y: s.y + 1, z: s.z + dz })?.setPermutation(candle);
    }
  dim.getBlock({ x: s.x, y: s.y + 1, z: s.z })?.setPermutation(perm("minecraft:bell", { attachment: "standing" }));
  return { x: s.x, y: s.y + 1, z: s.z, h: 0, s: 0, snap };
}

/** Puts a circle's ground back where the circle (or nothing) is now. Returns false while it isn't loaded. @param {string} snap @param {Vector3} min */
function restoreCircle(snap, min) {
  const dim = world.getDimension(OVERWORLD);
  try {
    if (!dim.getBlock(min) || !dim.getBlock({ x: min.x + 2, y: min.y, z: min.z + 2 })) return false;
  } catch {
    return false;
  }
  const st = world.structureManager.get(snap);
  if (st) {
    const air = perm("minecraft:air");
    for (let dy = 0; dy <= 2; dy++)
      for (let dx = 0; dx <= 2; dx++)
        for (let dz = 0; dz <= 2; dz++) {
          try {
            const b = dim.getBlock({ x: min.x + dx, y: min.y + dy, z: min.z + dz });
            if (!b) continue;
            const want = st.getBlockPermutation({ x: dx, y: dy, z: dz }) ?? air;
            if (b.permutation.matches(want.type.id, want.getAllStates())) continue;
            if (!b.isAir && !b.isLiquid && !CIRCLE_KINDS.has(b.typeId)) continue; // someone's own block since
            b.setPermutation(want);
          } catch (e) {
            console.warn(`[calendar] restore: ${e}`);
          }
        }
    try {
      world.structureManager.delete(snap);
    } catch {
      // gone
    }
  }
  writePending(pendingCache.filter((r) => r[0] !== snap));
  return true;
}

/** Circles still to be put back, in memory (the break guard reads it on every block broken). @type {[string, string, number, number, number][]} */
let pendingCache = [];
/** @param {unknown} list */
function writePending(list) {
  pendingCache = Array.isArray(list) ? /** @type {any} */ (list) : [];
  writeJson(PROP_RESTORE, pendingCache);
}

/** Every 10 seconds: circles left over from before (a restart, an unloaded spot) are put back once loaded. */
function restorePending() {
  // Once no siege runs and every circle is put back, its ticking areas go.
  if (!siege && areasUp && !pendingCache.length) dropAreas();
  if (!pendingCache.length) return;
  for (const r of [...pendingCache]) {
    if (siege && siege.c.some((c) => c.snap === r[0])) continue;
    if (!Array.isArray(r) || typeof r[0] !== "string") continue;
    restoreCircle(r[0], { x: r[2], y: r[3], z: r[4] });
  }
}

/** Is a block part of a circle of the running siege? @param {Vector3} b */
function inCircle(b) {
  if (!siege || siege.st !== "on") return undefined;
  return siege.c.find((c) => Math.abs(b.x - c.x) <= 1 && Math.abs(b.z - c.z) <= 1 && b.y >= c.y - 1 && b.y <= c.y + 1);
}
/** Is a block inside any circle not yet put back (running, being raised, or waiting after a restart)? @param {Vector3} b */
const inAnyCircle = (b) => pendingCache.some((r) => b.x >= r[2] && b.x <= r[2] + 2 && b.y >= r[3] && b.y <= r[3] + 2 && b.z >= r[4] && b.z <= r[4] + 2);

/** Removes a pillager's banner (no captain, no Bad Omen). @param {Entity} e */
function noBanner(e) {
  try {
    e.runCommand("replaceitem entity @s slot.armor.head 0 air");
  } catch {
    // nothing worn
  }
}

/** @param {Dimension} dim @param {Circle} c @param {number} i @param {string} type @param {boolean} singer */
function spawnChoir(dim, c, i, type, singer) {
  if (!siege) return;
  const alive = dim.getEntities({ tags: [SIEGE_TAG] }).length;
  if (alive >= MAX_MOBS) return;
  const a = Math.random() * Math.PI * 2;
  const d = singer ? 2.5 : 3 + Math.random() * 3;
  const at = { x: c.x + 0.5 + Math.cos(a) * d, z: c.z + 0.5 + Math.sin(a) * d };
  try {
    const top = dim.getTopmostBlock(at);
    const y = top && waterOver(top) === undefined && Math.abs(top.y - c.y) < 5 ? top.y + 1 : c.y;
    // A world whose entity ids repeat (an old level.dat put back) can hand back another entity: leave that one alone
    // and spawn again (the next id is usually free).
    let e = dim.spawnEntity(/** @type {any} */ (type), { x: at.x, y, z: at.z });
    for (let k = 0; k < 8 && e.typeId !== type; k++) e = dim.spawnEntity(/** @type {any} */ (type), { x: at.x, y, z: at.z });
    if (e.typeId !== type) return;
    e.addTag(SIEGE_TAG);
    e.addTag(`realm:siege_${siege.id}`);
    e.addTag(`realm:siege_c${i}`);
    // Named, so they don't despawn while the players are 32+ blocks away (the end of the siege removes them).
    if (singer) {
      e.addTag(`realm:siege_s${i}`);
      e.nameTag = "§7Choir Singer";
    } else e.nameTag = "§7Choir Chanter";
    noBanner(e);
  } catch (e) {
    console.warn(`[calendar] spawn ${type}: ${e}`);
  }
}

/** After the warning: three circles around the target, their Choir; or the Choir scatters. */
async function raiseCircles() {
  const s = siege;
  if (!s || s.st !== "warn") return;
  s.st = "on"; // nothing else starts this twice
  const dim = world.getDimension(OVERWORLD);
  const base = Math.random() * Math.PI * 2;
  spotRejects = {};
  /** @type {Circle[]} */
  const circles = [];
  let tries = 0;
  /** Tries a spot; true once a circle stands there. @param {number} x @param {number} z @returns {Promise<boolean>} */
  const tryAt = async (x, z) => {
    if (++tries % 8 === 0) await system.waitTicks(1); // spread the block reads over ticks
    if (siege !== s) return false;
    const spot = await circleSpot(dim, x, z);
    if (!spot || siege !== s) return false;
    if (circles.some((c) => Math.hypot(c.x - spot.x, c.z - spot.z) < 24)) return false;
    const c = buildCircle(dim, spot, circles.length);
    if (c) circles.push(c);
    return !!c;
  };
  // Three ways around the town, 48 to 96 blocks out, or just past its safe zone. Nobody may be out there to keep
  // the ground loaded (players keep about 4 chunks around them), so a ticking area loads it first.
  for (let i = 0; i < 3 && siege === s; i++) {
    const a = base + (i * Math.PI * 2) / 3;
    const d = 48 + Math.random() * 48;
    const out = escapeZones(OVERWORLD, s.town.x + Math.cos(a) * d, s.town.z + Math.sin(a) * d, 10);
    if (!out || Math.hypot(out.x - s.town.x, out.z - s.town.z) > 180) continue;
    const had = circles.length;
    if (await loadGround(dim, i, out.x, out.z)) {
      for (let k = 0; k < 24 && siege === s; k++) {
        const r = k === 0 ? 0 : 4 + Math.random() * 18;
        const b = Math.random() * Math.PI * 2;
        if (await tryAt(out.x + Math.cos(b) * r, out.z + Math.sin(b) * r)) break;
      }
    }
    if (circles.length === had) dropAreas(i);
  }
  // Too built up (or too far from anyone, in unloaded ground): around the players near the town instead, where
  // the ground is loaded, still within 180 blocks of the town.
  const nearby = world.getAllPlayers().filter((p) => near(p, 220));
  for (let k = 0; k < 60 && circles.length < 3 && nearby.length && siege === s; k++) {
    const p = nearby[k % nearby.length];
    if (!p.isValid) continue;
    const a = Math.random() * Math.PI * 2;
    const d = 12 + Math.random() * 36;
    const x = p.location.x + Math.cos(a) * d;
    const z = p.location.z + Math.sin(a) * d;
    if (Math.hypot(x - s.town.x, z - s.town.z) > 180) continue;
    await tryAt(x, z);
  }
  if (siege !== s) return;
  if (!circles.length) {
    console.warn(`[calendar] no spot for a Ritual Circle around ${s.town.n}: ${JSON.stringify(spotRejects)}`);
    endSiege("scattered", true);
    return;
  }
  s.c = circles;
  s.t1 = Date.now();
  s.t2 = s.t1 + Math.max(1, Number(get("siegeMinutes")) || 12) * 60000;
  // The Choir: a Singer and 4-6 pillagers at each circle, fewer for every 3 Atlas cairns silenced.
  let less = reduction();
  const lo = Math.max(1, int("pillagersMin"));
  const hi = Math.max(lo, int("pillagersMax"));
  const counts = circles.map(() => s.fix ?? lo + Math.floor(Math.random() * (hi - lo + 1)));
  for (let k = 0; less > 0 && k < 30; k++) {
    const i = k % counts.length;
    if (counts[i] > 1) {
      counts[i]--;
      less--;
    }
  }
  circles.forEach((c, i) => {
    c.p = counts[i];
    spawnChoir(dim, c, i, "minecraft:vindicator", true);
    for (let k = 0; k < counts[i]; k++) spawnChoir(dim, c, i, "minecraft:pillager", false);
  });
  saveSiege();
  const line = SIEGE_LINES.rise.replace("{town}", s.town.n).replace("{hits}", String(int("bellHits"))).replace("{minutes}", String(Math.round((s.t2 - s.t1) / 60000)));
  for (const p of world.getAllPlayers()) if (p.dimension.id === OVERWORLD) p.sendMessage(`${line} §7Circles: ${circles.map((c) => `${c.x}, ${c.z}`).join(" / ")}`);
  send("realm:siege", { state: "on", town: s.town.n, id: s.town.id });
  sendMarks();
}

/** @type {Map<string, number>} */
const lastBell = new Map();
/** A hit or a tap on a circle's bell. @param {Player} player @param {Vector3} b */
function bellHit(player, b) {
  if (!siege || siege.st !== "on") return;
  const i = siege.c.findIndex((c) => c.x === b.x && c.y === b.y && c.z === b.z);
  if (i < 0) return;
  const c = siege.c[i];
  if (c.s) return;
  const now = system.currentTick;
  if (now - (lastBell.get(player.id) ?? -100) < 6) return;
  lastBell.set(player.id, now);
  join(player, true);
  const dim = world.getDimension(OVERWORLD);
  if (dim.getEntities({ tags: [`realm:siege_s${i}`, `realm:siege_${siege.id}`] }).some((e) => e.isValid)) {
    actionbar(player, "§cThe Choir Singer guards this bell. Beat them first!");
    return;
  }
  c.h++;
  const need = Math.max(1, int("bellHits"));
  try {
    dim.playSound("block.bell.hit", { x: c.x, y: c.y, z: c.z }, { volume: 1, pitch: 0.6 + c.h * 0.1 });
  } catch {
    // no sound
  }
  if (c.h < need) {
    actionbar(player, `§eBell: ${c.h}/${need}`);
    saveSiege();
    return;
  }
  c.s = 1;
  // The circle's Choir loses heart: its pillagers leave.
  for (const e of dim.getEntities({ tags: [`realm:siege_c${i}`, `realm:siege_${siege.id}`] })) {
    try {
      e.remove();
    } catch {
      // gone
    }
  }
  const n = siege.c.filter((x) => x.s).length;
  const line = SIEGE_LINES.bell.replace("{n}", String(n)).replace("{all}", String(siege.c.length));
  for (const p of world.getAllPlayers()) if (p.dimension.id === OVERWORLD && near(p, 200)) p.sendMessage(line);
  saveSiege();
  if (n >= siege.c.length) endSiege("held");
  else sendMarks();
}

/**
 * Where to go, for the Minimap's compass: realm:siege_marks { dim, town: { n, x, z }, circles: [{ x, z }] } (the
 * circles still singing; none during the warning), or {} when no siege runs. Also the answer to realm:siege_ping.
 */
function sendMarks() {
  const s = siege;
  send("realm:siege_marks", s ? { dim: OVERWORLD, town: { n: s.town.n, x: Math.floor(s.town.x), z: Math.floor(s.town.z) }, circles: s.c.filter((c) => !c.s).map((c) => ({ x: c.x, z: c.z })) } : {});
}

/** "NE 64m" from a player to a spot, or "here" within 4 blocks. @param {Player} p @param {{ x: number, z: number }} at */
function toward(p, at) {
  const dx = at.x + 0.5 - p.location.x;
  const dz = at.z + 0.5 - p.location.z;
  const d = Math.hypot(dx, dz);
  if (d <= 4) return "here";
  const deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360 + 22.5) % 360;
  return `${["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.floor(deg / 45) % 8]} ${Math.round(d)}m`;
}

/** The nearest circle still singing, or undefined. @param {Player} p */
function nearestCircle(p) {
  if (!siege) return undefined;
  let best;
  let bestD = Infinity;
  for (const c of siege.c) {
    if (c.s) continue;
    const d = Math.hypot(c.x - p.location.x, c.z - p.location.z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Within r blocks of the siege's town? @param {Player} p @param {number} r */
const near = (p, r) => !!siege && p.dimension.id === OVERWORLD && Math.hypot(p.location.x - siege.town.x, p.location.z - siege.town.z) <= r;

/** Marks a participant. @param {Player} p @param {boolean} hit */
function join(p, hit) {
  if (!siege) return;
  const w = siege.who[p.id] ?? [p.name.slice(0, 32), 0, 0];
  if (hit) w[1] = 1;
  if (!siege.who[p.id] && Object.keys(siege.who).length >= 40) return;
  siege.who[p.id] = w;
}
/** @param {Siege} s @param {string} pid */
const takesPart = (s, pid) => !!s.who[pid] && (s.who[pid][1] === 1 || s.who[pid][2] >= 180);

/** Every second while a siege runs: the side box, the clock, participants, the wave, the end. */
function siegeTick() {
  const s = siege;
  if (!s) return;
  const now = Date.now();
  if (s.st === "warn") {
    for (const p of world.getAllPlayers()) if (near(p, 220)) side.show(p, "left1", `§cChoir siege: ${s.town.n}\n§7Circles rise in ${clock(s.t1 - now)}\n§fTown center ${toward(p, s.town)}`, 40);
    if (now >= s.t1) raiseCircles().catch((e) => console.warn(`[calendar] circles: ${e}`));
    return;
  }
  if (!s.c.length) return; // circles being placed
  if (now >= s.t2) {
    endSiege("failed");
    return;
  }
  const done = s.c.filter((c) => c.s).length;
  for (const p of world.getAllPlayers()) {
    if (!near(p, 220)) continue;
    const c = nearestCircle(p);
    side.show(p, "left1", `§cChoir siege: ${s.town.n}\n§7${clock(s.t2 - now)} - bells ${done}/${s.c.length}${c ? `\n§fNearest circle ${toward(p, c)}` : ""}`, 40);
  }
  if (!s.wave && now >= s.t1 + (s.t2 - s.t1) / 2) {
    s.wave = 1;
    const dim = world.getDimension(OVERWORLD);
    s.c.forEach((c, i) => {
      if (c.s) return;
      c.p = (c.p ?? 0) + 2;
      spawnChoir(dim, c, i, "minecraft:pillager", false);
      spawnChoir(dim, c, i, "minecraft:pillager", false);
    });
    for (const p of world.getAllPlayers()) if (near(p, 220)) p.sendMessage(SIEGE_LINES.wave);
    saveSiege();
  }
}

/** Every 5 seconds: players near the siege count toward taking part (3 minutes); circles keep their Choir. */
function siegePresence() {
  const s = siege;
  if (!s || s.st !== "on" || !s.c.length) return;
  // Pillagers despawn 32+ blocks from every player: a circle's Chanters not yet beaten come back as players near it.
  const dim = world.getDimension(OVERWORLD);
  const players = dim.getPlayers();
  s.c.forEach((c, i) => {
    if (c.s || !(c.p ?? 0) || !players.some((p) => Math.hypot(p.location.x - c.x, p.location.z - c.z) <= 40)) return;
    const alive = dim.getEntities({ tags: [`realm:siege_${s.id}`, `realm:siege_c${i}`] }).filter((e) => !e.hasTag(`realm:siege_s${i}`)).length;
    for (let k = alive; k < (c.p ?? 0); k++) spawnChoir(dim, c, i, "minecraft:pillager", false);
  });
  for (const p of world.getAllPlayers()) {
    if (afk(p)) continue;
    if (!near(p, 96) && !s.c.some((c) => p.dimension.id === OVERWORLD && Math.hypot(p.location.x - c.x, p.location.z - c.z) <= 96)) continue;
    join(p, false);
    const w = s.who[p.id];
    if (w) w[2] += 5;
  }
}

/** @param {"held" | "failed" | "scattered"} result @param {boolean} [noGround] scattered because no circle could rise */
function endSiege(result, noGround = false) {
  const s = siege;
  if (!s) return;
  siege = undefined;
  saveSiege();
  const dim = world.getDimension(OVERWORLD);
  for (const e of dim.getEntities({ tags: [`realm:siege_${s.id}`] })) {
    try {
      e.remove();
    } catch {
      // gone
    }
  }
  for (const c of s.c) restoreCircle(c.snap, { x: c.x - 1, y: c.y - 1, z: c.z - 1 });
  for (const p of world.getAllPlayers()) side.clear(p);
  if (result !== "scattered" || s.c.length) {
    meta.last = day;
    saveMeta();
  }
  addHistory(s.town.n, result);
  send("realm:siege", { state: "end", town: s.town.n, id: s.town.id, result });
  sendMarks();
  if (result === "scattered") {
    const line = noGround ? SIEGE_LINES.noGround.replace("{town}", s.town.n) : SIEGE_LINES.scattered;
    for (const p of world.getAllPlayers()) if (p.dimension.id === OVERWORLD) p.sendMessage(line);
    return;
  }
  const held = result === "held";
  const line = (held ? SIEGE_LINES.held : SIEGE_LINES.failed).replace("{town}", s.town.n);
  for (const p of world.getAllPlayers()) {
    if (p.dimension.id !== OVERWORLD) continue;
    p.sendMessage(line);
    if (held) title(p, "§6The siege is broken", `§7${s.town.n} held`);
  }
  const who = Object.keys(s.who).filter((pid) => takesPart(s, pid));
  for (const pid of who) {
    const p = online(pid);
    const name = s.who[pid][0];
    if (held) send("realm:gossip", { kind: "siege", player: pid, name, place: s.town.n });
    else send("realm:gossip", { kind: "siege_lost", player: pid, name, place: s.town.n });
    if (!p) continue;
    if (held) {
      addCrowns(p, int("heldCrowns"));
      const rep = Math.max(0, int("heldRep") - 10);
      if (rep) send("realm:rep_add", { player: pid, guild: "wardens", amount: rep, reason: "Choir siege" });
      send("realm:quest_done", { player: pid, pack: PACK, id: `calendar:siege:${s.town.id}`, label: `Choir siege at ${s.town.n}`, kind: "siege", guild: "wardens" });
      send("realm:skill_xp", { player: pid, skill: "combat", amount: int("heldXp") });
      p.sendMessage(`§6+${int("heldCrowns")} Crowns for holding ${s.town.n}.`);
      p.sendMessage(SIEGE_LINES.reyes);
    } else {
      addCrowns(p, int("failedCrowns"));
      p.sendMessage(`§7+${int("failedCrowns")} Crowns for standing with ${s.town.n}.`);
      p.sendMessage(SIEGE_LINES.hollis);
    }
  }
  if (s.town.src === "town") setMood(s.town.id, s.town.n, held ? "heartened" : "shaken");
}

/** After a restart: a siege that was running ends with no result; its mobs go and its circles are put back. */
function resumeAfterRestart() {
  const s = readJson(PROP_SIEGE);
  if (!s || typeof s !== "object" || !s.town) return;
  siege = s;
  endSiege("scattered");
}

// Circle blocks can't be broken or blown up while the siege runs.
world.beforeEvents.playerBreakBlock.subscribe((ev) => {
  if (pendingCache.length && inAnyCircle(ev.block)) {
    ev.cancel = true;
    const player = ev.player;
    system.run(() => actionbar(player, "§7The circle's stones won't move. Silence its bell instead."));
  }
});
world.beforeEvents.explosion.subscribe((ev) => {
  if (!pendingCache.length) return;
  const blocks = ev.getImpactedBlocks();
  const keep = blocks.filter((b) => !inAnyCircle(b));
  if (keep.length !== blocks.length) ev.setImpactedBlocks(keep);
});
world.afterEvents.entityHitBlock.subscribe(({ damagingEntity, hitBlock }) => {
  if (!siege || !(damagingEntity instanceof Player) || hitBlock.typeId !== "minecraft:bell") return;
  try {
    bellHit(damagingEntity, hitBlock);
  } catch (e) {
    console.warn(`[calendar] bell: ${e}`);
  }
});
world.afterEvents.playerInteractWithBlock.subscribe(({ player, block }) => {
  if (!siege || block.typeId !== "minecraft:bell") return;
  try {
    bellHit(player, block);
  } catch (e) {
    console.warn(`[calendar] bell: ${e}`);
  }
});
world.afterEvents.entityHurt.subscribe(({ hurtEntity, damageSource }) => {
  if (!siege) return;
  try {
    const by = damageSource.damagingEntity;
    if (by instanceof Player && hurtEntity.hasTag(SIEGE_TAG)) join(by, true);
  } catch {
    // gone
  }
});
world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (!siege) return;
  try {
    if (!deadEntity.hasTag(SIEGE_TAG) || !deadEntity.hasTag(`realm:siege_${siege.id}`)) return;
    const tags = deadEntity.getTags();
    if (!tags.some((t) => /^realm:siege_s\d$/.test(t))) {
      // A Chanter beaten: one less to come back.
      const i = Number(tags.find((t) => /^realm:siege_c\d$/.test(t))?.slice(13));
      const c = Number.isInteger(i) ? siege.c[i] : undefined;
      if (c) c.p = Math.max(0, (c.p ?? 0) - 1);
      return;
    }
    const loc = deadEntity.location;
    for (const p of world.getAllPlayers()) if (p.dimension.id === OVERWORLD && Math.hypot(p.location.x - loc.x, p.location.z - loc.z) < 64) p.sendMessage("§7[Siege] §eA Choir Singer falls. Strike the bell!");
  } catch {
    // gone
  }
});
// Choir mobs and Nest Watch mobs from before (a restart, a chunk unloaded mid-fight) go when they load.
world.afterEvents.entityLoad.subscribe(({ entity }) => {
  try {
    if (entity.hasTag(SIEGE_TAG) && !(siege && entity.hasTag(`realm:siege_${siege.id}`))) entity.remove();
    else if (entity.hasTag(FX_TAG) && ![...nests.values()].some((w) => entity.hasTag(`realm:cal_nest_${w.id}`))) entity.remove();
  } catch {
    // gone
  }
});

// ---------------------------------------------------------------------------
// The ribbon stall
// ---------------------------------------------------------------------------

/** @param {Player} player */
async function stall(player) {
  const fid = festivalNow();
  if (!fid) return player.sendMessage("§7[Festival] The ribbon stall opens during a festival.");
  while (player.isValid) {
    const stock = STOCK.filter((s) => (!s.fid || s.fid === fid) && (!s.pack || has(s.pack)));
    const owns = pdata(player).b ?? [];
    const carried = ribbonsCarried(player);
    const form = new ActionFormData().title("Festival Ribbon stall").body(`§eQuill:§r "Ribbons, friend! I take ribbons. Only ribbons. Cosmetics only, mind: nothing that'll win you a fight."\n\nYou carry §d${carried}§r Festival Ribbon${carried === 1 ? "" : "s"}.`);
    for (const s of stock) form.button(owns.includes(s.id) ? `§8${s.label}\n§8yours already` : `${s.label}\n§8${s.cost} ribbons`);
    form.button("Close");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || res.selection >= stock.length || !player.isValid) return;
    const s = stock[res.selection];
    const d = pdata(player);
    if (s.kind !== "hat" && (d.b ?? []).includes(s.id)) {
      player.sendMessage(`§7[Festival] You have ${s.label} already.`);
      continue;
    }
    if (!takeRibbons(player, s.cost)) {
      player.sendMessage(`§7[Festival] ${s.label} costs ${s.cost} ribbons; you carry ${ribbonsCarried(player)}.`);
      continue;
    }
    if (s.kind === "title") send("realm:title_unlock", { player: player.id, title: s.value });
    else if (s.kind === "trail") send("realm:trail_unlock", { player: player.id, trail: s.value });
    else if (s.kind === "recipe") send("realm:recipe_learn", { player: player.id, recipe: s.value });
    else if (s.kind === "hat" && s.item) {
      const it = new ItemStack(s.item, 1);
      it.nameTag = `§d${s.value}`;
      if (s.lore) it.setLore(s.lore.map((l) => `§7${l}`));
      const inv = player.getComponent("minecraft:inventory")?.container;
      const left = inv ? inv.addItem(it) : it;
      if (left) player.dimension.spawnItem(left, player.location);
    }
    if (s.kind !== "hat") {
      d.b = [...(d.b ?? []), s.id].slice(-40);
      savePdata(player);
    }
    player.sendMessage(`§d[Festival] ${s.label}: yours, for ${s.cost} ribbons.`);
    player.playSound("random.orb", { pitch: 1.3, volume: 0.7 });
  }
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

/** @param {Player} player @param {ActionFormData | MessageFormData} form @returns {Promise<any>} */
async function show(player, form) {
  for (let k = 0; k < 10; k++) {
    if (!player.isValid) return undefined;
    const res = await /** @type {any} */ (form).show(player);
    if (res.canceled && res.cancelationReason === FormCancelationReason.UserBusy) {
      await wait(20);
      continue;
    }
    return res;
  }
  return undefined;
}

/** @param {Player} player @param {string} title @param {string} body @param {{ text: string, run: () => unknown }[]} actions */
async function menu(player, title, body, actions) {
  const form = new ActionFormData().title(title).body(body);
  for (const a of actions) form.button(a.text);
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined) return;
  await actions[res.selection]?.run();
}

/** @param {number} doy */
const seasonName = (doy) => SEASONS[Math.min(SEASONS.length - 1, Math.floor((doy - 1) / SEASON_DAYS))].name;

/** /realm:calendar @param {Player} player */
async function mainMenu(player) {
  const c = today();
  const s = SEASONS[c.si];
  const dayInSeason = c.doy - c.si * SEASON_DAYS;
  const lines = [`§lRealm day ${c.day}§r: Year ${c.year}, ${s.name}, day ${dayInSeason} of ${SEASON_DAYS} (day ${c.doy} of ${YEAR_DAYS})`];
  const fest = festivalNow();
  if (fest) {
    const f = FESTIVALS[fest];
    const d = pdata(player);
    lines.push(`${f.color}${f.name}§r is on: ${c.ends === c.day ? "its last day" : `until day ${(c.ends ?? c.day) - (c.year - 1) * YEAR_DAYS}`}.`, `§7${f.blurb}`, `§7This festival: ${d.r}/${int("ribbonCap")} ribbons, ${d.c}/${int("crownCap")} Crowns earned. You carry ${ribbonsCarried(player)} ribbons.`);
  } else {
    const n = nextFestival();
    if (n) lines.push(`Next festival: ${FESTIVALS[n.fid].name}, ${n.in <= 1 ? "tomorrow" : `in ${n.in} days`} (days ${n.s.festival[0]}-${n.s.festival[1]}).`);
    if (get("festivals") !== true) lines.push("§7Festivals are switched off on this realm.");
  }
  if (siege) lines.push(`§cThe Gray Choir is at ${siege.town.n}!`);
  else if (get("sieges") === true) {
    const gap = Math.max(1, int("siegeGapDays")) - (day - meta.last);
    lines.push(today().festival === "long_night" && get("festivals") === true ? "§7Sieges: the Long Night's truce holds." : gap > 0 ? `§7Sieges: none for ${gap} more day${gap === 1 ? "" : "s"}.` : "§7Sieges: the Choir may come any night.");
  }
  /** @type {{ text: string, run: () => unknown }[]} */
  const actions = [];
  if (fest) {
    actions.push({ text: `${FESTIVALS[fest].name}\n§8Activities and what you've done`, run: () => festivalMenu(player) });
    actions.push({ text: "Festival Ribbon stall\n§8Titles, trails, hats, recipe cards", run: () => stall(player) });
  }
  actions.push({ text: "The Realm Year\n§8Seasons and festivals", run: () => yearMenu(player) });
  actions.push({ text: "Sieges\n§8History and the towns", run: () => siegeMenu(player) });
  if (isOp(player)) actions.push({ text: "§4Operators\n§8Day, siege, regatta course", run: () => opMenu(player) });
  actions.push({ text: "Close", run: () => undefined });
  await menu(player, "Realm Calendar", lines.join("\n\n"), actions);
}

/** @param {Player} player */
async function festivalMenu(player) {
  const fest = festivalNow();
  if (!fest) return;
  const d = pdata(player);
  const max = Math.max(1, int("activityMax"));
  const acts = ACTIVITIES.filter((a) => a.fid === fest);
  const body = acts.map((a) => `§l${a.name}§r (${d.a[a.id] ?? 0}/${max})\n§7${a.how}`).join("\n\n");
  /** @type {{ text: string, run: () => unknown }[]} */
  const actions = [];
  if (fest === "hatchling_tide") actions.push({ text: "Start a Nest Watch\n§8at night, here", run: () => startNest(player) });
  if (fest === "midsummer_regatta") {
    actions.push({ text: "Race the Regatta\n§8in a boat on open water", run: () => startRace(player) });
    actions.push({ text: "Regatta board", run: () => boardMenu(player) });
  }
  if (fest === "lantern_fair") actions.push({ text: "Carve-off vote", run: () => voteMenu(player) });
  actions.push({ text: "Back", run: () => mainMenu(player) });
  await menu(player, FESTIVALS[fest].name, body, actions);
}

/** @param {Player} player */
async function boardMenu(player) {
  const b = readJson(PROP_BOARD);
  const top = b && b.k === festKey() && Array.isArray(b.top) ? b.top : [];
  const lines = top.length ? top.map((/** @type {any[]} */ e, /** @type {number} */ i) => `${i + 1}. ${e[1]}: ${clock(e[2])}`) : ["No times yet this year."];
  if (b?.best) lines.push("", `§7Realm record: ${b.best[0]}, ${clock(b.best[1])} (Year ${b.best[2]})`);
  await menu(player, "Regatta board", lines.join("\n"), [{ text: "Back", run: () => festivalMenu(player) }]);
}

/** @param {Player} player */
async function yearMenu(player) {
  const c = today();
  const lines = SEASONS.map((s, i) => {
    const f = FESTIVALS[s.fid];
    return `${i === c.si ? "§l> " : ""}${s.name}§r: days ${i * SEASON_DAYS + 1}-${(i + 1) * SEASON_DAYS}\n§7${f.name}, days ${s.festival[0]}-${s.festival[1]}: ${f.blurb}`;
  });
  lines.push("", `§7A Realm day passes at each dawn (sleeping counts). The year has ${YEAR_DAYS} days.`);
  await menu(player, "The Realm Year", lines.join("\n\n"), [{ text: "Back", run: () => mainMenu(player) }]);
}

/** @param {Player} player */
async function siegeMenu(player) {
  const h = readJson(PROP_HIST);
  const hist = Array.isArray(h) && h.length ? h.map((e) => `Day ${e[0]}: ${e[1]} - ${e[2]}`).join("\n") : "No sieges yet.";
  const list = [...towns.values()];
  const tl = list.length
    ? list
        .map((t) => {
          const m = moodOf(t.id);
          const why = get("spareSafeTowns") === true && t.safe ? "spared (kept safe from world events)" : siegesAt(t.id) ? "sieges on" : "sieges off";
          return `${t.n}: ${m ? (m === "heartened" ? "§aHeartened§r" : "§cShaken§r") : "calm"}, ${why}`;
        })
        .join("\n")
    : "No towns (Town Projects): sieges come to the lighthouse or the town square.";
  const red = reduction();
  const body = [`§lHistory§r\n${hist}`, `§lTowns§r\n${tl}`, `§7Choir Cairns silenced in the Atlas: ${meta.cairns.length}${meta.cairns.length >= 18 ? "+" : ""} (the Choir comes ${red} fewer).`].join("\n\n");
  /** @type {{ text: string, run: () => unknown }[]} */
  const actions = [];
  if (isOp(player)) for (const t of list) actions.push({ text: `§4${t.n}: sieges ${siegesAt(t.id) ? "Enabled" : "Disabled"}\n§8Operators: switch`, run: () => toggleTown(player, t.id) });
  actions.push({ text: "Back", run: () => mainMenu(player) });
  await menu(player, "Sieges", body, actions);
}

/** @param {Player} player @param {string} townId */
async function toggleTown(player, townId) {
  if (!isOp(player)) return player.sendMessage(NOT_OP); // de-opped while the menu was open
  const sw = townSwitches();
  if (sw[townId] === 0) delete sw[townId];
  else sw[townId] = 0;
  writeJson(PROP_TOWNS, sw);
  player.sendMessage(`§7[Calendar] Sieges at ${towns.get(townId)?.n ?? townId}: ${sw[townId] === 0 ? "Disabled" : "Enabled"}.`);
  await siegeMenu(player);
}

const NOT_OP = "§cOnly operators can do that.";

/** @param {Player} player */
async function opMenu(player) {
  const c = meta.course;
  await menu(player, "Realm Calendar: operators", `Day ${today().doy} of the year. Regatta course: ${c ? `starts at ${Math.round(c.x)}, ${Math.round(c.z)}` : "none (each race starts where the racer is)"}.`, [
    { text: "Set the regatta course here\n§8the start, facing the way you face", run: () => (isOp(player) ? setCourse(player) : player.sendMessage(NOT_OP)) },
    { text: "Start a siege\n§8/realm:calendar_siege", run: () => siegeCommand(player) },
    { text: "Back", run: () => mainMenu(player) },
  ]);
}

/** @param {Player} player */
function setCourse(player) {
  meta.course = { x: player.location.x, y: player.location.y, z: player.location.z, h: player.getRotation().y };
  saveMeta();
  const cps = course(player.dimension, meta.course);
  const wet = cps.filter((p) => {
    try {
      return waterOver(player.dimension.getTopmostBlock(p)) !== undefined;
    } catch {
      return false;
    }
  }).length;
  player.sendMessage(`§7[Calendar] Regatta course set: it starts here and loops ${int("regatta.radius")} blocks out to your right. ${wet} of ${cps.length} checkpoints are on water.`);
}

/** /realm:calendar_siege @param {Player} player */
async function siegeCommand(player) {
  if (!isOp(player)) return player.sendMessage("§cOnly operators can call a siege.");
  if (siege) {
    const res = await show(player, new MessageFormData().title("Choir siege").body(`The Choir is at ${siege.town.n}. End the siege now? Nobody is rewarded, the town's mood doesn't change, and the circles are put back.`).button1("End it").button2("Keep it"));
    if (res && !res.canceled && res.selection === 0 && siege && player.isValid) {
      if (!isOp(player)) return player.sendMessage(NOT_OP); // de-opped while the form was open
      endSiege("scattered");
    }
    return;
  }
  const target = pickTarget([player], true);
  if (!target) return player.sendMessage("§7[Calendar] No town, lighthouse or spawn to besiege.");
  const res = await show(player, new MessageFormData().title("Choir siege").body(`Start a Choir siege at ${target.n} now? Everyone in the Overworld is warned, and the circles rise in ${int("warnMinutes")} minutes. It skips the night, the player count and the days since the last one.`).button1("Start it").button2("Cancel"));
  if (!res || res.canceled || res.selection !== 0 || siege || !player.isValid) return;
  if (!isOp(player)) return player.sendMessage(NOT_OP); // de-opped while the form was open
  startSiege(target);
}

// ---------------------------------------------------------------------------
// Townsfolk: the ribbon stall at the merchant during a festival
// ---------------------------------------------------------------------------

/** @param {string} id @param {any} msg */
function onNpc(id, msg) {
  if (typeof msg.player !== "string") return;
  if (id === "realm:npc_talk") {
    if (!festivalNow() || !Array.isArray(msg.roles) || !msg.roles.includes(String(get("stallRole")))) return;
    send("realm:npc_offer", { req: msg.req, pack: PACK, key: "stall", label: "Festival Ribbon stall", order: 25 });
    return;
  }
  if (msg.pack !== PACK || msg.key !== "stall") return;
  const player = online(msg.player);
  if (player) system.run(() => stall(player).catch((e) => console.warn(`[calendar] stall: ${e}`)));
}

// ---------------------------------------------------------------------------
// Testing hook: realm:calendar_debug { action, player?, ... } -> realm:calendar_state
// ---------------------------------------------------------------------------

/** @param {any} m */
function debug(m) {
  const player = typeof m.player === "string" ? world.getAllPlayers().find((p) => p.id === m.player || p.name === m.player) : undefined;
  const a = m.action;
  if (a === "siege") {
    if (siege) endSiege("scattered");
    const t = typeof m.town === "string" ? towns.get(m.town) : undefined;
    const target = t ? { id: t.id, n: t.n, dim: t.dim, x: t.x, y: t.y, z: t.z, src: "town" } : pickTarget(player ? [player] : world.getAllPlayers(), true);
    if (target) startSiege(target, num(m.warn) ? m.warn * 1000 : undefined);
    if (siege && num(m.pillagers)) siege.fix = m.pillagers;
  } else if (a === "roll") {
    if (m.reset === true) {
      meta.tried = 0;
      meta.last = 0;
    }
    siegeRoll(m.force === true, num(m.chance) ? m.chance : undefined);
  } else if (a === "rise" && siege) siege.t1 = Date.now();
  else if (a === "expire" && siege) siege.t2 = Date.now();
  else if (a === "singers" && siege) {
    for (const e of world.getDimension(OVERWORLD).getEntities({ tags: [`realm:siege_${siege.id}`] })) if (e.getTags().some((t) => /^realm:siege_s\d$/.test(t))) e.kill();
  } else if (a === "bell" && siege && player && num(m.circle)) {
    const c = siege.c[m.circle];
    if (c) {
      lastBell.delete(player.id);
      bellHit(player, c);
    }
  } else if (a === "end" && siege) endSiege(m.result === "held" || m.result === "failed" ? m.result : "scattered");
  else if (a === "cairn") onQuestDone({ pack: "atlas_bp", id: `atlas:cairn:${m.key ?? Math.random()}` });
  else if (a === "complete" && player && typeof m.activity === "string") complete(player, m.activity);
  else if (a === "nest" && player) startNest(player, true);
  else if (a === "race" && player) {
    startRace(player, true);
    const r = races.get(player.id);
    if (r) r.force = true;
  } else if (a === "cp" && player) {
    const r = races.get(player.id);
    if (r) {
      const cp = r.cps[r.i];
      player.teleport({ x: cp.x, y: player.location.y, z: cp.z });
    }
  } else if (a === "feed" && player) feedTurtle(player);
  else if (a === "eat" && player && typeof m.food === "string") eatAtPicnic(player, m.food);
  else if (a === "gift") onGift({ player: player?.id, npc: m.npc });
  else if (a === "vote" && player && typeof m.for === "string") {
    const fair = fairNow();
    const target = world.getAllPlayers().find((p) => p.name === m.for || p.id === m.for);
    if (target && fair.e[target.id] && !pdata(player).v) {
      fair.v[target.id] = (fair.v[target.id] ?? 0) + 1;
      writeJson(PROP_FAIR, fair);
      pdata(player).v = target.id;
      savePdata(player);
      complete(player, "carve_off");
    }
  } else if (a === "setday" && num(m.doy)) setDay(m.doy);
  else if (a === "forget") {
    // As if this pack were new to the world: the handoff from Townsfolk again.
    owned = false;
    day = 1;
    writeJson(PROP_DAY, undefined);
    handoff();
  }
  /** @type {Record<string, unknown>} */
  const out = {
    player: player?.id,
    day,
    owned,
    cal: today(),
    fk: meta.fk,
    last: meta.last,
    tried: meta.tried,
    cairns: meta.cairns.length,
    red: reduction(),
    towns: [...towns.values()].map((t) => [t.id, t.safe ? 1 : 0, siegesAt(t.id) ? 1 : 0]),
    siege: siege ? { id: siege.id, st: siege.st, town: siege.town.id, c: siege.c.map((c) => [c.x, c.y, c.z, c.h, c.s, c.p ?? 0]), who: Object.keys(siege.who).length } : undefined,
    mobs: world.getDimension(OVERWORLD).getEntities({ tags: [SIEGE_TAG] }).length,
    kinds: world
      .getDimension(OVERWORLD)
      .getEntities({ tags: [SIEGE_TAG] })
      .map((e) => e.typeId.slice(10, 13))
      .join(""),
    fx: world.getDimension(OVERWORLD).getEntities({ tags: [FX_TAG] }).length,
    moods: moods(),
    p: player ? pdata(player) : undefined,
    race: player ? races.get(player.id)?.i : undefined,
    restore: pendingCache.length,
  };
  let text = JSON.stringify(out);
  if (text.length > 2000) {
    delete out.moods;
    text = JSON.stringify(out).slice(0, 2000);
  }
  system.sendScriptEvent("realm:calendar_state", text);
}

// ---------------------------------------------------------------------------
// Events from other packs
// ---------------------------------------------------------------------------

/** realm:quest_done: an Atlas cairn silenced (atlas:cairn:<site>) makes the Choir smaller. @param {any} msg */
function onQuestDone(msg) {
  if (msg.pack !== "atlas_bp" || typeof msg.id !== "string" || !msg.id.startsWith("atlas:cairn:")) return;
  const key = msg.id.slice(12, 60);
  if (meta.cairns.includes(key) || meta.cairns.length >= 18) return;
  meta.cairns.push(key);
  saveMeta();
}

const EVENTS = new Set(["realm:calendar", "realm:calendar_ping", "realm:town_list", "realm:town_state_ping", "realm:quest_done", "realm:npc_gift", "realm:saga_progress", "realm:place_ready", "realm:claims_check_result", "realm:npc_talk", "realm:npc_choose", "realm:calendar_debug"]);

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message, sourceEntity }) => {
    if (id === "realm:help_pong") {
      scanning?.add(message.trim());
      return;
    }
    if (id === "realm:actionbar") {
      try {
        const m = JSON.parse(message);
        if (m && typeof m.player === "string" && m.from !== PACK) barHeld.set(m.player, system.currentTick + Math.min(200, Math.max(0, Number(m.ticks) || 0)));
      } catch {
        // not ours
      }
      return;
    }
    if (!EVENTS.has(id)) return;
    if (id === "realm:calendar_ping") {
      if (owned && loaded) broadcast();
      return;
    }
    if (id === "realm:town_state_ping") {
      sendMoods();
      return;
    }
    /** @type {any} */
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    try {
      if (id === "realm:calendar") {
        // Townsfolk counted the days before this pack came: take its day once, then own the counter.
        if (!owned && msg.from === "npc_bp" && num(msg.day) && msg.day >= 1) {
          day = Math.floor(msg.day);
          nightSeen = world.getTimeOfDay() >= 12000;
          owned = true;
          saveDay();
          broadcast();
          festivalCheck();
        }
      } else if (id === "realm:town_list") onTownList(msg);
      else if (id === "realm:quest_done") onQuestDone(msg);
      else if (id === "realm:npc_gift") onGift(msg);
      else if (id === "realm:saga_progress") {
        if (typeof msg.player === "string" && num(msg.act)) acts.set(msg.player, msg.act);
      } else if (id === "realm:place_ready") {
        if (msg.name === "lighthouse" && typeof msg.dim === "string" && num(msg.x) && num(msg.z)) lighthouse = msg.state === "removed" ? undefined : { dim: msg.dim, x: msg.x, y: num(msg.y) ? msg.y : 64, z: msg.z };
      } else if (id === "realm:claims_check_result") {
        const fn = typeof msg.id === "string" ? claimAsks.get(msg.id) : undefined;
        if (fn) {
          claimAsks.delete(msg.id);
          fn(Array.isArray(msg.claims) ? msg.claims.length : 0);
        }
      } else if (id === "realm:npc_talk" || id === "realm:npc_choose") onNpc(id, msg);
      else if (id === "realm:calendar_debug") {
        if (sourceEntity && !(sourceEntity instanceof Player && isOp(sourceEntity))) return;
        debug(msg);
      }
    } catch (e) {
      console.warn(`[calendar] ${id}: ${e}`);
    }
  },
  { namespaces: ["realm"] },
);

// ---------------------------------------------------------------------------
// Commands, loops, load
// ---------------------------------------------------------------------------

/** @param {import("@minecraft/server").CustomCommandOrigin} origin @param {(p: Player) => unknown} fn */
function withPlayer(origin, fn) {
  const p = origin.initiator ?? origin.sourceEntity;
  if (!(p instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
  system.run(() => {
    try {
      const r = fn(p);
      if (r instanceof Promise) r.catch((e) => console.warn(`[calendar] ${e}`));
    } catch (e) {
      console.warn(`[calendar] ${e}`);
    }
  });
  return { status: CustomCommandStatus.Success };
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    { name: "realm:calendar", description: "Realm Calendar: the day and season, the festival and its activities, the ribbon stall, sieges", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => withPlayer(origin, mainMenu),
  );
  customCommandRegistry.registerCommand(
    { name: "realm:calendar_siege", description: "Realm Calendar: start a Choir siege now at the nearest town (or end the one running)", permissionLevel: CommandPermissionLevel.GameDirectors, cheatsRequired: false },
    (origin) => withPlayer(origin, siegeCommand),
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:calendar_set",
      description: "Realm Calendar: set the day of the Realm Year (1-96)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "day", type: CustomCommandParamType.Integer }],
    },
    (origin, /** @type {number} */ doy) =>
      withPlayer(origin, (p) => {
        if (!isOp(p)) return p.sendMessage("§cOnly operators can set the day.");
        if (!num(doy) || doy < 1 || doy > YEAR_DAYS) return p.sendMessage(`§cThe day of the year is 1 to ${YEAR_DAYS}.`);
        setDay(doy);
        const c = today();
        p.sendMessage(`§7[Calendar] It is now Realm day ${c.day}: day ${c.doy} of Year ${c.year}, ${seasonName(c.doy)}${c.festival ? `, ${FESTIVALS[c.festival].name}` : ""}.`);
      }),
  );
});

system.runInterval(() => {
  if (!loaded) return;
  try {
    dayTick();
    watchPlayers();
    raceTick();
  } catch (e) {
    console.warn(`[calendar] loop: ${e}`);
  }
}, 10);
system.runInterval(() => {
  if (!loaded) return;
  try {
    siegeTick();
    if (system.currentTick % 100 < 20) {
      siegePresence();
      nestTick();
    }
  } catch (e) {
    console.warn(`[calendar] siege: ${e}`);
  }
}, 20);
system.runInterval(() => {
  if (!loaded) return;
  try {
    siegeRoll();
    restorePending();
  } catch (e) {
    console.warn(`[calendar] roll: ${e}`);
  }
}, 200);
system.runInterval(() => {
  broadcast();
  scanPacks();
}, 6000);
onChange((key) => {
  if (!loaded || (key !== "festivals" && key !== "*")) return;
  broadcast();
  festivalCheck();
});

/** First run: Townsfolk may have counted days already. Ask for its day; without an answer, day 1. */
function handoff() {
  system.runTimeout(() => send("realm:calendar_ping", { own: true }), 20);
  system.runTimeout(() => send("realm:calendar_ping", { own: true }), 140);
  system.runTimeout(() => {
    if (owned) return;
    owned = true;
    nightSeen = world.getTimeOfDay() >= 12000;
    saveDay();
    broadcast();
    festivalCheck();
  }, 240);
}

world.afterEvents.worldLoad.subscribe(() => {
  loadDay();
  loadMeta();
  const pend = readJson(PROP_RESTORE);
  pendingCache = Array.isArray(pend) ? pend.filter((r) => Array.isArray(r) && typeof r[0] === "string" && num(r[2]) && num(r[3]) && num(r[4])) : [];
  loaded = true;
  for (const e of world.getDimension(OVERWORLD).getEntities({ tags: [FX_TAG] })) e.remove();
  resumeAfterRestart();
  for (const e of world.getDimension(OVERWORLD).getEntities({ tags: [SIEGE_TAG] })) e.remove();
  if (owned) {
    // Before Townsfolk's own broadcast (5 s after load), so it hears another pack owns the calendar.
    system.runTimeout(() => {
      broadcast();
      festivalCheck();
    }, 40);
  } else handoff();
  system.runTimeout(() => {
    scanPacks();
    send("realm:town_list_ping", {});
    send("realm:saga_progress_ping", {});
    send("realm:place_ping", {});
    sendMoods();
  }, 60);
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  system.runTimeout(() => {
    if (!player.isValid) return;
    broadcast();
    send("realm:saga_progress_ping", {});
    const fest = festivalNow();
    if (fest) player.sendMessage(`${FESTIVALS[fest].color}[Festival] ${FESTIVALS[fest].name} is on! §7/realm:calendar for the activities and the ribbon stall.`);
    if (siege) player.sendMessage(`§7[Siege] §cThe Gray Choir is at ${siege.town.n}!`);
  }, 60);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  pcache.delete(playerId);
  track.delete(playerId);
  races.delete(playerId);
  lastBell.delete(playerId);
  barHeld.delete(playerId);
  acts.delete(playerId);
  const w = nests.get(playerId);
  if (w) endNest(w, false, undefined, "");
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "calendar_bp");
    else if (id === "realm:siege_ping") sendMarks();
  },
  { namespaces: ["realm"] },
);
