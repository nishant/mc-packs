import {
  CommandPermissionLevel,
  CustomCommandStatus,
  GameMode,
  Player,
  PlayerPermissionLevel,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get, getFor } from "./settings.js";

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").ScoreboardObjective} ScoreboardObjective */
/** @typedef {{ d: string, x: number, y: number, z: number }} Board a registered lectern */
/**
 * A champion target: spot (x, z) and last seen (lx, lz), spawned (s), done, claimed by (by).
 * @typedef {{ id: string, t: "c", name: string, trait: string, mob: string, dim: string, x: number, z: number, lx: number, lz: number, s: number, done: number, by?: string }} Hunt
 */
/**
 * A cull bounty: progress (p) and each player's kills (who), for everyone together.
 * @typedef {{ id: string, t: "k", label: string, count: number, mobs: string[], p: number, who: Record<string, number>, done: number, by?: string }} Cull
 */
/** @typedef {Hunt | Cull} Bounty */
/** @typedef {{ d: number, list: Bounty[] }} Day */

const PROP_BOARDS = "bounty:boards"; // world: JSON Board[] (the first in the overworld places the targets)
const PROP_DAY = "bounty:day"; // world: JSON Day
const PROP_PENDING = "bounty:pending"; // world: JSON { playerId: crowns } owed to players who were offline
const TAG = "realm:bounty:"; // + bounty id, on the target champion (elite_bp adds it for us)
const LECTERN = "minecraft:lectern";
const OVERWORLD = "minecraft:overworld";
const DAY_MS = 86400000;
const TRAITS = ["stormcaller", "frostbound", "vampiric", "splitting", "shielded"];

const rand = (/** @type {number} */ a, /** @type {number} */ b) => a + Math.random() * (b - a);
/** @template T @param {T[]} list @returns {T} */
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** 12345 -> "12,345". @param {number} n */
const fmt = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** @param {string} id @returns {Player | undefined} */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);

/** "N", "NE", ... from `from` towards `to` (north is -z). @param {{ x: number, z: number }} from @param {{ x: number, z: number }} to */
function direction(from, to) {
  const deg = (Math.atan2(to.x - from.x, -(to.z - from.z)) * 180) / Math.PI;
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((deg + 360) % 360) / 45) % 8];
}

/** "about 900 blocks". @param {number} d */
function about(d) {
  const r = d < 100 ? Math.max(10, Math.round(d / 10) * 10) : Math.round(d / 50) * 50;
  return `about ${fmt(r)} blocks`;
}

/** Today's number: days since 1970 counted from resetHourUtc. */
const today = () => Math.floor((Date.now() - get("resetHourUtc") * 3600000) / DAY_MS);

