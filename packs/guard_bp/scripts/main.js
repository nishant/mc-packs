import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  Player,
  system,
  world,
} from "@minecraft/server";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

const PROP_ZONES = "guard:zones"; // world: JSON Zone[]

const MIN_RADIUS = 8;
const MAX_RADIUS = 256;
const MAX_ZONES = 100;
const NAME_RE = /^[A-Za-z0-9_-]{1,24}$/;

/** @typedef {{ name: string, dim: string, x: number, y: number, z: number, radius: number }} Zone */

const sources = new Set(CONFIG.sources);
/** The mode can change in game (/realm:config): read it each time. The value is cached, so explosions stay cheap. */
const zonesMode = () => get("mode") === "zones";

// ---------------------------------------------------------------------------
// Zones (cached: the explosion before event may read but never write)
// ---------------------------------------------------------------------------

/** @type {Zone[] | undefined} */
let zones;

/** @returns {Zone[]} */
function getZones() {
  if (zones) return zones;
  const raw = world.getDynamicProperty(PROP_ZONES);
  try {
    zones = typeof raw === "string" ? JSON.parse(raw) : [];
  } catch {
    zones = [];
  }
  return /** @type {Zone[]} */ (zones);
}

/** @param {Zone[]} list */
function saveZones(list) {
  zones = list;
  world.setDynamicProperty(PROP_ZONES, list.length ? JSON.stringify(list) : undefined);
}

/**
 * @param {string} dim
 * @param {import("@minecraft/server").Vector3} p
 */
function inAnyZone(dim, p) {
  return !!zoneAt(dim, p);
}

/**
 * The first zone holding block `p`.
 * @param {string} dim
 * @param {import("@minecraft/server").Vector3} p
 */
function zoneAt(dim, p) {
  for (const z of getZones()) {
    if (z.dim !== dim) continue;
    const dx = p.x + 0.5 - z.x;
    const dy = p.y + 0.5 - z.y;
    const dz = p.z + 0.5 - z.z;
    if (dx * dx + dy * dy + dz * dz <= z.radius * z.radius) return z;
  }
  return undefined;
}

/** Zone names match whatever their case. @param {Zone} z @param {string} name */
const named = (z, name) => z.name.toLowerCase() === name.toLowerCase();

// ---------------------------------------------------------------------------
// The guard itself
// ---------------------------------------------------------------------------

// Don't cancel the event: that would also remove the damage, knockback and drops.
world.beforeEvents.explosion.subscribe((event) => {
  const type = event.source?.typeId;
  if (!type || !sources.has(type)) return; // TNT, beds, respawn anchors: no source or not listed
  try {
    if (!zonesMode()) {
      event.setImpactedBlocks([]);
      return;
    }
    const dim = event.dimension.id;
    const blocks = event.getImpactedBlocks();
    const kept = blocks.filter((b) => !inAnyZone(dim, b.location));
    if (kept.length !== blocks.length) event.setImpactedBlocks(kept);
  } catch (e) {
    console.warn(`[guard] ${e}`);
  }
});

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const shortId = (/** @type {string} */ id) => id.replace(/^minecraft:/, "").replaceAll("_", " ");

/** @param {Zone} z */
const describeZone = (z) =>
  `§e${z.name}§r: ${shortId(z.dim)} ${Math.floor(z.x)}, ${Math.floor(z.y)}, ${Math.floor(z.z)}, radius ${z.radius}`;

/** @param {Player | undefined} player */
function statusText(player) {
  const list = getZones();
  /** @type {string[]} */
  let here = [];
  if (player && sources.size) {
    const { x, y, z } = player.location;
    const inZonesMode = zonesMode();
    const zone = inZonesMode ? zoneAt(player.dimension.id, { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) }) : undefined;
    here = [inZonesMode ? (zone ? `§aWhere you stand: protected (zone §e${zone.name}§a)` : "§cWhere you stand: not protected") : "§aWhere you stand: protected"];
  }
  const lines = [
    ...here,
    `§6Creeper Guard§r: ${
      zonesMode() ? "only inside the zones below" : "everywhere (zones are only used in zones mode)"
    }`,
    `Blasts that break no blocks: ${[...sources].map(shortId).join(", ") || "none"}`,
    list.length ? `Zones (${list.length}):` : "No zones.",
    ...list.map((z) => ` - ${describeZone(z)}`),
  ];
  return lines.join("\n");
}

/** @param {import("@minecraft/server").CustomCommandOrigin} origin */
const originPlayer = (origin) => {
  const p = origin.initiator ?? origin.sourceEntity;
  return p instanceof Player ? p : undefined;
};

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:guard",
      description: "Show the Creeper Guard mode, blast sources and protected zones",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => ({ status: CustomCommandStatus.Success, message: statusText(originPlayer(origin)) })
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:guard_add",
      description: "Protect a sphere around you from creeper blasts (zones mode)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "name", type: CustomCommandParamType.String }],
      optionalParameters: [{ name: "radius", type: CustomCommandParamType.Integer }],
    },
    (origin, /** @type {string} */ name, /** @type {number | undefined} */ radius) => {
      const player = originPlayer(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      if (!NAME_RE.test(name)) {
        return { status: CustomCommandStatus.Failure, message: "Zone names use letters, digits, _ and - (up to 24)." };
      }
      const r = radius ?? get("defaultRadius");
      if (r < MIN_RADIUS || r > MAX_RADIUS) {
        return { status: CustomCommandStatus.Failure, message: `Radius must be ${MIN_RADIUS} to ${MAX_RADIUS} blocks.` };
      }
      const list = getZones();
      const taken = list.find((z) => named(z, name));
      if (taken) {
        return {
          status: CustomCommandStatus.Failure,
          message: `There is already a zone "${taken.name}". Remove it first with /realm:guard_remove ${taken.name}.`,
        };
      }
      if (list.length >= MAX_ZONES) {
        return { status: CustomCommandStatus.Failure, message: `At most ${MAX_ZONES} zones.` };
      }
      const { x, y, z } = player.location;
      /** @type {Zone} */
      const zone = { name, dim: player.dimension.id, x: Math.round(x), y: Math.round(y), z: Math.round(z), radius: r };
      system.run(() => saveZones([...getZones(), zone]));
      return {
        status: CustomCommandStatus.Success,
        message: `Zone added: ${describeZone(zone)}${zonesMode() ? "" : "\n§7Mode is everywhere, so zones have no effect until an operator sets the mode to zones in /realm:config."}`,
      };
    }
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:guard_remove",
      description: "Remove a Creeper Guard zone",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "name", type: CustomCommandParamType.String }],
    },
    (_origin, /** @type {string} */ name) => {
      const zone = getZones().find((z) => named(z, name));
      if (!zone) {
        return { status: CustomCommandStatus.Failure, message: `No zone "${name}". /realm:guard lists them.` };
      }
      system.run(() => saveZones(getZones().filter((z) => z.name !== zone.name)));
      return { status: CustomCommandStatus.Success, message: `Zone "${zone.name}" removed.` };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "guard_bp");
  },
  { namespaces: ["realm"] }
);
