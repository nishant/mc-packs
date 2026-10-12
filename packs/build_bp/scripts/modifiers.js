// Modifiers: copies of every build (and, if a player wants, of blocks placed and broken by hand) mirrored on
// the X, Y and/or Z axis around a center, turned around it in N slices (radial), and repeated in a row (array).
// They work on world positions, after the shape is laid out, so they apply to every shape the same way.
// Order: array first, then mirrors, then radial; copies that land on the same spot count once (the first wins).
import { BlockPermutation } from "@minecraft/server";

/**
 * @typedef {object} Mods
 * @property {boolean} mirrorX mirror east-west (the copy is on the other side of a north-south plane)
 * @property {boolean} mirrorY mirror up-down
 * @property {boolean} mirrorZ mirror north-south
 * @property {boolean} half the mirror plane runs between blocks (on the center block's east, top or south side) instead of through it
 * @property {number} radius 0 = no limit; else only blocks within this many blocks of the center get copies
 * @property {boolean} radial
 * @property {number} slices 2..16
 * @property {boolean} alt every other slice mirrored
 * @property {boolean} array
 * @property {number} ax @property {number} ay @property {number} az offset between array copies
 * @property {number} count array copies (1..16) besides the original
 * @property {{ dim: string, x: number, y: number, z: number } | null} center null: the block the build starts at
 */

/** @type {Mods} */
export const DEFAULT_MODS = {
  mirrorX: false,
  mirrorY: false,
  mirrorZ: false,
  half: false,
  radius: 0,
  radial: false,
  slices: 4,
  alt: false,
  array: false,
  ax: 0,
  ay: 1,
  az: 0,
  count: 2,
  center: null,
};

/** @param {unknown} n @param {number} lo @param {number} hi @param {number} def */
const clampInt = (n, lo, hi, def) => (typeof n === "number" && Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : def);

/** A saved value made safe. @param {any} m @returns {Mods} */
export function normalizeMods(m) {
  const o = m && typeof m === "object" ? m : {};
  const c = o.center;
  const center =
    c && typeof c === "object" && typeof c.dim === "string" && [c.x, c.y, c.z].every((n) => typeof n === "number" && Number.isFinite(n))
      ? { dim: c.dim, x: Math.floor(c.x), y: Math.floor(c.y), z: Math.floor(c.z) }
      : null;
  return {
    mirrorX: o.mirrorX === true,
    mirrorY: o.mirrorY === true,
    mirrorZ: o.mirrorZ === true,
    half: o.half === true,
    radius: clampInt(o.radius, 0, 256, 0),
    radial: o.radial === true,
    slices: clampInt(o.slices, 2, 16, 4),
    alt: o.alt === true,
    array: o.array === true,
    ax: clampInt(o.ax, -64, 64, 0),
    ay: clampInt(o.ay, -64, 64, 1),
    az: clampInt(o.az, -64, 64, 0),
    count: clampInt(o.count, 1, 16, 2),
    center,
  };
}

/** Is any modifier on? @param {Mods} m */
export const modsOn = (m) => m.mirrorX || m.mirrorY || m.mirrorZ || m.radial || (m.array && (m.ax || m.ay || m.az) !== 0);
/** Does it need a center (mirror or radial)? @param {Mods} m */
export const needsCenter = (m) => m.mirrorX || m.mirrorY || m.mirrorZ || m.radial;

/** "Mirror X Z, radial 6, array 3 x (0 1 0)" @param {Mods} m */
export function modsLabel(m) {
  const parts = [];
  const axes = [m.mirrorX ? "X" : "", m.mirrorY ? "Y" : "", m.mirrorZ ? "Z" : ""].filter(Boolean).join(" ");
  if (axes) parts.push(`mirror ${axes}`);
  if (m.radial) parts.push(`radial ${m.slices}${m.alt ? " alternating" : ""}`);
  if (m.array && (m.ax || m.ay || m.az)) parts.push(`array ${m.count} x (${m.ax} ${m.ay} ${m.az})`);
  return parts.length ? parts.join(", ") : "none";
}

