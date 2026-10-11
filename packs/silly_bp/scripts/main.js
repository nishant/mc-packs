import {
  ButtonState,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  EquipmentSlot,
  InputButton,
  ItemStack,
  MolangVariableMap,
  Player,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get, getFor } from "./settings.js";

// Silly enchants are lore lines on gear ("Silly: Hyper Jump"). They only make particles, sounds and
// harmless bounces: nothing here changes damage, armor, speed, drops or durability. A Silly Book (an
// enchanted book with a "Silly Book: <name>" lore line) is applied from /realm:silly to the item in
// your hand. Effects read a cache of each player's gear, refreshed twice a second, so loops stay cheap.

/** @typedef {"hand" | "feet" | "head" | "armor"} Slot */
/** @typedef {{ id: string, name: string, slot: Slot, what: string }} Enchant */

/** @type {Enchant[]} */
const ENCHANTS = [
  { id: "grunt_birthday", name: "Grunt Birthday", slot: "hand", what: "Mobs you defeat pop like a party: confetti and a cheer" },
  { id: "hyper_jump", name: "Hyper Jump", slot: "feet", what: "Sneak and jump for a huge bounce, with slow falling to land softly" },
  { id: "squeak", name: "Squeak", slot: "feet", what: "Your footsteps squeak" },
  { id: "bubbles", name: "Bubbles", slot: "armor", what: "You leave a trail of bubbles" },
  { id: "rainbow_trail", name: "Rainbow Trail", slot: "feet", what: "A rainbow follows your steps" },
  { id: "hat_trick", name: "Hat Trick", slot: "hand", what: "A critical hit pulls a baby rabbit out of thin air; it vanishes again" },
  { id: "disco", name: "Disco", slot: "armor", what: "Your armor flashes colored lights" },
  { id: "moo", name: "Moo", slot: "head", what: "You moo when you get hurt" },
  { id: "confetti_swing", name: "Confetti Swing", slot: "hand", what: "Every hit throws confetti" },
  { id: "tiny_thunder", name: "Tiny Thunder", slot: "hand", what: "A tiny thunderclap when you defeat a mob" },
  { id: "fish_slap", name: "Fish Slap", slot: "hand", what: "Your hits make a wet fish slap (best on a fish)" },
  { id: "glow", name: "Glow", slot: "head", what: "You sparkle softly at night" },
  { id: "duck", name: "Duck", slot: "armor", what: "You quack when you sneak" },
  { id: "hiccups", name: "Hiccups", slot: "head", what: "You hiccup now and then" },
];

const BOOK_ITEM = "minecraft:enchanted_book";
const BOOK_NAME = "§r§dSilly Book";
const BOOK_PREFIX = "Silly Book: ";
const GEAR_PREFIX = "Silly: ";
const RANDOM = "Random";
const RABBIT_TAG = "silly_rabbit";
const PROP_RABBIT_UNTIL = "silly:until"; // rabbit entity: time (ms) it vanishes
const PROP_APPLIED = "silly:applied"; // player: how many silly enchants they applied

const SLOT_NAMES = { hand: "a held item (tool, weapon, fish...)", feet: "boots", head: "a helmet", armor: "any armor piece" };

/** @param {string} s */
const plain = (s) => s.replace(/§./g, "");
/** @param {number} ticks */
const wait = (ticks) => new Promise((r) => system.runTimeout(() => r(undefined), ticks));
/** @param {Player} p */
const isOp = (p) => p.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
/** @param {string} id */
const enchantById = (id) => ENCHANTS.find((e) => e.id === id);
/** @param {string} name */
const enchantByName = (name) => ENCHANTS.find((e) => e.name.toLowerCase() === name.trim().toLowerCase());
/** @param {Enchant} e */
const isDisabled = (e) => Array.isArray(CONFIG.disabled) && /** @type {string[]} */ (CONFIG.disabled).includes(e.id);
const usable = () => ENCHANTS.filter((e) => !isDisabled(e));

