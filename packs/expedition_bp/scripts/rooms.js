// Room shapes: what turns a room from an empty square into an L, a cross, a round hall, a ring around
// a pillar, a long hall, a hall split by walls, a room with a raised ledge... No game APIs here (like
// layout.js), so the layouts can be checked in Node.
//
// A room is a square of local cells u, v from -r to r (players stand at y 1). A shape is a set of
// "solid" cells (wall from the floor to the ceiling) plus extra parts (low walls, crates, a ledge).
// layout.js picks a shape, places the room's own parts around it, then checks with a walk (bfs) that
// every door, spawn, chest and button can be reached and that the way through is long enough.

/** @typedef {import("./layout.js").Part} Part */
/** @typedef {import("./layout.js").Door} Door */
/** @typedef {import("./layout.js").Face} Face */
/** @typedef {{ name: string, solid: Set<string>, parts: Part[] }} Shape */

/** @param {number} u @param {number} v */
export const key = (u, v) => `${u},${v}`;

/** Local (u, v) on wall face `side`, `a` across it, `d` deep from the center. @param {Face} side @param {number} a @param {number} d */
export function cellOn(side, a, d) {
  if (side === "back") return { u: a, v: -d };
  if (side === "fwd") return { u: a, v: d };
  if (side === "left") return { u: -d, v: a };
  return { u: d, v: a };
}

/** The three cells inside a door (the row by the wall). @param {Door} d @param {number} r */
export function doorCells(d, r) {
  if (d.side === "up" || d.side === "down") return [];
  return [-1, 0, 1].map((k) => cellOn(d.side, (d.a ?? 0) + k, r));
}

/**
 * Walks the floor from the start cells through every cell that isn't blocked: distance and the cell before.
 * @param {number} r @param {Set<string>} blocked @param {{ u: number, v: number }[]} starts
 * @returns {Map<string, { d: number, prev: string | undefined }>}
 */
export function bfs(r, blocked, starts) {
  /** @type {Map<string, { d: number, prev: string | undefined }>} */
  const seen = new Map();
  /** @type {[number, number][]} */
  let front = [];
  for (const s of starts) {
    const k = key(s.u, s.v);
    if (blocked.has(k) || seen.has(k) || Math.abs(s.u) > r || Math.abs(s.v) > r) continue;
    seen.set(k, { d: 0, prev: undefined });
    front.push([s.u, s.v]);
  }
  let d = 0;
  while (front.length) {
    d++;
    /** @type {[number, number][]} */
    const next = [];
    for (const [u, v] of front) {
      for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nu = u + du;
        const nv = v + dv;
        if (Math.abs(nu) > r || Math.abs(nv) > r) continue;
        const k = key(nu, nv);
        if (blocked.has(k) || seen.has(k)) continue;
        seen.set(k, { d, prev: key(u, v) });
        next.push([nu, nv]);
      }
    }
    front = next;
  }
  return seen;
}

/** The cells from the start to `goal` (a key in the walk), start first. @param {ReturnType<typeof bfs>} walk @param {string} goal @returns {[number, number][]} */
export function pathTo(walk, goal) {
  /** @type {[number, number][]} */
  const out = [];
  let k = /** @type {string | undefined} */ (goal);
  while (k) {
    const [u, v] = k.split(",").map(Number);
    out.unshift([u, v]);
    k = walk.get(k)?.prev;
  }
  return out;
}

/** @param {() => number} r @param {number} lo @param {number} hi */
const randInt = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
/** @param {() => number} r */
const sign = (r) => (r() < 0.5 ? -1 : 1);

/**
 * Cells for which `test` holds, inside the room.
 * @param {number} R @param {(u: number, v: number) => boolean} test
 */
function cells(R, test) {
  const out = new Set();
  for (let u = -R; u <= R; u++) for (let v = -R; v <= R; v++) if (test(u, v)) out.add(key(u, v));
  return out;
}

/**
 * The shapes. Each takes the room's half width R, its height h and a random source, and returns
 * solid cells and extra parts. Shapes that need the walls (balconies) are only used in low rooms.
 * @type {Record<string, (R: number, h: number, r: () => number, trap: boolean) => Shape>}
 */