/** "5h 12m" until the next bounties. */
function untilReset() {
  const next = (today() + 1) * DAY_MS + get("resetHourUtc") * 3600000;
  const m = Math.max(1, Math.ceil((next - Date.now()) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/** @param {string} key @returns {any} */
function readJson(key) {
  try {
    const raw = world.getDynamicProperty(key);
    return typeof raw === "string" ? JSON.parse(raw) : undefined;
  } catch {
    console.warn(`[bounty] ${key} is corrupt; starting over`);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Crowns (the crowns scoreboard: works with or without the Crowns pack)
// ---------------------------------------------------------------------------

/** @returns {ScoreboardObjective} */
function crownsObjective() {
  const existing = world.scoreboard.getObjective("crowns");
  if (existing) return existing;
  try {
    return world.scoreboard.addObjective("crowns", "Crowns");
  } catch {
    return /** @type {ScoreboardObjective} */ (world.scoreboard.getObjective("crowns"));
  }
}

/** Pays a player by id now, or when they next join. @param {string} playerId @param {number} n @param {string} why */
function pay(playerId, n, why) {
  n = Math.floor(n);
  if (n <= 0) return;
  const p = online(playerId);
  if (p) {
    crownsObjective().addScore(p, n);
    p.sendMessage(`§6+${fmt(n)} Crowns §7(${why})`);
    return;
  }
  const owed = readJson(PROP_PENDING) ?? {};
  owed[playerId] = (typeof owed[playerId] === "number" ? owed[playerId] : 0) + n;
  const ids = Object.keys(owed);
  for (const id of ids.slice(0, Math.max(0, ids.length - 300))) delete owed[id];
  world.setDynamicProperty(PROP_PENDING, JSON.stringify(owed));
}

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  try {
    const owed = readJson(PROP_PENDING);
    const n = owed?.[player.id];
    if (typeof n !== "number") return;
    delete owed[player.id];
    world.setDynamicProperty(PROP_PENDING, Object.keys(owed).length ? JSON.stringify(owed) : undefined);
    crownsObjective().addScore(player, Math.floor(n));
    player.sendMessage(`§6+${fmt(n)} Crowns §7(Bounty rewards while you were away)`);
  } catch (e) {
    console.warn(`[bounty] ${e}`);
  }
});

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

/** @type {Board[] | undefined} */
let boardCache;
/** @returns {Board[]} */
function boards() {
  if (!boardCache) {
    const raw = readJson(PROP_BOARDS);
    boardCache = Array.isArray(raw) ? raw.filter((b) => b && typeof b.d === "string" && [b.x, b.y, b.z].every((v) => typeof v === "number")) : [];
  }
  return /** @type {Board[]} */ (boardCache);
}
/** @param {Board[]} list */
function saveBoards(list) {
  boardCache = list;
  world.setDynamicProperty(PROP_BOARDS, list.length ? JSON.stringify(list) : undefined);
}
/** @param {string} d @param {Vector3} at */
const boardAt = (d, at) => boards().find((b) => b.d === d && b.x === at.x && b.y === at.y && b.z === at.z);
/** The board that places the targets: the first one in the overworld. */
const mainBoard = () => boards().find((b) => b.d === OVERWORLD);

/** The lectern the player is looking at, within 6 blocks. @param {Player} player */
function lecternInView(player) {
  const hit = player.getBlockFromViewDirection({ maxDistance: 6 });
  return hit && hit.block.typeId === LECTERN ? hit.block : undefined;
}

/** @param {Player} player */
function register(player) {
  const block = lecternInView(player);
  if (!block) return player.sendMessage("§cLook at a lectern (within 6 blocks) to make it a bounty board.");
  const at = block.location;
  const d = block.dimension.id;
  if (boardAt(d, at)) return player.sendMessage("§7That lectern is already a bounty board.");
  saveBoards([...boards(), { d, x: at.x, y: at.y, z: at.z }]);
  player.sendMessage(`§aBounty board registered at ${at.x}, ${at.y}, ${at.z}. §7Players tap it to see the bounties.`);
  if (d === OVERWORLD && mainBoard()?.x === at.x && mainBoard()?.z === at.z) addMissingHunts();
}

/** @param {Player} player */
function unregister(player) {
  const block = lecternInView(player);
  if (!block) return player.sendMessage("§cLook at the bounty board's lectern (within 6 blocks) to remove it.");
  const at = block.location;
  const d = block.dimension.id;
  if (!boardAt(d, at)) return player.sendMessage("§7That lectern isn't a bounty board.");
  saveBoards(boards().filter((b) => !(b.d === d && b.x === at.x && b.y === at.y && b.z === at.z)));
  player.sendMessage("§aBounty board removed. §7The lectern is an ordinary lectern again.");
}

world.afterEvents.playerBreakBlock.subscribe(({ player, block, brokenBlockPermutation }) => {
  try {
    if (brokenBlockPermutation.type.id !== LECTERN) return;
    const at = block.location;
    const d = block.dimension.id;
    if (!boardAt(d, at)) return;
    saveBoards(boards().filter((b) => !(b.d === d && b.x === at.x && b.y === at.y && b.z === at.z)));
    player.sendMessage("§7That lectern was a bounty board; it no longer is.");
  } catch (e) {
    console.warn(`[bounty] ${e}`);
  }
});

// Tapping a board opens it. An operator sneaking in creative mode uses the lectern normally.
world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  const { player, block, isFirstEvent } = ev;
  if (block.typeId !== LECTERN) return;
  const board = boardAt(block.dimension.id, block.location);
  if (!board) return;
  try {
    if (player.isSneaking && player.playerPermissionLevel === PlayerPermissionLevel.Operator && player.getGameMode() === GameMode.Creative) return;
  } catch {
    // fall through: open the board
  }
  ev.cancel = true;
  if (!isFirstEvent) return;
  system.run(() => showBoard(player, board).catch((e) => console.warn(`[bounty] ${e}`)));
});

// ---------------------------------------------------------------------------
// The day's bounties
// ---------------------------------------------------------------------------

/** @type {Day | undefined} */
let dayCache;
let dirty = false;

/** @returns {Day} */
function day() {
  if (!dayCache) {
    const raw = readJson(PROP_DAY);
    dayCache = raw && typeof raw.d === "number" && Array.isArray(raw.list) ? raw : { d: -1, list: [] };
  }
  return /** @type {Day} */ (dayCache);
}

function saveDay() {
  dirty = false;
  try {
    world.setDynamicProperty(PROP_DAY, JSON.stringify(day()));
  } catch (e) {
    console.warn(`[bounty] save: ${e}`);
  }
}

/** Was the Champions pack heard from? undefined until we know. @type {boolean | undefined} */
let eliteSeen;
let ready = false; // a few seconds after the world loads, once the Champions pack had time to answer

/** Blocks players make and nature doesn't (terracotta only when glazed: plain terracotta is natural in badlands). */
const BUILT =
  /planks|glass|chest|barrel|sign|bed$|torch|lantern|door|fence|wool|carpet|concrete|glazed|crafting_table|furnace|smoker|bookshelf|lectern|anvil|hopper|_rail|^minecraft:rail|banner|campfire|loom|smithing|cartography|fletching|grindstone|stonecutter|enchanting|beacon|bell|composter|cauldron|brewing|jukebox|note_block|scaffolding|ladder|stairs|slab|brick|polished|item_frame|flower_pot|candle|shulker|dispenser|dropper|piston|observer|repeater|comparator|redstone_lamp|lever|button|pressure_plate/;

/** A spot for a target: `minDistance` to `maxDistance` from the board, not near the world spawn. @param {Board} board */
function targetSpot(board) {
  const spawn = world.getDefaultSpawnLocation();
  const min = Math.min(get("minDistance"), get("maxDistance"));
  const max = Math.max(get("minDistance"), get("maxDistance"));
  let x = board.x;
  let z = board.z;
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = rand(min, max);
    x = Math.floor(board.x + Math.cos(angle) * dist);
    z = Math.floor(board.z + Math.sin(angle) * dist);
    if (Math.hypot(x - spawn.x, z - spawn.z) >= CONFIG.avoidSpawn) break;
  }
  return { x, z };
}

