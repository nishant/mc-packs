import {
  Block,
  CommandPermissionLevel,
  CustomCommandStatus,
  Direction,
  Player,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

// One world property per claim: "claims:c:<id>" → JSON Claim. A claim is a square, top to bottom of
// its dimension, centered on x, z and reaching r blocks each way.
const CLAIM_PREFIX = "claims:c:";
const PROP_NEXT = "claims:next"; // world: the next claim id
const MAX_CLAIMS = 500; // in the whole world
const NEARBY = 64; // blocks: claims whose borders "Show claim borders" draws

/** @typedef {{ i: string, n: string }} Who */
/** @typedef {{ id: number, o: string, n: string, dim: string, x: number, z: number, r: number, s: Who[] }} Claim owner id and name, shared with */

const protectedEntities = new Set(CONFIG.protectedEntities);
const enabled = () => get("enabled") === true;
/** @param {Player} player */
const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
const DISABLED = "Land claims are disabled on this realm. An operator can enable them in /realm:config (Land Claims).";

// ---------------------------------------------------------------------------
// Claims (cached: before events may read but never write)
// ---------------------------------------------------------------------------

/** @type {Map<number, Claim> | undefined} */
let cache;

/** @returns {Map<number, Claim>} */
function claims() {
  if (cache) return cache;
  /** @type {Map<number, Claim>} */
  const map = new Map();
  try {
    for (const id of world.getDynamicPropertyIds()) {
      if (!id.startsWith(CLAIM_PREFIX)) continue;
      try {
        const raw = world.getDynamicProperty(id);
        const c = typeof raw === "string" ? JSON.parse(raw) : undefined;
        if (c && typeof c.o === "string" && typeof c.x === "number") map.set(c.id, { ...c, s: Array.isArray(c.s) ? c.s : [] });
      } catch {
        // a corrupt entry is no claim
      }
    }
  } catch {
    return map; // the world isn't loaded yet: read again next time
  }
  return (cache = map);
}

/** @param {Claim} c */
function saveClaim(c) {
  claims().set(c.id, c);
  world.setDynamicProperty(CLAIM_PREFIX + c.id, JSON.stringify(c));
}

/** @param {number} id */
function removeClaim(id) {
  claims().delete(id);
  world.setDynamicProperty(CLAIM_PREFIX + id, undefined);
}

/**
 * The claim holding this spot.
 * @param {string} dim @param {import("@minecraft/server").Vector3} p
 * @returns {Claim | undefined}
 */
function claimAt(dim, p) {
  const x = Math.floor(p.x), z = Math.floor(p.z);
  for (const c of claims().values()) {
    if (c.dim === dim && Math.abs(x - c.x) <= c.r && Math.abs(z - c.z) <= c.r) return c;
  }
  return undefined;
}

/** Its owner, the players it's shared with, and operators if they may bypass. @param {Player} player @param {Claim} c */
const allowed = (player, c) => c.o === player.id || c.s.some((s) => s.i === player.id) || (get("operatorsBypass") === true && isOp(player));

/**
 * Someone else's claim at this spot, while claims are enabled.
 * @param {Player} player @param {string} dim @param {import("@minecraft/server").Vector3} p
 */
function closedTo(player, dim, p) {
  if (!enabled() || !claims().size) return undefined;
  const c = claimAt(dim, p);
  return c && !allowed(player, c) ? c : undefined;
}

/** @param {string} id player id @returns {Claim[]} */
const claimsOf = (id) => [...claims().values()].filter((c) => c.o === id);

/** Corner to corner, e.g. "-16, 48 to 16, 80". @param {Claim} c */
const span = (c) => `${c.x - c.r}, ${c.z - c.r} to ${c.x + c.r}, ${c.z + c.r}`;
const shortDim = (/** @type {string} */ id) => id.replace(/^minecraft:/, "").replaceAll("_", " ");

// ---------------------------------------------------------------------------
// Protection
// ---------------------------------------------------------------------------

/** "This land is claimed by Sam", from a before event. @param {Player} player @param {Claim} c */
function sayClaimed(player, c) {
  system.run(() => {
    if (player.isValid) player.onScreenDisplay.setActionBar(`§cThis land is claimed by ${c.n}`);
  });
}

/** The block next to `block` on `face`. @param {Block} block @param {Direction} face */
function across(block, face) {
  const d = {
    [Direction.Down]: { x: 0, y: -1, z: 0 },
    [Direction.Up]: { x: 0, y: 1, z: 0 },
    [Direction.North]: { x: 0, y: 0, z: -1 },
    [Direction.South]: { x: 0, y: 0, z: 1 },
    [Direction.West]: { x: -1, y: 0, z: 0 },
    [Direction.East]: { x: 1, y: 0, z: 0 },
  }[face];
  return d ? { x: block.x + d.x, y: block.y + d.y, z: block.z + d.z } : block.location;
}

world.beforeEvents.playerBreakBlock.subscribe((event) => {
  const c = closedTo(event.player, event.dimension.id, event.block.location);
  if (!c) return;
  event.cancel = true;
  sayClaimed(event.player, c);
});

// Tapping a block: opening it, flipping it, and placing a block or pouring a bucket against it.
world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { player, block, blockFace, isFirstEvent } = event;
  const dim = block.dimension.id;
  const c = closedTo(player, dim, block.location) ?? closedTo(player, dim, across(block, blockFace));
  if (!c) return;
  event.cancel = true;
  if (isFirstEvent) sayClaimed(player, c);
});

