import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  DisplaySlotId,
  ObjectiveSortOrder,
  Player,
  ScoreboardIdentityType,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";

/** @typedef {import("@minecraft/server").ScoreboardObjective} ScoreboardObjective */

/**
 * Every stat is a scoreboard objective, so it persists, shows offline players
 * on leaderboards, and can be used with vanilla /scoreboard commands too.
 * @type {{ id: string, label: string, sidebar: string, format?: (n: number) => string }[]}
 */
const STATS = [
  { id: "playtime", label: "Playtime", sidebar: "Playtime (min)", format: formatMinutes },
  { id: "deaths", label: "Deaths", sidebar: "Deaths" },
  { id: "mobkills", label: "Mob kills", sidebar: "Mob kills" },
  { id: "pvpkills", label: "Player kills", sidebar: "Player kills" },
  { id: "mined", label: "Blocks mined", sidebar: "Blocks mined" },
  { id: "placed", label: "Blocks placed", sidebar: "Blocks placed" },
  { id: "travelled", label: "Distance travelled", sidebar: "Travelled (blocks)", format: formatDistance },
  { id: "flown", label: "Elytra distance", sidebar: "Elytra (blocks)", format: formatDistance },
  { id: "joins", label: "Times joined", sidebar: "Joins" },
];

const PROP_SIDEBAR = "stats:sidebar"; // world: stat id | "cycle" | undefined
const PROP_FIRST_JOIN = "stats:firstJoin"; // player: epoch ms

/** @param {string} id @returns {ScoreboardObjective} */
function objective(id) {
  const stat = STATS.find((s) => s.id === id);
  const objId = `stats_${id}`;
  return world.scoreboard.getObjective(objId) ?? world.scoreboard.addObjective(objId, stat?.sidebar ?? id);
}

/**
 * Scores are kept under the player's *name* (a "fake player" participant)
 * rather than the player entity. Bedrock shows offline entity participants as
 * "Player Offline", so this way leaderboards and the sidebar keep real names.
 * @param {Player} player @param {string} id @param {number} [n]
 */
function add(player, id, n = 1) {
  if (n <= 0 || !player.isValid) return;
  try {
    objective(id).addScore(player.name, n);
  } catch (e) {
    console.warn(`[stats] ${id}: ${e}`);
  }
}

/** Moves scores stored on the player entity (pack v1.0.0) to their name. @param {Player} player */
function migrateEntityScores(player) {
  for (const stat of STATS) {
    const obj = objective(stat.id);
    const old = obj.getScore(player);
    if (old === undefined) continue;
    obj.addScore(player.name, old);
    obj.removeParticipant(player);
  }
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

/**
 * Sub-unit progress kept in memory between ticks (seconds, fractional blocks).
 * @type {Map<string, { seconds: number, travelled: number, flown: number, last?: { x: number, y: number, z: number, dim: string } }>}
 */
const pending = new Map();
world.afterEvents.playerLeave.subscribe(({ playerId }) => pending.delete(playerId));

world.afterEvents.playerBreakBlock.subscribe(({ player }) => add(player, "mined"));
world.afterEvents.playerPlaceBlock.subscribe(({ player }) => add(player, "placed"));

world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  const killer = damageSource.damagingEntity;
  if (deadEntity instanceof Player) {
    add(deadEntity, "deaths");
    if (killer instanceof Player && killer.id !== deadEntity.id) add(killer, "pvpkills");
  } else if (killer instanceof Player) {
    add(killer, "mobkills");
  }
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  // Spawning (joining or respawning) moves the player without travelling.
  const p = pending.get(player.id);
  if (p) p.last = undefined;

  if (!initialSpawn) return;
  try {
    migrateEntityScores(player);
  } catch (e) {
    console.warn(`[stats] migrate: ${e}`);
  }
  add(player, "joins");
  if (player.getDynamicProperty(PROP_FIRST_JOIN) === undefined) {
    player.setDynamicProperty(PROP_FIRST_JOIN, Date.now());
  }
});

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    try {
      let p = pending.get(player.id);
      if (!p) pending.set(player.id, (p = { seconds: 0, travelled: 0, flown: 0 }));

      if (!CONFIG.afkTag || !player.hasTag(CONFIG.afkTag)) {
        if (++p.seconds >= 60) {
          p.seconds -= 60;
          add(player, "playtime");
        }
      }

      const loc = player.location;
      const dim = player.dimension.id;
      if (p.last && p.last.dim === dim) {
        const d = Math.hypot(loc.x - p.last.x, loc.y - p.last.y, loc.z - p.last.z);
        if (d <= CONFIG.maxSpeed) {
          const key = player.isGliding ? "flown" : "travelled";
          p[key] += d;
          const whole = Math.floor(p[key]);
          if (whole > 0) {
            p[key] -= whole;
            add(player, key, whole);
          }
        }
      }
      p.last = { x: loc.x, y: loc.y, z: loc.z, dim };
    } catch (e) {
      console.warn(`[stats] ${e}`);
    }
  }
}, 20);

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

/** @param {string} id */
function showOnSidebar(id) {
  world.scoreboard.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, {
    objective: objective(id),
    sortOrder: ObjectiveSortOrder.Descending,
  });
}

let cycleIndex = 0;
system.runInterval(() => {
  if (world.getDynamicProperty(PROP_SIDEBAR) !== "cycle") return;
  cycleIndex = (cycleIndex + 1) % STATS.length;
  showOnSidebar(STATS[cycleIndex].id);
}, CONFIG.sidebarCycleSeconds * 20);

