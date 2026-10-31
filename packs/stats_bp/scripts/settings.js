// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { COLORS, STATS } from "./stats.js";

const PACK = "stats_bp";
const PREFIX = "stats";
const TITLE = "Stats & Leaderboards";
/** config.js, with each stat list also as one switch per stat ("tickerShows.deaths"), which is how the menus show them. */
const BASE = {
  ...CONFIG,
  sidebarShows: Object.fromEntries(STATS.map((s) => [s.id, CONFIG.sidebarStats.includes(s.id)])),
  tickerShows: Object.fromEntries(STATS.map((s) => [s.id, CONFIG.tickerStats.includes(s.id)])),
};

/** World: what the sidebar shows, kept where /realm:stats_sidebar always kept it. */
const PROP_SIDEBAR = "stats:sidebar";

const colors = { choices: COLORS.map((c) => c.id), names: COLORS.map((c) => c.name) };
const opacity = "The bar's background: how see-through it is is each player's own Bedrock setting, Accessibility > Text Background Opacity";
const mode = { choices: ["cycle", "all"], names: ["One stat at a time", "Every chosen stat on one line"] };
const style = { choices: ["full", "compact"], names: ["Name, value and rank", "Compact: short name and value"] };

/** @type {Option[]} */
export const OPTIONS = [
  {
    key: "sidebar",
    type: "enum",
    scope: "world",
    label: "Sidebar (everyone sees the same one)",
    help: "The shared scoreboard (on the left with Realm Resources). Bedrock shows one sidebar to everyone, so players can't hide it; each can use the stats ticker instead. The same as /realm:stats_sidebar",
    choices: ["off", "cycle", ...STATS.map((s) => s.id)],
    names: ["Hidden", "Rotate through the stats", ...STATS.map((s) => s.label)],
    read: () => world.getDynamicProperty(PROP_SIDEBAR),
    write: (v) => world.setDynamicProperty(PROP_SIDEBAR, /** @type {string | undefined} */ (v)),
  },
  { key: "sidebarCycleSeconds", type: "int", scope: "world", label: "Seconds per stat when the sidebar rotates", min: 5, max: 300, step: 5 },
  ...STATS.map((s) => /** @type {Option} */ ({ key: `sidebarShows.${s.id}`, type: "bool", scope: "world", label: `Sidebar rotation includes ${s.label}` })),
  { key: "leaderboardSize", type: "int", scope: "world", label: "Leaderboard size (players)", min: 3, max: 25, step: 1 },
  { key: "tickerEnabled", type: "bool", scope: "world", label: "Allow the stats ticker", help: "Disabled: nobody sees it. Enabled: each player follows their own choice, or the realm default" },
  { key: "tickerDefaultOn", type: "bool", scope: "world", label: "Stats ticker default", help: "For players who never chose. This Realm starts on; a saved choice still wins" },
  { key: "tickerMode", type: "enum", scope: "world", label: "Ticker shows (players start with)", ...mode },
  { key: "tickerSeconds", type: "int", scope: "world", label: "Ticker seconds per stat (players start with)", min: 2, max: 60, step: 1 },
  { key: "tickerStyle", type: "enum", scope: "world", label: "Ticker style (players start with)", ...style },
  { key: "tickerLabelColor", type: "enum", scope: "world", label: "Ticker name color (players start with)", ...colors },
  { key: "tickerValueColor", type: "enum", scope: "world", label: "Ticker number color (players start with)", ...colors },
  ...STATS.map((s) => /** @type {Option} */ ({ key: `tickerShows.${s.id}`, type: "bool", scope: "world", label: `Ticker shows ${s.label} (players start with)` })),

  { key: "ticker", type: "bool", scope: "player", lock: [["tickerEnabled", false]], base: "tickerDefaultOn", sticky: true, label: "Stats ticker above my hotbar", help: "Your own stats, one at a time or all on one line. The same switch as /realm:stats_ticker" },
  { key: "tickerMode", type: "enum", scope: "player", lock: [["tickerEnabled", false]], base: "tickerMode", label: "Ticker shows", ...mode },
  { key: "tickerSeconds", type: "int", scope: "player", lock: [["tickerEnabled", false]], base: "tickerSeconds", label: "Ticker seconds per stat", min: 2, max: 60, step: 1 },
  { key: "tickerStyle", type: "enum", scope: "player", lock: [["tickerEnabled", false]], base: "tickerStyle", label: "Ticker style", ...style },
  { key: "tickerLabelColor", type: "enum", scope: "player", lock: [["tickerEnabled", false]], base: "tickerLabelColor", label: "Ticker name color", help: opacity, ...colors },
  { key: "tickerValueColor", type: "enum", scope: "player", lock: [["tickerEnabled", false]], base: "tickerValueColor", label: "Ticker number color", help: opacity, ...colors },
  ...STATS.map((s) => /** @type {Option} */ ({ key: `tickerShows.${s.id}`, type: "bool", scope: "player", lock: [["tickerEnabled", false]], base: `tickerShows.${s.id}`, label: `Ticker shows ${s.label}` })),
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
