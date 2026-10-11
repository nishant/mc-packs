import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  ItemStack,
  Player,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { analyze, lineFor, payFor, spinReels } from "./reels.js";
import { get } from "./settings.js";

// A slot machine: three reels drawn at random by the weights in config.js, paid from its table.
// Played from the Slot Machine item or from a block an operator made a machine. Stakes are Crowns
// (the shared `crowns` scoreboard) or emeralds from the inventory. Every player has a daily loss
// limit, a cooldown between spins and can block themselves from playing.

const OBJECTIVE = "crowns";
const EMERALD = "minecraft:emerald";
const ITEM = "minecraft:carrot_on_a_stick";
const ITEM_NAME = "§r§6Slot Machine";
const ITEM_LORE = "§7Use it to play the slots";
const ITEM_PROP = "slots:machine";
const PROP_STATS = "slots:stats"; // player: JSON Stats
const PROP_DAY = "slots:day"; // player: JSON { day, crowns, emeralds } net loss today
const PROP_BLOCK = "slots:block"; // player: time (ms) the self-block ends; -1 = until an operator lifts it
const PROP_MACHINES = "slots:machines"; // world: JSON [{ d, x, y, z }]
const PROP_TOTALS = "slots:totals"; // world: JSON Totals
const DAY = 86400000;
const SPIN_TICKS = [20, 30, 40]; // the tick each reel stops on
const MAX_MACHINES = 100;

/** @typedef {"crowns" | "emeralds"} Currency */
/** @typedef {{ spins: number, crowns: { staked: number, won: number }, emeralds: { staked: number, won: number }, best: number, bestCur: string, jackpots: number }} Stats */
/** @typedef {{ spins: number, crownsIn: number, crownsOut: number, emeraldsIn: number, emeraldsOut: number, jackpots: number }} Totals */
/** @typedef {{ d: string, x: number, y: number, z: number }} Machine */

/** 12345 -> "12,345". @param {number} n */
const fmt = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
/** @param {Currency} cur @param {number} n */
const money = (cur, n) => (cur === "crowns" ? `${fmt(n)} Crown${n === 1 ? "" : "s"}` : `${fmt(n)} emerald${n === 1 ? "" : "s"}`);
/** @param {Currency} cur */
const curName = (cur) => (cur === "crowns" ? "Crowns" : "Emeralds");
/** @param {number} ticks */
const wait = (ticks) => new Promise((r) => system.runTimeout(() => r(undefined), ticks));
const utcDay = () => Math.floor(Date.now() / DAY);
/** @param {Player} p */
const isOp = (p) => p.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

/** @param {Player} player @param {string} text @param {number} [ticks] */
function actionbar(player, text, ticks = 40) {
  player.onScreenDisplay.setActionBar(text);
  system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: player.id, ticks }));
}