/** @param {number} d @param {number} i @param {Board} board @returns {Hunt} */
function newHunt(d, i, board) {
  const target = pick(CONFIG.targets);
  const { x, z } = targetSpot(board);
  return {
    id: `${d}_${i}`,
    t: "c",
    name: `${pick(CONFIG.names)} the ${pick(target.epithets)}`,
    // Creepers don't hit, so no hit-based traits for them.
    trait: pick(target.mob === "minecraft:creeper" ? TRAITS.filter((t) => t !== "frostbound" && t !== "vampiric") : TRAITS),
    mob: target.mob,
    dim: OVERWORLD,
    x,
    z,
    lx: x,
    lz: z,
    s: 0,
    done: 0,
  };
}

/** Can the board post champion targets right now? */
const huntsPossible = () => !!mainBoard() && eliteSeen !== false;

/** New bounties for day `d`. @param {number} d */
function roll(d) {
  const total = Math.max(1, get("count"));
  const board = mainBoard();
  const hunts = board && huntsPossible() ? Math.min(total, get("champions")) : 0;
  /** @type {Bounty[]} */
  const list = [];
  let i = 0;
  for (; i < hunts; i++) list.push(newHunt(d, i, /** @type {Board} */ (board)));
  const culls = [...CONFIG.culls].sort(() => Math.random() - 0.5).slice(0, total - hunts);
  for (const c of culls) list.push({ id: `${d}_${i++}`, t: "k", label: c.label, count: c.count, mobs: c.mobs, p: 0, who: {}, done: 0 });
  dayCache = { d, list };
  saveDay();
  spawnState.clear();
  if (list.length) {
    const names = list.map((b) => (b.t === "c" ? b.name : b.label)).join(", ");
    for (const p of world.getAllPlayers()) p.sendMessage(`§6[Bounty] New bounties are posted: ${names}. §7See them with /realm:bounty`);
  }
}

