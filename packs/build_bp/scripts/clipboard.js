// Copy, cut and paste for Easy Building. A copy is a structure saved in the world (`world.structureManager`,
// id `build:p<player id>_<slot>`): slot 0 is "Last copy", slots 1-19 are named saved copies. Pastes go
// through build() in main.js, so claims, safe zones, survival costs, limits and undo work as for shapes.
import { BlockPermutation, Dimension, Player, StructureSaveMode, system, world } from "@minecraft/server";
import { ActionFormData, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import { get, getFor } from "./settings.js";
import { drawGuide } from "./guides.js";
import { remember, stepHooks } from "./undo.js";

/** @type {import("./main.js").Ctx} */
let ctx;
/** @param {import("./main.js").Ctx} c */
export function setupClipboard(c) {
  ctx = c;
  stepHooks.check = checkStep;
  stepHooks.done = afterStep;
}

const META_PROP = "build:clip"; // player: JSON Meta
const MAX_SIDE = 64; // a structure is at most 64 x 384 x 64
const MAX_HEIGHT = 384;
const NAME_LEN = 24;
/** Paste never places the forbidden blocks, but doors (both halves come along). */
const DOOR = /_door$/;
const LIQUID = /^minecraft:(flowing_)?(water|lava)$/;

/**
 * A saved copy. `f`: the way its maker faced (index into FACINGS); `orig`: the survival cut it came from;
 * `cut`: that cut may still be pasted once for free.
 * @typedef {{ n: string, x: number, y: number, z: number, b: number, f: number, v: number, orig?: string, cut?: string }} Slot
 * @typedef {{ act: number, used: string[], slots: Record<string, Slot> }} Meta
 * @typedef {{ x: number, y: number, z: number }} Vec
 * @typedef {{ dim: string, a?: Vec, b?: Vec, c?: Vec }} Selection
 * @typedef {{ sel?: Selection, selecting: boolean, showUntil: number, paste: boolean, lastCorner: number }} ClipState
 * @typedef {{ x: number, y: number, z: number, perm: BlockPermutation }} ClipCell
 * @typedef {{ v: number, cells: ClipCell[], surface?: ClipCell[] }} Content
 */

/** @type {Map<string, ClipState>} */
const states = new Map();
/** @param {Player} player */
function stateOf(player) {
  let s = states.get(player.id);
  if (!s) states.set(player.id, (s = { selecting: false, showUntil: 0, paste: false, lastCorner: -10 }));
  return s;
}

/** @param {Player} player @param {number} slot */
const structId = (player, slot) => `build:p${player.id}_${slot}`;

/** @param {Player} player @returns {Meta} */
function metaOf(player) {
  /** @type {any} */
  let m;
  try {
    const raw = player.getDynamicProperty(META_PROP);
    m = typeof raw === "string" ? JSON.parse(raw) : {};
  } catch {
    m = {};
  }
  return {
    act: Number.isInteger(m?.act) ? m.act : 0,
    used: Array.isArray(m?.used) ? m.used.map(String) : [],
    slots: m?.slots && typeof m.slots === "object" ? m.slots : {},
  };
}
/** @param {Player} player @param {Meta} meta */
function saveMeta(player, meta) {
  meta.used = meta.used.slice(-40);
  player.setDynamicProperty(META_PROP, JSON.stringify(meta));
}

/** @param {number} slot */
const slotName = (slot) => (slot === 0 ? "Last copy" : `Copy ${slot}`);
/** "Last copy (5 x 3 x 4, 42 blocks)" @param {Slot} s */
const slotLabel = (s) => `${s.n} (${s.x} x ${s.y} x ${s.z}, ${ctx.plural(s.b, "block")})`;

/** The way the player faces, as an index into FACINGS. @param {Player} player */
const facingIndex = (player) => Math.max(0, ctx.FACINGS.indexOf(ctx.facingOf(player)));

// ---------------------------------------------------------------------------
// Turning blocks: block states that point somewhere
// ---------------------------------------------------------------------------

/** One quarter turn takes each direction to the next (south -> west -> north -> east). */
const DIRS = ["south", "west", "north", "east"];
/** @param {string} d @param {number} k */
const turnDir = (d, k) => {
  const i = DIRS.indexOf(d);
  return i < 0 ? d : DIRS[(i + k) % 4];
};
/** Number states, value -> direction. */
const FACING6 = ["down", "up", "north", "south", "west", "east"]; // facing_direction
const WEIRDO = ["east", "west", "south", "north"]; // stairs
const DIR4 = ["south", "west", "north", "east"]; // direction (beds, bells, cocoa, looms...)
const TRAPDOOR4 = ["east", "west", "south", "north"]; // direction on trapdoors
const CORAL4 = ["west", "east", "north", "south"]; // coral_direction (wall fans)
/** rail_direction: straight and curved rails by the two sides they join, sloped ones by the side they rise to. */
const RAILS = [["north", "south"], ["east", "west"], ["east"], ["west"], ["north"], ["south"], ["south", "east"], ["south", "west"], ["north", "west"], ["north", "east"]];
/** @param {string[]} table @param {string | number | boolean} v @param {number} k @returns {string | number | boolean} */
const turnIndex = (table, v, k) => {
  const d = table[Number(v)];
  if (d === undefined) return v;
  const i = table.indexOf(turnDir(d, k));
  return i < 0 ? v : i;
};
/** Direction bits in DIRS order from `shift` (vines: 0, glow lichen and sculk veins: 2). @param {number} v @param {number} k @param {number} shift */
const turnBits = (v, k, shift) => {
  const low = v & ((1 << shift) - 1);
  const dirs = (v >> shift) & 15;
  const turned = ((dirs << k) | (dirs >> (4 - k))) & 15;
  return low | (turned << shift) | (v & ~((1 << (shift + 4)) - 1));
};
/** "down_east_west" -> each word turned, pairs kept in their usual order. @param {string} v @param {number} k */
const turnWords = (v, k) =>
  v
    .split("_")
    .map((w) => turnDir(w, k))
    .join("_")
    .replace("south_north", "north_south")
    .replace("west_east", "east_west");
const SIDE_KEY = /^(wall_connection_type_|minecraft:connection_|pale_moss_carpet_side_)(north|south|east|west)$/;
const WORD_KEY = /direction|facing|face|orientation/;

/** @type {WeakMap<BlockPermutation, (BlockPermutation | undefined)[]>} a copy's blocks die with its content; so do their turns */
const turnCache = new WeakMap();
/**
 * A block turned k quarter turns (south -> west first).
 * @param {BlockPermutation} perm @param {number} k
 */
function turnPerm(perm, k) {
  if (!k) return perm;
  let cached = turnCache.get(perm);
  if (!cached) turnCache.set(perm, (cached = []));
  const hit = cached[k];
  if (hit) return hit;
  const id = perm.type.id;
  /** @type {Record<string, string | number | boolean>} */
  const out = {};
  let changed = false;
  for (const [key, v] of Object.entries(perm.getAllStates())) {
    let key2 = key;
    /** @type {string | number | boolean} */
    let v2 = v;
    const side = SIDE_KEY.exec(key);
    if (side) key2 = side[1] + turnDir(side[2], k);
    else if (key === "weirdo_direction") v2 = turnIndex(WEIRDO, v, k);
    else if (key === "facing_direction") v2 = turnIndex(FACING6, v, k);
    else if (key === "direction") v2 = turnIndex(id.endsWith("trapdoor") ? TRAPDOOR4 : DIR4, v, k);
    else if (key === "coral_direction") v2 = turnIndex(CORAL4, v, k);
    else if (key === "ground_sign_direction" || key === "minecraft:sixteen_way_rotation") v2 = (Number(v) + 4 * k) % 16;
    else if ((key === "pillar_axis" || key === "portal_axis") && k % 2) v2 = v === "x" ? "z" : v === "z" ? "x" : v;
    else if (key === "vine_direction_bits") v2 = turnBits(Number(v), k, 0);
    else if (key === "multi_face_direction_bits") v2 = turnBits(Number(v), k, 2);
    else if (key === "rail_direction") {
      const sides = RAILS[Number(v)];
      if (sides) {
        const t = sides.map((d) => turnDir(d, k));
        const i = RAILS.findIndex((r) => r.length === t.length && t.every((d) => r.includes(d)));
        if (i >= 0) v2 = i;
      }
    } else if (typeof v === "string" && WORD_KEY.test(key)) v2 = turnWords(v, k);
    if (key2 !== key || v2 !== v) changed = true;
    out[key2] = v2;
  }
  let res = perm;
  if (changed) {
    try {
      res = BlockPermutation.resolve(id, out);
    } catch {
      res = perm;
    }
  }
  cached[k] = res;
  return res;
}

// ---------------------------------------------------------------------------
// What a copy holds
// ---------------------------------------------------------------------------

/** @type {Map<string, Content>} by structure id */
const contents = new Map();
/** @type {Map<string, Promise<Content | undefined>>} */
const loading = new Map();

/**
 * The blocks of a copy (air and empty spots left out), read from its structure a few thousand a tick.
 * @param {string} id @param {Slot} slot @returns {Promise<Content | undefined>}
 */
function contentOf(id, slot) {
  const have = contents.get(id);
  if (have && have.v === slot.v) return Promise.resolve(have);
  let p = loading.get(id);
  if (p) return p;
  p = (async () => {
    try {
      const st = world.structureManager.get(id);
      if (!st) return undefined;
      const size = st.size;
      /** @type {Map<string, BlockPermutation>} */
      const same = new Map();
      /** @type {ClipCell[]} */
      const cells = [];
      let n = 0;
      for (let y = 0; y < size.y; y++)
        for (let x = 0; x < size.x; x++)
          for (let z = 0; z < size.z; z++) {
            if (++n % 4096 === 0) await ctx.tick();
            const perm = st.getBlockPermutation({ x, y, z });
            if (!perm || perm.type.id === "minecraft:air") continue;
            const states = perm.getAllStates();
            const key = Object.keys(states).length ? perm.type.id + JSON.stringify(states) : perm.type.id;
            let shared = same.get(key);
            if (!shared) same.set(key, (shared = perm));
            cells.push({ x, y, z, perm: shared });
          }
      const content = { v: slot.v, cells };
      contents.set(id, content);
      return content;
    } catch (e) {
      console.warn(`[build] copy ${id}: ${e}`);
      return undefined;
    } finally {
      loading.delete(id);
    }
  })();
  loading.set(id, p);
  return p;
}

/** The outside blocks of a copy (for the paste preview). @param {Content} c */
function surfaceOf(c) {
  if (c.surface) return c.surface;
  const set = new Set(c.cells.map((b) => `${b.x},${b.y},${b.z}`));
  c.surface = c.cells.filter(
    (b) =>
      !set.has(`${b.x + 1},${b.y},${b.z}`) || !set.has(`${b.x - 1},${b.y},${b.z}`) || !set.has(`${b.x},${b.y + 1},${b.z}`) ||
      !set.has(`${b.x},${b.y - 1},${b.z}`) || !set.has(`${b.x},${b.y},${b.z + 1}`) || !set.has(`${b.x},${b.y},${b.z - 1}`)
  );
  return c.surface;
}

/**
 * Where a copy goes at T: it starts at T and goes away from you, centered left to right, turned from the
 * way its maker faced to the way you face. Returns a function from copy cells to world spots, and the turn.
 * @param {Slot} slot @param {number} facing index into FACINGS @param {Vec} T
 */
function placement(slot, facing, T) {
  const F0 = ctx.FACINGS[slot.f] ?? ctx.FACINGS[0], R0 = [-F0[1], F0[0]];
  const F = ctx.FACINGS[facing], R = [-F[1], F[0]];
  // The copy's box in its maker's frame: u right, w away.
  const us = [0, slot.x - 1].flatMap((x) => [0, slot.z - 1].map((z) => x * R0[0] + z * R0[1]));
  const ws = [0, slot.x - 1].flatMap((x) => [0, slot.z - 1].map((z) => x * F0[0] + z * F0[1]));
  const uMin = Math.min(...us), wMin = Math.min(...ws);
  const wide = Math.max(...us) - uMin + 1;
  const au = Math.floor((wide - 1) / 2);
  return {
    k: (facing - slot.f + 8) % 4,
    /** @param {{ x: number, y: number, z: number }} c */
    at: (c) => {
      const u = c.x * R0[0] + c.z * R0[1] - uMin - au, w = c.x * F0[0] + c.z * F0[1] - wMin;
      return { x: T.x + u * R[0] + w * F[0], y: T.y + c.y, z: T.z + u * R[1] + w * F[1] };
    },
  };
}

// ---------------------------------------------------------------------------
// Selecting a region
// ---------------------------------------------------------------------------

/** The selected box, or undefined until two corners are set. @param {ClipState} st */
function selBox(st) {
  const s = st.sel;
  if (!s?.a || !s.b) return undefined;
  const pts = [s.a, s.b, ...(s.c ? [s.c] : [])];
  const min = { x: Math.min(s.a.x, s.b.x), y: Math.min(...pts.map((p) => p.y)), z: Math.min(s.a.z, s.b.z) };
  const max = { x: Math.max(s.a.x, s.b.x), y: Math.max(...pts.map((p) => p.y)), z: Math.max(s.a.z, s.b.z) };
  return { dim: s.dim, min, max, size: { x: max.x - min.x + 1, y: max.y - min.y + 1, z: max.z - min.z + 1 } };
}

/** @param {Player} player */
function startSelecting(player) {
  const st = stateOf(player);
  st.selecting = true;
  st.sel = undefined;
  st.paste = false;
  ctx.note(player, "§bSelect: §fuse an item on the first corner block§7 (or in the air)", 80);
  player.sendMessage(
    "§aSelecting a region:§r use (right-click or long-press) a block for the first corner, then the opposite corner. A third block sets the height. Using an item in the air sets a corner in front of you (your Air Build distance, 4 blocks unless you changed it). Then copy or cut in /realm:build -> Copy, cut and paste, or with /realm:build_copy or /realm:build_cut."
  );
}

/** @param {Player} player @param {string} dim @param {Vec} p */
function addCorner(player, dim, p) {
  const st = stateOf(player);
  st.lastCorner = system.currentTick;
  st.showUntil = system.currentTick + 600;
  if (!st.sel || st.sel.dim !== dim || (st.sel.a && st.sel.b && st.sel.c)) st.sel = { dim };
  const s = st.sel;
  if (!s.a) {
    s.a = p;
    ctx.note(player, `§bCorner 1§7 at ${p.x} ${p.y} ${p.z} - now the opposite corner`, 80);
    return;
  }
  if (!s.b) {
    s.b = p;
  } else {
    s.c = p;
    st.selecting = false;
  }
  const box = /** @type {NonNullable<ReturnType<typeof selBox>>} */ (selBox(st));
  const size = `${box.size.x} x ${box.size.y} x ${box.size.z}`;
  if (s.c) ctx.note(player, `§bSelected ${size}§7 - copy or cut it now`, 80);
  else ctx.note(player, `§bSelected ${size}§7 - a third block sets the height, or copy or cut it now`, 80);
}

world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  const st = states.get(ev.player.id);
  if (!st?.selecting) return;
  ev.cancel = true;
  // Holding use repeats the event: one corner per click.
  if (system.currentTick - st.lastCorner < 6) return;
  st.lastCorner = system.currentTick;
  const player = ev.player;
  const dim = ev.block.dimension.id;
  const { x, y, z } = ev.block.location;
  system.run(() => player.isValid && addCorner(player, dim, { x, y, z }));
});

