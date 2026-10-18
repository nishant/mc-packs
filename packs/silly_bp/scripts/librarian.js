import {
  EnchantmentType,
  Entity,
  EquipmentSlot,
  GameMode,
  ItemStack,
  Player,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { get } from "./settings.js";

export const PROP_LIB_BOOK = "silly:lib_book";
export const LOCKED_TAG = "realm:locked_librarian";

/** @typedef {{ id: string, level: number }} BookEnchant */
/** @typedef {{ enchants: BookEnchant[], sillyId?: string, label: string, emeralds: number }} BookSpec */
/** @typedef {{ id: string, name: string }} SillyEnchantLike */

const TREASURE_ENCHANTS = new Set([
  "mending",
  "frost_walker",
  "soul_speed",
  "swift_sneak",
  "wind_burst",
  "binding_curse",
  "vanishing_curse",
]);

const ROMAN = ["", "I", "II", "III", "IV", "V"];

/** @param {number} n */
const roman = (n) => ROMAN[n] ?? String(n);

/** @param {number} ticks */
const wait = (ticks) => new Promise((r) => system.runTimeout(() => r(undefined), ticks));

/** @param {string} id */
function formatEnchantId(id) {
  return id
    .replace(/^minecraft:/, "")
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Shows an ActionFormData popup, retrying if the player is busy.
 * @param {Player} player
 * @param {ActionFormData} form
 */
async function showForm(player, form) {
  for (let attempt = 0; attempt < 15; attempt++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await wait(10);
  }
  return undefined;
}

/**
 * Inspects an Enchanted Book for vanilla enchantments or a Silly Book enchantment.
 * @param {ItemStack | undefined} itemStack
 * @param {(item: ItemStack | undefined) => SillyEnchantLike | "random" | undefined} [bookOfFn]
 * @returns {BookSpec | undefined}
 */
export function inspectEnchantedBook(itemStack, bookOfFn) {
  if (!itemStack || itemStack.typeId !== "minecraft:enchanted_book") return undefined;
  /** @type {BookEnchant[]} */
  const enchants = [];
  try {
    const raw = itemStack.getComponent("minecraft:enchantable")?.getEnchantments() ?? [];
    for (const e of raw) {
      const id = String(e.type?.id ?? "").replace(/^minecraft:/, "");
      const level = Math.max(1, Math.floor(Number(e.level) || 1));
      if (id) enchants.push({ id, level });
    }
  } catch {
    // unreadable enchantments
  }
  const silly = bookOfFn ? bookOfFn(itemStack) : undefined;
  const sillyEnchant = silly && silly !== "random" ? silly : undefined;
  if (!enchants.length && !sillyEnchant) return undefined;

  /** @type {string[]} */
  const parts = [];
  let cost = 0;
  for (const e of enchants) {
    parts.push(`${formatEnchantId(e.id)} ${roman(e.level)}`);
    cost += TREASURE_ENCHANTS.has(e.id) ? 6 + e.level * 4 : 5 + e.level * 3;
  }
  if (sillyEnchant) {
    parts.push(`Silly: ${sillyEnchant.name}`);
    cost += 12;
  }
  const emeralds = Math.min(64, Math.max(5, cost));
  return {
    enchants,
    ...(sillyEnchant ? { sillyId: sillyEnchant.id } : {}),
    label: parts.join(", "),
    emeralds,
  };
}

/**
 * Reads the locked BookSpec stored on a villager entity, if any.
 * @param {Entity} target
 * @returns {BookSpec | undefined}
 */
export function readLockedSpec(target) {
  try {
    const raw = target.getDynamicProperty(PROP_LIB_BOOK);
    if (typeof raw !== "string" || !raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.label !== "string" || typeof parsed.emeralds !== "number") {
      return undefined;
    }
    return /** @type {BookSpec} */ (parsed);
  } catch {
    return undefined;
  }
}

/**
 * Converts and locks a villager into a Novice Librarian trading `spec`.
 * @param {Entity} target
 * @param {BookSpec} spec
 */
export function lockVillagerToBook(target, spec) {
  try {
    target.triggerEvent("minecraft:become_librarian");
  } catch {
    // ignore if unavailable
  }
  target.setDynamicProperty(PROP_LIB_BOOK, JSON.stringify(spec));
  target.addTag(LOCKED_TAG);
  target.nameTag = `§bLibrarian §7(${spec.label})`;
  try {
    const loc = target.location;
    const dim = target.dimension;
    dim.spawnParticle("minecraft:villager_happy", { x: loc.x, y: loc.y + 1.5, z: loc.z });
    dim.playSound("random.levelup", loc, { volume: 0.9, pitch: 1.2 });
    dim.playSound("mob.villager.yes", loc, { volume: 1.0, pitch: 1.0 });
  } catch {
    // unloaded
  }
}

/**
 * @param {import("@minecraft/server").Container} inv
 * @param {string} typeId
 */
function countItem(inv, typeId) {
  let total = 0;
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (it && it.typeId === typeId) total += it.amount;
  }
  return total;
}

/**
 * @param {import("@minecraft/server").Container} inv
 * @param {string} typeId
 * @param {number} amount
 */
function deductItem(inv, typeId, amount) {
  let rem = amount;
  for (let i = 0; i < inv.size && rem > 0; i++) {
    const it = inv.getItem(i);
    if (!it || it.typeId !== typeId) continue;
    if (it.amount > rem) {
      it.amount -= rem;
      inv.setItem(i, it);
      rem = 0;
    } else {
      rem -= it.amount;
      inv.setItem(i, undefined);
    }
  }
}

/**
 * Builds an Enchanted Book stack matching `spec`.
 * @param {BookSpec} spec
 * @param {(sillyId: string) => ItemStack | undefined} [makeSillyBookFn]
 */
function createLockedBookStack(spec, makeSillyBookFn) {
  const stack = (spec.sillyId && makeSillyBookFn ? makeSillyBookFn(spec.sillyId) : undefined) ?? new ItemStack("minecraft:enchanted_book", 1);
  if (Array.isArray(spec.enchants) && spec.enchants.length > 0) {
    const enchComp = stack.getComponent("minecraft:enchantable");
    if (enchComp) {
      for (const e of spec.enchants) {
        try {
          enchComp.addEnchantment({ type: new EnchantmentType(e.id), level: e.level });
        } catch {
          // ignore invalid enchantment id
        }
      }
    }
  }
  return stack;
}

/**
 * Prompts the player to convert a villager into a Novice Librarian locked to `spec`.
 * @param {Player} player
 * @param {Entity} target
 * @param {BookSpec} spec
 */
export async function promptConvertLibrarian(player, target, spec) {
  player.sendMessage(
    `§e[Librarian] §fConvert this villager into a Novice Librarian locked to §b${spec.label}§f (§a${spec.emeralds} Emeralds + 1 Book§f)? Confirm in the popup.`,
  );
  const form = new ActionFormData()
    .title("§lConvert to Novice Librarian?")
    .body(
      `Lock this villager as a §bNovice Librarian§r who always trades:\n\n  §e${spec.emeralds} Emeralds + 1 Book §7-> §bEnchanted Book (${spec.label})§r\n\n§7Your Enchanted Book stays in your hand - they copy its enchantment into their trade ledger.`,
    )
    .button(`Convert & Lock: ${spec.label}\n§8${spec.emeralds} Emeralds + 1 Book (Novice)`)
    .button("Keep Normal Villager\n§8Do not convert");

  const res = await showForm(player, form);
  if (!res || res.canceled || res.selection !== 0 || !target.isValid) return;
  lockVillagerToBook(target, spec);
  player.sendMessage(
    `§a[Librarian] This villager is now a Novice Librarian locked to §b${spec.label}§a (§e${spec.emeralds} Emeralds + 1 Book§a)! Right-click them anytime to trade.`,
  );
}

/**
 * Opens the locked Novice Librarian trade menu for `target`.
 * @param {Player} player
 * @param {Entity} target
 * @param {(sillyId: string) => ItemStack | undefined} [makeSillyBookFn]
 */
export async function openLockedLibrarianTrade(player, target, makeSillyBookFn) {
  const spec = readLockedSpec(target);
  if (!spec) return;
  try {
    if (!target.matches({ families: ["librarian"] })) target.triggerEvent("minecraft:become_librarian");
  } catch {
    // ignore
  }
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv) return;
  const emeralds = countItem(inv, "minecraft:emerald");
  const books = countItem(inv, "minecraft:book");

  const form = new ActionFormData()
    .title(`§lLibrarian - ${spec.label}`)
    .body(
      `§7Novice Librarian Trade (Locked):§r\n  §a${spec.emeralds} Emeralds §7+ §f1 Book §7-> §bEnchanted Book (${spec.label})§r\n\n§7Your inventory: §a${emeralds} Emeralds§7, §f${books} Books`,
    )
    .button(`Trade 1x ${spec.label}\n§8Costs ${spec.emeralds} Emeralds + 1 Book`)
    .button(`Trade 4x ${spec.label}\n§8Costs ${spec.emeralds * 4} Emeralds + 4 Books`)
    .button("Close");

  const res = await showForm(player, form);
  if (!res || res.canceled || (res.selection !== 0 && res.selection !== 1) || !player.isValid || !target.isValid) return;

  const qty = res.selection === 0 ? 1 : 4;
  const emeraldCost = spec.emeralds * qty;
  const bookCost = qty;
  const currentInv = player.getComponent("minecraft:inventory")?.container;
  if (!currentInv) return;

  const haveEmeralds = countItem(currentInv, "minecraft:emerald");
  const haveBooks = countItem(currentInv, "minecraft:book");
  let creative = false;
  try {
    creative = player.getGameMode() === GameMode.Creative;
  } catch {
    creative = false;
  }

  if ((haveEmeralds < emeraldCost || haveBooks < bookCost) && !creative) {
    player.sendMessage(`§c[Librarian] You need ${emeraldCost} Emeralds and ${bookCost} Book(s) for that trade.`);
    try {
      target.dimension.playSound("mob.villager.no", target.location, { volume: 1.0, pitch: 1.0 });
    } catch {
      // unloaded
    }
    return;
  }

  deductItem(currentInv, "minecraft:emerald", emeraldCost);
  deductItem(currentInv, "minecraft:book", bookCost);

  for (let i = 0; i < qty; i++) {
    const stack = createLockedBookStack(spec, makeSillyBookFn);
    const rest = currentInv.addItem(stack);
    if (rest) player.dimension.spawnItem(rest, player.location);
  }

  try {
    const loc = target.location;
    const dim = target.dimension;
    dim.playSound("mob.villager.yes", loc, { volume: 1.0, pitch: 1.0 });
    dim.playSound("random.orb", loc, { volume: 0.8, pitch: 1.2 });
    dim.spawnParticle("minecraft:villager_happy", { x: loc.x, y: loc.y + 1.5, z: loc.z });
  } catch {
    // unloaded
  }
  player.sendMessage(
    `§a[Librarian] Traded §e${emeraldCost} Emeralds + ${bookCost} Book(s)§a for §b${qty}x Enchanted Book (${spec.label})§a!`,
  );
}

