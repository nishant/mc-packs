// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "town_bp";
const PREFIX = "town";
const TITLE = "Town Projects";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "announce", type: "bool", scope: "world", label: "Announce finished projects to everyone", help: "In chat, with a title when a town levels up" },
  { key: "fireworks", type: "bool", scope: "world", label: "Fireworks over a finished project" },
  { key: "deliverWithCommand", type: "bool", scope: "world", label: "Deliver with /realm:town in a town", help: "Without visiting the mayor" },
  { key: "keepNamedItems", type: "bool", scope: "world", label: "Never deliver items with a custom name" },
  { key: "townRadius", type: "int", scope: "world", label: "Town radius (blocks)", help: "How close to a town's center its mayor and commands work", min: 32, max: 256, step: 16 },
  { key: "repPerProject", type: "int", scope: "world", label: "Guild reputation per finished project", min: 0, max: 100, step: 5 },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----
