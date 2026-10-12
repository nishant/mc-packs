// Undo and redo for Easy Building: builds, pastes, cuts and destroy mode.
// Each player's history is kept in memory, and the smaller steps are also saved on the player
// (dynamic properties `build:undo` and `build:h<id>_<part>`), so undo and redo survive a restart.
import { BlockPermutation, Player, world } from "@minecraft/server";
import { get } from "./settings.js";

/**
 * One changed block: what was there before and after, and the item it cost (refunded by undo).
 * @typedef {{ x: number, y: number, z: number, before: BlockPermutation, after: BlockPermutation, cost?: string }} Placed
 * @typedef {"build" | "paste" | "cut" | "destroy"} Kind
 * @typedef {object} BuildRecord
 * @property {string} dim
 * @property {string} label
 * @property {Placed[]} cells
 * @property {Kind} [kind]
 * @property {boolean} [inv] going back costs items and going forward gives them back (destroy mode in survival)
 * @property {string} [cut] a survival cut: the clipboard may paste it once for free
 * @property {string} [free] a paste that used the free paste of this cut
 * @property {number} [slot] clipboard slot of a paste or cut
 * @property {number} [sid] where it is saved (0 or missing: memory only)
 * @property {number} [len] how many characters its saved copy takes
 * @typedef {{ undo: BuildRecord[], redo: BuildRecord[], loaded: boolean }} History
 */

const INDEX_PROP = "build:undo"; // player: JSON { u: sid[], r: sid[], n: next sid } (0 = a memory-only step)
const PART = 30000; // characters per dynamic property (the limit is 32767)
const MAX_SAVED_CHARS = 400000; // most characters of history saved per player
const MAX_SAVED_STEPS = 10;

/** @type {import("./main.js").Ctx} */
let ctx;
/** @param {import("./main.js").Ctx} c */
export function setupUndo(c) {
  ctx = c;
}

/**
 * Clipboard hooks: `check` may refuse a step (a cut already pasted for free), `done` runs after one.
 * @type {{ check?: (player: Player, rec: BuildRecord, redo: boolean) => string | undefined, done?: (player: Player, rec: BuildRecord, redo: boolean) => void }}
 */
export const stepHooks = {};

/** @type {Map<string, History>} */
const histories = new Map();

/** @param {Player} player @returns {History} */
function historyOf(player) {
  let h = histories.get(player.id);
  if (!h) histories.set(player.id, (h = { undo: [], redo: [], loaded: false }));
  if (!h.loaded) {
    h.loaded = true;
    try {
      load(player, h);
    } catch (e) {
      console.warn(`[build] undo load: ${e}`);
    }
  }
  return h;
}

/** The label of the step undo (or redo) would take back, or undefined. @param {Player} player @param {boolean} redo */
export function lastLabel(player, redo) {
  const h = historyOf(player);
  const list = redo ? h.redo : h.undo;
  return list[list.length - 1]?.label;
}

/** @param {Player} player @param {(rec: BuildRecord) => boolean} fn */
export function anyRecord(player, fn) {
  const h = historyOf(player);
  return h.undo.some(fn) || h.redo.some(fn);
}

/**
 * Remembers a step for undo. A new step clears redo (unless it is a redo itself).
 * @param {Player} player @param {BuildRecord} rec @param {boolean} [keepRedo]
 */
export function remember(player, rec, keepRedo = false) {
  const h = historyOf(player);
  h.undo.push(rec);
  while (h.undo.length > Math.max(1, get("undoSteps"))) h.undo.shift();
  if (!keepRedo) h.redo = [];
  save(player, h);
}

/** @param {Player} player @param {History} h @param {BuildRecord} rec */
function pushRedo(player, h, rec) {
  h.redo.push(rec);
  while (h.redo.length > Math.max(1, get("undoSteps"))) h.redo.shift();
  save(player, h);
}

/**
 * Undoes (or redoes) the player's last step.
 * A step that puts blocks back for free (undo of a build, paste or cut; redo of destroy mode in survival) gives back what it cost.
 * A step that places blocks again (redo of a build; undo of destroy mode in survival) goes through build(): claims, costs, partial builds.
 * @param {Player} player @param {boolean} redo
 */
