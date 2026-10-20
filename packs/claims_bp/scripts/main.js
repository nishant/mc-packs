import "./diag.js";
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
import { get, onChange } from "./settings.js";
import { allZones, provideZones } from "./zones.js";
import { onScriptEvent } from "./script-events.js";

// One world property per claim: "claims:c:<id>" → JSON Claim. A claim is a square, top to bottom of
// its dimension, centered on x, z and reaching r blocks each way.
const CLAIM_PREFIX = "claims:c:";
const PROP_NEXT = "claims:next"; // world: the next claim id
const MAX_CLAIMS = 500; // in the whole world
const NEARBY = 64; // blocks: claims whose borders "Show claim borders" draws

/** @typedef {{ i: string, n: string }} Who */
/** @typedef {{ id: number, o: string, n: string, dim: string, x: number, z: number, r: number, s: Who[], pt?: boolean, pc?: string, dr?: boolean, lv?: number }} Claim owner id and name, shared with; pt: shared with the owner's party, pc: the owner's party code when last seen online ("" = none) */

const PARTY_TAG = "realm_party:"; // the Parties pack's tag on every member, `realm_party:<code>`
/** The player's party code from the Parties pack's tag, or "". @param {Player} player */
const partyCode = (player) => player.getTags().find((t) => t.startsWith(PARTY_TAG))?.slice(PARTY_TAG.length) ?? "";

// Every party's members, offline ones included, from the Parties pack (realm:party_members { code, l, m: [[id, name]] }
// after each change and on realm:party_members_ping). A claim shared with its owner's party lets in a player only while
// both the owner and that player are on the party's current list, so an owner removed while offline, or a later party
// that got the same code, opens nothing. Kept in memory; asked for again when the world loads.
/** @type {Map<string, Set<string>>} party code -> member ids */
const partyMembers = new Map();
onScriptEvent(
  "realm:party_members",
  ({ id, message }) => {
    if (id !== "realm:party_members") return;
    try {
      const m = JSON.parse(message);
      if (!m || typeof m.code !== "string") return;
      const ids = Array.isArray(m.m) ? m.m.map((/** @type {unknown} */ x) => (Array.isArray(x) ? String(x[0]) : "")).filter(Boolean) : [];
      if (ids.length) partyMembers.set(m.code, new Set(ids));
      else partyMembers.delete(m.code);
    } catch (e) {
      console.warn(`[claims] party_members: ${e}`);
    }
  },
);
system.runTimeout(() => system.sendScriptEvent("realm:party_members_ping", "{}"), 60);

/** Is the player in the claim owner's party, by the party's current member list? @param {Player} player @param {Claim} c */
function partyAllowed(player, c) {
  if (c.pt !== true || !c.pc) return false;
  const ids = partyMembers.get(c.pc);
  return !!ids && ids.has(c.o) && ids.has(player.id);
}

const protectedEntities = new Set(CONFIG.protectedEntities);
const protectedAnimals = new Set(CONFIG.protectedAnimals);
/** Bedrock ids of doors, trapdoors and fence gates a hand can open: minecraft:wooden_door, spruce_door, trapdoor, bamboo_trapdoor, fence_gate, cherry_fence_gate... Iron ones only open with redstone. */
const DOOR = /^minecraft:(?!iron_)(?:[a-z]+_)*(?:wooden_door|door|trapdoor|fence_gate)$/;
/** Held items that do something else to a door than open it: pour, wax, scrape, light, dye, brush. */
const NOT_OPENING = /bucket|honeycomb|(?:^|_)axe$|flint_and_steel|fire_charge|shears|brush|(?:^|_)dye$|ink_sac|lava|water/;
/** Entities that belong to stories and townsfolk (the Saga and NPC packs): tapping them must keep working inside a claim. */
const STORY_TAGS = ["saga:actor", "realm:npc"];
const enabled = () => get("enabled") === true;
/** @param {Player} player */
const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
/**
 * A short message above the hotbar. Asks the Coordinates HUD, if installed, to leave it there a moment.
 * @param {Player} player @param {string} text
 */