/** A board registered after today's roll: add today's champion targets if there are none. */
function addMissingHunts() {
  const today_ = day();
  const board = mainBoard();
  if (!board || !huntsPossible() || today_.d !== today() || today_.list.some((b) => b.t === "c")) return;
  const n = Math.min(get("count"), get("champions"));
  let next = today_.list.length;
  for (let i = 0; i < n; i++) today_.list.push(newHunt(today_.d, next++, board));
  saveDay();
}

/** Rolls new bounties when the day changed. */
function ensureDay() {
  if (!ready || get("enabled") !== true) return;
  const d = today();
  if (day().d !== d) roll(d);
}

// ---------------------------------------------------------------------------
// Spawning the targets (when a player comes near: the chunk must be loaded)
// ---------------------------------------------------------------------------

/** Per target, not saved: spots tried, when to try again, when we asked, ticks unseen. @type {Map<string, { tries: number, retryAt: number, askedAt: number, unseen: number }>} */
const spawnState = new Map();

/**
 * Is there anything player-made in the 9 x 9 columns around (x, z), from the surface down 4?
 * Unloaded columns count as built (we can't tell).
 * @param {Dimension} dim @param {number} x @param {number} z
 */
function nearBuilt(dim, x, z) {
  for (let dx = -4; dx <= 4; dx++)
    for (let dz = -4; dz <= 4; dz++) {
      const top = dim.getTopmostBlock({ x: x + dx, z: z + dz });
      if (!top) return true;
      for (let y = top.y; y >= top.y - 4; y--) {
        const b = dim.getBlock({ x: x + dx, y, z: z + dz });
        if (!b || BUILT.test(b.typeId)) return true;
      }
    }
  return false;
}

/** The loaded target for a bounty, if any. @param {Hunt} h */
function targetOf(h) {
  return world.getDimension(h.dim).getEntities({ tags: [TAG + h.id] })[0];
}

/** One step for one target, while players are around. @param {Hunt} h @param {Player[]} players */
function tend(h, players) {
  const now = system.currentTick;
  let st = spawnState.get(h.id);
  if (!st) spawnState.set(h.id, (st = { tries: 0, retryAt: 0, askedAt: -1, unseen: 0 }));
  const dist = get("spawnDistance");
  const near = players.some((p) => Math.hypot(p.location.x - h.lx, p.location.z - h.lz) <= dist);

  if (h.s) {
    // Spawned: follow where it is, and spawn it again if it's gone (despawned, or died without a player).
    const e = targetOf(h);
    if (e) {
      st.unseen = 0;
      const at = e.location;
      if (Math.hypot(at.x - h.lx, at.z - h.lz) > 16) {
        h.lx = Math.floor(at.x);
        h.lz = Math.floor(at.z);
        dirty = true;
      }
    } else if (near && ++st.unseen >= 15) {
      h.s = 0;
      st.unseen = 0;
      dirty = true;
    }
    return;
  }

  if (st.askedAt >= 0) {
    // We asked the Champions pack for it: did it appear?
    if (now - st.askedAt < 40) return;
    st.askedAt = -1;
    const e = targetOf(h);
    if (e) {
      h.s = 1;
      dirty = true;
      eliteSeen = true;
    } else st.retryAt = now + 1200; // try again in a minute
    return;
  }
  if (!near || now < st.retryAt) return;

  const dim = world.getDimension(h.dim);
  // The first try is the spot itself; then places 16 to 40 blocks around it.
  let x = h.lx;
  let z = h.lz;
  if (st.tries > 0) {
    const angle = Math.random() * Math.PI * 2;
    const r = rand(16, 40);
    x = Math.floor(h.lx + Math.cos(angle) * r);
    z = Math.floor(h.lz + Math.sin(angle) * r);
  }
  const top = dim.getTopmostBlock({ x, z });
  if (!top) return; // not loaded yet
  let mob = h.mob;
  if (nearBuilt(dim, x, z)) {
    // Somebody's build (or land we can't see yet): look around it, and after a few tries move the
    // target 100 to 200 blocks away (the board shows the new place).
    if (++st.tries >= 6) {
      const angle = Math.random() * Math.PI * 2;
      const r = rand(100, 200);
      h.lx = Math.floor(h.lx + Math.cos(angle) * r);
      h.lz = Math.floor(h.lz + Math.sin(angle) * r);
      st.tries = 0;
      dirty = true;
    }
    return;
  }
  if (top.isLiquid || top.typeId === "minecraft:water") mob = "minecraft:drowned";
  st.tries = 0;
  st.askedAt = now;
  h.lx = x;
  h.lz = z;
  dirty = true;
  system.sendScriptEvent(
    "realm:champion_spawn",
    JSON.stringify({ dim: h.dim, x: x + 0.5, y: top.y + 1, z: z + 0.5, mob, trait: h.trait, name: h.name, tag: TAG + h.id }),
  );
}