world.afterEvents.itemUse.subscribe(({ source: player }) => {
  const st = states.get(player.id);
  if (!st?.selecting || system.currentTick - st.lastCorner < 4) return;
  // On a block: playerInteractWithBlock sets the corner.
  try {
    if (player.getBlockFromViewDirection({ maxDistance: 6 })) return;
  } catch {
    // nothing in view
  }
  const h = player.getHeadLocation(), d = player.getViewDirection();
  const AIR_CORNER = ctx.airDistance(player);
  addCorner(player, player.dimension.id, {
    x: Math.floor(h.x + d.x * AIR_CORNER),
    y: Math.floor(h.y + d.y * AIR_CORNER),
    z: Math.floor(h.z + d.z * AIR_CORNER),
  });
});

/** The paste ghost with the player's modifier copies (none if too many). @param {Player} player @param {Vec[]} cells @param {Vec} T */
function guideMods(player, cells, T) {
  try {
    return ctx.withMods(player, cells, T);
  } catch {
    return cells;
  }
}

/** Is the player choosing the corners of a region (their item uses set corners then)? @param {Player} player */
export const isSelecting = (player) => !!states.get(player.id)?.selecting;
/** Is paste mode on (placing a block pastes)? @param {Player} player */
export const isPasting = (player) => !!states.get(player.id)?.paste;

