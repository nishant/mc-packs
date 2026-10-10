import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  EnchantmentTypes,
  Entity,
  GameMode,
  ItemStack,
  Player,
  PlayerPermissionLevel,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

// A visit is one saved object: where the caravan is, until when, its traders' entity ids and what's left
// in stock. The traders are vanilla minecraft:npc entities with this pack as their owner tag (the Townsfolk
// pack leaves those alone), so taps on them open this pack's shop. Every entity a visit brings carries
// `realm:caravan` and `realm:caravan_v:<visit>`, so anything left over from an earlier visit, or found after
// the caravan left, is removed as soon as its chunk loads.

const PROP_SPOTS = "caravan:spots"; // world: JSON Spot[], arrival spots set by operators
const PROP_VISIT = "caravan:visit"; // world: JSON Visit while a caravan is here
const PROP_LAST = "caravan:last"; // world: arrival time (ms) of the last scheduled visit already handled

const NPC_TYPE = "minecraft:npc";
const LLAMA_TYPES = ["minecraft:trader_llama", "minecraft:llama"];
const TAG = "realm:caravan";
const VISIT_TAG = "realm:caravan_v:";
const TRADER_TAG = "realm:caravan_trader:";
const LLAMA_TAG = "realm:caravan_llama";
const OWNER_TAG = "realm:npc_owner:caravan_bp";
const NPC_TAG = "realm:npc";
const OVERWORLD = "minecraft:overworld";
const DIMENSIONS = [OVERWORLD, "minecraft:nether", "minecraft:the_end"];

const HOUR = 3600000;
const DAY = 24 * HOUR;
const LOOP_TICKS = 10; // traders turning to players
const KEEP_EVERY = 4; // loops between upkeep: schedule, spawning, missing traders (2 s)
const MISSING_CHECKS = 3; // upkeeps in a row a trader must be missing before it's spawned again
const AUDIT_TICKS = 200;
const MAX_SPOTS = 20;
const BUY_MAX = 16;
const LLAMA_LEASH = 10; // a llama farther than this from the caravan is brought back
const TURN_STEP = 45;
const TURN_MIN = 4;
// Where the traders stand around the spot (the first at the spot itself).
const OFFSETS = [
  { x: 0, z: 0 },
  { x: 3, z: 1 },
  { x: -3, z: 1 },
  { x: 0, z: 3 },
  { x: 3, z: -2 },
  { x: -3, z: -2 },
];

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {typeof CONFIG.goods[number]} Good */
/** @typedef {typeof CONFIG.buys[number]} BuyBack */
/** @typedef {{ name: string, dim: string, x: number, y: number, z: number }} Spot */
/** @typedef {{ name: string, eid?: string, at?: Vector3 }} Trader */
/**
 * @typedef {object} Visit
 * @property {number} v unique id (its start time)
 * @property {number} until when it leaves (ms)
 * @property {Spot} spot
 * @property {boolean} surface the spot is world spawn, whose height is found once its chunk is loaded
 * @property {boolean} placed the spot's height is known
 * @property {Trader[]} traders
 * @property {string[] | undefined} llamas entity ids, once spawned
 * @property {{ id: string, left: number }[]} stock
 * @property {boolean} warned the "leaves soon" note was sent
 */

const goods = new Map(CONFIG.goods.map((g) => [g.id, g]));

let ready = false;
/** @type {Spot[]} */
let spots = [];
/** @type {Visit | undefined} */
let visit;
/** @type {Map<number, { missing: number, yaw?: number }>} trader index -> runtime state */
const traderState = new Map();

