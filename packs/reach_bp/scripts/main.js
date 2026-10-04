import {
  BlockPermutation,
  BlockTypes,
  Direction,
  EquipmentSlot,
  GameMode,
  Player,
  PlayerPermissionLevel,
  system,
  world,
} from "@minecraft/server";
import { CONFIG } from "./config.js";

/** @typedef {import("@minecraft/server").Block} Block */
/** @typedef {import("@minecraft/server").BlockRaycastHit} BlockRaycastHit */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

const MAX_REACH = CONFIG.vanillaReach * CONFIG.reachMultiplier;

/** Blocks you can place straight into, replacing what's there (like vanilla). */
const REPLACEABLE = new Set([
  "minecraft:air",
  "minecraft:water",
  "minecraft:flowing_water",
  "minecraft:lava",
  "minecraft:flowing_lava",
  "minecraft:short_grass",
  "minecraft:tall_grass",
  "minecraft:fern",
  "minecraft:large_fern",
  "minecraft:deadbush",
  "minecraft:seagrass",
  "minecraft:snow_layer",
  "minecraft:vine",
  "minecraft:fire",
  "minecraft:soul_fire",
  "minecraft:structure_void",
]);

/** Right-clicking these opens or uses them, so vanilla wouldn't place against them unless you're sneaking. */
const INTERACTIVE = /door|gate|button|lever|table|anvil|bed$|bell$|loom|grindstone|stonecutter|beacon|lectern|cake|jukebox|note_?block|repeater|comparator|daylight_detector|respawn_anchor|campfire|composter|cauldron|sign/;

/** @type {Record<Direction, Vector3>} */
const FACE_OFFSET = {
  [Direction.Up]: { x: 0, y: 1, z: 0 },
  [Direction.Down]: { x: 0, y: -1, z: 0 },
  [Direction.North]: { x: 0, y: 0, z: -1 },
  [Direction.South]: { x: 0, y: 0, z: 1 },
  [Direction.West]: { x: -1, y: 0, z: 0 },
  [Direction.East]: { x: 1, y: 0, z: 0 },
};

/** Player id → tick of the last placement (ours or vanilla's), to avoid double-placing. */
const lastPlaceTick = new Map();

// Vanilla handled this click: the player was in normal range of a block.
world.beforeEvents.playerInteractWithBlock.subscribe(({ player }) => {
  lastPlaceTick.set(player.id, system.currentTick);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => lastPlaceTick.delete(playerId));

// itemUse only fires when the click hit nothing in vanilla range, which is the case we extend.
world.beforeEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  const tick = system.currentTick;
  if (tick - (lastPlaceTick.get(player.id) ?? -Infinity) < CONFIG.cooldownTicks) return;
  if (!canBuild(player)) return;

  const typeId = itemStack.typeId;
  if (!BlockTypes.get(typeId) || CONFIG.denyItems.some((re) => re.test(typeId))) return;

  const hit = player.getBlockFromViewDirection({
    maxDistance: MAX_REACH,
    includePassableBlocks: true,
    includeLiquidBlocks: false,
  });
  if (!hit) return;
  if (distance(player.getHeadLocation(), hitPoint(hit)) <= CONFIG.vanillaReach) return;
  if (!player.isSneaking && isInteractive(hit.block)) return;

  // Before events run in read-only mode; do the actual placement on the next tick.
  lastPlaceTick.set(player.id, tick);
  const yaw = player.getRotation().y;
  system.run(() => {
    try {
      place(player, typeId, hit, yaw);
    } catch (e) {
      console.warn(`[reach] ${e}`);
    }
  });
});

// ---------------------------------------------------------------------------

/** @param {Player} player */
function canBuild(player) {
  const mode = player.getGameMode();
  if (mode === GameMode.Adventure || mode === GameMode.Spectator) return false;
  return player.playerPermissionLevel !== PlayerPermissionLevel.Visitor;
}

/** @param {Block} block */
function isInteractive(block) {
  return INTERACTIVE.test(block.typeId) || block.getComponent("minecraft:inventory") !== undefined;
}

/**
 * @param {Player} player
 * @param {string} typeId
 * @param {BlockRaycastHit} hit
 * @param {number} yaw
 */
