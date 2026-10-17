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
  ScriptEventSource,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { initLibrarianBookLock } from "./librarian.js";
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
  { id: "hyper_jump", name: "Hyper Jump", slot: "feet", what: "Sneak and jump: a big bounce, a huge one, or now and then a trip with the Realm Space Program" },
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

/** Where a silly enchant works, on a book's last lore line. */
const WORKS = { hand: "Works in your main hand", feet: "Works on boots you wear", head: "Works on a helmet you wear", armor: "Works on any armor you wear" };
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
  const lore = [`§d${BOOK_PREFIX}${name}`, `§7${what === "random" ? "A surprise silly enchant" : what.what}`, "§8Apply it with /realm:silly"];
  // Last: where the enchant works once it's on an item.
  if (what !== "random") lore.push(`§7${WORKS[what.slot]}`);
  stack.setLore(lore);
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
  // Relics rewrite their lore to their ability text, which would wipe the silly line (and the book with it).
  // Their first lore line is "<rarity> relic"; the id property is only visible in the bundle (one pack).
  let relic = /^(Common|Rare|Epic|Legendary) relic$/.test(plain(loreOf(item)[0] ?? ""));
  try {
    relic ||= item.getDynamicProperty("relic:id") !== undefined;
  } catch {
    // stackable items have no dynamic properties
  }
  if (relic) return "Relics can't take silly enchants.";
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

/** Players wearing Hyper Jump boots at the last refresh: the per-tick jump check only looks at them. @type {Player[]} */
let jumpers = [];

system.runInterval(() => {
  /** @type {Player[]} */
  const wearing = [];
  for (const p of world.getAllPlayers()) {
    try {
      const g = readGear(p);
      gear.set(p.id, g);
      if (g.feet.has("hyper_jump")) wearing.push(p);
    } catch {
      gear.delete(p.id);
    }
  }
  jumpers = wearing;
}, 10);

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  gear.delete(playerId);
  lastSneak.delete(playerId);
  lastPos.delete(playerId);
  flights.delete(playerId);
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

// Tests only: `scriptevent realm:silly_trace on` from the server console makes every effect also send `realm:silly_fx`
// ({ kind: "particle" | "sound", id }), so a test server, which has no client to draw or play them, can see them.
let tracing = false;
/** @param {"particle" | "sound"} kind @param {string} id */
function trace(kind, id) {
  if (tracing) system.sendScriptEvent("realm:silly_fx", JSON.stringify({ kind, id }));
}

/** @param {import("@minecraft/server").Dimension} dim @param {string} id @param {import("@minecraft/server").Vector3} at @param {MolangVariableMap} [vars] */
function particle(dim, id, at, vars) {
  try {
    dim.spawnParticle(id, at, vars);
    trace("particle", id);
  } catch {
    // unloaded chunk or unknown particle: skip
  }
}

/** @param {import("@minecraft/server").Dimension} dim @param {string} id @param {import("@minecraft/server").Vector3} at @param {number} [volume] @param {number} [pitch] */
function sound(dim, id, at, volume = 1, pitch = 1) {
  try {
    dim.playSound(id, at, { volume, pitch });
    trace("sound", id);
  } catch {
    // unloaded chunk
  }
}

/** @template T @param {T[]} list @returns {T} */
const pick = (list) => list[Math.floor(Math.random() * list.length)];
/** @param {number} min @param {number} max */
const between = (min, max) => min + Math.random() * (max - min);

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

/** A particle with one float variable. @param {string} name @param {number} value */
function floatVars(name, value) {
  const vars = new MolangVariableMap();
  vars.setFloat(name, value);
  return vars;
}

/** @param {{ red: number, green: number, blue: number }} c @param {string} [name] */
function colorVars(c, name = "variable.color") {
  const vars = new MolangVariableMap();
  vars.setColorRGBA(name, { ...c, alpha: 1 });
  return vars;
}

// The particles and the cheer come from the Silly Enchants resource pack (silly_rp, in the Realm Resources bundle).
// Vanilla puffs go along with them, so a world without that pack still sees something.

