import "./diag.js";
import {
  Block,
  BlockTypes,
  BlockVolume,
  CommandPermissionLevel,
  Container,
  CustomCommandParamType,
  CustomCommandStatus,
  Dimension,
  EquipmentSlot,
  MolangVariableMap,
  Player,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

const PROP_SHARD = "find:idx:"; // world: find:idx:0, find:idx:1, … JSON shards of the index
const SHARD_CHARS = 30000; // Bedrock caps a string property at ~32k characters
const SAVE_EVERY_TICKS = 600; // write the index at most once every 30 s
const RECHECK_TICKS = 200; // read an opened container again 10 s later
const LATE_RECHECK_TICKS = 1200; // and once more after a minute, for long sorting sessions
const SIDES = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

/** Listed types that exist in this game version (an unknown id would make getBlocks throw). */
let types = /** @type {Set<string> | undefined} */ (undefined);
const containerTypes = () => (types ??= new Set(CONFIG.containerTypes.filter((t) => BlockTypes.get(t))));

// ---------------------------------------------------------------------------
// The index: "<dim>:<x>,<y>,<z>" → what the container held and when
// ---------------------------------------------------------------------------

/**
 * `t`: [item id without "minecraft:", count] pairs; `at`: epoch ms of the last look; `b`: block id, short.
 * @typedef {{ t: [string, number][], at: number, b: string }} Entry
 */

/** @type {Map<string, Entry> | undefined} */
let index;
let dirty = false;

/** An entry as saved, checked so one damaged entry can't break every search. @param {any} v @returns {v is Entry} */
const valid = (v) =>
  !!v && Array.isArray(v.t) && typeof v.at === "number" && typeof v.b === "string" &&
  v.t.every((/** @type {any} */ p) => Array.isArray(p) && typeof p[0] === "string" && typeof p[1] === "number");

/** The shards as last written, so a save only rewrites the ones that changed. @type {string[]} */
let written = [];

/** @returns {Map<string, Entry>} */
function getIndex() {
  if (index) return index;
  index = new Map();
  for (let i = 0; ; i++) {
    const raw = world.getDynamicProperty(PROP_SHARD + i);
    if (typeof raw !== "string") break;
    written.push(raw);
    try {
      for (const [k, v] of Object.entries(JSON.parse(raw))) if (valid(v)) index.set(k, v);
    } catch (e) {
      console.warn(`[find] shard ${i} unreadable: ${e}`);
    }
  }
  return index;
}

/**
 * Each entry as written ("<key>":{...}). Entries are replaced, never changed, when a container is read again,
 * so a save only serializes the ones that are new since the last one.
 * @type {WeakMap<Entry, string>}
 */
const saved = new WeakMap();

function save() {
  const idx = getIndex();
  // Forget the containers seen longest ago when over the limit.
  if (idx.size > CONFIG.maxContainers) {
    const oldest = [...idx].sort((a, b) => a[1].at - b[1].at).slice(0, idx.size - CONFIG.maxContainers);
    for (const [k] of oldest) idx.delete(k);
  }
  /** @type {string[]} */
  const shards = [];
  let cur = [];
  let len = 2;
  for (const [k, v] of idx) {
    let s = saved.get(v);
    if (s === undefined) saved.set(v, (s = `${JSON.stringify(k)}:${JSON.stringify(v)}`));
    if (cur.length && len + s.length + 1 > SHARD_CHARS) {
      shards.push(`{${cur.join(",")}}`);
      cur = [];
      len = 2;
    }
    cur.push(s);
    len += s.length + 1;
  }
  if (cur.length) shards.push(`{${cur.join(",")}}`);
  shards.forEach((s, i) => {
    if (written[i] !== s) world.setDynamicProperty(PROP_SHARD + i, s);
  });
  for (let i = shards.length; world.getDynamicProperty(PROP_SHARD + i) !== undefined; i++) {
    world.setDynamicProperty(PROP_SHARD + i, undefined);
  }
  written = shards;
  dirty = false;
}

function saveIfDirty() {
  if (!dirty) return;
  try {
    save();
  } catch (e) {
    console.warn(`[find] save failed: ${e}`);
  }
}
system.runInterval(saveIfDirty, SAVE_EVERY_TICKS);
// A realm shuts down once the last player has left: save on every leave so the last 30 s aren't lost.
world.afterEvents.playerLeave.subscribe(saveIfDirty);

const short = (/** @type {string} */ id) => id.replace(/^minecraft:/, "");
/** @param {Dimension} dim @param {import("@minecraft/server").Vector3} p */
const keyOf = (dim, p) => `${short(dim.id)}:${p.x},${p.y},${p.z}`;

/** @param {Block} block */
const containerOf = (block) => block.getComponent("minecraft:inventory")?.container;

/** @param {Container} c */
function signature(c) {
  const parts = [];
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    parts.push(it ? `${it.typeId}:${it.amount}` : "");
  }
  return parts.join(",");
}