/** The block the player looks at (not the spot in front of it). @param {Player} player */
function lookBlock(player) {
  try {
    const hit = player.getBlockFromViewDirection({ maxDistance: ctx.reachOf(player), includeLiquidBlocks: false, includePassableBlocks: true });
    return hit ? { x: hit.block.location.x, y: hit.block.location.y, z: hit.block.location.z } : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Copy and cut
// ---------------------------------------------------------------------------

/** Items lying in a box (to tell new drops from old ones). @param {Dimension} dim @param {Vec} min @param {Vec} max */
function itemsIn(dim, min, max) {
  const c = { x: (min.x + max.x + 1) / 2, y: (min.y + max.y + 1) / 2, z: (min.z + max.z + 1) / 2 };
  const r = Math.hypot(max.x - min.x + 3, max.y - min.y + 3, max.z - min.z + 3) / 2;
  try {
    return dim
      .getEntities({ type: "minecraft:item", location: c, maxDistance: r })
      .filter((e) => e.location.x >= min.x - 1 && e.location.x <= max.x + 2 && e.location.y >= min.y - 1 && e.location.y <= max.y + 2 && e.location.z >= min.z - 1 && e.location.z <= max.z + 2);
  } catch {
    return [];
  }
}

/** Blocks that hang on others go first when cutting, so nothing pops off. */
const HANGS = /(torch|lantern|ladder|button|lever|sign|banner|rail|carpet|pressure_plate|vine|lichen|tripwire|redstone_wire|repeater|comparator|_door|candle|flower|sapling|grass|fern|bush|petals|mushroom|frame|chain|bell|amethyst_bud|amethyst_cluster|dripleaf|roots|sprouts|fungus|coral|pickle|snow_layer|cocoa|head|skull|hook|cactus|sugar_cane|bamboo|kelp|seagrass|lily|dripstone|scaffolding|bars|pane)/;

/**
 * Copies the selected region into Last copy; `cut` also takes the blocks away (no drops).
 * @param {Player} player @param {boolean} cut
 */
async function copyOrCut(player, cut) {
  const s = ctx.stateOf(player);
  if (s.busy) return player.sendMessage("§eWait for the last build to finish.");
  if (cut && ctx.cantBuild(player)) return player.sendMessage(ctx.CANT_BUILD);
  const st = stateOf(player);
  const box = selBox(st);
  if (!box) return startSelecting(player);
  const { min, max, size } = box;
  if (size.x > MAX_SIDE || size.z > MAX_SIDE || size.y > MAX_HEIGHT) {
    return player.sendMessage(`§eThat region is ${size.x} x ${size.y} x ${size.z}; a copy can be at most ${MAX_SIDE} blocks across (and ${MAX_HEIGHT} high). Select a smaller one.`);
  }
  const volume = size.x * size.y * size.z;
  if (volume > get("copyMaxBlocks")) {
    return player.sendMessage(`§eThat region holds ${volume} blocks (air included); the most one copy can hold is ${get("copyMaxBlocks")}. Select a smaller one.`);
  }
  let dim;
  try {
    dim = world.getDimension(box.dim);
  } catch {
    return;
  }
  st.selecting = false;
  s.busy = true;
  try {
    if (cut) {
      const why = await ctx.areaRefusal(player, dim, min, max, "cut");
      if (!player.isValid) return;
      if (why) return player.sendMessage(`§e${why}`);
    }
    const id = structId(player, 0);
    const sm = world.structureManager;
    const meta = metaOf(player);
    const old = meta.slots["0"];
    try {
      sm.delete(id);
    } catch {
      // there was none
    }
    contents.delete(id);
    // Last copy is empty until the new copy is complete: a player who leaves meanwhile doesn't keep a stale slot
    // (the old size and facing) over the new structure.
    delete meta.slots["0"];
    saveMeta(player, meta);
    let structure;
    try {
      structure = sm.createFromWorld(id, dim, min, max, { includeEntities: false, saveMode: StructureSaveMode.World });
    } catch (e) {
      return player.sendMessage(`§eCouldn't copy that region (${String(e).slice(0, 120)}). Is all of it loaded?`);
    }
    /** The player left before the copy was complete: no copy is kept. */
    const abandon = () => {
      try {
        sm.delete(id);
      } catch {
        // gone
      }
      contents.delete(id);
    };
    // What can't be pasted (forbidden blocks), or isn't cut (protected blocks, water and lava), is left out.
    /** @type {Map<string, BlockPermutation>} */
    const same = new Map();
    /** @type {ClipCell[]} */
    const cells = [];
    let voided = 0, n = 0;
    for (let y = 0; y < size.y; y++)
      for (let x = 0; x < size.x; x++)
        for (let z = 0; z < size.z; z++) {
          if (++n % 4096 === 0) {
            await ctx.tick();
            if (!player.isValid) return abandon();
          }
          const loc = { x, y, z };
          const perm = structure.getBlockPermutation(loc);
          if (!perm || perm.type.id === "minecraft:air") continue;
          const bid = perm.type.id;
          if ((ctx.isForbidden(bid) && !DOOR.test(bid)) || (cut && (ctx.isProtectedBlock(bid) || LIQUID.test(bid)))) {
            structure.setBlockPermutation(loc);
            voided++;
            continue;
          }
          const states = perm.getAllStates();
          const key = Object.keys(states).length ? bid + JSON.stringify(states) : bid;
          let shared = same.get(key);
          if (!shared) same.set(key, (shared = perm));
          cells.push({ x, y, z, perm: shared });
        }
    if (!player.isValid) return abandon();
    const creative = ctx.isCreative(player);
    if (cut && !cells.length) {
      sm.delete(id);
      delete meta.slots["0"];
      saveMeta(player, meta);
      return player.sendMessage("§eNothing there to cut.");
    }
    if (cut && cells.length > ctx.limitOf(player)) {
      sm.delete(id);
      delete meta.slots["0"];
      saveMeta(player, meta);
      return player.sendMessage(`§eThat's ${cells.length} blocks; the most you can cut at once is ${ctx.limitOf(player)}${creative ? "" : " in survival"}. Select a smaller region.`);
    }
    /** @type {import("./undo.js").Placed[]} */
    const removed = [];
    if (cut) {
      const before = new Set(itemsIn(dim, min, max).map((e) => e.id));
      const order = [...cells].sort((a, b) => Number(HANGS.test(b.perm.type.id)) - Number(HANGS.test(a.perm.type.id)) || b.y - a.y);
      const perTick = Math.max(10, get("blocksPerTick"));
      const air = ctx.AIR();
      /** @type {Set<ClipCell>} */
      const kept = new Set();
      /**
       * The player left mid-cut: what was taken out goes back where it was (what hangs on others last), and nothing is
       * kept as a copy. A spot that isn't loaded any more stays undoable in this session.
       */
      const abandonCut = () => {
        /** @type {import("./undo.js").Placed[]} */
        const lost = [];
        for (let i = removed.length - 1; i >= 0; i--) {
          const c = removed[i];
          try {
            const block = dim.getBlock(c);
            if (block?.isAir) block.setPermutation(c.before);
            else lost.push(c);
          } catch {
            lost.push(c);
          }
        }
        if (lost.length) remember(player, { dim: dim.id, label: `Cut ${size.x} x ${size.y} x ${size.z}`, kind: "cut", cells: lost, slot: 0 });
        abandon();
      };
      for (let i = 0; i < order.length; i++) {
        if (i && i % perTick === 0) {
          await ctx.tick();
          if (!player.isValid) return abandonCut();
        }
        const c = order[i];
        const at = { x: min.x + c.x, y: min.y + c.y, z: min.z + c.z };
        let block;
        try {
          block = dim.getBlock(at);
        } catch {
          block = undefined;
        }
        if (!block || block.typeId !== c.perm.type.id) {
          // Changed since it was copied: it stays, and the copy leaves it out.
          kept.add(c);
          continue;
        }
        const was = block.permutation;
        try {
          block.setPermutation(air);
        } catch {
          kept.add(c);
          continue;
        }
        removed.push({ ...at, before: was, after: air });
      }
      for (const c of kept) {
        structure.setBlockPermutation({ x: c.x, y: c.y, z: c.z });
        voided++;
      }
      if (kept.size) cells.splice(0, cells.length, ...cells.filter((c) => !kept.has(c)));
      // A cut gives no drops: anything that popped off goes too.
      await ctx.tick();
      if (!player.isValid) return abandonCut();
      for (const e of itemsIn(dim, min, max)) {
        if (before.has(e.id)) continue;
        try {
          e.remove();
        } catch {
          // gone
        }
      }
    }
    if (voided) structure.saveToWorld();
    /** @type {Slot} */
    const slot = { n: slotName(0), x: size.x, y: size.y, z: size.z, b: cells.length, f: facingIndex(player), v: Date.now() };
    const cutId = cut && !creative && removed.length ? `c${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}` : undefined;
    if (cutId) slot.orig = slot.cut = cutId;
    meta.slots["0"] = slot;
    meta.act = 0;
    saveMeta(player, meta);
    contents.set(id, { v: slot.v, cells });
    st.showUntil = 0;
    if (cut && removed.length) {
      remember(player, { dim: dim.id, label: `Cut ${size.x} x ${size.y} x ${size.z}`, kind: "cut", cells: removed, slot: 0, ...(cutId ? { cut: cutId } : {}) });
    }
    if (old?.cut) player.sendMessage("§7Your earlier cut was never pasted. Undo can still put it back where it was.");
    const what = `${ctx.plural(cells.length, "block")} (${size.x} x ${size.y} x ${size.z})`;
    ctx.note(player, cut ? `§aCut ${what}§7 - paste it with /realm:build_paste` : `§aCopied ${what}§7 - paste it with /realm:build_paste`);
    if (cutId) player.sendMessage("§7In survival, a cut can be pasted once for free. After that, pasting it costs blocks like a copy.");
  } finally {
    s.busy = false;
  }
}

// ---------------------------------------------------------------------------
// Paste
// ---------------------------------------------------------------------------

/** The copy paste uses: its slot number, meta and content. @param {Player} player */
async function activeCopy(player) {
  const meta = metaOf(player);
  let act = meta.act;
  if (!meta.slots[String(act)]) act = 0;
  const slot = meta.slots[String(act)];
  if (!slot) return undefined;
  const id = structId(player, act);
  const content = await contentOf(id, slot);
  if (!content) return undefined;
  return { act, slot, content, meta };
}

/**
 * The world blocks of a paste at T, turned to the way the player faces.
 * @param {Player} player @param {Slot} slot @param {Content} content @param {Vec} T
 */
function pasteCells(player, slot, content, T) {
  const { k, at } = placement(slot, facingIndex(player), T);
  /** @type {{ x: number, y: number, z: number, perm: BlockPermutation }[]} */
  const out = [];
  for (const c of content.cells) out.push({ ...at(c), perm: turnPerm(c.perm, k) });
  return out;
}

/**
 * Pastes the active copy at T.
 * @param {Player} player @param {Vec} T @param {boolean} ask show the preview and the cost first
 */
async function pasteAt(player, T, ask) {
  if (ctx.stateOf(player).busy) return player.sendMessage("§eWait for the last build to finish.");
  if (ctx.cantBuild(player)) return player.sendMessage(ctx.CANT_BUILD);
  const copy = await activeCopy(player);
  if (!copy) return player.sendMessage("§eNothing to paste: copy something first (/realm:build -> Copy, cut and paste).");
  const { act, slot, content } = copy;
  const label = `Paste: ${slot.n} ${slot.x} x ${slot.y} x ${slot.z}`;
  const free = !!slot.cut && !copy.meta.used.includes(slot.cut);
  // Modifiers copy a paste too, except the one free paste of a cut (that would make blocks out of nothing).
  let cells;
  try {
    cells = free ? pasteCells(player, slot, content, T) : ctx.withMods(player, pasteCells(player, slot, content, T), T);
  } catch (e) {
    if (e instanceof ctx.TooBig) return player.sendMessage(ctx.tooBig(player, e));
    throw e;
  }
  if (ask) {
    const secs = Math.max(0, get("previewSeconds"));
    const { at } = placement(slot, facingIndex(player), T);
    const ghost = free ? surfaceOf(content).map(at) : guideMods(player, surfaceOf(content).map(at), T);
    for (let t = 0; t < secs * 2; t++) {
      if (!player.isValid) return;
      drawGuide(player, ghost, "paste");
      await new Promise((r) => system.runTimeout(() => r(undefined), 10));
    }
    const pay = !ctx.isCreative(player) && get("requireItems") === true && !free;
    const lines = [`${label}: up to ${ctx.plural(cells.length, "block")} at ${T.x} ${T.y} ${T.z}.`];
    if (free) lines.push("These are blocks you cut: this paste is free.");
    else if (pay) {
      /** @type {Map<string, number>} */
      const need = new Map();
      for (const c of cells) {
        const cost = ctx.costOf(c.perm);
        if (cost) need.set(cost, (need.get(cost) ?? 0) + 1);
      }
      const have = ctx.countItems(player);
      lines.push("Uses from your inventory (spots already filled cost nothing):");
      for (const [id, n] of [...need].slice(0, 8)) {
        const h = have.get(id) ?? 0;
        lines.push(`${h >= n ? "§a" : "§c"}${n} ${ctx.nice(id)}§r (you have ${h})`);
      }
      if (need.size > 8) lines.push(`...and ${need.size - 8} more kinds of blocks.`);
    } else lines.push("Free in creative.");
    const res = await ctx.show(player, new MessageFormData().title("Paste").body(lines.join("\n")).button1("Paste it").button2("Cancel"));
    if (!res || res.canceled || res.selection !== 0 || !player.isValid) return;
    if (ctx.stateOf(player).busy) return player.sendMessage("§eWait for the last build to finish.");
  }
  const ok = await ctx.build(player, player.dimension, cells, label, {
    mode: ctx.replaceMode(player, ctx.planOf(player)),
    free,
    kind: "paste",
    rec: free ? { slot: act, free: slot.cut } : { slot: act },
  });
  if (ok && free && player.isValid) {
    const meta = metaOf(player);
    if (slot.cut) meta.used.push(slot.cut);
    for (const s of Object.values(meta.slots)) if (s.cut === slot.cut) delete s.cut;
    saveMeta(player, meta);
    player.sendMessage("§7That was the free paste of your cut. Pasting it again costs blocks.");
  }
}

/** The spot a paste goes at: on the face of the block you look at. @param {Player} player */
function pasteTarget(player) {
  const T = ctx.lookTarget(player);
  if (!T) player.sendMessage(`§eLook at a block within ${ctx.reachOf(player)} blocks first.`);
  return T;
}

// Paste mode: placing a block pastes the copy there (the block marks the spot, like build mode).
world.afterEvents.playerPlaceBlock.subscribe(({ player, block }) => {
  const st = states.get(player.id);
  if (!st?.paste || player.isSneaking || ctx.refusal(player)) return;
  if (ctx.stateOf(player).on) {
    st.paste = false; // build mode was turned on: it wins
    return;
  }
  if (ctx.stateOf(player).busy) return ctx.note(player, "§eStill building the last one...");
  const perm = block.permutation;
  if (ctx.isForbidden(perm.type.id) || perm.getState("upper_block_bit") !== undefined || ctx.stacked(perm)) return;
  const T = { x: block.location.x, y: block.location.y, z: block.location.z };
  try {
    block.setPermutation(ctx.AIR());
    const paid = ctx.isCreative(player) ? undefined : ctx.costOf(perm);
    if (paid) ctx.giveItems(player, new Map([[paid, 1]]));
  } catch {
    return;
  }
  pasteAt(player, T, false).catch((e) => console.warn(`[build] paste: ${e}`));
});

/** @param {Player} player @param {boolean} [on] */
function setPasteMode(player, on) {
  const st = stateOf(player);
  st.paste = on ?? !st.paste;
  if (st.paste) {
    st.selecting = false;
    ctx.setBuildMode(player, false);
    ctx.note(player, "§aPaste mode on:§7 place a block to paste your copy there (sneak: just the block)");
  } else ctx.note(player, "§7Paste mode off");
}

// The selection outline and the paste preview, twice a second.
system.runInterval(() => {
  const now = system.currentTick;
  for (const [pid, st] of states) {
    if (!st.selecting && st.showUntil < now && !st.paste) continue;
    const player = world.getEntity(pid);
    if (!(player instanceof Player) || !player.isValid) continue;
    try {
      if (st.sel?.a && st.sel.dim === player.dimension.id && (st.selecting || st.showUntil >= now)) {
        const box = selBox(st);
        ctx.drawBox(player, box ?? { min: st.sel.a, max: st.sel.a });
      }
      if (st.paste && getFor(player, "pastePreview") === true) {
        const meta = metaOf(player);
        const act = meta.slots[String(meta.act)] ? meta.act : 0;
        const slot = meta.slots[String(act)];
        const T = slot && ctx.lookTarget(player);
        if (!slot || !T) continue;
        const id = structId(player, act);
        const c = contents.get(id);
        if (!c || c.v !== slot.v) {
          contentOf(id, slot).catch(() => undefined);
          continue;
        }
        const { at } = placement(slot, facingIndex(player), T);
        const free = !!slot.cut && !meta.used.includes(slot.cut);
        drawGuide(player, free ? surfaceOf(c).map(at) : guideMods(player, surfaceOf(c).map(at), T), "paste");
      }
    } catch (e) {
      console.warn(`[build] clipboard: ${e}`);
    }
  }
}, 10);

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  states.delete(playerId);
  // Their copies' blocks are read again from the structures when they next paste.
  for (const id of contents.keys()) if (id.startsWith(`build:p${playerId}_`)) contents.delete(id);
});