/** @param {unknown} v */
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
/** @param {number} ticks */
const wait = (ticks) => new Promise((r) => system.runTimeout(() => r(undefined), ticks));
/** @param {string} id */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);
/** @param {Player} player */
const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors || player.playerPermissionLevel === PlayerPermissionLevel.Operator;
/** @param {Vector3} a @param {Vector3} b */
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** 12345 -> "12,345". @param {number} n */
const fmt = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
/** @param {number} n */
const crownsText = (n) => `${fmt(n)} Crown${n === 1 ? "" : "s"}`;
/** @param {string} dim */
const dimName = (dim) => (dim === "minecraft:nether" ? "the Nether" : dim === "minecraft:the_end" ? "the End" : "the Overworld");
/** "minecraft:golden_apple" -> "Golden Apple". @param {string} id */
const itemName = (id) =>
  id
    .replace(/^minecraft:/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** "3d 5h", "2h 10m", "12m". @param {number} ms */
function duration(ms) {
  const m = Math.max(1, Math.ceil(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

/** "N", "NE", ... @param {number} dx @param {number} dz */
function compass(dx, dz) {
  const a = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(a / 45) % 8];
}
/** Yaw that looks from `from` toward `to`. @param {Vector3} from @param {Vector3} to */
const yawTo = (from, to) => (Math.atan2(-(to.x - from.x), to.z - from.z) * 180) / Math.PI;
/** @param {number} a */
const wrap = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

/** @param {Dimension} dim @param {Vector3} at */
function blockAt(dim, at) {
  try {
    return dim.getBlock({ x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z) });
  } catch {
    return undefined; // unloaded, or outside the world
  }
}

/** @param {string} msg */
function broadcast(msg) {
  for (const p of world.getAllPlayers()) {
    try {
      p.sendMessage(msg);
    } catch {
      // left meanwhile
    }
  }
}

// ---------------------------------------------------------------------------
// Crowns (the shared `crowns` scoreboard; works without the Crowns pack)
// ---------------------------------------------------------------------------

function crownsObjective() {
  const existing = world.scoreboard.getObjective("crowns");
  if (existing) return existing;
  try {
    return world.scoreboard.addObjective("crowns", "Crowns");
  } catch {
    return /** @type {import("@minecraft/server").ScoreboardObjective} */ (world.scoreboard.getObjective("crowns"));
  }
}
/** @param {Player} p */
function crownsOf(p) {
  try {
    return crownsObjective().getScore(p) ?? 0;
  } catch {
    return 0;
  }
}
/** @param {Player} p @param {number} n */
function addCrowns(p, n) {
  crownsObjective().addScore(p, Math.floor(n));
}
/** @param {Player} p @param {number} n */
function takeCrowns(p, n) {
  if (crownsOf(p) < n) return false;
  crownsObjective().addScore(p, -Math.floor(n));
  return true;
}

// ---------------------------------------------------------------------------
// Saved data
// ---------------------------------------------------------------------------

/** @param {any} s @returns {s is Spot} */
const isSpot = (s) => !!s && typeof s.name === "string" && typeof s.dim === "string" && isNum(s.x) && isNum(s.y) && isNum(s.z);

function load() {
  try {
    const raw = world.getDynamicProperty(PROP_SPOTS);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : [];
    spots = Array.isArray(parsed) ? parsed.filter(isSpot) : [];
  } catch (e) {
    console.warn(`[caravan] ${PROP_SPOTS} is corrupt: ${e}`);
    spots = [];
  }
  try {
    const raw = world.getDynamicProperty(PROP_VISIT);
    const v = typeof raw === "string" ? JSON.parse(raw) : undefined;
    if (v && isNum(v.v) && isNum(v.until) && isSpot(v.spot) && Array.isArray(v.traders) && Array.isArray(v.stock)) {
      visit = {
        v: v.v,
        until: v.until,
        spot: v.spot,
        surface: v.surface === true,
        placed: v.placed !== false,
        traders: v.traders.filter((/** @type {any} */ t) => t && typeof t.name === "string"),
        llamas: Array.isArray(v.llamas) ? v.llamas.filter((/** @type {any} */ x) => typeof x === "string") : undefined,
        stock: v.stock.filter((/** @type {any} */ s) => s && typeof s.id === "string" && isNum(s.left)),
        warned: v.warned === true,
      };
    }
  } catch (e) {
    console.warn(`[caravan] ${PROP_VISIT} is corrupt: ${e}`);
    visit = undefined;
  }
}

function saveSpots() {
  world.setDynamicProperty(PROP_SPOTS, spots.length ? JSON.stringify(spots) : undefined);
}

function saveVisit() {
  try {
    world.setDynamicProperty(PROP_VISIT, visit ? JSON.stringify(visit) : undefined);
  } catch (e) {
    console.warn(`[caravan] save: ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

function schedule() {
  const every = Math.max(1, Math.floor(Number(get("everyDays")) || 7));
  const offset = (((Math.floor(Number(get("offsetDays")) || 0)) % every) + every) % every;
  const hour = Math.max(0, Math.min(23, Math.floor(Number(get("hourUtc")) || 0)));
  return { every, offset, hour };
}

/** The latest scheduled arrival at or before `t` (ms). @param {number} t */
function slotAt(t) {
  const { every, offset, hour } = schedule();
  const day = Math.floor((t - hour * HOUR) / DAY);
  const d = Math.floor((day - offset) / every) * every + offset;
  return d * DAY + hour * HOUR;
}

/** The next scheduled arrival after `t`. @param {number} t */
const nextSlot = (t) => slotAt(t) + schedule().every * DAY;

/** "Saturday 18:00 UTC". @param {number} t */
function when(t) {
  const d = new Date(t);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `${days[d.getUTCDay()]} ${String(d.getUTCHours()).padStart(2, "0")}:00 UTC`;
}

const stayMs = () => Math.max(1, Number(get("stayMinutes")) || 40) * 60000;

function lastHandled() {
  const v = world.getDynamicProperty(PROP_LAST);
  return isNum(v) ? /** @type {number} */ (v) : undefined;
}

// ---------------------------------------------------------------------------
// Goods
// ---------------------------------------------------------------------------

/** Makes `count` of a good (one stack). Throws if the game can't make it. @param {Good} g @param {number} count */
function makeItem(g, count) {
  const stack = new ItemStack(g.item, count);
  if (g.nameTag) stack.nameTag = g.nameTag;
  if (g.lore) stack.setLore(g.lore);
  if (g.enchant) {
    const type = EnchantmentTypes.get(g.enchant.id);
    const ench = stack.getComponent("minecraft:enchantable");
    if (!type || !ench) throw new Error(`can't enchant ${g.item} with ${g.enchant.id}`);
    ench.addEnchantment({ type, level: g.enchant.level });
  }
  return stack;
}

/** Can the game make this good? Checked when stock is picked, so a bad entry is skipped, not sold. @param {Good} g */
function makeable(g) {
  try {
    makeItem(g, 1);
    return true;
  } catch (e) {
    console.warn(`[caravan] skipping good "${g.id}": ${e}`);
    return false;
  }
}

/** This visit's stock: `stockSize` goods at random. */
function rollStock() {
  const n = Math.max(1, Math.floor(Number(get("stockSize")) || 8));
  const pool = CONFIG.goods.filter((g) => g.stock > 0 && makeable(g)).sort(() => Math.random() - 0.5);
  return pool.slice(0, n).map((g) => ({ id: g.id, left: Math.floor(g.stock) }));
}

/** @param {Good} g */
const goodName = (g) => g.name ?? itemName(g.item);

/** Gives `total` of a good, dropping what doesn't fit. @param {Player} player @param {Good} g @param {number} total */
function giveGood(player, g, total) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  const max = makeItem(g, 1).maxAmount;
  let left = total;
  let dropped = false;
  while (left > 0) {
    const stack = makeItem(g, Math.min(max, left));
    left -= stack.amount;
    const rest = inv ? inv.addItem(stack) : stack;
    if (rest) {
      player.dimension.spawnItem(rest, player.location);
      dropped = true;
    }
  }
  return dropped;
}

// ---------------------------------------------------------------------------
// Arrival and departure
// ---------------------------------------------------------------------------

/** @param {number | undefined} slot the scheduled arrival this visit is for, or undefined when called by an operator */
function arrive(slot) {
  const now = Date.now();
  world.setDynamicProperty(PROP_LAST, slot ?? slotAt(now)); // a called caravan stands in for the one due now
  /** @type {Spot} */
  let spot;
  let surface = false;
  if (spots.length) {
    spot = { ...spots[Math.floor(Math.random() * spots.length)] };
  } else {
    const s = world.getDefaultSpawnLocation();
    spot = { name: "world spawn", dim: OVERWORLD, x: Math.floor(s.x) + 0.5, y: s.y, z: Math.floor(s.z) + 0.5 };
    surface = true;
  }
  const names = CONFIG.traders.length ? CONFIG.traders : ["Traveling Merchant"];
  visit = {
    v: now,
    until: now + stayMs(),
    spot,
    surface,
    placed: !surface,
    traders: names.slice(0, OFFSETS.length).map((name) => ({ name })),
    llamas: undefined,
    stock: rollStock(),
    warned: false,
  };
  traderState.clear();
  saveVisit();
  const where = `${spot.name} (${Math.floor(spot.x)}, ${Math.floor(spot.z)}${spot.dim === OVERWORLD ? "" : `, in ${dimName(spot.dim)}`})`;
  broadcast(`§6A merchant caravan has arrived at ${where}! §7It stays ${duration(visit.until - now)}. Tap a trader to buy rare goods for Crowns.`);
  for (const p of world.getAllPlayers()) {
    try {
      p.playSound("note.bell", { pitch: 0.8, volume: 0.8 });
    } catch {
      // left meanwhile
    }
  }
  system.sendScriptEvent(
    "realm:sky_event",
    JSON.stringify({ kind: "caravan", dim: spot.dim, x: Math.floor(spot.x), z: Math.floor(spot.z), text: `A merchant caravan arrived at ${where}` }),
  );
  upkeep();
}

/** Removes everything the caravan brought that is loaded; the rest goes when its chunk loads. */
function clearEntities() {
  for (const id of DIMENSIONS) {
    try {
      for (const e of world.getDimension(id).getEntities({ tags: [TAG] })) e.remove();
    } catch (e) {
      console.warn(`[caravan] cleanup: ${e}`);
    }
  }
}

/** @param {boolean} quiet no chat (the world just loaded after the visit ended) */
function depart(quiet) {
  visit = undefined;
  traderState.clear();
  saveVisit();
  clearEntities();
  if (quiet) return;
  const next = get("enabled") === true ? ` §8Next visit in ${duration(nextSlot(Date.now()) - Date.now())}.` : "";
  broadcast(`§7The merchant caravan has packed up and left.${next}`);
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/** A spot to stand near `base`: feet and head free, solid ground. Few lookups, once per trader. @param {Dimension} dim @param {Vector3} base */
function standable(dim, base) {
  for (const dy of [0, 1, -1, 2, -2]) {
    const at = { x: Math.floor(base.x), y: Math.floor(base.y) + dy, z: Math.floor(base.z) };
    const feet = blockAt(dim, at);
    const head = blockAt(dim, { ...at, y: at.y + 1 });
    const ground = blockAt(dim, { ...at, y: at.y - 1 });
    if (feet?.isAir && head?.isAir && ground && !ground.isAir && !ground.isLiquid) return { x: at.x + 0.5, y: at.y, z: at.z + 0.5 };
  }
  return undefined;
}

/** @param {Entity} entity @param {number} i @param {Visit} vis */
function dressTrader(entity, i, vis) {
  for (const tag of [TAG, VISIT_TAG + vis.v, TRADER_TAG + i, NPC_TAG, OWNER_TAG]) if (!entity.hasTag(tag)) entity.addTag(tag);
  const name = `§6${vis.traders[i].name}`;
  if (entity.nameTag !== name) entity.nameTag = name;
}

/** @param {Visit} vis @param {number} i @param {Dimension} dim @param {Vector3} at */
function spawnTrader(vis, i, dim, at) {
  const entity = dim.spawnEntity(NPC_TYPE, at);
  dressTrader(entity, i, vis);
  vis.traders[i].eid = entity.id;
  saveVisit();
  return entity;
}

/** @param {Entity} entity */
function traderIndex(entity) {
  const tag = entity.getTags().find((t) => t.startsWith(TRADER_TAG));
  const i = tag ? Number(tag.slice(TRADER_TAG.length)) : NaN;
  return Number.isInteger(i) ? i : undefined;
}

/** @param {string | undefined} eid */
function entityById(eid) {
  if (!eid) return undefined;
  try {
    const e = world.getEntity(eid);
    return e && e.isValid ? e : undefined;
  } catch {
    return undefined;
  }
}

/** Removes caravan entities that don't belong to the current visit, and duplicate traders. @param {Entity} entity */
function audit(entity) {
  if (!ready || !entity.isValid || !entity.hasTag(TAG)) return;
  if (!visit || !entity.hasTag(VISIT_TAG + visit.v)) {
    entity.remove();
    return;
  }
  if (entity.hasTag(LLAMA_TAG)) return;
  const i = traderIndex(entity);
  const tr = i === undefined ? undefined : visit.traders[i];
  if (!tr || i === undefined) {
    entity.remove();
    return;
  }
  if (tr.eid === entity.id) return;
  const current = entityById(tr.eid);
  if (current && current.id !== entity.id) {
    entity.remove();
    return;
  }
  tr.eid = entity.id;
  saveVisit();
}

world.afterEvents.entityLoad.subscribe(({ entity }) => {
  try {
    audit(entity);
  } catch (e) {
    console.warn(`[caravan] ${e}`);
  }
});

function auditAll() {
  for (const id of DIMENSIONS) {
    try {
      for (const e of world.getDimension(id).getEntities({ tags: [TAG] })) audit(e);
    } catch (e) {
      console.warn(`[caravan] audit: ${e}`);
    }
  }
}

/** Places the caravan once its spot is loaded, and brings back missing traders. Runs every 2 s during a visit. @param {Visit} vis */
function keepCaravan(vis) {
  const dim = world.getDimension(vis.spot.dim);
  if (!vis.placed) {
    // World spawn: stand on the surface there, once the chunk is loaded.
    let top;
    try {
      top = dim.getTopmostBlock({ x: Math.floor(vis.spot.x), z: Math.floor(vis.spot.z) });
    } catch {
      top = undefined;
    }
    if (!top) return;
    vis.spot.y = top.location.y + 1;
    vis.placed = true;
    saveVisit();
  }
  if (!blockAt(dim, vis.spot)) return; // not loaded: nobody is there to see it yet
  const nearby = dim.getPlayers({ location: vis.spot, maxDistance: CONFIG.respawnRange + 8 }).length > 0;
  vis.traders.forEach((tr, i) => {
    let st = traderState.get(i);
    if (!st) traderState.set(i, (st = { missing: 0 }));
    const entity = entityById(tr.eid);
    if (entity) {
      st.missing = 0;
      // Pushed or led away: back to its place.
      if (tr.at && (entity.dimension.id !== vis.spot.dim || dist(entity.location, tr.at) > 1.5) && blockAt(dim, tr.at)) {
        entity.teleport(tr.at, { dimension: dim });
      }
      return;
    }
    if (!tr.at) {
      const base = { x: vis.spot.x + OFFSETS[i].x, y: vis.spot.y, z: vis.spot.z + OFFSETS[i].z };
      tr.at = (i === 0 ? undefined : standable(dim, base)) ?? { x: vis.spot.x, y: vis.spot.y, z: vis.spot.z };
      spawnTrader(vis, i, dim, tr.at);
      return;
    }
    if (!nearby || !blockAt(dim, tr.at)) {
      st.missing = 0;
      return;
    }
    if (++st.missing < MISSING_CHECKS) return;
    st.missing = 0;
    const found = dim.getEntities({ type: NPC_TYPE, tags: [VISIT_TAG + vis.v, TRADER_TAG + i] }).filter((e) => e.isValid);
    if (found.length) {
      tr.eid = found[0].id;
      saveVisit();
      for (const e of found.slice(1)) e.remove();
      return;
    }
    spawnTrader(vis, i, dim, tr.at);
  });

  if (!vis.llamas && vis.traders.every((t) => t.eid)) {
    /** @type {string[]} */
    const ids = [];
    for (let n = 0; n < Math.max(0, CONFIG.llamas); n++) {
      const at = standable(dim, { x: vis.spot.x + (n % 2 ? 2 : -2), y: vis.spot.y, z: vis.spot.z - 3 - n }) ?? { x: vis.spot.x, y: vis.spot.y, z: vis.spot.z };
      for (const type of LLAMA_TYPES) {
        try {
          const llama = dim.spawnEntity(type, at);
          for (const tag of [TAG, VISIT_TAG + vis.v, LLAMA_TAG]) llama.addTag(tag);
          llama.nameTag = "§7Caravan Llama"; // named mobs never despawn
          ids.push(llama.id);
          break;
        } catch (e) {
          console.warn(`[caravan] ${type}: ${e}`);
        }
      }
    }
    vis.llamas = ids;
    saveVisit();
  }
  for (const id of vis.llamas ?? []) {
    const llama = entityById(id);
    if (llama && dist(llama.location, vis.spot) > LLAMA_LEASH) {
      const back = { x: vis.spot.x, y: vis.spot.y, z: vis.spot.z - 3 };
      if (blockAt(dim, back)) llama.teleport(back, { dimension: dim });
    }
  }
}

/** Traders turn (a step) toward the nearest player. @param {Visit} vis */
function faceTraders(vis) {
  const range = CONFIG.faceRange;
  if (range <= 0) return;
  vis.traders.forEach((tr, i) => {
    const entity = entityById(tr.eid);
    if (!entity) return;
    const st = traderState.get(i);
    if (!st) return;
    const loc = entity.location;
    const [near] = entity.dimension.getPlayers({ location: loc, maxDistance: range, closest: 1, excludeGameModes: [GameMode.Spectator] });
    if (!near) return;
    const yaw = yawTo(loc, near.location);
    const current = st.yaw ?? entity.getRotation().y;
    const diff = wrap(yaw - current);
    if (Math.abs(diff) < TURN_MIN) return;
    const next = wrap(current + Math.max(-TURN_STEP, Math.min(TURN_STEP, diff)));
    entity.teleport(loc, { rotation: { x: 0, y: next } });
    st.yaw = next;
  });
}

/** Schedule and upkeep: arrive, warn, leave, keep the caravan in place. */
function upkeep() {
  const now = Date.now();
  if (visit) {
    if (now >= visit.until) return depart(false);
    const warn = CONFIG.warnMinutes * 60000;
    if (warn > 0 && !visit.warned && visit.until - now <= warn) {
      visit.warned = true;
      saveVisit();
      broadcast(`§6The merchant caravan leaves in ${duration(visit.until - now)}. §7Last chance to trade at ${visit.spot.name}.`);
    }
    keepCaravan(visit);
    return;
  }
  if (get("enabled") !== true || !world.getAllPlayers().length) return;
  const slot = slotAt(now);
  const last = lastHandled();
  if (last === undefined) {
    world.setDynamicProperty(PROP_LAST, slot); // first run: the first caravan is the next scheduled one
    return;
  }
  const late = Math.max(stayMs(), CONFIG.lateHours * HOUR);
  if (slot > last && now < slot + late) arrive(slot);
}

let loops = 0;
world.afterEvents.worldLoad.subscribe(() => {
  load();
  ready = true;
  try {
    if (visit && Date.now() >= visit.until) depart(true);
    auditAll();
  } catch (e) {
    console.warn(`[caravan] ${e}`);
  }
  system.runInterval(() => {
    loops++;
    try {
      if (loops % KEEP_EVERY === 0) upkeep();
      else if (visit) faceTraders(visit);
    } catch (e) {
      console.warn(`[caravan] ${e}`);
    }
  }, LOOP_TICKS);
  system.runInterval(auditAll, AUDIT_TICKS);
});

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

/**
 * Shows a form, retrying while the player still has chat or another screen open.
 * @template {ActionFormData | ModalFormData} F
 * @param {Player} player @param {F} form
 * @returns {Promise<Awaited<ReturnType<F["show"]>> | undefined>}
 */
async function show(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = /** @type {any} */ (await form.show(player));
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await wait(20);
  }
  return undefined;
}

/**
 * A slider from `min` to `max`, or a plain question when there's only one choice.
 * @param {Player} player @param {string} title @param {string} label @param {number} min @param {number} max @param {string} confirm
 * @returns {Promise<number | undefined>}
 */
async function chooseAmount(player, title, label, min, max, confirm) {
  if (max <= min) {
    const res = await show(player, new ActionFormData().title(title).body(confirm).button("Yes").button("Back"));
    return res && !res.canceled && res.selection === 0 ? min : undefined;
  }
  const res = await show(player, new ModalFormData().title(title).slider(label, min, max, { valueStep: 1, defaultValue: min }).submitButton("OK"));
  if (!res || res.canceled || !res.formValues) return undefined;
  const v = res.formValues.find((x) => typeof x === "number");
  return typeof v === "number" ? Math.floor(v) : undefined;
}

/** @type {Set<string>} */
const shopping = new Set();
/** @type {Map<string, number>} */
const lastTap = new Map();
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  shopping.delete(playerId);
  lastTap.delete(playerId);
});

