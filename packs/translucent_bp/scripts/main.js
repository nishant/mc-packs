// Translucent Tools Switch: each player's "Translucent tools" choice (/realm:prefs) becomes the client-synced player
// property `realm:solid_tools` (defined in entities/player.json). The Translucent Tools resource pack reads it in its
// attachables and draws that player's held tools see-through (false) or solid (true).
import "./diag.js";
import { Player, system, world } from "@minecraft/server";
import { getFor, onChange } from "./settings.js";

const PROP = "realm:solid_tools";

/** Sets the property from the player's choice (or the realm's default). @param {Player} player */
function apply(player) {
  try {
    if (!player.isValid) return;
    const solid = getFor(player, "translucent") !== true;
    if (player.getProperty(PROP) !== solid) player.setProperty(PROP, solid);
  } catch (e) {
    console.warn(`[translucent] ${e}`);
  }
}

// Every spawn: the property is saved with the player, but the realm's default may have changed while they were away.
world.afterEvents.playerSpawn.subscribe(({ player }) => apply(player));
world.afterEvents.worldLoad.subscribe(() => {
  for (const p of world.getAllPlayers()) apply(p);
});

onChange((key, player) => {
  if (player) apply(player);
  else if (key === "translucentTools" || key === "*") for (const p of world.getAllPlayers()) apply(p);
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "translucent_bp");
  },
  { namespaces: ["realm"] },
);
