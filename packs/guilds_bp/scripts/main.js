import { CommandPermissionLevel, CustomCommandStatus, GameMode, ItemStack, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get, getFor } from "./settings.js";

/** @typedef {"miners" | "growers" | "wardens" | "wayfarers"} Guild */
/** @typedef {import("@minecraft/server").ScoreboardObjective} ScoreboardObjective */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/**
 * Plain-play progress toward the next point of reputation, saved per player in "guilds:prog".
 * @typedef {{ o: number, c: number, k: number, b: number }} Prog
 */

// Reputation lives in the scoreboards rep_miners, rep_growers, rep_wardens and rep_wayfarers, so
// other packs (and /scoreboard) can read it. Reputation for players who are offline when it's
// earned waits in the world property "guilds:pending" until they join.
/** @type {Guild[]} */
const GUILDS = ["miners", "growers", "wardens", "wayfarers"];
const PROP_PROG = "guilds:prog";
const PROP_PENDING = "guilds:pending";
const PLACED_MEMORY = 5000; // ores and melons/pumpkins placed lately: breaking them again earns nothing
const PENDING_MAX = 300; // offline players with reputation waiting (oldest dropped beyond this)

/** @param {unknown} g @returns {g is Guild} */
const isGuild = (g) => typeof g === "string" && /** @type {string[]} */ (GUILDS).includes(g);
const guildName = (/** @type {Guild} */ g) => CONFIG.guilds[g].name;

/** 12345 -> "12,345". @param {number} n */
const fmt = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** "minecraft:golden_carrot" -> "Golden Carrot". @param {string} id */
const itemName = (id) =>
  id
    .replace(/^minecraft:/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** @param {string} id @returns {Player | undefined} */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);

// ---------------------------------------------------------------------------
// Scoreboards: reputation and Crowns
// ---------------------------------------------------------------------------

/** @param {string} id @param {string} display @returns {ScoreboardObjective} */
function objective(id, display) {
  const existing = world.scoreboard.getObjective(id);
  if (existing) return existing;
  try {
    return world.scoreboard.addObjective(id, display);
  } catch {
    // another pack added it in the same tick
    return /** @type {ScoreboardObjective} */ (world.scoreboard.getObjective(id));
  }
}

/** @param {Guild} g */
const repObjective = (g) => objective(`rep_${g}`, `${CONFIG.guilds[g].member}s Rep`);

/** @param {Player} p @param {Guild} g */
function repOf(p, g) {
  try {
    return repObjective(g).getScore(p) ?? 0;
  } catch {
    return 0;
  }
}

const crownsObjective = () => objective("crowns", "Crowns");
/** @param {Player} p */
function crownsOf(p) {
  try {
    return crownsObjective().getScore(p) ?? 0;
  } catch {
    return 0;
  }
}
/** @param {Player} p @param {number} n @returns {boolean} */
function takeCrowns(p, n) {
  if (crownsOf(p) < n) return false;
  crownsObjective().addScore(p, -Math.floor(n));
  return true;
}

// ---------------------------------------------------------------------------
// Ranks
// ---------------------------------------------------------------------------

const RANKS = [...CONFIG.ranks].sort((a, b) => a.rep - b.rep);

/** Index into RANKS (0 = the first rank). @param {number} rep */
function rankIndex(rep) {
  let i = 0;
  while (i + 1 < RANKS.length && rep >= RANKS[i + 1].rep) i++;
  return i;
}

/** The rank number (1 = the first) a player has in a guild. @param {Player} p @param {Guild} g */
const rankOf = (p, g) => rankIndex(repOf(p, g)) + 1;

/** @param {string} word */
const article = (word) => (/^[AEIOU]/i.test(word) ? "an" : "a");