export async function undo(player, redo) {
  const s = ctx.stateOf(player);
  if (s.busy) return player.sendMessage("§eWait for the build to finish.");
  if (ctx.cantBuild(player)) return player.sendMessage(ctx.CANT_BUILD);
  const h = historyOf(player);
  const list = redo ? h.redo : h.undo;
  const rec = list[list.length - 1];
  if (!rec) return player.sendMessage(redo ? "§eNothing to redo." : "§eNothing to undo.");
  const why = stepHooks.check?.(player, rec, redo);
  if (why) return player.sendMessage(`§e${why}`);
  list.pop();
  delete rec.sid; // its saved copy is removed now; saved again wherever it goes next
  delete rec.len;
  save(player, h);
  let dim;
  try {
    dim = world.getDimension(rec.dim);
  } catch {
    return player.sendMessage("§eThat step was in a dimension that isn't there any more.");
  }
  // A cut takes blocks away without drops and puts them back for free: neither way costs or gives items.
  const charge = rec.kind !== "cut" && redo !== !!rec.inv;
  if (charge) {
    /** @type {Placed[]} */
    let placed = [];
    const cells = rec.cells.map((c) =>
      redo ? { x: c.x, y: c.y, z: c.z, perm: c.after, expect: c.before.type.id } : { x: c.x, y: c.y, z: c.z, perm: c.before, expect: c.after.type.id }
    );
    const ok = await ctx.build(player, dim, cells, rec.label, { mode: "air", redo: true, done: (p) => (placed = p) });
    if (!ok) {
      list.push(rec);
      save(player, h);
      return;
    }
    // A redone free paste was paid for this time: undoing it must not make it free again.
    const { free: _free, ...paid } = rec;
    if (redo) remember(player, { ...paid, cells: placed }, true);
    else pushRedo(player, h, { ...rec, cells: placed.map((c) => ({ x: c.x, y: c.y, z: c.z, before: c.after, after: c.before, cost: c.cost })) });
    stepHooks.done?.(player, rec, redo);
    if (!redo && player.isValid) ctx.note(player, `§aUndone: ${rec.label}§7 (${ctx.plural(placed.length, "block")} put back)`);
    return;
  }
  const pid = player.id;
  s.busy = true;
  try {
    const perTick = Math.max(10, get("blocksPerTick"));
    /** @type {Map<string, number>} */
    const owed = new Map();
    let back = 0, gone = 0, far = 0;
    // Undo goes backwards (what hangs on a block comes back after it); redo goes in the step's own order
    // (a cut takes torches and ladders before what they hang on, so nothing pops off as an item).
    const len = rec.cells.length;
    for (let n = 0; n < len; n++) {
      if (n && n % perTick === 0) await ctx.tick();
      const c = rec.cells[redo ? n : len - 1 - n];
      const from = redo ? c.before : c.after, to = redo ? c.after : c.before;
      let block;
      try {
        block = dim.getBlock(c);
      } catch {
        block = undefined;
      }
      if (!block) {
        far++;
        continue;
      }
      if (block.typeId !== from.type.id || holdsItems(block)) {
        gone++;
        continue;
      }
      try {
        block.setPermutation(to);
      } catch {
        gone++;
        continue;
      }
      back++;
      if (c.cost) owed.set(c.cost, (owed.get(c.cost) ?? 0) + 1);
    }
    ctx.refund(player, pid, owed);
    if (!back && far) {
      // Nothing there is loaded (another dimension, too far away): keep the step for later.
      list.push(rec);
      save(player, h);
      if (player.isValid) player.sendMessage(`§eThose blocks are too far away to ${redo ? "redo" : "undo"} from here. Go back closer and try again.`);
      return;
    }
    if (back) {
      if (redo) remember(player, rec, true);
      else pushRedo(player, h, rec);
      stepHooks.done?.(player, rec, redo);
    }
    if (!player.isValid) return;
    const given = [...owed.values()].reduce((a, b) => a + b, 0);
    ctx.note(player, `§a${redo ? "Redone" : "Undone"}: ${rec.label}§7 (${ctx.plural(back, "block")}${given ? `, ${given} given back` : ""})`);
    if (gone) player.sendMessage(`§7${ctx.plural(gone, "block")} had changed since and stayed as they are.`);
    if (far) player.sendMessage(`§7${ctx.plural(far, "block")} too far away stayed as they are.`);
  } finally {
    s.busy = false;
  }
}