/** Removes targets from earlier days or claimed bounties that are still around. */
function sweep() {
  const active = new Set(day().list.filter((b) => b.t === "c" && !b.done && day().d === today()).map((b) => TAG + b.id));
  for (const id of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
    try {
      for (const e of world.getDimension(id).getEntities({ tags: ["realm:champion"] })) {
        const tag = e.getTags().find((t) => t.startsWith(TAG));
        if (tag && !active.has(tag)) e.remove();
      }
    } catch (e) {
      console.warn(`[bounty] sweep: ${e}`);
    }
  }
}

/** Forgets boards whose lectern is gone (an explosion, a piston...). Only checks loaded ones. */
function checkBoards() {
  const list = boards();
  const keep = list.filter((b) => {
    try {
      const block = world.getDimension(b.d).getBlock(b);
      return !block || block.typeId === LECTERN;
    } catch {
      return true; // unloaded
    }
  });
  if (keep.length !== list.length) saveBoards(keep);
}

let seconds = 0;
system.runInterval(() => {
  seconds += 2;
  try {
    ensureDay();
    const d = day();
    if (d.d === today() && get("enabled") === true) {
      const players = world.getDimension(OVERWORLD).getPlayers();
      for (const b of d.list) {
        if (b.t !== "c" || b.done) continue;
        try {
          tend(b, players);
        } catch (e) {
          console.warn(`[bounty] target ${b.id}: ${e}`);
        }
      }
    }
    if (seconds % 10 === 0) {
      sweep();
      checkBoards();
    }
    if (dirty) saveDay();
  } catch (e) {
    console.warn(`[bounty] ${e}`);
  }
}, 40);

world.afterEvents.worldLoad.subscribe(() => {
  // Is the Champions pack installed? Every pack answers /realm:help's ping with its folder name.
  system.runTimeout(() => system.sendScriptEvent("realm:help_ping", ""), 40);
  system.runTimeout(() => {
    if (eliteSeen === undefined) eliteSeen = false;
    ready = true;
    ensureDay();
  }, 100);
});

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

/** Party mates of a player (the Parties pack's tag) within 64 blocks. @param {Player} p @returns {string[]} */
function partyMates(p) {
  const tag = p.getTags().find((t) => t.startsWith("realm_party:"));
  if (!tag) return [];
  return p.dimension
    .getPlayers({ location: p.location, maxDistance: 64, tags: [tag] })
    .filter((o) => o.id !== p.id)
    .map((o) => o.id);
}

/** @param {Hunt} h @param {string} killerId @param {string[]} helperIds */
function claim(h, killerId, helperIds) {
  const killer = online(killerId);
  const helpers = new Set(helperIds.filter((id) => id !== killerId));
  if (killer) for (const id of partyMates(killer)) helpers.add(id);
  helpers.delete(killerId);
  h.done = 1;
  h.by = killer?.name ?? "a player";
  saveDay();

  const why = `Bounty: ${h.name}`;
  pay(killerId, get("rewards.champion"), why);
  system.sendScriptEvent("realm:quest_done", JSON.stringify({ player: killerId, pack: "bounty_bp", id: h.id, label: why, kind: "bounty" }));
  if (CONFIG.rewards.killerRep > 0) system.sendScriptEvent("realm:rep_add", JSON.stringify({ player: killerId, guild: "wardens", amount: CONFIG.rewards.killerRep, reason: why }));
  for (const id of helpers) {
    pay(id, get("rewards.helper"), `${why}, helper`);
    if (CONFIG.rewards.helperRep > 0) system.sendScriptEvent("realm:rep_add", JSON.stringify({ player: id, guild: "wardens", amount: CONFIG.rewards.helperRep, reason: why }));
  }
  killer?.playSound("random.levelup", { pitch: 1, volume: 1 });
  const extra = helpers.size ? ` §7(with ${helpers.size} helper${helpers.size === 1 ? "" : "s"})` : "";
  for (const p of world.getAllPlayers()) p.sendMessage(`§6[Bounty] ${h.by} claimed the bounty on ${h.name}!${extra}`);
}