/** @type {Set<string>} */
const activePrompts = new Set();

/**
 * Handles a player interacting with a villager (returns true when handled so beforeEvents can cancel vanilla interaction).
 * @param {Player} player
 * @param {Entity | undefined} target
 * @param {ItemStack | undefined} [itemStack]
 * @param {{
 *   bookOf?: (item: ItemStack | undefined) => SillyEnchantLike | "random" | undefined,
 *   makeBookById?: (sillyId: string) => ItemStack | undefined,
 * }} [hooks]
 * @returns {boolean}
 */
export function handleVillagerInteract(player, target, itemStack, hooks = {}) {
  if (get("librarianBookLock") === false) return false;
  if (
    !player?.isValid ||
    !target?.isValid ||
    target.typeId !== "minecraft:villager_v2" ||
    target.hasTag("realm:npc") ||
    target.getComponent("minecraft:is_baby")
  ) {
    return false;
  }

  const { bookOf: bookOfFn, makeBookById } = hooks;
  const heldItem =
    itemStack ??
    player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand) ??
    player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex);

  const bookSpec = inspectEnchantedBook(heldItem, bookOfFn);
  const lockedSpec = readLockedSpec(target);
  const isLocked = target.hasTag(LOCKED_TAG) || !!lockedSpec;

  if (bookSpec && (!isLocked || lockedSpec?.label !== bookSpec.label || player.isSneaking)) {
    if (!activePrompts.has(player.id)) {
      activePrompts.add(player.id);
      system.run(() => {
        promptConvertLibrarian(player, target, bookSpec).finally(() => activePrompts.delete(player.id));
      });
    }
    return true;
  }

  if (isLocked && lockedSpec) {
    if (!activePrompts.has(player.id)) {
      activePrompts.add(player.id);
      system.run(() => {
        openLockedLibrarianTrade(player, target, makeBookById).finally(() => activePrompts.delete(player.id));
      });
    }
    return true;
  }

  return false;
}

