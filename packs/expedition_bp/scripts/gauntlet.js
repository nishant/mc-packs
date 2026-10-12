// The Gauntlet: a long expedition (14 rooms by default) with a sanctuary every few rooms where each
// player picks one of three boons, and an optional fixed loadout: the players' own items are stored
// away while they run with a starter kit, and given back exactly when they come home.
//
// Stored items live in a structure saved in the world (world.structureManager, saved with the world,
// so it outlasts restarts and players leaving the game): the items are put into two chest minecarts in
// a sealed pocket of the dungeon box, the structure is saved with the carts in it, and the carts are
// removed. Giving them back places the structure (entities only, no blocks) at the player's feet,
// moves every item back into the slot it came from (or the first free one, or to the ground), and
// removes the carts and the structure.

import { EnchantmentType, EquipmentSlot, ItemStack, Player, StructureSaveMode, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

/** Lore line on kit and boon gear: taken away when the run ends. */
export const RUN_LORE = "§8Expedition gear: stays in the dungeon";
const STASH_PROP = "expedition:stash"; // player: JSON { id, tag, placed? }: where their own items are while they run with the kit
const STASH_NEXT = "expedition:stash_next"; // world: the next stash number
const STASH_TAG = "realm:exp_stash";
/** Slots 0 to 35 are the inventory; then the armor and the offhand. */
const EQUIP = [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand];
const SLOTS = 36 + EQUIP.length;
const CART = 27; // slots in a chest minecart

/**
 * @typedef {{ id: string, name: string, rarity: "common" | "rare" | "epic", desc: string, effects?: [string, number][],
 *   items?: (L: number) => ItemStack[], flag?: string, repeat?: boolean }} Boon
 * effects: [effect id, amplifier] for the rest of the run. flag: what the pack does with it (lifesteal, bloodthirst, greed, midas, wolves).
 */

/**
 * An item, maybe enchanted and named, maybe marked as run gear (taken away when the run ends).
 * @param {string} id @param {number} [count] @param {{ ench?: Record<string, number>, name?: string, gear?: boolean }} [opts]
 */
export function makeItem(id, count = 1, opts = {}) {
  const it = new ItemStack(id, count);
  const en = it.getComponent("minecraft:enchantable");
  for (const [e, level] of Object.entries(opts.ench ?? {})) {
    try {
      en?.addEnchantment({ type: new EnchantmentType(e), level });
    } catch {
      // not for this item
    }
  }
  if (opts.name) it.nameTag = opts.name;
  if (opts.gear) it.setLore([RUN_LORE]);
  return it;
}

/** The best gear tier for a level: iron, diamond from Nightmare 8, netherite from Nightmare 15. @param {number} L */
const metal = (L) => (L >= 17 ? "netherite" : L >= 10 ? "diamond" : "iron");

/** Every boon. Weights by rarity: common 10, rare 5, epic 2. @type {Boon[]} */
export const BOONS = [
  { id: "vigor", name: "Vitality", rarity: "common", desc: "2 extra hearts for the rest of the run", effects: [["health_boost", 1]] },
  { id: "swift", name: "Swiftness", rarity: "common", desc: "Speed for the rest of the run", effects: [["speed", 0]] },
  { id: "ironskin", name: "Iron Skin", rarity: "common", desc: "Resistance for the rest of the run", effects: [["resistance", 0]] },
  { id: "might", name: "Might", rarity: "common", desc: "Strength for the rest of the run", effects: [["strength", 0]] },
  { id: "spring", name: "Springheel", rarity: "common", desc: "Jump Boost 2 for the rest of the run", effects: [["jump_boost", 1]] },
  { id: "fireward", name: "Fire Ward", rarity: "common", desc: "Fire Resistance and Night Vision for the rest of the run", effects: [["fire_resistance", 0], ["night_vision", 0]] },
  { id: "rations", name: "Rations", rarity: "common", desc: "3 golden apples and 16 steaks", repeat: true, items: () => [makeItem("minecraft:golden_apple", 3), makeItem("minecraft:cooked_beef", 16)] },
  { id: "quiver", name: "Quiver", rarity: "common", desc: "A Power 3 bow and 48 arrows", repeat: true, items: () => [makeItem("minecraft:bow", 1, { ench: { power: 3, unbreaking: 2 }, name: "Gauntlet Bow", gear: true }), makeItem("minecraft:arrow", 48)] },
  { id: "regen", name: "Regeneration", rarity: "rare", desc: "Regeneration for the rest of the run", effects: [["regeneration", 0]] },
  { id: "blade", name: "Champion's Blade", rarity: "rare", desc: "A Sharpness 4 sword for the run", repeat: true, items: (L) => [makeItem(`minecraft:${metal(L)}_sword`, 1, { ench: { sharpness: 4, unbreaking: 3 }, name: "Champion's Blade", gear: true })] },
  { id: "plate", name: "Guardian Plate", rarity: "rare", desc: "A Protection 4 chestplate for the run", repeat: true, items: (L) => [makeItem(`minecraft:${metal(L)}_chestplate`, 1, { ench: { protection: 4, unbreaking: 3 }, name: "Guardian Plate", gear: true })] },
  { id: "totem", name: "Second Wind", rarity: "rare", desc: "A totem of undying", repeat: true, items: () => [makeItem("minecraft:totem_of_undying", 1)] },
  { id: "bloodthirst", name: "Bloodthirst", rarity: "rare", desc: "Heal 1.5 hearts for every monster you kill", flag: "bloodthirst" },
  { id: "greed", name: "Greed", rarity: "rare", desc: "Half again as many Crowns when you finish", flag: "greed" },
  { id: "wolves", name: "Wolf Pack", rarity: "rare", desc: "Two tame wolves fight at your side for the run", flag: "wolves", repeat: true },
  { id: "lifesteal", name: "Vampire's Edge", rarity: "epic", desc: "Heal a fifth of the damage you deal in melee", flag: "lifesteal" },
  { id: "titan", name: "Giant's Heart", rarity: "epic", desc: "8 extra hearts for the rest of the run", effects: [["health_boost", 3]] },
  { id: "berserk", name: "Berserker", rarity: "epic", desc: "Strength 2 and Speed for the rest of the run", effects: [["strength", 1], ["speed", 0]] },
  { id: "midas", name: "Midas Touch", rarity: "epic", desc: "Twice the Crowns when you finish", flag: "midas" },
  { id: "feast", name: "Golden Feast", rarity: "epic", desc: "An enchanted golden apple and 4 golden apples", repeat: true, items: () => [makeItem("minecraft:enchanted_golden_apple", 1), makeItem("minecraft:golden_apple", 4)] },
];
const WEIGHT = { common: 10, rare: 5, epic: 2 };
/** How each rarity shows. */
export const RARITY = { common: "§f", rare: "§b", epic: "§d" };

/** @param {string} id */
export const boonOf = (id) => BOONS.find((b) => b.id === id);

/**
 * Three different boons, weighted by rarity, without the ones the player already has (unless they can be taken again).
 * @param {string[]} have @param {() => number} r @returns {Boon[]}
 */
export function rollBoons(have, r) {
  let pool = BOONS.filter((b) => b.repeat || !have.includes(b.id));
  /** @type {Boon[]} */
  const out = [];
  while (out.length < 3 && pool.length) {
    const total = pool.reduce((n, b) => n + WEIGHT[b.rarity], 0);
    let x = r() * total;
    let chosen = pool[pool.length - 1];
    for (const b of pool) {
      x -= WEIGHT[b.rarity];
      if (x < 0) {
        chosen = b;
        break;
      }
    }
    out.push(chosen);
    pool = pool.filter((b) => b !== chosen);
  }
  return out;
}

/** The effects a player's boons give, strongest amplifier of each. @param {string[]} ids @returns {Map<string, number>} */
export function boonEffects(ids) {
  const out = new Map();
  for (const id of ids) for (const [e, amp] of boonOf(id)?.effects ?? []) out.set(e, Math.max(out.get(e) ?? -1, amp));
  return out;
}

// ---------------------------------------------------------------------------
// The kit
// ---------------------------------------------------------------------------

/** @typedef {{ item: string, count?: number, from?: number, to?: number, slot?: "head" | "chest" | "legs" | "feet" | "offhand", ench?: Record<string, number> }} KitEntry */

const SLOT_OF = { head: EquipmentSlot.Head, chest: EquipmentSlot.Chest, legs: EquipmentSlot.Legs, feet: EquipmentSlot.Feet, offhand: EquipmentSlot.Offhand };

/**
 * Gives the starter kit for a level (from `gauntletKit`). Kit gear is marked and taken away when the run ends;
 * food, arrows and blocks are not.
 * @param {Player} p @param {number} L
 */
export function giveKit(p, L) {
  const inv = p.getComponent("minecraft:inventory")?.container;
  const eq = p.getComponent("minecraft:equippable");
  for (const k of /** @type {KitEntry[]} */ (CONFIG.gauntletKit)) {
    if ((k.from ?? 0) > L || (k.to ?? 99) < L) continue;
    try {
      const it = makeItem(k.item, k.count ?? 1, { ench: k.ench, gear: (new ItemStack(k.item, 1).maxAmount ?? 64) === 1 });
      const slot = k.slot ? SLOT_OF[k.slot] : undefined;
      if (slot && eq && !eq.getEquipment(slot)) eq.setEquipment(slot, it);
      else {
        const rest = inv?.addItem(it);
        if (rest) p.dimension.spawnItem(rest, p.location);
      }
    } catch (e) {
      console.warn(`[expedition] kit ${k.item}: ${e}`);
    }
  }
}

/** Is this run gear (kit or boon gear, taken away when the run ends)? @param {ItemStack | undefined} it */
export const isRunGear = (it) => !!it && it.getLore().includes(RUN_LORE);

/** Takes run gear away from a player (inventory, armor, offhand). @param {Player} p @returns {number} how many */
export function stripRunGear(p) {
  let n = 0;
  const inv = p.getComponent("minecraft:inventory")?.container;
  if (inv)
    for (let k = 0; k < inv.size; k++) {
      if (!isRunGear(inv.getItem(k))) continue;
      inv.setItem(k);
      n++;
    }
  const eq = p.getComponent("minecraft:equippable");
  if (eq)
    for (const s of EQUIP) {
      if (!isRunGear(eq.getEquipment(s))) continue;
      eq.setEquipment(s);
      n++;
    }
  return n;
}

// ---------------------------------------------------------------------------
// The stash: the player's own items while they run with the kit
// ---------------------------------------------------------------------------

/** @param {Player} p @returns {{ id: string, tag: string, placed?: boolean, at?: { x: number, y: number, z: number, d: string } } | undefined} */
export function stashOf(p) {
  try {
    const raw = p.getDynamicProperty(STASH_PROP);
    const v = typeof raw === "string" ? JSON.parse(raw) : undefined;
    return v && typeof v.id === "string" && typeof v.tag === "string" ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Everything the player carries, by slot (0 to 35 inventory, then head, chest, legs, feet, offhand). @param {Player} p */
function carried(p) {
  const inv = p.getComponent("minecraft:inventory")?.container;
  const eq = p.getComponent("minecraft:equippable");
  /** @type {(ItemStack | undefined)[]} */
  const out = [];
  for (let k = 0; k < 36; k++) out.push(inv && k < inv.size ? inv.getItem(k) : undefined);
  for (const s of EQUIP) out.push(eq?.getEquipment(s));
  return { inv, eq, items: out };
}

/**
 * Stores everything the player carries in a structure, then empties their inventory, armor and offhand.
 * `at` is an air pocket nobody can reach (the dungeon box keeps one). Returns false (and changes
 * nothing the player carries) when anything goes wrong.
 * @param {Player} p @param {import("@minecraft/server").Dimension} dim @param {import("@minecraft/server").Vector3} at
 */
export function saveStash(p, dim, at) {
  if (stashOf(p)) return false; // a stash from before is still waiting: never overwrite it
  const { inv, eq, items } = carried(p);
  if (!inv || !eq) return false;
  const nRaw = world.getDynamicProperty(STASH_NEXT);
  const n = typeof nRaw === "number" ? nRaw : 1;
  world.setDynamicProperty(STASH_NEXT, n + 1);
  const id = `expedition:stash_${n}`;
  const tag = `${STASH_TAG}_${n}`;
  /** @type {import("@minecraft/server").Entity[]} */
  const carts = [];
  try {
    if (!items.some((it) => !!it)) {
      // Nothing to keep: no structure, just a note that there's nothing to give back.
      p.setDynamicProperty(STASH_PROP, JSON.stringify({ id: "", tag: "" }));
      return true;
    }
    for (let c = 0; c * CART < SLOTS; c++) {
      const cart = dim.spawnEntity("minecraft:chest_minecart", { x: at.x + 0.5, y: at.y, z: at.z + 0.5 });
      cart.addTag(STASH_TAG);
      cart.addTag(tag);
      cart.addTag(`${STASH_TAG}_part_${c}`);
      carts.push(cart);
      const box = cart.getComponent("minecraft:inventory")?.container;
      if (!box) throw new Error("no cart inventory");
      for (let k = 0; k < CART && c * CART + k < SLOTS; k++) {
        const it = items[c * CART + k];
        if (it) box.setItem(k, it);
      }
    }
    world.structureManager.delete(id);
    world.structureManager.createFromWorld(id, dim, { x: at.x, y: at.y, z: at.z }, { x: at.x, y: at.y + 1, z: at.z }, { includeBlocks: false, includeEntities: true, saveMode: StructureSaveMode.World });
    if (!world.structureManager.get(id)) throw new Error("structure not saved");
    p.setDynamicProperty(STASH_PROP, JSON.stringify({ id, tag }));
    // Saved: now the player's own items go (the carts keep nothing behind either).
    for (let k = 0; k < 36 && k < inv.size; k++) if (items[k]) inv.setItem(k);
    EQUIP.forEach((s, k) => {
      if (items[36 + k]) eq.setEquipment(s);
    });
    return true;
  } catch (e) {
    console.warn(`[expedition] stash: ${e}`);
    try {
      world.structureManager.delete(id);
    } catch {
      // never made
    }
    return false;
  } finally {
    for (const cart of carts) {
      try {
        cart.getComponent("minecraft:inventory")?.container?.clearAll();
        cart.remove();
      } catch {
        // gone
      }
    }
  }
}

/**
 * Gives a player's stored items back: each into the slot it came from when that's empty, otherwise into
 * the inventory, otherwise at their feet. Run gear is taken away first. Resolves true once nothing is left to give.
 * @param {Player} p
 */
export async function restoreStash(p) {
  const st = stashOf(p);
  if (!st) return true;
  stripRunGear(p);
  if (!st.id) {
    p.setDynamicProperty(STASH_PROP, undefined);
    return true;
  }
  const sm = world.structureManager;
  const dim = p.dimension;
  if (!st.placed) {
    if (!sm.get(st.id)) {
      console.warn(`[expedition] stash ${st.id} for ${p.name} is missing`);
      p.setDynamicProperty(STASH_PROP, undefined);
      p.sendMessage("§cYour stored items couldn't be found. Tell an operator.");
      return true;
    }
    const at = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
    // Marked before placing: if the carts appear and anything stops us, they're searched for, never placed twice.
    p.setDynamicProperty(STASH_PROP, JSON.stringify({ ...st, placed: true, at: { ...at, d: dim.id } }));
    sm.place(st.id, dim, at, { includeBlocks: false, includeEntities: true });
  }
  /** @type {import("@minecraft/server").Entity[]} */
  let carts = [];
  for (let t = 0; t < 10 && carts.length < 2; t++) {
    await new Promise((res) => system.runTimeout(() => res(undefined), 2));
    if (!p.isValid) return false;
    try {
      carts = world.getDimension(stashOf(p)?.at?.d ?? dim.id).getEntities({ tags: [st.tag] });
    } catch {
      carts = [];
    }
  }
  if (!carts.length) return false; // tried again when they next spawn
  const { inv, eq } = carried(p);
  let spilled = 0;
  /** @param {ItemStack} it @param {number} slot */
  const put = (it, slot) => {
    if (slot < 36 && inv && !inv.getItem(slot)) return inv.setItem(slot, it);
    if (slot >= 36 && eq && !eq.getEquipment(EQUIP[slot - 36])) return eq.setEquipment(EQUIP[slot - 36], it);
    const rest = inv?.addItem(it) ?? it;
    if (rest) {
      p.dimension.spawnItem(rest, p.location);
      spilled++;
    }
  };
  for (const cart of carts) {
    const part = Number(cart.getTags().find((x) => x.startsWith(`${STASH_TAG}_part_`))?.slice(`${STASH_TAG}_part_`.length) ?? 0);
    const box = cart.getComponent("minecraft:inventory")?.container;
    if (box)
      for (let k = 0; k < box.size; k++) {
        const it = box.getItem(k);
        if (!it) continue;
        box.setItem(k);
        put(it, part * CART + k);
      }
    cart.remove();
  }
  p.setDynamicProperty(STASH_PROP, undefined);
  try {
    sm.delete(st.id);
  } catch {
    // already gone
  }
  p.sendMessage(`§aYour own items are back with you.${spilled ? " Some are at your feet: those slots were taken." : ""}`);
  return true;
}
