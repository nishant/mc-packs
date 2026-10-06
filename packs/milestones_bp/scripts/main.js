import { CommandPermissionLevel, CustomCommandStatus, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

// One world property per player, so anyone's milestones can be shown while they're offline:
// "milestones:p:<player id>" -> JSON { n: name, c: { stat: count }, g: { milestone id: tiers reached } }.
// The counts are this pack's own. When the Stats pack's scoreboards (stats_<stat>, scores under the
// player's name) exist, the larger of the two is used, so the pack works with or without Stats and
// picks up history Stats counted before this pack was added.
const RECORD_PREFIX = "milestones:p:";

/** @typedef {typeof CONFIG.milestones[number]} Milestone */
/** @typedef {Milestone["stat"]} Stat */
/** @typedef {{ n: string, c: Record<string, number>, g?: Record<string, number> }} Rec */

/** How each stat reads. playtime is counted in minutes and shown in hours. */
/** @type {Record<Stat, { scale: number, goal: (n: string) => string, have: (n: string) => string }>} */
const STATS = {
  playtime: { scale: 60, goal: (n) => `Play ${n} hour${n === "1" ? "" : "s"}`, have: (n) => `${n} hours played` },
  mined: { scale: 1, goal: (n) => `Mine ${n} blocks`, have: (n) => `${n} blocks mined` },
  placed: { scale: 1, goal: (n) => `Place ${n} blocks`, have: (n) => `${n} blocks placed` },
  travelled: { scale: 1, goal: (n) => `Travel ${n} blocks`, have: (n) => `${n} blocks traveled` },
  flown: { scale: 1, goal: (n) => `Fly ${n} blocks with an elytra`, have: (n) => `${n} blocks flown` },
  mobkills: { scale: 1, goal: (n) => `Defeat ${n} mobs`, have: (n) => `${n} mobs defeated` },
  pvpkills: { scale: 1, goal: (n) => `Defeat ${n} players`, have: (n) => `${n} players defeated` },
  deaths: { scale: 1, goal: (n) => `Die ${n} times`, have: (n) => `${n} deaths` },
  joins: { scale: 1, goal: (n) => `Join the realm ${n} times`, have: (n) => `${n} joins` },
};

const milestones = CONFIG.milestones.filter((m) => STATS[m.stat] && m.tiers.length);
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
/** "Miner II". @param {Milestone} m @param {number} tier 1-based */
const title = (m, tier) => `${m.name} ${ROMAN[tier - 1] ?? tier}`;

/** 12345 -> "12,345", 12.5 -> "12.5". @param {number} n */
function fmt(n) {
  const whole = Math.floor(n);
  const s = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = Math.floor((n - whole) * 10);
  return frac && whole < 100 ? `${s}.${frac}` : s;
}

// ---------------------------------------------------------------------------
// Records (cached; written every few seconds)
// ---------------------------------------------------------------------------

/** @type {Map<string, Rec> | undefined} */
let cache;
/** @type {Set<string>} player ids whose record changed */
const dirty = new Set();

/** @returns {Map<string, Rec>} */
function records() {
  if (cache) return cache;
  /** @type {Map<string, Rec>} */
  const map = new Map();
  try {
    for (const key of world.getDynamicPropertyIds()) {
      if (!key.startsWith(RECORD_PREFIX)) continue;
      try {
        const raw = world.getDynamicProperty(key);
        const r = typeof raw === "string" ? JSON.parse(raw) : undefined;
        if (r && typeof r.n === "string" && r.c && typeof r.c === "object") map.set(key.slice(RECORD_PREFIX.length), r);
      } catch {
        // a corrupt record starts over
      }
    }
  } catch {
    return map; // the world isn't loaded yet: read again next time
  }
  return (cache = map);
}

/** @param {Player} player @returns {Rec} */
function recordOf(player) {
  let r = records().get(player.id);
  if (!r) {
    r = { n: player.name, c: {} };
    records().set(player.id, r);
    dirty.add(player.id);
  } else if (r.n !== player.name) {
    r.n = player.name;
    dirty.add(player.id);
  }
  return r;
}

function flush() {
  for (const id of dirty) {
    const r = records().get(id);
    if (r) world.setDynamicProperty(RECORD_PREFIX + id, JSON.stringify(r));
  }
  dirty.clear();
}

/** @param {Player} player @param {Stat} stat @param {number} [n] */
function add(player, stat, n = 1) {
  if (n <= 0 || !player.isValid) return;
  const r = recordOf(player);
  r.c[stat] = (r.c[stat] ?? 0) + n;
  dirty.add(player.id);
}

/** The Stats pack's score for this name, or 0 without the Stats pack. @param {string} name @param {Stat} stat */
function statsScore(name, stat) {
  try {
    return world.scoreboard.getObjective(`stats_${stat}`)?.getScore(name) ?? 0;
  } catch {
    return 0; // no such participant yet
  }
}

/** @param {Rec} r @param {Stat} stat */
const valueOf = (r, stat) => Math.max(r.c[stat] ?? 0, statsScore(r.n, stat)) / STATS[stat].scale;

/** Tiers reached for this value. @param {Milestone} m @param {number} v */
const tiersFor = (m, v) => m.tiers.filter((t) => v >= t).length;

// ---------------------------------------------------------------------------
// Tracking (the same rules as the Stats pack)
// ---------------------------------------------------------------------------

const afk = (/** @type {Player} */ p) => !!CONFIG.afkTag && p.hasTag(CONFIG.afkTag);

world.afterEvents.playerBreakBlock.subscribe(({ player }) => add(player, "mined"));
world.afterEvents.playerPlaceBlock.subscribe(({ player }) => add(player, "placed"));
world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  const killer = damageSource.damagingEntity;
  if (deadEntity instanceof Player) {
    add(deadEntity, "deaths");
    if (killer instanceof Player && killer.id !== deadEntity.id) add(killer, "pvpkills");
  } else if (killer instanceof Player) add(killer, "mobkills");
});

