// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "relics_bp";
const PREFIX = "relics";
const TITLE = "Relics";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Relic abilities", help: "Disabled, relics are only keepsakes" },
  { key: "shardsPerForge", type: "int", scope: "world", label: "Relic Shards per forged relic", min: 1, max: 64, step: 1 },
  { key: "forgeAnywhere", type: "bool", scope: "world", label: "Forge from /realm:relics anywhere", help: "Disabled, players forge at a relicsmith" },
  { key: "autoRepair", type: "bool", scope: "world", label: "Relics never wear out", help: "Durability is restored while a relic is held or worn" },
  { key: "staffHitsPlayers", type: "bool", scope: "world", label: "Storm Staff can strike players" },
  { key: "meterReadout", type: "bool", scope: "player", default: true, label: "Storm Meter readout", help: "Holding the Storm Meter shows the nearest storm cell above the hotbar" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----