// ---------------------------------------------------------------------------
// Lore: what an item holds
// ---------------------------------------------------------------------------

/** @param {ItemStack | undefined} item @returns {string[]} */
function loreOf(item) {
  if (!item) return [];
  try {
    return item.getLore();
  } catch {
    return [];
  }
}

/** The silly enchants on a piece of gear. @param {ItemStack | undefined} item @returns {Enchant[]} */
function enchantsOn(item) {
  if (!item || item.typeId === BOOK_ITEM) return [];
  /** @type {Enchant[]} */
  const out = [];
  for (const line of loreOf(item)) {
    const t = plain(line);
    if (!t.startsWith(GEAR_PREFIX)) continue;
    const e = enchantByName(t.slice(GEAR_PREFIX.length));
    if (e && !out.includes(e)) out.push(e);
  }
  return out;
}

/** What a Silly Book holds: an enchant, "random", or undefined if it isn't one. @param {ItemStack | undefined} item @returns {Enchant | "random" | undefined} */
function bookOf(item) {
  if (!item || item.typeId !== BOOK_ITEM) return undefined;
  for (const line of loreOf(item)) {
    const t = plain(line);
    if (!t.startsWith(BOOK_PREFIX)) continue;
    const rest = t.slice(BOOK_PREFIX.length).trim();
    if (rest.toLowerCase() === RANDOM.toLowerCase()) return "random";
    return enchantByName(rest);
  }
  return undefined;
}

/** A Silly Book. @param {Enchant | "random"} what */
function makeBook(what) {
  const stack = new ItemStack(BOOK_ITEM, 1);
  const name = what === "random" ? RANDOM : what.name;
  stack.nameTag = BOOK_NAME;
  stack.setLore([`§d${BOOK_PREFIX}${name}`, `§7${what === "random" ? "A surprise silly enchant" : what.what}`, "§8Apply it with /realm:silly"]);
  return stack;
}

/** @param {string} id */
const isBoots = (id) => id.endsWith("_boots");
/** @param {string} id */
const isHelmet = (id) => id.endsWith("_helmet") || id === "minecraft:turtle_helmet";
/** @param {string} id */
const isArmor = (id) => /_(helmet|chestplate|leggings|boots)$/.test(id) || id === "minecraft:elytra";

/** Can `item` take an enchant for `slot`? @param {ItemStack} item @param {Slot} slot */
function fits(item, slot) {
  const id = item.typeId;
  if (id === BOOK_ITEM || id === "minecraft:book") return false;
  if (slot === "feet") return isBoots(id);
  if (slot === "head") return isHelmet(id);
  if (slot === "armor") return isArmor(id);
  return !isArmor(id);
}

/**
 * Puts `e` on `item` (a copy is returned), or says why not.
 * @param {ItemStack} item @param {Enchant} e @returns {ItemStack | string}
 */
export function applyTo(item, e) {
  if (isDisabled(e)) return `${e.name} is disabled on this realm.`;
  if (!fits(item, e.slot)) return `${e.name} goes on ${SLOT_NAMES[e.slot]}.`;
  const has = enchantsOn(item);
  if (has.includes(e)) return `That item already has ${e.name}.`;
  const max = Math.max(1, Math.floor(Number(get("maxPerItem")) || 2));
  if (has.length >= max) return `An item holds at most ${max} silly enchant${max === 1 ? "" : "s"}. Remove one first.`;
  const copy = item.clone();
  copy.setLore([...loreOf(item), `§r§d${GEAR_PREFIX}${e.name}`]);
  return copy;
}

/** @param {ItemStack} item @param {Enchant} e */
function removeFrom(item, e) {
  const copy = item.clone();
  copy.setLore(loreOf(item).filter((l) => {
    const t = plain(l);
    return !(t.startsWith(GEAR_PREFIX) && enchantByName(t.slice(GEAR_PREFIX.length)) === e);
  }));
  return copy;
}

