// Items Expansive Inventory (stash_bp) keeps on saved pages count toward a collect step, which would otherwise never see
// what its page routing moved off the active page. It asks (realm:stash_count_ask { player, item?, name? }) and
// stash_bp answers with realm:stash_count { player, item?, name?, rev, part, parts, rows: [{ id, name?, lore?, n }] },
// one row per kind on saved pages, split over `parts` messages; a realm:stash_changed { player, rev } says the saved
// pages changed. A step with only a name is asked too: the rows are matched here with the same rules as live items.
// Parts of one revision are assembled and used only when complete; a reply of an older revision than the last notice
// is stale and dropped. countItem is untouched: deliveries and every other reader still see only the live inventory.
// Without stash_bp nothing answers: after one wait of STASH_WAIT ticks the step counts the live inventory alone.
// Once stash_bp has spoken this session (an answer or a notice) it is installed, so a missing answer is a failure
// (a page it couldn't read says so with { unknown: true }, or a message was lost), never "nothing saved": the step
// then counts the live inventory but never lowers its progress, and asks again every STASH_RETRY ticks.
//
// objectives.js makes the one bridge with createStashBridge; tools/saga-collect-stash.test.mjs imports this file as it
// ships.

/** Ticks to wait for an answer before counting without it. */
export const STASH_WAIT = 40;
/** Ticks before a step whose answer is missing asks again. */
export const STASH_RETRY = 200;

/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").ItemStack} ItemStack */
/** @typedef {{ item?: string, name?: string }} Wanted the item and/or custom name a collect step asks for */
/** @typedef {{ id: string, name?: string, lore?: string[], n: number }} Row one kind on saved pages */

/**
 * What the bridge needs from objectives.js.
 * @typedef {{
 *   system: { readonly currentTick: number },
 *   send(id: string, message: object): void,
 *   countItem(player: Player, item: string | undefined, name?: string): number,
 *   same(stack: ItemStack | undefined, item: string | undefined, name?: string): boolean,
 *   changed(playerId: string): void,
 * }} BridgeDeps
 */