/** @template T @param {Player | import("@minecraft/server").World} holder @param {string} key @param {T} fallback @returns {T} */
function readJson(holder, key, fallback) {
  try {
    const raw = holder.getDynamicProperty(key);
    const v = typeof raw === "string" ? JSON.parse(raw) : undefined;
    return v && typeof v === "object" ? v : fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Money: Crowns on the scoreboard, emeralds in the inventory
// ---------------------------------------------------------------------------

function objective() {
  const existing = world.scoreboard.getObjective(OBJECTIVE);
  if (existing) return existing;
  try {
    return world.scoreboard.addObjective(OBJECTIVE, "Crowns");
  } catch {
    return /** @type {import("@minecraft/server").ScoreboardObjective} */ (world.scoreboard.getObjective(OBJECTIVE));
  }
}

/** @param {Player} p */
const inventoryOf = (p) => p.getComponent("minecraft:inventory")?.container;

/** Plain emeralds only (a renamed or lore'd emerald is someone's keepsake). @param {ItemStack | undefined} item */
const plainEmerald = (item) => !!item && item.typeId === EMERALD && !item.nameTag && item.getLore().length === 0;

/** @param {Player} p @param {Currency} cur */
function balanceOf(p, cur) {
  if (cur === "crowns") {
    try {
      return objective().getScore(p) ?? 0;
    } catch {
      return 0;
    }
  }
  const inv = inventoryOf(p);
  let n = 0;
  if (inv) for (let i = 0; i < inv.size; i++) if (plainEmerald(inv.getItem(i))) n += /** @type {ItemStack} */ (inv.getItem(i)).amount;
  return n;
}

/** Takes exactly `n`, or nothing. @param {Player} p @param {Currency} cur @param {number} n @returns {boolean} */
function take(p, cur, n) {
  if (n <= 0) return true;
  if (balanceOf(p, cur) < n) return false;
  if (cur === "crowns") {
    objective().addScore(p, -n);
    return true;
  }
  const inv = inventoryOf(p);
  if (!inv) return false;
  let left = n;
  for (let i = 0; i < inv.size && left > 0; i++) {
    const item = inv.getItem(i);
    if (!item || !plainEmerald(item)) continue;
    const t = Math.min(item.amount, left);
    left -= t;
    if (t >= item.amount) inv.setItem(i, undefined);
    else {
      item.amount -= t;
      inv.setItem(i, item);
    }
  }
  return left === 0;
}

/** Pays `n`; emeralds that don't fit drop at the player's feet. @param {Player} p @param {Currency} cur @param {number} n */
function pay(p, cur, n) {
  if (n <= 0) return;
  if (cur === "crowns") return objective().addScore(p, n);
  const inv = inventoryOf(p);
  let left = n;
  while (left > 0) {
    const stack = new ItemStack(EMERALD, Math.min(64, left));
    left -= stack.amount;
    const rest = inv ? inv.addItem(stack) : stack;
    if (rest) p.dimension.spawnItem(rest, p.location);
  }
}

// ---------------------------------------------------------------------------
// Player records: stats, today's losses, self-block
// ---------------------------------------------------------------------------

/** @param {Player} p @returns {Stats} */
function statsOf(p) {
  const s = readJson(p, PROP_STATS, /** @type {any} */ ({}));
  return {
    spins: Number(s.spins) || 0,
    crowns: { staked: Number(s.crowns?.staked) || 0, won: Number(s.crowns?.won) || 0 },
    emeralds: { staked: Number(s.emeralds?.staked) || 0, won: Number(s.emeralds?.won) || 0 },
    best: Number(s.best) || 0,
    bestCur: typeof s.bestCur === "string" ? s.bestCur : "",
    jackpots: Number(s.jackpots) || 0,
  };
}

/** Net loss today per currency (negative when ahead). @param {Player} p @returns {{ day: number, crowns: number, emeralds: number }} */
function todayOf(p) {
  const t = readJson(p, PROP_DAY, /** @type {any} */ ({}));
  if (t.day !== utcDay()) return { day: utcDay(), crowns: 0, emeralds: 0 };
  return { day: t.day, crowns: Number(t.crowns) || 0, emeralds: Number(t.emeralds) || 0 };
}

/** @param {Currency} cur */
const limitOf = (cur) => Math.max(0, Math.floor(Number(get(`dailyLossLimit.${cur}`)) || 0));

/** How much more the player may lose today, or Infinity without a limit. @param {Player} p @param {Currency} cur */
function roomToday(p, cur) {
  const limit = limitOf(cur);
  if (limit <= 0) return Infinity;
  return Math.max(0, limit - todayOf(p)[cur]);
}

/** @param {Player} p @returns {number} 0 = not blocked, -1 = until lifted, else the end time */
function blockOf(p) {
  const v = p.getDynamicProperty(PROP_BLOCK);
  if (typeof v !== "number") return 0;
  if (v === -1) return -1;
  if (v <= Date.now()) {
    p.setDynamicProperty(PROP_BLOCK, undefined);
    return 0;
  }
  return v;
}

/** @param {number} until */
function blockText(until) {
  if (until === -1) return "until an operator lifts it";
  const hours = Math.ceil((until - Date.now()) / 3600000);
  return hours > 48 ? `for ${Math.ceil(hours / 24)} more days` : `for ${hours} more hour${hours === 1 ? "" : "s"}`;
}

/** @returns {Totals} */
function totals() {
  const t = readJson(world, PROP_TOTALS, /** @type {any} */ ({}));
  return {
    spins: Number(t.spins) || 0,
    crownsIn: Number(t.crownsIn) || 0,
    crownsOut: Number(t.crownsOut) || 0,
    emeraldsIn: Number(t.emeraldsIn) || 0,
    emeraldsOut: Number(t.emeraldsOut) || 0,
    jackpots: Number(t.jackpots) || 0,
  };
}

// ---------------------------------------------------------------------------
// A spin
// ---------------------------------------------------------------------------

/** @type {Map<string, number>} player id -> tick the next spin may start */
const nextSpin = new Map();
/** @type {Set<string>} players whose reels are turning */
const spinning = new Set();

/** @param {Currency} cur */
const allowed = (cur) => get(`currencies.${cur}`) === true;
/** @param {Currency} cur @returns {number[]} */
const stakesOf = (cur) => (CONFIG.stakes[cur] ?? []).filter((s) => Number.isInteger(s) && s > 0);

/**
 * Why the player can't spin for `stake` now, or undefined when they can.
 * @param {Player} p @param {Currency} cur @param {number} stake
 */
function whyNot(p, cur, stake) {
  if (get("enabled") !== true) return "The slot machines are closed.";
  const block = blockOf(p);
  if (block) return `You blocked yourself from the slots ${blockText(block)}.`;
  if (!allowed(cur)) return `This realm doesn't take ${curName(cur)} at the slots.`;
  if (!stakesOf(cur).includes(stake)) return "That isn't one of the stakes.";
  if (spinning.has(p.id)) return "The reels are still turning.";
  const ready = nextSpin.get(p.id) ?? 0;
  if (system.currentTick < ready) return `Wait ${Math.ceil((ready - system.currentTick) / 20)}s before the next spin.`;
  if (stake > roomToday(p, cur)) {
    const room = roomToday(p, cur);
    return room <= 0 ? `You reached today's loss limit for ${curName(cur)} (${money(cur, limitOf(cur))}). Come back tomorrow (UTC).` : `That stake is over what's left of today's loss limit (${money(cur, room)}).`;
  }
  if (balanceOf(p, cur) < stake) return `You need ${money(cur, stake)}; you have ${money(cur, balanceOf(p, cur))}.`;
  return undefined;
}

/** @param {string} id */
const symbolOf = (id) => CONFIG.symbols.find((s) => s.id === id) ?? CONFIG.symbols[0];
/** @param {string} id */
const cell = (id) => {
  const s = symbolOf(id);
  const pad = 6 - s.name.length;
  const left = " ".repeat(Math.max(0, Math.floor(pad / 2)));
  return `${s.color}${left}${s.name}${" ".repeat(Math.max(0, pad - left.length))}`;
};
/** @param {string[]} reels */
const reelLine = (reels) => `§8[ ${reels.map(cell).join(" §8| ")} §8]`;

/**
 * Takes the stake, draws the reels, pays any win and records it all, at once. The animation that
 * follows only shows this result. Returns undefined (and changes nothing) when the spin isn't allowed.
 * @param {Player} p @param {Currency} cur @param {number} stake
 * @returns {{ reels: string[], won: number, line: import("./reels.js").PayLine | undefined } | string}
 */
export function spin(p, cur, stake) {
  const no = whyNot(p, cur, stake);
  if (no) return no;
  if (!take(p, cur, stake)) return `You need ${money(cur, stake)}.`;
  const reels = spinReels(CONFIG.symbols, Math.random);
  const line = lineFor(CONFIG.payouts, reels);
  const won = payFor(line, stake);
  pay(p, cur, won);

  const s = statsOf(p);
  s.spins++;
  s[cur].staked += stake;
  s[cur].won += won;
  if (won > s.best || (won === s.best && won > 0 && !s.bestCur)) {
    s.best = won;
    s.bestCur = cur;
  }
  if (line?.jackpot) s.jackpots++;
  p.setDynamicProperty(PROP_STATS, JSON.stringify(s));
  const today = todayOf(p);
  today[cur] += stake - won;
  p.setDynamicProperty(PROP_DAY, JSON.stringify(today));
  const t = totals();
  t.spins++;
  if (cur === "crowns") {
    t.crownsIn += stake;
    t.crownsOut += won;
  } else {
    t.emeraldsIn += stake;
    t.emeraldsOut += won;
  }
  if (line?.jackpot) t.jackpots++;
  world.setDynamicProperty(PROP_TOTALS, JSON.stringify(t));
  return { reels, won, line };
}

/** Spins and plays the reels. Resolves when they've stopped. @param {Player} p @param {Currency} cur @param {number} stake @returns {Promise<boolean>} true if it spun */
async function play(p, cur, stake) {
  const result = spin(p, cur, stake);
  if (typeof result === "string") {
    p.sendMessage(`§c${result}`);
    return false;
  }
  spinning.add(p.id);
  try {
    const shown = [0, 1, 2].map(() => CONFIG.symbols[Math.floor(Math.random() * CONFIG.symbols.length)].id);
    for (let tick = 2; tick <= SPIN_TICKS[2]; tick += 2) {
      await wait(2);
      if (!p.isValid) return true;
      for (let r = 0; r < 3; r++) {
        if (tick >= SPIN_TICKS[r]) shown[r] = result.reels[r]; // stopped: the real result
        else shown[r] = CONFIG.symbols[Math.floor(Math.random() * CONFIG.symbols.length)].id;
      }
      actionbar(p, reelLine(shown), 60);
      if (SPIN_TICKS.includes(tick)) p.playSound("random.click", { pitch: 0.8, volume: 0.8 });
      else p.playSound("note.hat", { pitch: 1.6, volume: 0.25 });
    }
    finish(p, cur, stake, result);
  } finally {
    spinning.delete(p.id);
    nextSpin.set(p.id, system.currentTick + Math.max(0, Math.floor(Number(get("cooldownSeconds")) || 0)) * 20);
  }
  return true;
}

/** @param {Player} p @param {Currency} cur @param {number} stake @param {{ reels: string[], won: number, line: import("./reels.js").PayLine | undefined }} result */
function finish(p, cur, stake, result) {
  const bal = `Balance: ${fmt(balanceOf(p, cur))}`;
  if (result.line?.jackpot) {
    p.onScreenDisplay.setTitle("§dJACKPOT!", { subtitle: `§6+${money(cur, result.won)}`, fadeInDuration: 5, stayDuration: 60, fadeOutDuration: 20 });
    p.sendMessage(`§dJACKPOT! §6+${money(cur, result.won)} §7(${bal})`);
    celebrate(p);
    if (get("announceJackpots") === true) world.sendMessage(`§d[Slots] ${p.name} hit the JACKPOT for ${money(cur, result.won)}!`);
  } else if (result.won > 0) {
    const name = symbolOf(result.line?.symbol ?? "").name;
    p.sendMessage(`§a${result.line?.count ?? 0}x ${name}! §6+${money(cur, result.won)} §7(stake ${fmt(stake)}. ${bal})`);
    p.playSound(result.won >= stake * 10 ? "random.levelup" : "random.orb", { pitch: 1.1, volume: 0.8 });
  } else {
    p.sendMessage(`§7No win. -${money(cur, stake)} (${bal})`);
  }
}

/** Fireworks and sparkles around the winner. @param {Player} p */
function celebrate(p) {
  const loc = p.location;
  p.playSound("random.totem", { volume: 0.7 });
  for (let i = 0; i < 4; i++) {
    system.runTimeout(() => {
      try {
        if (!p.isValid) return;
        const a = (i / 4) * Math.PI * 2;
        const at = { x: loc.x + Math.cos(a) * 2, y: loc.y + 0.5, z: loc.z + Math.sin(a) * 2 };
        p.dimension.spawnEntity("minecraft:fireworks_rocket", at);
        p.dimension.spawnParticle("minecraft:totem_particle", { x: loc.x, y: loc.y + 1.2, z: loc.z });
        p.playSound("firework.launch", { volume: 0.8 });
        system.runTimeout(() => p.isValid && p.playSound("firework.large_blast", { volume: 0.8 }), 25);
      } catch (e) {
        console.warn(`[slots] ${e}`);
      }
    }, i * 8);
  }
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

/**
 * Shows a form, retrying while the player still has chat or another screen open.
 * @template {ActionFormData | ModalFormData} F
 * @param {Player} player @param {F} form
 * @returns {Promise<Awaited<ReturnType<F["show"]>> | undefined>}
 */
async function show(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = /** @type {any} */ (await form.show(player));
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await wait(20);
  }
  return undefined;
}

/** @param {Player} p @param {ActionFormData} form @param {{ label: string, run: () => unknown }[]} items @returns {Promise<boolean>} false when closed */
async function choose(p, form, items) {
  for (const it of items) form.button(it.label);
  const res = await show(p, form);
  if (!res || res.canceled || res.selection === undefined) return false;
  const it = items[res.selection];
  if (!it) return false;
  await it.run();
  return true;
}

/** @param {Player} p */
function limitsLine(p) {
  /** @type {string[]} */
  const out = [];
  for (const cur of /** @type {Currency[]} */ (["crowns", "emeralds"])) {
    if (!allowed(cur)) continue;
    const room = roomToday(p, cur);
    out.push(`${curName(cur)}: you have §6${fmt(balanceOf(p, cur))}§r${room === Infinity ? "" : `, today's limit leaves ${fmt(room)}`}`);
  }
  return out.join("\n");
}

/** The machine: pick a currency, then a stake, then spin. @param {Player} p */
async function machine(p) {
  if (get("enabled") !== true) return p.sendMessage("§7The slot machines are closed.");
  const block = blockOf(p);
  if (block) return p.sendMessage(`§7You blocked yourself from the slots ${blockText(block)}.`);
  /** @type {Currency[]} */
  const curs = /** @type {Currency[]} */ (["crowns", "emeralds"]).filter(allowed);
  if (!curs.length) return p.sendMessage("§7The slot machines take no stakes right now.");
  let cur = curs[0];
  if (curs.length > 1) {
    const form = new ActionFormData().title("§lSlot Machine").body(`${limitsLine(p)}\n\nWhat do you want to play for?`);
    for (const c of curs) form.button(`${curName(c)}\n§8Stakes ${stakesOf(c).join(", ")}`);
    form.button("Close");
    const res = await show(p, form);
    if (!res || res.canceled || res.selection === undefined || res.selection >= curs.length) return;
    cur = curs[res.selection];
  }
  await stakeMenu(p, cur);
}

/** @param {Player} p @param {Currency} cur */
async function stakeMenu(p, cur) {
  const stakes = stakesOf(cur);
  if (!stakes.length) return p.sendMessage("§7No stakes are set for that currency.");
  const form = new ActionFormData().title(`§lSlots: ${curName(cur)}`).body(`${limitsLine(p)}\n\nPick your stake. The pay table is in /realm:slots.`);
  const have = balanceOf(p, cur);
  const room = roomToday(p, cur);
  for (const s of stakes) form.button(`Spin for ${money(cur, s)}${have < s ? "\n§8not enough" : s > room ? "\n§8over today's limit" : ""}`);
  form.button("Back");
  const res = await show(p, form);
  if (!res || res.canceled || res.selection === undefined) return;
  if (res.selection >= stakes.length) return machine(p);
  await spinLoop(p, cur, stakes[res.selection]);
}

/** Spins, then offers the same stake again. @param {Player} p @param {Currency} cur @param {number} stake */
async function spinLoop(p, cur, stake) {
  for (let round = 0; round < 500; round++) {
    const spun = await play(p, cur, stake);
    if (!spun || !p.isValid) return;
    await wait(10);
    const form = new ActionFormData()
      .title("§lSlot Machine")
      .body(`${limitsLine(p)}`)
      .button(`Spin again\n§8${money(cur, stake)}`)
      .button("Change stake")
      .button("Close");
    const res = await show(p, form);
    if (!res || res.canceled || res.selection === undefined || res.selection === 2) return;
    if (res.selection === 1) return stakeMenu(p, cur);
    const ready = nextSpin.get(p.id) ?? 0;
    if (system.currentTick < ready) await wait(ready - system.currentTick);
  }
}

/** @param {Player} p */
async function statsPage(p) {
  const s = statsOf(p);
  const today = todayOf(p);
  /** @param {Currency} cur */
  const row = (cur) => {
    const net = s[cur].won - s[cur].staked;
    return `${curName(cur)}: staked ${fmt(s[cur].staked)}, won ${fmt(s[cur].won)}, ${net >= 0 ? `§aup ${fmt(net)}` : `§cdown ${fmt(-net)}`}§r`;
  };
  /** @param {Currency} cur */
  const todayRow = (cur) => (today[cur] > 0 ? `lost ${fmt(today[cur])}` : today[cur] < 0 ? `won ${fmt(-today[cur])}` : "even");
  const body = [
    `Spins: §e${fmt(s.spins)}`,
    row("crowns"),
    row("emeralds"),
    `Biggest win: ${s.best ? money(/** @type {Currency} */ (s.bestCur || "crowns"), s.best) : "none yet"}`,
    `Jackpots: ${s.jackpots}`,
    "",
    `Today (UTC): Crowns ${todayRow("crowns")}, emeralds ${todayRow("emeralds")}`,
  ].join("\n");
  await show(p, new ActionFormData().title("§lMy slots stats").body(body).button("OK"));
}

function payTableText() {
  const a = analyze(CONFIG.symbols, CONFIG.payouts);
  const lines = a.lines.map(({ line, chance }) => {
    const s = symbolOf(line.symbol);
    const what = line.count >= 3 ? `${s.color}${s.name} ${s.name} ${s.name}` : `${s.color}${line.count === 2 ? "Any two" : "Any one"} ${s.name}`;
    return `${what}§r: ${line.pay}x stake${line.jackpot ? " §d(jackpot)" : ""} §8(1 in ${fmt(Math.round(1 / Math.max(chance, 1e-9)))})`;
  });
  return [
    "Wins pay a multiple of your stake (it includes your stake). Only the best line counts.",
    "",
    ...lines,
    "",
    `Return to player: §e${(a.rtp * 100).toFixed(2)}%§r. On average a spin gives back ${Math.round(a.rtp * 100)} of every 100 staked, so the machine keeps about ${(100 - a.rtp * 100).toFixed(0)}%.`,
    `A spin wins something ${(a.hitRate * 100).toFixed(1)}% of the time.`,
    "Each reel is drawn on its own and shows exactly what was drawn.",
  ].join("\n");
}

/** @param {Player} p */
async function payTable(p) {
  await show(p, new ActionFormData().title("§lPay table").body(payTableText()).button("OK"));
}

/** @param {Player} p */
async function limitsPage(p) {
  const block = blockOf(p);
  /** @type {string[]} */
  const body = [
    "Daily loss limits (stakes minus winnings, per UTC day):",
    ...(/** @type {Currency[]} */ (["crowns", "emeralds"]).map((cur) => {
      const limit = limitOf(cur);
      return `${curName(cur)}: ${limit ? `${fmt(limit)}, lost today ${fmt(Math.max(0, todayOf(p)[cur]))}` : "no limit"}`;
    })),
    `Pause between spins: ${Math.max(0, Math.floor(Number(get("cooldownSeconds")) || 0))}s`,
    "",
    block ? `§cYou blocked yourself from the slots ${blockText(block)}.` : "Want a break? Block yourself from the slots. Only time (or an operator) lifts it.",
  ];
  const form = new ActionFormData().title("§lLimits and breaks").body(body.join("\n"));
  if (block) {
    form.button("OK");
    await show(p, form);
    return;
  }
  const choices = [
    { label: "Block me for 1 day", ms: DAY },
    { label: "Block me for 7 days", ms: DAY * 7 },
    { label: "Block me for 30 days", ms: DAY * 30 },
    { label: "Block me until an operator lifts it", ms: -1 },
  ];
  for (const c of choices) form.button(c.label);
  form.button("Back");
  const res = await show(p, form);
  if (!res || res.canceled || res.selection === undefined || res.selection >= choices.length) return;
  const c = choices[res.selection];
  const ok = await show(p, new ActionFormData().title("§lBlock yourself?").body(`${c.label.replace("Block me", "You won't be able to play the slots")}. You can't undo this yourself.`).button("Yes, block me").button("Cancel"));
  if (!ok || ok.canceled || ok.selection !== 0) return;
  selfBlock(p, c.ms);
}

/** @param {Player} p @param {number} ms -1 = until lifted */
export function selfBlock(p, ms) {
  const until = ms === -1 ? -1 : Date.now() + ms;
  p.setDynamicProperty(PROP_BLOCK, until);
  p.sendMessage(`§aYou blocked yourself from the slots ${blockText(until)}. §7Take care.`);
}

// ---------------------------------------------------------------------------
// The item and fixed machines
// ---------------------------------------------------------------------------

function makeItem() {
  const stack = new ItemStack(ITEM, 1);
  stack.nameTag = ITEM_NAME;
  stack.setLore([ITEM_LORE]);
  stack.setDynamicProperty(ITEM_PROP, true);
  return stack;
}

/** @param {ItemStack | undefined} item */
function isMachineItem(item) {
  if (!item || item.typeId !== ITEM) return false;
  try {
    if (item.getDynamicProperty(ITEM_PROP) === true) return true;
  } catch {
    // no dynamic properties
  }
  return item.getLore()[0] === ITEM_LORE;
}

/** @param {Player} p */
function giveItem(p) {
  const rest = inventoryOf(p)?.addItem(makeItem());
  if (rest) p.dimension.spawnItem(rest, p.location);
  p.sendMessage("§aYou got a §6Slot Machine§a. Use it to play.");
}

world.beforeEvents.itemUse.subscribe((ev) => {
  try {
    if (!isMachineItem(ev.itemStack)) return;
    ev.cancel = true;
    const p = ev.source;
    system.run(() => p.isValid && !spinning.has(p.id) && machine(p).catch((e) => console.warn(`[slots] ${e}`)));
  } catch {
    // not ours
  }
});

/** @returns {Machine[]} */
const machines = () => {
  const list = readJson(world, PROP_MACHINES, /** @type {Machine[]} */ ([]));
  return Array.isArray(list) ? list : [];
};
/** @param {Machine[]} list */
const saveMachines = (list) => world.setDynamicProperty(PROP_MACHINES, list.length ? JSON.stringify(list) : undefined);
/** @param {string} d @param {import("@minecraft/server").Vector3} at */
const machineAt = (d, at) => machines().find((m) => m.d === d && m.x === at.x && m.y === at.y && m.z === at.z);

/** @param {Player} p */
function blockInView(p) {
  const hit = p.getBlockFromViewDirection({ maxDistance: 6 });
  return hit?.block;
}

/** @param {Player} p */
function placeMachine(p) {
  const block = blockInView(p);
  if (!block || block.isAir || block.isLiquid) return p.sendMessage("§cLook at a block (within 6 blocks) to make it a slot machine.");
  const d = p.dimension.id;
  const at = block.location;
  if (machineAt(d, at)) return p.sendMessage("§7That block is already a slot machine.");
  const list = machines();
  if (list.length >= MAX_MACHINES) return p.sendMessage(`§cThere are already ${MAX_MACHINES} machines. Remove one first.`);
  list.push({ d, x: at.x, y: at.y, z: at.z });
  saveMachines(list);
  p.sendMessage(`§aThat ${block.typeId.replace(/^minecraft:/, "").replace(/_/g, " ")} is now a slot machine. §7Players tap it to play. Sneak-tap in creative mode to use the block normally.`);
}

/** @param {Player} p */
function removeMachine(p) {
  const block = blockInView(p);
  if (!block) return p.sendMessage("§cLook at the slot machine's block (within 6 blocks) to remove it.");
  const d = p.dimension.id;
  const at = block.location;
  if (!machineAt(d, at)) return p.sendMessage("§7That block isn't a slot machine.");
  saveMachines(machines().filter((m) => !(m.d === d && m.x === at.x && m.y === at.y && m.z === at.z)));
  p.sendMessage("§aSlot machine removed. §7The block is an ordinary block again.");
}

/** @type {Map<string, number>} player id -> tick of the last machine tap */
const lastTap = new Map();

world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  const { block, player } = ev;
  if (!machineAt(block.dimension.id, block.location)) return;
  if (player.isSneaking && player.getGameMode() === "Creative") return;
  ev.cancel = true;
  // Holding use repeats the event: open once per tap (by time, which works on every device).
  if ((lastTap.get(player.id) ?? -100) > system.currentTick - 10) return;
  lastTap.set(player.id, system.currentTick);
  system.run(() => player.isValid && !spinning.has(player.id) && machine(player).catch((e) => console.warn(`[slots] ${e}`)));
});

// A machine block that is broken stops being a machine.
world.afterEvents.playerBreakBlock.subscribe(({ block, dimension }) => {
  if (!machineAt(dimension.id, block.location)) return;
  saveMachines(machines().filter((m) => !(m.d === dimension.id && m.x === block.location.x && m.y === block.location.y && m.z === block.location.z)));
});

// ---------------------------------------------------------------------------
// The menu
// ---------------------------------------------------------------------------

/** @param {Player} p */
async function menu(p) {
  /** @type {{ label: string, run: () => unknown }[]} */
  const items = [
    { label: "Spin\n§8Play the slots", run: () => machine(p) },
    { label: "My stats", run: () => statsPage(p) },
    { label: "Pay table\n§8What wins and how often", run: () => payTable(p) },
    { label: "Limits and breaks\n§8Daily limits, block yourself", run: () => limitsPage(p) },
  ];
  if (isOp(p)) items.push({ label: "Operator tools", run: () => opMenu(p) });
  items.push({ label: "Close", run: () => undefined });
  const body = get("enabled") === true ? limitsLine(p) || "No currency is enabled." : "§7The slot machines are closed.";
  await choose(p, new ActionFormData().title("§lSlot Machine").body(body), items);
}

/** @param {Player} p */
async function opMenu(p) {
  const t = totals();
  const body = [
    `All spins: ${fmt(t.spins)}, jackpots: ${t.jackpots}`,
    `Crowns: staked ${fmt(t.crownsIn)}, paid out ${fmt(t.crownsOut)}`,
    `Emeralds: staked ${fmt(t.emeraldsIn)}, paid out ${fmt(t.emeraldsOut)}`,
    `Machines: ${machines().length}`,
  ].join("\n");
  await choose(p, new ActionFormData().title("§lSlots: operator tools").body(body), [
    { label: "Make the block I look at a machine", run: () => placeMachine(p) },
    { label: "Remove the machine I look at", run: () => removeMachine(p) },
    { label: "Give me a Slot Machine item", run: () => giveItem(p) },
    { label: "Give a player a Slot Machine item", run: () => givePlayerMenu(p) },
    { label: "Limits and stakes\n§8/realm:config > Slot Machine", run: () => p.sendMessage("§7Daily loss limits, the currencies and the pause between spins are in /realm:config > Slot Machine. Stakes and the pay table are in config.js.") },
    { label: "Lift a player's self-block", run: () => liftMenu(p) },
    { label: "Back", run: () => menu(p) },
  ]);
}

/** @param {Player} op */
async function givePlayerMenu(op) {
  const players = world.getAllPlayers();
  const form = new ModalFormData().title("§lGive a Slot Machine").dropdown("Player", players.map((x) => x.name), { defaultValueIndex: 0 }).submitButton("Give");
  const res = await show(op, form);
  if (!res || res.canceled || !res.formValues) return;
  const target = players[Number(res.formValues[0])];
  if (!target?.isValid) return op.sendMessage("§cThat player left.");
  giveItem(target);
  if (target.id !== op.id) op.sendMessage(`§aGave ${target.name} a Slot Machine.`);
}

/** @param {Player} op */
async function liftMenu(op) {
  const blocked = world.getAllPlayers().filter((x) => blockOf(x) !== 0);
  if (!blocked.length) return op.sendMessage("§7Nobody online has blocked themselves from the slots.");
  const form = new ActionFormData().title("§lLift a self-block").body("These players blocked themselves. Lift it only if they ask you to.");
  for (const x of blocked) form.button(`${x.name}\n§8${blockText(blockOf(x))}`);
  form.button("Back");
  const res = await show(op, form);
  if (!res || res.canceled || res.selection === undefined || res.selection >= blocked.length) return;
  const target = blocked[res.selection];
  if (!target.isValid) return;
  target.setDynamicProperty(PROP_BLOCK, undefined);
  target.sendMessage("§7An operator lifted your block from the slots.");
  op.sendMessage(`§aLifted ${target.name}'s self-block.`);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** @param {import("@minecraft/server").CustomCommandOrigin} origin */
const playerOf = (origin) => {
  const p = origin.initiator ?? origin.sourceEntity;
  return p instanceof Player ? p : undefined;
};

/** @param {() => unknown} fn */
function later(fn) {
  system.run(() => {
    try {
      const r = fn();
      if (r instanceof Promise) r.catch((e) => console.warn(`[slots] ${e}`));
    } catch (e) {
      console.warn(`[slots] ${e}`);
    }
  });
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    { name: "realm:slots", description: "Slot Machine: spin, your stats, the pay table and limits", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => {
      const p = playerOf(origin);
      if (!p) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      later(() => menu(p));
      return { status: CustomCommandStatus.Success };
    },
  );
  customCommandRegistry.registerCommand(
    { name: "realm:slots_spin", description: "Slot Machine: open the machine and spin", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => {
      const p = playerOf(origin);
      if (!p) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      later(() => !spinning.has(p.id) && machine(p));
      return { status: CustomCommandStatus.Success };
    },
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:slots_give",
      description: "Slot Machine: give players the Slot Machine item",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      optionalParameters: [{ name: "player", type: CustomCommandParamType.PlayerSelector }],
    },
    (origin, /** @type {Player[] | undefined} */ targets) => {
      const op = playerOf(origin);
      const list = (targets ?? (op ? [op] : [])).filter((x) => x.isValid);
      if (!list.length) return { status: CustomCommandStatus.Failure, message: "No player online matches." };
      later(() => list.forEach(giveItem));
      return { status: CustomCommandStatus.Success };
    },
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "slots_bp");
  },
  { namespaces: ["realm"] },
);