/** Copper chests of any stage, waxed or not, are one kind. @param {string} typeId */
const family = (typeId) => (typeId.endsWith("copper_chest") ? "copper_chest" : typeId);

/** A chest's facing, from whichever state this game version uses. @param {Block} b */
function facingOf(b) {
  const s = b.permutation.getAllStates();
  return s["minecraft:cardinal_direction"] ?? s["facing_direction"];
}

/**
 * The other half of a double chest whose halves both report the whole 54 slots. The halves share
 * a type, a facing and (being one container) the same contents, and sit side by side across the
 * facing. In a row of identical double chests the pairs start at the row's end, so the number of
 * identical chests behind a half says which side its partner is on.
 * @param {Block} block
 * @param {(b: Block) => string | undefined} sigOf contents signature of a 54-slot container, else undefined
 * @returns {Block | undefined}
 */
function partnerOf(block, sigOf) {
  const sig = sigOf(block);
  if (sig === undefined) return undefined;
  const facing = facingOf(block);
  // north/south (or facing_direction 2/3) pair along x, east/west (4/5) along z
  const alongX = facing === "north" || facing === "south" || facing === 2 || facing === 3;
  const alongZ = facing === "east" || facing === "west" || facing === 4 || facing === 5;
  const dirs = SIDES.filter((d) => (alongX ? d.x !== 0 : alongZ ? d.z !== 0 : true));
  /** @param {Block | undefined} b */
  const twin = (b) => !!b && family(b.typeId) === family(block.typeId) && facingOf(b) === facing && sigOf(b) === sig;
  const found = dirs.filter((d) => twin(block.offset(d)));
  if (found.length < 2) return found.length ? block.offset(found[0]) : undefined;
  const d = found.find((f) => found.some((g) => g.x === -f.x && g.z === -f.z));
  if (!d) return block.offset(found[0]);
  const back = { x: -d.x, y: 0, z: -d.z };
  let behind = 0;
  for (let b = block.offset(back); behind < 64 && twin(b); b = b?.offset(back)) behind++;
  return block.offset(behind % 2 === 0 ? d : back);
}

/** Caches contents signatures for one pass: "typeId:amount,…" per slot, 54-slot containers only. */
function signatures() {
  /** @type {Map<string, string | undefined>} */
  const cache = new Map();
  /** @param {Block} b */
  return (b) => {
    const key = `${b.x},${b.y},${b.z}`;
    if (!cache.has(key)) {
      const c = containerOf(b);
      cache.set(key, c && c.size > 27 ? signature(c) : undefined);
    }
    return cache.get(key);
  };
}

/**
 * The block a container is remembered under. When both halves of a double chest report the whole
 * 54 slots, both map to the half with the smaller coordinates, so it is listed once.
 * @param {Block} block @param {Container} container @param {(b: Block) => string | undefined} sigOf
 * @returns {{ main: Block, other?: Block }}
 */
function canonical(block, container, sigOf) {
  if (container.size <= 27) return { main: block };
  const nb = partnerOf(block, sigOf);
  if (!nb) return { main: block };
  const nbFirst = nb.x < block.x || (nb.x === block.x && nb.z < block.z);
  return nbFirst ? { main: nb, other: block } : { main: block, other: nb };
}

/**
 * Reads a container into the index (or drops it if it's gone or empty).
 * @param {Block} block @param {(b: Block) => string | undefined} [sigOf] shared by a whole scan, so a room of chests is read once
 */
function record(block, sigOf = signatures()) {
  const idx = getIndex();
  const container = containerTypes().has(block.typeId) ? containerOf(block) : undefined;
  if (!container) {
    if (idx.delete(keyOf(block.dimension, block.location))) dirty = true;
    return;
  }
  const { main, other } = canonical(block, container, sigOf);
  if (other) idx.delete(keyOf(other.dimension, other.location));
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (let i = 0; i < container.size; i++) {
    const it = container.getItem(i);
    if (it) counts.set(short(it.typeId), (counts.get(short(it.typeId)) ?? 0) + it.amount);
  }
  const key = keyOf(main.dimension, main.location);
  if (counts.size) idx.set(key, { t: [...counts], at: Date.now(), b: short(main.typeId) });
  else idx.delete(key);
  dirty = true;
}

