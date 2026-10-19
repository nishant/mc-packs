// Generated from tools/owed-shared.js by node tools/sync-owed.mjs: edit that file, not this copy.
// Per-player storage for what players are owed while they are offline (rewards, learned recipes, gifts).
//
// One world dynamic property per player (`<base>:<playerId>`, a JSON value) and one small index property
// (`<base>_idx`, a JSON array of player ids, oldest first), instead of one property holding everybody: a single
// property fails past 32767 bytes, which a few hundred absent players reach. Every property is bounded:
//   - an id is at most MAX_ID_LENGTH characters (a Bedrock player id is a number of up to 20 characters),
//   - a value is at most MAX_VALUE_BYTES of UTF-8,
//   - the index holds at most MAX_PLAYERS ids: MAX_PLAYERS * (MAX_ID_LENGTH + 3) bytes = 27,000 < 32,767.
// Past MAX_PLAYERS the oldest player's entry is dropped and the drop is logged with what it held, never silent.
//
// The old layout (the whole map as JSON in the property `<base>`) is migrated on first use, crash- and
// restart-safe and idempotent: values are written first, then the index, and only then is the old property
// rewritten without them. A restart in between finds the new values already there and only finishes the job;
// nothing is paid twice (a player's value is never copied over a newer one, and until the move is finished
// `set`, `update`, `remove` and `take` do nothing)) and nothing is stranded (an entry that
// can't be moved, such as a too-long id, stays in the old property, which is never cleared as a whole).
// `take` removes the value before it returns it, so a reward is handed over at most once.
//
// Packs never import each other: node tools/sync-owed.mjs copies this file into each pack that owes things, as
// scripts/owed.js.

/** @typedef {import("@minecraft/server").World} World */

export const MAX_PLAYERS = 1000;
export const MAX_ID_LENGTH = 24;
export const MAX_VALUE_BYTES = 30000;
const INDEX_SUFFIX = "_idx";

