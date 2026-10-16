import {
  ButtonState,
  CommandPermissionLevel,
  CustomCommandStatus,
  Entity,
  InputButton,
  Player,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

// Taming: feeding a wild dolphin raw cod or salmon has a chance to tame it. The vanilla feeding still
// happens (the dolphin may lead you to treasure). A tamed dolphin gets the `realm:dolphin_tamed`
// component group from this pack's copy of the vanilla dolphin file: a saddle-free seat
// (minecraft:rideable) and persistence. Everything else (steering, following, calling) is script.

const DOLPHIN = "minecraft:dolphin";
const FISH = new Set(["minecraft:cod", "minecraft:salmon"]);
const PROP_OWNER = "dolphin:owner"; // dolphin: owner's player id
const PROP_OWNER_NAME = "dolphin:ownerName"; // dolphin: owner's name when tamed
const PROP_INDEX = "dolphin:index"; // world: JSON { [entity id]: Known }
const PROP_TAMED = "dolphin:tamedCount"; // player: dolphins tamed ever
const TAME_EVENT = "realm:dolphin_tame";
const RELEASE_EVENT = "realm:dolphin_release";
const RIDDEN_EVENT = "realm:dolphin_ridden"; // no swimming of its own while someone rides it
const UNRIDDEN_EVENT = "realm:dolphin_unridden";
const PROP_RIDDEN = "dolphin:ridden"; // dolphin: true while it has the ridden group
const DIMS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];
const LEAP_COOLDOWN = 30; // ticks

/** @typedef {{ o: string, on: string, n: string, d: string, x: number, y: number, z: number }} Known */

/** @param {number} ticks */
const wait = (ticks) => new Promise((r) => system.runTimeout(() => r(undefined), ticks));
/** @param {Player} p */
const isOp = (p) => p.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
/** @param {import("@minecraft/server").Vector3} a @param {import("@minecraft/server").Vector3} b */
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** @param {string} id */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);

/** @param {Entity} e @returns {string | undefined} */
function ownerOf(e) {
  try {
    const o = e.getDynamicProperty(PROP_OWNER);
    return typeof o === "string" ? o : undefined;
  } catch {
    return undefined;
  }
}

/** @param {Entity} e */
const nameOf = (e) => (e.nameTag ? e.nameTag : "your dolphin");

// ---------------------------------------------------------------------------
// The index of tamed dolphins (for lists while they're far away)
// ---------------------------------------------------------------------------

