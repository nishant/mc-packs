import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  ItemStack,
  Player,
  ScoreboardIdentityType,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

// Balances live in the `crowns` scoreboard, so any pack can pay or charge Crowns without this one, and an
// operator can see them with /scoreboard. This pack adds the player-facing side: balance and top list,
// paying, the daily bonus and the market (opened from a merchant NPC through the Townsfolk offer round).

const OBJECTIVE = "crowns";
const PROP_JOINED = "crowns:joined"; // player: true once the starting balance was given
const PROP_BONUS = "crowns:bonus"; // player: UTC day number of the last daily bonus
const PROP_NAMES = "crowns:names"; // world: JSON { scoreboard id: player name }, for the top list while they're offline
const MAX_NAMES = 800; // keeps the names property far below the 32,000 character limit
const JOIN_DELAY = 200; // ticks after joining before the bonus note, so it isn't lost under the join popups
const BUY_MAX = 16; // lots one purchase can buy
const DAY = 86400000;
const OFFLINE_NAME = "commands.scoreboard.players.offlinePlayerName";

/** @typedef {typeof CONFIG.sell[number]} SellEntry */
/** @typedef {typeof CONFIG.buy[number]} BuyEntry */

// ---------------------------------------------------------------------------
// The scoreboard (the shared contract: any pack may add or spend)
// ---------------------------------------------------------------------------

function objective() {
  const existing = world.scoreboard.getObjective(OBJECTIVE);
  if (existing) return existing;
  try {
    return world.scoreboard.addObjective(OBJECTIVE, "Crowns");
  } catch {
    // another pack created it in the same tick
    return /** @type {import("@minecraft/server").ScoreboardObjective} */ (world.scoreboard.getObjective(OBJECTIVE));
  }
}

/** @param {Player} p */
function crownsOf(p) {
  try {
    return objective().getScore(p) ?? 0;
  } catch {
    return 0;
  }
}

/** @param {Player} p @param {number} n */
function addCrowns(p, n) {
  objective().addScore(p, Math.floor(n));
}

/** @param {Player} p @param {number} n @returns {boolean} false when the player has too few */
function takeCrowns(p, n) {
  if (crownsOf(p) < n) return false;
  objective().addScore(p, -Math.floor(n));
  return true;
}

/** 12345 -> "12,345". @param {number} n */
const fmt = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
/** @param {number} n */
const crowns = (n) => `${fmt(n)} Crown${n === 1 ? "" : "s"}`;

/** "minecraft:golden_carrot" -> "Golden Carrot". @param {string} id */
const itemName = (id) =>
  id
    .replace(/^minecraft:/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** @param {number} ticks */
const wait = (ticks) => new Promise((r) => system.runTimeout(() => r(undefined), ticks));

/** @param {string} id */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);

// ---------------------------------------------------------------------------
// Names for the top list
// ---------------------------------------------------------------------------

/** @type {Record<string, string> | undefined} */
let names;

function namesCache() {
  if (names) return names;
  try {
    const raw = world.getDynamicProperty(PROP_NAMES);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : {};
    names = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    names = {};
  }
  return /** @type {Record<string, string>} */ (names);
}

/** Remembers the player's name under their scoreboard id (they need a score first). @param {Player} player */
function rememberName(player) {
  const sid = player.scoreboardIdentity?.id;
  if (sid === undefined) return;
  const cache = namesCache();
  if (cache[sid] === player.name) return;
  delete cache[sid]; // re-added last, so the trim below drops the longest-unseen first
  cache[sid] = player.name;
  const keys = Object.keys(cache);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_NAMES))) delete cache[k];
  try {
    world.setDynamicProperty(PROP_NAMES, JSON.stringify(cache));
  } catch (e) {
    console.warn(`[crowns] names: ${e}`);
  }
}

/** @param {import("@minecraft/server").ScoreboardIdentity} who */
function nameOf(who) {
  const cached = namesCache()[String(who.id)];
  if (cached) return cached;
  let shown = "";
  try {
    shown = who.displayName;
  } catch {
    shown = "";
  }
  return shown && shown !== OFFLINE_NAME ? shown : "(a player)";
}

// ---------------------------------------------------------------------------
// Joining: starting balance and the daily bonus
// ---------------------------------------------------------------------------

const utcDay = () => Math.floor(Date.now() / DAY);