function bar(player, text) {
  system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: player.id, ticks: 50, from: "claims_bp" }));
  player.onScreenDisplay.setActionBar(text);
}
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
        const ok =
          c && typeof c.id === "number" && typeof c.o === "string" && typeof c.dim === "string" &&
          typeof c.x === "number" && typeof c.z === "number" && typeof c.r === "number";
        if (ok) map.set(c.id, { ...c, n: String(c.n ?? "?"), s: Array.isArray(c.s) ? c.s : [] });
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
  publishZones();
}

/** @param {number} id */
function removeClaim(id) {
  claims().delete(id);
  world.setDynamicProperty(CLAIM_PREFIX + id, undefined);
  publishZones();
}

// Claims are safe zones for world events (meteors, tornadoes, storm lightning...) while claims are enabled and
// protectWorldEvents is on: this pack is the "claims" provider of the realm:zones protocol (scripts/zones.js).
// A claim covers whole blocks from x - r to x + r, so its square reaches half a block past those centers.
const publishZones = provideZones("claims", () =>
  enabled() && get("protectWorldEvents") === true
    ? [...claims().values()].map((c) => ({ id: `c${c.id}`, name: `${c.n}'s claim`, dim: c.dim, x: c.x + 0.5, z: c.z + 0.5, r: c.r + 0.5, shape: /** @type {"square"} */ ("square") }))
    : []
);
onChange((key) => {
  if (key === "enabled" || key === "protectWorldEvents" || key === "*") publishZones();
});

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

/** Its owner, the players it's shared with, the owner's party when shared with it, and operators if they may bypass. @param {Player} player @param {Claim} c */
const allowed = (player, c) =>
  c.o === player.id ||
  c.s.some((s) => s.i === player.id) ||
  partyAllowed(player, c) ||
  (get("operatorsBypass") === true && isOp(player));

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
    if (player.isValid) bar(player, `§cThis land is claimed by ${c.n}`);
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
// With an empty hand nothing can be placed, so only the tapped block itself counts: a door just
// outside the border stays usable even when the face tapped points into the claim.
world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { player, block, blockFace, isFirstEvent, itemStack } = event;
  const dim = block.dimension.id;
  const here = closedTo(player, dim, block.location);
  // The owner's "visitors may open doors" switch: doors, trapdoors and gates only, never containers.
  // Only a plain, non-sneaking tap that opens it: sneaking or holding a bucket, wax, an axe or fire places or changes things.
  if (here?.dr === true && DOOR.test(block.typeId) && !player.isSneaking && !(itemStack && NOT_OPENING.test(itemStack.typeId))) return;
  const c = here ?? (itemStack ? closedTo(player, dim, across(block, blockFace)) : undefined);
  if (!c) return;
  event.cancel = true;
  if (isFirstEvent) sayClaimed(player, c);
});

/** @param {import("@minecraft/server").Entity} target */
function isStory(target) {
  try {
    return target.typeId.startsWith("realm:") || STORY_TAGS.some((tag) => target.hasTag(tag));
  } catch {
    return false;
  }
}

/** A tamed pet of anyone, by the stable `minecraft:is_tamed` component (the stable `tamedToPlayerId` is on `minecraft:tameable`, which a mob loses once tamed, so the tamer cannot be read here). @param {import("@minecraft/server").Entity} target */
function isTamed(target) {
  try {
    return target.getComponent("minecraft:is_tamed") !== undefined;
  } catch {
    return false;
  }
}

world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
  const { player, target } = event;
  if (isStory(target)) return;
  const animal = get("protectAnimals") === true && (protectedAnimals.has(target.typeId) || isTamed(target));
  if (!protectedEntities.has(target.typeId) && !animal) return;
  const c = closedTo(player, target.dimension.id, target.location);
  if (!c) return;
  event.cancel = true;
  sayClaimed(player, c);
});

