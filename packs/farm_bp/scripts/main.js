import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  Player,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, MessageFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

const PROP_AREAS = "farm:areas"; // world: JSON Farm[] (the game keeps the ticking areas; this is for the menu)

const MIN_RADIUS = 1;
const MAX_RADIUS = 4;
const NAME_RE = /^[A-Za-z0-9_-]{1,24}$/;
const EDIT_LEVEL = CONFIG.everyoneCanAdd ? CommandPermissionLevel.Any : CommandPermissionLevel.GameDirectors;

/** @typedef {{ name: string, dim: string, x: number, z: number, radius: number, by: string, at: number }} Farm */

/** @returns {Farm[]} */
function getFarms() {
  const raw = world.getDynamicProperty(PROP_AREAS);
  if (typeof raw !== "string") return [];
  try {
    const list = JSON.parse(raw);
    // Keep only well-formed entries, so one damaged entry can't break the menu or the commands.
    return Array.isArray(list)
      ? list.filter((f) => f && typeof f.name === "string" && typeof f.dim === "string" && typeof f.radius === "number")
      : [];
  } catch {
    return [];
  }
}

/** @param {Farm[]} list */
const saveFarms = (list) => world.setDynamicProperty(PROP_AREAS, list.length ? JSON.stringify(list) : undefined);

const dimName = (/** @type {string} */ id) => id.replace(/^minecraft:/, "").replaceAll("_", " ");

/** @param {Farm} f */
const describe = (f) =>
  `§e${f.name}§r - ${dimName(f.dim)} ${f.x}, ${f.z} - radius ${f.radius} - by ${f.by} - ${Number.isFinite(f.at) ? new Date(f.at).toISOString().slice(0, 10) : "?"}`;

/** @param {Player} player */
const canEdit = (player) => CONFIG.everyoneCanAdd || player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

/**
 * Runs a command in a dimension. Returns true if it succeeded at least once.
 * @param {import("@minecraft/server").Dimension} dimension @param {string} command
 */
function tryCommand(dimension, command) {
  try {
    return dimension.runCommand(command).successCount > 0;
  } catch (e) {
    console.warn(`[farm] ${command}: ${e}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Add / remove
// ---------------------------------------------------------------------------

/** @param {Player} player @param {string} name @param {number} radius */
function addFarm(player, name, radius) {
  if (!player.isValid) return; // left before the command's next tick
  const list = getFarms();
  if (list.some((f) => f.name === name)) return player.sendMessage(`§cThere is already a farm "${name}".`);
  const maxAreas = get("maxAreas");
  if (list.length >= maxAreas) return player.sendMessage(`§cAll ${maxAreas} farms are in use. Remove one first (/realm:farm).`);

  const x = Math.floor(player.location.x);
  const y = Math.floor(player.location.y);
  const z = Math.floor(player.location.z);
  if (!tryCommand(player.dimension, `tickingarea add circle ${x} ${y} ${z} ${radius} "${name}" true`)) {
    player.sendMessage(`§cThe game refused to add farm "${name}". The world may already have 10 ticking areas (/tickingarea list).`);
    return;
  }
  list.push({ name, dim: player.dimension.id, x, z, radius, by: player.name, at: Date.now() });
  saveFarms(list);
  player.sendMessage(`§aFarm "${name}" stays loaded (radius ${radius} chunk${radius > 1 ? "s" : ""}, ${list.length}/${maxAreas} used)`);
}

/** @param {Player} player @param {string} name */
function removeFarm(player, name) {
  if (!player.isValid) return;
  const list = getFarms();
  const farm = list.find((f) => f.name === name);
  if (!farm) return player.sendMessage(`§cNo farm "${name}". /realm:farm lists them.`);
  const removed = tryCommand(world.getDimension(farm.dim), `tickingarea remove "${name}"`);
  saveFarms(list.filter((f) => f !== farm));
  player.sendMessage(
    removed ? `§aFarm "${name}" is no longer kept loaded.` : `§eFarm "${name}" removed from the list (its ticking area was already gone).`
  );
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

/**
 * Shows a form, retrying while the player still has chat or another screen open.
 * @template {ActionFormData | MessageFormData} F
 * @param {Player} player @param {F} form
 * @returns {Promise<Awaited<ReturnType<F["show"]>> | undefined>}
 */
async function show(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = /** @type {any} */ (await form.show(player));
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await new Promise((r) => system.runTimeout(() => r(undefined), 20));
  }
  return undefined;
}

/** @param {Player} player */
async function openMenu(player) {
  const list = getFarms();
  if (!list.length) {
    player.sendMessage(`§7No farms are kept loaded.${canEdit(player) ? " Stand in one and run /realm:farm_add <name>." : ""}`);
    return;
  }
  const edit = canEdit(player);
  const form = new ActionFormData()
    .title("Loaded farms")
    .body(`${list.length}/${get("maxAreas")} in use.\n\n${list.map(describe).join("\n")}`);
  if (edit) for (const f of list) form.button(`Remove ${f.name}`);
  form.button("Close");

  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !edit || res.selection >= list.length) return;
  const farm = list[res.selection];
  const confirm = await show(
    player,
    new MessageFormData()
      .title("Remove farm")
      .body(`Stop keeping "${farm.name}" loaded?\n\n${describe(farm)}`)
      .button1("Remove")
      .button2("Cancel")
  );
  if (!confirm || confirm.canceled || !player.isValid) return;
  if (confirm.selection === 0) removeFarm(player, farm.name);
  return openMenu(player); // back to the list, to remove another or check the result
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** @param {import("@minecraft/server").CustomCommandOrigin} origin */
const originPlayer = (origin) => {
  const p = origin.initiator ?? origin.sourceEntity;
  return p instanceof Player ? p : undefined;
};
const notPlayer = { status: CustomCommandStatus.Failure, message: "Must be run by a player." };

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:farm",
      description: "List the farms kept loaded",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = originPlayer(origin);
      if (!player) return notPlayer;
      system.run(() => openMenu(player).catch((e) => console.warn(`[farm] ${e}`)));
      return { status: CustomCommandStatus.Success };
    }
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:farm_add",
      description: "Keep the chunks around you loaded as a named farm",
      permissionLevel: EDIT_LEVEL,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "name", type: CustomCommandParamType.String }],
      optionalParameters: [{ name: "radius", type: CustomCommandParamType.Integer }],
    },
    (origin, /** @type {string} */ name, /** @type {number | undefined} */ radius) => {
      const player = originPlayer(origin);
      if (!player) return notPlayer;
      if (!NAME_RE.test(name)) {
        return { status: CustomCommandStatus.Failure, message: "Farm names use letters, digits, _ and - (up to 24)." };
      }
      const r = radius ?? get("defaultRadius");
      if (r < MIN_RADIUS || r > MAX_RADIUS) {
        return { status: CustomCommandStatus.Failure, message: `Radius must be ${MIN_RADIUS} to ${MAX_RADIUS} chunks.` };
      }
      system.run(() => addFarm(player, name, r));
      return { status: CustomCommandStatus.Success };
    }
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:farm_remove",
      description: "Stop keeping a farm loaded",
      permissionLevel: EDIT_LEVEL,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "name", type: CustomCommandParamType.String }],
    },
    (origin, /** @type {string} */ name) => {
      const player = originPlayer(origin);
      if (!player) return notPlayer;
      system.run(() => removeFarm(player, name));
      return { status: CustomCommandStatus.Success };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "farm_bp");
  },
  { namespaces: ["realm"] }
);
