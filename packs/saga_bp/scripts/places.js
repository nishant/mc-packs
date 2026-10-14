// Story places: where they are (set by an operator, or picked by the pack), building their prefab
// with a snapshot of the terrain first (so Remove puts it back exactly), the outline preview, and the
// operators' places menu.
import { Player, StructureSaveMode, system, world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { CAMPS, PREFABS, buildSteps, footprint, prefabInfo, rotate, siteOk } from "./prefabs.js";
import { get } from "./settings.js";
import { farDist, farOffset, refresh as refreshFar, setPlaceDist } from "./scale.js";
import { PLACES, STORIES } from "./stories.js";
import { FAVORS } from "./stories/index.js";
import { OVERWORLD, across, coords, dimName, groundAt, hash, isOp, itemName, num, send, show, wait } from "./util.js";
import { WANDERERS } from "./stories/index.js";

/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("./prefabs.js").PrefabInfo} PrefabInfo */
/** @typedef {import("./types.js").Objective} Objective */
/** @typedef {import("./types.js").Where} Where */

/**
 * A place in the world property `saga:places`.
 * @typedef {object} SavedPlace
 * @property {string} dim
 * @property {number} x
 * @property {number} [y] missing only while a picked place waits to be built
 * @property {number} z
 * @property {string} [by] the operator who set it
 * @property {number} [f] facing of the build, 0..3 (quarter turns)
 * @property {number} [b] 1 = the prefab was built here
 * @property {number} [a] 1 = picked by the pack
 * @property {number} [p] 1 = picked, waiting for a player to come close so it can be built
 * @property {number} [mv] how often a picked spot was moved because the land didn't suit it
 * @property {[string, number, number, number][]} [s] terrain snapshot: structure id and where it goes back
 * @property {string} [pf] a wanderer's camp (`camp:<wanderer>`): its prefab
 * @property {string} [w] a camp: the wanderer's id
 * @property {number} [yh] a camp: the height it was asked for (deep camps are carved there)
 * @property {Record<string, number>} [u] a camp: players on that wanderer's chain (id -> when they last needed it)
 * @property {number} [v] a camp: when a player was last near it (ms)
 */
/** Where something is for the tracker. @typedef {{ dim: string, x: number, y?: number, z: number, label: string, pending?: boolean }} Loc */

export const PROP_PLACES = "saga:places";
const MAX_MOVES = 6;
const RELAX_AFTER = 3; // moves before the site rules are relaxed (any open land will do)
const PREVIEW_TICKS = 600;
const TILE = 64; // a structure is at most 64 blocks across

/** Blocks players make and nature doesn't (as Bounty Board checks): a picked place never covers them. */
const BUILT =
  /planks|glass|chest|barrel|sign|bed$|torch|lantern|door|fence|wool|carpet|concrete|glazed|crafting_table|furnace|smoker|bookshelf|lectern|anvil|hopper|_rail|^minecraft:rail|banner|campfire|loom|smithing|cartography|fletching|grindstone|stonecutter|enchanting|beacon|bell|composter|cauldron|brewing|jukebox|note_block|scaffolding|ladder|stairs|slab|brick|polished|item_frame|flower_pot|candle|shulker|dispenser|dropper|piston|observer|repeater|comparator|redstone_lamp|lever|button|pressure_plate/;

// ---------------------------------------------------------------------------
// Saved places
// ---------------------------------------------------------------------------

/** @type {Record<string, SavedPlace> | undefined} */
let places;

/** @returns {Record<string, SavedPlace>} */
export function placesOf() {
  if (places) return places;
  try {
    const raw = world.getDynamicProperty(PROP_PLACES);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : {};
    places = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {}; // world not loaded yet, or corrupt: try again next time
  }
  return /** @type {Record<string, SavedPlace>} */ (places);
}

/**
 * Sets (or with undefined, forgets) a place, and tells other packs (`realm:place_ready`) when where it is
 * changed (not for a camp's visit times). @param {string} name @param {SavedPlace | undefined} rec
 */
export function setPlace(name, rec) {
  const old = placesOf()[name];
  const next = { ...placesOf() };
  if (rec) next[name] = rec;
  else delete next[name];
  world.setDynamicProperty(PROP_PLACES, JSON.stringify(next));
  places = next;
  if (!isCamp(name) && (old?.x !== rec?.x || old?.z !== rec?.z)) refreshFar();
  if (!old || !rec || old.x !== rec.x || old.y !== rec.y || old.z !== rec.z || old.dim !== rec.dim || !!old.b !== !!rec.b || !!old.p !== !!rec.p) placeReady(name, old?.b && rec?.b ? "moved" : undefined);
}

setPlaceDist((name) => {
  const p = placesOf()[name];
  if (!p || p.dim !== OVERWORLD) return undefined;
  const s = spawnXZ();
  return Math.hypot(p.x - s.x, p.z - s.z);
});

/** Is this an instanced wanderer's camp? @param {string} name */
export const isCamp = (name) => name.startsWith("camp:");
/** A camp's place name. @param {string} wid */
export const campName = (wid) => `camp:${wid}`;
/** The prefab a place builds: its own name, or a camp's `pf`. @param {string} name */
export const pfOf = (name) => (isCamp(name) ? placesOf()[name]?.pf ?? "camp_road" : name);
/** A structure id safe for any place name. @param {string} name */
const sid = (name) => name.replace(/[^a-z0-9_]/g, "_");