// Anything placed in a claim some way the tap didn't catch is taken back out: broken as if mined, so the block (and
// anything inside it, like a shulker box's items) drops instead of vanishing.
world.afterEvents.playerPlaceBlock.subscribe(({ player, block }) => {
  const c = closedTo(player, block.dimension.id, block.location);
  if (!c) return;
  try {
    const { x, y, z } = block.location;
    block.dimension.runCommand(`setblock ${x} ${y} ${z} air destroy`);
    bar(player, `§cThis land is claimed by ${c.n}`);
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
  // Claims shared with the owner's party follow the party the owner is in now (Parties: realm_party:<code>).
  for (const c of claims().values()) {
    if (c.pt !== true) continue;
    const owner = world.getEntity(c.o);
    if (!(owner instanceof Player)) continue;
    const code = partyCode(owner);
    if (code !== (c.pc ?? "")) saveClaim({ ...c, pc: code });
  }
  if (!enabled() || !claims().size) {
    inClaim.clear();
    return;
  }
  for (const player of world.getAllPlayers()) {
    try {
      const c = claimAt(player.dimension.id, player.location);
      if (c?.o === player.id) refreshVisit(c);
      const before = inClaim.get(player.id);
      if (c?.id === before) continue;
      inClaim.set(player.id, c?.id);
      const was = before === undefined ? undefined : claims().get(before);
      if (c) bar(player, c.o === player.id ? "§aEntering your claim" : `§eEntering ${c.n}'s claim`);
      else if (was) bar(player, was.o === player.id ? "§7Leaving your claim" : `§7Leaving ${was.n}'s claim`);
    } catch {
      // a player mid-respawn or changing dimension: next time
    }
  }
}, 20);

/** The owner is in their own claim: keep its last visit fresh, written at most once a minute. @param {Claim} c */
function refreshVisit(c) {
  const now = Date.now();
  const last = /** @type {any} */ (c).lv;
  if (typeof last === "number" && now - last < 60_000) return;
  const next = { ...c, lv: now };
  claims().set(c.id, next);
  world.setDynamicProperty(CLAIM_PREFIX + c.id, JSON.stringify(next));
}

/** Owners' last visit, saved on join and on leave (a claim's `lv`, ms). @param {string} id */
function touchOwner(id) {
  const now = Date.now();
  for (const c of claimsOf(id)) {
    const next = { ...c, lv: now };
    claims().set(c.id, next);
    world.setDynamicProperty(CLAIM_PREFIX + c.id, JSON.stringify(next)); // the shape didn't change: no need to republish the zones
  }
}
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  try {
    touchOwner(playerId);
  } catch (e) {
    console.warn(`[claims] ${e}`);
  }
});

// A player who changed their gamertag: their claims and shares keep their id, so update the saved name
// ("This land is claimed by ...", the zones, the share lists) when they join.
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  try {
    const { id, name } = player;
    touchOwner(id);
    for (const c of [...claims().values()]) {
      const owner = c.o === id && c.n !== name;
      const shared = c.s.some((s) => s.i === id && s.n !== name);
      if (owner || shared) saveClaim({ ...c, n: owner ? name : c.n, s: c.s.map((s) => (s.i === id ? { i: id, n: name } : s)) });
    }
  } catch (e) {
    console.warn(`[claims] ${e}`);
  }
});

// ---------------------------------------------------------------------------
// Borders
// ---------------------------------------------------------------------------

/** @type {Map<string, number>} player id → the run drawing their borders, so a new one replaces it */
const drawing = new Map();
world.afterEvents.playerLeave.subscribe(({ playerId }) => drawing.delete(playerId));

/**
 * Draws the edges of these claims near the player for borderSeconds, at the player's height.
 * @param {Player} player @param {Claim[]} list
 */