world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
  const { player, target } = event;
  if (!protectedEntities.has(target.typeId)) return;
  const c = closedTo(player, target.dimension.id, target.location);
  if (!c) return;
  event.cancel = true;
  sayClaimed(player, c);
});

// Anything placed in a claim some way the tap didn't catch is taken back out.
world.afterEvents.playerPlaceBlock.subscribe(({ player, block }) => {
  const c = closedTo(player, block.dimension.id, block.location);
  if (!c) return;
  try {
    block.setType("minecraft:air");
    player.onScreenDisplay.setActionBar(`§cThis land is claimed by ${c.n}`);
  } catch (e) {
    console.warn(`[claims] ${e}`);
  }
});

// Don't cancel the event: that would also remove the damage outside the claim.
world.beforeEvents.explosion.subscribe((event) => {
  if (!enabled() || !claims().size || get("protectExplosions") !== true) return;
  try {
    const dim = event.dimension.id;
    const blocks = event.getImpactedBlocks();
    const kept = blocks.filter((b) => !claimAt(dim, b.location));
    if (kept.length !== blocks.length) event.setImpactedBlocks(kept);
  } catch (e) {
    console.warn(`[claims] ${e}`);
  }
});

// "Entering Sam's claim" / "Leaving Sam's claim" above the hotbar.
/** @type {Map<string, number | undefined>} player id → id of the claim they were in */
const inClaim = new Map();
world.afterEvents.playerLeave.subscribe(({ playerId }) => inClaim.delete(playerId));
system.runInterval(() => {
  if (!enabled() || !claims().size) {
    inClaim.clear();
    return;
  }
  for (const player of world.getAllPlayers()) {
    try {
      const c = claimAt(player.dimension.id, player.location);
      const before = inClaim.get(player.id);
      if (c?.id === before) continue;
      inClaim.set(player.id, c?.id);
      const was = before === undefined ? undefined : claims().get(before);
      if (c) player.onScreenDisplay.setActionBar(c.o === player.id ? "§aEntering your claim" : `§eEntering ${c.n}'s claim`);
      else if (was) player.onScreenDisplay.setActionBar(was.o === player.id ? "§7Leaving your claim" : `§7Leaving ${was.n}'s claim`);
    } catch {
      // a player mid-respawn or changing dimension: next time
    }
  }
}, 20);

// ---------------------------------------------------------------------------
// Borders
// ---------------------------------------------------------------------------

/**
 * Draws the edges of these claims near the player for borderSeconds, at the player's height.
 * @param {Player} player @param {Claim[]} list
 */