/** @returns {Record<string, Known>} */
function index() {
  try {
    const raw = world.getDynamicProperty(PROP_INDEX);
    const v = typeof raw === "string" ? JSON.parse(raw) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
/** @param {Record<string, Known>} idx */
const saveIndex = (idx) => world.setDynamicProperty(PROP_INDEX, Object.keys(idx).length ? JSON.stringify(idx) : undefined);

/** @param {Entity} e @param {string} owner @param {string} ownerName */
function remember(e, owner, ownerName) {
  const idx = index();
  const l = e.location;
  idx[e.id] = { o: owner, on: ownerName, n: e.nameTag || "", d: e.dimension.id, x: Math.round(l.x), y: Math.round(l.y), z: Math.round(l.z) };
  saveIndex(idx);
}

/** @param {string} id */
function forget(id) {
  const idx = index();
  if (!idx[id]) return;
  delete idx[id];
  saveIndex(idx);
}

/** @param {string} owner */
const countOf = (owner) => Object.values(index()).filter((k) => k.o === owner).length;

/** Loaded tamed dolphins, optionally only one owner's. @param {string} [owner] @returns {Entity[]} */
function loadedTamed(owner) {
  /** @type {Entity[]} */
  const out = [];
  for (const d of DIMS) {
    try {
      for (const e of world.getDimension(d).getEntities({ type: DOLPHIN })) {
        const o = ownerOf(e);
        if (o && (!owner || o === owner)) out.push(e);
      }
    } catch {
      // dimension not loaded
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Taming
// ---------------------------------------------------------------------------

/**
 * Tames `dolphin` for `player` (checks the limit). Returns why not, or undefined when it worked.
 * @param {Player} player @param {Entity} dolphin
 */
export function tame(player, dolphin) {
  if (ownerOf(dolphin)) return "That dolphin is already tamed.";
  const max = Math.max(1, Math.floor(Number(get("maxPerPlayer")) || 3));
  if (countOf(player.id) >= max) return `You already have ${max} dolphins. Release one first (/realm:dolphin).`;
  dolphin.triggerEvent(TAME_EVENT);
  dolphin.setDynamicProperty(PROP_OWNER, player.id);
  dolphin.setDynamicProperty(PROP_OWNER_NAME, player.name);
  remember(dolphin, player.id, player.name);
  player.setDynamicProperty(PROP_TAMED, (Number(player.getDynamicProperty(PROP_TAMED)) || 0) + 1);
  return undefined;
}

/** @param {Entity} dolphin */
function release(dolphin) {
  dolphin.triggerEvent(RELEASE_EVENT); // also ends the ridden group
  dolphin.setDynamicProperty(PROP_RIDDEN, undefined);
  dolphin.setDynamicProperty(PROP_OWNER, undefined);
  dolphin.setDynamicProperty(PROP_OWNER_NAME, undefined);
  forget(dolphin.id);
}

/** @param {Entity} dolphin @param {string} id */
function burst(dolphin, id) {
  const l = dolphin.location;
  for (let i = 0; i < 5; i++) {
    try {
      dolphin.dimension.spawnParticle(id, { x: l.x + (Math.random() - 0.5), y: l.y + 0.6 + Math.random() * 0.5, z: l.z + (Math.random() - 0.5) });
    } catch {
      // unloaded
    }
  }
}

/**
 * One raw fish fed to a wild dolphin: a chance to tame it.
 * @param {Player} player @param {Entity} dolphin @param {() => number} [random]
 * @returns {"tamed" | "failed" | string} a string other than those is why it couldn't be tried
 */
export function feed(player, dolphin, random = Math.random) {
  if (get("enabled") !== true) return "off";
  if (ownerOf(dolphin)) {
    burst(dolphin, "minecraft:heart_particle");
    return "tamed already";
  }
  const chance = Math.min(100, Math.max(1, Number(get("tameChancePercent")) || 25)) / 100;
  if (random() >= chance) {
    burst(dolphin, "minecraft:basic_smoke_particle");
    return "failed";
  }
  const why = tame(player, dolphin);
  if (why) {
    player.sendMessage(`§c${why}`);
    return why;
  }
  burst(dolphin, "minecraft:heart_particle");
  player.playSound("random.levelup", { pitch: 1.4, volume: 0.7 });
  player.sendMessage("§bThe dolphin trusts you! §7Tap it with an empty hand to ride. Steer where you look, jump at the surface to leap, sneak to get off. /realm:dolphin to name, call or release it.");
  return "tamed";
}

/**
 * After a tap with fish: takes one fish unless the game already did (its own feeding), then rolls.
 * @param {Player} player @param {Entity} target @param {number} slot @param {string} type @param {number} before
 */
function fed(player, target, slot, type, before) {
  if (!player.isValid || !target.isValid || get("enabled") !== true) return;
  if (ownerOf(target)) return void burst(target, "minecraft:heart_particle");
  const inv = player.getComponent("minecraft:inventory")?.container;
  const now = inv?.getItem(slot);
  const used = !now || now.typeId !== type || now.amount < before;
  if (!used) {
    if (!inv || !now) return;
    if (now.amount > 1) {
      now.amount--;
      inv.setItem(slot, now);
    } else inv.setItem(slot, undefined);
  }
  feed(player, target);
}

// Feeding: remember the fish stack before the interaction, and look again a tick later. If the game
// didn't use up a fish itself (its own feeding has a cooldown), this pack takes one.
world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  const { player, target, itemStack } = ev;
  if (target.typeId !== DOLPHIN || !itemStack || !FISH.has(itemStack.typeId)) return;
  const slot = player.selectedSlotIndex;
  const before = itemStack.amount;
  const type = itemStack.typeId;
  system.run(() => {
    try {
      fed(player, target, slot, type, before);
    } catch (e) {
      console.warn(`[dolphin] ${e}`);
    }
  });
});

// For operators and tests (needs cheats): `/scriptevent realm:dolphin_feed` feeds the nearest
// dolphin within 5 blocks the fish in your hand, exactly as a tap would.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, sourceEntity }) => {
    if (id !== "realm:dolphin_feed" || !(sourceEntity instanceof Player) || !isOp(sourceEntity)) return;
    const p = sourceEntity;
    try {
      const item = p.getComponent("minecraft:inventory")?.container?.getItem(p.selectedSlotIndex);
      if (!item || !FISH.has(item.typeId)) return p.sendMessage("§cHold raw cod or salmon.");
      const near = p.dimension.getEntities({ type: DOLPHIN, location: p.location, maxDistance: 5, closest: 1 })[0];
      if (!near) return p.sendMessage("§cNo dolphin within 5 blocks.");
      fed(p, near, p.selectedSlotIndex, item.typeId, item.amount);
    } catch (e) {
      console.warn(`[dolphin] ${e}`);
    }
  },
  { namespaces: ["realm"] },
);

// Only riders allowed by the settings stay on.
world.afterEvents.playerInteractWithEntity.subscribe(({ player, target }) => {
  if (target.typeId !== DOLPHIN) return;
  system.runTimeout(() => {
    try {
      if (!player.isValid || !target.isValid) return;
      const on = mountOf(player);
      if (on && !riders.has(player.id)) {
        riders.set(player.id, { p: player, d: on });
        setRidden(on, true);
      }
      const owner = ownerOf(target);
      if (!owner || owner === player.id || get("othersCanRide") === true) return;
      const ride = target.getComponent("minecraft:rideable");
      if (ride?.getRiders().some((r) => r.id === player.id)) {
        ride.ejectRider(player);
        player.sendMessage(`§7Only ${String(target.getDynamicProperty(PROP_OWNER_NAME) ?? "its owner")} can ride that dolphin.`);
      }
    } catch {
      // gone
    }
  }, 2);
});

world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (deadEntity.typeId !== DOLPHIN) return;
  const idx = index();
  const k = idx[deadEntity.id];
  if (!k) return;
  forget(deadEntity.id);
  online(k.o)?.sendMessage(`§c${k.n || "Your dolphin"} died.`);
});

