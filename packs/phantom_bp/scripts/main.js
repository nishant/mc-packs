import { CommandPermissionLevel, CustomCommandStatus, EntityInitializationCause, Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { getFor, setFor } from "./settings.js";

// Player property "phantom:off" (true = off, false = on, only stored when it differs from defaultOff)
// is the "off" preference in settings.js, which /realm:prefs changes too.

/** @param {Player} player */
const phantomsOff = (player) => getFor(player, "off") === true;

// Natural phantom spawns appear high above a player who hasn't slept. Each phantom of a
// group gets its own event; only its nearest player's choice counts.
world.afterEvents.entitySpawn.subscribe(({ entity, cause }) => {
  if (entity.typeId !== "minecraft:phantom") return;
  // Insomnia spawns are natural (Spawned), possibly reported as a game event (Event); never Loaded or Born.
  if (cause !== EntityInitializationCause.Spawned && cause !== EntityInitializationCause.Event) return;
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
      system.run(() => setFor(player, "off", nowOff));
      return {
        status: CustomCommandStatus.Success,
        message: nowOff
          ? "Phantoms off for you. Run it again to turn them back on."
          : "Phantoms on for you. Run it again to turn them off.",
      };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "phantom_bp");
  },
  { namespaces: ["realm"] }
);