/**
 * Registers the right-click villager Enchanted Book lock and trade handler.
 * @param {{
 *   bookOf?: (item: ItemStack | undefined) => SillyEnchantLike | "random" | undefined,
 *   makeBookById?: (sillyId: string) => ItemStack | undefined,
 * }} [hooks]
 */
export function initLibrarianBookLock(hooks = {}) {
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (ev.cancel) return; // another pack refused the tap
    try {
      if (handleVillagerInteract(ev.player, ev.target, ev.itemStack, hooks)) {
        ev.cancel = true;
      }
    } catch (e) {
      console.warn(`[silly] librarian: ${e}`);
    }
  });

  // Headless BDS test hook: SimulatedPlayer.interactWithEntity returns false on villager_v2 when holding an Enchanted Book.
  system.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "realm:silly_villager_interact") return;
      try {
        const req = JSON.parse(message);
        const player = world.getAllPlayers().find((p) => p.id === req?.player || p.name === req?.player);
        const target = typeof req?.target === "string" ? world.getEntity(req.target) : undefined;
        if (player && target) handleVillagerInteract(player, target, undefined, hooks);
      } catch (e) {
        console.warn(`[silly] librarian scriptevent: ${e}`);
      }
    },
    { namespaces: ["realm"] },
  );
}
