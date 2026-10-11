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

const INTERVAL = Math.max(1, CONFIG.intervalTicks);
/** How long (ticks) each request asks the Coordinates HUD to leave the action bar alone; renewed every third of that while gliding. */
const HOLD_TICKS = Math.max(30, INTERVAL * 3);
/** player id -> tick of the last realm:actionbar request */
const heldAt = new Map();

// ---- The right side of the screen ----
// Side HUD (hud_rp, in Realm Resources) shows the subtitle in a box above the scoreboard whenever the
// title is exactly SIDE, and hides the vanilla title for SIDE and SIDE_CLEAR. Packs that share the box
// say "realm:side" { player, from, ticks } when they write, so only the last writer clears it.
const SIDE = "§s§1§r";
const SIDE_CLEAR = "§s§0§r";
/** player id -> the pack that last wrote the side box */
const sideOwner = new Map();
/** player id -> tick this pack's text is due to disappear */
const sideUntil = new Map();

/** Shows text on the right side for `ticks`, then clears it if nobody wrote there since. @param {Player} player @param {any} text @param {number} ticks */
function showSide(player, text, ticks) {
  player.onScreenDisplay.setTitle(SIDE, { subtitle: text, fadeInDuration: 0, stayDuration: ticks, fadeOutDuration: 0 });
  sideOwner.set(player.id, "elytra");
  system.sendScriptEvent("realm:side", JSON.stringify({ player: player.id, from: "elytra", ticks }));
  const until = system.currentTick + ticks;
  sideUntil.set(player.id, until);
  system.runTimeout(() => {
    if (sideUntil.get(player.id) !== until) return;
    sideUntil.delete(player.id);
    if (sideOwner.get(player.id) !== "elytra" || !player.isValid) return;
    try {
      player.onScreenDisplay.setTitle(SIDE_CLEAR, { fadeInDuration: 0, stayDuration: 1, fadeOutDuration: 0 });
    } catch {
      // left meanwhile
    }
  }, ticks);
}

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:side") return;
    try {
      const m = JSON.parse(message);
      if (typeof m?.player === "string" && typeof m.from === "string") sideOwner.set(m.player, m.from);
    } catch {
      // not ours
    }
  },
  { namespaces: ["realm"] }
);

system.runInterval(() => {
  if (get("enabled") !== true) return;
  const now = system.currentTick;
  for (const player of world.getAllPlayers()) {
    try {
      if (!player.isGliding || hudOff(player)) continue;
      const where = getFor(player, "where");
      if (where === "middle") {
        // The subtitle line in the middle of the screen: other add-ons that redraw the action bar can't cover it.
        player.onScreenDisplay.setTitle("§r", { subtitle: hud(player), fadeInDuration: 0, stayDuration: INTERVAL + 10, fadeOutDuration: 4 });
        continue;
      }
      if (where !== "hotbar") {
        showSide(player, hud(player), INTERVAL + 10);
        continue;
      }
      player.onScreenDisplay.setActionBar(hud(player));
      // Ask the Coordinates HUD, if installed, to leave the action bar to this HUD while gliding.
      if (now - (heldAt.get(player.id) ?? -Infinity) >= HOLD_TICKS / 3) {
        heldAt.set(player.id, now);
        system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: player.id, ticks: HOLD_TICKS }));
      }
    } catch {
      // left or changed dimension meanwhile
    }
  }
}, INTERVAL);

world.afterEvents.playerLeave.subscribe(({ playerId }) => heldAt.delete(playerId));

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
          : "Elytra HUD: Enabled. It shows while you glide.",
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