// ---------------------------------------------------------------------------
// Riding: steer where the rider looks
// ---------------------------------------------------------------------------

/** @type {Map<string, number>} rider id -> tick a leap is ready */
const leapReady = new Map();
world.afterEvents.playerLeave.subscribe(({ playerId }) => leapReady.delete(playerId));

/** The tamed dolphin `p` is riding, if any. @param {Player} p */
function mountOf(p) {
  try {
    const on = p.getComponent("minecraft:riding")?.entityRidingOn;
    return on && on.isValid && on.typeId === DOLPHIN && ownerOf(on) ? on : undefined;
  } catch {
    return undefined;
  }
}

/** Is there air (or nothing solid) just above the dolphin? @param {Entity} d */
function atSurface(d) {
  try {
    const above = d.dimension.getBlock({ x: d.location.x, y: d.location.y + 1.2, z: d.location.z });
    return !!above && !above.isLiquid && above.isAir;
  } catch {
    return false;
  }
}

/**
 * One tick of steering: speed up toward where the rider looks (forward and back on the move stick,
 * a little sideways for strafing), capped at maxSpeed.
 * @param {Player} p @param {Entity} d
 */
export function steer(p, d) {
  if (!d.isInWater) return; // in the air or on land the dolphin is on its own (gravity, flopping)
  let fwd = 0;
  let side = 0;
  try {
    const mv = p.inputInfo.getMovementVector();
    fwd = mv.y;
    side = mv.x;
  } catch {
    // no input info: drift
  }
  const view = p.getViewDirection();
  const flat = Math.hypot(view.x, view.z) || 1;
  // left of the view on the horizontal plane
  const left = { x: view.z / flat, y: 0, z: -view.x / flat };
  const max = Math.min(24, Math.max(4, Number(get("maxSpeed")) || 12)) / 20; // blocks per tick
  const accel = Math.max(0.01, Number(CONFIG.acceleration) || 1.6) / 20;
  const target = {
    x: (view.x * fwd + left.x * side * 0.5) * max,
    y: view.y * fwd * max,
    z: (view.z * fwd + left.z * side * 0.5) * max,
  };
  const v = d.getVelocity();
  const dv = { x: target.x - v.x, y: target.y - v.y, z: target.z - v.z };
  const len = Math.hypot(dv.x, dv.y, dv.z);
  if (fwd === 0 && side === 0) {
    // no input: glide to a stop, slowly
    d.applyImpulse({ x: -v.x * 0.08, y: -v.y * 0.08, z: -v.z * 0.08 });
  } else if (len > 0.0001) {
    const k = Math.min(1, accel / len);
    d.applyImpulse({ x: dv.x * k, y: dv.y * k, z: dv.z * k });
  }
  const rot = p.getRotation();
  d.setRotation({ x: rot.x, y: rot.y });
}

