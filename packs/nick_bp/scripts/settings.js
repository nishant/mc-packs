// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "nick_bp";
const PREFIX = "nick";
const TITLE = "Nicknames";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "forgetGamertagsAfterDays", type: "int", scope: "world", label: "Forget gamertags after (days)", help: "A gamertag nobody used for this long stops being reserved. Nicknames are kept. 0 = never", min: 0, max: 3650, step: 5 },
  { key: "reservedNames", type: "text", scope: "world", label: "Reserved nicknames", help: "Comma separated; players can't take them (operators can). Saved nicknames are kept" },
  { key: "reservedGamertags", type: "text", scope: "world", label: "Reserved operator gamertags", help: "Comma separated; nobody else can take them, even offline. The game can't tell which offline players are operators" },
  { key: "enabled", type: "bool", scope: "world", label: "Nicknames", help: "Players can show a nickname above their head with /realm:nick. Disabled: gamertags again, nicknames are kept" },
  { key: "showGamertag", type: "bool", scope: "world", label: "Gamertag under nicknames", help: "A second, gray line with the player's gamertag" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