/** Does this block hold items (a chest or barrel someone filled since)? Undo never takes it away. @param {import("@minecraft/server").Block} block */
function holdsItems(block) {
  try {
    const c = block.getComponent("minecraft:inventory")?.container;
    return !!c && c.emptySlotsCount < c.size;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Saving: steps of up to `undoSaveBlocks` blocks, the newest `undoSaveSteps` of each list
// ---------------------------------------------------------------------------

/**
 * One step as text. Cells are sorted bottom first by their index in the step's box, and written as
 * runs: "<gap>.<kind>[*<count>]" where gap is how many indexes were skipped (base 36), kind indexes
 * T (before, after, cost) and count repeats it on the next indexes.
 * @param {BuildRecord} rec
 */
function encode(rec) {
  /** @type {Map<string, number>} */
  const permIx = new Map();
  /** @type {(string | Record<string, string | number | boolean>)[][]} */
  const P = [];
  /** @param {BlockPermutation} perm */
  const pi = (perm) => {
    const states = perm.getAllStates();
    const has = Object.keys(states).length > 0;
    const key = has ? `${perm.type.id}${JSON.stringify(states)}` : perm.type.id;
    let i = permIx.get(key);
    if (i === undefined) {
      i = P.length;
      permIx.set(key, i);
      P.push(has ? [perm.type.id, states] : [perm.type.id]);
    }
    return i;
  };
  /** @type {string[]} */
  const C = [];
  /** @type {Map<string, number>} */
  const tripleIx = new Map();
  /** @type {number[][]} */
  const T = [];
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const c of rec.cells) {
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.z < minZ) minZ = c.z;
    if (c.x > maxX) maxX = c.x;
    if (c.z > maxZ) maxZ = c.z;
  }
  const W = maxX - minX + 1, D = maxZ - minZ + 1;
  /** @type {[number, number][]} index, triple */
  const list = [];
  for (const c of rec.cells) {
    let ci = 0;
    if (c.cost) {
      ci = C.indexOf(c.cost) + 1;
      if (!ci) ci = C.push(c.cost);
    }
    const t = [pi(c.before), pi(c.after), ci];
    const tk = t.join();
    let ti = tripleIx.get(tk);
    if (ti === undefined) {
      ti = T.length;
      tripleIx.set(tk, ti);
      T.push(t);
    }
    list.push([((c.y - minY) * W + (c.x - minX)) * D + (c.z - minZ), ti]);
  }
  list.sort((a, b) => a[0] - b[0]);
  /** @type {string[]} */
  const runs = [];
  let prev = -1;
  for (let i = 0; i < list.length; ) {
    const [ix, t] = list[i];
    if (ix === prev) {
      i++;
      continue; // the same spot twice: keep the first
    }
    let n = 1;
    while (i + n < list.length && list[i + n][0] === ix + n && list[i + n][1] === t) n++;
    runs.push(`${(ix - prev - 1).toString(36)}.${t.toString(36)}${n > 1 ? `*${n.toString(36)}` : ""}`);
    prev = ix + n - 1;
    i += n;
  }
  return JSON.stringify({
    k: rec.kind, l: rec.label, d: rec.dim, i: rec.inv ? 1 : 0, c: rec.cut, f: rec.free, s: rec.slot,
    o: [minX, minY, minZ, W, D], P, C, T, z: runs.join(","),
  });
}

/** @param {string} text @returns {BuildRecord | undefined} */
function decode(text) {
  const o = JSON.parse(text);
  /** @type {(BlockPermutation | undefined)[]} */
  const perms = o.P.map((/** @type {any[]} */ p) => {
    try {
      return BlockPermutation.resolve(p[0], p[1]);
    } catch {
      return undefined;
    }
  });
  const [minX, minY, minZ, W, D] = o.o;
  /** @type {Placed[]} */
  const cells = [];
  let ix = -1;
  for (const run of String(o.z).split(",")) {
    if (!run) continue;
    const m = /^([0-9a-z]+)\.([0-9a-z]+)(?:\*([0-9a-z]+))?$/.exec(run);
    if (!m) return undefined;
    ix += parseInt(m[1], 36) + 1;
    const t = o.T[parseInt(m[2], 36)];
    const n = m[3] ? parseInt(m[3], 36) : 1;
    const before = perms[t[0]], after = perms[t[1]];
    const cost = t[2] ? o.C[t[2] - 1] : undefined;
    for (let k = 0; k < n; k++, ix++) {
      if (!before || !after) continue;
      const z = ix % D, rest = (ix - z) / D, x = rest % W, y = (rest - x) / W;
      /** @type {Placed} */
      const c = { x: minX + x, y: minY + y, z: minZ + z, before, after };
      if (cost) c.cost = cost;
      cells.push(c);
    }
    ix--;
  }
  /** @type {BuildRecord} */
  const rec = { dim: o.d, label: o.l, cells, kind: o.k };
  if (o.i) rec.inv = true;
  if (o.c) rec.cut = o.c;
  if (o.f) rec.free = o.f;
  if (typeof o.s === "number") rec.slot = o.s;
  return rec;
}