world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  const { player, target } = ev;
  try {
    if (target.typeId !== NPC_TYPE || !target.hasTag(OWNER_TAG)) return;
    let creative = false;
    try {
      creative = player.getGameMode() === GameMode.Creative;
    } catch {
      creative = false;
    }
    if (player.isSneaking && creative && isOp(player)) return; // the game's NPC editor
    ev.cancel = true;
    system.run(() => {
      try {
        if (!player.isValid || !target.isValid) return;
        const i = traderIndex(target);
        const now = system.currentTick;
        if (shopping.has(player.id) || now - (lastTap.get(player.id) ?? -10) < 10) return;
        lastTap.set(player.id, now);
        shopping.add(player.id);
        shop(player, i ?? 0)
          .catch((e) => console.warn(`[caravan] ${e}`))
          .finally(() => shopping.delete(player.id));
      } catch (e) {
        console.warn(`[caravan] ${e}`);
      }
    });
  } catch (e) {
    console.warn(`[caravan] ${e}`);
  }
});

const GREETINGS = ["Rare goods from far away! Crowns only, friend.", "Look, but don't touch. Unless you're buying.", "We're only here a short while. Choose well.", "Storm Glass? Relic Shards? I pay good Crowns."];

/** @param {Player} player @param {number} i trader index */
async function shop(player, i) {
  const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
  for (let round = 0; round < 50; round++) {
    const vis = visit;
    if (!vis || !player.isValid) return player.isValid ? player.sendMessage("§7The caravan has left.") : undefined;
    const trader = vis.traders[i]?.name ?? "Merchant";
    const items = vis.stock.map((s) => ({ s, g: goods.get(s.id) })).filter((x) => x.g);
    const form = new ActionFormData()
      .title(trader)
      .body(`§e${trader}:§r "${greeting}"\n\nYou have §6${crownsText(crownsOf(player))}§r. The caravan leaves in ${duration(vis.until - Date.now())}.`);
    for (const { s, g } of items) {
      const good = /** @type {Good} */ (g);
      const amount = good.amount > 1 ? `${good.amount} ` : "";
      form.button(`${amount}${goodName(good)}\n${s.left > 0 ? `§8${crownsText(good.price)}, ${s.left} left` : "§8Sold out"}`);
    }
    form.button("Sell to the caravan\n§8Storm Glass, Relic Shards");
    form.button("Goodbye");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
    if (res.selection === items.length) {
      if (!(await sellBack(player, trader))) return;
      continue;
    }
    const chosen = items[res.selection];
    if (!chosen) return; // Goodbye
    await buy(player, vis, chosen.s.id, trader);
  }
}