/** @param {string} name */
export const placeLabel = (name) => {
  if (isCamp(name)) {
    const w = WANDERERS.find((x) => x.id === name.slice(5));
    return `${w ? w.short : "A Wanderer"}'s Camp`;
  }
  return PLACES[name] ?? PREFABS[name]?.label ?? name;
};

/**
 * `realm:place_ready` { name, state, dim, x, y?, z, wid? }: where a place is now. State "picked" (not built
 * yet), "built", "set" (an operator's spot without a building), "moved" (a built camp moved), "removed". A
 * built camp's x, y, z is where its wanderer stands. @param {string} name @param {string} [state]
 */
export function placeReady(name, state) {
  const rec = placesOf()[name];
  /** @type {Record<string, unknown>} */
  const msg = { name };
  if (!rec) msg.state = "removed";
  else {
    msg.state = state && rec.b ? state : rec.p ? "picked" : rec.b ? "built" : "set";
    const spot = isCamp(name) && rec.b ? featureSpot(name, "actor") : undefined;
    const at = spot ?? rec;
    Object.assign(msg, { dim: rec.dim, x: Math.floor(at.x), z: Math.floor(at.z) });
    if (at.y !== undefined) msg.y = Math.floor(at.y);
  }
  if (isCamp(name)) {
    msg.wid = name.slice(5);
    msg.label = placeLabel(name); // "Pell's Camp", for the Minimap
  }
  send("realm:place_ready", msg);
}

/** Every place again (at load and on `realm:place_ping`), a few per tick. */
export function placesReadyAll() {
  const names = Object.keys(placesOf());
  names.forEach((n, i) => system.runTimeout(() => placeReady(n), 1 + Math.floor(i / 4)));
}

/**
 * A place's name in a sentence: "the Lighthouse", but "The Gray Ring" and "Wren's Meadow" as they are.
 * @param {string} name @param {boolean} [start] at the start of a sentence
 */