/** @type {Map<string, { seconds: number, travelled: number, flown: number, last?: { x: number, y: number, z: number, dim: string } }>} */
const pending = new Map();
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  const p = pending.get(player.id);
  if (p) p.last = undefined; // spawning moves the player without traveling
  if (initialSpawn) add(player, "joins");
});
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  pending.delete(playerId);
  try {
    flush();
  } catch (e) {
    console.warn(`[milestones] ${e}`);
  }
});

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    try {
      let p = pending.get(player.id);
      if (!p) pending.set(player.id, (p = { seconds: 0, travelled: 0, flown: 0 }));
      const away = afk(player);
      if (!away && ++p.seconds >= 60) {
        p.seconds -= 60;
        add(player, "playtime");
      }
      const loc = player.location;
      const dim = player.dimension.id;
      if (!away && p.last && p.last.dim === dim) {
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
      console.warn(`[milestones] ${e}`);
    }
  }
}, 20);

// ---------------------------------------------------------------------------
// Unlocks
// ---------------------------------------------------------------------------

/** @param {Player} player */
function check(player) {
  const r = recordOf(player);
  const first = !r.g;
  const got = (r.g ??= {});
  /** @type {string[]} */
  const unlocked = [];
  for (const m of milestones) {
    const now = tiersFor(m, valueOf(r, m.stat));
    const before = got[m.id] ?? 0;
    if (now <= before) continue;
    for (let t = before + 1; t <= now; t++) unlocked.push(`${title(m, t)} (${STATS[m.stat].goal(fmt(m.tiers[t - 1]))})`);
    got[m.id] = now;
    dirty.add(player.id);
  }
  if (first) dirty.add(player.id);
  if (!unlocked.length) return;
  if (first) {
    // The first check after the pack is added: what the player already had, told quietly.
    player.sendMessage(`§eMilestones you already have: ${unlocked.join(", ")}. §7See them with /realm:milestones`);
    return;
  }
  const line = `§6${player.name} reached ${unlocked.length === 1 ? "a milestone" : "milestones"}: §e${unlocked.join(", ")}`;
  if (get("announce") === true) {
    world.sendMessage(line);
    for (const p of world.getAllPlayers()) if (p.id !== player.id) p.playSound("random.orb", { pitch: 1.2, volume: 0.6 });
  } else player.sendMessage(line);
  player.playSound("random.levelup", { pitch: 1, volume: 0.9 });
}