/** @param {Player} player @param {Visit} vis @param {string} id @param {string} trader */
async function buy(player, vis, id, trader) {
  const g = goods.get(id);
  const entry = vis.stock.find((s) => s.id === id);
  if (!g || !entry) return;
  if (entry.left <= 0) return player.sendMessage(`§c${goodName(g)} is sold out.`);
  const price = Math.max(0, Math.floor(g.price));
  const affordable = price > 0 ? Math.floor(crownsOf(player) / price) : BUY_MAX;
  const most = Math.min(entry.left, affordable, BUY_MAX);
  if (most < 1) return player.sendMessage(`§cYou need ${crownsText(price)} for ${goodName(g)}; you have ${crownsText(crownsOf(player))}.`);
  const each = Math.max(1, Math.floor(g.amount));
  const what = `${each > 1 ? `${each} ` : ""}${goodName(g)}`;
  const n = await chooseAmount(player, trader, `How many times? (${what} for ${crownsText(price)}, ${entry.left} left)`, 1, most, `Buy ${what} for ${crownsText(price)}?`);
  if (n === undefined || !Number.isFinite(n) || n < 1 || !player.isValid) return;
  // The visit, the stock or the balance may have changed while the form was open.
  if (visit !== vis) return player.sendMessage("§7The caravan has left.");
  const count = Math.min(n, most, entry.left);
  if (count < 1) return player.sendMessage(`§c${goodName(g)} sold out meanwhile.`);
  const cost = count * price;
  if (!takeCrowns(player, cost)) return player.sendMessage(`§cYou need ${crownsText(cost)}; you have ${crownsText(crownsOf(player))}.`);
  let dropped = false;
  try {
    dropped = giveGood(player, g, count * each);
  } catch (e) {
    addCrowns(player, cost);
    console.warn(`[caravan] ${g.id}: ${e}`);
    return player.sendMessage("§cThe trader can't hand that over right now. Your Crowns were returned.");
  }
  entry.left -= count;
  saveVisit();
  player.sendMessage(`§a-${crownsText(cost)} §7(Caravan: bought ${count * each} ${goodName(g)}${dropped ? "; some dropped at your feet, your inventory is full" : ""})`);
  player.playSound("random.orb", { pitch: 1.1, volume: 0.8 });
}

