// Town mayors: townsfolk that Town Projects (town_bp) asks for, one per town, with ids `mayor:<town id>`. No
// @minecraft import, so the unit tests (tools/npc-mayors.test.mjs) run it in node. The fixed cast in config.js
// (and the stories that use its ids) is never touched: a mayor is built from CONFIG.mayorTemplate instead.
//   realm:npc_mayor   { op: "set", id, name, town, tn, dim, x, y, z, yaw } | { op: "rename", id, name, tn } | { op: "remove", id }
//   realm:npc_mayor_ack { id, op, ok, error? }
//   realm:npc_mayors  { part, parts, ids }: every mayor id town_bp knows (parts 0: none)

export const MAYOR_PREFIX = "mayor:";
/** Most town mayors at once (one per town). */
export const MAX_MAYORS = 64;
const MAYOR_ID = /^mayor:[a-z0-9_]{1,40}$/;
const NAME_MAX = 24;

/** @param {unknown} id @returns {id is string} */
export const isMayorId = (id) => typeof id === "string" && MAYOR_ID.test(id);

/**
 * The structure key part of a townsfolk's saved skin: the cast keeps `realm_npc:<id>`; a mayor is `realm_npc:m_<town>`
 * (a structure id may have only one `:`). @param {string} id
 */
export const skinKey = (id) => (isMayorId(id) ? `m_${id.slice(MAYOR_PREFIX.length)}` : id);

/** Plain ASCII text without color codes, trimmed and cut to `max`. @param {unknown} v @param {number} max */
export function cleanText(v, max) {
  if (typeof v !== "string") return "";
  return v
    .replace(/§./g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .trim()
    .slice(0, max)
    .trim();
}

/** @typedef {{ n: string, t: string, tn: string }} MayorRec name, town id, town name */

/**
 * The saved `npc:mayors` object as a Map, keeping only valid records (at most MAX_MAYORS).
 * @param {unknown} raw @returns {Map<string, MayorRec>}
 */
export function normalizeMayors(raw) {
  /** @type {Map<string, MayorRec>} */
  const out = new Map();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw)) {
    if (out.size >= MAX_MAYORS) break;
    if (!isMayorId(id) || !v || typeof v !== "object") continue;
    const r = /** @type {any} */ (v);
    const n = cleanText(r.n, NAME_MAX);
    const t = typeof r.t === "string" && /^[a-z0-9_]{1,40}$/.test(r.t) ? r.t : id.slice(MAYOR_PREFIX.length);
    if (!n) continue;
    out.set(id, { n, t, tn: cleanText(r.tn, NAME_MAX) || t });
  }
  return out;
}

/** @param {Map<string, MayorRec>} map */
export const mayorsJson = (map) => Object.fromEntries(map);

/**
 * A request from town_bp, checked: { op, id, name?, town?, tn?, dim?, x?, y?, z?, yaw? }, or { error }.
 * @param {any} m
 */
export function parseMayorRequest(m) {
  if (!m || typeof m !== "object") return { error: "not a request" };
  const op = m.op;
  if (op !== "set" && op !== "rename" && op !== "remove") return { error: "unknown op" };
  if (!isMayorId(m.id)) return { error: "bad id", op };
  const id = /** @type {string} */ (m.id);
  if (op === "remove") return { op, id };
  const name = cleanText(m.name, NAME_MAX);
  if (!name) return { error: "no name", op, id };
  const tn = cleanText(m.tn, NAME_MAX) || id.slice(MAYOR_PREFIX.length);
  if (op === "rename") return { op, id, name, tn };
  const num = (/** @type {unknown} */ v) => typeof v === "number" && Number.isFinite(v);
  if (!num(m.x) || !num(m.y) || !num(m.z) || typeof m.dim !== "string") return { error: "no spot", op, id };
  const town = typeof m.town === "string" && /^[a-z0-9_]{1,40}$/.test(m.town) ? m.town : id.slice(MAYOR_PREFIX.length);
  const yaw = num(m.yaw) ? m.yaw : 0;
  return { op, id, name, tn, town, dim: m.dim.startsWith("minecraft:") ? m.dim : `minecraft:${m.dim}`, x: m.x, y: m.y, z: m.z, yaw };
}