export function named(name, start = false) {
  const label = placeLabel(name);
  if (/^the /i.test(label) || /'s /.test(label)) return label;
  return `${start ? "The" : "the"} ${label}`;
}

/** The prefab's site rules, or plain land a few hundred blocks out when there is no prefab. @param {string} name @returns {PrefabInfo} */
export const infoOf = (name) => prefabInfo(pfOf(name)) ?? { label: placeLabel(name), size: { x: 5, y: 5, z: 5 }, site: "land", minDist: 100, maxDist: 400, features: {} };

/** @param {Vector3} o @param {number} facing */
const turn = (o, facing) => {
  try {
    return rotate(o, facing);
  } catch {
    return o;
  }
};

/**
 * A spot relative to a place (a clue, a stealth goal), turned with the build when it was built.
 * @param {string} name @param {{ x: number, y?: number, z: number }} off @returns {{ dim: string, x: number, y?: number, z: number } | undefined}
 */
export function placeSpot(name, off) {
  const rec = placesOf()[name];
  if (!rec) return undefined;
  const r = rec.b ? turn({ x: off.x, y: off.y ?? 0, z: off.z }, rec.f ?? 0) : { x: off.x, y: off.y ?? 0, z: off.z };
  return { dim: rec.dim, x: rec.x + r.x, y: rec.y === undefined ? undefined : off.y === undefined ? undefined : rec.y + r.y, z: rec.z + r.z };
}

/** A named feature of a built place's prefab (`bell`, `door`, `actor`), or undefined. @param {string} name @param {string} feature */
export function featureSpot(name, feature) {
  const rec = placesOf()[name];
  const feats = prefabInfo(pfOf(name))?.features;
  // A camp has one spot for people: whoever a story places there (an escort's wanderer) stands at it.
  const f = feats?.[feature] ?? (isCamp(name) ? feats?.actor : undefined);
  if (!rec || !rec.b || !f || rec.y === undefined) return undefined;
  const r = turn(f, rec.f ?? 0);
  return { dim: rec.dim, x: rec.x + r.x, y: rec.y + r.y, z: rec.z + r.z };
}

/** World spawn x/z. */
function spawnXZ() {
  try {
    const s = world.getDefaultSpawnLocation();
    return { x: Math.floor(s.x), z: Math.floor(s.z) };
  } catch {
    return { x: 0, z: 0 };
  }
}

/**
 * Where a location (an objective, or a `from`/`to`/`spawnAt`) is: a Loc, the name of a place nobody
 * has set (a string), or undefined when it names no location.
 * @param {Where | Objective | undefined} w @param {string} [label] @returns {Loc | string | undefined}
 */
export function locate(w, label) {
  if (!w) return undefined;
  if (w.place) {
    const p = placesOf()[w.place];
    if (!p) return w.place;
    return { dim: p.dim, x: p.x, y: p.y, z: p.z, label: w.mark ?? placeLabel(w.place), pending: !!p.p };
  }
  if (w.at) return { dim: w.at.dim ?? OVERWORLD, x: w.at.x, z: w.at.z, label: w.mark ?? label ?? "the spot" };
  if (w.offset) {
    const s = spawnXZ();
    const o = farOffset(w.offset);
    return { dim: OVERWORLD, x: s.x + o.x, z: s.z + o.z, label: w.mark ?? label ?? "the spot" };
  }
  return undefined;
}

/** Place names an objective uses (its own, and its from/to/spawnAt). @param {Objective} obj */
export function placesIn(obj) {
  return [obj.place, obj.from?.place, obj.to?.place, obj.spawnAt?.place].filter((x) => typeof x === "string");
}

// ---------------------------------------------------------------------------
// Picking a place
// ---------------------------------------------------------------------------

/** A spot in the place's distance band from world spawn, away from other places. @param {string} name @param {{ x: number, z: number }} [near] */
function pickSpot(name, near) {
  const info = infoOf(name);
  const s = spawnXZ();
  const lo = Math.max(16, Math.round(farDist(Math.min(info.minDist, info.maxDist))));
  const hi = Math.max(lo + 1, Math.round(farDist(info.maxDist)));
  const others = Object.entries(placesOf()).filter(([n]) => n !== name).map(([, p]) => p);
  let best = { x: s.x + lo, z: s.z };
  for (let i = 0; i < 40; i++) {
    let x;
    let z;
    if (near) {
      const a = Math.random() * Math.PI * 2;
      const d = 80 + Math.random() * 80;
      x = Math.round(near.x + Math.cos(a) * d);
      z = Math.round(near.z + Math.sin(a) * d);
      const fromSpawn = Math.hypot(x - s.x, z - s.z);
      if ((fromSpawn < lo || fromSpawn > hi) && i < 30) continue;
    } else {
      const a = Math.random() * Math.PI * 2;
      const d = lo + Math.random() * (hi - lo);
      x = Math.round(s.x + Math.cos(a) * d);
      z = Math.round(s.z + Math.sin(a) * d);
    }
    best = { x, z };
    if (others.every((p) => p.dim !== OVERWORLD || Math.hypot(p.x - x, p.z - z) >= 64)) break;
  }
  return best;
}

/**
 * Makes sure a place exists: picks a spot for an unset place (when `autoPlaces` is on). Returns
 * true if the place is set or now picked.
 * @param {string} name
 */
export function ensurePlace(name) {
  if (placesOf()[name]) return true;
  if (isCamp(name)) return false; // a chapter makes it (its `camp`), never picked
  if (get("autoPlaces") !== true) return false;
  const spot = pickSpot(name);
  setPlace(name, { dim: OVERWORLD, x: spot.x, z: spot.z, a: 1, p: 1 });
  return true;
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

/** Places being built right now. @type {Set<string>} */
const building = new Set();
/** How often each picked place waited for unloaded ground (at most MAX_WAITS, then it moves). @type {Map<string, number>} */
const waits = new Map();
const MAX_WAITS = 8;
/** When each picked place may be tried again (ms). @type {Map<string, number>} */
const retryAt = new Map();

/** Are all four corners of a box loaded (bottom and top)? @param {Dimension} dim @param {{ min: Vector3, max: Vector3 }} box */
function boxLoaded(dim, box) {
  try {
    for (const x of [box.min.x, box.max.x])
      for (const z of [box.min.z, box.max.z])
        for (const y of [box.min.y, box.max.y]) {
          const yy = Math.max(-64, Math.min(319, y));
          if (!dim.getBlock({ x, y: yy, z })) return false;
        }
    return true;
  } catch {
    return false;
  }
}

/** A footprint box, clamped to the world's height. @param {string} name @param {Vector3} origin @param {number} facing */
function boxOf(name, origin, facing) {
  const b = footprint(pfOf(name), origin, facing);
  return {
    min: { x: Math.min(b.min.x, b.max.x), y: Math.max(-64, Math.min(b.min.y, b.max.y)), z: Math.min(b.min.z, b.max.z) },
    max: { x: Math.max(b.min.x, b.max.x), y: Math.min(319, Math.max(b.min.y, b.max.y)), z: Math.max(b.min.z, b.max.z) },
  };
}

/**
 * Saves the blocks of a box as world structures (tiles of at most 64 x 64), so they can be put back.
 * @param {string} name @param {Dimension} dim @param {{ min: Vector3, max: Vector3 }} box @returns {[string, number, number, number][]}
 */
function snapshot(name, dim, box) {
  /** @type {[string, number, number, number][]} */
  const out = [];
  const sm = world.structureManager;
  let k = 0;
  for (let x = box.min.x; x <= box.max.x; x += TILE)
    for (let z = box.min.z; z <= box.max.z; z += TILE) {
      const id = `saga:place_${sid(name)}_${k++}`;
      try {
        if (sm.get(id)) sm.delete(id);
      } catch {
        // not there
      }
      const from = { x, y: box.min.y, z };
      const to = { x: Math.min(box.max.x, x + TILE - 1), y: box.max.y, z: Math.min(box.max.z, z + TILE - 1) };
      sm.createFromWorld(id, dim, from, to, { includeEntities: false, saveMode: StructureSaveMode.World });
      out.push([id, from.x, from.y, from.z]);
    }
  return out;
}

/** Puts a place's terrain back from its snapshot and deletes the snapshot. @param {SavedPlace} rec @returns {boolean} */
function restore(rec) {
  if (!rec.s?.length) return false;
  const dim = world.getDimension(rec.dim);
  const sm = world.structureManager;
  let ok = true;
  for (const [id, x, y, z] of rec.s) {
    try {
      sm.place(id, dim, { x, y, z }, { includeEntities: false });
      const loaded = !!dim.getBlock({ x, y, z });
      // Deleting at once could drop a placement queued for an unloaded chunk: wait, and keep it if still unloaded.
      if (loaded)
        system.runTimeout(() => {
          try {
            sm.delete(id);
          } catch {
            // already gone
          }
        }, 40);
    } catch (e) {
      ok = false;
      console.warn(`[saga] restore ${id}: ${e}`);
    }
  }
  return ok;
}

/**
 * Runs a prefab's build as a job; resolves true when done, false on an error.
 * @param {string} name @param {Dimension} dim @param {Vector3} origin @param {number} facing
 */
function runBuild(name, dim, origin, facing) {
  return new Promise((resolve) => {
    /** @returns {Generator<void, void, void>} */
    function* job() {
      try {
        const steps = buildSteps(pfOf(name), dim, origin, facing);
        while (true) {
          let r;
          try {
            r = steps.next();
          } catch (e) {
            console.warn(`[saga] build ${name}: ${e}`);
            resolve(false);
            return;
          }
          if (r.done) break;
          yield;
        }
        resolve(true);
      } catch (e) {
        console.warn(`[saga] build ${name}: ${e}`);
        resolve(false);
      }
    }
    system.runJob(job());
  });
}

/** Tells operators online. @param {string} text */
function tellOps(text) {
  for (const p of world.getAllPlayers()) if (isOp(p)) p.sendMessage(text);
}

/**
 * Builds a place's prefab at a spot: snapshots the terrain, builds, and saves the place. Any earlier
 * build of it elsewhere is removed first.
 * @param {string} name @param {Dimension} dim @param {Vector3} origin @param {number} facing @param {Partial<SavedPlace>} extra
 * @returns {Promise<string | undefined>} an error, or undefined when built
 */
export async function buildAt(name, dim, origin, facing, extra) {
  if (building.has(name)) return "it is being built already";
  if (!prefabInfo(pfOf(name))) return "it has no building";
  const o = { x: Math.floor(origin.x), y: Math.floor(origin.y), z: Math.floor(origin.z) };
  const box = boxOf(name, o, facing);
  if (!boxLoaded(dim, box)) return "part of the area isn't loaded; stand closer";
  building.add(name);
  try {
    const old = placesOf()[name];
    if (old?.b && old.s && (old.x !== o.x || old.y !== o.y || old.z !== o.z || old.dim !== dim.id || (old.f ?? 0) !== facing)) restore(old);
    let snap;
    try {
      snap = snapshot(name, dim, box);
    } catch (e) {
      return `the terrain couldn't be saved (${e})`;
    }
    const ok = await runBuild(name, dim, o, facing);
    setPlace(name, { ...extra, dim: dim.id, x: o.x, y: o.y, z: o.z, f: facing, b: 1, s: snap });
    if (isCamp(name)) campSign(name);
    return ok ? undefined : "the build stopped part way (an unloaded chunk?); use Rebuild";
  } finally {
    building.delete(name);
  }
}

/** Rebuilds a built place in the same spot (repairs it). @param {string} name */
export async function rebuild(name) {
  const rec = placesOf()[name];
  if (!rec || !rec.b || rec.y === undefined) return "it isn't built";
  if (building.has(name)) return "it is being built already";
  const dim = world.getDimension(rec.dim);
  const o = { x: rec.x, y: rec.y, z: rec.z };
  if (!boxLoaded(dim, boxOf(name, o, rec.f ?? 0))) return "part of the area isn't loaded; stand closer";
  building.add(name);
  try {
    const ok = await runBuild(name, dim, o, rec.f ?? 0);
    if (isCamp(name)) campSign(name);
    return ok ? undefined : "the build stopped part way";
  } finally {
    building.delete(name);
  }
}

/** Removes a place: puts the terrain back (when it was built) and forgets the spot. @param {string} name */
export function removePlace(name) {
  const rec = placesOf()[name];
  if (!rec) return false;
  if (rec.b) restore(rec);
  setPlace(name, undefined);
  retryAt.delete(name);
  return true;
}

/** Removes a place and picks a new spot for it, built when a player comes close. @param {string} name */
export function relocate(name) {
  const rec = placesOf()[name];
  const near = rec ? { x: rec.x, z: rec.z } : undefined;
  removePlace(name);
  const spot = pickSpot(name, near);
  setPlace(name, { dim: OVERWORLD, x: spot.x, z: spot.z, a: 1, p: 1 });
  return spot;
}

/**
 * Looks for a spot near a picked place that suits its prefab and holds nothing player-made, as a job.
 * @param {string} name @param {SavedPlace} rec @param {boolean} relaxed accept any open land
 * @returns {Promise<{ found?: { x: number, y: number, z: number, f: number }, unloaded: number }>}
 */
function search(name, rec, relaxed) {
  return new Promise((resolve) => {
    const dim = world.getDimension(rec.dim);
    /** @type {[number, number][]} */
    const offsets = [[0, 0]];
    for (const r of [12, 24, 36, 48]) for (let k = 0; k < 8; k++) offsets.push([Math.round(Math.cos((k * Math.PI) / 4) * r), Math.round(Math.sin((k * Math.PI) / 4) * r)]);
    const facing = hash(name + rec.x + rec.z) % 4;
    const camp = isCamp(name);
    /** @returns {Generator<void, void, void>} */
    function* job() {
      let unloaded = 0;
      for (const [dx, dz] of offsets) {
        const x = rec.x + dx;
        const z = rec.z + dz;
        let y;
        try {
          const site = siteOk(pfOf(name), dim, x, z, rec.yh);
          if (site.ok && typeof site.y === "number") y = site.y;
          else if (site.reason === "not loaded") {
            unloaded++;
            continue;
          } else if (relaxed && prefabInfo(pfOf(name))?.site !== "deep") y = PREFABS[name]?.y ?? groundAt(dim, x, z); // underground and sky places keep their height
        } catch {
          unloaded++;
          continue;
        }
        yield;
        if (y === undefined) continue;
        const box = boxOf(name, { x, y, z }, facing);
        if (!boxLoaded(dim, box)) {
          unloaded++;
          continue;
        }
        let clean = true;
        let n = 0;
        try {
          for (let bx = box.min.x; bx <= box.max.x && clean; bx++)
            for (let bz = box.min.z; bz <= box.max.z && clean; bz++)
              for (let by = box.min.y; by <= box.max.y; by++) {
                const b = dim.getBlock({ x: bx, y: by, z: bz });
                if (!b) {
                  clean = false;
                  break;
                }
                if (!b.isAir && BUILT.test(b.typeId)) {
                  clean = false;
                  break;
                }
                // A camp is carved into the land: no lava inside it to let loose.
                if (camp && b.isLiquid && b.typeId.includes("lava")) {
                  clean = false;
                  break;
                }
                if (++n % 300 === 0) yield;
              }
        } catch {
          clean = false;
        }
        if (clean) {
          resolve({ found: { x, y, z, f: facing }, unloaded });
          return;
        }
        yield;
      }
      resolve({ unloaded });
    }
    system.runJob(job());
  });
}

/** Builds a picked place once a player is close: finds the exact spot, or moves it if the land doesn't suit. @param {string} name @param {Player} near */
async function autoBuild(name, near) {
  if (building.has(name)) return;
  const rec = placesOf()[name];
  if (!rec || !rec.p) return;
  building.add(name);
  /** @type {{ found?: { x: number, y: number, z: number, f: number }, unloaded: number }} */
  let res;
  try {
    res = await search(name, rec, (rec.mv ?? 0) >= RELAX_AFTER);
  } finally {
    building.delete(name);
  }
  const now = placesOf()[name];
  if (!now || !now.p || now.x !== rec.x || now.z !== rec.z) return; // changed meanwhile
  if (res.found) {
    const f = res.found;
    if (!prefabInfo(pfOf(name))) {
      setPlace(name, { dim: rec.dim, x: f.x, y: f.y, z: f.z, a: 1 });
      return;
    }
    const err = await buildAt(name, world.getDimension(rec.dim), f, f.f, { ...campFields(rec), a: 1 });
    if (err) {
      retryAt.set(name, Date.now() + 20000);
      console.warn(`[saga] auto place ${name}: ${err}`);
    } else if (!isCamp(name)) tellOps(`§7[Story] Built ${named(name)} at ${f.x} ${f.y} ${f.z} (picked by the pack; /realm:saga_places to change it).`);
    return;
  }
  if (res.unloaded > 0 && (waits.get(name) ?? 0) < MAX_WAITS) {
    waits.set(name, (waits.get(name) ?? 0) + 1);
    retryAt.set(name, Date.now() + 4000);
    return; // part of the area isn't loaded yet: try again in a moment
  }
  // The loaded part didn't suit it (or the rest never loaded): move on rather than wait forever.
  waits.delete(name);
  // Nothing nearby suits it: move the spot.
  const mv = (rec.mv ?? 0) + 1;
  if (mv > MAX_MOVES && !isCamp(name)) {
    retryAt.set(name, Date.now() + 600000);
    tellOps(`§e[Story] No good spot found for ${named(name)} near ${rec.x} ${rec.z}. Set it by hand: /realm:saga_places.`);
    return;
  }
  // A camp moves a little (it isn't tied to a distance from spawn); a deep camp keeps its height.
  const spot = isCamp(name) ? campStep(rec, mv) : pickSpot(name, { x: rec.x, z: rec.z });
  setPlace(name, { ...rec, x: spot.x, z: spot.z, mv });
  if (isCamp(name)) return;
  if (near.isValid) near.sendMessage(`§e[Story] ${named(name, true)} isn't here after all: the land didn't suit it. The tracker now points to where it really is.`);
}

// ---------------------------------------------------------------------------
// Wanderers' camps: instanced places `camp:<wanderer>`, made and moved by chapters
// ---------------------------------------------------------------------------

/** A camp's own fields, kept through a build. @param {SavedPlace} rec */
const campFields = (rec) => (rec.pf ? { pf: rec.pf, w: rec.w, yh: rec.yh, u: rec.u, v: rec.v } : {});

/** The next spot to try for a camp that didn't fit: around where it was asked for. @param {SavedPlace} rec @param {number} mv */
function campStep(rec, mv) {
  const a = hash(`${rec.w}:${mv}`) / 4294967296 * Math.PI * 2;
  const d = 24 + 8 * Math.min(mv, 10);
  return { x: Math.round(rec.x + Math.cos(a) * d), z: Math.round(rec.z + Math.sin(a) * d) };
}

/** Writes "Waystone: <Name>'s Camp" on a built camp's sign (Waystones & Inns makes a waystone of it on a tap). @param {string} name */
function campSign(name) {
  const at = featureSpot(name, "sign");
  const rec = placesOf()[name];
  if (!at || !rec) return;
  try {
    const sign = world.getDimension(rec.dim).getBlock(at)?.getComponent("minecraft:sign");
    sign?.setText(`Waystone:\n${placeLabel(name)}`);
    sign?.setWaxed(true);
  } catch (e) {
    console.warn(`[saga] camp sign: ${e}`);
  }
}

/**
 * Makes (or moves) a wanderer's camp near a spot: picked there, built when a player is close. Returns
 * whether it moved from somewhere else (a built camp more than 32 blocks away), so its other players get a letter.
 * @param {string} wid @param {string} prefab @param {string} dim @param {{ x: number, y?: number, z: number }} near @param {string} [pid] the player it is for
 */
export function makeCamp(wid, prefab, dim, near, pid) {
  const name = campName(wid);
  const old = placesOf()[name];
  /** @type {Record<string, number>} */
  const u = { ...(old?.u ?? {}) };
  if (pid) u[pid] = Date.now();
  if (old && old.dim === dim && across(old, near) <= 32 && old.pf === prefab) {
    setPlace(name, { ...old, u, v: Date.now() });
    return false;
  }
  if (old?.b) restore(old);
  retryAt.delete(name);
  waits.delete(name);
  setPlace(name, { dim, x: Math.floor(near.x), z: Math.floor(near.z), yh: near.y === undefined ? undefined : Math.floor(near.y), a: 1, p: 1, pf: prefab, w: wid, u, v: Date.now() });
  return !!old?.b;
}

/** A player needs this camp (on the chain): kept in its users. @param {string} wid @param {string} pid */
export function needCamp(wid, pid) {
  const name = campName(wid);
  const rec = placesOf()[name];
  if (!rec || rec.u?.[pid]) return;
  const u = { ...(rec.u ?? {}), [pid]: Date.now() };
  // At most 50 players listed: the oldest go first.
  const keys = Object.keys(u).sort((a, b) => u[a] - u[b]);
  for (const k of keys.slice(0, Math.max(0, keys.length - 50))) delete u[k];
  setPlace(name, { ...rec, u });
}

/** A player is done with this camp (finished the chain): the camp goes when nobody needs it. @param {string} wid @param {string} pid */
export function leaveCamp(wid, pid) {
  const name = campName(wid);
  const rec = placesOf()[name];
  if (!rec?.u?.[pid]) return;
  const u = { ...rec.u };
  delete u[pid];
  if (!Object.keys(u).length) removePlace(name);
  else setPlace(name, { ...rec, u });
}

/**
 * Once a minute: a camp with a player near is visited; one nobody visited for `days` real days is taken
 * down (terrain put back). @param {number} days
 */
export function campUpkeep(days) {
  const now = Date.now();
  for (const [name, rec] of Object.entries(placesOf())) {
    if (!isCamp(name)) continue;
    const near = world.getAllPlayers().some((p) => p.dimension.id === rec.dim && across(p.location, rec) <= 48);
    if (near) {
      if (now - (rec.v ?? 0) > 600000) setPlace(name, { ...rec, v: now });
    } else if (now - (rec.v ?? now) > days * 86400000) {
      removePlace(name);
      console.warn(`[saga] ${name} unvisited for ${days} days: taken down`);
    }
  }
}

/** Every 2 seconds: picked places with a player close enough get built. */
export function autoTick() {
  const all = placesOf();
  const pending = Object.entries(all).filter(([, r]) => r.p);
  if (!pending.length) return;
  const range = Number(get("buildRange")) || 64;
  const now = Date.now();
  for (const [name, rec] of pending) {
    if (building.has(name) || (retryAt.get(name) ?? 0) > now) continue;
    const near = world.getAllPlayers().find((p) => p.dimension.id === rec.dim && across(p.location, rec) <= range);
    if (near) autoBuild(name, near).catch((e) => console.warn(`[saga] auto place ${name}: ${e}`));
  }
}

// ---------------------------------------------------------------------------
// Operators: preview and the places menu
// ---------------------------------------------------------------------------

/** Particles along a box's edges, seen by one player. @param {Player} player @param {{ min: Vector3, max: Vector3 }} box */
function outline(player, box) {
  const { min, max } = box;
  const x0 = min.x;
  const x1 = max.x + 1;
  const y0 = min.y;
  const y1 = max.y + 1;
  const z0 = min.z;
  const z1 = max.z + 1;
  const len = 4 * (x1 - x0 + (y1 - y0) + (z1 - z0));
  const step = Math.max(1, Math.ceil(len / 360));
  /** @param {Vector3} a @param {Vector3} b */
  const edge = (a, b) => {
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / step));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      try {
        player.spawnParticle("minecraft:villager_happy", { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
      } catch {
        return;
      }
    }
  };
  for (const y of [y0, y1]) {
    edge({ x: x0, y, z: z0 }, { x: x1, y, z: z0 });
    edge({ x: x1, y, z: z0 }, { x: x1, y, z: z1 });
    edge({ x: x1, y, z: z1 }, { x: x0, y, z: z1 });
    edge({ x: x0, y, z: z1 }, { x: x0, y, z: z0 });
  }
  for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) edge({ x, y: y0, z }, { x, y: y1, z });
}