/** @param {Player} player */
function welcome(player) {
  if (!player.isValid) return;
  const obj = objective();
  if (player.getDynamicProperty(PROP_JOINED) !== true) {
    player.setDynamicProperty(PROP_JOINED, true);
    const start = Math.max(0, Math.floor(Number(get("startBalance")) || 0));
    obj.addScore(player, start); // also gives a new player a score of 0, so they show up
    if (start > 0) player.sendMessage(`§6+${crowns(start)} §7(Starting balance. See yours with /realm:crowns)`);
  } else if (obj.getScore(player) === undefined) {
    obj.addScore(player, 0);
  }
  rememberName(player);
  dailyBonus(player);
}

/** @param {Player} player */
function dailyBonus(player) {
  const bonus = Math.max(0, Math.floor(Number(get("dailyBonus")) || 0));
  if (bonus <= 0) return;
  const day = utcDay();
  if (player.getDynamicProperty(PROP_BONUS) === day) return;
  player.setDynamicProperty(PROP_BONUS, day);
  addCrowns(player, bonus);
  player.sendMessage(`§6+${crowns(bonus)} §7(Daily login bonus. Balance: ${fmt(crownsOf(player))})`);
}

/** @type {Set<string>} players whose join delay has passed */
const settled = new Set();
/** @type {Set<string>} players who joined and are still in the join delay */
const joining = new Set();

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  joining.add(player.id);
  system.runTimeout(() => {
    joining.delete(player.id);
    try {
      welcome(player);
      if (player.isValid) settled.add(player.id);
    } catch (e) {
      console.warn(`[crowns] ${e}`);
    }
  }, JOIN_DELAY);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  settled.delete(playerId);
  joining.delete(playerId);
});

// A new UTC day while playing gives the bonus too; and after a script reload, players already on are welcomed.
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    try {
      if (joining.has(player.id)) continue;
      if (settled.has(player.id)) dailyBonus(player);
      else {
        settled.add(player.id);
        welcome(player);
      }
    } catch (e) {
      console.warn(`[crowns] ${e}`);
    }
  }
}, 1200);

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

/**
 * Asks how much: a slider from `min` to `max` in `step`s, or a plain confirm when there's only one choice.
 * @param {Player} player @param {string} title @param {string} label @param {number} min @param {number} max @param {number} step
 * @param {string} confirm the question when there's only one choice
 * @returns {Promise<number | undefined>} undefined when canceled
 */
async function chooseAmount(player, title, label, min, max, step, confirm) {
  if (max <= min) {
    const res = await show(player, new ActionFormData().title(title).body(confirm).button("Yes").button("Back"));
    return res && !res.canceled && res.selection === 0 ? min : undefined;
  }
  const form = new ModalFormData().title(title).slider(label, min, max, { valueStep: step, defaultValue: max }).submitButton("OK");
  const res = await show(player, form);
  if (!res || res.canceled || !res.formValues) return undefined;
  const v = res.formValues.find((x) => typeof x === "number");
  return typeof v === "number" ? v : undefined;
}

// ---------------------------------------------------------------------------
// Balance and top list
// ---------------------------------------------------------------------------

/** @param {Player} player */
async function showBalance(player) {
  const obj = objective();
  rememberName(player);
  const scores = obj
    .getScores()
    .filter((s) => s.participant.type !== ScoreboardIdentityType.Entity)
    .sort((a, b) => b.score - a.score);
  const mine = crownsOf(player);
  const sid = player.scoreboardIdentity?.id;
  const rank = scores.findIndex((s) => s.participant.id === sid) + 1;
  const top = scores.slice(0, Math.max(1, CONFIG.topCount)).map((s, i) => {
    const me = s.participant.id === sid;
    return `${me ? "§a" : "§f"}${i + 1}. ${nameOf(s.participant)} §6${fmt(s.score)}`;
  });
  const body = [
    `Your balance: §6${crowns(mine)}§r`,
    rank ? `Rank: #${rank} of ${scores.length}` : "",
    "",
    `§lTop ${Math.min(CONFIG.topCount, scores.length)}§r`,
    ...(top.length ? top : ["§7Nobody has any Crowns yet."]),
    "",
    "§7Earn Crowns from quests, bounties and selling at the market. Pay a friend with /realm:crowns_pay.",
  ].join("\n");
  const marketHere = get("marketEnabled") === true && get("marketAnywhere") === true;
  const form = new ActionFormData().title("§lCrowns").body(body);
  if (marketHere) form.button("Market");
  form.button("OK");
  const res = await show(player, form);
  if (marketHere && res && !res.canceled && res.selection === 0) await market(player);
}

// ---------------------------------------------------------------------------
// Paying
// ---------------------------------------------------------------------------

