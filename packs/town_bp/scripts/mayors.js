// Town Projects' mayors: one per town (F36). No @minecraft import, so the unit tests (tools/town-mayors.test.mjs) run
// it in node. A town's mayor is `m` in its record: "bram" (Townsfolk's Mayor Bram, the realm's main mayor) or
// "mayor:<town id>" (a townsfolk Townsfolk makes for that town, named `mn`). Records without `v` were saved before
// mayors existed (v1) and still read; `v: 2` is written together with `m`.

export const BRAM = "bram";
const MAYOR_ID = /^mayor:[a-z0-9_]{1,40}$/;
const NAME_MAX = 24;

/** @param {string} townId */
export const mayorIdFor = (townId) => `mayor:${townId}`;
/** @param {unknown} id @returns {id is string} */
export const isTownMayorId = (id) => typeof id === "string" && MAYOR_ID.test(id);

/** Plain ASCII without color codes, trimmed, at most `max` characters. @param {unknown} v @param {number} [max] */
export function cleanName(v, max = NAME_MAX) {
  if (typeof v !== "string") return "";
  return v
    .replace(/§./g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .trim()
    .slice(0, max)
    .trim();
}

/**
 * A saved town as it is now: v1 records (no `v`, `m`, `mn`) read as they are; an `m` that is neither Bram nor this
 * town's own mayor id is dropped. Nothing is written here. @param {any} t @returns {any}
 */
export function readMayor(t) {
  const out = { ...t };
  if (out.m !== BRAM && out.m !== mayorIdFor(out.id)) delete out.m;
  if (out.m === mayorIdFor(out.id)) {
    const mn = cleanName(out.mn);
    if (mn) out.mn = mn;
    else delete out.mn;
  } else delete out.mn;
  if (out.v !== 2) delete out.v;
  return out;
}

/**
 * A mayor's name for a new town: "Mayor <name>" with the first name from `names` no other town's mayor has, else
 * "Mayor <Town>". @param {string[]} names @param {Iterable<string>} used @param {string} townName
 */
export function pickMayorName(names, used, townName) {
  const taken = new Set([...used].map((n) => n.toLowerCase()));
  for (const raw of names) {
    const first = cleanName(raw, NAME_MAX - 6);
    if (!first) continue;
    const name = `Mayor ${first}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
  return cleanName(`Mayor ${townName}`) || "Mayor";
}

/** "minecraft:overworld" and "overworld" alike. @param {string} d */
const dimKey = (d) => String(d).replace(/^minecraft:/, "");

/**
 * @typedef {{ id: string, n: string, dim: string, x: number, z: number, at: number, m?: string, mn?: string, v?: number }} TownLike
 * @typedef {{ dim: string, x: number, z: number }} Place
 */

/**
 * Bram's town when an old world is migrated: the town in his dimension whose center is nearest his post, within
 * `radius`; with none that close, or Bram not placed, the oldest town (smallest `at`, then id).
 * @param {TownLike[]} towns @param {Place | undefined} bram @param {number} radius @returns {string | undefined}
 */
export function bramTown(towns, bram, radius) {
  if (!towns.length) return undefined;
  if (bram) {
    let best;
    let bestD = radius;
    for (const t of towns) {
      if (dimKey(t.dim) !== dimKey(bram.dim)) continue;
      const d = Math.hypot(t.x - bram.x, t.z - bram.z);
      if (d <= bestD) {
        best = t;
        bestD = d;
      }
    }
    if (best) return best.id;
  }
  return [...towns].sort((a, b) => (a.at ?? 0) - (b.at ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0].id;
}

/**
 * Who becomes mayor of each town saved before mayors existed (no `v`): Bram keeps his town (see bramTown; only if no
 * migrated town has him already), every other town gets its own `mayor:<id>` with a name. Towns with `v` are left
 * as they are. Returns the changes to write.
 * @param {TownLike[]} towns @param {Place | undefined} bram @param {number} radius @param {string[]} names
 * @returns {{ id: string, m: string, mn?: string }[]}
 */
export function planMigration(towns, bram, radius, names) {
  const old = towns.filter((t) => t.v !== 2);
  if (!old.length) return [];
  const bramTaken = towns.some((t) => t.v === 2 && t.m === BRAM);
  const bramId = bramTaken ? undefined : bramTown(old, bram, radius);
  const used = towns.flatMap((t) => (t.v === 2 && t.mn ? [t.mn] : []));
  /** @type {{ id: string, m: string, mn?: string }[]} */
  const out = [];
  for (const t of [...old].sort((a, b) => (a.at ?? 0) - (b.at ?? 0) || (a.id < b.id ? -1 : 1))) {
    if (t.id === bramId) {
      out.push({ id: t.id, m: BRAM });
      continue;
    }
    const mn = pickMayorName(names, used, t.n);
    used.push(mn);
    out.push({ id: t.id, m: mayorIdFor(t.id), mn });
  }
  return out;
}

/**
 * The mayor of a town being added: Bram for the realm's first town (when no town has him), else its own.
 * @param {TownLike[]} existing @param {string} townId @param {string} townName @param {string[]} names
 * @returns {{ m: string, mn?: string }}
 */
export function newTownMayor(existing, townId, townName, names) {
  if (!existing.length) return { m: BRAM };
  const used = existing.flatMap((t) => (t.mn ? [t.mn] : []));
  return { m: mayorIdFor(townId), mn: pickMayorName(names, used, townName) };
}

/**
 * Which towns a tapped townsfolk offers, in order (at most 2): the town it is mayor of, wherever the player stands;
 * then, from any NPC with the mayor role, the town the player stands in when that town's own mayor isn't placed
 * (the old nearest-town rule as a fallback). A mayor-role NPC that is neither Bram nor a town mayor (one an operator
 * added in config.js) keeps the nearest-town rule, and so does everyone while `enabled` (townMayors) is off.
 * @param {{ towns: TownLike[], npc: string, roles: string[], role: string, here: string | undefined, placed: (id: string) => boolean, enabled: boolean }} o
 * @returns {string[]}
 */
export function offerTowns(o) {
  const isRole = o.roles.includes(o.role);
  if (!o.enabled) return isRole && o.here ? [o.here] : [];
  /** @type {string[]} */
  const out = [];
  const own = o.npc ? o.towns.find((t) => t.m === o.npc) : undefined;
  if (own) out.push(own.id);
  if (isRole && o.here && o.here !== own?.id) {
    const here = o.towns.find((t) => t.id === o.here);
    const other = o.npc !== BRAM && !isTownMayorId(o.npc);
    if (here && (other || !here.m || !o.placed(here.m))) out.push(here.id);
  }
  return out.slice(0, 2);
}

/**
 * realm:npc_mayors messages for a list of mayor ids, each under `limit` characters (parts 0: none).
 * @param {string[]} ids @param {number} [limit]
 */
export function mayorParts(ids, limit = 1900) {
  if (!ids.length) return [{ part: 1, parts: 0, ids: [] }];
  /** @type {string[][]} */
  const parts = [[]];
  for (const id of ids) {
    const last = /** @type {string[]} */ (parts.at(-1));
    if (last.length && JSON.stringify({ part: 99, parts: 99, ids: [...last, id] }).length > limit) parts.push([id]);
    else last.push(id);
  }
  return parts.map((list, i) => ({ part: i + 1, parts: parts.length, ids: list }));
}

/**
 * Collects realm:npc_places parts into one map of placed townsfolk (id -> { dim, x, z }). `add` returns the map when
 * a whole list is in (parts 0: nobody placed), else undefined.
 */
export function createPlacesAssembler() {
  /** @type {Map<number, any[]>} */
  let got = new Map();
  let want = 0;
  return {
    /** @param {any} m @returns {Map<string, Place> | undefined} */
    add(m) {
      if (!m || typeof m !== "object") return undefined;
      const parts = Number(m.parts);
      const part = Number(m.part);
      if (!Number.isInteger(parts) || parts < 0 || parts > 256) return undefined;
      /** @type {Map<string, Place>} */
      const out = new Map();
      if (parts === 0) {
        got = new Map();
        want = 0;
        return out;
      }
      if (!Number.isInteger(part) || part < 1 || part > parts || !Array.isArray(m.folk)) return undefined;
      if (part === 1 || parts !== want) {
        got = new Map();
        want = parts;
      }
      got.set(part, m.folk);
      if (got.size < want) return undefined;
      for (const f of [...got.values()].flat()) {
        if (f && typeof f.id === "string" && typeof f.dim === "string" && Number.isFinite(f.x) && Number.isFinite(f.z)) out.set(f.id, { dim: f.dim, x: f.x, z: f.z });
      }
      got = new Map();
      want = 0;
      return out;
    },
  };
}