/** @param {Player} player @param {number} sid @returns {string | undefined} */
function readText(player, sid) {
  let text = "";
  for (let i = 0; ; i++) {
    const part = player.getDynamicProperty(`build:h${sid}_${i}`);
    if (typeof part !== "string") break;
    text += part;
  }
  return text || undefined;
}

/** @param {Player} player @param {History} h */
function load(player, h) {
  const raw = player.getDynamicProperty(INDEX_PROP);
  if (typeof raw !== "string") return;
  const index = JSON.parse(raw);
  /** @param {unknown} sids */
  const read = (sids) => {
    /** @type {BuildRecord[]} */
    const out = [];
    for (const sid of Array.isArray(sids) ? sids : []) {
      // A step that was only in memory is gone: the ones before it can't be undone in order any more.
      if (!sid) {
        out.length = 0;
        continue;
      }
      try {
        const text = readText(player, Number(sid));
        const rec = text ? decode(text) : undefined;
        if (rec) out.push({ ...rec, sid: Number(sid), len: text?.length ?? 0 });
      } catch (e) {
        console.warn(`[build] undo step ${sid}: ${e}`);
      }
    }
    return out;
  };
  h.undo = read(index.u);
  h.redo = read(index.r);
}

/** @param {Player} player @param {History} h */
function save(player, h) {
  if (!player.isValid) return;
  try {
    const raw = player.getDynamicProperty(INDEX_PROP);
    let next = 1;
    try {
      next = Math.max(1, Number(JSON.parse(String(raw)).n) || 1);
    } catch {
      next = 1;
    }
    const maxCells = Math.max(0, get("undoSaveBlocks"));
    const maxSteps = Math.max(0, Math.min(MAX_SAVED_STEPS, get("undoSaveSteps")));
    let chars = 0;
    /** @param {BuildRecord[]} list */
    const keep = (list) =>
      list.map((rec, i) => {
        if (i >= maxSteps || rec.cells.length > maxCells || !rec.cells.length) return 0;
        // Steps saved earlier count toward the budget too, so all saved steps together stay under it.
        if (rec.sid && rec.len !== undefined) {
          if (chars + rec.len > MAX_SAVED_CHARS) return 0;
          chars += rec.len;
          return rec.sid;
        }
        const text = encode(rec);
        if (chars + text.length > MAX_SAVED_CHARS) return 0;
        chars += text.length;
        rec.len = text.length;
        const sid = next++;
        let p = 0;
        for (; p * PART < text.length; p++) player.setDynamicProperty(`build:h${sid}_${p}`, text.slice(p * PART, (p + 1) * PART));
        for (; player.getDynamicProperty(`build:h${sid}_${p}`) !== undefined; p++) player.setDynamicProperty(`build:h${sid}_${p}`, undefined);
        rec.sid = sid;
        return sid;
      });
    // Newest first, so the size budget goes to the steps undo reaches first.
    const u = keep([...h.undo].reverse()).reverse();
    const r = keep([...h.redo].reverse()).reverse();
    h.undo.forEach((rec, i) => !u[i] && (delete rec.sid, delete rec.len));
    h.redo.forEach((rec, i) => !r[i] && (delete rec.sid, delete rec.len));
    const live = new Set([...u, ...r].filter(Boolean).map(String));
    for (const id of player.getDynamicPropertyIds()) {
      const m = /^build:h(\d+)_\d+$/.exec(id);
      if (m && !live.has(m[1])) player.setDynamicProperty(id, undefined);
    }
    player.setDynamicProperty(INDEX_PROP, u.length || r.length ? JSON.stringify({ u, r, n: next }) : undefined);
  } catch (e) {
    console.warn(`[build] undo save: ${e}`);
  }
}
