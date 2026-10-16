import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  EquipmentSlot,
  GameMode,
  ItemStack,
  Player,
  system,
  world,
} from "@minecraft/server";
import { CONFIG } from "./config.js";
import { get, getFor, setFor } from "./settings.js";
import { isSlot, sideBoxes } from "./side.js";

// While a player glides, a few times a second, the bar above the hotbar shows their speed, height,
// elytra durability left and firework rockets (plus NOS Rockets when carried). Players who aren't
// gliding cost one property read. Each player's "off" preference (in elytra:pref) is shared with /realm:prefs.

const DISABLED = "The Elytra HUD is disabled on this realm. An operator can enable it in /realm:config (Elytra HUD).";
const ROCKET = "minecraft:firework_rocket";
const NOS_ROCKET = "custom:nos_rocket";
const NOS_COOLDOWN_TICKS = 4;

/** @param {Player} player */
const hudOff = (player) => getFor(player, "off") === true;

/** Firework rockets and NOS rockets in the inventory and the offhand. @param {Player} player */
function rocketCounts(player) {
  let rockets = 0;
  let nos = 0;
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (inv) {
    for (let i = 0; i < inv.size; i++) {
      const item = inv.getItem(i);
      if (item?.typeId === ROCKET) rockets += item.amount;
      else if (item?.typeId === NOS_ROCKET) nos += item.amount;
    }
  }
  const off = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Offhand);
  if (off?.typeId === ROCKET) rockets += off.amount;
  else if (off?.typeId === NOS_ROCKET) nos += off.amount;
  return { rockets, nos };
}

/** Durability left of what's in the chest slot, as "§a87%", or "§7--" when it has none. @param {Player} player */
function elytraLeft(player) {
  const chest = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Chest);
  const dur = chest?.getComponent("minecraft:durability");
  if (!dur || dur.maxDurability <= 0) return "§7--";
  const pct = Math.max(0, Math.floor(((dur.maxDurability - dur.damage) / dur.maxDurability) * 100));
  const color = pct <= get("lowPercent") ? "§c" : pct <= 30 ? "§e" : "§a";
  return `${color}${pct}%`;
}

/** @param {Player} player @param {string} [gap] between speed and height and the rest: two lines in a side box */
function hud(player, gap = "  ") {
  const v = player.getVelocity(); // blocks per tick
  const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) * 20;
  const y = Math.floor(player.location.y);
  const { rockets: n, nos } = rocketCounts(player);
  const nosPart = nos > 0 ? `  §bNOS ${nos}` : "";
  return `§b${speed.toFixed(1)} blocks/s  §fY ${y}${gap}§fElytra ${elytraLeft(player)}  ${n ? "§e" : "§7"}Rockets ${n}${nosPart}`;
}

// ---------------------------------------------------------------------------
// NOS Rocket propulsion (custom:nos_rocket)
// ---------------------------------------------------------------------------

/** player id -> tick of the last NOS Rocket activation */
const lastNosTick = new Map();
/** player id -> active NOS burst state { remaining: number, maxSpeed: number, stepThrust: number } */
const activeNosBursts = new Map();

/**
 * Normalizes a 3D vector, returning { x: 0, y: 0, z: 1 } if zero-length.
 * @param {{ x: number, y: number, z: number }} v
 */
function normalize3(v) {
  const len = Math.hypot(v.x, v.y, v.z);
  return len > 1e-6 ? { x: v.x / len, y: v.y / len, z: v.z / len } : { x: 0, y: 0, z: 1 };
}

/**
 * Clamps a 3D velocity vector to vertical bounds [-2.2, 2.4] and horizontal/total maxSpeed.
 * @param {{ x: number, y: number, z: number }} v
 * @param {number} maxSpeed
 */
function clampFlightVelocity(v, maxSpeed) {
  let vx = v.x;
  let vy = Math.max(-2.2, Math.min(2.4, v.y));
  let vz = v.z;
  const horiz = Math.hypot(vx, vz);
  if (horiz > maxSpeed && horiz > 0) {
    const hScale = maxSpeed / horiz;
    vx *= hScale;
    vz *= hScale;
  }
  const total = Math.hypot(vx, vy, vz);
  if (total > maxSpeed && total > 0) {
    const scale = maxSpeed / total;
    vx *= scale;
    vy *= scale;
    vz *= scale;
  }
  return { x: vx, y: vy, z: vz };
}