// ---------------------------------------------------------------------------
// Block states: turning and mirroring a block (stairs, logs, doors, signs, ladders...)
// ---------------------------------------------------------------------------

/** [x, z] of a horizontal direction name. @type {Record<string, number[]>} */
const VEC = { east: [1, 0], west: [-1, 0], south: [0, 1], north: [0, -1] };
/** @param {number[]} v */
const nameOf = (v) => (v[0] > 0 ? "east" : v[0] < 0 ? "west" : v[1] > 0 ? "south" : "north");
const WEIRDO = ["east", "west", "south", "north"]; // stairs weirdo_direction, trapdoor direction
const DIRECTION = ["south", "west", "north", "east"]; // direction 0..3 (beds, repeaters, gates of old...)
const FACING6 = ["down", "up", "north", "south", "west", "east"]; // facing_direction 0..5
const CORAL4 = ["west", "east", "north", "south"]; // coral_direction (wall fans)
const BITS4 = ["south", "west", "north", "east"]; // vine_direction_bits, and multi_face_direction_bits from bit 2
/** rail_direction: straight and curved rails by the two sides they join, sloped ones by the side they rise to. */
const RAILS = [["north", "south"], ["east", "west"], ["east"], ["west"], ["north"], ["south"], ["south", "east"], ["south", "west"], ["north", "west"], ["north", "east"]];
/** Wall and connection sides: the state's name says the side. */
const SIDE_KEY = /^(wall_connection_type_|minecraft:connection_|pale_moss_carpet_side_)(north|south|east|west)$/;

/**
 * How a copy is changed: mirrored on x, z and/or y, then turned `turns` quarter turns
 * (each one takes east to south, the way positions turn: x' = -z, z' = x).
 * @typedef {{ mx?: boolean, mz?: boolean, my?: boolean, turns?: number }} Change
 */

/** @param {number[]} v @param {Change} t */
function changeVec(v, t) {
  let x = t.mx ? -v[0] : v[0], z = t.mz ? -v[1] : v[1];
  for (let i = 0; i < (((t.turns ?? 0) % 4) + 4) % 4; i++) [x, z] = [-z, x];
  return [x, z];
}
/** @param {string} name @param {Change} t */
const changeName = (name, t) => (VEC[name] ? nameOf(changeVec(VEC[name], t)) : name);
/** A direction that may also be up or down. @param {string} name @param {Change} t */
const changeName6 = (name, t) => (t.my && (name === "up" || name === "down") ? (name === "up" ? "down" : "up") : changeName(name, t));
/** Direction bits (4 from `shift`, in BITS4 order; below them down and up when shift is 2). @param {number} v @param {Change} t @param {number} shift */
function changeBits(v, t, shift) {
  let out = v & ~(((1 << 4) - 1) << shift);
  if (shift === 2 && t.my) out = (out & ~3) | ((v & 1) << 1) | ((v >> 1) & 1);
  BITS4.forEach((d, i) => {
    if (v & (1 << (shift + i))) out |= 1 << (shift + BITS4.indexOf(changeName(d, t)));
  });
  return out;
}

/** @type {Map<string, BlockPermutation>} */
const changed = new Map();

/**
 * The block as it should be in a mirrored or turned copy.
 * @param {BlockPermutation} perm @param {Change} t @returns {BlockPermutation}
 */