/** What each guild's perk does, for the menus. @type {Record<Guild, () => string>} */
const PERK_TEXT = {
  miners: () => `Haste I for ${CONFIG.perks.miners.hasteSeconds}s after mining ${CONFIG.perks.miners.ores} ores within ${CONFIG.perks.miners.seconds}s`,
  growers: () => `${Math.round(CONFIG.perks.growers.extraChance * 100)}% chance of an extra crop at harvest`,
  wardens: () => `Strength I for ${CONFIG.perks.wardens.strengthSeconds}s after defeating a champion`,
  wayfarers: () => `Speed I for ${CONFIG.perks.wayfarers.speedSeconds}s after sprinting ${CONFIG.perks.wayfarers.sprintBlocks} blocks`,
};

/** Does this player have the guild's perk right now? @param {Player} p @param {Guild} g */
const hasPerk = (p, g) => get("perks.enabled") === true && rankOf(p, g) >= get("perkRank");

/**
 * Adds (or, negative, takes) reputation for an online player, and handles rank-ups.
 * @param {Player} p @param {Guild} g @param {number} amount @param {string} [reason] shown in chat when given
 */
function addRep(p, g, amount, reason) {
  amount = Math.trunc(amount);
  if (!amount || !p.isValid) return;
  const obj = repObjective(g);
  const before = obj.getScore(p) ?? 0;
  const after = Math.max(0, before + amount);
  obj.setScore(p, after);
  if (reason && getFor(p, "repNotes") === true) {
    const sign = after - before >= 0 ? "+" : "";
    p.sendMessage(`§7${sign}${after - before} ${CONFIG.guilds[g].member}s rep (${reason})`);
  }
  const from = rankIndex(before);
  const to = rankIndex(after);
  if (to > from) rankedUp(p, g, from, to, after);
}

/** @param {Player} p @param {Guild} g @param {number} from @param {number} to @param {number} rep */
function rankedUp(p, g, from, to, rep) {
  const rank = RANKS[to].name;
  const lines = [`§6${guildName(g)}: you are now ${article(rank)} ${rank}! §7(${fmt(rep)} rep)`];
  const perkRank = get("perkRank");
  if (from + 1 < perkRank && to + 1 >= perkRank && get("perks.enabled") === true) lines.push(`§eNew perk: ${PERK_TEXT[g]()}`);
  const stock = (CONFIG.shops[g] ?? []).filter((s) => s.rank > from + 1 && s.rank <= to + 1);
  if (stock.length) lines.push(`§eNew in the guild shop: ${stock.map((s) => `${s.amount} ${itemName(s.item)}`).join(", ")} §7(/realm:guilds)`);
  p.sendMessage(lines.join("\n"));
  p.playSound("random.levelup", { pitch: 1.2, volume: 0.9 });
  for (let r = from + 2; r <= to + 1; r++) {
    if (!CONFIG.titleRanks.includes(r)) continue;
    const title = `${RANKS[r - 1].name} ${CONFIG.guilds[g].member}`;
    system.sendScriptEvent("realm:title_unlock", JSON.stringify({ player: p.id, title, from: "guilds_bp" }));
  }
  if (CONFIG.announceRanks.includes(to + 1)) {
    for (const other of world.getAllPlayers()) if (other.id !== p.id) other.sendMessage(`§6${p.name} reached ${rank} in the ${guildName(g)}!`);
  }
}

// ---------------------------------------------------------------------------
// Reputation for players who are offline
// ---------------------------------------------------------------------------

