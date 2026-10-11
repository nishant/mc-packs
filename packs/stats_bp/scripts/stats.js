// The stats this pack tracks, and the colors the ticker can use. Shared by main.js and settings.js.

/**
 * Every stat is a scoreboard objective, so it persists, shows offline players
 * on leaderboards, and can be used with vanilla /scoreboard commands too.
 * `short` is the compact ticker's name for it.
 * @type {{ id: string, label: string, short: string, sidebar: string, format?: (n: number) => string }[]}
 */
export const STATS = [
  { id: "playtime", label: "Playtime", short: "Time", sidebar: "Playtime (min)", format: formatMinutes },
  { id: "deaths", label: "Deaths", short: "Deaths", sidebar: "Deaths" },
  { id: "mobkills", label: "Mob kills", short: "Kills", sidebar: "Mob kills" },
  { id: "pvpkills", label: "Player kills", short: "PvP", sidebar: "Player kills" },
  { id: "mined", label: "Blocks mined", short: "Mined", sidebar: "Blocks mined" },
  { id: "placed", label: "Blocks placed", short: "Placed", sidebar: "Blocks placed" },
  { id: "travelled", label: "Distance traveled", short: "Walked", sidebar: "Traveled (blocks)", format: formatDistance },
  { id: "flown", label: "Elytra distance", short: "Flown", sidebar: "Elytra (blocks)", format: formatDistance },
  { id: "joins", label: "Times joined", short: "Joins", sidebar: "Joins" },
];

/** Colors for the ticker, as section-sign codes. */
export const COLORS = [
  { id: "white", name: "White", code: "§f" },
  { id: "gray", name: "Gray", code: "§7" },
  { id: "dark_gray", name: "Dark gray (dim)", code: "§8" },
  { id: "gold", name: "Gold", code: "§6" },
  { id: "yellow", name: "Yellow", code: "§e" },
  { id: "green", name: "Green", code: "§a" },
  { id: "aqua", name: "Aqua", code: "§b" },
  { id: "blue", name: "Blue", code: "§9" },
  { id: "light_purple", name: "Light purple", code: "§d" },
  { id: "red", name: "Red", code: "§c" },
];

/** @param {number} minutes */
export function formatMinutes(minutes) {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** @param {number} blocks */
export function formatDistance(blocks) {
  return blocks >= 1000 ? `${(blocks / 1000).toFixed(1)} km` : `${blocks} m`;
}