/** A leap out of the water, when jumping at the surface. @param {Player} p @param {Entity} d @returns {boolean} */
export function leap(p, d) {
  if (!d.isInWater || !atSurface(d)) return false;
  if ((leapReady.get(p.id) ?? 0) > system.currentTick) return false;
  leapReady.set(p.id, system.currentTick + LEAP_COOLDOWN);
  const view = p.getViewDirection();
  const flat = Math.hypot(view.x, view.z) || 1;
  const up = Math.min(2, Math.max(0.2, Number(CONFIG.leapStrength) || 0.9));
  d.applyImpulse({ x: (view.x / flat) * 0.5, y: up, z: (view.z / flat) * 0.5 });
  try {
    d.dimension.playSound("mob.dolphin.jump", d.location, { volume: 0.8 });
    d.dimension.spawnParticle("minecraft:water_splash_particle_manual", d.location);
  } catch {
    // unloaded
  }
  return true;
}

/**
 * A rider breathes under water, like on a nautilus: a short Water Breathing, topped up while they ride, that runs
 * out about 3 seconds after they get off. A longer one (a potion) is left alone.
 * @param {Player} p
 */
function breathe(p) {
  if (get("riderWaterBreathing") !== true) return;
  const now = p.getEffect("water_breathing");
  if (now && now.duration > 30) return;
  p.addEffect("water_breathing", 60, { amplifier: 0, showParticles: false });
}

/**
 * A ridden dolphin swims only where its rider steers: its own swimming (random swims, breaching, following boats and
 * players) stops while the `realm:dolphin_ridden` group sets its movement to 0. Steering pushes it directly, so it
 * still goes where the rider looks. The group also lets it breathe water, since it can't swim up for air any more.
 * @param {Entity} d @param {boolean} on
 */
function setRidden(d, on) {
  try {
    if (!d.isValid || (d.getDynamicProperty(PROP_RIDDEN) === true) === on) return;
    d.triggerEvent(on ? RIDDEN_EVENT : UNRIDDEN_EVENT);
    d.setDynamicProperty(PROP_RIDDEN, on ? true : undefined);
  } catch {
    // unloaded
  }
}

/** Players riding a tamed dolphin, steered every tick. Everyone else is looked at every 5 ticks, and at once when they tap a dolphin. @type {Map<string, { p: Player, d: Entity }>} */
const riders = new Map();