/** @param {BridgeDeps} deps */
export function createStashBridge(deps) {
  const { system, send, countItem, same, changed } = deps;
  /** @type {Map<string, Row[]>} */
  const stashRows = new Map();
  /** When each unanswered ask was sent (tick). @type {Map<string, number>} */
  const stashAsked = new Map();
  /** Parts of an answer received so far. @type {Map<string, { rev?: string, parts: number, got: Map<number, Row[]> }>} */
  const stashParts = new Map();
  /** The newest committed revision a notice named, per player. @type {Map<string, string>} */
  const stashRev = new Map();
  /** stash_bp answered or sent a notice this session: it is installed. */
  let stashHeard = false;

  /** @param {Player} player @param {Wanted} obj */
  const stashKey = (player, obj) => `${player.id}|${obj.item ?? ""}|${obj.name ?? ""}`;

  /**
   * What a collect step has: the live inventory plus the saved pages. Undefined while stash_bp's answer is pending,
   * so a count taken between a page move and its answer can't make progress dip. When stash_bp is installed but its
   * answer is missing, the live count, but never less than the progress the step already has (`had`).
   * @param {Player} player @param {Wanted} obj @param {number} [had] the step's progress now
   * @returns {number | undefined}
   */
  function collectCount(player, obj, had = 0) {
    const live = countItem(player, obj.item, obj.name);
    const key = stashKey(player, obj);
    let rows = stashRows.get(key);
    if (!rows) {
      const now = system.currentTick;
      const asked = stashAsked.get(key);
      if (asked === undefined) {
        stashAsked.set(key, now);
        send("realm:stash_count_ask", { player: player.id, item: obj.item, name: obj.name });
        return undefined;
      }
      if (now - asked < STASH_WAIT) return undefined;
      if (stashHeard) {
        // Installed but no answer: what the pages hold is unknown, not zero. Keep what the step has; ask again later.
        if (now - asked >= STASH_RETRY) {
          stashAsked.set(key, now);
          stashParts.delete(key);
          send("realm:stash_count_ask", { player: player.id, item: obj.item, name: obj.name });
        }
        return Math.max(live, had);
      }
      stashAsked.delete(key);
      stashParts.delete(key);
      rows = [];
      stashRows.set(key, rows);
    }
    let hidden = 0;
    for (const r of rows) {
      const lore = r.lore ?? [];
      const stack = /** @type {ItemStack} */ (/** @type {unknown} */ ({ typeId: r.id, nameTag: r.name, getLore: () => lore }));
      if (same(stack, obj.item, obj.name)) hidden += r.n;
    }
    return live + hidden;
  }

  /** realm:stash_count. @param {string} message */
  function stashCountReply(message) {
    try {
      const m = JSON.parse(message);
      if (!m || typeof m.player !== "string") return;
      stashHeard = true;
      const key = `${m.player}|${typeof m.item === "string" ? m.item : ""}|${typeof m.name === "string" ? m.name : ""}`;
      if (m.unknown === true) {
        // stash_bp couldn't read a page: count without it now (never lowering), and ask again after STASH_RETRY.
        if (!stashRows.has(key)) stashAsked.set(key, system.currentTick - STASH_WAIT);
        return;
      }
      if (!Array.isArray(m.rows)) return;
      const rev = typeof m.rev === "string" ? m.rev : undefined;
      const known = stashRev.get(m.player);
      if (known !== undefined && rev !== known) return;
      const parts = Number.isInteger(m.parts) && m.parts > 1 ? m.parts : 1;
      const part = Number.isInteger(m.part) && m.part >= 1 && m.part <= parts ? m.part : 1;
      /** @type {Row[]} */
      const rows = [];
      for (const r of m.rows) {
        if (r && typeof r.id === "string" && Number.isInteger(r.n) && r.n > 0) {
          rows.push({ id: r.id, name: typeof r.name === "string" ? r.name : undefined, lore: Array.isArray(r.lore) ? r.lore.map(String) : undefined, n: r.n });
        }
      }
      let pending = stashParts.get(key);
      if (!pending || pending.rev !== rev || pending.parts !== parts) {
        pending = { rev, parts, got: new Map() };
        stashParts.set(key, pending);
      }
      pending.got.set(part, rows);
      if (pending.got.size < parts) return;
      stashParts.delete(key);
      /** @type {Row[]} */
      const all = [];
      for (let i = 1; i <= parts; i++) all.push(.../** @type {Row[]} */ (pending.got.get(i)));
      const was = JSON.stringify(stashRows.get(key));
      stashRows.set(key, all);
      stashAsked.delete(key);
      if (was !== JSON.stringify(all)) changed(m.player);
    } catch {
      // an unreadable answer is ignored; the step keeps what it had
    }
  }

  /** realm:stash_changed: the saved pages changed, so what stash_bp said before is stale until it answers again. @param {string} message */
  function stashChanged(message) {
    try {
      const m = JSON.parse(message);
      if (!m || typeof m.player !== "string") return;
      stashHeard = true;
      if (typeof m.rev === "string") stashRev.set(m.player, m.rev);
      for (const map of [stashRows, stashAsked, stashParts]) for (const key of [...map.keys()]) if (key.startsWith(`${m.player}|`)) map.delete(key);
      changed(m.player);
    } catch {
      // ignored
    }
  }

  /** A player left: forget what the bridge knew and asked for them. @param {string} pid */
  function stashForget(pid) {
    stashRev.delete(pid);
    for (const map of [stashRows, stashAsked, stashParts]) for (const key of [...map.keys()]) if (key.startsWith(`${pid}|`)) map.delete(key);
  }

  return { collectCount, stashCountReply, stashChanged, stashForget };
}
