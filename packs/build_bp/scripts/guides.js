// STUB from track buildB: the lead drops this file in favor of track buildA's guides.js at merge.
// Only the signature matters here: drawGuide(player, cells, kind).
import { Player } from "@minecraft/server";

const CAP = 200;

/**
 * Shows a guide only this player sees: one dot per block (evenly thinned past CAP).
 * @param {Player} player
 * @param {{ x: number, y: number, z: number }[]} cells
 * @param {"build" | "destroy" | "paste"} kind unused by the stub
 */
export function drawGuide(player, cells, kind) {
  if (!cells.length) return;
  const step = Math.max(1, Math.ceil(cells.length / CAP));
  for (let i = 0; i < cells.length; i += step) {
    const c = cells[i];
    try {
      player.spawnParticle("minecraft:villager_happy", { x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5 });
    } catch {
      // unloaded
    }
  }
}
