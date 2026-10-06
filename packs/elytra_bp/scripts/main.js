import { CommandPermissionLevel, CustomCommandStatus, EquipmentSlot, Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { get, getFor, setFor } from "./settings.js";

// While a player glides, a few times a second, the bar above the hotbar shows their speed, height,
// elytra durability left and firework rockets. Players who aren't gliding cost one property read.
// Each player's "off" preference (in elytra:pref) is shared with /realm:prefs.

const DISABLED = "The Elytra HUD is disabled on this realm. An operator can enable it in /realm:config (Elytra HUD).";
const ROCKET = "minecraft:firework_rocket";

/** @param {Player} player */
const hudOff = (player) => getFor(player, "off") === true;

/** Firework rockets in the inventory and the offhand. @param {Player} player */
function rockets(player) {
  let n = 0;
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (inv) {
    for (let i = 0; i < inv.size; i++) {
      const item = inv.getItem(i);
      if (item?.typeId === ROCKET) n += item.amount;
    }
  }
  const off = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Offhand);
  if (off?.typeId === ROCKET) n += off.amount;
  return n;
}

/** Durability left of what's in the chest slot, as "§a87%", or "§7--" when it has none. @param {Player} player */
function elytraLeft(player) {
  const chest = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Chest);
  const dur = chest?.getComponent("minecraft:durability");
  if (!dur || dur.maxDurability <= 0) return "§7--";
  const pct = Math.max(0, Math.floor(((dur.maxDurability - dur.damage) / dur.maxDurability) * 100));
  const color = pct <= get("lowPercent") ? "§c" : pct <= 30 ? "§e" : "§a";
  return `${color}${pct}%`;
}

/** @param {Player} player */
function hud(player) {
  const v = player.getVelocity(); // blocks per tick
  const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) * 20;
  const y = Math.floor(player.location.y);
  const n = rockets(player);
  return `§b${speed.toFixed(1)} blocks/s  §fY ${y}  §fElytra ${elytraLeft(player)}  ${n ? "§e" : "§7"}Rockets ${n}`;
}

system.runInterval(() => {
  if (get("enabled") !== true) return;
  for (const player of world.getAllPlayers()) {
    try {
      if (!player.isGliding || hudOff(player)) continue;
      player.onScreenDisplay.setActionBar(hud(player));
    } catch {
      // left or changed dimension meanwhile
    }
  }
}, Math.max(1, CONFIG.intervalTicks));

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:elytra",
      description: "Enable or disable the elytra HUD (speed, height, durability, rockets) for yourself",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      if (get("enabled") !== true) return { status: CustomCommandStatus.Failure, message: DISABLED };
      const nowOff = !hudOff(player);
      system.run(() => setFor(player, "off", nowOff));
      return {
        status: CustomCommandStatus.Success,
        message: nowOff
          ? "Elytra HUD: Disabled. Run /realm:elytra again to enable it."
          : "Elytra HUD: Enabled. It shows above the hotbar while you glide.",
      };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "elytra_bp");
  },
  { namespaces: ["realm"] }
);