/** @returns {Record<string, Partial<Record<Guild, number>>>} */
function pending() {
  try {
    const raw = world.getDynamicProperty(PROP_PENDING);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** @param {string} playerId @param {Guild} g @param {number} amount */
function addPending(playerId, g, amount) {
  const all = pending();
  const mine = all[playerId] ?? {};
  delete all[playerId]; // re-add at the end: the oldest go first when it's full
  mine[g] = (mine[g] ?? 0) + Math.trunc(amount);
  all[playerId] = mine;
  const ids = Object.keys(all);
  for (const id of ids.slice(0, Math.max(0, ids.length - PENDING_MAX))) delete all[id];
  world.setDynamicProperty(PROP_PENDING, JSON.stringify(all));
}

/**
 * Reputation for a player by id: now if they're online, else when they next join.
 * @param {string} playerId @param {Guild} g @param {number} amount @param {string} [reason]
 */
function giveRep(playerId, g, amount, reason) {
  const p = online(playerId);
  if (p) addRep(p, g, amount, reason);
  else if (Math.trunc(amount)) addPending(playerId, g, amount);
}

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  try {
    const all = pending();
    const mine = all[player.id];
    if (!mine) return;
    delete all[player.id];
    world.setDynamicProperty(PROP_PENDING, Object.keys(all).length ? JSON.stringify(all) : undefined);
    for (const g of GUILDS) if (mine[g]) addRep(player, g, /** @type {number} */ (mine[g]), "while you were away");
  } catch (e) {
    console.warn(`[guilds] ${e}`);
  }
});

// ---------------------------------------------------------------------------
// Other packs: finished quests, reputation, champions, the guildmaster NPC
// ---------------------------------------------------------------------------

/** @param {any} m */
function questDone(m) {
  if (typeof m.player !== "string") return;
  const kind = typeof m.kind === "string" ? m.kind : "other";
  /** @type {Record<string, number>} */
  const table = CONFIG.questRep;
  const amount = table[kind] ?? table.other ?? 0;
  if (amount <= 0) return;
  const label = typeof m.label === "string" && m.label ? m.label.replace(/§./g, "").slice(0, 60) : "a quest";
  /** @type {Record<string, string>} */
  const kinds = CONFIG.kindGuild;
  const g = isGuild(m.guild) ? m.guild : kinds[kind];
  if (isGuild(g)) giveRep(m.player, g, amount, label);
  else {
    // No guild of its own (a story chapter, a town project): shared out between all four.
    const share = Math.max(1, Math.round(amount / GUILDS.length));
    for (const each of GUILDS) giveRep(m.player, each, share, label);
  }
}

/** @param {any} m */
function repAdd(m) {
  if (typeof m.player !== "string" || !isGuild(m.guild) || typeof m.amount !== "number" || !Number.isFinite(m.amount)) return;
  const amount = Math.max(-10000, Math.min(10000, Math.trunc(m.amount)));
  const reason = typeof m.reason === "string" && m.reason ? m.reason.replace(/§./g, "").slice(0, 60) : undefined;
  giveRep(m.player, m.guild, amount, reason);
}

/** A champion fell (the Champions pack): the Wardens notice. @param {any} m */
function championSlain(m) {
  /** @type {string[]} */
  const ids = [];
  if (typeof m.player === "string") ids.push(m.player);
  if (Array.isArray(m.helpers)) for (const h of m.helpers) if (typeof h === "string" && !ids.includes(h)) ids.push(h);
  const name = typeof m.name === "string" ? m.name.replace(/§./g, "").slice(0, 40) : "a champion";
  for (const id of ids) {
    if (get("passive.enabled") === true && CONFIG.passive.championRep > 0) giveRep(id, "wardens", CONFIG.passive.championRep, name);
    const p = online(id);
    if (p && hasPerk(p, "wardens")) {
      p.addEffect("strength", CONFIG.perks.wardens.strengthSeconds * 20, { amplifier: 0 });
      perkNote(p, `§cWardens' Guild: Strength I for ${CONFIG.perks.wardens.strengthSeconds}s`);
    }
  }
}

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:quest_done" && id !== "realm:rep_add" && id !== "realm:champion_slain" && id !== "realm:npc_talk" && id !== "realm:npc_choose") return;
    let m;
    try {
      m = JSON.parse(message);
    } catch {
      return;
    }
    if (!m || typeof m !== "object") return;
    try {
      if (id === "realm:quest_done") questDone(m);
      else if (id === "realm:rep_add") repAdd(m);
      else if (id === "realm:champion_slain") championSlain(m);
      else if (id === "realm:npc_talk") {
        if (Array.isArray(m.roles) && m.roles.includes(CONFIG.npcRole) && typeof m.req === "string")
          system.sendScriptEvent("realm:npc_offer", JSON.stringify({ req: m.req, pack: "guilds_bp", key: "hall", label: "Guild hall", order: 30 }));
      } else if (m.pack === "guilds_bp" && m.key === "hall" && typeof m.player === "string") {
        const p = online(m.player);
        if (p) showGuilds(p, "Guild hall").catch((e) => console.warn(`[guilds] ${e}`));
      }
    } catch (e) {
      console.warn(`[guilds] ${id}: ${e}`);
    }
  },
  { namespaces: ["realm"] },
);