// ---------------------------------------------------------------------------
// The gear cache
// ---------------------------------------------------------------------------

/** @typedef {{ hand: Set<string>, feet: Set<string>, head: Set<string>, armor: Set<string> }} Gear */
/** @type {Map<string, Gear>} */
const gear = new Map();

/** @param {Player} p */
function readGear(p) {
  /** @type {Gear} */
  const g = { hand: new Set(), feet: new Set(), head: new Set(), armor: new Set() };
  const eq = p.getComponent("minecraft:equippable");
  if (!eq) return g;
  /** @param {EquipmentSlot} slot */
  const on = (slot) => {
    try {
      return enchantsOn(eq.getEquipment(slot));
    } catch {
      return [];
    }
  };
  for (const e of on(EquipmentSlot.Mainhand)) if (e.slot === "hand") g.hand.add(e.id);
  const head = on(EquipmentSlot.Head);
  const feet = on(EquipmentSlot.Feet);
  for (const e of head) if (e.slot === "head") g.head.add(e.id);
  for (const e of feet) if (e.slot === "feet") g.feet.add(e.id);
  for (const e of [...head, ...on(EquipmentSlot.Chest), ...on(EquipmentSlot.Legs), ...feet]) if (e.slot === "armor") g.armor.add(e.id);
  return g;
}

/** Is enchant `id` active on `p` now? @param {Player} p @param {string} id */
function has(p, id) {
  const g = gear.get(p.id);
  if (!g) return false;
  const e = enchantById(id);
  if (!e || isDisabled(e)) return false;
  return g[e.slot].has(id);
}

/** @param {Player} p */
const playing = (p) => get("enabled") === true && getFor(p, "effects") !== false;

system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    try {
      gear.set(p.id, readGear(p));
    } catch {
      gear.delete(p.id);
    }
  }
}, 10);

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  gear.delete(playerId);
  lastSneak.delete(playerId);
  wasJumping.delete(playerId);
  cooldowns.delete(playerId);
});

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/** @type {Map<string, Map<string, number>>} player -> what -> tick it's ready */
const cooldowns = new Map();
/** @param {Player} p @param {string} what @param {number} ticks @returns {boolean} true if it was ready (and is now cooling down) */
function ready(p, what, ticks) {
  let m = cooldowns.get(p.id);
  if (!m) cooldowns.set(p.id, (m = new Map()));
  if ((m.get(what) ?? 0) > system.currentTick) return false;
  m.set(what, system.currentTick + ticks);
  return true;
}

/** @param {import("@minecraft/server").Dimension} dim @param {string} id @param {import("@minecraft/server").Vector3} at @param {MolangVariableMap} [vars] */
function particle(dim, id, at, vars) {
  try {
    dim.spawnParticle(id, at, vars);
  } catch {
    // unloaded chunk or unknown particle: skip
  }
}

/** @param {import("@minecraft/server").Dimension} dim @param {string} id @param {import("@minecraft/server").Vector3} at @param {number} [volume] @param {number} [pitch] */
function sound(dim, id, at, volume = 1, pitch = 1) {
  try {
    dim.playSound(id, at, { volume, pitch });
  } catch {
    // unloaded chunk
  }
}

const RAINBOW = [
  { red: 1, green: 0.1, blue: 0.1 },
  { red: 1, green: 0.55, blue: 0 },
  { red: 1, green: 0.95, blue: 0.1 },
  { red: 0.2, green: 0.9, blue: 0.2 },
  { red: 0.15, green: 0.5, blue: 1 },
  { red: 0.55, green: 0.2, blue: 0.95 },
];

/** A colored puff. @param {import("@minecraft/server").Dimension} dim @param {import("@minecraft/server").Vector3} at @param {{ red: number, green: number, blue: number }} c */
function colorPuff(dim, at, c) {
  const vars = new MolangVariableMap();
  vars.setColorRGBA("variable.color", { ...c, alpha: 1 });
  particle(dim, "minecraft:mobspell_emitter", at, vars);
}

