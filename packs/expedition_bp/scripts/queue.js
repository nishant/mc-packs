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
/** Game ticks a restored line keeps a leader who isn't online yet after a restart (5 minutes), so they can rejoin. */
export const QUEUE_REJOIN = 6000;
/** World: JSON SavedQueued[], the line, so a script reload or a restart doesn't drop it without a word. */
export const PROP_QUEUE = "expedition:queue";
/**
 * Game ticks a leader who left the game keeps the place (10 seconds) before the line drops them. A server stopping
 * disconnects everyone first: dropping (and saving) on the leave itself would empty the saved line just before a
 * restart, so the leave only marks the time and the 100-tick pump drops the party once this has passed.
 */
export const QUEUE_GONE = 200;

/**
 * One party waiting for a dungeon. Nothing is debited while it waits: the sigil is used up, and a Fixed loadout
 * stored, only when the run really starts; the party is asked then, so who comes along is who is there. The line is
 * saved (PROP_QUEUE) and read back on world load. `back`: a restored entry whose leader may still rejoin until this tick.
 * @typedef {{ id: string, name: string, d: any, L: number, affixes: string[], sigilLine: string | undefined, g: { loadout: boolean } | undefined, at: number, back?: number }} Queued
 * @typedef {{ i: string, n: string, d: string, L: number, a: string[], s?: string, g?: { loadout: boolean }, w: number }} SavedQueued w: ticks waited
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
 *   readJson(key: string): any,
 *   writeJson(key: string, value: unknown): unknown,
 *   dungeonById(id: string): any,
 * }} QueueDeps
 */

/** @param {QueueDeps} deps */
export function createQueue(deps) {
  const { system, get, site, online, runs, runOf, statusLine, sigilsOf, freeSlot, start, resetPending, cantStart, forgotten, readJson, writeJson, dungeonById } = deps;
  /** @type {Queued[]} */
  const queue = [];
  /** The line doesn't start anyone before this tick. */
  let queueHold = 0;
  /** Leaders in the line who left the game, and the tick they left. @type {Map<string, number>} */
  const queueGone = new Map();

  /** Saves the line (nothing when it's empty). */
  function saveQueue() {
    const now = system.currentTick;
    /** @type {SavedQueued[]} */
    const out = queue.map((q) => ({ i: q.id, n: q.name, d: q.d.id, L: q.L, a: q.affixes, ...(q.sigilLine ? { s: q.sigilLine } : {}), ...(q.g ? { g: q.g } : {}), w: Math.max(0, now - q.at) }));
    writeJson(PROP_QUEUE, out.length ? out : undefined);
  }

  /**
   * Reads the saved line back on world load, in its order and with the time already waited. A leader online now (a
   * script reload) is told they're still in line; one who isn't (a restart) keeps the place for QUEUE_REJOIN ticks.
   * @returns {number} how many parties are waiting
   */
  function loadQueue() {
    const saved = readJson(PROP_QUEUE);
    if (!Array.isArray(saved)) return 0;
    const now = system.currentTick;
    for (const e of saved) {
      if (queue.length >= QUEUE_MAX) break;
      const d = e && typeof e.i === "string" && typeof e.d === "string" ? dungeonById(e.d) : undefined;
      if (!d || !Number.isFinite(e.L) || queuePlace(e.i) >= 0) continue;
      const g = e.g && typeof e.g === "object" ? { loadout: e.g.loadout === true } : undefined;
      const affixes = Array.isArray(e.a) ? e.a.filter((/** @type {unknown} */ x) => typeof x === "string") : [];
      queue.push({ id: e.i, name: typeof e.n === "string" ? e.n : "", d, L: e.L, affixes, sigilLine: typeof e.s === "string" ? e.s : undefined, g, at: now - Math.max(0, Number(e.w) || 0), back: now + QUEUE_REJOIN });
    }
    for (const q of queue) {
      const p = online(q.id);
      if (!p) continue;
      q.back = undefined;
      p.sendMessage(`§eThe realm reloaded and you're still number ${queuePlace(q.id) + 1} of ${queue.length} in line for a dungeon: it starts by itself when one is free.`);
    }
    saveQueue();
    return queue.length;
  }

  /** A leader left the game: marked, not dropped (QUEUE_GONE). @param {string} id */
  function queueLeft(id) {
    if (queuePlace(id) >= 0) queueGone.set(id, system.currentTick);
  }

  /** A leader joined: one still in a restored line is told so. @param {any} p */
  function queueRejoined(p) {
    queueGone.delete(p.id);
    const i = queuePlace(p.id);
    if (i < 0 || queue[i].back === undefined) return;
    queue[i].back = undefined;
    p.sendMessage(`§eThe realm restarted and you're still number ${i + 1} of ${queue.length} in line for a dungeon: it starts by itself when one is free. Leave the line with /realm:expedition_leave.`);
  }

  /** @param {string} id */
  const queuePlace = (id) => queue.findIndex((q) => q.id === id);

  /** Takes a leader out of the line; true when they were in it. @param {string} id */
  function dequeue(id) {
    const i = queuePlace(id);
    if (i < 0) return false;
    queue.splice(i, 1);
    queueGone.delete(id);
    saveQueue();
    return true;
  }

  /** Empties the line and tells each leader why; returns how many parties were waiting. @param {string} text */
  function clearQueue(text) {
    const n = queue.length;
    for (const q of queue.splice(0)) online(q.id)?.sendMessage(text);
    queueGone.clear();
    if (n) saveQueue();
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
    saveQueue();
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
      if (!p && q.back !== undefined && now < q.back) continue; // restored after a restart: the leader may still rejoin
      const left = queueGone.get(q.id);
      if (!p && left !== undefined && now - left < QUEUE_GONE) continue; // just left: maybe the server is stopping
      if (!p) why = "";
      else if (runOf(q.id)) why = "§7You joined an expedition, so you're out of the line for a dungeon.";
      else if (!on) why = "§eNew expeditions are disabled right now, so you're out of the line for a dungeon.";
      else if (q.g && get("gauntletEnabled") !== true) why = "§eGauntlets are disabled right now, so you're out of the line for a dungeon.";
      else if (now - q.at >= QUEUE_TICKS) why = "§eNo dungeon was free for 30 minutes, so you're out of the line. Ask again when you're ready.";
      else continue;
      dequeue(q.id);
      if (p && why) p.sendMessage(why);
    }
    if (now < queueHold || !site()) return void (queue.length && saveQueue());
    while (queue.length && freeSlot() !== undefined) {
      // The first party whose leader is here; a restored one still waiting for its leader keeps its place.
      const i = queue.findIndex((x) => online(x.id));
      if (i < 0) break;
      const [q] = queue.splice(i, 1);
      const p = online(q.id);
      if (!p) continue;
      p.sendMessage("§aAn expedition dungeon is free now: starting yours.");
      start(p, q.d, q.L, q.affixes, q.sigilLine, q.g, true).catch((e) => console.warn(`[expedition] queued start: ${e}`));
    }
    saveQueue(); // also keeps the time waited current, every 100 ticks while anyone waits
  }

  /** A run's slot is free again (its box reset, or it never got one): the next waiting party starts. @param {number} slot @param {boolean} [failed] the dungeon couldn't be opened: the line holds a minute */
  function freeRun(slot, failed = false) {
    runs.delete(slot);
    if (failed) queueHold = system.currentTick + QUEUE_RETRY;
    system.run(pumpQueue);
  }

  return { queue, queuePlace, dequeue, clearQueue, slotBusy, enqueue, pumpQueue, freeRun, loadQueue, queueLeft, queueRejoined };
}