// ---------------------------------------------------------------------------
// Plain play: counters toward reputation, and the perks
// ---------------------------------------------------------------------------

/** @type {Map<string, Prog>} */
const progCache = new Map();
/** Players whose counters changed since the last save. @type {Set<string>} */
const dirty = new Set();
/** Per player, not saved: when they mined ores lately, sprint distance, last place, perk cooldown. @type {Map<string, { mined: number[], sprint: number, last?: { x: number, y: number, z: number, dim: string }, speedUntil: number }>} */
const live = new Map();

/** @param {Player} p @returns {Prog} */
function progOf(p) {
  let prog = progCache.get(p.id);
  if (prog) return prog;
  prog = { o: 0, c: 0, k: 0, b: 0 };
  try {
    const raw = p.getDynamicProperty(PROP_PROG);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : undefined;
    if (parsed && typeof parsed === "object") for (const k of /** @type {(keyof Prog)[]} */ (["o", "c", "k", "b"])) if (typeof parsed[k] === "number") prog[k] = parsed[k];
  } catch {
    // corrupt: start again
  }
  progCache.set(p.id, prog);
  return prog;
}

/** @param {Player} p */
function liveOf(p) {
  let l = live.get(p.id);
  if (!l) live.set(p.id, (l = { mined: [], sprint: 0, speedUntil: 0 }));
  return l;
}

/** Plain play doesn't count in creative or spectator mode. @param {Player} p */
function playing(p) {
  try {
    const mode = p.getGameMode();
    return mode !== GameMode.Creative && mode !== GameMode.Spectator;
  } catch {
    return false;
  }
}

/**
 * Adds to a counter and turns every full `per` into a point of reputation.
 * @param {Player} p @param {keyof Prog} key @param {number} n @param {number} per @param {Guild} g
 */
function count(p, key, n, per, g) {
  if (get("passive.enabled") !== true || per <= 0) return;
  const prog = progOf(p);
  prog[key] += n;
  dirty.add(p.id);
  if (prog[key] >= per) {
    const points = Math.floor(prog[key] / per);
    prog[key] -= points * per;
    addRep(p, g, points);
  }
}

/** A short note above the hotbar (the Coordinates HUD steps aside for it). @param {Player} p @param {string} text */
function perkNote(p, text) {
  p.onScreenDisplay.setActionBar(text);
  system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: p.id, ticks: 50 }));
}

const ores = new Set(CONFIG.ores);
const crops = new Map(CONFIG.crops.map((c) => [c.block, c]));
const hostile = new Set(CONFIG.hostile);

/** Ores and stateless crops (melons, pumpkins) players placed lately, "dim:x,y,z". @type {Set<string>} */
const placed = new Set();
/** @param {string} dim @param {Vector3} at */
const spot = (dim, at) => `${dim}:${at.x},${at.y},${at.z}`;

/** Is this permutation a fully grown crop from `crops`? @param {import("@minecraft/server").BlockPermutation} perm */
function ripe(perm) {
  const c = crops.get(perm.type.id);
  if (!c) return false;
  if (c.state === undefined) return true;
  try {
    return perm.getState(/** @type {any} */ (c.state)) === c.ripe;
  } catch {
    return false;
  }
}