export function changePerm(perm, t) {
  if (!t.mx && !t.mz && !t.my && !((t.turns ?? 0) % 4)) return perm;
  const states = perm.getAllStates();
  if (!Object.keys(states).length) return perm;
  const key = `${perm.type.id}|${JSON.stringify(states)}|${t.mx ? 1 : 0}${t.mz ? 1 : 0}${t.my ? 1 : 0}${(((t.turns ?? 0) % 4) + 4) % 4}`;
  const hit = changed.get(key);
  if (hit) return hit;
  /** @type {Record<string, string | number | boolean>} */
  const next = { ...states };
  const id = perm.type.id;
  for (const [k, v] of Object.entries(states)) {
    const side = SIDE_KEY.exec(k);
    if (side) next[side[1] + changeName(side[2], t)] = v;
    else if (k === "weirdo_direction" && typeof v === "number") next[k] = WEIRDO.indexOf(changeName(WEIRDO[v] ?? "east", t));
    else if (k === "torch_facing_direction" && typeof v === "string") next[k] = changeName(v, t);
    else if (k === "coral_direction" && typeof v === "number") next[k] = CORAL4.indexOf(changeName(CORAL4[v] ?? "west", t));
    else if (k === "rail_direction" && typeof v === "number" && RAILS[v]) {
      const turned = RAILS[v].map((d) => changeName(d, t));
      const i = RAILS.findIndex((r) => r.length === turned.length && turned.every((d) => r.includes(d)));
      if (i >= 0) next[k] = i;
    } else if (k === "door_hinge_bit" && typeof v === "boolean" && !!t.mx !== !!t.mz) next[k] = !v; // one mirror swaps the hinge side
    else if (k === "vine_direction_bits" && typeof v === "number") next[k] = changeBits(v, t, 0);
    else if (k === "multi_face_direction_bits" && typeof v === "number") next[k] = changeBits(v, t, 2);
    else if (k === "lever_direction" && typeof v === "string") {
      // "north", "up_east_west", "down_north_south"...: each word changed, pairs in their usual order
      next[k] = v
        .split("_")
        .map((w) => changeName6(w, t))
        .join("_")
        .replace("south_north", "north_south")
        .replace("west_east", "east_west");
    }
    else if (k === "direction" && typeof v === "number") {
      const table = id.includes("trapdoor") ? WEIRDO : DIRECTION;
      next[k] = table.indexOf(changeName(table[v] ?? table[0], t));
    } else if ((k === "minecraft:cardinal_direction" || k === "minecraft:facing_direction" || k === "minecraft:block_face") && typeof v === "string") {
      next[k] = t.my && (v === "up" || v === "down") ? (v === "up" ? "down" : "up") : changeName(v, t);
    } else if (k === "facing_direction" && typeof v === "number") {
      const name = FACING6[v] ?? "north";
      next[k] = FACING6.indexOf(t.my && (name === "up" || name === "down") ? (name === "up" ? "down" : "up") : changeName(name, t));
    } else if (k === "pillar_axis" && typeof v === "string" && (t.turns ?? 0) % 2 !== 0 && v !== "y") next[k] = v === "x" ? "z" : "x";
    else if ((k === "ground_sign_direction" || k === "minecraft:sixteen_way_rotation") && typeof v === "number") {
      // 0..15, 0 = south, counting clockwise seen from above (west is 4)
      let a = v;
      if (t.mx) a = (16 - a) % 16;
      if (t.mz) a = (24 - a) % 16;
      a = (a + 4 * ((((t.turns ?? 0) % 4) + 4) % 4)) % 16;
      next[k] = a;
    } else if (t.my && k === "upside_down_bit" && typeof v === "boolean") next[k] = !v;
    else if (t.my && k === "top_slot_bit" && typeof v === "boolean") next[k] = !v;
    else if (t.my && k === "minecraft:vertical_half" && typeof v === "string") next[k] = v === "top" ? "bottom" : "top";
    else if (t.my && k === "hanging" && typeof v === "boolean" && id.includes("lantern")) next[k] = !v;
  }
  let out = perm;
  try {
    out = BlockPermutation.resolve(id, next);
  } catch {
    out = perm;
  }
  changed.set(key, out);
  return out;
}

// ---------------------------------------------------------------------------
// Copies
// ---------------------------------------------------------------------------

/**
 * @template {{ x: number, y: number, z: number, perm?: BlockPermutation }} C
 * @param {C[]} cells
 * @param {Mods} m
 * @param {{ x: number, y: number, z: number }} center
 * @param {number} [cap] stop once there are more than this many (the caller refuses the build)
 * @returns {C[]} the cells and their copies, each spot once
 */
export function applyMods(cells, m, center, cap = Infinity) {
  const job = applyModsJob(cells, m, center, cap);
  let r = job.next();
  while (!r.done) r = job.next();
  return r.value;
}