/**
 * Applies target velocity to a gliding player, trying applyImpulse first and falling back to applyKnockback.
 * @param {Player} player
 * @param {{ x: number, y: number, z: number }} currentVelocity
 * @param {{ x: number, y: number, z: number }} newVelocity
 */
function applyPropulsion(player, currentVelocity, newVelocity) {
  try {
    player.applyImpulse({
      x: newVelocity.x - currentVelocity.x,
      y: newVelocity.y - currentVelocity.y,
      z: newVelocity.z - currentVelocity.z,
    });
  } catch {
    player.applyKnockback({ x: newVelocity.x, z: newVelocity.z }, newVelocity.y);
  }
}

/**
 * Consumes 1 custom:nos_rocket from the player's mainhand or offhand (unless in Creative).
 * @param {Player} player @returns {boolean} true if the player held a NOS Rocket (and consumed 1 if not Creative)
 */
function consumeNosRocket(player) {
  const equip = player.getComponent("minecraft:equippable");
  if (!equip) return false;
  for (const slot of [EquipmentSlot.Mainhand, EquipmentSlot.Offhand]) {
    const item = equip.getEquipment(slot);
    if (item?.typeId !== NOS_ROCKET || item.amount <= 0) continue;
    if (player.getGameMode() !== GameMode.Creative) {
      if (item.amount > 1) {
        item.amount -= 1;
        equip.setEquipment(slot, item);
      } else {
        equip.setEquipment(slot, undefined);
      }
    }
    return true;
  }
  return false;
}

/**
 * Spawns blue/cyan nitrous flame particles with orange spark accents along the gliding player's flight path
 * (both in front/beside the wings so first-person players see the nitrous slipstream, and at the tail so
 * third-person players and bystanders see a blazing cyan-blue & orange afterburner trail).
 * @param {Player} player
 * @param {{ x: number, y: number, z: number }} forward
 * @param {"spool" | "boost" | "flutter"} phase
 */
function spawnNosParticles(player, forward, phase) {
  const dim = player.dimension;
  const pos = player.location;
  const head = player.getHeadLocation();
  const rLen = Math.hypot(forward.z, forward.x);
  const right = rLen > 1e-4 ? { x: -forward.z / rLen, z: forward.x / rLen } : { x: 1, z: 0 };
  const jitter = (/** @type {number} */ s) => (Math.random() - 0.5) * s * 2;
  const emit = (/** @type {string} */ id, /** @type {{ x: number, y: number, z: number }} */ at) => {
    try {
      dim.spawnParticle(id, at);
    } catch {
      // unloaded or unsupported particle
    }
  };

  // 1) Forward/wingtip slipstream corridor (ahead of the camera so at high speed the player flies
  // directly through glowing cyan sparks and orange flames in both 1st and 3rd person)
  for (const side of [-1, 1]) {
    const d = phase === "spool" ? 1.4 + Math.random() * 1.4 : 1.8 + Math.random() * 2.4;
    const w = (0.45 + Math.random() * 0.35) * side;
    const wingPt = {
      x: head.x + forward.x * d + right.x * w + jitter(0.15),
      y: head.y + forward.y * d - 0.25 + jitter(0.15),
      z: head.z + forward.z * d + right.z * w + jitter(0.15),
    };
    emit("realm:sky_spark", wingPt);
    emit("minecraft:blue_flame_particle", wingPt);
    if (phase === "boost" || phase === "flutter") {
      emit("realm:trail_ember", wingPt);
      emit("minecraft:basic_flame_particle", wingPt);
    }
  }

  // 2) Core afterburner stream along the body
  const steps = phase === "boost" ? 4 : phase === "flutter" ? 2 : 1;
  for (let i = 0; i < steps; i++) {
    const along = -0.2 + i * 0.85;
    const corePt = {
      x: pos.x + forward.x * along + jitter(0.22),
      y: pos.y + 0.4 + forward.y * along + jitter(0.18),
      z: pos.z + forward.z * along + jitter(0.22),
    };
    emit("realm:sky_spark", corePt);
    emit("minecraft:blue_flame_particle", corePt);
    if (phase === "boost" || phase === "flutter") {
      emit("realm:trail_ember", corePt);
      emit("minecraft:basic_flame_particle", corePt);
    }
    if (phase === "boost" && i === 0) emit("minecraft:lava_particle", corePt);
  }
}