world.afterEvents.playerPlaceBlock.subscribe(({ block }) => {
  try {
    const id = block.typeId;
    if (!ores.has(id) && !(crops.has(id) && crops.get(id)?.state === undefined)) return;
    const key = spot(block.dimension.id, block.location);
    placed.delete(key);
    placed.add(key);
    if (placed.size > PLACED_MEMORY) placed.delete(/** @type {string} */ (placed.values().next().value));
  } catch (e) {
    console.warn(`[guilds] ${e}`);
  }
});

/** A grown crop was harvested at `at`. @param {Player} p @param {string} type @param {import("@minecraft/server").Dimension} dim @param {Vector3} at */
function harvested(p, type, dim, at) {
  count(p, "c", 1, get("passive.cropsPerRep"), "growers");
  const drop = crops.get(type)?.drop;
  if (drop && hasPerk(p, "growers") && Math.random() < CONFIG.perks.growers.extraChance) {
    try {
      dim.spawnItem(new ItemStack(drop, 1), { x: at.x + 0.5, y: at.y + 0.5, z: at.z + 0.5 });
    } catch (e) {
      console.warn(`[guilds] extra crop ${drop}: ${e}`);
    }
  }
}

world.afterEvents.playerBreakBlock.subscribe(({ player, block, brokenBlockPermutation }) => {
  try {
    if (!playing(player)) return;
    const id = brokenBlockPermutation.type.id;
    if (!ores.has(id) && !crops.has(id)) return;
    if (placed.delete(spot(block.dimension.id, block.location))) return;
    if (ores.has(id)) {
      count(player, "o", 1, get("passive.oresPerRep"), "miners");
      if (hasPerk(player, "miners")) {
        const m = CONFIG.perks.miners;
        const l = liveOf(player);
        const now = Date.now();
        l.mined = l.mined.filter((t) => now - t <= m.seconds * 1000);
        l.mined.push(now);
        if (l.mined.length >= m.ores) {
          l.mined = [];
          player.addEffect("haste", m.hasteSeconds * 20, { amplifier: 0 });
          perkNote(player, `§eMiners' Guild: Haste I for ${m.hasteSeconds}s`);
        }
      }
    } else if (ripe(brokenBlockPermutation)) harvested(player, id, block.dimension, block.location);
  } catch (e) {
    console.warn(`[guilds] ${e}`);
  }
});

// A tap that resets a grown crop to its first stage is a harvest too (the Right-click Harvest pack).
world.beforeEvents.playerInteractWithBlock.subscribe(({ player, block, isFirstEvent }) => {
  if (!isFirstEvent) return;
  const c = crops.get(block.typeId);
  if (!c || c.state === undefined || !ripe(block.permutation)) return;
  const dimension = block.dimension;
  const at = { ...block.location };
  const type = block.typeId;
  system.runTimeout(() => {
    try {
      const b = dimension.getBlock(at);
      if (!b || !player.isValid || !playing(player)) return;
      // Broken instead (now air) is counted by playerBreakBlock.
      if (b.typeId === type && !ripe(b.permutation)) harvested(player, type, dimension, at);
    } catch (e) {
      console.warn(`[guilds] ${e}`);
    }
  }, 3);
});

world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  const killer = damageSource.damagingEntity;
  if (!(killer instanceof Player)) return;
  try {
    if (!hostile.has(deadEntity.typeId) || !playing(killer)) return;
    count(killer, "k", 1, get("passive.killsPerRep"), "wardens");
  } catch (e) {
    console.warn(`[guilds] ${e}`);
  }
});

world.afterEvents.playerSpawn.subscribe(({ player }) => {
  const l = live.get(player.id);
  if (l) l.last = undefined; // respawning or joining isn't traveling
});