/**
 * @typedef {object} Template
 * @property {string} title
 * @property {{ morning: string[], day: string[], evening: string[], night: string[], rain: string[], thunder: string[] }} greetings
 * @property {string[]} idle
 */

/**
 * A town mayor as a townsfolk: its name, a title and lines from the template with `{town}` filled in, and the role
 * `mayor` only (never `questgiver`: favors and chapters stay with the cast).
 * @param {string} id @param {MayorRec} rec @param {Template} template
 */
export function folkFor(id, rec, template) {
  const town = rec.tn || rec.t;
  const fill = (/** @type {string} */ s) => String(s).split("{town}").join(town);
  const lines = (/** @type {unknown} */ a) => (Array.isArray(a) ? a.filter((x) => typeof x === "string").map(fill) : []);
  const g = template?.greetings ?? /** @type {any} */ ({});
  return {
    id,
    name: rec.n,
    title: fill(template?.title ?? ""),
    roles: ["mayor"],
    greetings: { morning: lines(g.morning), day: lines(g.day), evening: lines(g.evening), night: lines(g.night), rain: lines(g.rain), thunder: lines(g.thunder) },
    idle: lines(template?.idle),
  };
}

/**
 * Keep a saved `npc:list` record at load? The cast while config.js has it; a mayor while `npc:mayors` lists it.
 * @param {string} id @param {(id: string) => boolean} inCast @param {Map<string, unknown>} mayors
 */
export const keepPlaced = (id, inCast, mayors) => inCast(id) || (isMayorId(id) && mayors.has(id));

/**
 * Collects realm:npc_mayors parts. `add` returns the full id set once every part of one list has come in (parts 0:
 * an empty list), else undefined. A part 1 starts a new list.
 */
export function createIdsAssembler() {
  /** @type {Map<number, string[]>} */
  let got = new Map();
  let want = 0;
  return {
    /** @param {any} m @returns {Set<string> | undefined} */
    add(m) {
      if (!m || typeof m !== "object") return undefined;
      const parts = Number(m.parts);
      const part = Number(m.part);
      if (!Number.isInteger(parts) || parts < 0 || parts > 64) return undefined;
      if (parts === 0) {
        got = new Map();
        want = 0;
        return new Set();
      }
      if (!Number.isInteger(part) || part < 1 || part > parts || !Array.isArray(m.ids)) return undefined;
      if (part === 1 || parts !== want) {
        got = new Map();
        want = parts;
      }
      got.set(part, m.ids.filter(isMayorId));
      if (got.size < want) return undefined;
      const all = new Set([...got.values()].flat());
      got = new Map();
      want = 0;
      return all;
    },
  };
}

/** Mayor ids we keep that a complete list from town_bp doesn't have. @param {Map<string, unknown>} mayors @param {Set<string>} ids */
export const unlisted = (mayors, ids) => [...mayors.keys()].filter((id) => !ids.has(id));

/**
 * Who may tell a piece of gossip (realm:gossip `from`): a townsfolk id (a cast id like `bram`, or `mayor:<town>`),
 * cleaned; undefined for anything else, so the piece is everyone's to tell. @param {unknown} v @returns {string | undefined}
 */
export const gossipFrom = (v) => (typeof v === "string" && (isMayorId(v) || /^[a-z][a-z0-9_]{0,31}$/.test(v)) ? v : undefined);

/** May this townsfolk tell this piece? Everyone, unless it names who tells it (`f`). @param {{ f?: unknown }} g @param {string} npcId */
export const tellsGossip = (g, npcId) => typeof g.f !== "string" || g.f === npcId;