/** @param {Player} sender @param {Player[]} targets @param {number} amount */
function pay(sender, targets, amount) {
  const valid = (targets ?? []).filter((p) => p.isValid);
  if (valid.length !== 1) return sender.sendMessage("§cPick exactly one player who is online.");
  const [target] = valid;
  if (target.id === sender.id) return sender.sendMessage("§cYou can't pay yourself.");
  if (!Number.isInteger(amount) || amount < 1) return sender.sendMessage("§cThe amount must be at least 1 Crown.");
  if (amount > CONFIG.maxPay) return sender.sendMessage(`§cYou can send at most ${crowns(CONFIG.maxPay)} at once.`);
  const have = crownsOf(sender);
  if (!takeCrowns(sender, amount)) return sender.sendMessage(`§cYou have only ${crowns(have)}.`);
  addCrowns(target, amount);
  rememberName(target);
  sender.sendMessage(`§aYou paid ${crowns(amount)} to ${target.name}. §7Balance: ${fmt(crownsOf(sender))}`);
  target.sendMessage(`§6+${crowns(amount)} §7(from ${sender.name}. Balance: ${fmt(crownsOf(target))})`);
}

/** @param {Player | undefined} op @param {Player[]} targets @param {number} amount */
function give(op, targets, amount) {
  const valid = (targets ?? []).filter((p) => p.isValid);
  /** @param {string} m */
  const tell = (m) => (op ? op.sendMessage(m) : console.warn(`[crowns] ${m}`));
  if (!valid.length) return tell("§cNo player online matches.");
  if (!Number.isInteger(amount) || amount === 0) return tell("§cThe amount must be a whole number other than 0.");
  /** @type {string[]} */
  const done = [];
  for (const p of valid) {
    if (amount > 0) {
      addCrowns(p, amount);
      p.sendMessage(`§6+${crowns(amount)} §7(from an operator. Balance: ${fmt(crownsOf(p))})`);
      done.push(`${p.name} +${fmt(amount)}`);
    } else {
      const take = Math.min(crownsOf(p), -amount);
      if (take > 0) {
        objective().addScore(p, -take);
        p.sendMessage(`§c-${crowns(take)} §7(taken by an operator. Balance: ${fmt(crownsOf(p))})`);
      }
      done.push(`${p.name} -${fmt(take)}`);
    }
    rememberName(p);
  }
  tell(`§aCrowns: ${done.join(", ")}`);
}

// ---------------------------------------------------------------------------
// Market
// ---------------------------------------------------------------------------

/** @param {Player} player */
const inventoryOf = (player) => player.getComponent("minecraft:inventory")?.container;

/** Does this stack count as the entry's item? Relics never do. @param {ItemStack} item @param {SellEntry} entry */
function matches(item, entry) {
  if (item.typeId !== entry.item) return false;
  /** @type {string[]} */
  let lore;
  try {
    lore = item.getLore();
  } catch {
    lore = [];
  }
  if (entry.lore ? lore[0] !== entry.lore : lore.length > 0) return false;
  try {
    if (item.getDynamicProperty("relic:id") !== undefined) return false;
  } catch {
    // stackable items have no dynamic properties
  }
  return true;
}

/** @param {Player} player @param {SellEntry} entry */
function countOf(player, entry) {
  const inv = inventoryOf(player);
  if (!inv) return 0;
  let n = 0;
  for (let i = 0; i < inv.size; i++) {
    const item = inv.getItem(i);
    if (item && matches(item, entry)) n += item.amount;
  }
  return n;
}

/** Removes up to `amount` matching items; returns how many were removed. @param {Player} player @param {SellEntry} entry @param {number} amount */
function removeItems(player, entry, amount) {
  const inv = inventoryOf(player);
  if (!inv) return 0;
  let left = amount;
  for (let i = 0; i < inv.size && left > 0; i++) {
    const item = inv.getItem(i);
    if (!item || !matches(item, entry)) continue;
    const take = Math.min(item.amount, left);
    left -= take;
    if (take >= item.amount) inv.setItem(i, undefined);
    else {
      item.amount -= take;
      inv.setItem(i, item);
    }
  }
  return amount - left;
}

/** Gives items, dropping what doesn't fit at the player's feet. @param {Player} player @param {string} id @param {number} amount @returns {boolean} true if some dropped */
function giveItems(player, id, amount) {
  const inv = inventoryOf(player);
  const max = new ItemStack(id, 1).maxAmount;
  let left = amount;
  let dropped = false;
  while (left > 0) {
    const stack = new ItemStack(id, Math.min(max, left));
    left -= stack.amount;
    const rest = inv ? inv.addItem(stack) : stack;
    if (rest) {
      player.dimension.spawnItem(rest, player.location);
      dropped = true;
    }
  }
  return dropped;
}

