import { CommandPermissionLevel, CustomCommandStatus, Entity, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get, onChange } from "./settings.js";

// Every checkSeconds the pack counts dropped items (item entities in loaded chunks) in every
// dimension. Above the threshold it warns everyone, waits warnSeconds, then removes the dropped items
// that aren't renamed, listed in keepItems or (keepNearPlayers) lying near a player.

const DIMENSIONS = [
  { id: "minecraft:overworld", name: "Overworld" },
  { id: "minecraft:nether", name: "Nether" },
  { id: "minecraft:the_end", name: "End" },
];

/** @param {Player} player */
const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

let lastCheck = system.currentTick;
/** Tick the announced cleanup runs at, while one is coming. @type {number | undefined} */
let clearAt;
let clearing = false;

/** Where players died lately, so their dropped gear isn't cleared before they get back. @type {{ dim: string, x: number, y: number, z: number, tick: number }[]} */
const deaths = [];
/** Items within this many blocks of a recent death are that player's drops. */
const DEATH_RADIUS = 8;

world.afterEvents.entityDie.subscribe(
  ({ deadEntity }) => {
    try {
      const at = deadEntity.location;
      deaths.push({ dim: deadEntity.dimension.id, x: at.x, y: at.y, z: at.z, tick: system.currentTick });
      if (deaths.length > 50) deaths.shift();
    } catch {
      // gone already
    }
  },
  { entityTypes: ["minecraft:player"] }
);

/** Recent death points in a dimension (forgets the old ones). @param {string} dim */
function recentDeaths(dim) {
  const minutes = get("keepDeathDropsMinutes");
  const since = system.currentTick - minutes * 1200;
  while (deaths.length && deaths[0].tick < since) deaths.shift();
  return minutes > 0 ? deaths.filter((d) => d.dim === dim) : [];
}

// ---------------------------------------------------------------------------
// Counting and clearing
// ---------------------------------------------------------------------------

/**
 * Dropped items per dimension (loaded chunks only), with where the players and recent deaths are.
 * @returns {{ id: string, name: string, items: Entity[], players: { x: number, y: number, z: number }[], deaths: { x: number, y: number, z: number }[] }[]}
 */
function itemsByDimension() {
  return DIMENSIONS.map((d) => {
    try {
      const dim = world.getDimension(d.id);
      return {
        id: d.id,
        name: d.name,
        items: dim.getEntities({ type: "minecraft:item" }),
        players: dim.getPlayers().map((p) => p.location),
        deaths: recentDeaths(d.id),
      };
    } catch {
      return { id: d.id, name: d.name, items: [], players: [], deaths: [] };
    }
  });
}

/** Squared radius around players where items stay, 0 = not keeping items near players. */
const nearRadius2 = () => (get("keepNearPlayers") === true ? get("nearPlayerRadius") ** 2 : 0);

/**
 * The dropped items a cleanup would remove. Counting these rather than every item means a pile that is
 * all kept (a farm's output next to an AFK player) can't start a cleanup that clears nothing, over and over.
 * @param {ReturnType<typeof itemsByDimension>} dims
 */
function clearable(dims) {
  const r2 = nearRadius2();
  let n = 0;
  for (const d of dims) {
    for (const e of d.items) {
      try {
        if (!keeps(e, d.players, r2, d.deaths)) n++;
      } catch {
        // gone meanwhile
      }
    }
  }
  return n;
}

/** @param {{ items: Entity[] }[]} dims */
const total = (dims) => dims.reduce((n, d) => n + d.items.length, 0);

/** @param {number} n */
const items = (n) => `${n} dropped item${n === 1 ? "" : "s"}`;

/** @param {{ x: number, y: number, z: number }} a @param {{ x: number, y: number, z: number }[]} points @param {number} r2 */
function near(a, points, r2) {
  for (const p of points) {
    const dx = a.x - p.x, dy = a.y - p.y, dz = a.z - p.z;
    if (dx * dx + dy * dy + dz * dz <= r2) return true;
  }
  return false;
}

/**
 * Whether a dropped item stays.
 * @param {Entity} entity @param {{ x: number, y: number, z: number }[]} players in the item's dimension
 * @param {number} r2 squared radius, 0 = not keeping items near players
 * @param {{ x: number, y: number, z: number }[]} deathPoints recent player deaths in the item's dimension
 */
function keeps(entity, players, r2, deathPoints) {
  const stack = entity.getComponent("minecraft:item")?.itemStack;
  if (!stack) return true; // can't tell what it is
  if (stack.nameTag) return true;
  const id = stack.typeId;
  if (CONFIG.keepItems.some((k) => id === k || id.endsWith(k))) return true;
  try {
    if (stack.getComponent("minecraft:enchantable")?.getEnchantments().length) return true;
  } catch {
    // not enchantable
  }
  const at = entity.location;
  if (r2 > 0 && near(at, players, r2)) return true;
  return deathPoints.length > 0 && near(at, deathPoints, DEATH_RADIUS * DEATH_RADIUS);
}

/**
 * Removes the dropped items that don't stay, spread over ticks, then says how many in chat.
 * @param {string | undefined} by the operator who asked, if any
 * @returns {Generator<void, void, void>}
 */