function showBorders(player, list) {
  if (!list.length) {
    bar(player, "§7No claims nearby");
    return;
  }
  const until = system.currentTick + CONFIG.borderSeconds * 20;
  const pid = player.id;
  const previous = drawing.get(pid);
  if (previous !== undefined) system.clearRun(previous);
  const id = system.runInterval(() => {
    if (!player.isValid || system.currentTick > until) {
      system.clearRun(id);
      if (drawing.get(pid) === id) drawing.delete(pid);
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
  drawing.set(pid, id);
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
  if (!isOp(player)) {
    const zone = zoneIn(player.dimension.id, x, z, r);
    if (zone) return `That would overlap ${zone}. Only operators can claim land there. Move further away.`;
  }
  return undefined;
}

/**
 * A safe zone or town (from the safe zones protocol, scripts/zones.js) that a claim of radius r centered on
 * block x, z would reach into, as "the safe zone Spawn" / "the town Riverside"; undefined when none does.
 * @param {string} dim @param {number} x @param {number} z @param {number} r
 */
function zoneIn(dim, x, z, r) {
  // Zones are matched on block centers: the claim's blocks run from x - r to x + r.
  const x0 = x - r + 0.5, x1 = x + r + 0.5, z0 = z - r + 0.5, z1 = z + r + 0.5;
  for (const zone of allZones()) {
    if (zone.src === "claims" || zone.dim !== dim) continue;
    const hit =
      zone.shape === "square"
        ? zone.x + zone.r >= x0 && zone.x - zone.r <= x1 && zone.z + zone.r >= z0 && zone.z - zone.r <= z1
        : (Math.max(x0, Math.min(zone.x, x1)) - zone.x) ** 2 + (Math.max(z0, Math.min(zone.z, z1)) - zone.z) ** 2 <= zone.r * zone.r;
    if (hit) return zone.src === "zones" ? `the safe zone ${zone.name}` : zone.src === "town" ? `the town ${zone.name}` : zone.name;
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
  const c = { id, o: player.id, n: player.name, dim: player.dimension.id, x: Math.floor(player.location.x), z: Math.floor(player.location.z), r, s: [], lv: Date.now() };
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
      const { id, name } = p;
      actions.push({
        text: `Share with ${name}\n§8They can build here too`,
        // Checked again: the menu may have been open while the claim changed.
        run: () => change(player, c.id, (x) => (x.s.length >= CONFIG.maxShared || x.s.some((y) => y.i === id) ? x : { ...x, s: [...x.s, { i: id, n: name }] })),
      });
    }
  }
  if (c.pt === true) actions.push({ text: "Stop sharing with my party", run: () => change(player, c.id, (x) => ({ ...x, pt: false })) });
  else if (partyCode(player)) {
    actions.push({
      text: "Share with my party\n§8Everyone in your party, now and later",
      run: () => change(player, c.id, (x) => ({ ...x, pt: true, pc: partyCode(player) })),
    });
  }
  for (const s of c.s) {
    actions.push({ text: `Stop sharing with ${s.n}`, run: () => change(player, c.id, (x) => ({ ...x, s: x.s.filter((y) => y.i !== s.i) })) });
  }
  actions.push({
    text: c.dr === true ? "Visitors may open doors: Enabled\n§8Tap to close doors to visitors again" : "Visitors may open doors: Disabled\n§8Tap to let visitors open doors, trapdoors and gates",
    run: () => change(player, c.id, (x) => ({ ...x, dr: x.dr !== true })),
  });
  actions.push({
    text: `Remove this claim\n§8Anyone can build here again`,
    // Asks first: removing can't be undone, and the shares go with it.
    run: () =>
      menu(player, "§lRemove this claim?", `${span(c)} (${shortDim(c.dim)}). Anyone will be able to build, break and open things there again${c.s.length ? `, and it stops being shared with ${c.s.map((s) => s.n).join(", ")}` : ""}.`, [
        {
          text: "§cRemove it",
          run: () => {
            if (!claims().has(c.id)) return;
            removeClaim(c.id);
            player.sendMessage(`§aClaim ${span(c)} removed.`);
          },
        },
        { text: "Keep it", run: () => {} },
      ]),
  });
  const body = [
    `${2 * c.r + 1} x ${2 * c.r + 1} blocks, ${span(c)} (${shortDim(c.dim)}), top to bottom.`,
    c.s.length ? `Shared with ${c.s.map((s) => s.n).join(", ")}.` : c.pt === true ? "" : "Only you can build here.",
    c.pt === true ? (c.pc ? "Shared with your party: everyone in it can build here." : "Shared with your party, once you're in one.") : "",
    c.s.length >= CONFIG.maxShared ? `§7Shared with the most players allowed (${CONFIG.maxShared}).` : "§7You can share it with players who are online now.",
  ]
    .filter(Boolean)
    .join("\n");
  await menu(player, "§lYour claim", body, actions);
}

/** @param {Player} player @param {number} id @param {(c: Claim) => Claim} fn */
function change(player, id, fn) {
  const c = claims().get(id);
  if (!c) return;
  saveClaim(fn(c));
  bar(player, "§aClaim updated");
}

/** "40 days ago", "today", or "unknown" for a claim saved before last visits were tracked. @param {Claim} c */
function lastVisit(c) {
  if (world.getAllPlayers().some((p) => p.id === c.o)) return "online now";
  const lv = /** @type {any} */ (c).lv;
  if (typeof lv !== "number") return "unknown";
  const days = Math.floor((Date.now() - lv) / 86_400_000);
  return days < 1 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`;
}

/** @type {Record<string, string>} */
const SORT_NAMES = { name: "owner", size: "size, biggest first", visit: "owner's last visit, longest ago first" };

/** Operators: every claim, to audit and remove any. @param {Player} player @param {"name" | "size" | "visit"} [sort] */
async function allClaims(player, sort = "name") {
  if (!isOp(player)) return player.sendMessage("§cOnly operators can see every claim.");
  /** @param {Claim} c */
  const seenAt = (c) => (world.getAllPlayers().some((p) => p.id === c.o) ? Infinity : typeof (/** @type {any} */ (c).lv) === "number" ? /** @type {any} */ (c).lv : -Infinity);
  const list = [...claims().values()].sort((a, b) =>
    sort === "size" ? b.r - a.r || a.n.localeCompare(b.n) || a.id - b.id : sort === "visit" ? (seenAt(a) === seenAt(b) ? 0 : seenAt(a) < seenAt(b) ? -1 : 1) || a.n.localeCompare(b.n) || a.id - b.id : a.n.localeCompare(b.n) || a.id - b.id
  );
  /** @type {{ text: string, run: () => void | Promise<void> }[]} */
  const sorts = [];
  for (const [key, label] of /** @type {["size" | "visit" | "name", string][]} */ ([["size", "Sort by size"], ["visit", "Sort by owner's last visit"], ["name", "Sort by owner"]])) {
    if (key !== sort) sorts.push({ text: label, run: () => allClaims(player, key) });
  }
  await menu(
    player,
    "§lAll claims",
    list.length ? `${list.length} claim${list.length === 1 ? "" : "s"}, by ${SORT_NAMES[sort]}. Pick one to remove it.` : "No claims yet.",
    [...sorts, ...list.map((c) => ({
      text: `${c.n}: ${2 * c.r + 1} x ${2 * c.r + 1}, ${span(c)}\n§8${shortDim(c.dim)}, last visit ${lastVisit(c)}, shared with ${c.s.length}`,
      run: () =>
        menu(player, "§lRemove this claim?", `${c.n}'s claim, ${span(c)} (${shortDim(c.dim)}).`, [
          {
            text: "§cRemove it",
            run: () => {
              // Checked again: the player may have been de-opped, or the claim removed, while the menu was open.
              if (!isOp(player)) return player.sendMessage("§cOnly operators can remove other players' claims.");
              if (!claims().has(c.id)) return player.sendMessage("§7That claim is already gone.");
              removeClaim(c.id);
              player.sendMessage(`§aRemoved ${c.n}'s claim ${span(c)}.`);
            },
          },
          { text: "Keep it", run: () => {} },
        ]),
    }))]
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
  for (const c of mine) actions.push({ text: `My claim: ${c.x}, ${c.z}\n§8${shortDim(c.dim)}, shared with ${c.s.length}${c.pt === true ? " and your party" : ""}`, run: () => manage(player, c) });
  if (isOp(player)) actions.push({ text: "§4All claims (operator)\n§8Remove any claim", run: () => allClaims(player) });
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

