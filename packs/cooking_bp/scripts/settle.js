// Settling a dish that was saved as owed when the pot started (cooking_bp). Its own module so
// tools/cooking-settle.test.mjs can run it against the real owed store with a failing world.

/**
 * How many dishes are owed for one dish id in a saved value. @param {any} value @param {string} id
 */
function owedOf(value, id) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  return Math.max(0, Math.floor(Number(value[id]) || 0));
}

/**
 * Takes up to `n` batches of dish `id` off what `pid` is owed and returns how many really left the store, so the
 * caller hands over exactly those. When the save fails the debt stays saved and is paid on the next join; only
 * what is no longer in the store counts as due (never paid twice, never lost).
 * @param {{ get: (id: string) => any, update: (id: string, fn: (cur: any) => any) => boolean }} store
 * @param {string} pid @param {string} id @param {number} n
 * @returns {number}
 */
export function settleOwed(store, pid, id, n) {
  let due = 0;
  let had = 0;
  const saved = store.update(pid, (cur) => {
    if (!cur || typeof cur !== "object" || Array.isArray(cur)) return cur;
    had = owedOf(cur, id);
    due = Math.max(0, Math.min(n, had));
    if (!due) return cur;
    if (had - due > 0) cur[id] = had - due;
    else delete cur[id];
    return Object.keys(cur).length ? cur : undefined;
  });
  if (saved || !due) return due;
  // The write failed. A failure can still land part of it (the value written, the index not), so trust only what
  // the store holds now.
  let left;
  try {
    left = owedOf(store.get(pid), id);
  } catch {
    return 0;
  }
  return Math.max(0, Math.min(due, had - left));
}
