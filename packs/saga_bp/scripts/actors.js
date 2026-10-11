// Story characters and story mobs the pack spawns for one player's scene: who they belong to, keeping
// them where they should be, and cleaning them up. Imports only util.js.
import { system, world } from "@minecraft/server";
import { DIMENSIONS, dist3, hash } from "./util.js";

/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

/** Every story character (meet, escort, ward, guard, lead animal). */
export const ACTOR = "saga:actor";
/** Hostile story mobs (ambushes, waves, wrong answers, champion adds): real fights, cleaned up later. */
export const ADD = "saga:add";
const LONG = 20000000; // effect ticks: as long as the game allows

/**
 * @typedef {object} Actor
 * @property {Entity} ent
 * @property {string} owner player id
 * @property {string} key the objective ("story:chapter:i") or scene it belongs to
 * @property {"meet" | "escort" | "ward" | "guard" | "lead" | "add"} role
 * @property {boolean} invul
 * @property {Vector3} [anchor] kept here (teleported back when it strays)
 * @property {string} dim
 * @property {number} born tick
 */

/** By entity id. @type {Map<string, Actor>} */
export const actors = new Map();

/** @param {string} owner */
export const ownerTag = (owner) => `saga:o:${hash(owner).toString(36)}`;
/** @param {string} key */
export const keyTag = (key) => `saga:k:${hash(key).toString(36)}`;

/**
 * Spawns a story character or mob for a player's scene. Named, so it never despawns on its own.
 * Invulnerable characters can't be hurt, don't wander and can't hurt anyone.
 * @param {Dimension} dim @param {string} type @param {Vector3} at
 * @param {{ owner: string, key: string, role: Actor["role"], name?: string, invul?: boolean, anchor?: boolean, frozen?: boolean, fireproof?: boolean }} o
 * @returns {Entity | undefined}
 */
export function spawnActor(dim, type, at, o) {
  try {
    const ent = dim.spawnEntity(/** @type {any} */ (type), at);
    ent.addTag(o.role === "add" ? ADD : ACTOR);
    ent.addTag(ownerTag(o.owner));
    ent.addTag(keyTag(o.key));
    if (o.name) ent.nameTag = o.name;
    else if (o.role !== "add") ent.nameTag = " ";
    if (o.invul) {
      ent.addEffect("resistance", LONG, { amplifier: 4, showParticles: false });
      ent.addEffect("weakness", LONG, { amplifier: 250, showParticles: false });
    }
    if (o.invul || o.frozen) ent.addEffect("slowness", LONG, { amplifier: 250, showParticles: false });
    if (o.fireproof !== false) {
      ent.addEffect("fire_resistance", LONG, { amplifier: 0, showParticles: false });
      ent.addEffect("water_breathing", LONG, { amplifier: 0, showParticles: false });
    }
    actors.set(ent.id, { ent, owner: o.owner, key: o.key, role: o.role, invul: !!o.invul, anchor: o.anchor ? { ...at } : undefined, dim: dim.id, born: system.currentTick });
    return ent;
  } catch (e) {
    console.warn(`[saga] spawn ${type}: ${e}`);
    return undefined;
  }
}

/** @param {Entity} ent */
function poof(ent) {
  try {
    const l = ent.location;
    ent.dimension.spawnParticle("minecraft:knockback_roar_particle", { x: l.x, y: l.y + 1, z: l.z });
  } catch {
    // unloaded
  }
}

/** Removes one actor. @param {string} id @param {boolean} [effect] a puff where it stood */
export function removeActor(id, effect = false) {
  const a = actors.get(id);
  actors.delete(id);
  if (!a) return;
  try {
    if (a.ent.isValid) {
      if (effect) poof(a.ent);
      a.ent.remove();
    }
  } catch {
    // gone already; an unloaded leftover is removed when its chunk loads
  }
}