// ---------------------------------------------------------------------------
// Survival cuts and undo: a cut pasted for free can't be undone too (that would make blocks)
// ---------------------------------------------------------------------------

/** @param {Player} player @param {import("./undo.js").BuildRecord} rec @param {boolean} redo */
function checkStep(player, rec, redo) {
  if (redo || rec.kind !== "cut" || !rec.cut) return undefined;
  if (metaOf(player).used.includes(rec.cut)) return "Those cut blocks were already pasted for free. Undo that paste first.";
  return undefined;
}

/** @param {Player} player @param {import("./undo.js").BuildRecord} rec @param {boolean} redo */
function afterStep(player, rec, redo) {
  if (!player.isValid) return;
  const meta = metaOf(player);
  let changed = false;
  if (rec.kind === "cut" && rec.cut) {
    // Undo: the blocks are back, so the copy no longer pastes for free. Redo: they are cut again.
    for (const s of Object.values(meta.slots)) {
      if (s.orig !== rec.cut) continue;
      if (redo && !meta.used.includes(rec.cut)) s.cut = rec.cut;
      else if (!redo) delete s.cut;
      changed = true;
    }
  } else if (rec.kind === "paste" && rec.free && !redo) {
    // The free paste was undone: it can be pasted for free again.
    meta.used = meta.used.filter((c) => c !== rec.free);
    for (const s of Object.values(meta.slots)) if (s.orig === rec.free) s.cut = rec.free;
    changed = true;
  }
  if (changed) saveMeta(player, meta);
}