/** @param {Dimension} dimension @param {import("@minecraft/server").Vector3} p @param {(b: Block) => string | undefined} [sigOf] */
function recordAt(dimension, p, sigOf) {
  try {
    const b = dimension.getBlock(p);
    if (b) record(b, sigOf);
  } catch {
    // chunk unloaded since: keep what we knew
  }
}

world.afterEvents.playerInteractWithBlock.subscribe(({ block }) => {
  if (!containerTypes().has(block.typeId)) return;
  const { dimension } = block;
  const p = block.location;
  recordAt(dimension, p);
  system.runTimeout(() => recordAt(dimension, p), RECHECK_TICKS); // after the player put things in or took them out
  system.runTimeout(() => recordAt(dimension, p), LATE_RECHECK_TICKS);
});

world.afterEvents.playerBreakBlock.subscribe(({ block, brokenBlockPermutation }) => {
  if (!containerTypes().has(brokenBlockPermutation.type.id)) return;
  const { dimension } = block;
  const p = block.location;
  if (getIndex().delete(keyOf(dimension, p))) dirty = true;
  // The other half of a double chest is now a single chest, possibly remembered under this key.
  // Read it a moment later, once it reports its own 27 slots.
  system.runTimeout(() => {
    for (const d of SIDES) recordAt(dimension, { x: p.x + d.x, y: p.y, z: p.z + d.z });
  }, 2);
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** "iron_ingot" → "Iron Ingot" @param {string} id */
const title = (id) =>
  short(id)
    .replace(/^undyed_/, "")
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

/** @param {number} ms */
function ago(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
/** @param {number} dx @param {number} dz east is +x, south is +z */
const direction = (dx, dz) => COMPASS[(Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) + 8) % 8];

/**
 * @typedef {{ key: string, dim: string, x: number, y: number, z: number, entry: Entry, items: [string, number][], dist: number }} Hit
 */

/** @param {Player} player */
function* liveScan(player) {
  const { dimension } = player;
  const r = get("liveScanRadius");
  const p = { x: Math.floor(player.location.x), y: Math.floor(player.location.y), z: Math.floor(player.location.z) };
  const minY = Math.max(dimension.heightRange.min, p.y - r);
  const maxY = Math.min(dimension.heightRange.max - 1, p.y + r);
  if (minY > maxY || !containerTypes().size) return;
  const found = dimension.getBlocks(
    new BlockVolume({ x: p.x - r, y: minY, z: p.z - r }, { x: p.x + r, y: maxY, z: p.z + r }),
    { includeTypes: [...containerTypes()] },
    true
  );
  let n = 0;
  const sigOf = signatures();
  for (const loc of found.getBlockLocationIterator()) {
    recordAt(dimension, loc, sigOf);
    if (++n % 4 === 0) yield;
  }
}

/** @param {string} query */
function normalize(query) {
  return short(query.trim().toLowerCase().replace(/\s+/g, "_"));
}

/**
 * @param {Player} player @param {string} q normalized query
 * @returns {Hit[]} exact item id matches if there are any, otherwise every id containing q; nearest first
 */
function matches(player, q) {
  const here = short(player.dimension.id);
  const { x: px, y: py, z: pz } = player.location;
  /** @type {Hit[]} */
  const exact = [];
  /** @type {Hit[]} */
  const partial = [];
  for (const [key, entry] of getIndex()) {
    const items = entry.t.filter(([id]) => id === q);
    const loose = items.length ? items : entry.t.filter(([id]) => id.includes(q));
    if (!loose.length) continue;
    const [dim, pos] = key.split(":");
    const [x, y, z] = pos.split(",").map(Number);
    const dist = dim === here ? Math.hypot(x + 0.5 - px, y + 0.5 - py, z + 0.5 - pz) : Infinity;
    (items.length ? exact : partial).push({ key, dim, x, y, z, entry, items: loose, dist });
  }
  const hits = exact.length ? exact : partial;
  return hits.sort((a, b) => a.dist - b.dist || a.dim.localeCompare(b.dim) || b.entry.at - a.entry.at);
}

/** Drops hits whose container is loaded and no longer there. @param {Hit[]} hits */
function stillThere(hits) {
  const idx = getIndex();
  return hits.filter((h) => {
    let block;
    try {
      block = world.getDimension(`minecraft:${h.dim}`).getBlock({ x: h.x, y: h.y, z: h.z });
    } catch {
      return true; // not loaded: trust the index
    }
    if (!block || containerTypes().has(block.typeId)) return true;
    idx.delete(h.key);
    dirty = true;
    return false;
  });
}

/** @param {Hit} h @param {Player} player */
function rowText(h, player) {
  const items = h.items
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([id, n]) => `${n} ${title(id)}`)
    .join(", ");
  const more = h.items.length > 2 ? ` +${h.items.length - 2} more` : "";
  const where =
    h.dist === Infinity
      ? title(h.dim)
      : `${Math.round(h.dist)} blocks ${direction(h.x + 0.5 - player.location.x, h.z + 0.5 - player.location.z)}`;
  return `${title(h.entry.b)} - ${items}${more}\n§8${where} - seen ${ago(Date.now() - h.entry.at)}`;
}

/**
 * Runs a generator as a job (a few steps per tick) and resolves with what it returns.
 * @template T @param {Generator<void, T, void>} gen @returns {Promise<T>}
 */
function job(gen) {
  return new Promise((resolve, reject) => {
    system.runJob(
      (function* () {
        try {
          resolve(yield* gen);
        } catch (e) {
          reject(e);
        }
      })()
    );
  });
}

/** @param {Player} player @param {string} query */
async function search(player, query) {
  const q = normalize(query);
  await job(liveScan(player));
  if (!player.isValid) return;
  const maxResults = get("maxResults");
  const found = stillThere(matches(player, q).slice(0, maxResults * 2));
  // Containers this player can't open (someone else's lock or claim) aren't shown to them.
  const closed = await closedSpots(player.id, found.map((h) => [`minecraft:${h.dim}`, h.x, h.y, h.z]));
  if (!player.isValid) return;
  const hits = found.filter((_, i) => !closed.has(i)).slice(0, maxResults);
  if (!hits.length) {
    player.sendMessage(
      closed.size
        ? `§7Only containers you can't open (locked, or in someone else's claim) have "${q}".`
        : `§7No remembered container has "${q}". Containers are remembered once someone opens them, or when you search within ${get("liveScanRadius")} blocks.`
    );
    return;
  }
  const form = new ActionFormData()
    .title(`Find: ${q}`)
    .body(`${hits.length === maxResults ? `The nearest ${hits.length}` : hits.length} container${hits.length === 1 ? "" : "s"}, nearest first. Tap one to mark it.`);
  for (const h of hits) form.button(rowText(h, player));
  await pick(player, form, hits);
}

/** @param {Player} player @param {ActionFormData} form @param {Hit[]} hits */
async function pick(player, form, hits) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return;
    const res = await form.show(player);
    if (res.canceled && res.cancelationReason === FormCancelationReason.UserBusy) {
      await new Promise((r) => system.runTimeout(() => r(undefined), 20));
      continue;
    }
    if (res.canceled || res.selection === undefined) return;
    highlight(player, hits[res.selection]);
    return;
  }
}