let elapsed = 0;
system.runInterval(() => {
  if (++elapsed < Math.max(1, CONFIG.checkSeconds)) return;
  elapsed = 0;
  for (const player of world.getAllPlayers()) {
    try {
      check(player);
    } catch (e) {
      console.warn(`[milestones] ${e}`);
    }
  }
  try {
    flush();
  } catch (e) {
    console.warn(`[milestones] ${e}`);
  }
}, 20);

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

/** @param {number} v @param {number} of */
function bar(v, of) {
  const filled = Math.round((Math.min(v, of) / Math.max(1, of)) * 20);
  return `§a${"|".repeat(filled)}§8${"|".repeat(20 - filled)}§r`;
}

/** Every milestone with its progress. @param {Rec} r */
function describe(r) {
  return milestones
    .map((m) => {
      const v = valueOf(r, m.stat);
      const got = Math.min(r.g?.[m.id] ?? 0, m.tiers.length);
      const s = STATS[m.stat];
      if (got >= m.tiers.length) return `§a${title(m, got)}§r §7(every tier)\n§f${s.have(fmt(v))}`;
      const next = m.tiers[got];
      const head = got ? `§e${title(m, got)}§r §7next: ${title(m, got + 1)}` : `§7${m.name}§r §7first tier: ${title(m, 1)}`;
      return `${head}\n${bar(v, next)} §f${fmt(v)} / ${fmt(next)}\n§7${s.goal(fmt(next))}`;
    })
    .join("\n\n");
}

/**
 * @param {Player} player @param {string} heading @param {string} body @param {{ text: string, run: () => void | Promise<void> }[]} actions
 */
async function menu(player, heading, body, actions) {
  const form = new ActionFormData().title(heading).body(body);
  for (const a of actions) form.button(a.text);
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return;
    const res = await form.show(player);
    if (res.canceled && res.cancelationReason === FormCancelationReason.UserBusy) {
      await new Promise((r) => system.runTimeout(() => r(undefined), 20));
      continue;
    }
    if (res.canceled || res.selection === undefined) return;
    await actions[res.selection]?.run();
    return;
  }
}

/** @param {Rec} r */
const unlockedCount = (r) => milestones.reduce((n, m) => n + Math.min(r.g?.[m.id] ?? 0, m.tiers.length), 0);
const totalTiers = milestones.reduce((n, m) => n + m.tiers.length, 0);

/** @param {Player} player @param {string} id */
async function showRecord(player, id) {
  const r = records().get(id);
  if (!r) return;
  const mine = id === player.id;
  await menu(player, mine ? "§lMy milestones" : `§l${r.n}'s milestones`, `${unlockedCount(r)} of ${totalTiers} unlocked.\n\n${describe(r)}`, [
    { text: "Another player's milestones", run: () => pickPlayer(player) },
    ...(mine ? [] : [{ text: "My milestones", run: () => showRecord(player, player.id) }]),
  ]);
}

/** @param {Player} player */
async function pickPlayer(player) {
  const online = new Set(world.getAllPlayers().map((p) => p.id));
  const list = [...records().entries()]
    .filter(([id]) => id !== player.id)
    .sort(([a, x], [b, y]) => Number(online.has(b)) - Number(online.has(a)) || x.n.localeCompare(y.n));
  await menu(
    player,
    "§lWhose milestones?",
    list.length ? "Everyone who has played since milestones were added, online players first." : "Nobody else has played since milestones were added.",
    [
      ...list.map(([id, r]) => ({ text: `${r.n}${online.has(id) ? " §a(online)" : ""}\n§8${unlockedCount(r)} of ${totalTiers} unlocked`, run: () => showRecord(player, id) })),
      { text: "Back", run: () => showRecord(player, player.id) },
    ]
  );
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:milestones",
      description: "Milestones: your realm achievements and progress, or another player's",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => {
        try {
          check(player);
        } catch (e) {
          console.warn(`[milestones] ${e}`);
        }
        showRecord(player, player.id).catch((e) => console.warn(`[milestones] ${e}`));
      });
      return { status: CustomCommandStatus.Success };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "milestones_bp");
  },
  { namespaces: ["realm"] }
);