// ---------------------------------------------------------------------------
// Menus and commands
// ---------------------------------------------------------------------------

/** /realm:build_copy @param {Player} player */
export const copyCommand = (player) => copyOrCut(player, false);
/** /realm:build_cut @param {Player} player */
export const cutCommand = (player) => copyOrCut(player, true);
/** /realm:build_paste: at the block you look at, no questions. @param {Player} player */
export async function pasteCommand(player) {
  const T = pasteTarget(player);
  if (T) await pasteAt(player, T, false);
}

/** /realm:build -> Copy, cut and paste @param {Player} player */
export async function clipboardMenu(player) {
  const st = stateOf(player);
  const meta = metaOf(player);
  const box = selBox(st);
  const last = meta.slots["0"];
  const act = meta.slots[String(meta.act)] ? meta.act : 0;
  const active = meta.slots[String(act)];
  const body = [
    box
      ? `Selected: §b${box.size.x} x ${box.size.y} x ${box.size.z}§r from ${box.min.x} ${box.min.y} ${box.min.z}`
      : st.selecting
        ? "Selecting: use a block (or an item in the air) for each corner."
        : "Nothing selected. Select a region to copy or cut it.",
    `Last copy: ${last ? slotLabel(last) : "empty"}`,
    active && act ? `Pasting from: ${slotLabel(active)}` : "",
    active?.cut && !meta.used.includes(active.cut) ? "§aThe copy holds blocks you cut: the next paste is free.§r" : "",
    st.paste ? "§aPaste mode is on:§r placing a block pastes your copy there." : "",
    "Pastes turn to face the way you look.",
  ]
    .filter(Boolean)
    .join("\n");
  /** @type {{ text: string, run: () => unknown }[]} */
  const actions = [
    { text: st.selecting ? "Stop selecting" : "Select a region", run: () => (st.selecting ? ((st.selecting = false), ctx.note(player, "§7Stopped selecting")) : startSelecting(player)) },
    { text: "Corner at the block you look at", run: () => menuCorner(player, lookBlock(player)) },
    { text: "Corner where you stand", run: () => menuCorner(player, { x: Math.floor(player.location.x), y: Math.floor(player.location.y), z: Math.floor(player.location.z) }) },
  ];
  if (box) {
    actions.push({ text: "Copy", run: () => copyOrCut(player, false) });
    actions.push({ text: "Cut (takes the blocks, no drops)", run: () => copyOrCut(player, true) });
    actions.push({ text: "Clear the selection", run: () => ((st.sel = undefined), (st.selecting = false), ctx.note(player, "§7Selection cleared")) });
  }
  if (active) {
    actions.push({ text: "Paste here now", run: () => {
      const T = pasteTarget(player);
      return T && pasteAt(player, T, true);
    } });
    actions.push({ text: st.paste ? "Paste mode: §aOn" : "Paste mode: Off", run: () => setPasteMode(player) });
  }
  actions.push({ text: "Saved copies", run: () => slotsMenu(player) });
  actions.push({ text: "Back", run: () => ctx.mainMenu(player) });
  const form = new ActionFormData().title("Copy, cut and paste").body(body);
  for (const a of actions) form.button(a.text);
  const res = await ctx.show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  await actions[res.selection]?.run();
}