/** Confetti and a party pop at a spot. @param {import("@minecraft/server").Dimension} dim @param {import("@minecraft/server").Vector3} at @param {boolean} loud */
function confetti(dim, at, loud) {
  particle(dim, "minecraft:totem_particle", at);
  for (let i = 0; i < 3; i++) colorPuff(dim, { x: at.x + (Math.random() - 0.5), y: at.y + Math.random() * 0.6, z: at.z + (Math.random() - 0.5) }, RAINBOW[Math.floor(Math.random() * RAINBOW.length)]);
  if (loud) {
    sound(dim, "firework.blast", at, 0.7, 1.4);
    sound(dim, "firework.twinkle", at, 0.6, 1.2);
    sound(dim, "random.levelup", at, 0.3, 1.8);
  } else sound(dim, "random.pop", at, 0.4, 1.5);
}

// Trails and ambient effects, five times a second. Only players with the matching gear do any work.
let beat = 0;
system.runInterval(() => {
  if (get("enabled") !== true) return;
  beat++;
  for (const p of world.getAllPlayers()) {
    const g = gear.get(p.id);
    if (!g || (!g.feet.size && !g.armor.size && !g.head.size)) continue;
    try {
      if (!playing(p)) continue;
      ambient(p);
    } catch {
      // the player left mid-tick
    }
  }
}, 4);

/** @type {Map<string, boolean>} */
const lastSneak = new Map();

/** @param {Player} p */
function ambient(p) {
  const dim = p.dimension;
  const loc = p.location;
  const v = p.getVelocity();
  const moving = Math.hypot(v.x, v.z) > 0.06;
  if (moving && has(p, "rainbow_trail")) colorPuff(dim, { x: loc.x, y: loc.y + 0.1, z: loc.z }, RAINBOW[beat % RAINBOW.length]);
  if (moving && has(p, "bubbles")) particle(dim, p.isInWater ? "minecraft:bubble_column_up_particle" : "minecraft:basic_bubble_particle_manual", { x: loc.x, y: loc.y + 0.6, z: loc.z });
  if (moving && p.isOnGround && beat % 2 === 0 && has(p, "squeak")) sound(dim, "mob.bat.idle", loc, 0.25, 1.9);
  if (beat % 3 === 0 && has(p, "disco")) {
    colorPuff(dim, { x: loc.x, y: loc.y + 1.1, z: loc.z }, RAINBOW[Math.floor(beat / 3) % RAINBOW.length]);
    if (beat % 15 === 0) particle(dim, "minecraft:note_particle", { x: loc.x, y: loc.y + 2.2, z: loc.z });
  }
  if (beat % 5 === 0 && has(p, "glow")) {
    const t = world.getTimeOfDay();
    if (t >= 12500 && t <= 23500) particle(dim, "minecraft:endrod", { x: loc.x + (Math.random() - 0.5), y: loc.y + 1 + Math.random(), z: loc.z + (Math.random() - 0.5) });
  }
  if (beat % 5 === 0 && has(p, "hiccups") && Math.random() < 1 / 30) {
    sound(dim, "random.burp", loc, 0.5, 1.9);
    particle(dim, "minecraft:basic_bubble_particle_manual", { x: loc.x, y: loc.y + 1.7, z: loc.z });
  }
  if (has(p, "duck")) {
    const was = lastSneak.get(p.id) ?? false;
    if (p.isSneaking && !was) sound(dim, "mob.chicken.say", loc, 0.7, 0.55);
    lastSneak.set(p.id, p.isSneaking);
  }
}

// Hyper Jump: jump while sneaking, in Hyper Jump boots. The button event is the usual trigger; a
// check of `isJumping` each tick (only for players wearing the boots) catches inputs it misses.
// Either way it needs the ground under you (or a jump just started), so it never works mid-air.
world.afterEvents.playerButtonInput.subscribe(
  ({ player }) => {
    try {
      if (!player.isSneaking || !player.isOnGround || !has(player, "hyper_jump") || !playing(player)) return;
      hyperJump(player, false);
    } catch (e) {
      console.warn(`[silly] ${e}`);
    }
  },
  { buttons: [InputButton.Jump], state: ButtonState.Pressed },
);

