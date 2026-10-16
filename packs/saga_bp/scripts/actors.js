// Story characters and story mobs the pack spawns for one player's scene: who they belong to, keeping
// them where they should be, and cleaning them up. Imports only util.js, settings.js and name-labels.js.
import { system, world } from "@minecraft/server";
import { DIMENSIONS, dist3, hash } from "./util.js";
import { removeOrphanLabel, updateNameLabels } from "./name-labels.js";
import { get } from "./settings.js";

/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

/** Every story character (meet, escort, ward, guard, lead animal). */
export const ACTOR = "saga:actor";
/** Hostile story mobs (ambushes, waves, wrong answers, champion adds): real fights, cleaned up later. */
export const ADD = "saga:add";
const LONG = 20000000; // effect ticks: as long as the game allows
const VILLAGER = "minecraft:villager_v2";
/** What a story character turns into: lightning makes a villager a witch, a zombie's fatal hit a zombie villager. */
const TURNED = /^minecraft:(witch|zombie_villager|zombie_villager_v2)$/;

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
 * @property {string} type what was spawned
 * @property {SpawnOpts} opts how (to spawn it again the same way)
 */
/**
 * @typedef {{ owner: string, key: string, role: Actor["role"], name?: string, invul?: boolean, anchor?: boolean, frozen?: boolean, fireproof?: boolean, look?: string }} SpawnOpts
 * `look`: villagers only, the vanilla event that dresses them for a job (`minecraft:become_cleric`).
 */

/** By entity id. @type {Map<string, Actor>} */
export const actors = new Map();

/** @param {string} owner */
export const ownerTag = (owner) => `saga:o:${hash(owner).toString(36)}`;
/** @param {string} key */
export const keyTag = (key) => `saga:k:${hash(key).toString(36)}`;

/** Names of the characters spawned since the world loaded: what a turned one (a witch, a zombie villager) still wears. @type {Set<string>} */
const names = new Set();
/** Villagers whose look isn't confirmed yet: entity id -> the vanilla event (it lands a tick later). @type {Map<string, string>} */
const dressing = new Map();

/** @param {Entity} ent @param {string} look */
function dress(ent, look) {
  try {
    ent.triggerEvent(look);
  } catch (e) {
    console.warn(`[saga] look ${look}: ${e}`);
  }
}
/** Dressed as they should be? The event's job is a type family ("become_sheperd" sets "shepherd"). @param {Entity} ent @param {string} look */
const dressed = (ent, look) => ent.matches({ families: [look.replace("minecraft:become_", "").replace("sheperd", "shepherd")] });

/**
 * Spawns a story character or mob for a player's scene. Named, so it never despawns on its own.
 * Invulnerable characters can't be hurt, don't wander and can't hurt anyone. A villager comes as a village's
 * newcomer (no job yet, a random skin, the biome's clothes; the default spawn would pick a random job that a later
 * look can't replace), then takes its `look` (a grown-up, unskilled one without).
 * @param {Dimension} dim @param {string} type @param {Vector3} at @param {SpawnOpts} o
 * @returns {Entity | undefined}
 */