export const SHAPES = {
  /** One corner filled in: an L. */
  L(R, h, r) {
    const su = sign(r);
    const sv = sign(r);
    const cu = randInt(r, 0, 2);
    const cv = randInt(r, 0, 2);
    return { name: "L", solid: cells(R, (u, v) => u * su >= cu && v * sv >= cv), parts: [] };
  },
  /** Two corners on one side filled in: a T. */
  T(R, h, r) {
    const sv = sign(r);
    const cv = randInt(r, -1, 1);
    const w = randInt(r, 2, 3);
    const swap = r() < 0.5;
    return { name: "T", solid: cells(R, (u, v) => (swap ? u * sv >= cv && Math.abs(v) > w : v * sv >= cv && Math.abs(u) > w)), parts: [] };
  },
  /** All four corners filled in: a plus. */
  cross(R, h, r) {
    const w = randInt(r, 2, 3) + (R >= 9 ? 1 : 0);
    return { name: "cross", solid: cells(R, (u, v) => Math.abs(u) > w && Math.abs(v) > w), parts: [] };
  },
  /** Corners cut off diagonally. */
  octagon(R, h, r) {
    const c = randInt(r, 3, R - 2);
    return { name: "octagon", solid: cells(R, (u, v) => R - Math.abs(u) + (R - Math.abs(v)) < c), parts: [] };
  },
  /** Round. */
  circle(R, h, r) {
    const rad = R + 0.5 + r() * 0.4;
    return { name: "circle", solid: cells(R, (u, v) => u * u + v * v > rad * rad), parts: [] };
  },
  /** A ring around a big pillar in the middle. */
  core(R, h, r) {
    const c = randInt(r, 1, R >= 8 ? 3 : 2);
    const round = r() < 0.5;
    return { name: "core", solid: cells(R, (u, v) => (round ? Math.abs(u) + Math.abs(v) <= c + 1 : Math.abs(u) <= c && Math.abs(v) <= c)), parts: [] };
  },
  /** A long hall one way through the room. */
  hall(R, h, r) {
    const w = randInt(r, 3, 4);
    const alongV = r() < 0.5;
    return { name: "hall", solid: cells(R, (u, v) => (alongV ? Math.abs(u) > w : Math.abs(v) > w)), parts: [] };
  },
  /** Walls from the sides partway across, so the way through winds (a trap hall gets 2 or 3). */
  partitions(R, h, r, trap) {
    const solid = new Set();
    const count = trap ? randInt(r, 2, 3) : randInt(r, 1, 2);
    /** @type {number[]} */
    const lines = [];
    const alongU = r() < 0.5; // the walls run along u (each at a fixed v), or along v
    for (let k = 0; k < count; k++) {
      let c = 0;
      let tries = 0;
      do c = randInt(r, -R + 3, R - 3);
      while (tries++ < 20 && lines.some((x) => Math.abs(x - c) < 3));
      if (lines.some((x) => Math.abs(x - c) < 3)) continue;
      lines.push(c);
    }
    lines.sort((a, b) => a - b);
    let side = sign(r);
    for (const c of lines) {
      const gap = trap ? 3 : randInt(r, 3, 5);
      const len = trap ? 2 * R + 1 - gap : randInt(r, R, 2 * R + 1 - gap);
      for (let k = 0; k < len; k++) {
        const a = side > 0 ? R - k : -R + k;
        solid.add(alongU ? key(a, c) : key(c, a));
      }
      side = -side;
    }
    return { name: "partitions", solid, parts: [] };
  },
  /** A grid of pillars. */
  pillars(R, h, r) {
    const step = randInt(r, 3, 4);
    const big = R >= 8 && r() < 0.4;
    const solid = new Set();
    for (let u = -R + 2; u <= R - 2; u++)
      for (let v = -R + 2; v <= R - 2; v++) {
        if (Math.abs(u) % step !== Math.floor(step / 2) || Math.abs(v) % step !== Math.floor(step / 2)) continue;
        solid.add(key(u, v));
        if (big) for (const [du, dv] of [[1, 0], [0, 1], [1, 1]]) if (Math.abs(u + du) <= R - 2 && Math.abs(v + dv) <= R - 2) solid.add(key(u + du, v + dv));
      }
    return { name: "pillars", solid, parts: [] };
  },
};

/** Shapes that keep every wall clear (for tall rooms with balconies, and puzzle-free ones that need the walls). */
export const OPEN_SHAPES = ["plain", "pillars", "core"];

/**
 * Low cover: short walls one block high and crates two high, scattered away from the walls.
 * @param {number} R @param {() => number} r @returns {Part[]}
 */