/** @type {Map<string, boolean>} */
const wasJumping = new Map();
system.runInterval(() => {
  if (get("enabled") !== true) return;
  for (const p of world.getAllPlayers()) {
    const g = gear.get(p.id);
    if (!g || !g.feet.has("hyper_jump")) continue;
    try {
      const jumping = p.isJumping;
      const rising = jumping && !wasJumping.get(p.id);
      wasJumping.set(p.id, jumping);
      if (!rising || !p.isSneaking || !has(p, "hyper_jump") || !playing(p)) continue;
      const vy = p.getVelocity().y;
      if (p.isOnGround || (vy > 0.2 && vy < 0.5)) hyperJump(p, true);
    } catch {
      // left mid-tick
    }
  }
}, 1);

/** @param {Player} p @param {boolean} quiet no "recharging" note @returns {boolean} true if it bounced */
export function hyperJump(p, quiet) {
  const cd = Math.max(1, Math.floor(Number(get("hyperJumpCooldownSeconds")) || 4)) * 20;
  if (!ready(p, "hyper_jump", cd)) {
    if (!quiet && (cooldowns.get(p.id)?.get("hyper_jump") ?? 0) - system.currentTick < cd - 5) p.onScreenDisplay.setActionBar("§7Hyper Jump is recharging");
    return false;
  }
  const strength = Math.min(2.5, Math.max(0.2, Number(CONFIG.hyperJumpStrength) || 1));
  p.applyKnockback({ x: 0, z: 0 }, strength);
  // Slow falling for the whole flight, so the landing never hurts: harmless, never a boost.
  p.addEffect("slow_falling", 20 * (3 + Math.ceil(strength * 2)), { amplifier: 0, showParticles: false });
  const loc = p.location;
  sound(p.dimension, "mob.slime.big", loc, 0.8, 1.3);
  sound(p.dimension, "random.pop", loc, 0.6, 0.6);
  particle(p.dimension, "minecraft:villager_happy", loc);
  return true;
}

// Hits: Confetti Swing, Fish Slap, Hat Trick.
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (!(damagingEntity instanceof Player) || get("enabled") !== true) return;
  const p = damagingEntity;
  try {
    const g = gear.get(p.id);
    if (!g || !g.hand.size || !playing(p) || !hitEntity.isValid) return;
    const at = { x: hitEntity.location.x, y: hitEntity.location.y + 1, z: hitEntity.location.z };
    if (has(p, "confetti_swing")) confetti(p.dimension, at, false);
    if (has(p, "fish_slap")) {
      sound(p.dimension, "mob.fish.flop", at, 1, 0.8);
      sound(p.dimension, "random.splash", at, 0.3, 1.8);
      particle(p.dimension, "minecraft:water_splash_particle_manual", at);
    }
    if (has(p, "hat_trick") && p.isFalling && !p.isOnGround && !p.isInWater) hatTrick(p, at);
  } catch (e) {
    console.warn(`[silly] ${e}`);
  }
});

/** A baby rabbit pops out. Babies drop nothing and give no XP. @param {Player} p @param {import("@minecraft/server").Vector3} at */
function hatTrick(p, at) {
  if (!ready(p, "hat_trick", Math.max(1, Number(CONFIG.hatTrickCooldownSeconds) || 10) * 20)) return;
  const rabbit = p.dimension.spawnEntity("minecraft:rabbit", at, { spawnEvent: "minecraft:entity_born" });
  rabbit.addTag(RABBIT_TAG);
  rabbit.setDynamicProperty(PROP_RABBIT_UNTIL, Date.now() + Math.max(2, Number(CONFIG.hatTrickRabbitSeconds) || 10) * 1000);
  particle(p.dimension, "minecraft:villager_happy", at);
  particle(p.dimension, "minecraft:white_smoke_particle", at);
  sound(p.dimension, "random.pop", at, 1, 1.2);
  sound(p.dimension, "mob.rabbit.idle", at, 1, 1.4);
}