/** Confetti flakes burst out, tumble and settle. @param {import("@minecraft/server").Dimension} dim @param {import("@minecraft/server").Vector3} at @param {number} count */
function confetti(dim, at, count) {
  particle(dim, "realm:silly_confetti", at, floatVars("variable.count", count));
  particle(dim, "minecraft:totem_particle", at);
  for (let i = 0; i < 3; i++) colorPuff(dim, { x: at.x + between(-0.6, 0.6), y: at.y + Math.random(), z: at.z + between(-0.6, 0.6) }, pick(RAINBOW));
}

/** Grunt Birthday: a party horn, a squeaky little chorus cheering "yaaay" and a shower of confetti. @param {import("@minecraft/server").Dimension} dim @param {import("@minecraft/server").Vector3} at */
function birthday(dim, at) {
  sound(dim, "realm.silly.yay", at, 1, between(0.95, 1.08));
  confetti(dim, at, 40);
  system.runTimeout(() => confetti(dim, { x: at.x, y: at.y + 0.4, z: at.z }, 24), 6); // a second pop as the chorus starts
}

// Trails and ambient effects, five times a second. Only players with the matching gear do any work.
let beat = 0;
system.runInterval(() => {
  if (get("enabled") !== true) return;
  beat++;
  for (const p of world.getAllPlayers()) {
    const g = gear.get(p.id);
    if (!g || (!g.feet.size && !g.armor.size && !g.head.size)) {
      lastPos.delete(p.id);
      continue;
    }
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
/** Where each player with ambient gear was on the last beat (movement comes from this, not from velocity). @type {Map<string, import("@minecraft/server").Vector3>} */
const lastPos = new Map();

/** @param {Player} p */
function ambient(p) {
  const dim = p.dimension;
  const loc = p.location;
  const prev = lastPos.get(p.id) ?? loc;
  lastPos.set(p.id, { x: loc.x, y: loc.y, z: loc.z });
  // Moved at least a fifth of a block since the last beat (a slow sneak is about 0.26), and not a teleport.
  const step = Math.hypot(loc.x - prev.x, loc.z - prev.z);
  const moving = step > 0.2 && step < 8;
  if (moving && has(p, "rainbow_trail")) {
    // A dab on the ground every half block between the last spot and this one, in the next color each time.
    const n = Math.min(6, Math.max(1, Math.round(step / 0.45)));
    for (let i = 1; i <= n; i++) {
      const at = { x: prev.x + ((loc.x - prev.x) * i) / n, y: loc.y + 0.06, z: prev.z + ((loc.z - prev.z) * i) / n };
      particle(dim, "realm:silly_trail", at, colorVars(RAINBOW[(beat * n + i) % RAINBOW.length]));
    }
    colorPuff(dim, { x: loc.x, y: loc.y + 0.1, z: loc.z }, RAINBOW[beat % RAINBOW.length]);
  }
  if (moving && has(p, "bubbles")) {
    particle(dim, "realm:silly_bubble", { x: loc.x, y: loc.y + 0.8, z: loc.z }); // these float through air too
    if (p.isInWater) particle(dim, "minecraft:bubble_column_up_particle", { x: loc.x, y: loc.y + 0.6, z: loc.z });
  }
  if (moving && p.isOnGround && beat % 2 === 0 && has(p, "squeak")) sound(dim, Math.random() < 0.85 ? "mob.bat.idle" : "mob.rabbit.idle", loc, 0.6, between(1.6, 2));
  if (has(p, "disco")) {
    // A dance floor under your feet every beat, a ring of lights in the next color every other beat, and now and then a note.
    particle(dim, "realm:silly_floor", { x: loc.x, y: loc.y + 0.04, z: loc.z });
    if (beat % 2 === 0) {
      const c = RAINBOW[(beat / 2) % RAINBOW.length];
      particle(dim, "realm:silly_light", { x: loc.x, y: loc.y + 0.4 + ((beat / 2) % 3) * 0.5, z: loc.z }, colorVars(c));
      colorPuff(dim, { x: loc.x + between(-0.8, 0.8), y: loc.y + 1.1, z: loc.z + between(-0.8, 0.8) }, c);
    }
    if (beat % 10 === 0) particle(dim, "minecraft:note_particle", { x: loc.x, y: loc.y + 2.2, z: loc.z }, colorVars(pick(RAINBOW), "variable.note_color"));
  }
  if (beat % 5 === 0 && has(p, "glow")) {
    const t = world.getTimeOfDay();
    if (t >= 12500 && t <= 23500)
      for (let i = 0; i < 3; i++) particle(dim, "minecraft:endrod", { x: loc.x + between(-0.7, 0.7), y: loc.y + 0.3 + Math.random() * 1.6, z: loc.z + between(-0.7, 0.7) });
  }
  if (beat % 5 === 0 && has(p, "hiccups") && Math.random() < 1 / 30) {
    sound(dim, "random.burp", loc, 1, between(1.6, 2));
    particle(dim, "realm:silly_bubble", { x: loc.x, y: loc.y + 1.7, z: loc.z }); // the vanilla bubbles vanish out of water
    // Now and then a hiccup that hops you a little.
    if (p.isOnGround && Math.random() < 0.3) p.applyKnockback({ x: 0, z: 0 }, 0.35);
  }
  if (has(p, "duck")) {
    const was = lastSneak.get(p.id) ?? false;
    if (p.isSneaking && !was) {
      const pitch = between(0.45, 0.7);
      sound(dim, "mob.chicken.say", loc, 1.2, pitch);
      if (Math.random() < 0.25) system.runTimeout(() => sound(dim, "mob.chicken.say", loc, 1.2, pitch + 0.1), 5); // a double quack
    }
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
  for (const p of jumpers) {
    const g = gear.get(p.id);
    if (!g || !g.feet.has("hyper_jump")) continue;
    try {
      if (!p.isValid) continue;
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

/**
 * Players in a Hyper Jump flight: the tick it ends at the latest, and whether to cushion the landing.
 * @type {Map<string, { start: number, until: number, cushion: boolean, rose: boolean }>}
 */
const flights = new Map();

/** @param {Player} p @param {boolean} quiet no "recharging" note @returns {boolean} true if it bounced */
export function hyperJump(p, quiet) {
  const cd = Math.max(1, Math.floor(Number(get("hyperJumpCooldownSeconds")) || 4)) * 20;
  if (!ready(p, "hyper_jump", cd)) {
    if (!quiet && (cooldowns.get(p.id)?.get("hyper_jump") ?? 0) - system.currentTick < cd - 5) {
      system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: p.id, ticks: 30, from: "silly_bp" })); // other bar writers wait
      p.onScreenDisplay.setActionBar("§7Hyper Jump is recharging");
    }
    return false;
  }
  const odds = CONFIG.hyperJumpOdds;
  const huge = Math.max(0, Number(odds.huge) || 0), space = Math.max(0, Number(odds.space) || 0), big = Math.max(0, Number(odds.big) || 0);
  const roll = Math.random() * (big + huge + space || 1);
  if (roll < space) spaceProgram(p);
  else if (roll < space + huge) bounce(p, between(3.4, 3.9), true);
  else bounce(p, between(2.4, 2.7), false);
  return true;
}

/** The launch multiplier from config (1 = as designed). */
const power = () => Math.min(2, Math.max(0.2, Number(CONFIG.hyperJumpStrength) || 1));

/** @param {Player} p @param {number} up vertical strength before the multiplier @param {boolean} huge */
function bounce(p, up, huge) {
  p.applyKnockback({ x: 0, z: 0 }, up * power());
  track(p, 20 * 12);
  const dim = p.dimension;
  const loc = p.location;
  sound(dim, "mob.slime.big", loc, 2, pick([0.6, 0.9, 1.3]));
  sound(dim, pick(["random.pop", "firework.launch", "mob.blaze.shoot"]), loc, 1.5, between(0.6, 1.2));
  particle(dim, "minecraft:knockback_roar_particle", loc);
  particle(dim, "minecraft:villager_happy", loc);
  if (huge) {
    sound(dim, "firework.large_blast", loc, 2, between(0.8, 1.2));
    sound(dim, pick(["mob.enderdragon.flap", "mob.phantom.swoop", "random.levelup"]), loc, 1.5, between(1, 1.6));
    for (let i = 0; i < 4; i++) colorPuff(dim, { x: loc.x + between(-1, 1), y: loc.y + between(0, 1), z: loc.z + between(-1, 1) }, pick(RAINBOW));
    particle(dim, "minecraft:totem_particle", loc);
  }
}

const SPACE_LINES = [
  "has left the atmosphere.",
  "is going where no crafter has gone before.",
  "is now a satellite. Briefly.",
  "has been launched by the Realm Space Program.",
  "forgot to ask where the brakes are.",
];

/** The Realm Space Program: a countdown, then a long burn. @param {Player} p */
function spaceProgram(p) {
  const id = p.id;
  const steps = ["§e3", "§62", "§c1"];
  steps.forEach((t, i) =>
    system.runTimeout(() => {
      try {
        if (!p.isValid) return;
        system.sendScriptEvent("realm:title", JSON.stringify({ player: p.id, ticks: 18, from: "silly_bp" }));
        p.onScreenDisplay.setTitle(t, { subtitle: "§7Realm Space Program", fadeInDuration: 0, stayDuration: 14, fadeOutDuration: 4 });
        sound(p.dimension, "note.pling", p.location, 2, 0.8 + i * 0.25);
        particle(p.dimension, "minecraft:basic_smoke_particle", p.location);
        particle(p.dimension, "minecraft:white_smoke_particle", p.location);
      } catch {
        // gone
      }
    }, i * 15),
  );
  system.runTimeout(() => {
    try {
      if (!p.isValid) return;
      const dim = p.dimension;
      const pad = p.location;
      system.sendScriptEvent("realm:title", JSON.stringify({ player: p.id, ticks: 40, from: "silly_bp" }));
      p.onScreenDisplay.setTitle("§cLIFTOFF!", { subtitle: "§7Realm Space Program", fadeInDuration: 0, stayDuration: 30, fadeOutDuration: 10 });
      sound(dim, "random.explode", pad, 3, 0.7);
      sound(dim, "firework.launch", pad, 3, 0.5);
      sound(dim, "mob.enderdragon.growl", pad, 1.5, 1.8);
      particle(dim, "minecraft:huge_explosion_emitter", pad); // only looks: nothing breaks, nobody is hurt
      const line = `§6[Space Program] §f${p.name} §7${pick(SPACE_LINES)}`;
      for (const o of dim.getPlayers({ location: pad, maxDistance: 96 })) o.sendMessage(line);
      track(p, 20 * 30);
      const burn = 50;
      for (let t = 0; t < burn; t++) {
        system.runTimeout(() => {
          try {
            if (!p.isValid || !flights.has(id)) return;
            p.applyKnockback({ x: 0, z: 0 }, 2.4 * power());
            const l = p.location;
            const exhaust = { x: l.x, y: l.y - 0.5, z: l.z };
            particle(dim, "minecraft:basic_flame_particle", exhaust);
            particle(dim, "minecraft:lava_particle", exhaust);
            particle(dim, t % 2 ? "minecraft:basic_smoke_particle" : "minecraft:white_smoke_particle", exhaust);
            if (t % 10 === 0) sound(dim, pick(["firework.blast", "mob.ghast.fireball", "mob.blaze.shoot"]), l, 2, between(0.5, 0.9));
          } catch {
            // gone
          }
        }, t);
      }
      system.runTimeout(() => {
        try {
          if (!p.isValid) return;
          const l = p.location;
          particle(dim, "minecraft:totem_particle", l);
          sound(dim, "firework.twinkle", l, 3, 1);
          sound(dim, "firework.large_blast", l, 3, 1.2);
        } catch {
          // gone
        }
      }, burn);
    } catch (e) {
      console.warn(`[silly] space: ${e}`);
    }
  }, steps.length * 15);
}

/** Watches a flight until the landing. @param {Player} p @param {number} ticks */
function track(p, ticks) {
  flights.set(p.id, { start: system.currentTick, until: system.currentTick + ticks, cushion: get("hyperJumpSoftLanding") === true, rose: false });
}

// Flights: a soft landing (a moment of slow falling just above the ground) when enabled, else a real fall.
system.runInterval(() => {
  if (!flights.size) return;
  for (const [id, f] of flights) {
    const p = world.getEntity(id);
    if (!(p instanceof Player) || system.currentTick > f.until) {
      flights.delete(id);
      continue;
    }
    try {
      const vy = p.getVelocity().y;
      if (vy > 0.1) f.rose = true;
      // The first ticks of a launch can still read "on the ground": that isn't a landing (and would end the Space Program's burn).
      if (!f.rose || system.currentTick - f.start < 6) continue;
      if (p.isOnGround || p.isInWater || p.isFlying || p.isGliding) {
        flights.delete(id);
        continue;
      }
      if (vy >= -0.3) continue;
      const hit = p.dimension.getBlockFromRay(p.location, { x: 0, y: -1, z: 0 }, { maxDistance: Math.max(3, 2 - vy * 3), includeLiquidBlocks: true, includePassableBlocks: false });
      if (!hit) continue;
      flights.delete(id);
      if (!f.cushion) continue;
      p.applyKnockback({ x: 0, z: 0 }, 0.15); // stop the fall: a little boing
      p.addEffect("slow_falling", 40, { amplifier: 0, showParticles: false });
      sound(p.dimension, pick(["mob.slime.big", "random.pop", "bubble.pop"]), p.location, 1.5, between(0.8, 1.4));
      particle(p.dimension, "minecraft:white_smoke_particle", p.location);
    } catch {
      flights.delete(id);
    }
  }
}, 1);

// Hits: Confetti Swing, Fish Slap, Hat Trick.
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (!(damagingEntity instanceof Player) || get("enabled") !== true) return;
  const p = damagingEntity;
  try {
    const g = gear.get(p.id);
    if (!g || !g.hand.size || !playing(p) || !hitEntity.isValid) return;
    const at = { x: hitEntity.location.x, y: hitEntity.location.y + 1, z: hitEntity.location.z };
    if (has(p, "confetti_swing")) {
      confetti(p.dimension, at, 14);
      sound(p.dimension, pick(["random.pop", "bubble.pop", "note.pling", "note.bell"]), at, 1, between(1.2, 2));
    }
    if (has(p, "fish_slap")) {
      sound(p.dimension, "mob.fish.flop", at, 2, between(0.6, 1));
      sound(p.dimension, pick(["random.splash", "mob.dolphin.play", "bubble.pop"]), at, 1, between(1.2, 1.8));
      for (let i = 0; i < 3; i++) particle(p.dimension, "minecraft:water_splash_particle_manual", { x: at.x + between(-0.4, 0.4), y: at.y + between(0, 0.5), z: at.z + between(-0.4, 0.4) });
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
  particle(p.dimension, "minecraft:totem_particle", at);
  sound(p.dimension, "random.pop", at, 1.5, 1.2);
  sound(p.dimension, "mob.rabbit.idle", at, 1.5, 1.4);
  if (Math.random() < 0.5) sound(p.dimension, "random.levelup", at, 0.8, 2); // ta-da
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
    if (has(p, "grunt_birthday")) birthday(deadEntity.dimension, at);
    if (has(p, "tiny_thunder")) {
      const dim = deadEntity.dimension;
      sound(dim, "ambient.weather.thunder", at, 1, between(1.5, 2));
      if (Math.random() < 0.4) sound(dim, "ambient.weather.lightning.impact", at, 0.8, 1.8);
      for (let i = 0; i < 4; i++) particle(dim, "minecraft:electric_spark_particle", { x: at.x + between(-0.5, 0.5), y: at.y + between(0, 1), z: at.z + between(-0.5, 0.5) });
      particle(dim, "minecraft:critical_hit_emitter", at);
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
    // Mostly a moo. Sometimes the wrong animal answers.
    const voice = Math.random() < 0.75 ? "mob.cow.say" : pick(["mob.pig.say", "mob.sheep.say", "mob.chicken.say", "mob.cat.meow"]);
    sound(hurtEntity.dimension, voice, hurtEntity.location, 1.5, between(0.9, 1.3));
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
  const eye = p.getHeadLocation(), look = p.getViewDirection(); // in front of you, where you can see it
  confetti(p.dimension, { x: eye.x + look.x * 1.5, y: eye.y + look.y * 1.5, z: eye.z + look.z * 1.5 }, 20);
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
  if (!res || res.canceled || !res.formValues || !op.isValid) return;
  if (!isOp(op)) return op.sendMessage("§cOnly operators can give Silly Books."); // de-opped while the form was open
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
  ({ id, message, sourceType }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "silly_bp");
    else if (id === "realm:silly_trace" && sourceType === ScriptEventSource.Server) tracing = message.trim() === "on"; // console only
  },
  { namespaces: ["realm"] },
);

initLibrarianBookLock({
  bookOf,
  makeBookById: (id) => {
    const e = enchantById(id);
    return e ? makeBook(e) : undefined;
  },
});