const FACINGS = ["as drawn", "turned right", "turned around", "turned left"];

/**
 * Shows where a place's building would go (an outline for about 30 seconds) with Build here / Rotate
 * / Look around / Cancel. Builds on Build here.
 * @param {Player} player @param {string} name @param {Vector3} [at] origin (default: where the player stands)
 */
export async function previewBuild(player, name, at) {
  const dim = player.dimension;
  const l = at ?? player.location;
  const origin = { x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) };
  let facing = 0;
  let until = system.currentTick + PREVIEW_TICKS;
  const timer = system.runInterval(() => {
    try {
      if (!player.isValid || system.currentTick > until) return system.clearRun(timer);
      if (player.dimension.id === dim.id) outline(player, boxOf(name, origin, facing));
    } catch {
      system.clearRun(timer);
    }
  }, 10);
  try {
    const info = infoOf(name);
    while (player.isValid) {
      until = system.currentTick + PREVIEW_TICKS;
      const box = boxOf(name, origin, facing);
      const w = box.max.x - box.min.x + 1;
      const d = box.max.z - box.min.z + 1;
      const h = box.max.y - box.min.y + 1;
      const form = new ActionFormData()
        .title(`Build: ${placeLabel(name)}`)
        .body(
          `The green outline shows where the ${info.label} goes: ${w} wide, ${d} deep, ${h} high, at ${coords(origin)} (${FACINGS[facing]}).\n\n` +
            "The blocks there now are saved first, so Remove in the places menu puts them back exactly.",
        )
        .button("Build here")
        .button("Rotate")
        .button("Look around (10 s)")
        .button("Cancel");
      const res = await show(player, form);
      if (!res || res.canceled || res.selection === 3 || res.selection === undefined) {
        player.sendMessage("§7[Story] Nothing was built.");
        return;
      }
      if (res.selection === 1) {
        facing = (facing + 1) % 4;
        continue;
      }
      if (res.selection === 2) {
        player.sendMessage("§7[Story] Look around: the menu comes back in 10 seconds.");
        until = system.currentTick + PREVIEW_TICKS;
        await wait(200);
        continue;
      }
      player.sendMessage(`§7[Story] Building ${named(name)}...`);
      const err = await buildAt(name, dim, origin, facing, { by: player.name });
      if (err) player.sendMessage(`§c[Story] Couldn't build ${named(name)}: ${err}.`);
      else player.sendMessage(`§a[Story] Built ${named(name)} at ${coords(origin)}. It is now the story place "${name}".`);
      return;
    }
  } finally {
    system.clearRun(timer);
  }
}

