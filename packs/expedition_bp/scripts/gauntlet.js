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
/** Saved structure ids this pack makes: expedition:stash_<n> and expedition:parcel_<n>, nothing else. */
const OWN_STRUCTURE = /^expedition:(stash|parcel)_\d+$/;
/** False from a confirmed "forget" until /reload: realm:diag blocks this pack's world saves then, so a new stash or parcel couldn't be tracked. */
let saving = true;

/** @param {boolean} on */
export function setSaving(on) {
  saving = on;
}

/**
 * Deletes this pack's saved structures of one kind (`expedition:<kind>_<n>`; never another pack's or a player's own
 * structures), except the ones `hold` names, which are counted as kept, and checks each is really gone.
 * @param {"stash" | "parcel"} kind @param {() => boolean} hold
 * @returns {{ deleted: number, kept: number, failed: number, error?: string }}
 */
export function forgetStructures(kind, hold) {
  /** @type {{ deleted: number, kept: number, failed: number, error?: string }} */
  const out = { deleted: 0, kept: 0, failed: 0 };
  const sm = world.structureManager;
  /** @type {string[]} */
  let ids;
  try {
    ids = sm.getWorldStructureIds().filter((id) => OWN_STRUCTURE.test(id) && id.startsWith(`expedition:${kind}_`));
  } catch (e) {
    out.failed = -1;
    out.error = `couldn't list saved structures: ${String(e).slice(0, 120)}`;
    return out;
  }
  for (const id of ids) {
    if (hold()) {
      out.kept++;
      continue;
    }
    try {
      sm.delete(id);
      if (sm.get(id)) throw new Error("still saved");
      out.deleted++;
    } catch (e) {
      out.failed++;
      out.error ??= `${id}: ${String(e).slice(0, 120)}`;
    }
  }
  return out;
}
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

/**
 * Spawns an entity and makes sure the game handed back the new one: a world whose entity ids repeat (an old
 * level.dat put back) can return an entity that already exists, such as a dropped item or someone's minecart, and
 * tagging, filling or later removing that one would lose it. Throws when it keeps happening.
 * @param {import("@minecraft/server").Dimension} dim @param {string} type @param {import("@minecraft/server").Vector3} at
 */
