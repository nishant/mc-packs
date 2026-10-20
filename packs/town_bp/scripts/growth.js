// Town Projects' growth (F38, F40 houses): the town's story so far (its log), the houses it builds as town works and
// what its next level brings. No @minecraft import, so the unit tests (tools/town-growth.test.mjs) run it in node.
import { DEFAULT_JOB } from "./designs.js";

/** Entries the town's log keeps (the oldest go first), and the most characters of each. */
export const LOG_MAX = 12;
export const LOG_TEXT = 60;
/** Most houses a town builds (house_1 .. house_10). */
export const HOUSE_MAX = 10;

/** @typedef {[number, string]} LogEntry the Realm day (0 when no calendar said it), and what happened */
/**
 * A town work: built by the town itself at a spot it picks (no deliveries, no rewards, no quest, not counted for
 * leveling). Its progress record is { done: 1, built } once it is due.
 * @typedef {{ id: string, name: string, level: number, needs: Record<string, number>, build: "house", job: string, work: 1, why?: string, structure?: string }} Work
 */

/** Plain ASCII, no color codes, at most LOG_TEXT characters. @param {unknown} s */
export const cleanText = (s) =>
  String(s ?? "")
    .replace(/§./g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .trim()
    .slice(0, LOG_TEXT);

/** A saved log, cleaned: [day, text] entries, at most LOG_MAX; undefined when there is none. @param {unknown} raw @returns {LogEntry[] | undefined} */
export function readLog(raw) {
  if (!Array.isArray(raw)) return undefined;
  /** @type {LogEntry[]} */
  const out = [];
  for (const e of raw) {
    if (!Array.isArray(e)) continue;
    const day = typeof e[0] === "number" && Number.isFinite(e[0]) && e[0] > 0 ? Math.floor(e[0]) : 0;
    const text = cleanText(e[1]);
    if (text) out.push([day, text]);
  }
  return out.length ? out.slice(-LOG_MAX) : undefined;
}

/** The log with one more entry at the end (the oldest dropped past LOG_MAX). @param {LogEntry[] | undefined} log @param {number | undefined} day @param {string} text @returns {LogEntry[]} */
export function addLog(log, day, text) {
  const t = cleanText(text);
  if (!t) return log ?? [];
  const d = typeof day === "number" && Number.isFinite(day) && day > 0 ? Math.floor(day) : 0;
  return [...(log ?? []), /** @type {LogEntry} */ ([d, t])].slice(-LOG_MAX);
}

/** "Day 12: The Well was finished", or the text alone without a day. @param {LogEntry} e */
export const logLine = (e) => (e[0] > 0 ? `Day ${e[0]}: ${e[1]}` : e[1]);

/** Is this a town work's id (house_1 .. house_10)? @param {unknown} id */
export const isWorkId = (id) => typeof id === "string" && /^house_([1-9]|10)$/.test(id);

/**
 * Houses a town has at a level: none below level 2, else the level's families (`perLevel`, the last entry for higher
 * levels), at most `cap` and HOUSE_MAX. @param {number} lvl @param {unknown} perLevel @param {unknown} cap
 */
export function houseCount(lvl, perLevel, cap) {
  if (!(lvl >= 2)) return 0;
  const list = Array.isArray(perLevel) ? perLevel : [];
  if (!list.length) return 0;
  const n = Number(list[Math.min(Math.floor(lvl), list.length) - 1]);
  const c = Number(cap);
  const top = Number.isFinite(c) ? Math.max(0, Math.min(HOUSE_MAX, Math.floor(c))) : HOUSE_MAX;
  return Number.isFinite(n) ? Math.max(0, Math.min(top, Math.floor(n))) : 0;
}

/** The town works: house_1 .. house_10, each with its job-site block from `jobs` in turn. @param {unknown} jobs @returns {Work[]} */
export function makeWorks(jobs) {
  const list = (Array.isArray(jobs) ? jobs : []).filter((j) => typeof j === "string" && /^minecraft:[a-z_]{1,48}$/.test(j));
  return Array.from({ length: HOUSE_MAX }, (_, i) => ({
    id: `house_${i + 1}`,
    name: `House ${i + 1}`,
    level: 2,
    needs: {},
    build: /** @type {const} */ ("house"),
    job: list.length ? list[i % list.length] : DEFAULT_JOB,
    work: /** @type {const} */ (1),
  }));
}

/**
 * What the next level brings, for the mayor's page: its projects and the new houses. Undefined at the top level.
 * @param {{ lvl: number, max: number, name: string, projects: string[], housesNow: number, housesNext: number }} o
 */
export function nextLevelText(o) {
  if (o.lvl >= o.max) return undefined;
  const parts = [];
  if (o.projects.length) parts.push(`new projects (${o.projects.join(", ")})`);
  const more = o.housesNext - o.housesNow;
  if (more > 0) parts.push(`${more} new house${more === 1 ? "" : "s"} for families`);
  return `Next, as a ${o.name} (level ${o.lvl + 1}): ${parts.length ? parts.join(" and ") : "the town's thanks"}.`;
}

/**
 * The town record as saved, under `limit` characters: the oldest log entries are dropped first (the log is the only
 * part that can be given up). @param {{ log?: LogEntry[] }} t @param {number} limit @returns {string}
 */
export function townJson(t, limit) {
  let json = JSON.stringify(t);
  while (json.length > limit && t.log?.length) {
    t.log = t.log.slice(1);
    if (!t.log.length) delete t.log;
    json = JSON.stringify(t);
  }
  return json;
}