/** @param {Player} player @param {Vec | undefined} p */
function menuCorner(player, p) {
  if (!p) return player.sendMessage(`§eLook at a block within ${ctx.reachOf(player)} blocks first.`);
  const st = stateOf(player);
  if (!st.selecting && !(st.sel?.a && !st.sel.c)) st.sel = undefined;
  st.selecting = true;
  addCorner(player, player.dimension.id, p);
}

/** @param {Player} player */
async function slotsMenu(player) {
  const meta = metaOf(player);
  const count = Math.max(0, Math.min(19, get("clipboardSlots")));
  const act = meta.slots[String(meta.act)] ? meta.act : 0;
  const form = new ActionFormData().title("Saved copies").body(
    `Saved copies stay after a restart. Pick one to paste from it, or save your Last copy into it.\nPasting from: ${meta.slots[String(act)] ? meta.slots[String(act)].n : "nothing yet"}`
  );
  /** @type {number[]} */
  const order = [];
  for (let i = 0; i <= count; i++) {
    const s = meta.slots[String(i)];
    form.button(`${i === act && s ? "§a" : ""}${s ? slotLabel(s) : i === 0 ? "Last copy (empty)" : `${i}. (empty)`}`);
    order.push(i);
  }
  const res = await ctx.show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  const i = order[res.selection];
  if (i !== undefined) await slotMenu(player, i);
}