/** @param {import("@minecraft/server").ItemStack} item @param {BuyBack} b */
function isBuyBack(item, b) {
  if (item.typeId !== b.item) return false;
  try {
    return item.getLore()[0] === b.lore;
  } catch {
    return false;
  }
}

/** @param {Player} player @param {BuyBack} b */
function countOf(player, b) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  let n = 0;
  if (inv) for (let s = 0; s < inv.size; s++) {
    const item = inv.getItem(s);
    if (item && isBuyBack(item, b)) n += item.amount;
  }
  return n;
}

/** @param {Player} player @param {BuyBack} b @param {number} amount */
function removeItems(player, b, amount) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  let left = amount;
  if (inv) for (let s = 0; s < inv.size && left > 0; s++) {
    const item = inv.getItem(s);
    if (!item || !isBuyBack(item, b)) continue;
    const take = Math.min(item.amount, left);
    left -= take;
    if (take >= item.amount) inv.setItem(s, undefined);
    else {
      item.amount -= take;
      inv.setItem(s, item);
    }
  }
  return amount - left;
}

/** @param {Player} player @param {string} trader @returns {Promise<boolean>} true to go back to the shop */
async function sellBack(player, trader) {
  const offers = CONFIG.buys.map((b) => ({ b, have: countOf(player, b) }));
  const form = new ActionFormData().title(trader).body(`§e${trader}:§r "Bring me what the storms leave behind."`);
  for (const { b, have } of offers) form.button(`${b.name}: ${crownsText(b.price)} each\n§8You have ${have}`);
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined) return false;
  const chosen = offers[res.selection];
  if (!chosen) return true;
  const { b, have } = chosen;
  if (have < 1) {
    player.sendMessage(`§cYou have no ${b.name}.`);
    return true;
  }
  const n = await chooseAmount(player, trader, `How many ${b.name}? (${crownsText(b.price)} each, you have ${have})`, 1, have, `Sell 1 ${b.name} for ${crownsText(b.price)}?`);
  if (n === undefined || !player.isValid) return true;
  if (!visit) {
    player.sendMessage("§7The caravan has left.");
    return false;
  }
  const sold = removeItems(player, b, Math.max(0, Math.min(n, have, countOf(player, b))));
  if (sold < 1) return true;
  addCrowns(player, sold * b.price);
  player.sendMessage(`§6+${crownsText(sold * b.price)} §7(Caravan: sold ${sold} ${b.name})`);
  player.playSound("random.orb", { pitch: 1.2, volume: 0.8 });
  return true;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** @param {import("@minecraft/server").CustomCommandOrigin} origin */