export function cover(R, r) {
  /** @type {Part[]} */
  const out = [];
  const n = randInt(r, 2, 3 + Math.floor((R - 7) / 1));
  for (let k = 0; k < n; k++) {
    const u = randInt(r, -R + 2, R - 2);
    const v = randInt(r, -R + 2, R - 2);
    if (Math.abs(u) <= 1 && Math.abs(v) <= 1) continue;
    if (r() < 0.5) {
      const len = randInt(r, 2, 3);
      const along = r() < 0.5;
      out.push({ k: "trim", u, v, y: 1, u2: along ? Math.min(R - 2, u + len - 1) : u, v2: along ? v : Math.min(R - 2, v + len - 1), y2: 1 });
    } else out.push({ k: "accent", u, v, y: 1, y2: 2 });
  }
  return out;
}

/**
 * A raised ledge two blocks high along a wall without a door, with a step up at one end.
 * Undefined when every wall has a door.
 * @param {number} R @param {Door[]} doors @param {() => number} r @returns {{ parts: Part[], top: { u: number, v: number, y: number }[] } | undefined}
 */
export function ledge(R, doors, r) {
  /** @type {Face[]} */
  const faces = ["fwd", "back", "left", "right"];
  const free = faces.filter((f) => !doors.some((d) => d.side === f));
  if (!free.length) return undefined;
  const side = free[Math.floor(r() * free.length)];
  const depth = randInt(r, 2, 3);
  const half = randInt(r, 3, R - 2);
  const p1 = cellOn(side, -half, R - depth + 1);
  const p2 = cellOn(side, half, R);
  const stepAt = cellOn(side, r() < 0.5 ? -half - 1 : half + 1, R);
  const step2 = cellOn(side, r() < 0.5 ? -half - 1 : half + 1, R - 1);
  /** @type {Part[]} */
  const parts = [
    { k: "trim", u: p1.u, v: p1.v, y: 1, u2: p2.u, v2: p2.v, y2: 2 },
    { k: "trim", u: stepAt.u, v: stepAt.v, y: 1 },
    { k: "trim", u: step2.u, v: step2.v, y: 1 },
  ];
  /** @type {{ u: number, v: number, y: number }[]} */
  const top = [];
  for (let a = -half + 1; a <= half - 1; a += 3) {
    const c = cellOn(side, a, R - 1);
    top.push({ u: c.u, v: c.v, y: 3 });
  }
  return { parts, top };
}

/**
 * Which shapes a room of this kind may take.
 * @param {string} kind @param {boolean} tall rooms 8 or more high (balconies along the walls) @param {number} t Nightmare tier
 * @returns {string[]}
 */
export function shapesFor(kind, tall, t) {
  if (!["trap", "combat", "elite", "boss", "entry", "shrine", "boon"].includes(kind)) return ["plain"];
  if (kind === "trap") return ["partitions", "partitions", "partitions", "hall", "cross", "L", "T", "core"];
  if (tall) return OPEN_SHAPES;
  switch (kind) {
    case "combat":
    case "elite":
      return ["plain", "L", "T", "cross", "octagon", "circle", "core", "hall", "partitions", "pillars", ...(t >= 3 ? ["partitions", "cross", "L"] : [])];
    case "boss":
      return ["plain", "octagon", "circle", "pillars", "core"];
    case "entry":
    case "shrine":
    case "boon":
      return ["plain", "octagon", "circle", "cross"];
    default:
      return ["plain"];
  }
}

/**
 * Turns solid cells into as few wall boxes as it can (runs along u, merged down v).
 * @param {Set<string>} solid @param {number} R @param {number} h @returns {Part[]}
 */
export function wallParts(solid, R, h) {
  /** @type {{ u1: number, u2: number, v1: number, v2: number }[]} */
  const boxes = [];
  /** @type {Map<string, { u1: number, u2: number, v1: number, v2: number }>} */
  let open = new Map();
  for (let v = -R; v <= R; v++) {
    /** @type {Map<string, { u1: number, u2: number, v1: number, v2: number }>} */
    const now = new Map();
    let u = -R;
    while (u <= R) {
      if (!solid.has(key(u, v))) {
        u++;
        continue;
      }
      const u1 = u;
      while (u + 1 <= R && solid.has(key(u + 1, v))) u++;
      const k = `${u1},${u}`;
      const prev = open.get(k);
      if (prev) {
        prev.v2 = v;
        now.set(k, prev);
      } else {
        const b = { u1, u2: u, v1: v, v2: v };
        boxes.push(b);
        now.set(k, b);
      }
      u++;
    }
    open = now;
  }
  return boxes.map((b) => ({ k: "wall", u: b.u1, v: b.v1, y: 1, u2: b.u2, v2: b.v2, y2: h }));
}