/**
 * Plays the custom RB26 turbo spool + wastegate flutter ("stu-tu-tu-tu") audio (`realm.nos.boost`),
 * timed with an afterburner punch at tick 7 when full boost kicks in.
 * @param {Player} player
 */
function playNosAudio(player) {
  const dim = player.dimension;
  try {
    player.playSound("realm.nos.boost", { volume: 1.0, pitch: 1.0 });
  } catch {
    // ignore audio error
  }
  try {
    dim.playSound("realm.nos.boost_world", player.location, { volume: 1.3, pitch: 1.0 });
  } catch {
    // ignore audio error
  }
  try {
    player.playSound("random.fizz", { volume: 0.55, pitch: 1.65 });
  } catch {
    // ignore audio error
  }
  // At tick 7 (0.35s), right as the turbo finishes spooling up, hit the afterburner kick sound
  system.runTimeout(() => {
    if (!player.isValid || !player.isGliding) return;
    try {
      player.playSound("firework.launch", { volume: 0.9, pitch: 0.85 });
      player.playSound("mob.breeze.wind_burst", { volume: 0.85, pitch: 1.2 });
    } catch {
      // ignore audio error
    }
  }, 7);
}

/**
 * Attempts to fire a NOS Rocket for `player`.
 * @param {Player} player
 */
function triggerNosRocket(player) {
  if (!player.isValid || get("nosEnabled") === false) return;
  const now = system.currentTick;
  if (now - (lastNosTick.get(player.id) ?? -Infinity) < NOS_COOLDOWN_TICKS) return;
  if (!player.isGliding || player.isOnGround) {
    lastNosTick.set(player.id, now);
    try {
      player.onScreenDisplay.setActionBar("§bNOS Rocket: §7use while gliding with an elytra");
    } catch {
      // ignore display error
    }
    return;
  }
  if (!consumeNosRocket(player)) return;
  lastNosTick.set(player.id, now);

  const baseline = Math.max(0.1, Number(get("nosBaseline")) || CONFIG.nosBaseline);
  const multiplier = Math.max(1, Number(get("nosMultiplier")) || CONFIG.nosMultiplier);
  const maxSpeed = Math.max(1, Number(get("nosMaxSpeed")) || CONFIG.nosMaxSpeed);
  const burstTicks = Math.max(1, Math.floor(Number(get("nosBurstTicks")) || CONFIG.nosBurstTicks));
  const boostStrength = baseline * multiplier;

  playNosAudio(player);

  // 3-stage turbo curve (60 ticks / 3.0s total):
  //   - Spool-up: ticks 1..7 (0.35s)
  //   - Sustained full 3.5x boost hold: ticks 8..(7 + burstTicks) (default 30 ticks = 1.5s at peak speed)
  //   - Wastegate flutter ("stu-tu-tu-tu") & smooth momentum taper: 22 ticks (1.1s)
  const currentVelocity = player.getVelocity();
  const forward = normalize3(player.getViewDirection());
  const spoolInitial = clampFlightVelocity(
    {
      x: currentVelocity.x + forward.x * (baseline * 0.45),
      y: currentVelocity.y + forward.y * (baseline * 0.45),
      z: currentVelocity.z + forward.z * (baseline * 0.45),
    },
    maxSpeed
  );
  applyPropulsion(player, currentVelocity, spoolInitial);
  spawnNosParticles(player, forward, "spool");

  const spoolTicks = 7;
  const boostEndTick = spoolTicks + Math.max(10, burstTicks);
  activeNosBursts.set(player.id, {
    tick: 1,
    spoolTicks,
    boostEndTick,
    totalTicks: boostEndTick + 22,
    maxSpeed,
    boostStrength,
    baseline,
  });
}

// Guard against accidental block interaction consumption when holding custom:nos_rocket while gliding.
world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  if (event.itemStack?.typeId !== NOS_ROCKET) return;
  if (get("nosEnabled") === false) return;
  const player = event.player;
  if (player.isGliding && !player.isOnGround) {
    event.cancel = true;
    system.run(() => triggerNosRocket(player));
  }
});

world.beforeEvents.itemUse.subscribe((event) => {
  if (event.itemStack?.typeId !== NOS_ROCKET) return;
  const source = event.source;
  if (!(source instanceof Player)) return;
  system.run(() => triggerNosRocket(source));
});

world.afterEvents.itemStartUse.subscribe((event) => {
  if (event.itemStack?.typeId !== NOS_ROCKET) return;
  if (!(event.source instanceof Player)) return;
  triggerNosRocket(event.source);
});