/** UTF-8 length of a string in bytes (a dynamic property is limited in bytes). @param {string} s */
export function utf8Length(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

/** @param {unknown} v */
const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * @typedef {object} OwedOptions
 * @property {string} base the legacy property name and the key prefix, e.g. "town:owed" (values live at "town:owed:<id>")
 * @property {string} [tag] log prefix, default the pack part of `base`
 * @property {number} [maxPlayers] at most MAX_PLAYERS
 * @property {(value: any, id: string) => any} [normalize] fixes a legacy value while migrating; return undefined to drop it
 * @property {(value: any) => string} [summarize] what a dropped entry held, for the log
 */

/**
 * @param {World} world
 * @param {OwedOptions} options
 */
export function createOwedStore(world, options) {
  const base = options.base;
  const tag = options.tag ?? base.split(":")[0];
  const maxPlayers = Math.max(1, Math.min(MAX_PLAYERS, Math.floor(options.maxPlayers ?? MAX_PLAYERS)));
  const indexKey = `${base}${INDEX_SUFFIX}`;
  const normalize = options.normalize;
  /** @param {any} value */
  const summarize = (value) => {
    if (options.summarize) {
      try {
        return options.summarize(value);
      } catch {
        // fall through to the JSON text
      }
    }
    let text = "";
    try {
      text = JSON.stringify(value) ?? "";
    } catch {
      text = String(value);
    }
    return text.length > 200 ? `${text.slice(0, 200)}...` : text;
  };
  /** @param {string} id */
  const keyOf = (id) => `${base}:${id}`;
  /** @param {string} id */
  const validId = (id) => typeof id === "string" && id.length > 0 && id.length <= MAX_ID_LENGTH;
  const warn = (/** @type {string} */ msg) => console.warn(`[${tag}] ${base}: ${msg}`);

  let migrated = false;

  /** @returns {string[]} */
  function readIndex() {
    const raw = world.getDynamicProperty(indexKey);
    if (typeof raw !== "string") return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("not a list");
      return parsed.filter((x) => typeof x === "string");
    } catch (e) {
      // The values are still found by id; only listing and the cap lose these players.
      warn(`index unreadable (${e}); rebuilt as players are added`);
      return [];
    }
  }

  /** @param {string[]} ids */
  function writeIndex(ids) {
    world.setDynamicProperty(indexKey, ids.length ? JSON.stringify(ids) : undefined);
  }

  /** Drops the oldest ids beyond the cap from `ids` (in place) and returns them. @param {string[]} ids */
  function overflow(ids) {
    return ids.length > maxPlayers ? ids.splice(0, ids.length - maxPlayers) : [];
  }

  /** @param {string} id @param {string} why @param {any} value */
  function logDrop(id, why, value) {
    warn(`${why}: dropped the oldest entry, for player ${id} (${summarize(value)})`);
  }

  /** Drops evicted players' values (logged first). @param {string[]} dropped */
  function discard(dropped) {
    for (const id of dropped) {
      let value;
      try {
        const raw = world.getDynamicProperty(keyOf(id));
        value = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        value = "unreadable";
      }
      logDrop(id, `more than ${maxPlayers} players are owed`, value);
      try {
        world.setDynamicProperty(keyOf(id), undefined);
      } catch (e) {
        warn(`could not remove ${id}: ${e}`);
      }
    }
  }

  function migrate() {
    if (migrated) return;
    let raw;
    try {
      raw = world.getDynamicProperty(base);
    } catch (e) {
      warn(`cannot read: ${e}`);
      return;
    }
    if (raw === undefined) {
      migrated = true;
      return;
    }
    let parsed;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : undefined;
    } catch {
      parsed = undefined;
    }
    if (!isPlainObject(parsed)) {
      // Not a map of players: left exactly as it is, so nothing recoverable is lost.
      warn("old property is not a map of players; left in place");
      migrated = true;
      return;
    }
    /** @type {Record<string, unknown>} */
    const leftover = {};
    /** @type {string[]} */
    const staged = [];
    /** @type {Map<string, string>} */
    const json = new Map();
    for (const [id, value] of Object.entries(/** @type {Record<string, unknown>} */ (parsed))) {
      if (!validId(id)) {
        warn(`kept player id of ${id.length} characters in the old property (too long to index)`);
        leftover[id] = value;
        continue;
      }
      /** @type {any} */
      let v = value;
      try {
        if (normalize) v = normalize(value, id);
      } catch (e) {
        warn(`kept ${id} in the old property: ${e}`);
        leftover[id] = value;
        continue;
      }
      if (v === undefined || v === null) {
        logDrop(id, "nothing owed (empty or unusable record)", value);
        continue;
      }
      const text = JSON.stringify(v);
      if (utf8Length(text) > MAX_VALUE_BYTES) {
        warn(`kept ${id} in the old property: ${utf8Length(text)} bytes is over the ${MAX_VALUE_BYTES} limit`);
        leftover[id] = value;
        continue;
      }
      staged.push(id);
      json.set(id, text);
    }

    const index = readIndex();
    const inIndex = new Set(index);
    const fresh = staged.filter((id) => !inIndex.has(id));
    const wanted = [...index, ...fresh];
    const dropped = overflow(wanted);
    const droppedSet = new Set(dropped);
    try {
      for (const id of staged) {
        if (droppedSet.has(id)) {
          if (!inIndex.has(id)) logDrop(id, `more than ${maxPlayers} players are owed`, parsed[id]);
          continue;
        }
        // An existing value is never overwritten: it was written by an earlier, interrupted run (or is newer).
        if (world.getDynamicProperty(keyOf(id)) === undefined) world.setDynamicProperty(keyOf(id), json.get(id));
      }
      writeIndex(wanted);
      const check = new Set(readIndex());
      for (const id of wanted) {
        if (!check.has(id) || (staged.includes(id) && world.getDynamicProperty(keyOf(id)) === undefined)) throw new Error(`could not verify ${id}`);
      }
      discard(dropped.filter((id) => inIndex.has(id)));
      world.setDynamicProperty(base, Object.keys(leftover).length ? JSON.stringify(leftover) : undefined);
      migrated = true;
    } catch (e) {
      // The old property is untouched until here, so the next call retries.
      warn(`migration interrupted (${e}); it resumes on the next use`);
    }
  }

  /** @param {string} id @returns {any} */
  function read(id) {
    const raw = world.getDynamicProperty(keyOf(id));
    if (raw === undefined) return undefined;
    if (typeof raw !== "string") return undefined;
    try {
      return JSON.parse(raw);
    } catch (e) {
      warn(`unreadable value for ${id} left in place: ${e}`);
      return undefined;
    }
  }

  /** @param {string} id */
  function dropFromIndex(id) {
    try {
      const index = readIndex();
      const at = index.indexOf(id);
      if (at >= 0) {
        index.splice(at, 1);
        writeIndex(index);
      }
    } catch (e) {
      warn(`index update failed: ${e}`);
    }
  }

  const store = {
    maxPlayers,
    /** Moves the old single-property layout over (done on first use anyway). */
    migrate,
    /** What the player is owed, or undefined. @param {string} id @returns {any} */
    get(id) {
      migrate();
      return validId(id) ? read(id) : undefined;
    },
    /** @param {string} id */
    has(id) {
      migrate();
      return validId(id) && world.getDynamicProperty(keyOf(id)) !== undefined;
    },
    /**
     * Saves what the player is owed (replacing it); the oldest player's entry goes when the store is full.
     * @param {string} id @param {any} value @returns {boolean} whether it was saved
     */
    set(id, value) {
      migrate();
      if (!migrated) return false;
      if (!validId(id)) {
        warn(`not saved: player id of ${String(id).length} characters (limit ${MAX_ID_LENGTH})`);
        return false;
      }
      try {
        const text = JSON.stringify(value);
        if (text === undefined) throw new Error("nothing to save");
        if (utf8Length(text) > MAX_VALUE_BYTES) throw new Error(`${utf8Length(text)} bytes is over the ${MAX_VALUE_BYTES} limit`);
        world.setDynamicProperty(keyOf(id), text);
        const index = readIndex();
        if (!index.includes(id)) {
          index.push(id);
          const dropped = overflow(index);
          writeIndex(index);
          discard(dropped);
        }
        return true;
      } catch (e) {
        warn(`not saved for ${id}: ${e}`);
        return false;
      }
    },
    /**
     * Changes what the player is owed: `fn` gets the saved value (or undefined) and returns the new one, or undefined for nothing.
     * @param {string} id @param {(current: any) => any} fn @returns {boolean} whether it was saved
     */
    update(id, fn) {
      migrate();
      if (!migrated || !validId(id)) return false;
      const next = fn(read(id));
      if (next === undefined) {
        return store.remove(id);
      }
      return store.set(id, next);
    },
    /** Removes the player's entry (and its index slot). @param {string} id @returns {boolean} whether it is gone */
    remove(id) {
      migrate();
      if (!migrated || !validId(id)) return false;
      try {
        world.setDynamicProperty(keyOf(id), undefined);
      } catch (e) {
        warn(`could not remove ${id}: ${e}`);
        return false;
      }
      dropFromIndex(id);
      return true;
    },
    /**
     * What the player is owed, removed first: returns it only once it is really gone, so it is handed over at most once.
     * @param {string} id @returns {any}
     */
    take(id) {
      migrate();
      if (!migrated || !validId(id)) return undefined;
      const value = read(id);
      if (value === undefined) return undefined;
      try {
        world.setDynamicProperty(keyOf(id), undefined);
      } catch (e) {
        warn(`not handed over, could not remove ${id}: ${e}`);
        return undefined;
      }
      if (world.getDynamicProperty(keyOf(id)) !== undefined) return undefined;
      dropFromIndex(id);
      return value;
    },
    /** Player ids with an entry, oldest first. @returns {string[]} */
    ids() {
      migrate();
      return readIndex();
    },
    size() {
      migrate();
      return readIndex().length;
    },
  };
  return store;
}