/**
 * applyMods as a generator for system.runJob, pausing every few thousand blocks.
 * @template {{ x: number, y: number, z: number, perm?: BlockPermutation }} C
 * @param {C[]} cells @param {Mods} m @param {{ x: number, y: number, z: number }} center @param {number} [cap]
 * @returns {Generator<void, C[], void>}
 */
export function* applyModsJob(cells, m, center, cap = Infinity) {
  if (!modsOn(m)) return cells;
  let work = 0;
  /** @type {Map<string, C>} */
  const out = new Map();
  /** @param {C} c */
  const add = (c) => {
    const k = `${c.x},${c.y},${c.z}`;
    if (!out.has(k)) out.set(k, c);
    if (out.size > cap) throw new RangeError(String(out.size));
  };
  /** Copies of copies grow fast: give up early on a list far past the cap. @param {C[]} l @param {number} [factor] what the next step multiplies it by */
  const guard = (l, factor = 1) => {
    if (l.length * factor > cap * 4 + 4096) throw new RangeError(String(l.length * factor));
    return l;
  };
  /** @param {C} c @param {number} x @param {number} y @param {number} z @param {Change} t */
  const copy = (c, x, y, z, t) => /** @type {C} */ ({ ...c, x, y, z, ...(c.perm ? { perm: changePerm(c.perm, t) } : {}) });

  // 1. Array
  let list = cells;
  if (m.array && (m.ax || m.ay || m.az)) {
    /** @type {C[]} */
    const next = [];
    guard(cells, m.count + 1);
    for (let i = 0; i <= m.count; i++)
      for (const c of cells) {
        next.push(i ? copy(c, c.x + m.ax * i, c.y + m.ay * i, c.z + m.az * i, {}) : c);
        if (++work % 2048 === 0) yield;
      }
    list = guard(next);
  }
  const r = m.radius;
  /** @param {C} c */
  const near = (c) => !r || (Math.abs(c.x - center.x) <= r && Math.abs(c.y - center.y) <= r && Math.abs(c.z - center.z) <= r);
  // Mirror planes: through the center block (2c - p), or on its far side (2c + 1 - p).
  const h = m.half ? 1 : 0;

  // 2. Mirrors
  if (m.mirrorX || m.mirrorY || m.mirrorZ) {
    /** @type {C[]} */
    const next = [];
    guard(list, (m.mirrorX ? 2 : 1) * (m.mirrorY ? 2 : 1) * (m.mirrorZ ? 2 : 1));
    for (const c of list) {
      next.push(c);
      if (++work % 1024 === 0) yield;
      if (!near(c)) continue;
      for (let mask = 1; mask < 8; mask++) {
        const mx = !!(mask & 1), my = !!(mask & 2), mz = !!(mask & 4);
        if ((mx && !m.mirrorX) || (my && !m.mirrorY) || (mz && !m.mirrorZ)) continue;
        next.push(copy(c, mx ? 2 * center.x + h - c.x : c.x, my ? 2 * center.y + h - c.y : c.y, mz ? 2 * center.z + h - c.z : c.z, { mx, my, mz }));
      }
    }
    list = guard(next);
  }

  // 3. Radial: turned around the vertical axis through the center (the middle of the center block,
  // or its south-east corner with `half`), in `slices` equal steps.
  if (m.radial) {
    const ox = center.x + (m.half ? 1 : 0.5), oz = center.z + (m.half ? 1 : 0.5);
    /** @type {C[]} */
    const next = [];
    guard(list, m.slices);
    for (const c of list) {
      next.push(c);
      if (++work % 512 === 0) yield;
      if (!near(c)) continue;
      for (let k = 1; k < m.slices; k++) {
        const flip = m.alt && k % 2 === 1;
        // Cell middle relative to the axis; an alternating slice is mirrored across the axis's x plane first.
        let px = c.x + 0.5 - ox;
        const pz = c.z + 0.5 - oz;
        if (flip) px = -px;
        const a = (2 * Math.PI * k) / m.slices;
        const cos = Math.cos(a), sin = Math.sin(a);
        const x = Math.floor(ox + px * cos - pz * sin), z = Math.floor(oz + px * sin + pz * cos);
        next.push(copy(c, x, c.y, z, { mx: flip, turns: Math.round((k * 4) / m.slices) % 4 }));
      }
    }
    list = guard(next);
  }
  for (const c of list) {
    add(c);
    if (++work % 4096 === 0) yield;
  }
  return [...out.values()];
}

