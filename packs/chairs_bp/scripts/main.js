import { Block, CommandPermissionLevel, CustomCommandStatus, Dimension, Entity, Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const SEAT = "realm:seat"; // entities/seat.json: invisible, invulnerable, one rider
const BLOCK_TAG = "chairs:block"; // on seats placed on a stair or slab (not by /realm:sit)
const DIMENSIONS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];
const GRACE_TICKS = 10; // a brand-new seat isn't cleaned up before its rider is on it

/** @type {Map<string, number>} seat id → tick it was spawned */
const born = new Map();

const patterns = CONFIG.blocks.map(
  (glob) => new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")}$`)
);
const listed = (/** @type {string} */ id) => patterns.some((re) => re.test(id));

/** Stair `weirdo_direction` (the side its back is on: 0 east, 1 west, 2 south, 3 north) → yaw facing away from it. */
const STAIR_YAW = [90, -90, 180, 0];

/**
 * Whether a block can be sat on, and which way to face.
 * @param {Block} block
 * @returns {{ yaw?: number } | undefined}
 */
function seatFor(block) {
  const id = block.typeId;
  if (!listed(id)) return undefined;
  const perm = block.permutation;
  if (id.endsWith("_stairs")) {
    if (perm.getState("upside_down_bit") === true) return undefined;
    const dir = perm.getState("weirdo_direction");
    return { yaw: typeof dir === "number" ? STAIR_YAW[dir] : undefined };
  }
  if (id.endsWith("_slab")) {
    if (id.includes("double_slab") || perm.getState("minecraft:vertical_half") !== "bottom") return undefined;
    return {};
  }
  return undefined;
}

/** @param {Dimension} dim @param {import("@minecraft/server").Vector3} at */
const seatsNear = (dim, at, radius = 0.75) => dim.getEntities({ type: SEAT, location: at, maxDistance: radius });

/** @param {Entity} seat */
const riders = (seat) => seat.getComponent("minecraft:rideable")?.getRiders() ?? [];

/**
 * Spawns a seat and puts the player on it.
 * @param {Player} player @param {Dimension} dim @param {import("@minecraft/server").Vector3} at seat location
 * @param {number | undefined} yaw @param {boolean} onBlock
 */
function sit(player, dim, at, yaw, onBlock) {
  for (const old of seatsNear(dim, at)) {
    if (riders(old).length) {
      player.onScreenDisplay.setActionBar("§7Someone is already sitting there");
      return;
    }
    old.remove();
  }
  const seat = dim.spawnEntity(SEAT, at);
  born.set(seat.id, system.currentTick);
  if (onBlock) seat.addTag(BLOCK_TAG);
  if (yaw !== undefined) {
    seat.setRotation({ x: 0, y: yaw });
    player.teleport(player.location, { rotation: { x: player.getRotation().x, y: yaw } });
  }
  if (!seat.getComponent("minecraft:rideable")?.addRider(player)) seat.remove();
}

/** @param {Player} player */
const isRiding = (player) => !!player.getComponent("minecraft:riding");

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { player, block, itemStack, isFirstEvent } = event;
  if (!isFirstEvent || itemStack || player.isSneaking) return;
  const seat = seatFor(block);
  if (!seat || !block.above(1)?.isAir || !block.above(2)?.isAir) return;
  const { x, y, z } = block.location;
  const p = player.location;
  if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y, z + 0.5 - p.z) > CONFIG.maxReach || isRiding(player)) return;

  event.cancel = true;
  const dim = block.dimension;
  system.run(() => {
    try {
      if (player.isValid && !isRiding(player)) sit(player, dim, { x: x + 0.5, y: y + CONFIG.seatHeight, z: z + 0.5 }, seat.yaw, true);
    } catch (e) {
      console.warn(`[chairs] ${e}`);
    }
  });
});

// Breaking the block under a seat stands its rider up straight away.
world.afterEvents.playerBreakBlock.subscribe(({ block }) => {
  const { x, y, z } = block.location;
  for (const seat of seatsNear(block.dimension, { x: x + 0.5, y: y + CONFIG.seatHeight, z: z + 0.5 })) removeSeat(seat);
});

/** @param {Entity} seat */
function removeSeat(seat) {
  seat.getComponent("minecraft:rideable")?.ejectRiders();
  seat.remove();
}

// Empty seats, and seats whose stair or slab is gone, are removed. This also clears seats left
// over from before a restart as soon as their chunk loads.
system.runInterval(() => {
  for (const id of DIMENSIONS) {
    const dim = world.getDimension(id);
    for (const seat of dim.getEntities({ type: SEAT })) {
      try {
        if (system.currentTick - (born.get(seat.id) ?? -Infinity) < GRACE_TICKS) continue;
        born.delete(seat.id);
        if (!riders(seat).length) {
          seat.remove();
          continue;
        }
        if (!seat.hasTag(BLOCK_TAG)) continue;
        const { x, y, z } = seat.location;
        const below = dim.getBlock({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
        if (below && !seatFor(below)) removeSeat(seat);
      } catch (e) {
        console.warn(`[chairs] ${e}`);
      }
    }
  }
}, CONFIG.cleanupTicks);

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:sit",
      description: "Sit down where you stand (sneak to stand up)",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      }
      if (isRiding(player)) return { status: CustomCommandStatus.Failure, message: "You're already sitting or riding." };
      if (!player.isOnGround) return { status: CustomCommandStatus.Failure, message: "Stand on the ground first." };
      system.run(() => {
        try {
          const { x, y, z } = player.location;
          // Seat heights are measured from a half block's bottom; on flat ground that is half a block lower.
          sit(player, player.dimension, { x, y: y + CONFIG.seatHeight - 0.5, z }, undefined, false);
        } catch (e) {
          console.warn(`[chairs] ${e}`);
        }
      });
      return { status: CustomCommandStatus.Success, message: "Sneak to stand up." };
    }
  );
});