// Other packs ask whose claims a box reaches into before changing blocks there (Easy Building):
//   realm:claims_check        { id, player, dim, x1, z1, x2, z2 }
//   realm:claims_check_result { id, claims: [{ n, x1, z1, x2, z2 }] }
// `claims` lists (up to 10) the claims overlapping the box that the player may not build in: none while
// claims are disabled. Always answered, so the asker also learns that Land Claims is installed.
/** @param {string} message */
function answerCheck(message) {
  const q = JSON.parse(message);
  if (!q || typeof q !== "object") return;
  const nums = [q.x1, q.z1, q.x2, q.z2].map(Number);
  /** @type {{ n: string, x1: number, z1: number, x2: number, z2: number }[]} */
  const found = [];
  if (enabled() && nums.every(Number.isFinite)) {
    const [ax, az, bx, bz] = nums;
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), z0 = Math.min(az, bz), z1 = Math.max(az, bz);
    const who = world.getAllPlayers().find((p) => p.id === q.player);
    for (const c of claims().values()) {
      if (found.length >= 10) break;
      if (c.dim !== String(q.dim) || c.x + c.r < x0 || c.x - c.r > x1 || c.z + c.r < z0 || c.z - c.r > z1) continue;
      if (who ? allowed(who, c) : c.o === q.player || c.s.some((s) => s.i === q.player)) continue;
      found.push({ n: c.n.slice(0, 32), x1: c.x - c.r, z1: c.z - c.r, x2: c.x + c.r, z2: c.z + c.r });
    }
  }
  system.sendScriptEvent("realm:claims_check_result", JSON.stringify({ id: String(q.id ?? "").slice(0, 32), claims: found }));
}