/** @param {string} choice */
function setSidebar(choice) {
  if (choice === "off") {
    world.setDynamicProperty(PROP_SIDEBAR, undefined);
    world.scoreboard.clearObjectiveAtDisplaySlot(DisplaySlotId.Sidebar);
  } else {
    world.setDynamicProperty(PROP_SIDEBAR, choice);
    showOnSidebar(choice === "cycle" ? STATS[(cycleIndex = 0)].id : choice);
  }
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

/**
 * Shows a form, retrying while the client is busy (e.g. chat still closing).
 * @param {Player} player
 * @param {ActionFormData} form
 * @returns {Promise<import("@minecraft/server-ui").ActionFormResponse | undefined>}
 */
async function show(player, form, attempt = 1) {
  if (!player.isValid) return undefined;
  const res = await form.show(player);
  if (res.canceled && res.cancelationReason === FormCancelationReason.UserBusy && attempt < 20) {
    await new Promise((r) => system.runTimeout(() => r(undefined), 10));
    return show(player, form, attempt + 1);
  }
  return res;
}

/** @param {(typeof STATS)[number]} stat @param {number} n */
const fmt = (stat, n) => (stat.format ? stat.format(n) : n.toLocaleString());

/** @param {string} id */
function ranked(id) {
  return objective(id)
    .getScores()
    // Skip entity participants: v1.0.0 scores not migrated yet (the player hasn't rejoined), shown as "Player Offline".
    .filter((s) => s.score > 0 && s.participant.type !== ScoreboardIdentityType.Player)
    .sort((a, b) => b.score - a.score);
}

/** @param {Player} player */
async function mainMenu(player) {
  const res = await show(
    player,
    new ActionFormData()
      .title("§lRealm Stats")
      .button("My stats")
      .button("Leaderboards")
  );
  if (res?.selection === 0) await myStats(player);
  if (res?.selection === 1) await leaderboardMenu(player);
}

/** @param {Player} player */
async function myStats(player) {
  const lines = STATS.map((stat) => {
    const list = ranked(stat.id);
    const score = objective(stat.id).getScore(player.name) ?? 0;
    const rank = list.findIndex((s) => s.participant.displayName === player.name) + 1;
    return `§7${stat.label}:§r ${fmt(stat, score)}${rank > 0 ? ` §8(#${rank} of ${list.length})` : ""}`;
  });
  const first = player.getDynamicProperty(PROP_FIRST_JOIN);
  if (typeof first === "number") {
    lines.push("", `§7First joined:§r ${new Date(first).toISOString().slice(0, 10)}`);
  }

  const res = await show(
    player,
    new ActionFormData().title(`§l${player.name}`).body(lines.join("\n")).button("Leaderboards").button("Close")
  );
  if (res?.selection === 0) await leaderboardMenu(player);
}

/** @param {Player} player */
async function leaderboardMenu(player) {
  const form = new ActionFormData().title("§lLeaderboards");
  for (const stat of STATS) form.button(stat.label);
  const res = await show(player, form);
  if (res?.selection === undefined || res.canceled) return;
  await leaderboard(player, STATS[res.selection]);
}

/** @param {Player} player @param {(typeof STATS)[number]} stat */
async function leaderboard(player, stat) {
  const list = ranked(stat.id);
  const medals = ["§6①", "§7②", "§c③"];
  const lines = list.slice(0, CONFIG.leaderboardSize).map((s, i) => {
    const me = s.participant.displayName === player.name;
    const place = medals[i] ?? `§8${i + 1}.`;
    return `${place} ${me ? "§b§l" : "§r"}${s.participant.displayName}§r  ${fmt(stat, s.score)}`;
  });
  const myRank = list.findIndex((s) => s.participant.displayName === player.name);
  if (myRank >= CONFIG.leaderboardSize) {
    lines.push("§8…", `§8${myRank + 1}. §b${player.name}§r  ${fmt(stat, list[myRank].score)}`);
  }

  const res = await show(
    player,
    new ActionFormData()
      .title(`§l${stat.label}`)
      .body(lines.length ? lines.join("\n") : "§7Nobody yet.")
      .button("Back")
      .button("Close")
  );
  if (res?.selection === 0) await leaderboardMenu(player);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** @param {number} minutes */
function formatMinutes(minutes) {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** @param {number} blocks */
function formatDistance(blocks) {
  return blocks >= 1000 ? `${(blocks / 1000).toFixed(1)} km` : `${blocks} m`;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** @param {import("@minecraft/server").CustomCommandOrigin} origin */
const playerOf = (origin) => {
  const p = origin.initiator ?? origin.sourceEntity;
  return p instanceof Player ? p : undefined;
};

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerEnum("realm:sidebar_stat", [...STATS.map((s) => s.id), "cycle", "off"]);

  customCommandRegistry.registerCommand(
    {
      name: "realm:stats",
      description: "Show your stats and the leaderboards",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = playerOf(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => mainMenu(player).catch((e) => console.warn(`[stats] ${e}`)));
      return { status: CustomCommandStatus.Success };
    }
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:stats_sidebar",
      description: "Show a stat on everyone's sidebar, rotate through all of them, or turn it off",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "realm:sidebar_stat", type: CustomCommandParamType.Enum }],
    },
    (_origin, /** @type {string} */ choice) => {
      system.run(() => setSidebar(choice));
      return { status: CustomCommandStatus.Success, message: `Sidebar: ${choice}` };
    }
  );
});
