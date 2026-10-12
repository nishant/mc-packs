// Platypus: the realm:platypus mob is all JSON (entities/platypus.json, spawn_rules/platypus.json; the look is in
// platypus_rp). This script adds what JSON can't: nausea when a platypus bites a player, a chat line when a Perry
// spawns, and /realm:platypus to find the nearest ones.
import {
  CommandPermissionLevel,
  CustomCommandStatus,
  EntityInitializationCause,
  Player,
  system,
  world,
} from "@minecraft/server";
import { get } from "./settings.js";

const PLATYPUS = "realm:platypus";
/** How far the Perry message reaches, in blocks. */
const PERRY_RANGE = 64;

/** @param {import("@minecraft/server").Entity} e @returns {boolean} the teal one with the fedora */
function isPerry(e) {
  try {
    return e.getComponent("minecraft:variant")?.value === 1;
  } catch {
    return false;
  }
}

// A bite: the attack component already gives 5 s of poison; add the nausea.
world.afterEvents.entityHurt.subscribe(
  ({ hurtEntity, damageSource }) => {
    if (damageSource.damagingEntity?.typeId !== PLATYPUS) return;
    const seconds = Number(get("nauseaSeconds"));
    if (!(seconds > 0)) return;
    try {
      if (hurtEntity.isValid) hurtEntity.addEffect("minecraft:nausea", Math.round(seconds * 20), { amplifier: 0, showParticles: true });
    } catch (e) {
      console.warn(`[platypus] ${e}`);
    }
  },
  { entityTypes: ["minecraft:player"] }
);

// A Perry sighting: tell the players nearby once, when it spawns (naturally, from an egg or a summon with an event;
// not when its chunk loads again).
world.afterEvents.entitySpawn.subscribe(({ entity, cause }) => {
  if (cause !== EntityInitializationCause.Spawned && cause !== EntityInitializationCause.Event) return;
  let type;
  try {
    type = entity.typeId;
  } catch {
    return;
  }
  if (type !== PLATYPUS) return;
  // The spawn event's variant is set by then, but wait a tick to be safe.
  system.run(() => {
    try {
      if (!entity.isValid || !isPerry(entity) || !get("perryMessage")) return;
      const at = entity.location, dim = entity.dimension.id;
      for (const p of world.getAllPlayers()) {
        if (p.dimension.id !== dim) continue;
        const d = Math.hypot(p.location.x - at.x, p.location.y - at.y, p.location.z - at.z);
        if (d <= PERRY_RANGE) p.sendMessage("§3A teal platypus in a brown fedora is nearby. §7Perry the Platypus?!");
      }
    } catch (e) {
      console.warn(`[platypus] ${e}`);
    }
  });
});

const COMPASS = ["south", "southwest", "west", "northwest", "north", "northeast", "east", "southeast"];
/** Compass direction from a to b (Minecraft: +z is south, +x is east). */
function direction(/** @type {import("@minecraft/server").Vector3} */ a, /** @type {import("@minecraft/server").Vector3} */ b) {
  const deg = (Math.atan2(-(b.x - a.x), b.z - a.z) * 180) / Math.PI; // 0 = south, 90 = west
  return COMPASS[((Math.round(deg / 45) % 8) + 8) % 8];
}

/** /realm:platypus: how many platypuses are near, and where the nearest one is. @param {Player} p */
function find(p) {
  const radius = Number(get("findRadius")) || 64;
  const found = p.dimension.getEntities({ type: PLATYPUS, location: p.location, maxDistance: radius });
  if (!found.length) {
    p.sendMessage(`§7No platypuses within ${radius} blocks. They live along rivers and in swamps and mangrove swamps, near the water.`);
    return;
  }
  const at = p.location;
  const dist = (/** @type {import("@minecraft/server").Entity} */ e) => Math.hypot(e.location.x - at.x, e.location.y - at.y, e.location.z - at.z);
  found.sort((a, b) => dist(a) - dist(b));
  const nearest = found[0];
  const perries = found.filter(isPerry);
  const count = found.length === 1 ? "1 platypus" : `${found.length} platypuses`;
  const d = Math.round(dist(nearest));
  const where = d < 2 ? "right here" : `${d} blocks ${direction(at, nearest.location)}`;
  p.sendMessage(`§6${count} within ${radius} blocks. §fNearest: ${where}${isPerry(nearest) ? " §3(Perry!)" : ""}.`);
  if (perries.length && !isPerry(nearest)) {
    const pd = Math.round(dist(perries[0]));
    p.sendMessage(`§3One of them wears a fedora: ${pd} blocks ${direction(at, perries[0].location)}.`);
  }
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:platypus",
      description: "Platypus: how many platypuses are near you and where the nearest one is",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => {
        try {
          find(player);
        } catch (e) {
          console.warn(`[platypus] ${e}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "platypus_bp");
  },
  { namespaces: ["realm"] }
);
