import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  Player,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { CARDS, RARITIES, RARITY_COLOR, RARITY_NAME } from "./effects.js";
import { showWish, wishPending } from "./events.js";
import { attempt, burst, crownsOf, pendingTasks, sound, wait, zoneCount } from "./helpers.js";
import { get } from "./settings.js";

// The Deck of Many Things: /realm:domt opens the deck's menu. Drawing picks a rarity by weight, then
// a card of that rarity, shows it with a little ceremony and runs its handler (effects.js). A card
// that can't happen here (no safe spot, no creature near) is put back and another is drawn.

/** @typedef {import("./effects.js").Card} Card */
/** @typedef {import("./effects.js").Rarity} Rarity */

const PROP_OFF = "domt:off"; // world: JSON { card id: true (off) | false (on) }, operators' choices
const PROP_NEXT = "domt:next"; // player: when they may draw again (ms since 1970)
const PROP_HISTORY = "domt:history"; // player: JSON [[ms, card id, drawn by]] newest first
const PROP_DRAWS = "domt:draws"; // world: JSON { card id: times drawn }
const PAGE = 24; // toggles per page in the cards menu
const REDRAWS = 5;

/** @param {Player} p */
const isOp = (p) => p.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
const byId = new Map(CARDS.map((c) => [c.id, c]));

// ---------------------------------------------------------------------------
// Cards on and off
// ---------------------------------------------------------------------------