/** @param {SellEntry | BuyEntry} e */
const entryName = (e) => e.name ?? itemName(e.item);

/** The market's menu, until the player closes it. @param {Player} player */
async function market(player) {
  for (let round = 0; round < 50; round++) {
    if (!player.isValid) return;
    if (get("marketEnabled") !== true) return player.sendMessage("§7The market is closed.");
    const form = new ActionFormData()
      .title("§lMarket")
      .body(`You have §6${crowns(crownsOf(player))}§r.\n\nSell your harvest, loot and ores for Crowns, or buy supplies.`)
      .button("Sell\n§8Items from your inventory")
      .button("Buy\n§8Supplies")
      .button("Close");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || res.selection === 2) return;
    const more = res.selection === 0 ? await sellMenu(player) : await buyMenu(player);
    if (!more) return;
  }
}

/** @param {Player} player @returns {Promise<boolean>} true to go back to the market menu */
async function sellMenu(player) {
  const offers = CONFIG.sell.map((e) => ({ e, have: countOf(player, e) })).filter((o) => o.have >= Math.max(1, o.e.per));
  if (!offers.length) {
    const wanted = CONFIG.sell.map(entryName).join(", ");
    const res = await show(player, new ActionFormData().title("§lSell").body(`You have nothing the market buys.\n\n§7It buys: ${wanted}.`).button("Back"));
    return !!res && !res.canceled;
  }
  const form = new ActionFormData().title("§lSell").body(`You have §6${crowns(crownsOf(player))}§r. What do you want to sell?`);
  for (const { e, have } of offers) form.button(`${entryName(e)}: ${fmt(have)}\n§8${e.per > 1 ? `${e.per} for ` : ""}${crowns(e.price)}${e.per > 1 ? "" : " each"}`);
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined) return false;
  const chosen = offers[res.selection];
  if (!chosen) return true;
  const { e } = chosen;
  const per = Math.max(1, Math.floor(e.per));
  const lots = Math.floor(chosen.have / per);
  const rate = per > 1 ? `${per} = ${crowns(e.price)}` : `${crowns(e.price)} each`;
  const amount = await chooseAmount(player, `§lSell ${entryName(e)}`, `How many ${entryName(e)}? (${rate}, you have ${fmt(chosen.have)})`, per, lots * per, per, `Sell ${per} ${entryName(e)} for ${crowns(e.price)}?`);
  if (amount === undefined || !player.isValid) return true;
  // The inventory may have changed while the form was open: count again.
  const sellLots = Math.min(Math.floor(amount / per), Math.floor(countOf(player, e) / per));
  if (sellLots <= 0) {
    player.sendMessage(`§cYou no longer have ${per} ${entryName(e)} to sell.`);
    return true;
  }
  const removed = removeItems(player, e, sellLots * per);
  const paid = Math.floor(removed / per) * e.price;
  if (paid > 0) addCrowns(player, paid);
  player.sendMessage(`§6+${crowns(paid)} §7(Sold ${fmt(removed)} ${entryName(e)}. Balance: ${fmt(crownsOf(player))})`);
  player.playSound("random.orb", { pitch: 1.2, volume: 0.7 });
  return true;
}

/** @param {Player} player @returns {Promise<boolean>} true to go back to the market menu */
async function buyMenu(player) {
  const balance = crownsOf(player);
  const form = new ActionFormData().title("§lBuy").body(`You have §6${crowns(balance)}§r. What do you want to buy?`);
  for (const e of CONFIG.buy) form.button(`${e.amount > 1 ? `${e.amount} ` : ""}${entryName(e)}\n§8${crowns(e.price)}${balance < e.price ? " (not enough)" : ""}`);
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined) return false;
  const e = CONFIG.buy[res.selection];
  if (!e) return true;
  const price = Math.max(0, Math.floor(e.price));
  const most = price > 0 ? Math.min(BUY_MAX, Math.floor(crownsOf(player) / price)) : BUY_MAX;
  if (most < 1) {
    player.sendMessage(`§cYou need ${crowns(price)} for ${entryName(e)}; you have ${crowns(crownsOf(player))}.`);
    return true;
  }
  const lot = Math.max(1, Math.floor(e.amount));
  const label = `How many ${entryName(e)}? (${lot > 1 ? `${lot} for ` : ""}${crowns(price)}${lot > 1 ? "" : " each"}, you have ${crowns(crownsOf(player))})`;
  const amount = await chooseAmount(player, `§lBuy ${entryName(e)}`, label, lot, most * lot, lot, `Buy ${lot} ${entryName(e)} for ${crowns(price)}?`);
  if (amount === undefined || !player.isValid) return true;
  const lots = Math.max(1, Math.floor(amount / lot));
  const cost = lots * price;
  if (!takeCrowns(player, cost)) {
    player.sendMessage(`§cYou need ${crowns(cost)}; you have ${crowns(crownsOf(player))}.`);
    return true;
  }
  let dropped = false;
  try {
    dropped = giveItems(player, e.item, lots * lot);
  } catch (err) {
    addCrowns(player, cost); // a bad item id in config.js: give the money back
    console.warn(`[crowns] buy ${e.item}: ${err}`);
    player.sendMessage("§cThe market can't sell that right now.");
    return true;
  }
  player.sendMessage(`§a-${crowns(cost)} §7(Bought ${fmt(lots * lot)} ${entryName(e)}${dropped ? "; some dropped at your feet, your inventory is full" : ""}. Balance: ${fmt(crownsOf(player))})`);
  player.playSound("random.orb", { pitch: 0.9, volume: 0.7 });
  return true;
}