// Hat Trick rabbits vanish on time, even after a chunk reload.
system.runInterval(() => {
  const now = Date.now();
  for (const id of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
    let list;
    try {
      list = world.getDimension(id).getEntities({ type: "minecraft:rabbit", tags: [RABBIT_TAG] });
    } catch {
      continue;
    }
    for (const r of list) {
      try {
        const until = r.getDynamicProperty(PROP_RABBIT_UNTIL);
        if (typeof until === "number" && until > now) continue;
        particle(r.dimension, "minecraft:white_smoke_particle", r.location);
        r.remove();
      } catch {
        // already gone
      }
    }
  }
}, 40);

// Defeats: Grunt Birthday, Tiny Thunder.
world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  const p = damageSource.damagingEntity;
  if (!(p instanceof Player) || get("enabled") !== true) return;
  try {
    const g = gear.get(p.id);
    if (!g || !g.hand.size || !playing(p)) return;
    if (deadEntity.hasTag(RABBIT_TAG)) return;
    const loc = deadEntity.location;
    const at = { x: loc.x, y: loc.y + 0.8, z: loc.z };
    if (has(p, "grunt_birthday")) confetti(deadEntity.dimension, at, true);
    if (has(p, "tiny_thunder")) {
      sound(deadEntity.dimension, "ambient.weather.thunder", at, 0.35, 1.9);
      particle(deadEntity.dimension, "minecraft:electric_spark_particle", at);
    }
  } catch {
    // the mob's gone
  }
});

// Getting hurt: Moo.
world.afterEvents.entityHurt.subscribe(({ hurtEntity }) => {
  if (!(hurtEntity instanceof Player) || get("enabled") !== true) return;
  try {
    if (!has(hurtEntity, "moo") || !playing(hurtEntity) || !ready(hurtEntity, "moo", 20)) return;
    sound(hurtEntity.dimension, "mob.cow.say", hurtEntity.location, 0.8, 1 + Math.random() * 0.3);
  } catch {
    // gone
  }
});

// ---------------------------------------------------------------------------
// Menus
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

/** @param {Player} p */
const inventoryOf = (p) => p.getComponent("minecraft:inventory")?.container;

/** @param {Player} p */
function held(p) {
  const inv = inventoryOf(p);
  if (!inv) return undefined;
  const slot = p.selectedSlotIndex;
  return { inv, slot, item: inv.getItem(slot) };
}

/** @param {Player} p */
async function menu(p) {
  const h = held(p);
  const on = enchantsOn(h?.item);
  const body = [
    "Silly enchants add particles and sounds, never power.",
    h?.item ? `In your hand: §e${h.item.nameTag ? plain(h.item.nameTag) : h.item.typeId.replace(/^minecraft:/, "").replace(/_/g, " ")}§r${on.length ? ` (${on.map((e) => e.name).join(", ")})` : ""}` : "Your hand is empty.",
  ].join("\n");
  /** @type {{ label: string, run: () => unknown }[]} */
  const items = [
    { label: "Apply a Silly Book\n§8To the item in your hand", run: () => applyMenu(p) },
    { label: "Remove a silly enchant\n§8From the item in your hand, free", run: () => removeMenu(p) },
    { label: "All silly enchants\n§8What each one does", run: () => listPage(p) },
  ];
  if (isOp(p)) items.push({ label: "Give Silly Books\n§8Operators", run: () => giveMenu(p) });
  items.push({ label: "Close", run: () => undefined });
  const form = new ActionFormData().title("§lSilly Enchants").body(body);
  for (const it of items) form.button(it.label);
  const res = await show(p, form);
  if (!res || res.canceled || res.selection === undefined) return;
  await items[res.selection]?.run();
}