export function spawnActor(dim, type, at, o) {
  try {
    const villager = type === VILLAGER;
    const ent = dim.spawnEntity(/** @type {any} */ (type), at, villager ? { spawnEvent: "minecraft:spawn_from_village" } : undefined);
    if (villager) {
      // Also grows up a baby (1 in 20 spawn as one). tendActors checks it took.
      const look = o.look || "minecraft:become_unskilled";
      dress(ent, look);
      dressing.set(ent.id, look);
    }
    ent.addTag(o.role === "add" ? ADD : ACTOR);
    ent.addTag(ownerTag(o.owner));
    ent.addTag(keyTag(o.key));
    if (o.name) {
      ent.nameTag = o.name;
      names.delete(o.name);
      names.add(o.name);
      if (names.size > 200) names.delete(/** @type {string} */ (names.values().next().value));
    } else if (o.role !== "add") ent.nameTag = " ";
    if (o.invul) {
      ent.addEffect("resistance", LONG, { amplifier: 4, showParticles: false });
      ent.addEffect("weakness", LONG, { amplifier: 250, showParticles: false });
    }
    if (o.invul || o.frozen) ent.addEffect("slowness", LONG, { amplifier: 250, showParticles: false });
    if (o.fireproof !== false) {
      ent.addEffect("fire_resistance", LONG, { amplifier: 0, showParticles: false });
      ent.addEffect("water_breathing", LONG, { amplifier: 0, showParticles: false });
    }
    actors.set(ent.id, { ent, owner: o.owner, key: o.key, role: o.role, invul: !!o.invul, anchor: o.anchor ? { ...at } : undefined, dim: dim.id, born: system.currentTick, type, opts: o });
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

const LABEL_TYPE = "realm:saga_label";
/** Floating name projections by actor entity id. @type {Map<string, Entity>} */
const actorLabels = new Map();

/** Removes name projections nothing tracks (left over from a restart or an unloaded chunk). */
function sweepLabels() {
  for (const id of DIMENSIONS) {
    try {
      for (const e of world.getDimension(id).getEntities({ type: LABEL_TYPE })) removeOrphanLabel(e, actorLabels, LABEL_TYPE);
    } catch {
      // the dimension isn't loaded
    }
  }
}

// Every story character's name floats in 3D for players up to `farNameRange` blocks away.
system.runInterval(() => {
  try {
    const targets = [];
    for (const a of actors.values()) {
      if (a.role === "add" || !a.ent.isValid || !a.opts.name || !a.opts.name.trim()) continue;
      const l = a.ent.location;
      targets.push({ id: a.ent.id, dim: a.dim, x: l.x, y: l.y, z: l.z, name: a.opts.name });
    }
    updateNameLabels({
      labels: actorLabels,
      targets,
      players: world.getAllPlayers(),
      maxRange: Math.max(0, Number(get("farNameRange")) || 0),
      labelType: LABEL_TYPE,
      ownerTag: "realm:npc_owner:saga_bp",
      labelTag: "realm:saga_label",
      labelIdTag: "realm:saga_label_id:",
      dimension: (id) => world.getDimension(id),
    });
  } catch (e) {
    console.warn(`[saga] name labels: ${e}`);
  }
}, 2);

/** Keeps anchored actors at their spot and invulnerable ones at full health; drops entries of entities that are gone. */
export function tendActors() {
  sweepLabels();
  for (const [id, a] of [...actors]) {
    try {
      if (!a.ent.isValid) {
        actors.delete(id); // unloaded or dead: the scene spawns a new one when needed
        dressing.delete(id);
        continue;
      }
      const look = dressing.get(id);
      if (look) {
        if (dressed(a.ent, look)) dressing.delete(id);
        else dress(a.ent, look);
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

/** A story character was lost to something other than a fight's death (a zombie's fatal hit that turned it): the scene's own handler. @type {(a: Actor) => void} */
let onLost = () => {};
/** @param {(a: Actor) => void} fn */
export const setLostHandler = (fn) => {
  onLost = fn;
};

// A story villager struck by lightning becomes a witch, one killed by a zombie a zombie villager: the new mob keeps
// the name tag but none of our tags, so it would stay in the world for good. It is removed; a witch's character is
// spawned again where it stood (lightning isn't the player's fault), a zombie villager's counts as hurt.
world.afterEvents.entitySpawn.subscribe(({ entity, cause }) => {
  try {
    if (cause !== "Transformed" || !TURNED.test(entity.typeId)) return;
    const name = entity.nameTag;
    if (!name || !names.has(name)) return;
    system.run(() => {
      try {
        if (!entity.isValid) return;
        const at = entity.location;
        const dim = entity.dimension;
        const witch = entity.typeId === "minecraft:witch";
        poof(entity);
        entity.remove();
        for (const [id, a] of [...actors]) {
          if (a.opts.name !== name || a.ent.isValid || a.dim !== dim.id) continue;
          actors.delete(id);
          dressing.delete(id);
          // The scene may have spawned its character again meanwhile (it looks once a second): then only the witch goes.
          const again = [...actors.values()].some((b) => b.owner === a.owner && b.key === a.key && b.role === a.role && b.ent.isValid);
          if (witch && !again) spawnActor(dim, a.type, at, a.opts);
          else if (!witch) onLost(a);
          return;
        }
      } catch {
        // gone
      }
    });
  } catch {
    // ignore
  }
});

// An actor or story mob nobody knows (left over from before a restart, or its chunk unloaded and the
// scene moved on) is removed when it loads.
world.afterEvents.entityLoad.subscribe(({ entity }) => {
  try {
    if (removeOrphanLabel(entity, actorLabels, LABEL_TYPE)) return;
    if (actors.has(entity.id)) return;
    if (entity.hasTag(ACTOR) || entity.hasTag(ADD)) entity.remove();
  } catch {
    // ignore
  }
});

/** Removes every tagged leftover in loaded chunks (at world load). */
export function sweep() {
  sweepLabels();
  for (const id of DIMENSIONS) {
    try {
      const dim = world.getDimension(id);
      for (const tag of [ACTOR, ADD]) for (const ent of dim.getEntities({ tags: [tag] })) if (!actors.has(ent.id)) ent.remove();
    } catch (e) {
      console.warn(`[saga] sweep: ${e}`);
    }
  }
}

/** Test hook (realm:saga_debug `age_adds`): every story mob as if spawned `ticks` earlier. @param {number} ticks */
export function ageAdds(ticks) {
  for (const a of actors.values()) if (a.role === "add") a.born -= ticks;
}

/** Story mobs that outlived their scene: removed after 10 minutes (a defense keeps its wave's fresh while it's fought). */
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
