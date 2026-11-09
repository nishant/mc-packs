// The top list's name cache: { "s<scoreboard id>": name }. The "s" prefix keeps the keys from being integer-like,
// so the object keeps insertion order (integer keys always iterate in ascending order) and a trim drops the
// players seen longest ago. Keys saved before the prefix were bare ids and are migrated on load.

/** Largest saved JSON, in characters (a dynamic property holds 32,767). */
export const NAMES_MAX_CHARS = 30000;

/** @param {string | number} id */
export const nameKey = (id) => `s${id}`;

/** A parsed saved value as a prefixed cache (bare numeric keys come first, as the oldest). @param {unknown} parsed @returns {Record<string, string>} */
export function loadNames(parsed) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return out;
  for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (parsed))) {
    if (typeof v !== "string") continue;
    out[/^\d+$/.test(k) ? nameKey(k) : k] = v;
  }
  return out;
}

/** @param {Record<string, string>} cache @param {string | number} id */
export const lookupName = (cache, id) => cache[nameKey(id)];

/**
 * Remembers a name as the most recently seen, then trims the oldest entries past maxEntries or maxChars.
 * @param {Record<string, string>} cache @param {string | number} id @param {string} name @param {number} maxEntries @returns {string | undefined} the JSON to save, or undefined if nothing changed
 */
export function rememberInCache(cache, id, name, maxEntries, maxChars = NAMES_MAX_CHARS) {
  const key = nameKey(id);
  const short = name.slice(0, 32);
  if (cache[key] === short) return undefined;
  delete cache[key];
  cache[key] = short;
  const keys = Object.keys(cache);
  for (const k of keys.slice(0, Math.max(0, keys.length - maxEntries))) delete cache[k];
  let json = JSON.stringify(cache);
  while (json.length > maxChars) {
    const first = Object.keys(cache)[0];
    if (first === undefined || first === key) break;
    delete cache[first];
    json = JSON.stringify(cache);
  }
  return json;
}
