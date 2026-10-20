// Town Projects' residents (F39): which families a town has room for and where they live, the world cap, the census
// that tells a resident gone from one still in town, and what to spawn, replace or move. No @minecraft import, so the
// unit tests (tools/town-residents.test.mjs) run it in node; main.js does the spawning, tagging and saving.
import { toWorld } from "./designs.js";

/** Families that live at the well while a Settlement (level 1) has no houses. */
export const WELL_HOMES = 2;
/** Most residents of one town, whatever config.js says. */
export const RESIDENT_MAX = 10;
/** Censuses in a row a resident may be missing (while its home is loaded) before it counts as gone. */
export const MISS_LIMIT = 2;
/** Newest residents' names kept for the notice board. */
export const NEW_KEEP = 5;
/** In-game ticks in an in-game minute (20 minutes are one in-game day of 24,000 ticks). */
export const TICKS_PER_MINUTE = 1200;
/** Most characters of a resident's name. */
export const NAME_MAX = 16;

/**
 * The villager look (profession) for a house's job-site block, as the suffix of the vanilla villager_v2 event that
 * sets it (`minecraft:become_<look>`; the shepherd's event is spelled "sheperd" in vanilla).
 */
export const LOOKS = /** @type {Record<string, string>} */ ({
  "minecraft:composter": "farmer",
  "minecraft:lectern": "librarian",
  "minecraft:barrel": "fisherman",
  "minecraft:smoker": "butcher",
  "minecraft:cartography_table": "cartographer",
  "minecraft:brewing_stand": "cleric",
  "minecraft:fletching_table": "fletcher",
  "minecraft:loom": "sheperd",
  "minecraft:stonecutter_block": "mason",
  "minecraft:grindstone": "weaponsmith",
  "minecraft:blast_furnace": "armorer",
  "minecraft:smithing_table": "toolsmith",
  "minecraft:cauldron": "leatherworker",
});
/** The looks of the two families at the well. */
export const WELL_LOOKS = ["farmer", "fisherman"];
const LOOK_SET = new Set([...Object.values(LOOKS), ...WELL_LOOKS, "unskilled"]);
/** @param {string} look */
export const lookEvent = (look) => `minecraft:become_${LOOK_SET.has(look) ? look : "unskilled"}`;

/**
 * A resident: s its slot (0 .. 9; slot k lives in house_<k+1>, slots 0 and 1 at the well until their house is built),
 * i its resident number (the tag town:rid:<town>.<i>; every spawn takes a new one), n its name, h its home ("well" or
 * "house_<k>"; none while it has none), e its entity id, p its look, d the absolute time (ticks) a new family replaces
 * it once it died or went missing, m the censuses in a row it was missing.
 * @typedef {{ s: number, i: number, n: string, h?: string, e?: string, p: string, d?: number, m?: number }} Resident
 */
/** n: the next resident number; r: the residents; new: the newest names, newest last. @typedef {{ n: number, r: Resident[], new: string[] }} Residents */