/** @param {Player} p */
async function applyMenu(p) {
  const h = held(p);
  if (!h?.item) return p.sendMessage("§cHold the item you want to enchant, then pick a Silly Book.");
  const inv = h.inv;
  /** @type {{ slot: number, what: Enchant | "random" }[]} */
  const books = [];
  for (let i = 0; i < inv.size; i++) {
    const what = bookOf(inv.getItem(i));
    if (what) books.push({ slot: i, what });
  }
  if (!books.length) return p.sendMessage("§7You have no Silly Books. §8(Look for them at the caravan, the market or ask an operator.)");
  const form = new ActionFormData().title("§lApply a Silly Book").body(`Which book goes on your ${h.item.typeId.replace(/^minecraft:/, "").replace(/_/g, " ")}?`);
  for (const b of books) form.button(b.what === "random" ? "Random\n§8A surprise" : `${b.what.name}\n§8${SLOT_NAMES[b.what.slot]}`);
  form.button("Back");
  const res = await show(p, form);
  if (!res || res.canceled || res.selection === undefined) return;
  const b = books[res.selection];
  if (!b) return menu(p);
  applyBook(p, b.slot);
}

/**
 * Applies the Silly Book in inventory slot `bookSlot` to the held item, using up the book.
 * @param {Player} p @param {number} bookSlot @returns {boolean}
 */
export function applyBook(p, bookSlot) {
  const h = held(p);
  if (!h?.item) {
    p.sendMessage("§cHold the item you want to enchant.");
    return false;
  }
  if (bookSlot === h.slot) {
    p.sendMessage("§cHold the item to enchant, not the book.");
    return false;
  }
  const book = h.inv.getItem(bookSlot);
  let what = bookOf(book);
  if (!book || !what) {
    p.sendMessage("§cThat book is gone.");
    return false;
  }
  if (what === "random") {
    const already = enchantsOn(h.item);
    const pool = usable().filter((e) => fits(/** @type {ItemStack} */ (h.item), e.slot) && !already.includes(e));
    if (!pool.length) {
      p.sendMessage("§cNo silly enchant fits that item. Try boots, a helmet, armor or a tool.");
      return false;
    }
    what = pool[Math.floor(Math.random() * pool.length)];
  }
  const out = applyTo(h.item, what);
  if (typeof out === "string") {
    p.sendMessage(`§c${out}`);
    return false;
  }
  h.inv.setItem(h.slot, out);
  if (book.amount > 1) {
    book.amount--;
    h.inv.setItem(bookSlot, book);
  } else h.inv.setItem(bookSlot, undefined);
  const n = Number(p.getDynamicProperty(PROP_APPLIED)) || 0;
  p.setDynamicProperty(PROP_APPLIED, n + 1);
  gear.set(p.id, readGear(p));
  p.sendMessage(`§dSilly: ${what.name}! §7${what.what}.`);
  confetti(p.dimension, { x: p.location.x, y: p.location.y + 1.2, z: p.location.z }, false);
  p.playSound("random.levelup", { pitch: 1.6, volume: 0.6 });
  return true;
}

/** @param {Player} p */
async function removeMenu(p) {
  const h = held(p);
  const on = enchantsOn(h?.item);
  if (!h?.item || !on.length) return p.sendMessage("§7The item in your hand has no silly enchants.");
  const form = new ActionFormData().title("§lRemove a silly enchant").body("Removing is free. The enchant is gone (no book back).");
  for (const e of on) form.button(e.name);
  form.button("Back");
  const res = await show(p, form);
  if (!res || res.canceled || res.selection === undefined) return;
  const e = on[res.selection];
  if (!e) return menu(p);
  const now = held(p);
  if (!now?.item || now.slot !== h.slot || !enchantsOn(now.item).includes(e)) return p.sendMessage("§cHold the same item to remove it.");
  now.inv.setItem(now.slot, removeFrom(now.item, e));
  gear.set(p.id, readGear(p));
  p.sendMessage(`§7Removed ${e.name}.`);
}