/** Which stories (and favors) use a place. @param {string} name */
export const usedBy = (name) => [
  ...STORIES.filter((s) => s.chapters.some((c) => c.objectives.some((o) => placesIn(o).includes(name)))).map((s) => s.title),
  ...(FAVORS.some((f) => f.objective && placesIn(f.objective).includes(name)) ? ["Daily favors"] : []),
];

/** What players must find at a place (blocks they tap or hit there), for the operator setting it. @param {string} name */
export function placeNeeds(name) {
  /** @type {string[]} */
  const out = [];
  if (PREFABS[name]) return out; // its building has what the stories need
  for (const s of STORIES)
    for (const c of s.chapters)
      for (const o of c.objectives) {
        if (o.place !== name || o.type !== "interact" || !o.blocks?.length) continue;
        const what = o.blocks.map(itemName).join(" or ");
        out.push(`${s.title} needs a ${what} within ${o.radius ?? 8} blocks of this spot: players strike it (${o.label}). Place one if there isn't one.`);
      }
  return [...new Set(out)];
}

/** "set (built)", "picked, not built yet", "missing". @param {SavedPlace | undefined} rec */
export function statusOf(rec) {
  if (!rec) return "§cmissing";
  if (rec.p) return "§bpicked, built when a player comes close";
  const how = rec.a ? "picked by the pack" : `set${rec.by ? ` by ${rec.by}` : ""}`;
  return `§a${how}${rec.b ? ", built" : ""}`;
}