/** @param {Cull} c @param {Player} finisher */
function finishCull(c, finisher) {
  c.done = 1;
  c.by = finisher.name;
  saveDay();
  const ids = Object.keys(c.who);
  const why = `Bounty: ${c.label}`;
  for (const id of ids) {
    pay(id, get("rewards.cull"), why);
    system.sendScriptEvent("realm:quest_done", JSON.stringify({ player: id, pack: "bounty_bp", id: c.id, label: why, kind: "bounty" }));
    if (CONFIG.rewards.helperRep > 0) system.sendScriptEvent("realm:rep_add", JSON.stringify({ player: id, guild: "wardens", amount: CONFIG.rewards.helperRep, reason: why }));
  }
  const n = ids.length;
  for (const p of world.getAllPlayers()) p.sendMessage(`§6[Bounty] The realm finished "${c.label}"! §7${n} player${n === 1 ? "" : "s"} share the reward.`);
}

world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  const killer = damageSource.damagingEntity;
  if (!(killer instanceof Player)) return;
  try {
    const d = day();
    if (d.d !== today()) return;
    const type = deadEntity.typeId;
    for (const b of d.list) {
      if (b.t !== "k" || b.done || !b.mobs.includes(type)) continue;
      b.p = Math.min(b.count, b.p + 1);
      b.who[killer.id] = (b.who[killer.id] ?? 0) + 1;
      dirty = true;
      if (b.p >= b.count) finishCull(b, killer);
      else if (getFor(killer, "notes") === true) {
        killer.onScreenDisplay.setActionBar(`§eBounty: ${b.label} §f${b.p}/${b.count}`);
        system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: killer.id, ticks: 40 }));
      }
    }
  } catch (e) {
    console.warn(`[bounty] ${e}`);
  }
});

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id === "realm:help_pong") {
      if (message === "elite_bp") eliteSeen = true;
      return;
    }
    if (id !== "realm:champion_slain" && id !== "realm:npc_talk" && id !== "realm:npc_choose") return;
    let m;
    try {
      m = JSON.parse(message);
    } catch {
      return;
    }
    if (!m || typeof m !== "object") return;
    try {
      if (id === "realm:champion_slain") {
        if (typeof m.tag !== "string" || !m.tag.startsWith(TAG)) return;
        const d = day();
        const h = d.list.find((b) => b.t === "c" && TAG + b.id === m.tag);
        if (!h || h.t !== "c" || h.done || d.d !== today()) return;
        if (typeof m.player === "string") claim(h, m.player, Array.isArray(m.helpers) ? m.helpers.filter((/** @type {unknown} */ x) => typeof x === "string") : []);
        else {
          // It died with no player to thank (lava, a fall): it shows up again in a few minutes.
          h.s = 0;
          const st = spawnState.get(h.id);
          if (st) st.retryAt = system.currentTick + 6000;
          else spawnState.set(h.id, { tries: 0, retryAt: system.currentTick + 6000, askedAt: -1, unseen: 0 });
          if (typeof m.x === "number" && typeof m.z === "number") {
            h.lx = Math.floor(m.x);
            h.lz = Math.floor(m.z);
          }
          dirty = true;
        }
      } else if (id === "realm:npc_talk") {
        if (Array.isArray(m.roles) && m.roles.includes(CONFIG.npcRole) && typeof m.req === "string")
          system.sendScriptEvent("realm:npc_offer", JSON.stringify({ req: m.req, pack: "bounty_bp", key: "board", label: "Bounties", order: 40 }));
      } else if (m.pack === "bounty_bp" && m.key === "board" && typeof m.player === "string") {
        const p = online(m.player);
        if (p) showBoard(p).catch((e) => console.warn(`[bounty] ${e}`));
      }
    } catch (e) {
      console.warn(`[bounty] ${id}: ${e}`);
    }
  },
  { namespaces: ["realm"] },
);

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

