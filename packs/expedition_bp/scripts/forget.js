// realm:diag's forget cleanup for Expeditions (registered by main.js in globalThis.__realmDiagForgetHooks). Everything
// it touches comes in through createForget, so tools/expedition-forget.test.mjs and tools/expedition-capacity.test.mjs
// import this file as it ships.

/**
 * What the forget hook needs from the game and from the rest of the pack.
 * @typedef {{
 *   world: { getAllPlayers(): any[], structureManager: { getWorldStructureIds(): string[] } },
 *   system: { runTimeout(fn: () => void, ticks: number): unknown },
 *   isOp(player: any): boolean,
 *   forgetStructures(kind: "parcel", busy: () => boolean): { deleted: number, kept: number, failed?: number, error?: string },
 *   handingOver(): boolean,
 *   setSaving(on: boolean): void,
 *   clearQueue(text: string): number,
 *   warn?(text: string): void,
 * }} ForgetDeps
 */

/** @param {ForgetDeps} deps */
export function createForget(deps) {
  const { world, system, isOp, forgetStructures, handingOver, setSaving, clearQueue } = deps;
  const warn = deps.warn ?? ((/** @type {string} */ text) => console.warn(text));
  /** True from a confirmed forget until /reload: a parcel structure is still being swept (a hand-over was running). */
  let sweepPending = false;
  /** True from a confirmed forget until /reload: no run starts (its run record and counters can't be saved) and the line is closed. */
  let forgotten = false;

  /** Tells the operators online (and the log) how a deferred sweep ended. @param {string} text */
  function tellOps(text) {
    warn(text.replace(/§./g, ""));
    for (const p of world.getAllPlayers()) if (isOp(p)) p.sendMessage(text);
  }

  /** One sweep of this pack's parcel structures (their records went with the forgotten world data, so nothing can hand them over). Stash structures stay: see onForget. */
  const sweepParcels = () => forgetStructures("parcel", handingOver);

  /** Retries a sweep that had to wait for a running hand-over, and says how it ended. */
  function retrySweep() {
    const r = sweepParcels();
    if (r.failed) {
      sweepPending = false;
      tellOps(`§c[Expeditions] Forgot the saved data, but the parcel clean-up failed: ${r.failed < 0 ? "" : `${r.failed} parcel structure${r.failed === 1 ? "" : "s"} couldn't be deleted. `}${r.error}`);
    } else if (r.kept) system.runTimeout(retrySweep, 40);
    else {
      sweepPending = false;
      tellOps(`§e[Expeditions] The waiting parcel clean-up finished: ${r.deleted} more parcel structure${r.deleted === 1 ? "" : "s"} deleted.`);
    }
  }

  /**
   * realm:diag's forget cleanup for this pack, run once after the saved world data is gone and this pack's world saves are
   * blocked until /reload. It stops new stashes and parcels (their counters can't be saved, and a stash without its record
   * would strip an inventory with no way back), deletes the parcel structures (nothing can hand them over any more) and
   * keeps every stash structure: players' own data still points at them, offline players included, so each one is deleted
   * when its owner gets their items back. Returns the one answer's note or error.
   * @returns {{ note?: string, error?: string }}
   */
  function onForget() {
    forgotten = true;
    setSaving(false);
    clearQueue("§eThe expedition data was forgotten, so the line for a dungeon is closed until the realm reloads.");
    const r = sweepParcels();
    const stashes = (() => {
      try {
        return world.structureManager.getWorldStructureIds().filter((id) => /^expedition:stash_\d+$/.test(id)).length;
      } catch {
        return 0;
      }
    })();
    const stashNote = stashes ? ` ${stashes} stash structure${stashes === 1 ? " stays" : "s stay"} because players' own data still points at ${stashes === 1 ? "it" : "them"}; each is deleted when its owner gets their items back.` : "";
    if (r.failed) return { error: `${r.failed < 0 ? r.error : `${r.failed} parcel structure${r.failed === 1 ? "" : "s"} couldn't be deleted (${r.error}); ${r.deleted} deleted`}.${stashNote}` };
    if (r.kept) {
      sweepPending = true;
      system.runTimeout(retrySweep, 40);
      return { note: `${r.deleted} parcel structures deleted, ${r.kept} waiting for a hand-over to end (operators are told when done).${stashNote}` };
    }
    return { note: `${r.deleted} parcel structure${r.deleted === 1 ? "" : "s"} deleted.${stashNote}` };
  }

  return {
    onForget,
    /** True from a confirmed forget until /reload. */
    forgotten: () => forgotten,
    /** True while a deferred parcel sweep still waits for a hand-over. */
    sweepPending: () => sweepPending,
  };
}