/** Bright yellow vanilla flame. Stands out on orange chests, oak signs and blue glass; no new asset. */
export const MARK_COLOR = { red: 1, green: 0.95, blue: 0.2 };
export const MARK_BEAM = "minecraft:colored_flame_particle";
export const MARK_PULSE = "minecraft:basic_flame_particle";
export const MARKER_CAP = 24;
/** Above the story tracker (20), below build mode (30): a short search guide, not a flight or build line. */
export const MARK_STEADY = 25;
/** At least 3 redraws (every 10 ticks) so other steady lines keep waiting while the arrow shows. */
export const MARK_HOLD = 30;
const MARK_FROM = "find_bp";

/**
 * @typedef {{ generation: number, run?: number }} Mark
 * @typedef {{ next: number, byId: Map<string, Mark> }} Marks
 */

/** @returns {Marks} */
export function createMarks() {
  return { next: 1, byId: new Map() };
}

/** @param {Marks} marks @param {string} id */
export function beginMark(marks, id) {
  const generation = marks.next++;
  const previous = marks.byId.get(id);
  marks.byId.set(id, { generation });
  return { generation, previousRun: previous?.run };
}

/** @param {Marks} marks @param {string} id @param {number} generation @param {number} run */
export function claimRun(marks, id, generation, run) {
  const mark = marks.byId.get(id);
  if (!mark || mark.generation !== generation) return false;
  mark.run = run;
  return true;
}