/** @param {Player} player @param {number} i */
async function slotMenu(player, i) {
  const meta = metaOf(player);
  const s = meta.slots[String(i)];
  const last = meta.slots["0"];
  /** @type {{ text: string, run: () => unknown }[]} */
  const actions = [];
  if (s) actions.push({ text: "Paste from this copy", run: () => {
    const m = metaOf(player);
    m.act = i;
    saveMeta(player, m);
    ctx.note(player, `§aPasting from ${s.n}§7 - /realm:build_paste or paste mode`);
  } });
  if (i > 0 && last) actions.push({ text: s ? "Replace it with Last copy" : "Save Last copy here", run: () => saveToSlot(player, i) });
  if (i > 0 && s) actions.push({ text: "Rename", run: () => renameSlot(player, i) });
  if (s) actions.push({ text: "Delete", run: () => deleteSlot(player, i) });
  actions.push({ text: "Back", run: () => slotsMenu(player) });
  const form = new ActionFormData().title(s ? s.n : i === 0 ? "Last copy" : `Copy ${i}`).body(s ? slotLabel(s) : "Empty. Copy something first, then save it here.");
  for (const a of actions) form.button(a.text);
  const res = await ctx.show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  await actions[res.selection]?.run();
}

/** @param {Player} player @param {string} def */
async function askName(player, def) {
  const res = await ctx.show(player, new ModalFormData().title("Name the copy").textField(`Name (up to ${NAME_LEN} letters)`, "My house", { defaultValue: def }).submitButton("Save"));
  if (!res || res.canceled || !player.isValid) return undefined;
  const name = String(ctx.inputs(res)[0] ?? "").replace(/\u00a7./g, "").replace(/[^\x20-\x7e]/g, "").trim().slice(0, NAME_LEN).trim();
  return name || def;
}

