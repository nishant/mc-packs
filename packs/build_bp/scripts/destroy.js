// Destroy mode for Easy Building: breaking a block with a pickaxe, axe or shovel breaks the whole shape
// there. In survival every block needs the right tool, drops land at your feet (Fortune and Silk Touch
// count), and the tool wears out (Unbreaking counts), with a spare of the same kind swapped in.
import { Dimension, ItemStack, Player, system, world } from "@minecraft/server";
import { ActionFormData, MessageFormData } from "@minecraft/server-ui";
import { get, getFor } from "./settings.js";
import { drawGuide } from "./guides.js";
import { remember } from "./undo.js";

/** @type {import("./main.js").Ctx} */
let ctx;
/** @param {import("./main.js").Ctx} c */
export function setupDestroy(c) {
  ctx = c;
}

/** @typedef {{ x: number, y: number, z: number }} Vec */

// ---------------------------------------------------------------------------
// Tools and drops
// ---------------------------------------------------------------------------

/** The block tag each tool kind breaks; blocks with none of these break with any tool. */
const KIND_TAG = {
  pickaxe: "minecraft:is_pickaxe_item_destructible",
  axe: "minecraft:is_axe_item_destructible",
  shovel: "minecraft:is_shovel_item_destructible",
};
const TOOL_TAGS = Object.values(KIND_TAG);
/** @type {Record<string, number>} */
const TIER = { wooden: 0, golden: 0, stone: 1, copper: 1, iron: 2, diamond: 3, netherite: 3 };
/** Block tags that need a better pickaxe. */
const NEEDS = /** @type {[string, number][]} */ ([
  ["minecraft:diamond_tier_destructible", 3],
  ["minecraft:iron_tier_destructible", 2],
  ["minecraft:stone_tier_destructible", 1],
]);
const TOOL = /^minecraft:(wooden|golden|stone|copper|iron|diamond|netherite)_(pickaxe|axe|shovel)$/;

/** @param {string | undefined} id @returns {{ kind: "pickaxe" | "axe" | "shovel", tier: number } | undefined} */
function toolOf(id) {
  const m = TOOL.exec(id ?? "");
  return m ? { kind: /** @type {"pickaxe" | "axe" | "shovel"} */ (m[2]), tier: TIER[m[1]] ?? 0 } : undefined;
}

/** Can this tool break the block in survival? @param {string[]} tags @param {{ kind: "pickaxe" | "axe" | "shovel", tier: number }} tool */
function suits(tags, tool) {
  if (TOOL_TAGS.some((t) => tags.includes(t)) && !tags.includes(KIND_TAG[tool.kind])) return false;
  if (tool.kind === "pickaxe") for (const [tag, tier] of NEEDS) if (tags.includes(tag) && tool.tier < tier) return false;
  return true;
}