// Other packs ask which containers a player may not open (Quick Stack & Sort's quick stack, Chest Finder's results):
//   realm:access_check        { id, player, spots: [[dim, x, y, z], ...] }  (at most 40 spots per message)
//   realm:access_check_result { id, from, closed: [i, ...], ours?: [i, ...] } (indexes into that message's spots)
// `closed` lists the spots in someone else's claim, the same rule as opening a chest there: none while claims are
// disabled. `ours` lists the spots in a claim the player owns, is shared on, or shares through their party (not an operator bypass). Always answered, so the asker learns that Land Claims takes part.
/** @param {string} message */
function answerAccess(message) {
  const q = JSON.parse(message);
  if (!q || typeof q !== "object") return;
  /** @type {number[]} */
  const closed = [];
  /** @type {number[]} */
  const ours = [];
  if (enabled() && claims().size && Array.isArray(q.spots)) {
    const pid = String(q.player ?? "");
    const who = world.getAllPlayers().find((p) => p.id === pid);
    q.spots.slice(0, 40).forEach((/** @type {unknown} */ s, /** @type {number} */ i) => {
      if (!Array.isArray(s) || typeof s[0] !== "string" || !Number.isFinite(Number(s[1])) || !Number.isFinite(Number(s[3]))) return;
      const c = claimAt(s[0], { x: Number(s[1]), y: 0, z: Number(s[3]) });
      if (!c) return;
      if (!(who ? allowed(who, c) : c.o === pid || c.s.some((w) => w.i === pid))) closed.push(i);
      else if (c.o === pid || c.s.some((w) => w.i === pid) || (who && partyAllowed(who, c))) ours.push(i);
    });
  }
  system.sendScriptEvent("realm:access_check_result", JSON.stringify({ id: String(q.id ?? "").slice(0, 32), from: "claims_bp", closed, ours }));
}

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
onScriptEvent(
  ["realm:help_ping", "realm:claims_check", "realm:access_check"],
  ({ id, message }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "claims_bp");
    else if (id === "realm:claims_check" || id === "realm:access_check") {
      try {
        if (id === "realm:claims_check") answerCheck(message);
        else answerAccess(message);
      } catch (e) {
        console.warn(`[claims] ${e}`);
      }
    }
  },
);