const playerOf = (origin) => {
  const p = origin.initiator ?? origin.sourceEntity;
  return p instanceof Player ? p : undefined;
};

/** @param {Player} player */
function status(player) {
  const now = Date.now();
  /** @type {string[]} */
  const lines = [];
  if (visit) {
    const s = visit.spot;
    let where = `${s.name} (${Math.floor(s.x)}, ${Math.floor(s.z)})`;
    if (s.dim !== player.dimension.id) where += ` in ${dimName(s.dim)}`;
    else {
      const d = Math.round(Math.hypot(s.x - player.location.x, s.z - player.location.z));
      where += d < 8 ? ", right here" : `, ${d}m ${compass(s.x - player.location.x, s.z - player.location.z)} of you`;
    }
    lines.push(`§6The merchant caravan is at ${where}. §7It leaves in ${duration(visit.until - now)}.`);
  } else if (get("enabled") === true) {
    const next = nextSlot(now);
    lines.push(`§6The next merchant caravan comes in ${duration(next - now)} §7(${when(next)}), and stays ${duration(stayMs())}.`);
  } else {
    lines.push("§7Caravans don't come on their own on this realm right now.");
  }
  if (isOp(player)) {
    lines.push(spots.length ? `§8Arrival spots: ${spots.map((s) => s.name).join(", ")}` : "§8No arrival spots: caravans come to world spawn. Add one with /realm:caravan_spot.");
  }
  player.sendMessage(lines.join("\n"));
}

