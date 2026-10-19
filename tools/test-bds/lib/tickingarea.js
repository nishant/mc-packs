// Ticking-area input checks shared by the harness test pack (copied next to harness.js as scripts/tickingarea.js)
// and its unit tests. Bedrock accepts `tickingarea add circle <x> <y> <z> <radius>` only for a whole radius of 1 to 4
// chunks: anything else fails in the game, and a swallowed failure used to show up 400 ticks later as "chunk did not
// load" (an invalid radius 6 in the first O74 fixture).
export const MIN_RADIUS = 1;
export const MAX_RADIUS = 4;

/** Why a circle radius is not usable, or null. @param {unknown} radius */
export function radiusProblem(radius) {
  const n = typeof radius === "string" && /^[+-]?\d+$/.test(radius.trim()) ? Number(radius) : radius;
  if (typeof n === "number" && Number.isInteger(n) && n >= MIN_RADIUS && n <= MAX_RADIUS) return null;
  return `a ticking area circle radius must be a whole number from ${MIN_RADIUS} to ${MAX_RADIUS} (got ${JSON.stringify(radius)}): the game rejects any other radius`;
}

const ADD_CIRCLE = /(?:^|\s)tickingarea\s+add\s+circle\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/i;

/** For a `tickingarea add circle` command (also after `execute ... run`), why its radius is not usable; null for anything else. @param {string} command */
export function tickingAreaCommandProblem(command) {
  const m = ADD_CIRCLE.exec(String(command));
  return m ? radiusProblem(m[4]) : null;
}

/**
 * What loadArea does after its tickingarea command ran: wait for the chunk, or fail now with the game's own message.
 * A rejected command is only harmless when the column is already readable (a player stands there).
 * @param {{ x: number, z: number, radius: number, add: { ok: boolean, error?: string }, readable: boolean }} input
 * @returns {{ action: "wait" | "fail", message: string }}
 */
export function afterTickingAreaAdd({ x, z, radius, add, readable }) {
  if (add.ok) return { action: "wait", message: "" };
  const why = add.error ? add.error : "the command did not succeed";
  if (readable) return { action: "wait", message: `tickingarea add circle ${x} ${z} radius ${radius} failed (${why}) but the chunk is already readable` };
  return { action: "fail", message: `tickingarea add circle ${Math.floor(x)} 0 ${Math.floor(z)} ${radius} failed: ${why}` };
}
