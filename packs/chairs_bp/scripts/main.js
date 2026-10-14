import { Block, CommandPermissionLevel, CustomCommandStatus, Dimension, Entity, Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

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
    if (id.includes("double") || perm.getState("minecraft:vertical_half") !== "bottom") return undefined;
    return {};
  }
  return undefined;
}

/** @param {Dimension} dim @param {import("@minecraft/server").Vector3} at */
const seatsNear = (dim, at, radius = 0.75) => dim.getEntities({ type: SEAT, location: at, maxDistance: radius });

/** @param {Entity} seat */
const riders = (seat) => seat.getComponent("minecraft:rideable")?.getRiders() ?? [];

/** A note above the hotbar; `realm:actionbar` first, so the Coordinates HUD and other bar writers wait. @param {Player} player @param {string} text */
function note(player, text) {
  system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: player.id, ticks: 40, from: "chairs_bp" }));
  player.onScreenDisplay.setActionBar(text);
}

/**
 * Spawns a seat and puts the player on it.
 * @param {Player} player @param {Dimension} dim @param {import("@minecraft/server").Vector3} at seat location
 * @param {number | undefined} yaw @param {boolean} onBlock
 */
function sit(player, dim, at, yaw, onBlock) {
  for (const old of seatsNear(dim, at)) {
    // A seat spawned this moment may not list its rider yet: it's taken too.
    if (riders(old).length || system.currentTick - (born.get(old.id) ?? -Infinity) < GRACE_TICKS) {
      note(player, "§7Someone is already sitting there");
      return;
    }
    born.delete(old.id);
    old.remove();
  }
  const seat = dim.spawnEntity(SEAT, at);
  born.set(seat.id, system.currentTick);
  if (onBlock) seat.addTag(BLOCK_TAG);
  if (yaw !== undefined) {
    seat.setRotation({ x: 0, y: yaw });
    player.teleport(player.location, { rotation: { x: player.getRotation().x, y: yaw } });
  }
  if (seat.getComponent("minecraft:rideable")?.addRider(player)) note(player, "§7Sneak to stand up");
  else {
    born.delete(seat.id);
    seat.remove();
  }
}

/** @param {Player} player */
const isRiding = (player) => !!player.getComponent("minecraft:riding");

// ---------------------------------------------------------------------------
// Access checks: may this player use that block? (Land Claims answers for someone else's claim.)
// ---------------------------------------------------------------------------
//   realm:access_check        { id, player, spots: [[dim, x, y, z], ...] }
//   realm:access_check_result { id, from, closed: [i, ...] }
// In the Realm Bundle this pack's tap handler runs before Land Claims', so it never sees a claim's cancel: each
// stair or slab tap asks first. Every protection pack answers every check, so the ask waits for each pack that
// has answered before (2 s at most), or 5 ticks while none has; a hello 3 s after load learns who answers.

/** Packs that have answered an access check. @type {Set<string>} */
const accessResponders = new Set();
/** @type {Map<string, { got: Set<string>, closed: boolean, check: () => void }>} */
const accessAsks = new Map();
let accessNext = 1;

/**
 * Whether another pack says this player may not use the block at `at` (someone else's land claim).
 * @param {string} playerId @param {string} dim @param {import("@minecraft/server").Vector3} at
 * @returns {Promise<boolean>}
 */
function closedTo(playerId, dim, at) {
  return new Promise((resolve) => {
    const waitFor = [...accessResponders];
    const id = `chairs${accessNext++}`;
    let done = false;
    const ask = {
      got: new Set(),
      closed: false,
      check: () => {
        if (ask.closed || (waitFor.length && waitFor.every((r) => ask.got.has(r)))) finish();
      },
    };
    const finish = () => {
      if (done) return;
      done = true;
      accessAsks.delete(id);
      resolve(ask.closed);
    };
    accessAsks.set(id, ask);
    system.sendScriptEvent("realm:access_check", JSON.stringify({ id, player: playerId, spots: [[dim, at.x, at.y, at.z]] }));
    system.runTimeout(finish, waitFor.length ? 40 : 5);
  });
}

/** @param {string} message a realm:access_check_result */
function accessResult(message) {
  const m = JSON.parse(message);
  if (!m || typeof m.from !== "string") return;
  const from = m.from.slice(0, 32);
  accessResponders.add(from);
  const ask = accessAsks.get(String(m.id));
  if (!ask) return;
  ask.got.add(from);
  if (Array.isArray(m.closed) && m.closed.includes(0)) ask.closed = true;
  ask.check();
}

system.run(() =>
  system.runTimeout(() => system.sendScriptEvent("realm:access_check", JSON.stringify({ id: "hello", player: "", spots: [] })), 60)
);

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { player, block, itemStack, isFirstEvent } = event;
  if (event.cancel || !isFirstEvent || itemStack || player.isSneaking) return; // canceled: another pack refused the tap
  const seat = seatFor(block);
  if (!seat || !block.above(1)?.isAir || !block.above(2)?.isAir) return;
  const { x, y, z } = block.location;
  const p = player.location;
  if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y, z + 0.5 - p.z) > get("maxReach") || isRiding(player)) return;

  event.cancel = true;
  const dim = block.dimension;
  const at = { x, y, z };
  // Asked on the next tick, outside this read-only event; the seat comes once the answer allows it.
  system.run(() =>
    closedTo(player.id, dim.id, at)
      .then((closed) => {
        if (closed || !player.isValid || isRiding(player)) return;
        const b = dim.getBlock(at);
        const again = b && seatFor(b);
        if (again) sit(player, dim, { x: x + 0.5, y: y + CONFIG.seatHeight, z: z + 0.5 }, again.yaw, true);
      })
      .catch((e) => console.warn(`[chairs] ${e}`))
  );
});

// Breaking the block under a seat stands its rider up straight away.
world.afterEvents.playerBreakBlock.subscribe(({ block }) => {
  const { x, y, z } = block.location;
  for (const seat of seatsNear(block.dimension, { x: x + 0.5, y: y + CONFIG.seatHeight, z: z + 0.5 })) removeSeat(seat);
});

/** @param {Entity} seat */
function removeSeat(seat) {
  born.delete(seat.id);
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
      return { status: CustomCommandStatus.Success };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "chairs_bp");
    else if (id === "realm:access_check_result") {
      try {
        accessResult(message);
      } catch (e) {
        console.warn(`[chairs] ${e}`);
      }
    }
  },
  { namespaces: ["realm"] }
);