/** @param {Player} player @param {number} i */
async function saveToSlot(player, i) {
  const name = await askName(player, metaOf(player).slots[String(i)]?.n ?? `Copy ${i}`);
  if (!name) return;
  const meta = metaOf(player);
  const last = meta.slots["0"];
  const src = world.structureManager.get(structId(player, 0));
  if (!last || !src) return player.sendMessage("§eLast copy is empty.");
  const id = structId(player, i);
  try {
    world.structureManager.delete(id);
  } catch {
    // empty slot
  }
  try {
    src.saveAs(id, StructureSaveMode.World);
  } catch (e) {
    return player.sendMessage(`§eCouldn't save it (${String(e).slice(0, 120)}).`);
  }
  contents.delete(id);
  const slot = { ...last, n: name, v: Date.now() };
  // A cut's free paste moves along with it.
  delete last.cut;
  meta.slots[String(i)] = slot;
  meta.act = i;
  saveMeta(player, meta);
  player.sendMessage(`§aSaved as ${name}§r (${slotLabel(slot)}). Pastes now use it.`);
}

/** @param {Player} player @param {number} i */
async function renameSlot(player, i) {
  const name = await askName(player, metaOf(player).slots[String(i)]?.n ?? "");
  if (!name) return;
  const meta = metaOf(player);
  const s = meta.slots[String(i)];
  if (!s) return;
  s.n = name;
  saveMeta(player, meta);
  player.sendMessage(`§aRenamed to ${name}.`);
}

/** @param {Player} player @param {number} i */
async function deleteSlot(player, i) {
  const meta = metaOf(player);
  const s = meta.slots[String(i)];
  if (!s) return;
  const res = await ctx.show(player, new MessageFormData().title("Delete the copy").body(`Delete ${slotLabel(s)}?`).button1("Delete").button2("Keep it"));
  if (!res || res.canceled || res.selection !== 0 || !player.isValid) return;
  try {
    world.structureManager.delete(structId(player, i));
  } catch {
    // already gone
  }
  contents.delete(structId(player, i));
  const m = metaOf(player);
  delete m.slots[String(i)];
  if (m.act === i) m.act = 0;
  saveMeta(player, m);
  player.sendMessage(`§7Deleted ${s.n}.`);
}