/** "[||||||....]" in color. @param {number} p @param {number} of */
function bar(p, of) {
  const filled = Math.round((Math.min(p, of) / Math.max(1, of)) * 20);
  return `§a${"|".repeat(filled)}§8${"|".repeat(20 - filled)}§r`;
}

/**
 * The bounties, as seen from a board (`board`: "of here") or from anywhere (directions from the player).
 * @param {Player} player @param {Board} [board]
 */
async function showBoard(player, board) {
  ensureDay();
  const d = day();
  const from = board ? { x: board.x + 0.5, z: board.z + 0.5, dim: board.d, word: "here" } : { x: player.location.x, z: player.location.z, dim: player.dimension.id, word: "you" };
  /** @type {string[]} */
  const parts = [];
  if (!board) {
    const main = mainBoard() ?? boards()[0];
    if (!main) parts.push("§7There's no bounty board yet: an operator makes one with /realm:bounty_board.");
    else if (main.d === from.dim) {
      const dist = Math.hypot(main.x - from.x, main.z - from.z);
      parts.push(`§7The bounty board is at ${main.x}, ${main.y}, ${main.z}${dist >= 8 ? ` (${direction(from, main)} of you, ${about(dist)})` : " (right here)"}.`);
    } else parts.push(`§7The bounty board is at ${main.x}, ${main.y}, ${main.z} in the overworld.`);
  }
  if (d.d !== today() || !d.list.length) parts.push(get("enabled") === true ? "No bounties are posted yet." : "No bounties right now.");
  else {
    parts.push(`New bounties in ${untilReset()}.`);
    for (const b of d.list) {
      if (b.t === "c") {
        if (b.done) {
          parts.push(`§a[Claimed by ${b.by ?? "a player"}] §7${b.name}`);
          continue;
        }
        let where = `last seen near ${b.lx}, ${b.lz}`;
        if (from.dim === b.dim) where += ` (${direction(from, { x: b.lx, z: b.lz })} of ${from.word}, ${about(Math.hypot(b.lx - from.x, b.lz - from.z))})`;
        parts.push(`§c${b.name}§r - ${where}\n§7Reward: ${fmt(get("rewards.champion"))} Crowns to whoever defeats it, ${fmt(get("rewards.helper"))} to each helper`);
      } else if (b.done) parts.push(`§a[Done] §7${b.label}`);
      else {
        const mine = b.who[player.id] ?? 0;
        parts.push(`§e${b.label}§r (everyone together)\n${bar(b.p, b.count)} §f${b.p}/${b.count}${mine ? ` §7(${mine} by you)` : ""}\n§7Reward: ${fmt(get("rewards.cull"))} Crowns to everyone who helps`);
      }
    }
  }
  const form = new ActionFormData().title("§lBounty Board").body(parts.join("\n\n")).button("OK");
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return;
    const res = await form.show(player);
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return;
    await new Promise((r) => system.runTimeout(() => r(undefined), 20));
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * A command handler that runs `run` for the player outside the read-only command context.
 * @param {(p: Player) => void | Promise<void>} run
 * @returns {(origin: import("@minecraft/server").CustomCommandOrigin) => import("@minecraft/server").CustomCommandResult}
 */
const forPlayer = (run) => (origin) => {
  const player = origin.initiator ?? origin.sourceEntity;
  if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
  system.run(async () => {
    try {
      await run(player);
    } catch (e) {
      console.warn(`[bounty] ${e}`);
    }
  });
  return { status: CustomCommandStatus.Success };
};

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:bounty",
      description: "Bounty Board: today's bounties, where the targets were last seen, and where the board is",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    forPlayer((p) => showBoard(p)),
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:bounty_board",
      description: "Make the lectern you are looking at a bounty board",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
    },
    forPlayer(register),
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:bounty_board_remove",
      description: "Make the bounty board you are looking at an ordinary lectern again",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
    },
    forPlayer(unregister),
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "bounty_bp");
  },
  { namespaces: ["realm"] },
);