/** @param {Player} player @param {string | undefined} name */
function addSpot(player, name) {
  if (spots.length >= MAX_SPOTS) return player.sendMessage(`§cThere are already ${MAX_SPOTS} spots. Remove one first with /realm:caravan_spot_remove.`);
  let label = (name ?? "").trim().replace(/§./g, "").slice(0, 32);
  if (!label) {
    let n = spots.length + 1;
    while (spots.some((s) => s.name === `Spot ${n}`)) n++;
    label = `Spot ${n}`;
  }
  if (spots.some((s) => s.name === label)) return player.sendMessage(`§cThere is already a spot named "${label}".`);
  const l = player.location;
  const spot = { name: label, dim: player.dimension.id, x: Math.floor(l.x) + 0.5, y: Math.floor(l.y), z: Math.floor(l.z) + 0.5 };
  spots.push(spot);
  saveSpots();
  player.sendMessage(`§aCaravan spot "${label}" added at ${Math.floor(spot.x)}, ${spot.y}, ${Math.floor(spot.z)}. §7The traders stand here and around it (3 blocks out); keep the area clear. ${spots.length} spot${spots.length === 1 ? "" : "s"} in all.`);
}

/** @param {Player} player */
function removeSpot(player) {
  const here = player.location;
  const near = spots
    .filter((s) => s.dim === player.dimension.id)
    .map((s) => ({ s, d: dist(s, here) }))
    .filter((x) => x.d <= CONFIG.removeRange)
    .sort((a, b) => a.d - b.d)[0];
  if (!near) return player.sendMessage(`§cNo caravan spot within ${CONFIG.removeRange} blocks.`);
  spots = spots.filter((s) => s !== near.s);
  saveSpots();
  player.sendMessage(`§aRemoved caravan spot "${near.s.name}". §7${spots.length ? `${spots.length} left.` : "None left: caravans come to world spawn."}`);
}

