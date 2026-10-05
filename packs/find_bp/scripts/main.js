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
  Player,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";

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

/** @returns {Map<string, Entry>} */
function getIndex() {
  if (index) return index;
  index = new Map();
  for (let i = 0; ; i++) {
    const raw = world.getDynamicProperty(PROP_SHARD + i);
    if (typeof raw !== "string") break;
    try {
      for (const [k, v] of Object.entries(JSON.parse(raw))) index.set(k, v);
    } catch (e) {
      console.warn(`[find] shard ${i} unreadable: ${e}`);
    }
  }
  return index;
}

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
    const s = `${JSON.stringify(k)}:${JSON.stringify(v)}`;
    if (cur.length && len + s.length + 1 > SHARD_CHARS) {
      shards.push(`{${cur.join(",")}}`);
      cur = [];
      len = 2;
    }
    cur.push(s);
    len += s.length + 1;
  }
  if (cur.length) shards.push(`{${cur.join(",")}}`);
  shards.forEach((s, i) => world.setDynamicProperty(PROP_SHARD + i, s));
  for (let i = shards.length; world.getDynamicProperty(PROP_SHARD + i) !== undefined; i++) {
    world.setDynamicProperty(PROP_SHARD + i, undefined);
  }
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
 * @param {Block} block @param {Container} container
 * @returns {{ main: Block, other?: Block }}
 */
function canonical(block, container) {
  if (container.size <= 27) return { main: block };
  const nb = partnerOf(block, signatures());
  if (!nb) return { main: block };
  const nbFirst = nb.x < block.x || (nb.x === block.x && nb.z < block.z);
  return nbFirst ? { main: nb, other: block } : { main: block, other: nb };
}

/** Reads a container into the index (or drops it if it's gone or empty). @param {Block} block */
function record(block) {
  const idx = getIndex();
  const container = containerTypes().has(block.typeId) ? containerOf(block) : undefined;
  if (!container) {
    if (idx.delete(keyOf(block.dimension, block.location))) dirty = true;
    return;
  }
  const { main, other } = canonical(block, container);
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

/** @param {Dimension} dimension @param {import("@minecraft/server").Vector3} p */
function recordAt(dimension, p) {
  try {
    const b = dimension.getBlock(p);
    if (b) record(b);
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
  const r = CONFIG.liveScanRadius;
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
  for (const loc of found.getBlockLocationIterator()) {
    recordAt(dimension, loc);
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
  return `${title(h.entry.b)} · ${items}${more}\n§8${where} · seen ${ago(Date.now() - h.entry.at)}`;
}

/** @param {Player} player @param {string} query */
function* search(player, query) {
  const q = normalize(query);
  yield* liveScan(player);
  if (!player.isValid) return;
  const hits = stillThere(matches(player, q).slice(0, CONFIG.maxResults * 2)).slice(0, CONFIG.maxResults);
  if (!hits.length) {
    player.sendMessage(`§7No remembered container has "${q}". Containers are remembered once someone opens them, or when you search within ${CONFIG.liveScanRadius} blocks.`);
    return;
  }
  const form = new ActionFormData()
    .title(`Find: ${q}`)
    .body(`${hits.length === CONFIG.maxResults ? `The nearest ${hits.length}` : hits.length} container${hits.length === 1 ? "" : "s"}, nearest first. Tap one to mark it.`);
  for (const h of hits) form.button(rowText(h, player));
  system.run(() => pick(player, form, hits).catch((e) => console.warn(`[find] ${e}`)));
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

/** A particle column over the container, every 10 ticks, that only this player sees. @param {Player} player @param {Hit} h */
function highlight(player, h) {
  const at = `${h.x}, ${h.y}, ${h.z}`;
  if (short(player.dimension.id) !== h.dim) {
    player.sendMessage(`§e${title(h.entry.b)}§r at ${at} in ${title(h.dim)}.`);
    return;
  }
  player.sendMessage(`§e${title(h.entry.b)}§r at ${at}, marked for ${CONFIG.highlightSeconds} s.`);
  const until = system.currentTick + CONFIG.highlightSeconds * 20;
  const run = system.runInterval(() => {
    if (!player.isValid || system.currentTick > until || short(player.dimension.id) !== h.dim) {
      system.clearRun(run);
      return;
    }
    for (let k = 0; k < 8; k++) {
      try {
        player.spawnParticle("minecraft:endrod", { x: h.x + 0.5, y: h.y + 1.2 + k * 0.5, z: h.z + 0.5 });
      } catch {
        // spot not loaded for this player
      }
    }
  }, 10);
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
      system.run(() =>
        system.runJob(
          (function* () {
            try {
              yield* search(player, query);
            } catch (e) {
              console.warn(`[find] ${e}`);
            }
          })()
        )
      );
      return { status: CustomCommandStatus.Success };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "find_bp");
  },
  { namespaces: ["realm"] }
);