function place(player, typeId, hit, yaw) {
  if (!player.isValid || !hit.block.isValid) return;

  const target = REPLACEABLE.has(hit.block.typeId) ? hit.block : hit.block.offset(FACE_OFFSET[hit.face]);
  if (!target || !REPLACEABLE.has(target.typeId)) return;

  const { min, max } = target.dimension.heightRange;
  if (target.location.y < min || target.location.y >= max) return;
  if (isOccupied(target)) return;

  // Re-check the held item: the player may have switched slots or run out.
  const hand = player.getComponent("minecraft:equippable")?.getEquipmentSlot(EquipmentSlot.Mainhand);
  if (!hand || !hand.hasItem() || hand.typeId !== typeId) return;

  target.setPermutation(orient(typeId, hit, yaw));

  if (player.getGameMode() !== GameMode.Creative) {
    if (hand.amount > 1) hand.amount -= 1;
    else hand.setItem(undefined);
  }

  const center = { x: target.location.x + 0.5, y: target.location.y + 0.5, z: target.location.z + 0.5 };
  target.dimension.playSound(placeSound(typeId), center);
}

/**
 * Applies the common orientation states vanilla derives from where and how you click.
 * Anything not covered keeps its default orientation.
 * @param {string} typeId
 * @param {BlockRaycastHit} hit
 * @param {number} yaw
 */
function orient(typeId, hit, yaw) {
  let perm = BlockPermutation.resolve(typeId);
  const states = perm.getAllStates();
  const facing = playerFacing(yaw);
  const topHalf = hit.face === Direction.Down || (hit.face !== Direction.Up && hit.faceLocation.y > 0.5);

  /** @type {Record<string, string | number | boolean>} */
  const wanted = {
    pillar_axis:
      hit.face === Direction.Up || hit.face === Direction.Down
        ? "y"
        : hit.face === Direction.East || hit.face === Direction.West
          ? "x"
          : "z",
    // Furnaces, chests, pumpkins, … face the player.
    "minecraft:cardinal_direction": OPPOSITE[facing],
    // Stairs climb away from the player. 0=east 1=west 2=south 3=north.
    weirdo_direction: { east: 0, west: 1, south: 2, north: 3 }[facing],
    upside_down_bit: topHalf,
    "minecraft:vertical_half": topHalf ? "top" : "bottom",
  };

  for (const [state, value] of Object.entries(wanted)) {
    if (!(state in states)) continue;
    try {
      perm = perm.withState(/** @type {any} */ (state), value);
    } catch {
      // Value not valid for this block; keep the default.
    }
  }
  return perm;
}

/** @type {Record<string, string>} */
const OPPOSITE = { north: "south", south: "north", east: "west", west: "east" };

/** Bedrock yaw: 0 = south, 90 = west, ±180 = north, -90 = east. */
function playerFacing(/** @type {number} */ yaw) {
  const y = ((yaw % 360) + 360) % 360;
  if (y < 45 || y >= 315) return "south";
  if (y < 135) return "west";
  if (y < 225) return "north";
  return "east";
}

/** Don't place a block inside a mob or a player, same as vanilla. @param {Block} block */
function isOccupied(block) {
  const { x, y, z } = block.location;
  // Entity locations are at the feet; a 1.8-tall player standing below still overlaps.
  return block.dimension
    .getEntities({ location: { x: x - 0.3, y: y - 1.8, z: z - 0.3 }, volume: { x: 1.6, y: 2.8, z: 1.6 } })
    .some((e) => !/^minecraft:(item|xp_orb|arrow)$/.test(e.typeId));
}

/** Rough match to vanilla's per-material place sounds. @param {string} typeId */
function placeSound(typeId) {
  if (/wool|carpet/.test(typeId)) return "use.cloth";
  if (/log|wood|plank|stem|hyphae|bamboo|fence|bookshelf|barrel|chest/.test(typeId)) return "use.wood";
  if (/sand|concrete_powder/.test(typeId)) return "use.sand";
  if (/gravel/.test(typeId)) return "use.gravel";
  if (/dirt|grass|mud|clay|farmland|mycelium|podzol|hay|leaves|moss/.test(typeId)) return "use.grass";
  return "use.stone";
}

/** @param {BlockRaycastHit} hit */
function hitPoint({ block, faceLocation }) {
  return {
    x: block.location.x + faceLocation.x,
    y: block.location.y + faceLocation.y,
    z: block.location.z + faceLocation.z,
  };
}

/** @param {Vector3} a @param {Vector3} b */
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