function showBorders(player, list) {
  if (!list.length) {
    player.onScreenDisplay.setActionBar("§7No claims nearby");
    return;
  }
  const until = system.currentTick + CONFIG.borderSeconds * 20;
  const id = system.runInterval(() => {
    if (!player.isValid || system.currentTick > until) {
      system.clearRun(id);
      return;
    }
    const { x: px, y: py, z: pz } = player.location;
    for (const c of list) {
      if (c.dim !== player.dimension.id) continue;
      const x0 = c.x - c.r, x1 = c.x + c.r + 1, z0 = c.z - c.r, z1 = c.z + c.r + 1;
      /** @type {[number, number][]} */
      const points = [];
      for (let t = 0; t <= x1 - x0; t += 2) points.push([x0 + t, z0], [x0 + t, z1]);
      for (let t = 0; t <= z1 - z0; t += 2) points.push([x0, z0 + t], [x1, z0 + t]);
      for (const [x, z] of points) {
        if (Math.abs(x - px) > 48 || Math.abs(z - pz) > 48) continue;
        for (const dy of [0, 1.5]) {
          try {
            player.spawnParticle("minecraft:villager_happy", { x, y: py + dy, z });
          } catch {
            // outside the loaded world
          }
        }
      }
    }
  }, 10);
}

/** @param {Player} player */
const nearby = (player) =>
  [...claims().values()].filter(
    (c) => c.dim === player.dimension.id && Math.abs(c.x - player.location.x) <= NEARBY + c.r && Math.abs(c.z - player.location.z) <= NEARBY + c.r
  );

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

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

/**
 * Buttons with what each does.
 * @param {Player} player @param {string} title @param {string} body @param {{ text: string, run: () => void | Promise<void> }[]} actions
 */
async function menu(player, title, body, actions) {
  const form = new ActionFormData().title(title).body(body);
  for (const a of actions) form.button(a.text);
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  await actions[res.selection]?.run();
}

/** Why the player can't claim here, or undefined. @param {Player} player @param {number} r */
function cannotClaim(player, r) {
  const max = get("maxClaims");
  if (claimsOf(player.id).length >= max) return `You already have ${max} claim${max === 1 ? "" : "s"}. Remove one first.`;
  if (claims().size >= MAX_CLAIMS) return `The realm has the most claims allowed (${MAX_CLAIMS}).`;
  const x = Math.floor(player.location.x), z = Math.floor(player.location.z);
  for (const c of claims().values()) {
    if (c.dim === player.dimension.id && Math.abs(x - c.x) <= r + c.r && Math.abs(z - c.z) <= r + c.r) {
      return c.o === player.id
        ? "That would overlap your own claim. Move further away."
        : `That would overlap ${c.n}'s claim (${span(c)}). Move further away.`;
    }
  }
  return undefined;
}

/** @param {Player} player */
function claimHere(player) {
  if (!enabled()) return player.sendMessage(`§c${DISABLED}`);
  const r = get("radius");
  const why = cannotClaim(player, r);
  if (why) return player.sendMessage(`§c${why}`);
  const next = world.getDynamicProperty(PROP_NEXT);
  const id = typeof next === "number" ? next : 1;
  world.setDynamicProperty(PROP_NEXT, id + 1);
  /** @type {Claim} */
  const c = { id, o: player.id, n: player.name, dim: player.dimension.id, x: Math.floor(player.location.x), z: Math.floor(player.location.z), r, s: [] };
  saveClaim(c);
  player.sendMessage(`§aClaimed ${2 * r + 1} x ${2 * r + 1} blocks, ${span(c)} (${shortDim(c.dim)}), top to bottom. Only you can build, break or open things here.`);
  player.playSound("random.levelup", { pitch: 1.2, volume: 0.6 });
  showBorders(player, [c]);
}