/**
 * Sets a place where the operator stands; an earlier build of it is removed first.
 * @param {Player} player @param {string} name
 */
export function setHere(player, name) {
  const old = placesOf()[name];
  if (old?.b) {
    restore(old);
    player.sendMessage(`§7[Story] The old ${placeLabel(name)} building was removed and its terrain put back.`);
  }
  const l = player.location;
  const rec = { dim: player.dimension.id, x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z), by: player.name };
  setPlace(name, rec);
  retryAt.delete(name);
  player.sendMessage(`§a[Story] Place "${name}" (${placeLabel(name)}) set to ${rec.x} ${rec.y} ${rec.z} in the ${dimName(rec.dim)}.`);
  for (const need of placeNeeds(name)) player.sendMessage(`§e[Story] ${need}`);
}

/** @param {Player} player @param {string} question */
async function confirm(player, question) {
  const res = await show(player, new ActionFormData().title("Are you sure?").body(question).button("Yes").button("No"));
  return !!res && !res.canceled && res.selection === 0;
}

/** One place's page in the operators' menu. @param {Player} player @param {string} name */
async function placePage(player, name) {
  while (player.isValid) {
    const rec = placesOf()[name];
    const info = infoOf(name);
    const users = isCamp(name) ? [`${Object.keys(rec?.u ?? {}).length} player(s) on this wanderer's chain`] : usedBy(name);
    const lines = [
      `§e${placeLabel(name)}§r (${name})`,
      `Status: ${statusOf(rec)}§r`,
      rec ? `Where: ${coords(rec)} in the ${dimName(rec.dim)}${rec.b ? `, ${FACINGS[rec.f ?? 0]}` : ""}` : "Where: nowhere yet",
      `Used by: ${users.length ? users.join(", ") : "no story"}`,
      PREFABS[name] ? `Building: ${info.size.x} x ${info.size.y} x ${info.size.z}; picked spots: ${info.site}, ${num(Math.round(farDist(info.minDist)))}-${num(Math.round(farDist(info.maxDist)))} blocks from world spawn` : "No building: set the spot by hand.",
    ];
    /** @type {[string, () => Promise<unknown> | unknown][]} */
    const actions = [];
    if (rec)
      actions.push([
        "Teleport",
        () => {
          const dim = world.getDimension(rec.dim);
          if (rec.y === undefined) {
            player.addEffect("slow_falling", 600, { showParticles: false });
            player.teleport({ x: rec.x + 0.5, y: 200, z: rec.z + 0.5 }, { dimension: dim });
          } else player.teleport({ x: rec.x + 0.5, y: rec.y + 0.1, z: rec.z + 0.5 }, { dimension: dim });
        },
      ]);
    if (!isCamp(name)) actions.push(["Set here (no building)", () => setHere(player, name)]);
    if (PREFABS[name]) actions.push(["Build here (preview)", () => previewBuild(player, name)]);
    if (rec && !rec.b && !rec.p && PREFABS[name] && rec.y !== undefined)
      actions.push(["Build at the saved spot (preview)", () => (player.dimension.id === rec.dim ? previewBuild(player, name, { x: rec.x, y: rec.y ?? 0, z: rec.z }) : player.sendMessage("§c[Story] Go to that dimension first."))]);
    if (rec?.b)
      actions.push([
        "Rebuild (repair)",
        async () => {
          const err = await rebuild(name);
          player.sendMessage(err ? `§c[Story] Couldn't rebuild: ${err}.` : `§a[Story] Rebuilt ${named(name)}.`);
        },
      ]);
    if (rec)
      actions.push([
        "Remove",
        async () => {
          if (!(await confirm(player, `Remove ${named(name)}?${rec.b ? " Its building is taken down and the terrain put back as it was." : ""} Stories that need it will pick a new spot${get("autoPlaces") === true ? "" : " once an operator sets one"}.`))) return;
          removePlace(name);
          player.sendMessage(`§a[Story] Removed ${named(name)}.`);
        },
      ]);
    if (rec && !isCamp(name))
      actions.push([
        "Relocate",
        async () => {
          if (!(await confirm(player, `Move ${named(name)} somewhere else? It is removed here${rec.b ? " (terrain put back)" : ""} and a new spot is picked nearby, built when a player comes close.`))) return;
          const spot = relocate(name);
          player.sendMessage(`§a[Story] ${named(name, true)} moves to about ${spot.x} ${spot.z}; it is built when a player comes within ${get("buildRange")} blocks.`);
        },
      ]);
    const form = new ActionFormData().title("Story place").body(lines.join("\n"));
    for (const [label] of actions) form.button(label);
    form.button("Back");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined) return false;
    const act = actions[res.selection];
    if (!act) return true; // Back
    await act[1]();
    if (act[0] === "Teleport" || act[0].startsWith("Build")) return false;
  }
  return false;
}