/** @param {string} id */
function dropRider(id) {
  const r = riders.get(id);
  riders.delete(id);
  if (r) setRidden(r.d, false);
}

system.runInterval(() => {
  if (get("enabled") !== true) return;
  for (const p of world.getAllPlayers()) {
    if (riders.has(p.id)) continue;
    const d = mountOf(p);
    if (!d) continue;
    riders.set(p.id, { p, d });
    setRidden(d, true);
  }
}, 5);

system.runInterval(() => {
  if (!riders.size) return;
  if (get("enabled") !== true) {
    for (const id of [...riders.keys()]) dropRider(id);
    return;
  }
  for (const [id, r] of riders) {
    const p = r.p;
    const d = p.isValid ? mountOf(p) : undefined;
    if (!d) {
      dropRider(id);
      continue;
    }
    if (d.id !== r.d.id) {
      // straight onto another dolphin
      setRidden(r.d, false);
      r.d = d;
      setRidden(d, true);
    }
    try {
      // A leap tick has no steering push, so leaps stay as high as before.
      if (!(p.isJumping && leap(p, d))) steer(p, d);
      if (system.currentTick % 10 === 0) breathe(p);
    } catch (e) {
      console.warn(`[dolphin] ${e}`);
    }
  }
}, 1);

// Sneak gets you off (the game does this too; this makes sure on every device).
world.afterEvents.playerButtonInput.subscribe(
  ({ player }) => {
    const d = mountOf(player);
    if (!d) return;
    try {
      d.getComponent("minecraft:rideable")?.ejectRider(player);
    } catch {
      // already off
    }
  },
  { buttons: [InputButton.Sneak], state: ButtonState.Pressed },
);

// ---------------------------------------------------------------------------
// Following, and keeping the index's positions fresh
// ---------------------------------------------------------------------------

system.runInterval(() => {
  if (get("enabled") !== true) {
    // nobody steers while disabled: every dolphin swims on its own (also one unloaded when the pack was disabled)
    for (const d of loadedTamed()) setRidden(d, false);
    return;
  }
  const follow = Math.max(2, Number(CONFIG.followDistance) || 8);
  const idx = index();
  let changed = false;
  for (const d of loadedTamed()) {
    try {
      const owner = ownerOf(d);
      const k = idx[d.id];
      if (!owner) continue;
      if (!k) {
        idx[d.id] = { o: owner, on: String(d.getDynamicProperty(PROP_OWNER_NAME) ?? ""), n: d.nameTag || "", d: d.dimension.id, x: 0, y: 0, z: 0 };
        changed = true;
      }
      const known = idx[d.id];
      const l = d.location;
      const at = { x: Math.round(l.x), y: Math.round(l.y), z: Math.round(l.z) };
      if (known.x !== at.x || known.y !== at.y || known.z !== at.z || known.d !== d.dimension.id || known.n !== (d.nameTag || "")) {
        Object.assign(known, at, { d: d.dimension.id, n: d.nameTag || "" });
        changed = true;
      }
      if (d.getComponent("minecraft:rideable")?.getRiders().length) continue;
      // nobody on it (the rider left, or the realm restarted mid-ride): it swims on its own again
      setRidden(d, false);
      const p = online(owner);
      if (!p || p.dimension.id !== d.dimension.id || !p.isInWater || !d.isInWater) continue;
      const gap = dist(p.location, l);
      if (gap <= follow || gap > 64) continue;
      const s = 0.35 / gap;
      d.applyImpulse({ x: (p.location.x - l.x) * s, y: (p.location.y - l.y) * s * 0.5, z: (p.location.z - l.z) * s });
    } catch {
      // gone
    }
  }
  if (changed) saveIndex(idx);
}, 20);

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

/** @param {Player} p @param {Known} k */
function where(p, k) {
  if (k.d !== p.dimension.id) return k.d.replace("minecraft:", "").replace("_", " ");
  return `${Math.round(dist(p.location, k))}m away`;
}