const isHome = (/** @type {unknown} */ h) => h === "well" || (typeof h === "string" && /^house_([1-9]|10)$/.test(h));
const int = (/** @type {unknown} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : undefined);

/** A resident's name: plain ASCII letters, spaces and dashes, at most NAME_MAX. @param {unknown} s */
export const cleanResidentName = (s) =>
  String(s ?? "")
    .replace(/§./g, "")
    .replace(/[^A-Za-z '-]/g, "")
    .trim()
    .slice(0, NAME_MAX);

/** A saved town:r:<town> record, cleaned: one resident per slot, known homes and looks only. @param {unknown} raw @returns {Residents} */
export function readResidents(raw) {
  /** @type {any} */
  const o = raw && typeof raw === "object" ? raw : {};
  /** @type {Resident[]} */
  const r = [];
  const slots = new Set();
  for (const x of Array.isArray(o.r) ? o.r : []) {
    if (!x || typeof x !== "object") continue;
    const s = int(x.s, 0, RESIDENT_MAX - 1);
    const i = int(x.i, 0, 2 ** 31);
    const n = cleanResidentName(x.n);
    if (s === undefined || i === undefined || !n || slots.has(s)) continue;
    slots.add(s);
    /** @type {Resident} */
    const rec = { s, i, n, p: LOOK_SET.has(x.p) ? x.p : "unskilled" };
    if (isHome(x.h)) rec.h = x.h;
    if (typeof x.e === "string" && x.e.length <= 32) rec.e = x.e;
    if (typeof x.d === "number" && Number.isFinite(x.d)) rec.d = Math.floor(x.d);
    const m = int(x.m, 1, MISS_LIMIT);
    if (m) rec.m = m;
    r.push(rec);
  }
  r.sort((a, b) => a.s - b.s);
  const top = r.reduce((a, x) => Math.max(a, x.i + 1), 0);
  const n = Math.max(top, int(o.n, 0, 2 ** 31) ?? 0);
  const fresh = (Array.isArray(o.new) ? o.new : []).map(cleanResidentName).filter(Boolean).slice(-NEW_KEEP);
  return { n, r, new: fresh };
}

/**
 * Families a town has room for at a level: level 1 the first entry of `perLevel` (at most WELL_HOMES), and only once
 * its well is built; from level 2 the level's entry (the last for higher levels); at most `capTown` and RESIDENT_MAX.
 * @param {number} lvl @param {boolean} wellBuilt @param {unknown} perLevel @param {unknown} capTown
 */
export function slotCount(lvl, wellBuilt, perLevel, capTown) {
  const list = Array.isArray(perLevel) ? perLevel : [];
  if (!(lvl >= 1) || !list.length) return 0;
  const c = Number(capTown);
  const top = Number.isFinite(c) ? Math.max(0, Math.min(RESIDENT_MAX, Math.floor(c))) : RESIDENT_MAX;
  const n = Number(list[Math.min(Math.floor(lvl), list.length) - 1]);
  if (!Number.isFinite(n)) return 0;
  if (lvl < 2) return wellBuilt ? Math.max(0, Math.min(top, WELL_HOMES, Math.floor(n))) : 0;
  return Math.max(0, Math.min(top, Math.floor(n)));
}

/**
 * Each slot's home now: its own house (house_<slot+1>) once built, else the well for slots 0 and 1 once the well is
 * built, else none (that family waits). @param {number} slots @param {(id: string) => boolean} built @returns {(string | undefined)[]}
 */
export function homesFor(slots, built) {
  /** @type {(string | undefined)[]} */
  const out = [];
  for (let k = 0; k < slots; k++) {
    const house = `house_${k + 1}`;
    out.push(built(house) ? house : k < WELL_HOMES && built("well") ? "well" : undefined);
  }
  return out;
}

/**
 * Where a home's family stands (its block, feet level) for a spot: inside the house in front of the bed, or beside
 * the well (slot 0 to its left, slot 1 to its right, on the spot's own row). @param {string} home
 * @param {{ x: number, y: number, z: number, f: number }} spot @param {number} slot
 */
export const homeAt = (home, spot, slot) => (home === "well" ? toWorld(spot, slot % 2 ? 3 : -3, 0, 3) : toWorld(spot, 0, 0, 4));

/** The look of a home's family: its house's job site, or the well's two. @param {string} home @param {number} slot @param {(home: string) => string | undefined} jobOf */
export const lookFor = (home, slot, jobOf) => (home === "well" ? WELL_LOOKS[slot % WELL_LOOKS.length] : (LOOKS[jobOf(home) ?? ""] ?? "farmer"));

/**
 * New residents each town may get now under the world cap: nobody is ever removed, so the room is the cap less every
 * living resident, given to the towns with the highest level first, then the oldest. A town gets at most its own
 * free slots. @param {{ id: string, lvl: number, at: number, living: number, slots: number }[]} towns @param {number} capWorld
 * @returns {Map<string, number>}
 */
export function allocate(towns, capWorld) {
  let room = Math.max(0, Math.floor(Number(capWorld) || 0)) - towns.reduce((a, t) => a + t.living, 0);
  /** @type {Map<string, number>} */
  const out = new Map();
  for (const t of [...towns].sort((a, b) => b.lvl - a.lvl || a.at - b.at || (a.id < b.id ? -1 : 1))) {
    const k = Math.max(0, Math.min(t.slots - t.living, room));
    out.set(t.id, k);
    room -= k;
  }
  return out;
}

/** Living residents (not waiting to be replaced). @param {Residents} rs */
export const livingOf = (rs) => rs.r.filter((x) => x.d === undefined).length;

/** @param {string} town @param {number} i */
export const ridTag = (town, i) => `town:rid:${town}.${i}`;
/** The resident number in a town's rid tag, or undefined. @param {string} town @param {string[]} tags */
export function ridOf(town, tags) {
  const pre = `town:rid:${town}.`;
  for (const tag of tags) if (tag.startsWith(pre) && /^\d+$/.test(tag.slice(pre.length))) return Number(tag.slice(pre.length));
  return undefined;
}

/**
 * The census of one town: the residents found (every loaded entity with the town's tag) against its records.
 * - A found entity is a record's resident when its rid matches, the record is alive, and no other entity with the same
 *   rid is that record's entity id; every other one loses the town's tags (a cured zombie villager, a stray left from
 *   a move or a replaced family): never killed.
 * - A resident found resets its missing count and, farther than `radius` from the center, is sent home (`teleport`).
 * - A living resident not found while its home is loaded is missing; MISS_LIMIT censuses in a row and it is gone: a new
 *   family replaces it at `now + replaceTicks`.
 * Returns the records (changed copies) and what to do.
 * @param {{ rs: Residents, town: string, found: { id: string, rid?: number, x: number, z: number }[], loaded: (r: Resident) => boolean,
 *   center: { x: number, z: number }, radius: number, now: number, replaceTicks: number }} o
 * @returns {{ rs: Residents, untag: string[], teleport: { id: string, s: number }[], gone: number[], changed: boolean }}
 */
export function reconcile(o) {
  const rs = { n: o.rs.n, r: o.rs.r.map((x) => ({ ...x })), new: [...o.rs.new] };
  /** @type {string[]} */
  const untag = [];
  /** @type {{ id: string, s: number }[]} */
  const teleport = [];
  /** @type {number[]} */
  const gone = [];
  let changed = false;
  /** @type {Map<number, typeof o.found>} */
  const byRid = new Map();
  for (const f of o.found) {
    const list = f.rid === undefined ? undefined : byRid.get(f.rid);
    if (f.rid === undefined) untag.push(f.id);
    else if (list) list.push(f);
    else byRid.set(f.rid, [f]);
  }
  const matched = new Set();
  for (const [rid, list] of byRid) {
    const rec = rs.r.find((x) => x.i === rid && x.d === undefined);
    if (!rec) {
      for (const f of list) untag.push(f.id);
      continue;
    }
    const keep = list.find((f) => f.id === rec.e) ?? list[0];
    for (const f of list) if (f !== keep) untag.push(f.id);
    matched.add(rec.s);
    if (rec.e !== keep.id || rec.m) changed = true;
    rec.e = keep.id;
    delete rec.m;
    if (Math.hypot(keep.x - o.center.x, keep.z - o.center.z) > o.radius) teleport.push({ id: keep.id, s: rec.s });
  }
  for (const rec of rs.r) {
    if (rec.d !== undefined || matched.has(rec.s) || !o.loaded(rec)) continue;
    changed = true;
    const m = (rec.m ?? 0) + 1;
    if (m < MISS_LIMIT) {
      rec.m = m;
      continue;
    }
    delete rec.m;
    delete rec.e;
    rec.d = o.now + o.replaceTicks;
    gone.push(rec.s);
  }
  return { rs, untag, teleport, gone, changed };
}

/**
 * What the town does about its families now:
 * - `spawn`: a family for each slot with a home and no living resident (a replacement once its time has come, then new
 *   slots), at most `room` of them (the world cap's share, allocate);
 * - `move`: a living resident whose home changed (the well's pair once their houses are built), respawned at its new
 *   home under the same name;
 * - `drop`: slots past the town's room whose family is gone (never a living one: lowering a cap removes nobody).
 * @param {Residents} rs @param {(string | undefined)[]} homes per slot (homesFor) @param {number} room @param {number} now
 * @returns {{ spawn: { s: number, h: string, replace: boolean }[], move: { s: number, h: string }[], drop: number[] }}
 */
export function plan(rs, homes, room, now) {
  /** @type {{ s: number, h: string, replace: boolean }[]} */
  const due = [];
  /** @type {{ s: number, h: string, replace: boolean }[]} */
  const fresh = [];
  /** @type {{ s: number, h: string }[]} */
  const move = [];
  /** @type {number[]} */
  const drop = [];
  const bySlot = new Map(rs.r.map((x) => [x.s, x]));
  for (const rec of rs.r) if (rec.s >= homes.length && rec.d !== undefined) drop.push(rec.s);
  homes.forEach((h, s) => {
    const rec = bySlot.get(s);
    if (!h) return;
    if (!rec) fresh.push({ s, h, replace: false });
    else if (rec.d !== undefined) {
      if (rec.d <= now) due.push({ s, h, replace: true });
    } else if (rec.h !== h) move.push({ s, h });
  });
  return { spawn: [...due, ...fresh].slice(0, Math.max(0, room)), move, drop };
}

/**
 * A name for a new family: the first of `names` no living resident in the world has, else the first this town
 * doesn't use, else the first. @param {string[]} names @param {Set<string>} world @param {Set<string>} town
 */
export function pickName(names, world, town) {
  const list = names.map(cleanResidentName).filter(Boolean);
  return list.find((n) => !world.has(n)) ?? list.find((n) => !town.has(n)) ?? list[0] ?? "Villager";
}

/** The record after a family moved in: its name added to the newest list. @param {Residents} rs @param {string} name */
export const addNew = (rs, name) => ({ ...rs, new: [...rs.new.filter((x) => x !== name), name].slice(-NEW_KEEP) });
