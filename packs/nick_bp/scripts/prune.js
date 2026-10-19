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