/** @param {Player} p */
async function menu(p) {
  const mine = Object.entries(index()).filter(([, k]) => k.o === p.id);
  const max = Math.max(1, Math.floor(Number(get("maxPerPlayer")) || 3));
  const body = [
    get("enabled") === true ? "" : "§cTaming and riding are disabled on this realm.§r\n",
    `Your dolphins: ${mine.length} of ${max}`,
    "",
    `Tame a dolphin by feeding it raw cod or salmon (${Math.round(Number(get("tameChancePercent")) || 25)}% per fish). Tap a tamed dolphin with an empty hand to ride: it goes where you look. Jump at the surface to leap, sneak to get off.`,
  ].join("\n");
  /** @type {{ label: string, run: () => unknown }[]} */
  const items = [
    { label: "My dolphins", run: () => listMine(p) },
    { label: "Call the nearest\n§8It swims to you", run: () => callNearest(p) },
  ];
  if (isOp(p)) items.push({ label: "Operator tools", run: () => opMenu(p) });
  items.push({ label: "Close", run: () => undefined });
  const form = new ActionFormData().title("§lDolphin Friends").body(body);
  for (const it of items) form.button(it.label);
  const res = await show(p, form);
  if (!res || res.canceled || res.selection === undefined) return;
  await items[res.selection]?.run();
}

/** @param {Player} p */
async function listMine(p) {
  const mine = Object.entries(index()).filter(([, k]) => k.o === p.id);
  if (!mine.length) return p.sendMessage("§7You have no tamed dolphins yet. Feed a dolphin raw cod or salmon.");
  const form = new ActionFormData().title("§lMy dolphins").body("Pick one to call, name or release.");
  for (const [, k] of mine) form.button(`${k.n || "Dolphin"}\n§8${where(p, k)}`);
  form.button("Back");
  const res = await show(p, form);
  if (!res || res.canceled || res.selection === undefined) return;
  const chosen = mine[res.selection];
  if (!chosen) return menu(p);
  await dolphinMenu(p, chosen[0], chosen[1]);
}

/** @param {string} id @returns {Entity | undefined} */
function loadedById(id) {
  try {
    const e = world.getEntity(id);
    return e && e.isValid ? e : undefined;
  } catch {
    return undefined;
  }
}

/** @param {Player} p @param {string} id @param {Known} k */
async function dolphinMenu(p, id, k) {
  const form = new ActionFormData()
    .title(`§l${k.n || "Dolphin"}`)
    .body(`Last seen at ${k.x}, ${k.y}, ${k.z} (${where(p, k)}).`)
    .button("Call\n§8It swims to you")
    .button("Name")
    .button("Release\n§8It goes back to the wild")
    .button("Back");
  const res = await show(p, form);
  if (!res || res.canceled || res.selection === undefined) return;
  if (res.selection === 3) return listMine(p);
  const e = loadedById(id);
  if (!e) return p.sendMessage("§7That dolphin is too far away (its area isn't loaded). Go closer, then try again.");
  // The list may be old: an operator may have released it, and someone else tamed it since.
  if (ownerOf(e) !== p.id) {
    if (index()[id]?.o === p.id) forget(id);
    return p.sendMessage("§7That dolphin isn't yours any more.");
  }
  if (res.selection === 0) return call(p, e);
  if (res.selection === 1) return rename(p, e);
  const ok = await show(p, new ActionFormData().title("§lRelease?").body(`${nameOf(e)} goes back to the wild and can't be ridden until tamed again.`).button("Release").button("Keep"));
  if (!ok || ok.canceled || ok.selection !== 0 || !e.isValid || ownerOf(e) !== p.id) return;
  release(e);
  p.sendMessage(`§7You released ${nameOf(e)}. Bye!`);
}