/** @param {Player | undefined} player */
function call(player) {
  if (visit) {
    const s = visit.spot;
    return player?.sendMessage(`§7The caravan is already here, at ${s.name} (${Math.floor(s.x)}, ${Math.floor(s.z)}), for ${duration(visit.until - Date.now())}.`);
  }
  arrive(undefined);
}

/**
 * Runs `fn` outside the read-only command context.
 * @param {import("@minecraft/server").CustomCommandOrigin} origin @param {(player: Player) => void} fn
 * @returns {import("@minecraft/server").CustomCommandResult}
 */
function withPlayer(origin, fn) {
  const player = playerOf(origin);
  if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
  system.run(() => {
    try {
      if (!ready) return player.sendMessage("§cThe world is still loading. Try again in a moment.");
      if (player.isValid) fn(player);
    } catch (e) {
      console.warn(`[caravan] ${e}`);
    }
  });
  return { status: CustomCommandStatus.Success };
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    { name: "realm:caravan", description: "Merchant Caravan: when the next caravan comes, or where it is now", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => withPlayer(origin, status),
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:caravan_spot",
      description: "Merchant Caravan: add an arrival spot where you stand",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      optionalParameters: [{ name: "name", type: CustomCommandParamType.String }],
    },
    (origin, /** @type {string | undefined} */ name) => withPlayer(origin, (p) => addSpot(p, name)),
  );
  customCommandRegistry.registerCommand(
    { name: "realm:caravan_spot_remove", description: "Merchant Caravan: remove the nearest arrival spot", permissionLevel: CommandPermissionLevel.GameDirectors, cheatsRequired: false },
    (origin) => withPlayer(origin, removeSpot),
  );
  customCommandRegistry.registerCommand(
    { name: "realm:caravan_call", description: "Merchant Caravan: bring the caravan now", permissionLevel: CommandPermissionLevel.GameDirectors, cheatsRequired: false },
    (origin) => {
      const player = playerOf(origin);
      system.run(() => {
        try {
          if (ready) call(player);
        } catch (e) {
          console.warn(`[caravan] ${e}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "caravan_bp");
  },
  { namespaces: ["realm"] },
);