/** Removes every actor matching. @param {{ owner?: string, key?: string, role?: Actor["role"] }} f @param {boolean} [effect] */
export function removeActors(f, effect = false) {
  for (const [id, a] of [...actors]) {
    if (f.owner !== undefined && a.owner !== f.owner) continue;
    if (f.key !== undefined && a.key !== f.key) continue;
    if (f.role !== undefined && a.role !== f.role) continue;
    removeActor(id, effect);
  }
}

/** Actors of one scene. @param {string} owner @param {string} key @param {Actor["role"]} [role] */
export function actorsOf(owner, key, role) {
  /** @type {Actor[]} */
  const out = [];
  for (const a of actors.values()) if (a.owner === owner && a.key === key && (!role || a.role === role)) out.push(a);
  return out;
}

/** Is this entity one of ours (and alive)? @param {Entity} ent */
export const actorOf = (ent) => actors.get(ent.id);

/** Keeps anchored actors at their spot and invulnerable ones at full health; drops entries of entities that are gone. */
export function tendActors() {
  for (const [id, a] of [...actors]) {
    try {
      if (!a.ent.isValid) {
        actors.delete(id); // unloaded or dead: the scene spawns a new one when needed
        continue;
      }
      if (a.anchor && dist3(a.ent.location, a.anchor) > 2) a.ent.teleport(a.anchor);
      if (a.invul) {
        const hp = a.ent.getComponent("minecraft:health");
        if (hp && hp.currentValue < hp.effectiveMax) hp.resetToMaxValue();
      }
    } catch {
      actors.delete(id);
    }
  }
}

// An actor or story mob nobody knows (left over from before a restart, or its chunk unloaded and the
// scene moved on) is removed when it loads.
world.afterEvents.entityLoad.subscribe(({ entity }) => {
  try {
    if (actors.has(entity.id)) return;
    if (entity.hasTag(ACTOR) || entity.hasTag(ADD)) entity.remove();
  } catch {
    // ignore
  }
});

/** Removes every tagged leftover in loaded chunks (at world load). */
export function sweep() {
  for (const id of DIMENSIONS) {
    try {
      const dim = world.getDimension(id);
      for (const tag of [ACTOR, ADD]) for (const ent of dim.getEntities({ tags: [tag] })) if (!actors.has(ent.id)) ent.remove();
    } catch (e) {
      console.warn(`[saga] sweep: ${e}`);
    }
  }
}

/** Story mobs that outlived their scene: removed after 10 minutes. */
export function expireAdds() {
  const now = system.currentTick;
  for (const [id, a] of [...actors]) if (a.role === "add" && now - a.born > 12000) removeActor(id);
}

// Invulnerable characters (a witch you talk to, a guard on patrol) can't hurt anyone: what they throw
// or summon is removed as it appears.
const THROWN = new Set([
  "minecraft:splash_potion",
  "minecraft:lingering_potion",
  "minecraft:arrow",
  "minecraft:thrown_trident",
  "minecraft:small_fireball",
  "minecraft:fireball",
  "minecraft:snowball",
  "minecraft:llama_spit",
  "minecraft:shulker_bullet",
  "minecraft:wind_charge_projectile",
  "minecraft:breeze_wind_charge_projectile",
]);
const SUMMONED = new Set(["minecraft:evocation_fang", "minecraft:vex"]);

world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  try {
    const type = entity.typeId;
    const thrown = THROWN.has(type);
    if (!thrown && !SUMMONED.has(type)) return;
    let guarded = false;
    for (const a of actors.values()) if (a.invul) guarded = true;
    if (!guarded) return;
    const at = entity.location;
    const dim = entity.dimension.id;
    for (const a of actors.values()) {
      if (!a.invul || a.dim !== dim || !a.ent.isValid) continue;
      const d = dist3(a.ent.location, at);
      if ((thrown && d <= 3) || (!thrown && d <= 18)) {
        entity.remove();
        return;
      }
    }
  } catch {
    // ignore
  }
});