// Save the counters as the player leaves (the 30-second save would miss the last few).
world.beforeEvents.playerLeave.subscribe(({ player }) => {
  try {
    const prog = progCache.get(player.id);
    if (prog && dirty.has(player.id)) player.setDynamicProperty(PROP_PROG, JSON.stringify({ o: prog.o, c: prog.c, k: prog.k, b: Math.floor(prog.b) }));
  } catch (e) {
    console.warn(`[guilds] save on leave: ${e}`);
  }
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  live.delete(playerId);
  progCache.delete(playerId);
  dirty.delete(playerId);
});

/** Saves changed counters (every 30 seconds: they change too often to save each time). */
function saveProgress() {
  for (const id of dirty) {
    const p = online(id);
    const prog = progCache.get(id);
    if (!p || !prog) continue;
    try {
      p.setDynamicProperty(PROP_PROG, JSON.stringify({ o: prog.o, c: prog.c, k: prog.k, b: Math.floor(prog.b) }));
    } catch (e) {
      console.warn(`[guilds] save: ${e}`);
    }
  }
  dirty.clear();
}

let seconds = 0;
system.runInterval(() => {
  seconds++;
  for (const p of world.getAllPlayers()) {
    try {
      const l = liveOf(p);
      const loc = p.location;
      const dim = p.dimension.id;
      const last = l.last;
      l.last = { x: loc.x, y: loc.y, z: loc.z, dim };
      if (!last || last.dim !== dim || !playing(p)) continue;
      // Idle players (the AFK pack's tag) earn nothing: riding a minecart or boat loop isn't traveling.
      if (CONFIG.afkTag && p.hasTag(CONFIG.afkTag)) continue;
      const dist = Math.hypot(loc.x - last.x, loc.y - last.y, loc.z - last.z);
      if (dist > CONFIG.maxSpeed || dist < 0.05) continue;
      count(p, "b", dist, get("passive.blocksPerRep"), "wayfarers");
      // Wayfarers' perk: sprint distance (on the ground), not while our Speed is still on.
      if (p.isSprinting && system.currentTick >= l.speedUntil && hasPerk(p, "wayfarers")) {
        const w = CONFIG.perks.wayfarers;
        l.sprint += Math.hypot(loc.x - last.x, loc.z - last.z);
        if (l.sprint >= w.sprintBlocks) {
          l.sprint = 0;
          l.speedUntil = system.currentTick + w.speedSeconds * 20;
          p.addEffect("speed", w.speedSeconds * 20, { amplifier: 0 });
          perkNote(p, `§bWayfarers' Guild: Speed I for ${w.speedSeconds}s`);
        }
      }
    } catch (e) {
      console.warn(`[guilds] ${e}`);
    }
  }
  if (seconds % 30 === 0) saveProgress();
}, 20);

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

/** "[||||||....]" in color. @param {number} p @param {number} of */
function bar(p, of) {
  const filled = Math.round((Math.max(0, Math.min(p, of)) / Math.max(1, of)) * 20);
  return `§a${"|".repeat(filled)}§8${"|".repeat(20 - filled)}§r`;
}

/**
 * Shows a form, waiting while the player is busy (chat open, another menu).
 * @template {ActionFormData} F @param {Player} player @param {F} form
 */
async function show(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await new Promise((r) => system.runTimeout(() => r(undefined), 20));
  }
  return undefined;
}

/** A guild's standing, for the menu. @param {Player} p @param {Guild} g */
function standing(p, g) {
  const rep = repOf(p, g);
  const i = rankIndex(rep);
  const next = RANKS[i + 1];
  const lines = [`§l${guildName(g)}§r: §e${RANKS[i].name}§r (rank ${i + 1} of ${RANKS.length}), ${fmt(rep)} rep`];
  if (next) {
    const base = RANKS[i].rep;
    lines.push(`${bar(rep - base, next.rep - base)} §7${next.name} at ${fmt(next.rep)} (${fmt(next.rep - rep)} to go)`);
  } else lines.push(`${bar(1, 1)} §7Highest rank`);
  if (get("perks.enabled") === true) {
    const perkRank = get("perkRank");
    const status = i + 1 >= perkRank ? "§a(yours)" : `§8(from ${RANKS[perkRank - 1]?.name ?? `rank ${perkRank}`})`;
    lines.push(`§7Perk: ${PERK_TEXT[g]()} ${status}`);
  }
  return lines.join("\n");
}

