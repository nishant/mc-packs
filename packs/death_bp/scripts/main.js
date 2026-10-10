import { CommandPermissionLevel, CustomCommandStatus, Dimension, Player, system, world } from "@minecraft/server";
import { get, getFor } from "./settings.js";

// Player property "death:last": JSON { d, x, y, z, told, used } of the player's last death: the
// dimension id, the block they died in, whether the respawn message was sent and whether
// /realm:death_back was used for it. World property "death:areas": JSON list of the temporary ticking
// areas /realm:death_back added and hasn't removed yet, so a restart can clean them up.

const LAST_PROP = "death:last";
const AREAS_PROP = "death:areas";

/** Blocks a player can stand in: the feet and head of a landing spot (plants and other blocks without collision). */
const PASSABLE = new Set([
  "minecraft:air",
  "minecraft:short_grass",
  "minecraft:tall_grass",
  "minecraft:fern",
  "minecraft:large_fern",
  "minecraft:deadbush",
  "minecraft:dead_bush",
  "minecraft:short_dry_grass",
  "minecraft:tall_dry_grass",
  "minecraft:bush",
  "minecraft:dandelion",
  "minecraft:poppy",
  "minecraft:blue_orchid",
  "minecraft:allium",
  "minecraft:azure_bluet",
  "minecraft:red_tulip",
  "minecraft:orange_tulip",
  "minecraft:white_tulip",
  "minecraft:pink_tulip",
  "minecraft:oxeye_daisy",
  "minecraft:cornflower",
  "minecraft:lily_of_the_valley",
  "minecraft:torchflower",
  "minecraft:sunflower",
  "minecraft:lilac",
  "minecraft:rose_bush",
  "minecraft:peony",
  "minecraft:pink_petals",
  "minecraft:wildflowers",
  "minecraft:leaf_litter",
  "minecraft:vine",
  "minecraft:glow_lichen",
  "minecraft:torch",
]);
/** Blocks never to land on. */
const BAD_GROUND = new Set([
  "minecraft:lava",
  "minecraft:flowing_lava",
  "minecraft:magma",
  "minecraft:magma_block",
  "minecraft:fire",
  "minecraft:soul_fire",
  "minecraft:campfire",
  "minecraft:soul_campfire",
  "minecraft:cactus",
  "minecraft:sweet_berry_bush",
  "minecraft:wither_rose",
  "minecraft:powder_snow",
  "minecraft:pointed_dripstone",
]);
/** Blocks never to land next to. */
const HOT = new Set(["minecraft:lava", "minecraft:flowing_lava", "minecraft:fire", "minecraft:soul_fire"]);

const DIMENSION_NAMES = /** @type {Record<string, string>} */ ({
  "minecraft:overworld": "the Overworld",
  "minecraft:nether": "the Nether",
  "minecraft:the_end": "the End",
});
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** @typedef {{ d: string, x: number, y: number, z: number, told: boolean, used: boolean }} DeathPoint */

/** @param {Player} player @returns {DeathPoint | undefined} */
function lastDeath(player) {
  try {
    const raw = player.getDynamicProperty(LAST_PROP);
    if (typeof raw !== "string") return undefined;
    const p = JSON.parse(raw);
    if (!p || typeof p.d !== "string" || ![p.x, p.y, p.z].every(Number.isFinite)) return undefined;
    return { d: p.d, x: p.x, y: p.y, z: p.z, told: p.told === true, used: p.used === true };
  } catch {
    return undefined;
  }
}

/** @param {Player} player @param {DeathPoint} point */
const saveDeath = (player, point) => player.setDynamicProperty(LAST_PROP, JSON.stringify(point));

/** @param {string} id */
const dimensionName = (id) => DIMENSION_NAMES[id] ?? id.replace(/^minecraft:/, "");

/** @param {DeathPoint} p */
const coords = (p) => `${p.x}, ${p.y}, ${p.z}`;

// ---------------------------------------------------------------------------
// Remember the death, tell the player once they respawn
// ---------------------------------------------------------------------------