const rand = (/** @type {number} */ lo, /** @type {number} */ hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
/**
 * Ores: what they drop (Fortune multiplies it, or adds for redstone) and the experience they give.
 * Other blocks drop what the game drops for them (`/setblock ... destroy`), which Fortune doesn't change.
 * @type {Record<string, { item: string, n: () => number, xp: () => number, add?: boolean }>}
 */
const ORES = {};
for (const [ore, item, n, xp, add] of /** @type {[string, string, () => number, () => number, boolean?][]} */ ([
  ["coal_ore", "minecraft:coal", () => 1, () => rand(0, 2)],
  ["iron_ore", "minecraft:raw_iron", () => 1, () => 0],
  ["copper_ore", "minecraft:raw_copper", () => rand(2, 5), () => 0],
  ["gold_ore", "minecraft:raw_gold", () => 1, () => 0],
  ["diamond_ore", "minecraft:diamond", () => 1, () => rand(3, 7)],
  ["emerald_ore", "minecraft:emerald", () => 1, () => rand(3, 7)],
  ["lapis_ore", "minecraft:lapis_lazuli", () => rand(4, 9), () => rand(2, 5)],
  ["redstone_ore", "minecraft:redstone", () => rand(4, 5), () => rand(1, 5), true],
  ["lit_redstone_ore", "minecraft:redstone", () => rand(4, 5), () => rand(1, 5), true],
])) {
  ORES[`minecraft:${ore}`] = ORES[`minecraft:deepslate_${ore}`] = { item, n, xp, add };
}
ORES["minecraft:lit_deepslate_redstone_ore"] = ORES["minecraft:lit_redstone_ore"];
ORES["minecraft:quartz_ore"] = { item: "minecraft:quartz", n: () => 1, xp: () => rand(2, 5) };
ORES["minecraft:nether_gold_ore"] = { item: "minecraft:gold_nugget", n: () => rand(2, 6), xp: () => rand(0, 1) };

/** An ore's drop count with Fortune. @param {{ n: () => number, add?: boolean }} ore @param {number} fortune */
function oreCount(ore, fortune) {
  const n = ore.n();
  if (fortune <= 0) return n;
  if (ore.add) return n + rand(0, fortune);
  return n * Math.max(1, rand(0, fortune + 1));
}

/** @param {ItemStack} item @param {string} id */
function enchant(item, id) {
  try {
    return item.getComponent("minecraft:enchantable")?.getEnchantment(id)?.level ?? 0;
  } catch {
    return 0;
  }
}

/** Items lying in a box. @param {Dimension} dim @param {Vec} min @param {Vec} max */
function itemsIn(dim, min, max) {
  const c = { x: (min.x + max.x + 1) / 2, y: (min.y + max.y + 1) / 2, z: (min.z + max.z + 1) / 2 };
  const r = Math.hypot(max.x - min.x + 3, max.y - min.y + 3, max.z - min.z + 3) / 2;
  try {
    return dim
      .getEntities({ type: "minecraft:item", location: c, maxDistance: r })
      .filter((e) => e.location.x >= min.x - 1 && e.location.x <= max.x + 2 && e.location.y >= min.y - 1 && e.location.y <= max.y + 2 && e.location.z >= min.z - 1 && e.location.z <= max.z + 2);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Destroying
// ---------------------------------------------------------------------------

/** @type {Map<string, { on: boolean, start?: { dim: string } & Vec }>} */
const states = new Map();
/** @param {Player} player */
function stateOf(player) {
  let s = states.get(player.id);
  if (!s) states.set(player.id, (s = { on: false }));
  return s;
}

const LIQUID = /^minecraft:(flowing_)?(water|lava)$/;
/**
 * Blocks Silk Touch doesn't simply drop as themselves (budding amethyst and infested blocks drop nothing,
 * a double slab drops two slabs): these drop what the game drops for them instead. Doors and tall flowers
 * too, so both halves drop one item.
 */
const NO_SILK = /^minecraft:(budding_amethyst|infested_.*|.*double_.*slab.*|chorus_plant|frosted_ice)$/;

/**
 * Breaks these blocks: survival needs the right tool for each, drops land at your feet, the tool wears.
 * @param {Player} player @param {Dimension} dim @param {Vec[]} spots @param {string} label
 * @returns {Promise<boolean>} whether anything broke
 */
async function destroyCells(player, dim, spots, label) {
  const s = ctx.stateOf(player);
  if (s.busy) {
    ctx.note(player, "§eStill working on the last one...");
    return false;
  }
  if (ctx.cantBuild(player)) {
    player.sendMessage(ctx.CANT_BUILD);
    return false;
  }
  if (!spots.length) return false;
  const creative = ctx.isCreative(player);
  const limit = ctx.limitOf(player);
  if (spots.length > limit) {
    player.sendMessage(`§eThat's ${spots.length} blocks; the most destroy mode can break at once is ${limit}${creative ? "" : " in survival"}. Make the shape smaller.`);
    return false;
  }
  const container = ctx.containerOf(player);
  const slot = player.selectedSlotIndex;
  let tool = creative ? undefined : container?.getItem(slot);
  let kind = toolOf(tool?.typeId);
  if (!creative && (!tool || !kind)) {
    player.sendMessage("§eHold a pickaxe, axe or shovel to destroy blocks in survival.");
    return false;
  }
  const { min, max } = ctx.boundsOf(spots);
  const pid = player.id;
  s.busy = true;
  try {
    const why = await ctx.areaRefusal(player, dim, min, max, "break blocks");
    if (!player.isValid) return false;
    if (why) {
      player.sendMessage(`§e${why}`);
      return false;
    }
    const range = dim.heightRange;
    const perTick = Math.max(10, Math.floor(get("blocksPerTick") / 4));
    const before = new Set(itemsIn(dim, min, max).map((e) => e.id));
    const air = ctx.AIR();
    /** @type {import("./undo.js").Placed[]} */
    const placed = [];
    /** @type {Map<string, number>} drops from ores and Silk Touch */
    const drops = new Map();
    let xp = 0, wrongTool = 0, kept = 0, toolGone = false;
    /** @type {Set<string>} spots already broken (a door's other half counts) */
    const done = new Set();
    let silk = 0, fortune = 0, unbreaking = 0;
    const readEnchants = () => {
      if (!tool) return;
      silk = enchant(tool, "silk_touch");
      fortune = enchant(tool, "fortune");
      unbreaking = Math.min(3, enchant(tool, "unbreaking"));
    };
    readEnchants();
    const gather = () => {
      // The game's drops: to the player's feet.
      if (!player.isValid) return;
      for (const e of itemsIn(dim, min, max)) {
        if (before.has(e.id)) continue;
        before.add(e.id);
        try {
          e.teleport(player.location, { dimension: player.dimension });
        } catch {
          // gone
        }
      }
    };
    // Wears the tool by one use; when it breaks, a spare of the same kind takes its place.
    const wear = () => {
      if (!tool || !container) return;
      const dur = tool.getComponent("minecraft:durability");
      if (!dur) return;
      let chance = 100;
      try {
        chance = dur.getDamageChance(unbreaking);
      } catch {
        chance = 100 / (unbreaking + 1);
      }
      if (Math.random() * 100 >= chance) return;
      if (dur.damage + 1 < dur.maxDurability) {
        dur.damage += 1;
        return;
      }
      const broken = tool.typeId;
      container.setItem(slot);
      tool = undefined;
      try {
        player.playSound("random.break");
      } catch {
        // no sound
      }
      // A spare: the same tool first, then any tool of the same kind.
      const want = toolOf(broken);
      let spare = -1;
      for (let i = 0; i < container.size && spare < 0; i++) if (i !== slot && container.getItem(i)?.typeId === broken) spare = i;
      for (let i = 0; i < container.size && spare < 0; i++) if (i !== slot && toolOf(container.getItem(i)?.typeId)?.kind === want?.kind) spare = i;
      if (spare < 0) {
        toolGone = true;
        return;
      }
      tool = container.getItem(spare);
      container.setItem(spare);
      container.setItem(slot, tool);
      kind = toolOf(tool?.typeId);
      readEnchants();
      ctx.note(player, `§7Your ${ctx.nice(broken)} broke; swapped in another one.`);
    };
    for (let i = 0; i < spots.length && !toolGone; i++) {
      if (i && i % perTick === 0) {
        if (tool && container) container.setItem(slot, tool);
        gather();
        await ctx.tick();
        if (!player.isValid) break;
        // The tool moved or changed (the player swapped it): stop.
        if (!creative && (!container || container.getItem(slot)?.typeId !== tool?.typeId)) {
          toolGone = true;
          break;
        }
        tool = creative ? undefined : container?.getItem(slot);
      }
      const c = spots[i];
      if (c.y < range.min || c.y >= range.max) continue;
      let block;
      try {
        block = dim.getBlock(c);
      } catch {
        block = undefined;
      }
      if (!block || block.isAir) continue;
      const id = block.typeId;
      if (LIQUID.test(id) || ctx.isProtectedBlock(id)) {
        kept++;
        continue;
      }
      const was = block.permutation;
      // A door or tall flower: its other half goes with it, so undo puts back both halves.
      const half = was.getState("upper_block_bit");
      /** @type {{ x: number, y: number, z: number, perm: import("@minecraft/server").BlockPermutation } | undefined} */
      let other;
      if (half !== undefined) {
        try {
          const o = dim.getBlock({ x: c.x, y: c.y + (half ? -1 : 1), z: c.z });
          if (o?.typeId === id) other = { x: o.location.x, y: o.location.y, z: o.location.z, perm: o.permutation };
        } catch {
          other = undefined;
        }
      }
      /** The other half, once it is gone too. */
      const otherGone = () => {
        if (!other || done.has(`${other.x},${other.y},${other.z}`)) return undefined;
        try {
          if (!dim.getBlock(other)?.isAir) return undefined;
        } catch {
          return undefined;
        }
        const cost = creative ? undefined : ctx.costOf(other.perm);
        return { x: other.x, y: other.y, z: other.z, before: other.perm, after: air, ...(cost ? { cost } : {}) };
      };
      if (!creative) {
        if (!kind || !suits(block.getTags(), kind)) {
          wrongTool++;
          continue;
        }
        const ore = ORES[id];
        try {
          if (silk > 0 && half === undefined && !NO_SILK.test(id)) {
            const item = block.getItemStack(1);
            block.setPermutation(air);
            if (item) drops.set(item.typeId, (drops.get(item.typeId) ?? 0) + 1);
          } else if (ore) {
            block.setPermutation(air);
            drops.set(ore.item, (drops.get(ore.item) ?? 0) + oreCount(ore, fortune));
            xp += ore.xp();
          } else {
            dim.runCommand(`setblock ${c.x} ${c.y} ${c.z} air destroy`);
          }
        } catch {
          continue;
        }
        wear();
        const cost = ctx.costOf(was);
        placed.push({ x: c.x, y: c.y, z: c.z, before: was, after: air, ...(cost ? { cost } : {}) });
      } else {
        try {
          block.setPermutation(air);
        } catch {
          continue;
        }
        placed.push({ x: c.x, y: c.y, z: c.z, before: was, after: air });
      }
      done.add(`${c.x},${c.y},${c.z}`);
      const gone = otherGone();
      if (gone) {
        placed.push(gone);
        done.add(`${gone.x},${gone.y},${gone.z}`);
      }
    }
    if (tool && container && !toolGone) {
      try {
        container.setItem(slot, tool);
      } catch {
        // the player left
      }
    }
    await ctx.tick();
    gather();
    if (player.isValid) {
      for (const [id, n] of drops) {
        let left = n;
        while (left > 0) {
          try {
            const stack = new ItemStack(id, 1);
            stack.amount = Math.min(left, stack.maxAmount);
            left -= stack.amount;
            player.dimension.spawnItem(stack, player.location);
          } catch {
            break;
          }
        }
      }
      if (xp > 0) player.addExperience(xp);
    } else if (drops.size) ctx.refund(player, pid, drops);
    if (placed.length) remember(player, { dim: dim.id, label, kind: "destroy", cells: placed, ...(creative ? {} : { inv: true }) });
    if (!player.isValid) return placed.length > 0;
    const notes = [];
    if (wrongTool) notes.push(`${wrongTool} ${wrongTool === 1 ? "block needs" : "blocks need"} another tool`);
    if (kept) notes.push(`${kept} protected or liquid ${kept === 1 ? "block" : "blocks"}`);
    if (placed.length) ctx.note(player, `§aDestroyed ${ctx.plural(placed.length, "block")}§7 - /realm:build_undo puts them back`);
    else player.sendMessage(`§eNothing was broken${notes.length ? `: ${notes.join(", ")}` : ""}.`);
    if (toolGone && player.isValid) player.sendMessage("§eYour tool broke (or left your hand) and there was no spare, so destroy mode stopped there.");
    if (placed.length && notes.length) player.sendMessage(`§7Skipped ${notes.join(", ")}.`);
    return placed.length > 0;
  } finally {
    s.busy = false;
  }
}

/** The block the player looks at. @param {Player} player */
function lookBlock(player) {
  try {
    const hit = player.getBlockFromViewDirection({ maxDistance: ctx.reachOf(player), includeLiquidBlocks: false, includePassableBlocks: true });
    return hit ? { x: hit.block.location.x, y: hit.block.location.y, z: hit.block.location.z } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The spots the player's shape covers at T (two-block mode: between the start block and T).
 * @param {Player} player @param {Vec} T @returns {Vec[] | string} the spots, or why not
 */
function spotsAt(player, T) {
  const st = stateOf(player);
  try {
    if (ctx.twoBlocks(player)) {
      if (!st.start || st.start.dim !== player.dimension.id) return "start";
      const span = Math.max(Math.abs(T.x - st.start.x), Math.abs(T.y - st.start.y), Math.abs(T.z - st.start.z)) + 1;
      if (span > get("maxSize")) return `Those blocks are ${span} apart; a shape can be at most ${get("maxSize")} blocks each way.`;
      return ctx.shapeAt(player, st.start, T);
    }
    return ctx.shapeAt(player, T);
  } catch (e) {
    if (e instanceof ctx.TooBig) return ctx.tooBig(player, e).replace(/^§e/, "");
    throw e;
  }
}

/** Is destroy mode on (breaking with a tool breaks the shape)? @param {Player} player */
export const isDestroying = (player) => !!states.get(player.id)?.on && get("destroyMode") === true;

world.afterEvents.playerBreakBlock.subscribe(({ player, block, itemStackBeforeBreak }) => {
  const st = states.get(player.id);
  if (!st?.on || player.isSneaking || ctx.refusal(player) || get("destroyMode") !== true) return;
  if (!toolOf(itemStackBeforeBreak?.typeId)) return;
  if (ctx.stateOf(player).busy) return ctx.note(player, "§eStill working on the last one...");
  const T = { x: block.location.x, y: block.location.y, z: block.location.z };
  const dim = block.dimension;
  const two = ctx.twoBlocks(player);
  if (two && (!st.start || st.start.dim !== dim.id)) {
    st.start = { dim: dim.id, ...T };
    ctx.note(player, "§cStart set§7 - now break the end block (sneak to break normally)", 80);
    return;
  }
  const spots = spotsAt(player, T);
  const start = st.start;
  st.start = undefined;
  if (typeof spots === "string") return player.sendMessage(`§e${spots}`);
  // The block (or blocks) the player broke by hand are already gone.
  const rest = spots.filter((p) => !(p.x === T.x && p.y === T.y && p.z === T.z) && !(start && p.x === start.x && p.y === start.y && p.z === start.z));
  destroyCells(player, dim, rest, `Destroy: ${ctx.planLabel(ctx.planOf(player))}`).catch((e) => console.warn(`[build] destroy: ${e}`));
});

// ---------------------------------------------------------------------------
// The outline of what breaking would break
// ---------------------------------------------------------------------------

/** @type {Map<string, { key: string, rel: Vec[] }>} */
const relCache = new Map();
system.runInterval(() => {
  for (const [pid, st] of states) {
    if (!st.on) continue;
    const player = world.getEntity(pid);
    if (!(player instanceof Player) || !player.isValid) continue;
    try {
      if (getFor(player, "destroyPreview") !== true || ctx.refusal(player)) continue;
      if (!toolOf(ctx.containerOf(player)?.getItem(player.selectedSlotIndex)?.typeId)) continue;
      const T = lookBlock(player);
      if (!T) continue;
      /** @type {Vec[]} */
      let cells;
      /** @type {Vec | undefined} */
      let offset;
      if (ctx.twoBlocks(player)) {
        const got = st.start ? spotsAt(player, T) : [T];
        if (typeof got === "string") continue;
        cells = got;
      } else if (ctx.modsActive(player)) {
        // Modifier copies turn around a fixed center, so the layout can't simply move with T.
        const got = spotsAt(player, T);
        if (typeof got === "string") continue;
        cells = got;
      } else {
        const key = JSON.stringify(ctx.planOf(player)) + ctx.facingOf(player).join() + ctx.limitOf(player);
        let c = relCache.get(pid);
        if (!c || c.key !== key) {
          const got = spotsAt(player, { x: 0, y: 0, z: 0 });
          c = { key, rel: typeof got === "string" ? [] : got };
          relCache.set(pid, c);
        }
        // The same list every time, moved to T: its outline is worked out once, not at every refresh.
        cells = c.rel;
        offset = T;
      }
      drawGuide(player, cells, "destroy", { offset, every: 10 });
    } catch (e) {
      console.warn(`[build] destroy preview: ${e}`);
    }
  }
}, 10);

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  states.delete(playerId);
  relCache.delete(playerId);
});

// ---------------------------------------------------------------------------
// Menu and command
// ---------------------------------------------------------------------------

/** /realm:build_destroy @param {Player} player */
export function toggleDestroy(player) {
  if (get("destroyMode") !== true) return player.sendMessage("§eDestroy mode is disabled on this realm. An operator can enable it in /realm:config (Easy Building).");
  const st = stateOf(player);
  st.on = !st.on;
  st.start = undefined;
  return ctx.noted(player, st.on ? "§cDestroy mode on:§7 breaking a block with a pickaxe, axe or shovel breaks your shape (sneak: just one)" : "§7Destroy mode off: blocks break one at a time");
}

/** Destroy at the block you look at: outline, then confirm. For the menu: why not, undefined if canceled, ctx.CLOSE otherwise. @param {Player} player */
async function destroyHere(player) {
  const T = lookBlock(player);
  if (!T) return `§eLook at a block within ${ctx.reachOf(player)} blocks first (close this menu, look, and pick Destroy here now again).`;
  const st = stateOf(player);
  if (ctx.twoBlocks(player) && (!st.start || st.start.dim !== player.dimension.id)) {
    st.start = { dim: player.dimension.id, ...T };
    ctx.note(player, "§cStart set§7 - now look at the end block and pick Destroy here now again", 80);
    return ctx.CLOSE;
  }
  const spots = spotsAt(player, T);
  st.start = undefined;
  if (typeof spots === "string") return `§e${spots}`;
  const secs = Math.max(0, get("previewSeconds"));
  for (let t = 0; t < secs * 2; t++) {
    if (!player.isValid) return ctx.CLOSE;
    drawGuide(player, spots, "destroy", { preview: true, every: 10 });
    await new Promise((r) => system.runTimeout(() => r(undefined), 10));
  }
  const survival = !ctx.isCreative(player);
  const body = [
    `Break up to ${ctx.plural(spots.length, "block")} at ${T.x} ${T.y} ${T.z}?`,
    survival ? "Only blocks your tool can break. Drops land at your feet, and the tool wears out." : "Creative: no drops.",
    "Chests, signs and other protected blocks stay.",
  ].join("\n");
  const res = await ctx.show(player, new MessageFormData().title("Destroy").body(body).button1("Break them").button2("Cancel"));
  if (!res || !player.isValid) return ctx.CLOSE;
  if (res.canceled || res.selection !== 0) return undefined;
  await destroyCells(player, player.dimension, spots, `Destroy: ${ctx.planLabel(ctx.planOf(player))}`);
  return ctx.CLOSE;
}

/**
 * /realm:build -> Destroy mode. It stays open until its X (ctx.CLOSE: everything closes) or Back (undefined), or
 * Destroy here now, which needs the world.
 * @param {Player} player
 */
export async function destroyMenu(player) {
  if (get("destroyMode") !== true) return "§eDestroy mode is disabled on this realm. An operator can enable it in /realm:config (Easy Building).";
  /** @type {unknown} */
  let out;
  while (player.isValid) {
    out = await destroyPage(player, typeof out === "string" ? out : "");
    if (out === ctx.CLOSE || out === BACK) return out === BACK ? undefined : out;
  }
  return ctx.CLOSE;
}

const BACK = Symbol("back");

/** The Destroy mode page once; its action's answer. @param {Player} player @param {string} notice */
async function destroyPage(player, notice) {
  const st = stateOf(player);
  const survival = !ctx.isCreative(player);
  const body = [
    notice ? `${notice}§r\n` : "",
    st.on ? "§cDestroy mode is on:§r breaking a block with a pickaxe, axe or shovel breaks your shape there. Sneak to break just one." : "Destroy mode is off.",
    "It breaks the shape you chose in /realm:build (same size and settings).",
    survival
      ? "Survival: each block needs the right tool, drops land at your feet (Fortune and Silk Touch count) and the tool wears out (Unbreaking counts). Undo puts the blocks back using blocks from your inventory."
      : "Creative: blocks break without drops; undo puts them back.",
  ]
    .filter(Boolean)
    .join("\n");
  /** @type {{ text: string, run: () => unknown }[]} */
  const actions = [
    { text: st.on ? "Destroy mode: §cOn" : "Destroy mode: Off", run: () => toggleDestroy(player) },
    { text: "Destroy here now", run: () => destroyHere(player) },
    { text: "Back", run: () => BACK },
  ];
  if (st.start) actions.splice(2, 0, { text: "Forget the start block", run: () => ((st.start = undefined), ctx.noted(player, "§7Start block forgotten")) });
  const form = new ActionFormData().title("Destroy mode").body(body);
  for (const a of actions) form.button(a.text);
  const res = await ctx.show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return ctx.CLOSE;
  return actions[res.selection]?.run();
}
