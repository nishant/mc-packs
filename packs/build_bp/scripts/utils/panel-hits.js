// One entityHitEntity listener for the pack's floating panels, guide book and language picker (BSE-23): it fires for
// every hit in the world, so it is subscribed once and looks up the hit entity's type in one Map.
import { world, Player } from "@minecraft/server";

/** @type {Map<string, (player: Player) => void>} hit entity type -> what a player's hit on it does */
const handlers = new Map();
let subscribed = false;

/**
 * @param {Iterable<string>} typeIds
 * @param {(player: Player) => void} onHit
 */
export function onPlayerHit(typeIds, onHit) {
    for (const id of typeIds) handlers.set(id, onHit);
    if (subscribed) return;
    subscribed = true;
    world.afterEvents.entityHitEntity.subscribe((ev) => {
        const handler = handlers.get(ev.hitEntity?.typeId);
        if (!handler) return;
        if (!(ev.damagingEntity instanceof Player)) return;
        handler(ev.damagingEntity);
    });
}