/** @param {Marks} marks @param {string} id @param {number} generation */
export function endMark(marks, id, generation) {
  const mark = marks.byId.get(id);
  if (!mark || mark.generation !== generation) return { ended: false, run: undefined };
  marks.byId.delete(id);
  return { ended: true, run: mark.run };
}

/** @param {Marks} marks @param {string} id */
export function endPlayer(marks, id) {
  const mark = marks.byId.get(id);
  if (!mark) return { ended: false, run: undefined };
  marks.byId.delete(id);
  return { ended: true, run: mark.run, generation: mark.generation };
}

/**
 * @param {{ valid: boolean, dead: boolean, sameDimension: boolean, tick: number, until: number, generation: number, current: number | undefined }} state
 */
export function markShouldDraw(state) {
  return state.valid === true && state.dead !== true && state.sameDimension === true && state.tick <= state.until && state.generation === state.current;
}

/**
 * Downward arrow above a sign on the chest face. Phase 1 adds a wider pulse. At most MARKER_CAP points.
 * @param {number} phase @returns {{ x: number, y: number, z: number, particle: string }[]}
 */
export function markerDraw(phase) {
  /** @type {{ x: number, y: number, z: number, particle: string }[]} */
  const pts = [];
  const beam = phase % 2 === 1 ? MARK_PULSE : MARK_BEAM;
  for (let i = 0; i < 7; i++) pts.push({ x: 0.5, y: 2.6 + i * 0.45, z: 0.5, particle: beam });
  const tipY = 1.85;
  pts.push({ x: 0.5, y: tipY, z: 0.5, particle: MARK_PULSE });
  for (const s of [0.35, 0.62]) {
    const y = tipY + s * 0.85;
    const particle = phase % 2 === 0 ? MARK_BEAM : MARK_PULSE;
    pts.push(
      { x: 0.5 - s, y, z: 0.5, particle },
      { x: 0.5 + s, y, z: 0.5, particle },
      { x: 0.5, y, z: 0.5 - s, particle },
      { x: 0.5, y, z: 0.5 + s, particle }
    );
  }
  if (phase % 2 === 1) {
    const top = 2.6 + 6 * 0.45;
    pts.push(
      { x: 0.15, y: top, z: 0.5, particle: MARK_PULSE },
      { x: 0.85, y: top, z: 0.5, particle: MARK_PULSE },
      { x: 0.5, y: top, z: 0.15, particle: MARK_PULSE },
      { x: 0.5, y: top, z: 0.85, particle: MARK_PULSE }
    );
  }
  return pts.slice(0, MARKER_CAP);
}

/** @param {number} dx @param {number} dy @param {number} dz */
export function markerGuide(dx, dy, dz) {
  const dist = Math.max(0, Math.round(Math.hypot(dx, dy, dz)));
  const dir = direction(dx, dz);
  const up = Math.round(dy);
  const vertical = up >= 2 ? `, ${up} above` : up <= -2 ? `, ${-up} below` : "";
  return { dist, dir, vertical, text: `${dist} blocks ${dir}${vertical}` };
}

/** Searcher-only guide. Block name and direction, never the items or raw coordinates. @param {string} blockTitle @param {number} dx @param {number} dy @param {number} dz */
export function markerText(blockTitle, dx, dy, dz) {
  const name = String(blockTitle).replace(/[^\x20-\x7e]/g, "").slice(0, 48);
  return `§e${name}§r ${markerGuide(dx, dy, dz).text}`;
}

/** @param {string} playerId @param {number} [ticks] */
export function barPayload(playerId, ticks = MARK_HOLD) {
  return { player: playerId, ticks, from: MARK_FROM, steady: MARK_STEADY };
}

/** True when this redraw must leave the bar alone. Notes and higher ranks hold; our own request does not. @param {any} msg */
export function foreignBarHolds(msg, ourFrom = MARK_FROM, ourSteady = MARK_STEADY) {
  if (!msg || typeof msg.player !== "string") return false;
  if (msg.from === ourFrom || msg.background) return false;
  if (Number.isFinite(msg.steady) && (msg.steady < ourSteady || (msg.steady === ourSteady && String(msg.from) > ourFrom))) return false;
  return true;
}