/** @returns {Record<string, boolean>} */
function offMap() {
  try {
    const raw = world.getDynamicProperty(PROP_OFF);
    const v = typeof raw === "string" ? JSON.parse(raw) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** @param {Record<string, boolean>} map */
function saveOff(map) {
  // Keep only what differs from config.js, so a later config.js change applies to the rest.
  /** @type {Record<string, boolean>} */
  const keep = {};
  for (const c of CARDS) {
    const base = CONFIG.disabled.includes(c.id);
    if (c.id in map && map[c.id] !== base) keep[c.id] = map[c.id];
  }
  world.setDynamicProperty(PROP_OFF, Object.keys(keep).length ? JSON.stringify(keep) : undefined);
}

/** Switched off by an operator (or config.js)? @param {Card} c @param {Record<string, boolean>} [map] */
const switchedOff = (c, map = offMap()) => map[c.id] ?? CONFIG.disabled.includes(c.id);

/** Can it be drawn right now? @param {Card} c @param {Record<string, boolean>} [map] */
const drawable = (c, map = offMap()) => !switchedOff(c, map) && (!c.blocks || get("blockCards") === true);

/** @param {Rarity} r */
const weightOf = (r) => Math.max(0, Number(get(`weights.${r}`)) || 0);

/** The chance of each rarity and card, from the weights and the cards that can be drawn. */
function odds() {
  const map = offMap();
  const pool = RARITIES.map((r) => ({ r, cards: CARDS.filter((c) => c.rarity === r && drawable(c, map)), w: weightOf(r) })).map((x) => ({ ...x, w: x.cards.length ? x.w : 0 }));
  const total = pool.reduce((n, x) => n + x.w, 0);
  return pool.map((x) => ({ ...x, chance: total ? x.w / total : 0 }));
}

/** @param {Set<string>} [skip] card ids not to draw @returns {Card | undefined} */
function drawRandom(skip = new Set()) {
  const pool = odds()
    .map((x) => ({ ...x, cards: x.cards.filter((c) => !skip.has(c.id)) }))
    .filter((x) => x.cards.length && x.w > 0);
  const total = pool.reduce((n, x) => n + x.w, 0);
  if (!total) return undefined;
  let roll = Math.random() * total;
  for (const x of pool) {
    roll -= x.w;
    if (roll < 0) return x.cards[Math.floor(Math.random() * x.cards.length)];
  }
  const last = pool[pool.length - 1];
  return last.cards[Math.floor(Math.random() * last.cards.length)];
}

// ---------------------------------------------------------------------------
// History and cooldown
// ---------------------------------------------------------------------------

/** @param {Player} p @returns {[number, string, string][]} */
function historyOf(p) {
  try {
    const raw = p.getDynamicProperty(PROP_HISTORY);
    const v = typeof raw === "string" ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** @param {Player} p @param {Card} card @param {string} by */
function remember(p, card, by) {
  const list = [[Date.now(), card.id, by], ...historyOf(p)].slice(0, Math.max(1, CONFIG.historySize));
  p.setDynamicProperty(PROP_HISTORY, JSON.stringify(list));
  try {
    const raw = world.getDynamicProperty(PROP_DRAWS);
    const counts = typeof raw === "string" ? JSON.parse(raw) : {};
    counts[card.id] = (Number(counts[card.id]) || 0) + 1;
    world.setDynamicProperty(PROP_DRAWS, JSON.stringify(counts));
  } catch {
    world.setDynamicProperty(PROP_DRAWS, undefined);
  }
}

/** Milliseconds until this player may draw (0 = now). @param {Player} p */
function waitLeft(p) {
  const next = p.getDynamicProperty(PROP_NEXT);
  return typeof next === "number" ? Math.max(0, next - Date.now()) : 0;
}

/** @param {number} ms */
function duration(ms) {
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.floor(m / 60);
  return `${h} hour${h === 1 ? "" : "s"}${m % 60 ? ` ${m % 60} min` : ""}`;
}

/** Why this player can't draw for themselves now, or undefined if they can. @param {Player} p */
function cantDraw(p) {
  if (get("mode") === "operators") return isOp(p) ? undefined : "Only operators draw from the deck on this realm.";
  const left = waitLeft(p);
  return left > 0 ? `The deck needs rest. Draw again in ${duration(left)}.` : undefined;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/** @type {Set<string>} players with a draw in progress */
const drawing = new Set();

/** @param {string} msg */
function announce(msg) {
  if (get("announceRare") === true) world.sendMessage(`§6[Deck] §f${msg}`);
}

/** @param {Player} p @param {Card} card */
async function reveal(p, card) {
  for (let i = 0; i < 3; i++) {
    if (!p.isValid) return;
    attempt(() => {
      system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: p.id, ticks: 20 })); // other bar writers wait
      p.onScreenDisplay.setActionBar(`§7The deck shuffles${".".repeat(i + 1)}`);
    });
    sound(p, "item.book.page_turn", 0.8 + i * 0.2);
    burst(p.dimension, "minecraft:enchanting_table_particle", p.location, 10, 1.2);
    await wait(8);
  }
  if (!p.isValid) return;
  const color = RARITY_COLOR[card.rarity];
  attempt(() =>
    p.onScreenDisplay.setTitle(`${color}§l${card.name}`, {
      fadeInDuration: 5,
      stayDuration: 50,
      fadeOutDuration: 15,
      subtitle: `${color}${RARITY_NAME[card.rarity]}`,
    }),
  );
  const at = p.location;
  if (card.rarity === "legendary") {
    sound(p, "random.totem");
    burst(p.dimension, "minecraft:totem_particle", at, 40, 1.5);
  } else if (card.rarity === "rare") {
    sound(p, "mob.evocation_illager.cast_spell", 0.8);
    burst(p.dimension, "minecraft:dragon_breath_trail", at, 24, 1.3);
  } else if (card.rarity === "uncommon") {
    sound(p, "random.levelup", 1.2, 0.7);
    burst(p.dimension, "minecraft:villager_happy", at, 16);
  } else sound(p, "random.orb", 1.1);
}

/**
 * Draws for `target` (a random card, or `chosen`). `by` is the operator drawing for them, if any.
 * @param {Player} target @param {{ by?: Player, chosen?: Card }} [opts]
 */
async function draw(target, opts = {}) {
  if (drawing.has(target.id)) return;
  drawing.add(target.id);
  try {
    /** @type {Set<string>} */
    const failed = new Set();
    let card = opts.chosen ?? drawRandom();
    if (!card) {
      (opts.by ?? target).sendMessage("§cEvery card in the deck is disabled.");
      return;
    }
    if (!opts.by && get("mode") === "cooldown") {
      const minutes = Math.max(0, Number(get("cooldownMinutes")) || 0);
      if (minutes > 0) target.setDynamicProperty(PROP_NEXT, Date.now() + minutes * 60000);
    }
    if (opts.by && opts.by.id !== target.id) target.sendMessage(`§6[Deck] §7${opts.by.name} draws a card for you...`);
    for (let tries = 0; tries <= REDRAWS && card; tries++) {
      await reveal(target, card);
      if (!target.isValid) return;
      /** @type {boolean | string | void} */
      let result;
      try {
        result = await card.run({ player: target, test: false, announce, sporeMinutes: Math.max(1, Number(get("sporeMinutes")) || 60) });
      } catch (e) {
        console.warn(`[domt] ${card.id}: ${e}`);
        result = false;
      }
      if (result === false) {
        target.sendMessage(`§6[Deck] §7${card.name} crumbles to dust: it can't happen here. The deck draws again...`);
        failed.add(card.id);
        card = opts.chosen ? undefined : drawRandom(failed);
        continue;
      }
      const color = RARITY_COLOR[card.rarity];
      target.sendMessage(`§6[Deck] §fYou drew ${color}${card.name} §7(${RARITY_NAME[card.rarity]})§f: ${card.text}`);
      if (typeof result === "string" && result !== card.text) target.sendMessage(`§7${result}`);
      if (opts.by && opts.by.id !== target.id) opts.by.sendMessage(`§6[Deck] §f${target.name} drew ${color}${card.name}§f.`);
      remember(target, card, opts.by?.name ?? "");
      return;
    }
    (opts.by ?? target).sendMessage("§6[Deck] §7The deck finds nothing that can happen here. Try somewhere else.");
    if (!opts.by) target.setDynamicProperty(PROP_NEXT, undefined); // nothing happened: no cooldown
  } finally {
    drawing.delete(target.id);
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
  for (let i = 0; i < 20; i++) {
    if (!player.isValid) return undefined;
    const res = /** @type {any} */ (await form.show(player));
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await wait(20);
  }
  return undefined;
}

/** The deck's main menu. @param {Player} p */
async function menu(p) {
  for (let round = 0; round < 30; round++) {
    if (!p.isValid) return;
    const op = isOp(p);
    const why = cantDraw(p);
    const opsOnly = get("mode") === "operators";
    /** @type {[string, () => Promise<boolean | void>][]} */
    const actions = [];
    if (wishPending(p)) actions.push(["§d§lMake your wish\n§r§8The deck owes you a wish", async () => void (await showWish(p))]);
    if (!opsOnly || op) actions.push([why ? `§8Draw a card\n§8${why.replace(/^The deck needs rest\. /, "")}` : "§lDraw a card\n§r§8Tempt fate", async () => {
      const reason = cantDraw(p);
      if (reason) return void p.sendMessage(`§7${reason}`);
      draw(p).catch((e) => console.warn(`[domt] ${e}`));
      return true;
    }]);
    actions.push(["My draws\n§8Your last cards", async () => showHistory(p)]);
    actions.push(["The odds\n§8Every card and its chance", async () => showOdds(p)]);
    if (op) {
      actions.push(["Draw for a player\n§8Operators", async () => drawFor(p)]);
      actions.push(["Cards on/off\n§8Operators", async () => cardsMenu(p)]);
      actions.push(["Reset a cooldown\n§8Operators", async () => resetCooldown(p)]);
    }
    actions.push(["Close", async () => true]);
    const body = opsOnly
      ? op
        ? "Only operators draw on this realm. Draw for yourself, or for any player."
        : "Only operators draw from the deck on this realm. Ask one to draw for you."
      : why ?? `Draw a card for a random effect. Then the deck rests for ${duration(Math.max(1, Number(get("cooldownMinutes")) || 0) * 60000)}.`;
    const form = new ActionFormData().title("§lDeck of Many Things").body(body);
    for (const [label] of actions) form.button(label);
    const res = await show(p, form);
    if (!res || res.canceled || res.selection === undefined) return;
    const action = actions[res.selection];
    if (!action) return;
    if ((await action[1]()) === true) return;
  }
}

/** @param {Player} p */
async function showHistory(p) {
  const list = historyOf(p);
  const lines = list.map(([t, id, by]) => {
    const c = byId.get(id);
    const ago = duration(Math.max(60000, Date.now() - t));
    return c ? `${RARITY_COLOR[c.rarity]}${c.name}§7, ${ago} ago${by && by !== p.name ? ` (by ${by})` : ""}` : `§8${id}`;
  });
  const left = waitLeft(p);
  const body = [
    lines.length ? lines.join("\n") : "§7You haven't drawn a card yet.",
    "",
    get("mode") === "cooldown" ? (left ? `§7Next draw in ${duration(left)}.` : "§aYou can draw now.") : "",
  ].join("\n");
  await show(p, new ActionFormData().title("§lMy draws").body(body).button("Back"));
}

/** @param {Player} p */
async function showOdds(p) {
  const table = odds();
  const map = offMap();
  const lines = [];
  for (const { r, cards, chance } of table) {
    const all = CARDS.filter((c) => c.rarity === r);
    lines.push(`${RARITY_COLOR[r]}§l${RARITY_NAME[r]}§r ${(chance * 100).toFixed(1)}% §7(${cards.length} of ${all.length} cards on; each ${cards.length ? ((chance / cards.length) * 100).toFixed(2) : "0"}%)`);
    lines.push(`§7${all.map((c) => (drawable(c, map) ? c.name : `§8${c.name}§7`)).join(", ")}`);
    lines.push("");
  }
  lines.push("§8Gray cards are disabled.");
  await show(p, new ActionFormData().title("§lThe odds").body(lines.join("\n")).button("Back"));
}

/** Operators: draw for any online player, a random card or a chosen one. @param {Player} p */
async function drawFor(p) {
  const players = world.getAllPlayers();
  const map = offMap();
  const cards = CARDS.filter((c) => drawable(c, map));
  const form = new ModalFormData()
    .title("§lDraw for a player")
    .dropdown("Player", players.map((q) => q.name), { defaultValueIndex: Math.max(0, players.findIndex((q) => q.id === p.id)) })
    .dropdown("Card", ["A random card", ...cards.map((c) => `${RARITY_COLOR[c.rarity]}${c.name}`)], { defaultValueIndex: 0 })
    .submitButton("Draw");
  const res = await show(p, form);
  if (!res || res.canceled || !res.formValues) return;
  const [pi, ci] = res.formValues.filter((v) => typeof v === "number");
  const target = players[Number(pi)];
  if (!target?.isValid) return void p.sendMessage("§cThat player left.");
  const chosen = Number(ci) > 0 ? cards[Number(ci) - 1] : undefined;
  draw(target, { by: p, chosen }).catch((e) => console.warn(`[domt] ${e}`));
  return true;
}

/** Operators: clear a player's cooldown. @param {Player} p */
async function resetCooldown(p) {
  const players = world.getAllPlayers();
  const form = new ModalFormData().title("§lReset a cooldown").dropdown("Player", players.map((q) => `${q.name}${waitLeft(q) ? ` (${duration(waitLeft(q))})` : " (ready)"}`)).submitButton("Reset");
  const res = await show(p, form);
  if (!res || res.canceled || !res.formValues) return;
  const target = players[Number(res.formValues.find((v) => typeof v === "number"))];
  if (!target?.isValid) return;
  target.setDynamicProperty(PROP_NEXT, undefined);
  p.sendMessage(`§a${target.name} can draw again now.`);
}

/** Operators: switch cards on and off, by rarity, in pages. @param {Player} p */
async function cardsMenu(p) {
  for (let round = 0; round < 30; round++) {
    if (!p.isValid) return;
    const map = offMap();
    const form = new ActionFormData().title("§lCards on/off").body(`Switch cards on or off. ${get("blockCards") === true ? "" : "§cBlock-changing cards are disabled in /realm:config.§r "}Safe zones known: ${zoneCount()}. Block restores waiting: ${pendingTasks()}.`);
    for (const r of RARITIES) {
      const all = CARDS.filter((c) => c.rarity === r);
      form.button(`${RARITY_COLOR[r]}${RARITY_NAME[r]}\n§8${all.filter((c) => !switchedOff(c, map)).length} of ${all.length} enabled`);
    }
    form.button("Enable every card");
    form.button("Back to config.js defaults");
    form.button("Back");
    const res = await show(p, form);
    if (!res || res.canceled || res.selection === undefined) return;
    if (res.selection < RARITIES.length) {
      await rarityPages(p, RARITIES[res.selection]);
      continue;
    }
    if (res.selection === RARITIES.length) {
      saveOff(Object.fromEntries(CARDS.map((c) => [c.id, false])));
      p.sendMessage("§aEvery card is enabled.");
    } else if (res.selection === RARITIES.length + 1) {
      world.setDynamicProperty(PROP_OFF, undefined);
      p.sendMessage("§aCards are back to config.js.");
    } else return;
  }
}

/** @param {Player} p @param {Rarity} r */
async function rarityPages(p, r) {
  const cards = CARDS.filter((c) => c.rarity === r);
  const pages = Math.ceil(cards.length / PAGE);
  for (let page = 0; page < pages; page++) {
    const slice = cards.slice(page * PAGE, (page + 1) * PAGE);
    const map = offMap();
    const form = new ModalFormData().title(`§l${RARITY_NAME[r]} cards${pages > 1 ? ` (${page + 1}/${pages})` : ""}`);
    for (const c of slice) form.toggle(`${c.name} §8(${c.kind}) §7${c.text}`, { defaultValue: !switchedOff(c, map) });
    form.submitButton(page + 1 < pages ? "Save, next page" : "Save");
    const res = await show(p, form);
    if (!res || res.canceled || !res.formValues) return;
    const values = res.formValues.filter((v) => typeof v === "boolean");
    const next = { ...offMap() };
    slice.forEach((c, i) => {
      if (typeof values[i] === "boolean") next[c.id] = !values[i];
    });
    saveOff(next);
  }
  p.sendMessage(`§a${RARITY_NAME[r]} cards saved.`);
}

// ---------------------------------------------------------------------------
// Test path (operators and the server console): run one card's handler, or all 100, and check it
// ---------------------------------------------------------------------------

/** @param {Player} p */
function snapshot(p) {
  const inv = p.getComponent("minecraft:inventory")?.container;
  /** @type {Map<string, number>} */
  const items = new Map();
  let total = 0;
  const hotbar = [];
  if (inv)
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (i < 9) hotbar.push(it?.typeId ?? "");
      if (!it) continue;
      items.set(it.typeId, (items.get(it.typeId) ?? 0) + it.amount);
      total += it.amount;
    }
  const at = { ...p.location };
  // Items that didn't fit in a full inventory drop at the player's feet: count those too.
  for (const e of p.dimension.getEntities({ location: at, maxDistance: 3, type: "minecraft:item" })) {
    const it = e.getComponent("minecraft:item")?.itemStack;
    if (it) items.set(it.typeId, (items.get(it.typeId) ?? 0) + it.amount);
  }
  return {
    items,
    total,
    hotbar: hotbar.join(),
    effects: new Set(p.getEffects().map((e) => e.typeId)),
    at,
    dim: p.dimension.id,
    yaw: p.getRotation().y,
    level: p.level,
    xp: p.getTotalXp(),
    crowns: crownsOf(p),
    health: p.getComponent("minecraft:health")?.currentValue ?? 0,
    name: p.nameTag,
    time: world.getTimeOfDay(),
    tasks: pendingTasks(),
    near: new Set(p.dimension.getEntities({ location: at, maxDistance: 64 }).map((e) => e.id)),
  };
}

/** @typedef {ReturnType<typeof snapshot>} Snap */

/** Did the card's main effect happen? @param {string} expect @param {Player} p @param {Snap} a before @param {Snap} b after */
function satisfied(expect, p, a, b) {
  const [kind, arg] = expect.split(":");
  const dist = a.dim !== b.dim ? Infinity : Math.hypot(b.at.x - a.at.x, b.at.y - a.at.y, b.at.z - a.at.z);
  switch (kind) {
    case "effect":
      return b.effects.has(`minecraft:${arg}`);
    case "item":
      if (arg === "any") return [...b.items].some(([id, n]) => n > (a.items.get(id) ?? 0));
      return (b.items.get(`minecraft:${arg}`) ?? 0) > (a.items.get(`minecraft:${arg}`) ?? 0);
    case "spawn": {
      const fresh = [...world.getDimension(a.dim).getEntities({ location: a.at, maxDistance: 64 }), ...p.dimension.getEntities({ location: p.location, maxDistance: 64 })].filter((e) => !a.near.has(e.id) && e.typeId !== "minecraft:player" && e.typeId !== "minecraft:item" && e.typeId !== "minecraft:xp_orb");
      return arg === "any" ? fresh.length > 0 : fresh.some((e) => e.typeId === `minecraft:${arg}`);
    }
    case "move":
      return dist > 2;
    case "far":
      return dist > 100;
    case "dim":
      return a.dim !== b.dim;
    case "xp":
      return b.xp > a.xp || b.level > a.level;
    case "levels-":
      return b.level < a.level;
    case "crowns":
      return b.crowns > a.crowns;
    case "crowns-":
      return b.crowns < a.crowns;
    case "crowns?":
      return b.crowns !== a.crowns;
    case "reward":
      return b.xp > a.xp || b.level > a.level || b.crowns > a.crowns || [...b.items].some(([id, n]) => n > (a.items.get(id) ?? 0));
    case "health":
      return b.health > a.health;
    case "noeffects":
      return b.effects.size === 0;
    case "hotbar":
      return b.hotbar !== a.hotbar;
    case "drop":
      return b.total < a.total;
    case "name":
      return b.name !== a.name;
    case "time":
      return Math.abs(b.time - 18000) < 400;
    case "rotate":
      return Math.abs(((b.yaw - a.yaw + 540) % 360) - 180) > 30;
    case "blocks":
      return b.tasks > a.tasks;
    default:
      return true;
  }
}

/** Runs one card for the test path. @param {Player} p @param {Card} card @returns {Promise<{ id: string, ok: boolean, why: string }>} */
async function testCard(p, card) {
  const home = { dim: p.dimension, at: { ...p.location } };
  try {
    card.prep?.(p);
  } catch (e) {
    return { id: card.id, ok: false, why: `prep: ${e}` };
  }
  await wait(2);
  const before = snapshot(p);
  /** @type {boolean | string | void} */
  let result;
  try {
    result = await card.run({ player: p, test: true, announce: (m) => console.warn(`[domt] announce: ${m}`), sporeMinutes: 1 });
  } catch (e) {
    return { id: card.id, ok: false, why: `error: ${e}` };
  }
  if (result === false) return { id: card.id, ok: false, why: "fizzled (can't happen here)" };
  let ok = false;
  for (let t = 0; t < 40 && !ok; t++) {
    await wait(5);
    if (!p.isValid) return { id: card.id, ok: false, why: "player left" };
    ok = satisfied(card.expect, p, before, snapshot(p));
  }
  const why = ok ? (typeof result === "string" ? result : "ok") : `expected ${card.expect}, not seen`;
  // Tidy up so the next card starts the same: home, no effects, no new mobs, full health.
  try {
    if (p.dimension.id !== home.dim.id || Math.hypot(p.location.x - home.at.x, p.location.z - home.at.z) > 1) p.teleport(home.at, { dimension: home.dim, keepVelocity: false });
    for (const e of p.getEffects()) p.removeEffect(e.typeId);
    p.extinguishFire(false);
    p.getComponent("minecraft:health")?.resetToMaxValue();
    for (const e of home.dim.getEntities({ location: home.at, maxDistance: 64 })) {
      if (!before.near.has(e.id) && e.typeId !== "minecraft:player") attempt(() => e.remove());
    }
  } catch (e) {
    console.warn(`[domt] test tidy: ${e}`);
  }
  // An arena ends a few seconds after its player leaves it: let it go before the next card.
  if (card.id === "the_arena") for (let t = 0; t < 30 && pendingTasks() > before.tasks; t++) await wait(10);
  return { id: card.id, ok, why };
}

/** @param {Player} p @param {string} which a card id, or "all" */
async function runTests(p, which) {
  const ids = which.split(",").map((s) => s.trim());
  const cards = which === "all" ? CARDS : CARDS.filter((c) => ids.includes(c.id));
  if (!cards.length) return console.warn(`[domt] TEST unknown card ${which}`);
  const results = [];
  for (const card of cards) {
    const r = await testCard(p, card);
    results.push(r);
    console.warn(`[domt] TEST ${r.ok ? "PASS" : "FAIL"} ${card.rarity} ${card.id}: ${r.why}`);
    system.sendScriptEvent("realm:domt_tested", JSON.stringify(r));
    await wait(cards.length > 1 ? 30 : 1);
  }
  // Block changes (The Arena, The Spore) undo themselves 20 seconds after a test: wait for that.
  for (let t = 0; t < 60 && pendingTasks() > 0; t++) await wait(20);
  console.warn(`[domt] TEST restores still waiting: ${pendingTasks()}`);
  const passed = results.filter((r) => r.ok).length;
  console.warn(`[domt] TEST SUMMARY ${passed}/${results.length} passed${passed < results.length ? `; failed: ${results.filter((r) => !r.ok).map((r) => r.id).join(", ")}` : ""}`);
}

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message, sourceEntity, sourceBlock }) => {
    if (id !== "realm:domt_test") return;
    try {
      const fromPlayer = sourceEntity instanceof Player ? sourceEntity : undefined;
      if (sourceEntity && !(fromPlayer && isOp(fromPlayer))) return;
      if (!sourceEntity && sourceBlock) return; // not from command blocks
      let req;
      try {
        req = JSON.parse(message || "{}");
      } catch {
        req = { effect: message.trim() };
      }
      const name = typeof req.player === "string" ? req.player : undefined;
      const target = name ? world.getAllPlayers().find((q) => q.name === name) : fromPlayer ?? world.getAllPlayers()[0];
      if (!target) return console.warn("[domt] TEST no player online");
      runTests(target, String(req.effect ?? "all")).catch((e) => console.warn(`[domt] TEST crashed: ${e}`));
    } catch (e) {
      console.warn(`[domt] test: ${e}`);
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

/** Runs `fn` outside the read-only command context. @param {() => unknown} fn */
function later(fn) {
  system.run(() => {
    try {
      const r = fn();
      if (r instanceof Promise) r.catch((e) => console.warn(`[domt] ${e}`));
    } catch (e) {
      console.warn(`[domt] ${e}`);
    }
  });
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    { name: "realm:domt", description: "Deck of Many Things: draw a card, see your draws and the odds", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => {
      const player = playerOf(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      later(() => menu(player));
      return { status: CustomCommandStatus.Success };
    },
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:domt_draw",
      description: "Deck of Many Things: draw a card for players (no cooldown)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "player", type: CustomCommandParamType.PlayerSelector }],
    },
    (origin, /** @type {Player[]} */ targets) => {
      const op = playerOf(origin);
      later(() => {
        const valid = (targets ?? []).filter((t) => t.isValid);
        if (!valid.length) return op?.sendMessage("§cNo player online matches.");
        for (const t of valid) draw(t, { by: op ?? t }).catch((e) => console.warn(`[domt] ${e}`));
      });
      return { status: CustomCommandStatus.Success };
    },
  );

  customCommandRegistry.registerCommand(
    { name: "realm:domt_effects", description: "Deck of Many Things: switch cards on and off", permissionLevel: CommandPermissionLevel.GameDirectors, cheatsRequired: false },
    (origin) => {
      const player = playerOf(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      later(() => cardsMenu(player));
      return { status: CustomCommandStatus.Success };
    },
  );
});

// A wish waiting from before: remind the player when they join.
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  system.runTimeout(() => {
    try {
      if (player.isValid && wishPending(player)) player.sendMessage("§dThe deck still owes you a wish. §7Open /realm:domt to make it.");
    } catch {
      // ignore
    }
  }, 200);
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "domt_bp");
  },
  { namespaces: ["realm"] },
);