export function spawnFresh(dim, type, at) {
  const want = type.includes(":") ? type : `minecraft:${type}`;
  for (let k = 0; k < 8; k++) {
    const e = dim.spawnEntity(/** @type {any} */ (type), at);
    // The type alone isn't enough: someone's chest minecart or pet wolf is the same type. A new entity stands where
    // it was spawned, untagged, in the dimension asked for.
    if (e.typeId !== want || e.dimension.id !== dim.id) continue;
    const l = e.location;
    if (Math.abs(l.x - at.x) < 0.5 && Math.abs(l.z - at.z) < 0.5 && Math.abs(l.y - at.y) < 1.5 && !e.getTags().length) return e;
  }
  throw new Error(`spawnEntity(${type}) kept returning another entity`);
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
 * Gives the starter kit for a level (from `gauntletKit`). Everything in it (food, arrows and blocks too) is
 * marked as run gear and taken away when the run ends.
 * @param {Player} p @param {number} L
 */
export function giveKit(p, L) {
  const inv = p.getComponent("minecraft:inventory")?.container;
  const eq = p.getComponent("minecraft:equippable");
  for (const k of /** @type {KitEntry[]} */ (CONFIG.gauntletKit)) {
    if ((k.from ?? 0) > L || (k.to ?? 99) < L) continue;
    try {
      const it = makeItem(k.item, k.count ?? 1, { ench: k.ench, gear: true });
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

/** @param {Player} p @returns {{ id: string, tag: string, placed?: boolean, seen?: boolean, at?: { x: number, y: number, z: number, d: string } } | undefined} */
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
  if (!saving) return false; // forgotten: the next numbers can't be saved, so no structure and no stripped inventory
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
      const cart = spawnFresh(dim, "minecraft:chest_minecart", { x: at.x + 0.5, y: at.y, z: at.z + 0.5 });
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

/** @param {number} ticks */
const wait = (ticks) => new Promise((res) => system.runTimeout(() => res(undefined), ticks));

/** Is the block at this spot loaded (so a structure placed there really puts its carts down)? @param {import("@minecraft/server").Dimension} dim @param {import("@minecraft/server").Vector3} at */
function loadedAt(dim, at) {
  try {
    return !!dim.getBlock(at);
  } catch {
    return false;
  }
}

/**
 * The carts holding a stored record (stash or parcel): the ones put down before, or the structure's carts put down at
 * the player's feet now. A player just sent home can stand in chunks that aren't loaded yet, and a structure placed
 * there puts nothing down (without an error), so it's only placed where the chunk is loaded. The record is marked as
 * put down before the carts appear (never placed twice while they exist); one put down where the carts never
 * appeared is placed again, since the structure is only deleted once everything is handed over. Once its carts have been
 * found, `seen` is saved: a seen record whose carts are gone (broken, emptied) is never placed again, which would hand
 * the same items out twice, and resolves `null`. Any owned cart found, in any dimension, is used: fewer than `want`
 * is returned as is (the caller says so) and the structure is never placed over survivors.
 * Resolves the carts, `null` when the structure is missing, or `undefined` to try again later.
 * @template {{ id: string, tag: string, placed?: boolean, seen?: boolean, at?: { x: number, y: number, z: number, d: string } }} R
 * @param {Player} p @param {R} rec @param {(r: R) => void} save @param {number} want how many carts it has
 * @returns {Promise<import("@minecraft/server").Entity[] | null | undefined>}
 */
async function cartsOf(p, rec, save, want) {
  /** @param {string} d */
  const find = (d) => {
    try {
      return world.getDimension(d).getEntities({ tags: [rec.tag] });
    } catch {
      return [];
    }
  };
  /** @param {string} d */
  const look = async (d) => {
    let carts = find(d);
    for (let t = 0; t < 10 && carts.length < want; t++) {
      await wait(2);
      if (!p.isValid) return undefined;
      carts = find(d);
    }
    // A cart can take a tick or two longer than another to appear.
    if (carts.length) {
      await wait(2);
      if (!p.isValid) return undefined;
      const again = find(d);
      if (again.length > carts.length) carts = again;
    }
    return carts;
  };
  /**
   * The carts of one placing are used; copies in another dimension (an older version placed them with
   * world.structureManager.place(), which can put a structure's entities into the Overworld) are emptied and removed.
   * @param {string} keep
   */
  const dropStrays = (keep) => {
    for (const d of DIMS) if (d !== keep) for (const cart of find(d)) removeCart(cart);
  };
  if (rec.placed && rec.at) {
    let dim;
    try {
      dim = world.getDimension(rec.at.d);
    } catch {
      dim = undefined;
    }
    if (!dim || !loadedAt(dim, rec.at)) return undefined; // where they were put down isn't loaded: later
    const carts = await look(rec.at.d);
    if (!carts) return undefined;
    if (carts.length) {
      dropStrays(rec.at.d);
      if (!rec.seen) save({ ...rec, seen: true });
      return carts;
    }
    // Put down by an older version into the wrong dimension (the Overworld at the same spot) and loaded there: use those.
    for (const d of DIMS) {
      if (d === rec.at.d) continue;
      const there = find(d);
      if (there.length) {
        dropStrays(d);
        if (!rec.seen) save({ ...rec, seen: true });
        return there;
      }
    }
    if (rec.seen) return null;
  }
  if (!world.structureManager.get(rec.id)) return null;
  for (let t = 0; t < 20; t++) {
    if (!p.isValid) return undefined;
    const at = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
    if (loadedAt(p.dimension, at)) {
      const dim = p.dimension;
      // Marked before placing: if the carts appear and anything stops us, they're searched for, never placed twice.
      save({ ...rec, placed: true, at: { ...at, d: dim.id } });
      placeCarts(rec.id, dim, at);
      const carts = await look(dim.id);
      if (carts?.length) {
        dropStrays(dim.id);
        save({ ...rec, placed: true, seen: true, at: { ...at, d: dim.id } });
      }
      return carts?.length ? carts : undefined;
    }
    await wait(5);
  }
  return undefined;
}

const DIMS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

/**
 * Puts a stash's or parcel's carts down. world.structureManager.place() can put a structure's entities into the
 * Overworld at the same coordinates while a player is in the Nether or the End (BDS 1.26, as stash_bp found); the
 * structure command places them in the dimension it runs in.
 * @param {string} id @param {import("@minecraft/server").Dimension} dim @param {import("@minecraft/server").Vector3} at
 */
function placeCarts(id, dim, at) {
  try {
    dim.runCommand(`structure load "${id}" ${at.x} ${at.y} ${at.z} 0_degrees none true false`);
  } catch (e) {
    console.warn(`[expedition] structure load ${id}: ${e}`);
  }
}

/** Empties a cart and takes it away (remove() never drops what it holds). @param {import("@minecraft/server").Entity} cart */
function removeCart(cart) {
  try {
    cart.getComponent("minecraft:inventory")?.container?.clearAll();
    cart.remove();
  } catch {
    // gone
  }
}

/**
 * A stash or parcel cart that loads (an unloaded chunk until now) after its items were handed over, its structure
 * deleted: a copy left by an older version in the wrong dimension. Emptied and removed, so nobody loots it.
 * @param {import("@minecraft/server").Entity} entity
 */
export function dropStrayCart(entity) {
  if (entity.typeId !== "minecraft:chest_minecart") return;
  for (const tag of entity.getTags()) {
    const m = /^realm:exp_(stash|parcel)_(\d+)$/.exec(tag);
    if (m && !world.structureManager.get(`expedition:${m[1]}_${m[2]}`)) return removeCart(entity);
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
  const carts = await cartsOf(p, st, (r) => p.setDynamicProperty(STASH_PROP, JSON.stringify(r)), 2);
  if (carts === null) {
    console.warn(`[expedition] stash ${st.id} for ${p.name} is missing`);
    p.setDynamicProperty(STASH_PROP, undefined);
    p.sendMessage("§cYour stored items couldn't be found. Tell an operator.");
    return true;
  }
  if (!carts || !p.isValid) return false; // tried again in a moment, and when they next spawn
  const { inv, eq } = carried(p);
  let spilled = 0;
  /** @param {ItemStack} it @param {number} slot */
  const put = (it, slot) => {
    if (slot < 36 && inv && !inv.getItem(slot)) return inv.setItem(slot, it);
    if (slot >= 36 && eq && !eq.getEquipment(EQUIP[slot - 36]) && eq.setEquipment(EQUIP[slot - 36], it)) return;
    const rest = inv ? inv.addItem(it) : it; // addItem returns undefined when it all fit
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
        try {
          put(it, part * CART + k);
        } catch (e) {
          console.warn(`[expedition] stash item: ${e}`);
          p.dimension.spawnItem(it, p.location);
          spilled++;
        }
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
  if (carts.length < 2) p.sendMessage(`§cOnly ${carts.length} of 2 storage carts could be found, so some of your stored items are missing. Tell an operator.`);
  return true;
}

// ---------------------------------------------------------------------------
// Parcels: items owed to a player (treasure left in the chests, what they dropped dying), kept in a structure of
// chest minecarts like the stash, so a restart before the hand-off loses nothing
// ---------------------------------------------------------------------------

const PARCELS = "expedition:parcels:"; // + player id. world: JSON Parcel[]
const PARCEL_NEXT = "expedition:parcel_next"; // world: the next parcel number
const PARCEL_TAG = "realm:exp_parcel";

/** @typedef {{ id: string, tag: string, k: string, c?: number, placed?: boolean, seen?: boolean, at?: { x: number, y: number, z: number, d: string } }} Parcel k: what it holds ("spoils", "dropped"); c: its carts */

/** @param {string} owner @returns {Parcel[]} */
function parcelsOf(owner) {
  try {
    const raw = world.getDynamicProperty(PARCELS + owner);
    const v = typeof raw === "string" ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string" && typeof x.tag === "string") : [];
  } catch {
    return [];
  }
}
/** @param {string} owner @param {Parcel[]} list */
function setParcels(owner, list) {
  world.setDynamicProperty(PARCELS + owner, list.length ? JSON.stringify(list) : undefined);
}

/** Does this player have items waiting in a parcel? @param {string} owner */
export const hasParcels = (owner) => parcelsOf(owner).length > 0;

/**
 * Stores items for a player in a structure (chest minecarts made at `at`, an air pocket nobody can reach). Run
 * gear is left out. Returns false (and keeps nothing) when anything goes wrong: the caller then keeps the items.
 * @param {string} owner @param {string} kind @param {ItemStack[]} items @param {import("@minecraft/server").Dimension} dim @param {import("@minecraft/server").Vector3} at
 */
export function saveParcel(owner, kind, items, dim, at) {
  const keep = items.filter((it) => !isRunGear(it));
  if (!keep.length) return true;
  if (!saving) return false; // forgotten: the caller keeps the items
  const nRaw = world.getDynamicProperty(PARCEL_NEXT);
  const n = typeof nRaw === "number" ? nRaw : 1;
  world.setDynamicProperty(PARCEL_NEXT, n + 1);
  const id = `expedition:parcel_${n}`;
  const tag = `${PARCEL_TAG}_${n}`;
  /** @type {import("@minecraft/server").Entity[]} */
  const carts = [];
  try {
    for (let c = 0; c * CART < keep.length; c++) {
      const cart = spawnFresh(dim, "minecraft:chest_minecart", { x: at.x + 0.5, y: at.y, z: at.z + 0.5 });
      cart.addTag(PARCEL_TAG);
      cart.addTag(tag);
      carts.push(cart);
      const box = cart.getComponent("minecraft:inventory")?.container;
      if (!box) throw new Error("no cart inventory");
      for (let k = 0; k < CART && c * CART + k < keep.length; k++) box.setItem(k, keep[c * CART + k]);
    }
    world.structureManager.delete(id);
    world.structureManager.createFromWorld(id, dim, { x: at.x, y: at.y, z: at.z }, { x: at.x, y: at.y + 1, z: at.z }, { includeBlocks: false, includeEntities: true, saveMode: StructureSaveMode.World });
    if (!world.structureManager.get(id)) throw new Error("structure not saved");
    setParcels(owner, [...parcelsOf(owner), { id, tag, k: kind, c: carts.length }]);
    return true;
  } catch (e) {
    console.warn(`[expedition] parcel: ${e}`);
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
 * Gives a player every parcel waiting for them: into the inventory, or at their feet. Each parcel is marked as
 * placed before its carts appear, so it is never placed twice; a placed parcel whose carts are gone (taken apart
 * by someone) is forgotten once the player stands where it was placed. Returns the kinds handed over, with
 * whether anything spilled; resolves false when something must be tried again (when they next spawn).
 * @param {Player} p @returns {Promise<{ kinds: Set<string>, spilled: boolean } | false>}
 */
export async function openParcels(p) {
  if (opening.has(p.id)) return false; // already handing them over
  opening.add(p.id);
  try {
    return await handOver(p);
  } finally {
    opening.delete(p.id);
  }
}

/** Players whose parcels are being handed over right now. @type {Set<string>} */
const opening = new Set();

/** Is a parcel hand-over running (its carts may be standing, its structure still needed)? */
export const handingOver = () => opening.size > 0;

/** @param {Player} p @returns {Promise<{ kinds: Set<string>, spilled: boolean } | false>} */
async function handOver(p) {
  const kinds = new Set();
  let spilled = false;
  const sm = world.structureManager;
  for (const pc of parcelsOf(p.id)) {
    if (!p.isValid) return false;
    const carts = await cartsOf(p, pc, (r) => setParcels(p.id, parcelsOf(p.id).map((x) => (x.id === r.id ? r : x))), pc.c ?? 1);
    if (carts === null) {
      console.warn(`[expedition] parcel ${pc.id} for ${p.name} is missing`);
      setParcels(p.id, parcelsOf(p.id).filter((x) => x.id !== pc.id));
      continue;
    }
    if (!carts || !p.isValid) return false; // tried again in a moment, and when they next spawn
    const rec = pc;
    const inv = p.getComponent("minecraft:inventory")?.container;
    for (const cart of carts) {
      const box = cart.getComponent("minecraft:inventory")?.container;
      if (box)
        for (let k = 0; k < box.size; k++) {
          const it = box.getItem(k);
          if (!it) continue;
          box.setItem(k);
          try {
            const rest = inv ? inv.addItem(it) : it;
            if (rest) {
              p.dimension.spawnItem(rest, p.location);
              spilled = true;
            }
          } catch (e) {
            console.warn(`[expedition] parcel item: ${e}`);
            p.dimension.spawnItem(it, p.location);
            spilled = true;
          }
        }
      cart.remove();
    }
    setParcels(p.id, parcelsOf(p.id).filter((x) => x.id !== rec.id));
    try {
      sm.delete(rec.id);
    } catch {
      // already gone
    }
    kinds.add(rec.k);
    if (carts.length < (rec.c ?? 1)) p.sendMessage(`§cOnly ${carts.length} of ${rec.c} carts holding your items could be found, so some items are missing. Tell an operator.`);
  }
  return { kinds, spilled };
}
