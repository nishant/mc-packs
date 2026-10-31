// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "claims_bp";
const PREFIX = "claims";
const TITLE = "Land Claims";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Land claims", help: "Players can claim land with /realm:claim. Disabled: nothing is protected and claims are kept for later" },
  { key: "radius", type: "int", scope: "world", label: "New claim radius (blocks)", help: "16 = 33 x 33 blocks. Existing claims keep their size", min: 4, max: 64, step: 4 },
  { key: "maxClaims", type: "int", scope: "world", label: "Claims per player", min: 1, max: 10, step: 1 },
  { key: "protectExplosions", type: "bool", scope: "world", label: "Explosions break nothing in claims" },
  { key: "protectAnimals", type: "bool", scope: "world", label: "Protect animals in claims", help: "Others can't leash, ride, feed, milk, shear or name farm and pet animals in a claim. Doesn't stop damage" },
  { key: "protectWorldEvents", type: "bool", scope: "world", label: "Protect claims from world events", help: "Meteors, tornadoes, storm lightning and other world events break no blocks in claims" },
  { key: "operatorsBypass", type: "bool", scope: "world", label: "Operators can build in any claim" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