function* clearJob(by) {
  let removed = 0;
  let kept = 0;
  try {
    const r2 = nearRadius2();
    for (const d of itemsByDimension()) {
      const found = d.items;
      for (let i = 0; i < found.length; i++) {
        const e = found[i];
        try {
          if (!e.isValid) continue; // picked up or merged meanwhile
          if (keeps(e, d.players, r2, d.deaths)) kept++;
          else {
            e.remove();
            removed++;
          }
        } catch {
          // gone or unloaded meanwhile
        }
        if (i % 50 === 49) yield;
      }
    }
    const extra = kept ? ` §7(${kept} kept: renamed, rare, enchanted, or near a player or a recent death)` : "";
    world.sendMessage(by ? `§e${by} cleared ${items(removed)}.${extra}` : `§eCleared ${items(removed)}.${extra}`);
  } catch (e) {
    console.warn(`[cleanup] ${e}`);
  } finally {
    clearing = false;
    lastCheck = system.currentTick;
  }
}

/** @param {string} [by] */
function clearNow(by) {
  clearAt = undefined;
  if (clearing) return;
  clearing = true;
  try {
    system.runJob(clearJob(by));
  } catch (e) {
    clearing = false;
    console.warn(`[cleanup] ${e}`);
  }
}

/** Warns everyone, then clears after warnSeconds. @param {number} count */
function announce(count) {
  const seconds = get("warnSeconds");
  if (seconds <= 0) return clearNow();
  world.sendMessage(`§eClearing ${items(count)} in ${seconds} s: pick up what you need`);
  clearAt = system.currentTick + seconds * 20;
}

system.runInterval(() => {
  const now = system.currentTick;
  if (clearAt !== undefined) {
    if (now >= clearAt) clearNow();
    return;
  }
  if (clearing || get("enabled") !== true || now - lastCheck < get("checkSeconds") * 20) return;
  lastCheck = now;
  const count = clearable(itemsByDimension());
  if (count > get("threshold")) announce(count);
}, 20);

// Disabling the automatic cleanup also calls off one that's coming.
onChange((key) => {
  if ((key === "enabled" || key === "*") && get("enabled") !== true && clearAt !== undefined) {
    clearAt = undefined;
    world.sendMessage("§7The dropped item cleanup was called off.");
  }
});

// ---------------------------------------------------------------------------
// /realm:cleanup
// ---------------------------------------------------------------------------

/** What /realm:cleanup tells everyone. */
function status() {
  const dims = itemsByDimension();
  const all = total(dims);
  const gone = clearable(dims);
  const lines = [`§eDropped items: ${all}§r (${dims.map((d) => `${d.name} ${d.items.length}`).join(", ")}).`];
  if (all > 0) lines.push(`§7${gone} of them would be cleared, the others are kept.`);
  if (clearAt !== undefined) lines.push(`§eClearing in ${Math.max(0, Math.ceil((clearAt - system.currentTick) / 20))} s.`);
  else if (get("enabled") === true) lines.push(`§7Cleared automatically above ${get("threshold")}, counted every ${get("checkSeconds")} s.`);
  else lines.push("§7Automatic cleanup is disabled.");
  return lines.join("\n");
}

/**
 * Shows a form, retrying while the player still has chat or another screen open.
 * @param {Player} player @param {ActionFormData} form
 */
async function show(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await new Promise((r) => system.runTimeout(() => r(undefined), 20));
  }
  return undefined;
}

/** The operators' menu: the counts, and clear now or after a warning. @param {Player} player */
async function opMenu(player) {
  const seconds = get("warnSeconds");
  /** @type {{ text: string, run: () => void }[]} */
  const actions = [{ text: "Clear now\n§8No warning", run: () => clearNow(player.name) }];
  if (seconds > 0 && clearAt === undefined) {
    actions.push({ text: `Clear in ${seconds} s\n§8Warn everyone first`, run: () => announce(clearable(itemsByDimension())) });
  }
  if (clearAt !== undefined) {
    actions.push({
      text: "Call off the coming cleanup",
      run: () => {
        clearAt = undefined;
        lastCheck = system.currentTick;
        world.sendMessage("§7The dropped item cleanup was called off.");
      },
    });
  }
  actions.push({ text: "Close", run: () => {} });
  const nearText = get("keepNearPlayers") === true ? `, items within ${get("nearPlayerRadius")} blocks of a player` : "";
  const dropped = get("keepDeathDropsMinutes") > 0 ? `, items where a player died in the last ${get("keepDeathDropsMinutes")} min` : "";
  const body = `${status()}\n\n§rRenamed items, enchanted items, the rare items in keepItems${nearText}${dropped} are kept. Change the threshold and timing in /realm:config.`;
  const form = new ActionFormData().title("§lLag Cleanup").body(body);
  for (const a of actions) form.button(a.text);
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  if (clearing) return player.sendMessage("§7A cleanup is already running.");
  actions[res.selection]?.run();
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:cleanup",
      description: "Count dropped items in each dimension. Operators can also clear them",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (player instanceof Player && isOp(player)) {
        system.run(() => opMenu(player).catch((e) => console.warn(`[cleanup] ${e}`)));
        return { status: CustomCommandStatus.Success };
      }
      // getEntities can't run in this read-only callback: answer on the next tick.
      system.run(() => {
        const text = status();
        if (player instanceof Player) {
          if (player.isValid) player.sendMessage(text);
        } else console.warn(`[cleanup] ${text}`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "cleanup_bp");
  },
  { namespaces: ["realm"] }
);