/** @param {Player} player */
function marketCommand(player) {
  if (get("marketEnabled") !== true) return player.sendMessage("§7The market is closed on this realm.");
  if (get("marketAnywhere") !== true) {
    return player.sendMessage(`§7The market is at ${CONFIG.merchantName}: tap them to trade. §8(/realm:npc shows where the townsfolk are.)`);
  }
  market(player).catch((e) => console.warn(`[crowns] ${e}`));
}

// The Townsfolk offer round: merchants offer the market.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:npc_talk" && id !== "realm:npc_choose") return;
    try {
      const msg = JSON.parse(message);
      if (!msg || typeof msg !== "object") return;
      if (id === "realm:npc_talk") {
        if (get("marketEnabled") !== true || typeof msg.req !== "string" || !Array.isArray(msg.roles) || !msg.roles.includes(CONFIG.merchantRole)) return;
        system.sendScriptEvent("realm:npc_offer", JSON.stringify({ req: msg.req, pack: "crowns_bp", key: "market", label: "Market", order: 10 }));
      } else if (msg.pack === "crowns_bp" && msg.key === "market" && typeof msg.player === "string") {
        const player = online(msg.player);
        if (player) market(player).catch((e) => console.warn(`[crowns] ${e}`));
      }
    } catch {
      // malformed: ignore
    }
  },
  { namespaces: ["realm"] },
);

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** @param {import("@minecraft/server").CustomCommandOrigin} origin */
const playerOf = (origin) => {
  const p = origin.initiator ?? origin.sourceEntity;
  return p instanceof Player ? p : undefined;
};

/** Runs `fn` outside the read-only command context. @param {() => void} fn */
function later(fn) {
  system.run(() => {
    try {
      fn();
    } catch (e) {
      console.warn(`[crowns] ${e}`);
    }
  });
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    { name: "realm:crowns", description: "Crowns: your balance and the richest players", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => {
      const player = playerOf(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      later(() => showBalance(player).catch((e) => console.warn(`[crowns] ${e}`)));
      return { status: CustomCommandStatus.Success };
    },
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:crowns_pay",
      description: "Crowns: pay another player from your balance",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
      mandatoryParameters: [
        { name: "player", type: CustomCommandParamType.PlayerSelector },
        { name: "amount", type: CustomCommandParamType.Integer },
      ],
    },
    (origin, /** @type {Player[]} */ targets, /** @type {number} */ amount) => {
      const player = playerOf(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      later(() => pay(player, targets, amount));
      return { status: CustomCommandStatus.Success };
    },
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:crowns_give",
      description: "Crowns: give players Crowns (a negative amount takes them)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [
        { name: "player", type: CustomCommandParamType.PlayerSelector },
        { name: "amount", type: CustomCommandParamType.Integer },
      ],
    },
    (origin, /** @type {Player[]} */ targets, /** @type {number} */ amount) => {
      const op = playerOf(origin);
      later(() => give(op, targets, amount));
      return { status: CustomCommandStatus.Success };
    },
  );

  customCommandRegistry.registerCommand(
    { name: "realm:crowns_market", description: "Crowns: open the market (where the realm allows it)", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => {
      const player = playerOf(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      later(() => marketCommand(player));
      return { status: CustomCommandStatus.Success };
    },
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "crowns_bp");
  },
  { namespaces: ["realm"] },
);