/** @param {Player} p */
async function listPage(p) {
  const lines = ENCHANTS.map((e) => `§d${e.name}§r (${SLOT_NAMES[e.slot]})${isDisabled(e) ? " §c(disabled)" : ""}\n§7${e.what}`);
  const max = Math.max(1, Math.floor(Number(get("maxPerItem")) || 2));
  await show(p, new ActionFormData().title("§lAll silly enchants").body(`Up to ${max} per item. Apply books with /realm:silly.\n\n${lines.join("\n")}`).button("OK"));
}

/** @param {Player} op */
async function giveMenu(op) {
  const players = world.getAllPlayers();
  const kinds = ["Random", ...usable().map((e) => e.name)];
  const form = new ModalFormData()
    .title("§lGive Silly Books")
    .dropdown("Player", players.map((x) => x.name), { defaultValueIndex: Math.max(0, players.findIndex((x) => x.id === op.id)) })
    .dropdown("Book", kinds, { defaultValueIndex: 0 })
    .slider("How many", 1, 16, { valueStep: 1, defaultValue: 1 })
    .submitButton("Give");
  const res = await show(op, form);
  if (!res || res.canceled || !res.formValues) return;
  const [pi, ki, n] = res.formValues.map(Number);
  const target = players[pi];
  if (!target?.isValid) return op.sendMessage("§cThat player left.");
  const what = ki === 0 ? "random" : usable()[ki - 1];
  if (!what) return;
  giveBooks(target, what, Math.min(16, Math.max(1, n || 1)));
  if (target.id !== op.id) op.sendMessage(`§aGave ${target.name} ${n} Silly Book${n === 1 ? "" : "s"}.`);
}

/** @param {Player} p @param {Enchant | "random"} what @param {number} n */
function giveBooks(p, what, n) {
  const inv = inventoryOf(p);
  for (let i = 0; i < n; i++) {
    const book = makeBook(what);
    const rest = inv ? inv.addItem(book) : book;
    if (rest) p.dimension.spawnItem(rest, p.location);
  }
  p.sendMessage(`§dYou got ${n} Silly Book${n === 1 ? "" : "s"}${what === "random" ? "" : ` (${what.name})`}. §7Hold an item and run /realm:silly to apply.`);
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
      if (r instanceof Promise) r.catch((e) => console.warn(`[silly] ${e}`));
    } catch (e) {
      console.warn(`[silly] ${e}`);
    }
  });
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerEnum("realm:silly_book", ["random", ...ENCHANTS.map((e) => e.id)]);
  customCommandRegistry.registerCommand(
    { name: "realm:silly", description: "Silly Enchants: apply or remove silly enchants on the item in your hand", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => {
      const p = playerOf(origin);
      if (!p) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      later(() => menu(p));
      return { status: CustomCommandStatus.Success };
    },
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:silly_give",
      description: "Silly Enchants: give players Silly Books",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [
        { name: "player", type: CustomCommandParamType.PlayerSelector },
        { name: "realm:silly_book", type: CustomCommandParamType.Enum },
      ],
      optionalParameters: [{ name: "amount", type: CustomCommandParamType.Integer }],
    },
    (origin, /** @type {Player[]} */ targets, /** @type {string} */ kind, /** @type {number | undefined} */ amount) => {
      const list = (targets ?? []).filter((x) => x.isValid);
      if (!list.length) return { status: CustomCommandStatus.Failure, message: "No player online matches." };
      const what = kind === "random" ? "random" : enchantById(kind);
      if (!what) return { status: CustomCommandStatus.Failure, message: "Unknown silly enchant." };
      const n = Math.min(64, Math.max(1, Math.floor(amount ?? 1)));
      later(() => list.forEach((x) => giveBooks(x, what, n)));
      return { status: CustomCommandStatus.Success };
    },
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "silly_bp");
  },
  { namespaces: ["realm"] },
);