world.afterEvents.itemUse.subscribe((event) => {
  if (event.itemStack?.typeId !== NOS_ROCKET) return;
  if (!(event.source instanceof Player)) return;
  triggerNosRocket(event.source);
});

// Choreograph the 3-stage turbo curve:
//   1. Spool-up (ticks 1..7): smooth intake pressure ramp + blue sparks
//   2. Full Boost Hold (ticks 8..boostEndTick): sustained 3.5x nitrous speed + blazing cyan/orange plume
//   3. Wastegate Flutter & Taper (boostEndTick+1..totalTicks): smooth speed taper + "stu-tu-tu-tu" flame pops
system.runInterval(() => {
  if (!activeNosBursts.size) return;
  for (const [playerId, burst] of activeNosBursts) {
    const player = world.getAllPlayers().find((p) => p.id === playerId);
    if (!player || !player.isValid || !player.isGliding || player.isOnGround || get("nosEnabled") === false) {
      activeNosBursts.delete(playerId);
      continue;
    }
    try {
      const forward = normalize3(player.getViewDirection());
      const currentVelocity = player.getVelocity();
      if (burst.tick <= burst.spoolTicks) {
        // Stage 1: Turbo spooling up (gentle progressive pull)
        const ramp = (burst.tick / burst.spoolTicks) * (burst.baseline * 0.38);
        const nextVel = clampFlightVelocity(
          {
            x: currentVelocity.x + forward.x * ramp,
            y: currentVelocity.y + forward.y * ramp,
            z: currentVelocity.z + forward.z * ramp,
          },
          burst.maxSpeed
        );
        applyPropulsion(player, currentVelocity, nextVel);
        spawnNosParticles(player, forward, "spool");
      } else if (burst.tick <= burst.boostEndTick) {
        // Stage 2: Full turbo boost kicks in and holds peak speed against Elytra drag
        const isKickTick = burst.tick <= burst.spoolTicks + 3;
        const stepAdd = isKickTick ? burst.boostStrength * 0.65 : burst.boostStrength * 0.35;
        const curSpeed = Math.hypot(currentVelocity.x, currentVelocity.y, currentVelocity.z);
        const targetSpeed = Math.min(burst.maxSpeed, Math.max(curSpeed, burst.boostStrength));
        const steered = clampFlightVelocity(
          {
            x: currentVelocity.x * 0.32 + forward.x * (targetSpeed * 0.68 + stepAdd),
            y: currentVelocity.y * 0.32 + forward.y * (targetSpeed * 0.68 + stepAdd),
            z: currentVelocity.z * 0.32 + forward.z * (targetSpeed * 0.68 + stepAdd),
          },
          burst.maxSpeed
        );
        applyPropulsion(player, currentVelocity, steered);
        spawnNosParticles(player, forward, "boost");
      } else {
        // Stage 3: Wastegate flutter ("stu-tu-tu-tu") + gradual momentum taper so speed carries much longer
        const taperTick = burst.tick - burst.boostEndTick;
        const taperTotal = Math.max(1, burst.totalTicks - burst.boostEndTick);
        const taperFrac = Math.max(0, 1 - taperTick / taperTotal);
        const holdSpeed = burst.boostStrength * (0.45 + 0.55 * taperFrac);
        const curSpeed = Math.hypot(currentVelocity.x, currentVelocity.y, currentVelocity.z);
        if (curSpeed < holdSpeed) {
          const steered = clampFlightVelocity(
            {
              x: currentVelocity.x * 0.6 + forward.x * (holdSpeed * 0.4),
              y: currentVelocity.y * 0.6 + forward.y * (holdSpeed * 0.4),
              z: currentVelocity.z * 0.6 + forward.z * (holdSpeed * 0.4),
            },
            burst.maxSpeed
          );
          applyPropulsion(player, currentVelocity, steered);
        }
        if (taperTick % 3 === 1) {
          spawnNosParticles(player, forward, "flutter");
        }
      }
    } catch {
      activeNosBursts.delete(playerId);
      continue;
    }
    burst.tick += 1;
    if (burst.tick > burst.totalTicks) activeNosBursts.delete(playerId);
  }
}, 1);