/** @param {Player} p @param {Entity} e */
function call(p, e) {
  if (get("enabled") !== true) return p.sendMessage("§7Taming and riding are disabled on this realm.");
  if (e.dimension.id !== p.dimension.id) return p.sendMessage("§7That dolphin is in another dimension.");
  if (!p.isInWater) return p.sendMessage("§7Get in the water first, then call your dolphin.");
  const d = dist(p.location, e.location);
  if (d > 128) return p.sendMessage("§7That dolphin is too far to hear you (over 128 blocks).");
  e.teleport({ x: p.location.x + 1, y: p.location.y, z: p.location.z + 1 }, { dimension: p.dimension });
  burst(e, "minecraft:heart_particle");
  p.playSound("mob.dolphin.play", { volume: 0.8 });
  p.sendMessage(`§b${nameOf(e)} swam over to you.`);
}

/** @param {Player} p */
function callNearest(p) {
  const mine = loadedTamed(p.id).filter((e) => e.dimension.id === p.dimension.id);
  if (!mine.length) return p.sendMessage("§7None of your dolphins is nearby (in a loaded area of this dimension).");
  mine.sort((a, b) => dist(p.location, a.location) - dist(p.location, b.location));
  call(p, mine[0]);
}

/** @param {Player} p @param {Entity} e */
async function rename(p, e) {
  const res = await show(p, new ModalFormData().title("§lName your dolphin").textField("Name", "Splash", { defaultValue: e.nameTag || "" }).submitButton("Save"));
  if (!res || res.canceled || !res.formValues || !e.isValid || ownerOf(e) !== p.id) return;
  const name =String(res.formValues[0] ?? "").replace(/[^\x20-\x7e]/g, "").trim().slice(0, 24);
  if (!name) return p.sendMessage("§7No name saved.");
  e.nameTag = name;
  remember(e, p.id, p.name);
  p.sendMessage(`§bYour dolphin is now called ${name}.`);
}

/** @param {Player} op */
async function opMenu(op) {
  const all = Object.entries(index());
  const body = all.length ? all.slice(0, 40).map(([, k]) => `${k.n || "Dolphin"} §7(${k.on}) ${k.d.replace("minecraft:", "")} ${k.x}, ${k.y}, ${k.z}`).join("\n") : "No tamed dolphins.";
  const res = await show(op, new ActionFormData().title("§lDolphins: operator tools").body(`${all.length} tamed dolphins:\n${body}`).button("Release the dolphin I look at").button("Back"));
  if (!res || res.canceled || res.selection !== 0 || !op.isValid) return res?.selection === 1 && op.isValid ? menu(op) : undefined;
  if (!isOp(op)) return op.sendMessage("§cOnly operators can release other players' dolphins."); // de-opped while the form was open
  const hit = op.getEntitiesFromViewDirection({ maxDistance: 16, type: DOLPHIN })[0]?.entity;
  if (!hit || !ownerOf(hit)) return op.sendMessage("§cLook at a tamed dolphin (within 16 blocks).");
  const owner = String(hit.getDynamicProperty(PROP_OWNER_NAME) ?? "someone");
  release(hit);
  op.sendMessage(`§aReleased ${owner}'s dolphin.`);
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
      if (r instanceof Promise) r.catch((e) => console.warn(`[dolphin] ${e}`));
    } catch (e) {
      console.warn(`[dolphin] ${e}`);
    }
  });
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    { name: "realm:dolphin", description: "Dolphin Friends: your tamed dolphins (call, name, release)", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => {
      const p = playerOf(origin);
      if (!p) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      later(() => menu(p));
      return { status: CustomCommandStatus.Success };
    },
  );
  customCommandRegistry.registerCommand(
    { name: "realm:dolphin_call", description: "Dolphin Friends: call your nearest tamed dolphin", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => {
      const p = playerOf(origin);
      if (!p) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      later(() => callNearest(p));
      return { status: CustomCommandStatus.Success };
    },
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "dolphin_bp");
  },
  { namespaces: ["realm"] },
);
