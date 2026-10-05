import { CommandPermissionLevel, CustomCommandStatus, EntityInitializationCause, Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PROP_OFF = "phantom:off"; // player: true = phantoms off, false = on (only stored when it differs from defaultOff)

/** @param {Player} player */
function phantomsOff(player) {
  const v = player.getDynamicProperty(PROP_OFF);
  return typeof v === "boolean" ? v : CONFIG.defaultOff;
}

// Natural phantom spawns appear high above a player who hasn't slept. Each phantom of a
// group gets its own event; only its nearest player's choice counts.
world.afterEvents.entitySpawn.subscribe(({ entity, cause }) => {
  if (cause !== EntityInitializationCause.Spawned || entity.typeId !== "minecraft:phantom") return;
  try {
    const at = entity.location;
    const [nearest] = entity.dimension.getPlayers({ location: at, maxDistance: CONFIG.searchRadius, closest: 1 });
    if (!nearest || !phantomsOff(nearest)) return;
    if (at.y - nearest.location.y < CONFIG.minHeightAbovePlayer) return; // spawn egg or summoned nearby
    entity.remove(); // removed, not killed: no drops, no membranes
  } catch (e) {
    console.warn(`[phantom] ${e}`);
  }
});

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:phantoms",
      description: "Turn phantoms off or on for yourself",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      }
      const nowOff = !phantomsOff(player);
      system.run(() => player.setDynamicProperty(PROP_OFF, nowOff === CONFIG.defaultOff ? undefined : nowOff));
      return {
        status: CustomCommandStatus.Success,
        message: nowOff
          ? "Phantoms off for you. Run it again to turn them back on."
          : "Phantoms on for you. Run it again to turn them off.",
      };
    }
  );
});
