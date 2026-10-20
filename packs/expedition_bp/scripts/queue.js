// The line for a dungeon. Three dungeons is the most the world's 10 ticking areas can spare (Farm Loader, Siege, Death
// Point, Town Houses and the builders share them), so a fourth party waits in line and its run starts by itself when a
// dungeon is free. Everything it needs from main.js comes in through createQueue, so tools/expedition-capacity.test.mjs
// imports this file as it ships.

/** Parties that can wait at once. */
export const QUEUE_MAX = 8;
/** Game ticks a party may wait (30 minutes) before it is dropped from the line. */
export const QUEUE_TICKS = 36000;
/** Game ticks the line holds after a dungeon failed to open (a minute), so one bad site doesn't fail every party in turn. */
export const QUEUE_RETRY = 1200;

/**
 * One party waiting for a dungeon. Memory only and nothing is debited while it waits: the sigil is used up, and a
 * Fixed loadout stored, only when the run really starts; the party is asked then, so who comes along is who is there.
 * @typedef {{ id: string, name: string, d: any, L: number, affixes: string[], sigilLine: string | undefined, g: { loadout: boolean } | undefined, at: number }} Queued
 */

/**
 * What the line needs from the game and from the rest of the pack.
 * @typedef {{
 *   system: { readonly currentTick: number, run(fn: () => void): unknown },
 *   runs: Map<number, any>,
 *   get(key: string): any,
 *   site(): unknown,
 *   online(id: string): any,
 *   runOf(id: string): unknown,
 *   statusLine(run: any): string,
 *   sigilsOf(player: any): { sig: { line: string } }[],
 *   freeSlot(): number | undefined,
 *   start(player: any, d: any, L: number, affixes: string[], sigilLine: string | undefined, g: { loadout: boolean } | undefined, fromQueue: boolean): Promise<unknown>,
 *   resetPending(): Promise<unknown>,
 *   cantStart(player: any): string,
 *   forgotten(): boolean,
 * }} QueueDeps
 */

/** @param {QueueDeps} deps */
export function createQueue(deps) {
  const { system, get, site, online, runs, runOf, statusLine, sigilsOf, freeSlot, start, resetPending, cantStart, forgotten } = deps;
  /** @type {Queued[]} */
  const queue = [];
  /** The line doesn't start anyone before this tick. */
  let queueHold = 0;

  /** @param {string} id */
  const queuePlace = (id) => queue.findIndex((q) => q.id === id);

  /** Takes a leader out of the line; true when they were in it. @param {string} id */
  function dequeue(id) {
    const i = queuePlace(id);
    if (i < 0) return false;
    queue.splice(i, 1);
    return true;
  }

  /** Empties the line and tells each leader why; returns how many parties were waiting. @param {string} text */
  function clearQueue(text) {
    const n = queue.length;
    for (const q of queue.splice(0)) online(q.id)?.sendMessage(text);
    return n;
  }

  /** No dungeon for this request right now: all taken, or others are already waiting (they go first). @param {boolean} [fromQueue] the line itself is starting it */
  function slotBusy(fromQueue = false) {
    return freeSlot() === undefined || (!fromQueue && queue.length > 0);
  }

  /**
   * Puts a confirmed request in line (asking again replaces the earlier request and keeps the place).
   * @param {any} leader @param {any} d @param {number} L @param {string[]} affixes @param {string | undefined} sigilLine @param {{ loadout: boolean } | undefined} g
   */
  function enqueue(leader, d, L, affixes, sigilLine, g) {
    if (forgotten()) return leader.sendMessage(cantStart(leader));
    if (sigilLine && !sigilsOf(leader).some((s) => s.sig.line === sigilLine)) return leader.sendMessage("§cThat sigil isn't in your inventory any more.");
    const had = queuePlace(leader.id);
    if (had < 0 && queue.length >= QUEUE_MAX) return leader.sendMessage(`§eAll dungeons are busy and ${QUEUE_MAX} parties are already waiting. Try again later.`);
    /** @type {Queued} */
    const entry = { id: leader.id, name: leader.name, d, L, affixes: [...affixes], sigilLine, g: g ? { ...g } : undefined, at: system.currentTick };
    if (had >= 0) {
      entry.at = queue[had].at;
      queue[had] = entry;
    } else queue.push(entry);
    const busy = [...runs.values()].map(statusLine).join("; ");
    leader.sendMessage(
      `§eEvery dungeon is busy${busy ? ` (${busy})` : ""}. You're number ${queuePlace(leader.id) + 1} of ${queue.length} in line: your ${g ? "Gauntlet" : "expedition"} starts by itself when a dungeon is free, with whoever is in your party then. Leave the line with /realm:expedition_leave.`,
    );
    if (!runs.size) resetPending().catch((e) => console.warn(`[expedition] ${e}`));
  }

  /** Drops parties that can't go on, then starts the next waiting parties while a dungeon is free. */
  function pumpQueue() {
    if (forgotten()) return void clearQueue("§eThe expedition data was forgotten, so the line for a dungeon is closed until the realm reloads.");
    if (!queue.length) return;
    const now = system.currentTick;
    const on = get("enabled") === true;
    for (const q of [...queue]) {
      const p = online(q.id);
      let why = "";
      if (!p) why = "";
      else if (runOf(q.id)) why = "§7You joined an expedition, so you're out of the line for a dungeon.";
      else if (!on) why = "§eNew expeditions are disabled right now, so you're out of the line for a dungeon.";
      else if (q.g && get("gauntletEnabled") !== true) why = "§eGauntlets are disabled right now, so you're out of the line for a dungeon.";
      else if (now - q.at >= QUEUE_TICKS) why = "§eNo dungeon was free for 30 minutes, so you're out of the line. Ask again when you're ready.";
      else continue;
      dequeue(q.id);
      if (p && why) p.sendMessage(why);
    }
    if (now < queueHold || !site()) return;
    while (queue.length && freeSlot() !== undefined) {
      const q = queue.shift();
      const p = q && online(q.id);
      if (!q || !p) continue;
      p.sendMessage("§aAn expedition dungeon is free now: starting yours.");
      start(p, q.d, q.L, q.affixes, q.sigilLine, q.g, true).catch((e) => console.warn(`[expedition] queued start: ${e}`));
    }
  }

  /** A run's slot is free again (its box reset, or it never got one): the next waiting party starts. @param {number} slot @param {boolean} [failed] the dungeon couldn't be opened: the line holds a minute */
  function freeRun(slot, failed = false) {
    runs.delete(slot);
    if (failed) queueHold = system.currentTick + QUEUE_RETRY;
    system.run(pumpQueue);
  }

  return { queue, queuePlace, dequeue, clearQueue, slotBusy, enqueue, pumpQueue, freeRun };
}
