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

/** Writes at most one refresh a day per player. @param {unknown} seen @param {number} now */
export const stale = (seen, now) => typeof seen !== "number" || !Number.isFinite(seen) || seen <= 0 || now - seen > DAY || seen > now;

/** The fields of a saved record this pack doesn't know, kept as they are (newer or older versions may write them). @param {unknown} v @param {string[]} known @returns {Record<string, unknown>} */
export function unknownFields(v, known) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v).filter(([k]) => !known.includes(k)));
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