/** The standings in all four guilds, with a button for each shop. @param {Player} player @param {string} title */
async function showGuilds(player, title) {
  for (;;) {
    const body = [...GUILDS.map((g) => standing(player, g)), `§7Crowns: §6${fmt(crownsOf(player))}`].join("\n\n");
    const form = new ActionFormData().title(`§l${title}`).body(body);
    for (const g of GUILDS) form.button(`${guildName(g)} shop`);
    form.button("Close");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || res.selection >= GUILDS.length) return;
    const back = await showShop(player, GUILDS[res.selection]);
    if (!back) return;
  }
}

/**
 * One guild's shop. Returns true for "Back".
 * @param {Player} player @param {Guild} g
 */
async function showShop(player, g) {
  const stock = CONFIG.shops[g] ?? [];
  let note = "";
  for (;;) {
    const rank = rankOf(player, g);
    const form = new ActionFormData()
      .title(`§l${guildName(g)} shop`)
      .body(`${note ? `${note}\n\n` : ""}Your rank: §e${RANKS[rank - 1].name}§r. Your Crowns: §6${fmt(crownsOf(player))}§r.\nHigher ranks unlock more stock.`);
    for (const s of stock) {
      const label = `${s.amount} ${itemName(s.item)} - ${fmt(s.price)} Crowns`;
      form.button(s.rank <= rank ? label : `§8${label}\n[${RANKS[s.rank - 1]?.name ?? `rank ${s.rank}`}]`);
    }
    form.button("Back");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined) return false;
    if (res.selection >= stock.length) return true;
    const s = stock[res.selection];
    note = buy(player, g, s);
  }
}

/** @param {Player} player @param {Guild} g @param {{ item: string, amount: number, price: number, rank: number }} s @returns {string} what happened */
function buy(player, g, s) {
  if (rankOf(player, g) < s.rank) return `§cThat needs the rank ${RANKS[s.rank - 1]?.name ?? s.rank} in the ${guildName(g)}.`;
  /** @type {ItemStack} */
  let probe;
  try {
    probe = new ItemStack(s.item, 1);
  } catch {
    console.warn(`[guilds] shop item ${s.item} doesn't exist`);
    return "§cThat item isn't available.";
  }
  const have = crownsOf(player);
  if (!takeCrowns(player, s.price)) return `§cYou need ${fmt(s.price)} Crowns (you have ${fmt(have)}).`;
  const container = player.getComponent("minecraft:inventory")?.container;
  let left = Math.max(1, Math.floor(s.amount));
  let dropped = false;
  while (left > 0) {
    const stack = new ItemStack(s.item, Math.min(probe.maxAmount, left));
    left -= stack.amount;
    const rest = container ? container.addItem(stack) : stack;
    if (rest) {
      player.dimension.spawnItem(rest, player.location);
      dropped = true;
    }
  }
  player.sendMessage(`§6-${fmt(s.price)} Crowns §7(${guildName(g)}: ${s.amount} ${itemName(s.item)})`);
  player.playSound("random.orb", { pitch: 1.2 });
  return `§aBought ${s.amount} ${itemName(s.item)}.${dropped ? " Some dropped at your feet: your inventory is full." : ""}`;
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:guilds",
      description: "Guilds: your rank and reputation in all four guilds, their perks and their shops",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => showGuilds(player, "Guilds").catch((e) => console.warn(`[guilds] ${e}`)));
      return { status: CustomCommandStatus.Success };
    },
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "guilds_bp");
  },
  { namespaces: ["realm"] },
);