const INTERVAL = Math.max(1, CONFIG.intervalTicks);
/** How long (ticks) each request asks the Coordinates HUD to leave the action bar alone; renewed every third of that while gliding. */
const HOLD_TICKS = Math.max(30, INTERVAL * 3);
/** player id -> tick of the last realm:actionbar request */
const heldAt = new Map();

/** player id -> tick until which another pack's note above the hotbar (realm:actionbar) is left alone */
const barHeld = new Map();
/** The HUD's rank among steady lines (`steady` in its `realm:actionbar`): the highest, so the others wait while it glides. */
const STEADY = 50;

// Other packs' notes (a durability warning, skill XP, mob health) stay readable: above the hotbar the HUD
// skips its redraws while one lasts, and keeps asking steady lines to wait. A `background` steady line
// (the Party HUD) and a lower steady line (`steady` below ours, or equal from a pack named after ours) wait
// for this HUD instead.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:actionbar") return;
    try {
      const m = JSON.parse(message);
      if (!m || typeof m.player !== "string" || m.from === "elytra_bp" || m.background) return;
      if (Number.isFinite(m.steady) && (m.steady < STEADY || (m.steady === STEADY && String(m.from) > "elytra_bp"))) return;
      const until = system.currentTick + Math.min(200, Math.max(0, Number(m.ticks) || 0));
      if (until > (barHeld.get(m.player) ?? 0)) barHeld.set(m.player, until);
    } catch {
      // not ours
    }
  },
  { namespaces: ["realm"] }
);

const side = sideBoxes("elytra");
/** player id -> whether the HUD showed in a side box last round, so landing takes it off right away */
const inBox = new Set();

system.runInterval(() => {
  if (get("enabled") !== true) return;
  const now = system.currentTick;
  for (const player of world.getAllPlayers()) {
    try {
      const where = getFor(player, "where");
      if (!player.isGliding || hudOff(player) || where === "hotbar") {
        // Landed (or switched to the hotbar): take the box away now instead of when it runs out.
        if (inBox.delete(player.id)) side.clear(player);
        if (!player.isGliding || hudOff(player)) continue;
      }
      if (isSlot(where)) {
        side.show(player, where, hud(player, "\n"), INTERVAL + 10);
        inBox.add(player.id);
        continue;
      }
      // Ask the Coordinates HUD, if installed, to leave the action bar to this HUD while gliding.
      if (now - (heldAt.get(player.id) ?? -Infinity) >= HOLD_TICKS / 3) {
        heldAt.set(player.id, now);
        system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: player.id, ticks: HOLD_TICKS, from: "elytra_bp", steady: STEADY }));
      }
      if ((barHeld.get(player.id) ?? 0) > now) continue;
      player.onScreenDisplay.setActionBar(hud(player));
    } catch {
      // left or changed dimension meanwhile
    }
  }
}, INTERVAL);

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  heldAt.delete(playerId);
  barHeld.delete(playerId);
  inBox.delete(playerId);
  lastNosTick.delete(playerId);
  activeNosBursts.delete(playerId);
});

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:elytra",
      description: "Enable or disable the elytra HUD (speed, height, durability, rockets) for yourself",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      if (get("enabled") !== true) return { status: CustomCommandStatus.Failure, message: DISABLED };
      const nowOff = !hudOff(player);
      system.run(() => setFor(player, "off", nowOff));
      return {
        status: CustomCommandStatus.Success,
        message: nowOff
          ? "Elytra HUD: Disabled. Run /realm:elytra again to enable it."
          : "Elytra HUD: Enabled. It shows while you glide.",
      };
    }
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:elytra_nos",
      description: "Give yourself NOS Rockets (custom:nos_rocket) for an elytra nitrous boost",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      optionalParameters: [{ name: "count", type: CustomCommandParamType.Integer }],
    },
    (origin, /** @type {number | undefined} */ count) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      const amount = Math.min(64, Math.max(1, Math.floor(count ?? 16)));
      system.run(() => {
        try {
          const stack = new ItemStack(NOS_ROCKET, amount);
          const inv = player.getComponent("minecraft:inventory")?.container;
          const rest = inv ? inv.addItem(stack) : stack;
          if (rest) player.dimension.spawnItem(rest, player.location);
        } catch (e) {
          console.warn(`[elytra] ${e}`);
        }
      });
      return {
        status: CustomCommandStatus.Success,
        message: `Gave ${amount} NOS Rocket${amount === 1 ? "" : "s"}.`,
      };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "elytra_bp");
  },
  { namespaces: ["realm"] }
);