world.afterEvents.entityDie.subscribe(
  ({ deadEntity }) => {
    if (!(deadEntity instanceof Player)) return;
    try {
      const at = deadEntity.location;
      saveDeath(deadEntity, {
        d: deadEntity.dimension.id,
        x: Math.floor(at.x),
        y: Math.floor(at.y),
        z: Math.floor(at.z),
        told: false,
        used: false,
      });
    } catch (e) {
      console.warn(`[death] ${e}`);
    }
  },
  { entityTypes: ["minecraft:player"] }
);

// Any spawn counts, so a player who leaves on the death screen hears it when they come back.
world.afterEvents.playerSpawn.subscribe(({ player }) => {
  try {
    const point = lastDeath(player);
    if (!point || point.told) return;
    saveDeath(player, { ...point, told: true });
    if (getFor(player, "announce") !== true) return;
    player.sendMessage(`§eYou died at §f${coords(point)}§e in ${dimensionName(point.d)}.§7 Run /realm:death to see where that is from here.`);
  } catch (e) {
    console.warn(`[death] ${e}`);
  }
});

// ---------------------------------------------------------------------------
// /realm:death
// ---------------------------------------------------------------------------

/** @param {Player} player @param {DeathPoint} point */
function describe(player, point) {
  const lines = [`§eYour last death point: §f${coords(point)}§e in ${dimensionName(point.d)}.`];
  if (player.dimension.id !== point.d) {
    lines.push(`§7You're in ${dimensionName(player.dimension.id)} now, so there's no distance to show.`);
  } else {
    const here = player.location;
    const dx = point.x + 0.5 - here.x;
    const dz = point.z + 0.5 - here.z;
    const dy = point.y - Math.floor(here.y);
    const flat = Math.round(Math.hypot(dx, dz));
    if (flat < 2 && Math.abs(dy) < 2) lines.push("§7You're standing on it.");
    else {
      const angle = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360; // 0 = north (-z), 90 = east (+x)
      const dir = COMPASS[Math.round(angle / 45) % 8];
      const vertical = dy === 0 ? "" : `, ${Math.abs(dy)} block${Math.abs(dy) === 1 ? "" : "s"} ${dy > 0 ? "up" : "down"}`;
      lines.push(flat < 2 ? `§7It's right here${vertical}.` : `§7It's ${flat} block${flat === 1 ? "" : "s"} to the ${dir}${vertical}.`);
    }
  }
  if (get("backEnabled") === true) {
    lines.push(point.used ? "§7You already used /realm:death_back for this death." : "§7Run /realm:death_back to teleport there (once per death).");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// /realm:death_back
// ---------------------------------------------------------------------------

/** Player ids with a /realm:death_back in progress. */
const busy = new Set();

/**
 * The block's type id, or undefined when its chunk isn't loaded. One search reads each block once:
 * neighboring spots share their ground, feet, head and sides.
 * @param {Dimension} dim @param {number} x @param {number} y @param {number} z @param {Map<string, string | undefined>} [seen]
 */
function blockAt(dim, x, y, z, seen) {
  const key = `${x},${y},${z}`;
  if (seen?.has(key)) return seen.get(key);
  let id;
  try {
    id = dim.getBlock({ x, y, z })?.typeId;
  } catch {
    id = undefined; // unloaded chunk
  }
  seen?.set(key, id);
  return id;
}

const AIRS = new Set(["minecraft:air", "minecraft:cave_air", "minecraft:void_air"]);
const LIQUIDS = new Set(["minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava", "minecraft:bubble_column"]);

/**
 * Can a player stand with their feet in this block? true, false, or undefined when its chunk isn't loaded.
 * @param {Dimension} dim @param {number} x @param {number} y @param {number} z
 */
function safeAt(dim, x, y, z, seen = new Map()) {
  const range = dim.heightRange;
  if (y - 1 < range.min || y + 1 >= range.max) return false;
  const ground = blockAt(dim, x, y - 1, z, seen);
  const feet = blockAt(dim, x, y, z, seen);
  const head = blockAt(dim, x, y + 1, z, seen);
  if (!ground || !feet || !head) return undefined;
  if (!PASSABLE.has(feet) || !PASSABLE.has(head)) return false;
  if (AIRS.has(ground) || LIQUIDS.has(ground) || PASSABLE.has(ground) || BAD_GROUND.has(ground)) return false;
  for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const side = blockAt(dim, x + ox, y, z + oz, seen);
    if (!side) return undefined;
    if (HOT.has(side)) return false;
  }
  return true;
}

/**
 * The nearest safe spot to the death point: a block position, "none", or "unloaded".
 * @param {DeathPoint} point @returns {{ x: number, y: number, z: number } | "none" | "unloaded"}
 */
function findSpot(point) {
  const dim = world.getDimension(point.d);
  if (!blockAt(dim, point.x, Math.min(Math.max(point.y, dim.heightRange.min), dim.heightRange.max - 1), point.z)) return "unloaded";
  const r = get("backSearchRadius");
  const h = get("backSearchHeight");
  /** @type {Map<string, string | undefined>} */
  const seen = new Map();
  /** @type {[number, number, number][]} */
  const offsets = [];
  for (let dy = -h; dy <= h; dy++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) offsets.push([dx, dy, dz]);
  // Nearest first; at the same distance, higher first (dying usually happens on the way down).
  offsets.sort((a, b) => a[0] ** 2 + a[1] ** 2 + a[2] ** 2 - (b[0] ** 2 + b[1] ** 2 + b[2] ** 2) || b[1] - a[1]);
  let unloaded = false;
  for (const [dx, dy, dz] of offsets) {
    const x = point.x + dx;
    const y = point.y + dy;
    const z = point.z + dz;
    const ok = safeAt(dim, x, y, z, seen);
    if (ok) return { x, y, z };
    if (ok === undefined) unloaded = true;
  }
  return unloaded ? "unloaded" : "none";
}

/** @param {string[]} names */
const saveAreas = (names) => world.setDynamicProperty(AREAS_PROP, names.length ? JSON.stringify(names) : undefined);

/** @returns {string[]} */
function savedAreas() {
  try {
    const raw = world.getDynamicProperty(AREAS_PROP);
    const list = typeof raw === "string" ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((n) => typeof n === "string") : [];
  } catch {
    return [];
  }
}

/** @param {Dimension} dim @param {string} command */
function tryCommand(dim, command) {
  try {
    return dim.runCommand(command).successCount > 0;
  } catch {
    return false;
  }
}

/** @param {string} dimId @param {string} name */
function removeArea(dimId, name) {
  tryCommand(world.getDimension(dimId), `tickingarea remove "${name}"`);
  saveAreas(savedAreas().filter((n) => n !== `${dimId}|${name}`));
}

// Ticking areas left over from a restart in the middle of a /realm:death_back.
world.afterEvents.worldLoad.subscribe(() => {
  for (const entry of savedAreas()) {
    const [dimId, name] = entry.split("|");
    try {
      tryCommand(world.getDimension(dimId), `tickingarea remove "${name}"`);
    } catch {
      // unknown dimension: nothing to remove
    }
  }
  saveAreas([]);
});

/** @param {Player} player @param {DeathPoint} point */
function startBack(player, point) {
  const spot = findSpot(point);
  if (spot !== "unloaded") return finishBack(player, point, spot);

  // Far away: load the death point with a small temporary ticking area, then look again.
  const dim = world.getDimension(point.d);
  const name = `death_back_${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`; // unique even for two players in one tick
  const pid = player.id; // still readable once the player has left
  const y = Math.min(Math.max(point.y, dim.heightRange.min), dim.heightRange.max - 1); // a death below the world
  if (!tryCommand(dim, `tickingarea add circle ${point.x} ${y} ${point.z} 1 "${name}" true`)) {
    busy.delete(player.id);
    player.sendMessage("§cYour death point can't be loaded right now (the realm may already have 10 ticking areas). Try again later.");
    return;
  }
  saveAreas([...savedAreas(), `${point.d}|${name}`]);
  const deadline = system.currentTick + get("backLoadSeconds") * 20;
  const job = system.runInterval(() => {
    let result = /** @type {ReturnType<typeof findSpot>} */ ("unloaded");
    try {
      if (player.isValid) result = findSpot(point);
    } catch (e) {
      console.warn(`[death] ${e}`);
    }
    if (result === "unloaded" && player.isValid && system.currentTick < deadline) return;
    system.clearRun(job);
    try {
      if (!player.isValid) busy.delete(pid);
      else if (result === "unloaded") {
        busy.delete(pid);
        player.sendMessage("§cYour death point didn't load in time, so you weren't teleported. Try again in a moment.");
      } else finishBack(player, point, result);
    } finally {
      removeArea(point.d, name);
    }
  }, 5);
}

/** @param {Player} player @param {DeathPoint} point @param {{ x: number, y: number, z: number } | "none"} spot */
function finishBack(player, point, spot) {
  busy.delete(player.id);
  const current = lastDeath(player);
  // Died again (or already went back) while the spot was loading.
  if (!current || current.used || current.d !== point.d || current.x !== point.x || current.y !== point.y || current.z !== point.z) {
    player.sendMessage("§cYour death point changed while it was loading. Run /realm:death to see the new one.");
    return;
  }
  if (spot === "none") {
    player.sendMessage(
      `§cThere's no safe place to stand near your death point (${coords(point)}), so you weren't teleported. It may be in lava, water, a wall or the void.`
    );
    return;
  }
  const ok = player.tryTeleport(
    { x: spot.x + 0.5, y: spot.y, z: spot.z + 0.5 },
    { dimension: world.getDimension(point.d), checkForBlocks: true, keepVelocity: false }
  );
  if (!ok) {
    player.sendMessage("§cThe teleport was blocked, so you weren't moved. Try again in a moment.");
    return;
  }
  saveDeath(player, { ...current, used: true });
  player.sendMessage(`§aTeleported back to your death point (${spot.x}, ${spot.y}, ${spot.z}).§7 /realm:death_back works again after your next death.`);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** @param {import("@minecraft/server").CustomCommandOrigin} origin */
const playerOf = (origin) => {
  const p = origin.initiator ?? origin.sourceEntity;
  return p instanceof Player ? p : undefined;
};

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:death",
      description: "Show where you last died, how far away it is and in which direction",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = playerOf(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      const point = lastDeath(player);
      if (!point) return { status: CustomCommandStatus.Success, message: "§7No death point saved yet. Stay safe!" };
      return { status: CustomCommandStatus.Success, message: describe(player, point) };
    }
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:death_back",
      description: "Teleport to your last death point, once per death (when an operator enabled it)",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = playerOf(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      if (get("backEnabled") !== true) {
        return {
          status: CustomCommandStatus.Failure,
          message: "Teleporting back is disabled on this realm. An operator can enable it in /realm:config (Death Point). /realm:death still shows the way.",
        };
      }
      const point = lastDeath(player);
      if (!point) return { status: CustomCommandStatus.Failure, message: "No death point saved yet." };
      if (point.used) return { status: CustomCommandStatus.Failure, message: "You already went back to this death point. /realm:death_back works once per death." };
      if (busy.has(player.id)) return { status: CustomCommandStatus.Failure, message: "Still looking for a safe spot near your death point..." };
      busy.add(player.id);
      system.run(() => {
        try {
          startBack(player, point);
        } catch (e) {
          busy.delete(player.id);
          console.warn(`[death] ${e}`);
          if (player.isValid) player.sendMessage("§cSomething went wrong, so you weren't teleported.");
        }
      });
      return { status: CustomCommandStatus.Success, message: `§7Looking for a safe place near ${coords(point)} in ${dimensionName(point.d)}...` };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "death_bp");
  },
  { namespaces: ["realm"] }
);