/** The operators' places menu: every place with its status. @param {Player} player */
export async function placesMenu(player) {
  while (player.isValid) {
    const saved = placesOf();
    const names = [...new Set([...Object.keys(PLACES), ...Object.keys(PREFABS), ...Object.keys(saved)])].filter((n) => !CAMPS[n]);
    const form = new ActionFormData()
      .title("Story places")
      .body(
        "Every place the stories use. Set one where you stand, or build its building with a preview. " +
          (get("autoPlaces") === true ? "Places nobody set are picked and built by the pack when a chapter needs them." : "Picking places is disabled: set each one by hand."),
      );
    for (const n of names) form.button(`${placeLabel(n)}\n${statusOf(saved[n])}`);
    form.button("Close");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || res.selection >= names.length) return;
    if (!(await placePage(player, names[res.selection]))) return;
  }
}

/** Chat list of the places (for /realm:saga_place without a name). @param {Player} player */
export function listPlaces(player) {
  const saved = placesOf();
  const names = [...new Set([...Object.keys(PLACES), ...Object.keys(saved)])];
  const lines = names.map((n) => {
    const p = saved[n];
    const where = p ? `${coords(p)} in the ${dimName(p.dim)} - ${statusOf(p)}` : statusOf(p);
    const users = usedBy(n);
    return `§e${n}§r (${placeLabel(n)}): ${where}§r${users.length ? ` §7- ${users.join(", ")}` : ""}`;
  });
  player.sendMessage(`§6Story places:§r\n${lines.join("\n")}\n§7Set one where you stand: /realm:saga_place <name>. Build and manage them: /realm:saga_places`);
}