/** @param {Player} player @param {Claim} c */
async function manage(player, c) {
  const others = world.getAllPlayers().filter((p) => p.id !== c.o && !c.s.some((s) => s.i === p.id));
  /** @type {{ text: string, run: () => void }[]} */
  const actions = [{ text: "Show its borders", run: () => showBorders(player, [c]) }];
  if (c.s.length < CONFIG.maxShared) {
    for (const p of others) {
      actions.push({ text: `Share with ${p.name}\n§8They can build here too`, run: () => change(player, c.id, (x) => ({ ...x, s: [...x.s, { i: p.id, n: p.name }] })) });
    }
  }
  for (const s of c.s) {
    actions.push({ text: `Stop sharing with ${s.n}`, run: () => change(player, c.id, (x) => ({ ...x, s: x.s.filter((y) => y.i !== s.i) })) });
  }
  actions.push({
    text: `Remove this claim\n§8Anyone can build here again`,
    run: () => {
      removeClaim(c.id);
      player.sendMessage(`§aClaim ${span(c)} removed.`);
    },
  });
  const body = [
    `${2 * c.r + 1} x ${2 * c.r + 1} blocks, ${span(c)} (${shortDim(c.dim)}), top to bottom.`,
    c.s.length ? `Shared with ${c.s.map((s) => s.n).join(", ")}.` : "Only you can build here.",
    c.s.length >= CONFIG.maxShared ? `§7Shared with the most players allowed (${CONFIG.maxShared}).` : "§7You can share it with players who are online now.",
  ].join("\n");
  await menu(player, "§lYour claim", body, actions);
}

/** @param {Player} player @param {number} id @param {(c: Claim) => Claim} fn */
function change(player, id, fn) {
  const c = claims().get(id);
  if (!c) return;
  saveClaim(fn(c));
  player.onScreenDisplay.setActionBar("§aClaim updated");
}

/** Operators: every claim, to remove any. @param {Player} player */
async function allClaims(player) {
  const list = [...claims().values()].sort((a, b) => a.n.localeCompare(b.n) || a.id - b.id);
  await menu(
    player,
    "§lAll claims",
    list.length ? `${list.length} claim${list.length === 1 ? "" : "s"}. Pick one to remove it.` : "No claims yet.",
    list.map((c) => ({
      text: `${c.n}: ${span(c)}\n§8${shortDim(c.dim)}, shared with ${c.s.length}`,
      run: () =>
        menu(player, "§lRemove this claim?", `${c.n}'s claim, ${span(c)} (${shortDim(c.dim)}).`, [
          {
            text: "§cRemove it",
            run: () => {
              removeClaim(c.id);
              player.sendMessage(`§aRemoved ${c.n}'s claim ${span(c)}.`);
            },
          },
          { text: "Keep it", run: () => {} },
        ]),
    }))
  );
}

/** /realm:claim @param {Player} player */
async function mainMenu(player) {
  const r = get("radius");
  const here = claimAt(player.dimension.id, player.location);
  const mine = claimsOf(player.id);
  const max = get("maxClaims");
  const body = [
    here ? (here.o === player.id ? "§aYou're in your claim.§r" : `You're in §e${here.n}'s§r claim.`) : "Nobody has claimed the land you're on.",
    `You have ${mine.length} of ${max} claim${max === 1 ? "" : "s"}. A claim is ${2 * r + 1} x ${2 * r + 1} blocks around where you stand, top to bottom: only you and the players you share it with can build, break or open things there.`,
  ].join("\n\n");

  /** @type {{ text: string, run: () => void | Promise<void> }[]} */
  const actions = [];
  if (!here && mine.length < max) actions.push({ text: `Claim this land\n§8${2 * r + 1} x ${2 * r + 1} blocks around you`, run: () => claimHere(player) });
  actions.push({ text: "Show claim borders\n§8Nearby, for a few seconds", run: () => showBorders(player, nearby(player)) });
  for (const c of mine) actions.push({ text: `My claim: ${c.x}, ${c.z}\n§8${shortDim(c.dim)}, shared with ${c.s.length}`, run: () => manage(player, c) });
  if (isOp(player)) actions.push({ text: "All claims (operator)\n§8Remove any claim", run: () => allClaims(player) });
  await menu(player, "§lLand Claims", body, actions);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:claim",
      description: "Land claims: claim the land around you, share it, see borders (an operator has to enable them first)",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      if (!enabled()) return { status: CustomCommandStatus.Failure, message: DISABLED };
      system.run(() => mainMenu(player).catch((e) => console.warn(`[claims] ${e}`)));
      return { status: CustomCommandStatus.Success };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "claims_bp");
  },
  { namespaces: ["realm"] }
);