const marks = createMarks();
/** @type {Map<string, number>} */
const heldAt = new Map();
/** @type {Map<string, number>} */
const barHeld = new Map();
/** @type {MolangVariableMap | undefined} */
let beamColor;

function beamVars() {
  if (!beamColor) {
    beamColor = new MolangVariableMap();
    beamColor.setColorRGB("variable.color", MARK_COLOR);
  }
  return beamColor;
}

/** @param {string} id */
function releasePlayer(id) {
  const ended = endPlayer(marks, id);
  if (ended.run !== undefined) {
    try {
      system.clearRun(ended.run);
    } catch {
      // already cleared
    }
  }
  heldAt.delete(id);
  barHeld.delete(id);
}

world.afterEvents.playerLeave.subscribe(({ playerId }) => releasePlayer(playerId));
world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (deadEntity instanceof Player) releasePlayer(deadEntity.id);
});
world.afterEvents.playerDimensionChange.subscribe(({ player }) => {
  if (player instanceof Player) releasePlayer(player.id);
});

/** @param {string} id @param {number} generation */
function stopOwnedMark(id, generation) {
  const ended = endMark(marks, id, generation);
  if (!ended.ended || ended.run === undefined) return;
  try {
    system.clearRun(ended.run);
  } catch {
    // already cleared
  }
}

/** @param {Player} player */
function requestBar(player) {
  system.sendScriptEvent("realm:actionbar", JSON.stringify(barPayload(player.id)));
}

/** @param {string} message */
function noteForeignBar(message) {
  const msg = JSON.parse(message);
  if (!foreignBarHolds(msg)) return;
  const until = system.currentTick + Math.min(200, Math.max(0, Number(msg.ticks) || 0));
  if (until > (barHeld.get(msg.player) ?? 0)) barHeld.set(msg.player, until);
}

/**
 * One redraw of the searcher's arrow and direction line. An old generation cannot clear a newer mark,
 * and ending the mark never writes an empty action bar (that would erase another pack's note).
 * @param {Player} player @param {Hit} h @param {string} id @param {number} generation @param {number} until
 */
function drawMark(player, h, id, generation, until) {
  const current = marks.byId.get(id)?.generation;
  let same = false;
  let dead = !player.isValid;
  if (player.isValid) {
    try {
      same = short(player.dimension.id) === h.dim;
      const health = player.getComponent("minecraft:health");
      if (health && health.currentValue <= 0) dead = true;
    } catch {
      dead = true;
      same = false;
    }
  }
  if (!markShouldDraw({ valid: player.isValid, dead, sameDimension: same, tick: system.currentTick, until, generation, current })) {
    stopOwnedMark(id, generation);
    return;
  }
  try {
    const phase = Math.floor(system.currentTick / 10) % 2;
    for (const p of markerDraw(phase)) {
      const at = { x: h.x + p.x, y: h.y + p.y, z: h.z + p.z };
      player.spawnParticle(p.particle, at, p.particle === MARK_BEAM ? beamVars() : undefined);
    }
  } catch {
    // spot not loaded for this player
  }
  const now = system.currentTick;
  if (now - (heldAt.get(id) ?? -Infinity) >= MARK_HOLD / 3) {
    heldAt.set(id, now);
    requestBar(player);
  }
  if ((barHeld.get(id) ?? 0) > now) return;
  const dx = h.x + 0.5 - player.location.x;
  const dy = h.y + 0.5 - player.location.y;
  const dz = h.z + 0.5 - player.location.z;
  player.onScreenDisplay.setActionBar(markerText(title(h.entry.b), dx, dy, dz));
}

/**
 * A bright arrow over the container and a direction line, every 10 ticks, that only this player sees.
 * A new mark replaces the player's previous one. Another dimension gets coordinates in chat only.
 * @param {Player} player @param {Hit} h
 */
function highlight(player, h) {
  const at = `${h.x}, ${h.y}, ${h.z}`;
  if (short(player.dimension.id) !== h.dim) {
    player.sendMessage(`§e${title(h.entry.b)}§r at ${at} in ${title(h.dim)}.`);
    return;
  }
  const seconds = get("highlightSeconds");
  player.sendMessage(`§e${title(h.entry.b)}§r at ${at}, marked for ${seconds} s.`);
  const until = system.currentTick + seconds * 20;
  const id = player.id;
  const started = beginMark(marks, id);
  if (started.previousRun !== undefined) {
    try {
      system.clearRun(started.previousRun);
    } catch {
      // already cleared
    }
  }
  const run = system.runInterval(() => drawMark(player, h, id, started.generation, until), 10);
  if (!claimRun(marks, id, started.generation, run)) {
    try {
      system.clearRun(run);
    } catch {
      // replaced before the run was stored
    }
  }
}

