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

// ---------------------------------------------------------------------------
// Counting and clearing
// ---------------------------------------------------------------------------

/** Dropped items per dimension (loaded chunks only). @returns {{ name: string, items: Entity[] }[]} */
function itemsByDimension() {
  return DIMENSIONS.map((d) => {
    try {
      return { name: d.name, items: world.getDimension(d.id).getEntities({ type: "minecraft:item" }) };
    } catch {
      return { name: d.name, items: [] };
    }
  });
}

/** @param {{ items: Entity[] }[]} dims */
const total = (dims) => dims.reduce((n, d) => n + d.items.length, 0);

/** @param {number} n */
const items = (n) => `${n} dropped item${n === 1 ? "" : "s"}`;

/**
 * Whether a dropped item stays.
 * @param {Entity} entity @param {{ x: number, y: number, z: number }[]} players in the item's dimension
 * @param {number} r2 squared radius, 0 = not keeping items near players
 */
function keeps(entity, players, r2) {
  const stack = entity.getComponent("minecraft:item")?.itemStack;
  if (!stack) return true; // can't tell what it is
  if (stack.nameTag) return true;
  const id = stack.typeId;
  if (CONFIG.keepItems.some((k) => id === k || id.endsWith(k))) return true;
  if (r2 > 0) {
    const at = entity.location;
    for (const p of players) {
      const dx = at.x - p.x, dy = at.y - p.y, dz = at.z - p.z;
      if (dx * dx + dy * dy + dz * dz <= r2) return true;
    }
  }
  return false;
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
    const r = get("keepNearPlayers") === true ? get("nearPlayerRadius") : 0;
    for (const d of DIMENSIONS) {
      let found;
      /** @type {{ x: number, y: number, z: number }[]} */
      let players;
      try {
        const dim = world.getDimension(d.id);
        found = dim.getEntities({ type: "minecraft:item" });
        players = dim.getPlayers().map((p) => p.location);
      } catch {
        continue;
      }
      for (let i = 0; i < found.length; i++) {
        const e = found[i];
        try {
          if (!e.isValid) continue; // picked up or merged meanwhile
          if (keeps(e, players, r * r)) kept++;
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
    const extra = kept ? ` §7(${kept} kept: renamed, rare or near a player)` : "";
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
  const count = total(itemsByDimension());
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
  const lines = [`§eDropped items: ${total(dims)}§r (${dims.map((d) => `${d.name} ${d.items.length}`).join(", ")}).`];
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
    actions.push({ text: `Clear in ${seconds} s\n§8Warn everyone first`, run: () => announce(total(itemsByDimension())) });
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
  const body = `${status()}\n\n§rRenamed items, the rare items in keepItems${get("keepNearPlayers") === true ? ` and items within ${get("nearPlayerRadius")} blocks of a player` : ""} are kept. Change the threshold and timing in /realm:config.`;
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
