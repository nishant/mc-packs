import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  Player,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";
import { isProtected, protectedBox, zoneProviders, zonesAt } from "./zones.js";

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
  /** @type {any} */
  let list = [];
  try {
    list = typeof raw === "string" ? JSON.parse(raw) : [];
  } catch {
    // damaged: no zones rather than an error on every explosion
  }
  // Keep only well-formed zones, so one bad entry can't break the explosion check or the commands.
  zones = (Array.isArray(list) ? list : []).filter(
    (/** @type {any} */ z) =>
      z && typeof z.name === "string" && typeof z.dim === "string" &&
      [z.x, z.y, z.z, z.radius].every((n) => typeof n === "number" && Number.isFinite(n))
  );
  return /** @type {Zone[]} */ (zones);
}

/** @param {Zone[]} list */
function saveZones(list) {
  zones = list;
  world.setDynamicProperty(PROP_ZONES, list.length ? JSON.stringify(list) : undefined);
}

/** Safe zones from other packs (Safe Zones, protected towns and claims: scripts/zones.js) count in zones mode. */
const useSafeZones = () => get("safeZones") === true;

/**
 * The first zone holding block `p`.
 * @param {string} dim
 * @param {import("@minecraft/server").Vector3} p
 */
function zoneAt(dim, p) {
  return zoneIn(getZones().filter((z) => z.dim === dim), p);
}