// ---------------------------------------------------------------------------
// /realm:find
// ---------------------------------------------------------------------------

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:find",
      description: "Find which container holds an item (or the item you're holding)",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
      optionalParameters: [{ name: "item", type: CustomCommandParamType.String }],
    },
    (origin, /** @type {string | undefined} */ item) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      }
      const query = item?.trim() || player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand)?.typeId;
      if (!query) {
        return { status: CustomCommandStatus.Failure, message: "Hold the item, or name it: /realm:find iron" };
      }
      system.run(() => search(player, query).catch((e) => console.warn(`[find] ${e}`)));
      return { status: CustomCommandStatus.Success };
    }
  );
});

// ---------------------------------------------------------------------------
// Access checks: which containers a player may not open, asked across packs
// ---------------------------------------------------------------------------
//   realm:access_check        { id, player, spots: [[dim, x, y, z], ...] }  (at most 40 spots per message)
//   realm:access_check_result { id, from, closed: [i, ...] }                 (indexes into that message's spots)
// Answered by every pack that keeps players out of blocks: Quick Stack & Sort (someone else's locked container) and
// Land Claims (someone else's claim). This pack only asks.

const ACCESS_CHUNK = 40;
/** Packs that have answered an access check: an ask waits for each of them. @type {Set<string>} */
const accessResponders = new Set();
/** @type {Map<string, { got: Set<string>, offset: number, closed: Set<number>, check: () => void }>} */
const accessAsks = new Map();
let accessNext = 1;

/**
 * The indexes of these spots the player may not open, as the packs that answer access checks say. Waits until
 * every pack that has answered before answers (2 s at most), or 5 ticks when none has yet.
 * @param {string} playerId @param {[string, number, number, number][]} spots
 * @returns {Promise<Set<number>>}
 */
function closedSpots(playerId, spots) {
  return new Promise((resolve) => {
    /** @type {Set<number>} */
    const closed = new Set();
    if (!spots.length) return resolve(closed);
    const waitFor = [...accessResponders];
    /** @type {string[]} */
    const ids = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      for (const id of ids) accessAsks.delete(id);
      resolve(closed);
    };
    const check = () => {
      if (waitFor.length && ids.every((id) => waitFor.every((r) => accessAsks.get(id)?.got.has(r)))) finish();
    };
    for (let offset = 0; offset < spots.length; offset += ACCESS_CHUNK) {
      const id = `find${accessNext++}`;
      ids.push(id);
      accessAsks.set(id, { got: new Set(), offset, closed, check });
      system.sendScriptEvent("realm:access_check", JSON.stringify({ id, player: playerId, spots: spots.slice(offset, offset + ACCESS_CHUNK) }));
    }
    system.runTimeout(finish, waitFor.length ? 40 : 5);
  });
}

/** @param {string} message a realm:access_check_result */
function accessResult(message) {
  const m = JSON.parse(message);
  if (!m || typeof m.from !== "string") return;
  const from = m.from.slice(0, 32);
  accessResponders.add(from);
  const ask = accessAsks.get(String(m.id));
  if (!ask) return;
  ask.got.add(from);
  if (Array.isArray(m.closed)) for (const i of m.closed) if (Number.isInteger(i) && i >= 0 && i < ACCESS_CHUNK) ask.closed.add(ask.offset + i);
  ask.check();
}

// Learn early who answers access checks, so the first search doesn't wait.
world.afterEvents.worldLoad.subscribe(() =>
  system.runTimeout(() => system.sendScriptEvent("realm:access_check", JSON.stringify({ id: "hello", player: "", spots: [] })), 60)
);

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "find_bp");
    else if (id === "realm:access_check_result") {
      try {
        accessResult(message);
      } catch (e) {
        console.warn(`[find] ${e}`);
      }
    } else if (id === "realm:actionbar") {
      try {
        noteForeignBar(message);
      } catch {
        // not ours
      }
    }
  },
  { namespaces: ["realm"] }
);
