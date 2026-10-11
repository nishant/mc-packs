// Small helpers shared by the Story Questlines modules. Imports nothing from the other modules.
import { CommandPermissionLevel, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { NPC_NAMES } from "./stories.js";

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("@minecraft/server").Dimension} Dimension */

export const PACK = "saga_bp";
export const OVERWORLD = "minecraft:overworld";
export const DIMENSIONS = [OVERWORLD, "minecraft:nether", "minecraft:the_end"];

/** "minecraft:iron_ingot" -> "Iron Ingot". @param {string} id */
export const itemName = (id) =>
  id
    .replace(/^minecraft:/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** @param {string} id */
export const npcName = (id) => NPC_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);

/** @param {string} dim */
export const dimName = (dim) => (dim === "minecraft:nether" ? "Nether" : dim === "minecraft:the_end" ? "End" : "Overworld");

/** @param {string} id @returns {Player | undefined} */
export const online = (id) => world.getAllPlayers().find((p) => p.id === id);

/** @param {Player} player */
export const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

/** @param {{ x: number, z: number }} a @param {{ x: number, z: number }} b */
export const across = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** @param {Vector3} a @param {Vector3} b */
export const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** "NE" for a step of dx east, dz south. @param {number} dx @param {number} dz */
export function compass(dx, dz) {
  const deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360 + 22.5) % 360;
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.floor(deg / 45) % 8];
}

/** Text without § codes. @param {string} s */
export const plain = (s) => s.replace(/§./g, "");

/** 1234 -> "1,234". @param {number} n */
export const num = (n) => Math.round(n).toLocaleString("en-US");

/** Seconds as "1:05", or "3 min" / "2 h" when long. @param {number} s */
export function clock(s) {
  const t = Math.max(0, Math.ceil(s));
  if (t >= 7200) return `${Math.round(t / 3600)} h`;
  if (t >= 600) return `${Math.round(t / 60)} min`;
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** Stable 32-bit hash (FNV-1a) of a string, for deterministic picks and short tags. @param {string} s */
export function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Sends a script event to other packs; nobody listening is fine. @param {string} id @param {object} msg */
export function send(id, msg) {
  try {
    system.sendScriptEvent(id, JSON.stringify(msg));
  } catch (e) {
    console.warn(`[saga] ${id}: ${e}`);
  }
}

/** @param {number} ticks */
export const wait = (ticks) => new Promise((r) => system.runTimeout(() => r(undefined), Math.max(1, Math.floor(ticks))));

/**
 * Shows a form, retrying while the player is busy (chat or another menu just closed).
 * @template {{ show(p: Player): Promise<any> }} F
 * @param {Player} player @param {F} form @returns {Promise<Awaited<ReturnType<F["show"]>> | undefined>}
 */
export async function show(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await wait(10);
  }
  return undefined;
}

/** Block-rounded coordinates "12 64 -300". @param {{ x: number, y?: number, z: number }} p */
export const coords = (p) => (p.y === undefined ? `${Math.floor(p.x)} ~ ${Math.floor(p.z)}` : `${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)}`);

/**
 * The first open spot to stand at x/z: near `yHint` (scanning a few blocks up and down) or on the
 * surface. Undefined when the column isn't loaded (and, with `strict`, when there is no open spot near
 * `yHint`: otherwise `yHint` itself).
 * @param {Dimension} dim @param {number} x @param {number} z @param {number} [yHint] @param {boolean} [strict]
 */
export function groundAt(dim, x, z, yHint, strict = false) {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  try {
    if (yHint !== undefined) {
      const y0 = Math.floor(yHint);
      for (let dy = 0; dy <= 6; dy++) {
        for (const y of dy === 0 ? [y0] : [y0 + dy, y0 - dy]) {
          const feet = dim.getBlock({ x: bx, y, z: bz });
          const head = dim.getBlock({ x: bx, y: y + 1, z: bz });
          const below = dim.getBlock({ x: bx, y: y - 1, z: bz });
          if (!feet || !head || !below) return undefined;
          if (open(feet) && open(head) && !open(below)) return y;
        }
      }
      return strict ? undefined : y0;
    }
    const top = dim.getTopmostBlock({ x: bx, z: bz });
    return top ? top.location.y + 1 : undefined;
  } catch {
    return undefined;
  }
}

/** Players in one of our dialogues (or a vision): one at a time. @type {Set<string>} */
export const busy = new Set();

/** Runs a dialogue unless the player is already in one. Returns false when they were busy. @param {Player} player @param {() => Promise<void>} fn */
export async function exclusive(player, fn) {
  if (busy.has(player.id)) return false;
  busy.add(player.id);
  try {
    await fn();
  } finally {
    busy.delete(player.id);
  }
  return true;
}

/**
 * Pages one at a time with "Next"; the last page has `buttons`. Returns the button picked on the
 * last page, or -1 when the player closed it.
 * @param {Player} player @param {string} title @param {string} header @param {string[]} pages @param {string[]} buttons
 */
export async function dialog(player, title, header, pages, buttons) {
  const list = pages.length ? pages : [""];
  for (let i = 0; i < list.length; i++) {
    const last = i === list.length - 1;
    const form = new ActionFormData().title(title).body(header ? `${header}\n\n${list[i]}` : list[i]);
    for (const b of last ? buttons : ["Next"]) form.button(b);
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined) return -1;
    if (last) return res.selection;
  }
  return -1;
}

/** Air, water or a plant you can walk through. @param {import("@minecraft/server").Block} b */
export function open(b) {
  if (b.isAir || b.isLiquid) return true;
  return /grass$|short_grass|tall_grass|fern|flower|tulip|poppy|dandelion|orchid|allium|bluet|daisy|cornflower|lily_of|sapling|vine|snow_layer|seagrass|kelp|torch|carpet|rail|button|lever|dead_bush|sweet_berry|mushroom$/.test(b.typeId);
}