/** The first of these zones holding block `p`. @param {Zone[]} list @param {import("@minecraft/server").Vector3} p */
function zoneIn(list, p) {
  for (const z of list) {
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
  try {
    const type = event.source?.typeId;
    if (!type || !sources.has(type)) return; // TNT, beds, respawn anchors: no source or not listed
    if (!zonesMode()) {
      event.setImpactedBlocks([]);
      return;
    }
    const dim = event.dimension.id;
    const blocks = event.getImpactedBlocks();
    if (!blocks.length) return;
    // Check the blocks only against the zones that reach the blast's box: with many zones, checking every block
    // against every zone took 9-20 ms per creeper (100 zones and 60 safe zones).
    const at = blocks.map((b) => b.location);
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const l of at) {
      x0 = Math.min(x0, l.x), y0 = Math.min(y0, l.y), z0 = Math.min(z0, l.z);
      x1 = Math.max(x1, l.x), y1 = Math.max(y1, l.y), z1 = Math.max(z1, l.z);
    }
    const near = getZones().filter((z) => {
      if (z.dim !== dim) return false;
      const dx = Math.max(x0 + 0.5, Math.min(z.x, x1 + 0.5)) - z.x;
      const dy = Math.max(y0 + 0.5, Math.min(z.y, y1 + 0.5)) - z.y;
      const dz = Math.max(z0 + 0.5, Math.min(z.z, z1 + 0.5)) - z.z;
      return dx * dx + dy * dy + dz * dz <= z.radius * z.radius;
    });
    const safe = useSafeZones() && protectedBox(dim, { x: x0, z: z0 }, { x: x1 + 1, z: z1 + 1 });
    if (!near.length && !safe) return;
    const kept = blocks.filter((_, i) => !(zoneIn(near, at[i]) || (safe && isProtected(dim, at[i].x + 0.5, at[i].z + 0.5))));
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
    const safe = inZonesMode && !zone && useSafeZones() ? zonesAt(player.dimension.id, x, z)[0] : undefined;
    here = [
      inZonesMode
        ? zone
          ? `§aWhere you stand: protected (zone §e${zone.name}§a)`
          : safe
            ? `§aWhere you stand: protected (safe zone §e${safe.name}§a)`
            : "§cWhere you stand: not protected"
        : "§aWhere you stand: protected",
    ];
  }
  const lines = [
    ...here,
    `§6Creeper Guard§r: ${
      zonesMode() ? `only inside the zones below${useSafeZones() ? " and in safe zones (/realm:zones)" : ""}` : "everywhere (zones are only used in zones mode)"
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
      description: "Creeper Guard: the menu (status; for operators: add or remove protected zones)",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = originPlayer(origin);
      if (!player) return { status: CustomCommandStatus.Success, message: statusText(undefined) };
      system.run(() => mainMenu(player).catch((e) => console.warn(`[guard] ${e}`)));
      return { status: CustomCommandStatus.Success };
    }
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:guard_status",
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
      const res = addZone(player, name, radius, true);
      return { status: res.ok ? CustomCommandStatus.Success : CustomCommandStatus.Failure, message: res.message };
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
        return { status: CustomCommandStatus.Failure, message: `No zone "${name}". /realm:guard_status lists them.` };
      }
      system.run(() => saveZones(getZones().filter((z) => z.name !== zone.name)));
      return { status: CustomCommandStatus.Success, message: `Zone "${zone.name}" removed.` };
    }
  );
});

/**
 * Adds a zone around the player. From a command (`later`), the save waits for the next tick: commands
 * may not write world properties.
 * @param {Player} player @param {string} name @param {number | undefined} radius @param {boolean} later
 * @returns {{ ok: boolean, message: string }}
 */
function addZone(player, name, radius, later) {
  if (!NAME_RE.test(name)) return { ok: false, message: "Zone names use letters, digits, _ and - (up to 24)." };
  const r = radius ?? get("defaultRadius");
  if (r < MIN_RADIUS || r > MAX_RADIUS) return { ok: false, message: `Radius must be ${MIN_RADIUS} to ${MAX_RADIUS} blocks.` };
  const list = getZones();
  const taken = list.find((z) => named(z, name));
  if (taken) return { ok: false, message: `There is already a zone "${taken.name}". Remove it first with /realm:guard_remove ${taken.name}.` };
  if (list.length >= MAX_ZONES) return { ok: false, message: `At most ${MAX_ZONES} zones.` };
  const { x, y, z } = player.location;
  /** @type {Zone} */
  const zone = { name, dim: player.dimension.id, x: Math.round(x), y: Math.round(y), z: Math.round(z), radius: r };
  const save = () => {
    const now = getZones();
    if (!now.some((z) => named(z, name)) && now.length < MAX_ZONES) saveZones([...now, zone]); // same name added meanwhile: keep the first
  };
  if (later) system.run(save);
  else save();
  return {
    ok: true,
    message: `Zone added: ${describeZone(zone)}${zonesMode() ? "" : "\n§7Mode is everywhere, so zones have no effect until an operator sets the mode to zones in /realm:config."}`,
  };
}

/** @param {Player} player */
const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

/**
 * Shows a form, retrying while the player still has chat or another screen open.
 * @template {ActionFormData | ModalFormData} F
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

/** @param {Player} player @param {string} title @param {string} body @param {{ text: string, run: () => unknown }[]} actions */
async function menu(player, title, body, actions) {
  const form = new ActionFormData().title(title).body(body);
  for (const a of actions) form.button(a.text);
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  await actions[res.selection]?.run();
}

/** Operators: name and radius of a new zone around them. @param {Player} player */
async function addForm(player) {
  const form = new ModalFormData()
    .title("§lProtect this spot")
    .textField("Zone name (letters, digits, _ and -)", "home", { defaultValue: "" })
    .slider("Radius (blocks)", MIN_RADIUS, MAX_RADIUS, { valueStep: 8, defaultValue: Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, Math.round(Number(get("defaultRadius")) / 8) * 8)) })
    .submitButton("Add zone");
  const res = await show(player, form);
  if (!res || res.canceled || !res.formValues || !player.isValid) return;
  const v = res.formValues.filter((x) => x !== undefined);
  const out = addZone(player, String(v[0] ?? "").trim(), Math.round(Number(v[1])), false);
  player.sendMessage(out.ok ? out.message : `§c${out.message}`);
}

/** Operators: pick a zone to remove. @param {Player} player */
async function removeMenu(player) {
  const list = getZones();
  await menu(
    player,
    "§lRemove a zone",
    list.length ? "Pick a zone to remove." : "No zones.",
    list.map((z) => ({
      text: `${z.name}\n§8${shortId(z.dim)} ${Math.floor(z.x)}, ${Math.floor(z.z)}, radius ${z.radius}`,
      run: () => {
        saveZones(getZones().filter((x) => x.name !== z.name));
        player.sendMessage(`Zone "${z.name}" removed.`);
      },
    }))
  );
}

/** /realm:guard @param {Player} player */
async function mainMenu(player) {
  /** @type {{ text: string, run: () => unknown }[]} */
  const actions = [{ text: "Status\n§8Mode, blast sources and zones", run: () => player.sendMessage(statusText(player)) }];
  if (isOp(player)) {
    actions.push({ text: "Protect this spot (operator)\n§8A zone around you", run: () => addForm(player) });
    if (getZones().length) actions.push({ text: "Remove a zone (operator)", run: () => removeMenu(player) });
  }
  if (zoneProviders().has("zones")) {
    actions.push({ text: "Safe zones\n§8Protect places from every world event", run: () => system.sendScriptEvent("realm:zones_open", JSON.stringify({ player: player.id, action: "menu" })) });
  }
  await menu(player, "§lCreeper Guard", statusText(player), actions);
}

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "guard_bp");
  },
  { namespaces: ["realm"] }
);