/**
 * For guides: the copies a player's modifiers make of one block face, worked out without laying out the whole
 * build again (the same steps as applyMods, on one face at a time). A face is [x, y, z, axis, side]
 * (axis 0 x, 1 y, 2 z; -1 for a plain block). Copies that land on each other aren't merged here.
 * @param {Mods} m @param {{ x: number, y: number, z: number }} center
 * @returns {{ copies: number, of: (f: number[]) => number[][] }} copies: at most how many each face gets (itself included)
 */
export function faceCopies(m, center) {
  /** @type {((f: number[]) => number[][])[]} */
  const stages = [];
  let copies = 1;
  const r = m.radius;
  /** @param {number[]} f */
  const near = (f) => !r || (Math.abs(f[0] - center.x) <= r && Math.abs(f[1] - center.y) <= r && Math.abs(f[2] - center.z) <= r);
  if (m.array && (m.ax || m.ay || m.az)) {
    copies *= m.count + 1;
    stages.push((f) => {
      const out = [];
      for (let i = 0; i <= m.count; i++) out.push([f[0] + m.ax * i, f[1] + m.ay * i, f[2] + m.az * i, f[3], f[4]]);
      return out;
    });
  }
  const h = m.half ? 1 : 0;
  if (m.mirrorX || m.mirrorY || m.mirrorZ) {
    copies *= (m.mirrorX ? 2 : 1) * (m.mirrorY ? 2 : 1) * (m.mirrorZ ? 2 : 1);
    stages.push((f) => {
      const out = [f];
      if (!near(f)) return out;
      for (let mask = 1; mask < 8; mask++) {
        const flip = [!!(mask & 1), !!(mask & 2), !!(mask & 4)];
        if ((flip[0] && !m.mirrorX) || (flip[1] && !m.mirrorY) || (flip[2] && !m.mirrorZ)) continue;
        const c = [center.x, center.y, center.z];
        const g = [0, 1, 2].map((a) => (flip[a] ? 2 * c[a] + h - f[a] : f[a]));
        out.push([g[0], g[1], g[2], f[3], f[3] >= 0 && flip[f[3]] ? -f[4] : f[4]]);
      }
      return out;
    });
  }
  if (m.radial) {
    copies *= m.slices;
    const ox = center.x + (m.half ? 1 : 0.5), oz = center.z + (m.half ? 1 : 0.5);
    stages.push((f) => {
      const out = [f];
      if (!near(f)) return out;
      for (let k = 1; k < m.slices; k++) {
        const flip = m.alt && k % 2 === 1;
        let px = f[0] + 0.5 - ox;
        const pz = f[2] + 0.5 - oz;
        if (flip) px = -px;
        const a = (2 * Math.PI * k) / m.slices;
        const cos = Math.cos(a), sin = Math.sin(a);
        const x = Math.floor(ox + px * cos - pz * sin), z = Math.floor(oz + px * sin + pz * cos);
        let axis = f[3], side = f[4];
        if (axis === 0 || axis === 2) {
          // The face's outward direction, turned the same way and snapped to x or z.
          let nx = axis === 0 ? side : 0;
          const nz = axis === 2 ? side : 0;
          if (flip) nx = -nx;
          const rx = nx * cos - nz * sin, rz = nx * sin + nz * cos;
          if (Math.abs(rx) >= Math.abs(rz)) [axis, side] = [0, rx > 0 ? 1 : -1];
          else [axis, side] = [2, rz > 0 ? 1 : -1];
        }
        out.push([x, f[1], z, axis, side]);
      }
      return out;
    });
  }
  return {
    copies,
    of: (f) => {
      let list = [f];
      for (const st of stages) list = list.flatMap(st);
      return list;
    },
  };
}
