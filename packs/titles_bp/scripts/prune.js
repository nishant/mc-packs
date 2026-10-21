// Generated from tools/prune-shared.js by node tools/sync-prune.mjs: edit that file, not this copy.
// The inactive-player pruning rules shared by Parties, Nicknames and Titles: when a record was last seen, whether it is
// old enough to drop, and the sweeps their forgetOld jobs run. Packs never import each other, so each keeps its own
// copy as scripts/prune.js; node tools/sync-prune.mjs keeps the copies the same (tools/inactive-prune.test.mjs).

const DAY = 86400000;

/**
 * What to do with a record last seen at `seen` (ms). A record with no usable time is never read as epoch 0 (and so
 * as ancient): it is "start": begin counting from now. `days` of 0 or less turns pruning off.
 * @param {unknown} seen @param {number} now @param {number} days
 * @returns {"keep" | "start" | "drop"}
 */
export function verdict(seen, now, days) {
  if (!(days > 0)) return "keep";
  if (typeof seen !== "number" || !Number.isFinite(seen) || seen <= 0) return "start";
  return now - seen > days * DAY ? "drop" : "keep";
}

/**
 * Brings each member's last-seen time (the third item of [id, name, seen]) up to date and decides whether the party
 * is a solo party nobody has played in for `days`. Only a party of one member is ever dropped; a member with no time
 * starts counting now.
 * @param {{ m: [string, string, number?][] }} party @param {number} now @param {(id: string) => boolean} isOnline @param {number} days
 * @returns {{ changed: boolean, drop: boolean }}
 */
export function planParty(party, now, isOnline, days) {
  let changed = false;
  for (const m of party.m) {
    const seen = m[2];
    const known = typeof seen === "number" && Number.isFinite(seen) && seen > 0 && seen <= now;
    if (isOnline(m[0]) ? !known || now - /** @type {number} */ (seen) > DAY : !known) {
      m[2] = now;
      changed = true;
    }
  }
  return { changed, drop: party.m.length === 1 && verdict(party.m[0][2], now, days) === "drop" };
}

/** Writes at most one refresh a day per player. @param {unknown} seen @param {number} now */
export const stale = (seen, now) => typeof seen !== "number" || !Number.isFinite(seen) || seen <= 0 || now - seen > DAY || seen > now;

/** The fields of a saved record this pack doesn't know, kept as they are (newer or older versions may write them). @param {unknown} v @param {string[]} known @returns {Record<string, unknown>} */
export function unknownFields(v, known) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v).filter(([k]) => !known.includes(k)));
}

/** A member tuple as [id, name, seen, ...whatever else was saved after those]. @param {any[]} m @returns {any[]} */
export function memberOf(m) {
  return [m[0], String(m[1] ?? ""), typeof m[2] === "number" && Number.isFinite(m[2]) && m[2] > 0 ? m[2] : 0, ...m.slice(3)];
}

/**
 * The sweep behind forgetOld, one yield per saved gamertag. Everything that can change while the job is paused (the
 * setting, who is online, a player's saved time) is read again for each entry, so a player who joined or a newly
 * disabled setting is never judged by an old snapshot.
 * @param {{ keys: () => string[], owner: (key: string) => unknown, online: (id: string) => boolean, seen: (id: string) => unknown, days: () => number, now: () => number, start: (id: string, now: number) => void, drop: (key: string, id: string, days: number) => void, warn: (e: unknown) => void }} env
 */
export function* sweepGamertags(env) {
  for (const key of env.keys()) {
    const days = Number(env.days());
    const now = env.now();
    try {
      const owner = env.owner(key);
      if (days > 0 && typeof owner === "string" && !env.online(owner)) {
        const v = verdict(env.seen(owner), now, days);
        if (v === "start") env.start(owner, now);
        else if (v === "drop") env.drop(key, owner, days);
      }
    } catch (e) {
      env.warn(e);
    }
    yield;
  }
}

/** The record as saved: a last-seen time that isn't known yet is left out, never written as 0. @template {{ ls?: unknown }} T @param {T} d @returns {T} */
export function savedForm(d) {
  const out = { ...d };
  if (!(typeof out.ls === "number" && Number.isFinite(out.ls) && out.ls > 0)) delete out.ls;
  return out;
}
/**
 * The sweep behind forgetOld, one yield per saved record. The setting, who is online, the cache and the saved record
 * are read again for each entry, so a player who joined while the job was paused is never deleted by an old snapshot.
 * @param {{ keys: () => string[], raw: (key: string) => unknown, online: (key: string) => boolean, days: () => number, now: () => number, start: (key: string, record: any, now: number) => void, drop: (key: string, record: any, days: number) => void, warn: (e: unknown) => void }} env
 */
export function* sweepRecords(env) {
  for (const key of env.keys()) {
    const days = Number(env.days());
    const now = env.now();
    try {
      if (days > 0 && !env.online(key)) {
        const raw = env.raw(key);
        const v = typeof raw === "string" ? JSON.parse(raw) : undefined;
        if (v && typeof v === "object") {
          const r = verdict(v.ls, now, days);
          if (r === "start") env.start(key, v, now);
          else if (r === "drop") env.drop(key, v, days);
        }
      }
    } catch (e) {
      env.warn(e);
    }
    yield;
  }
}
