// Kept identical in npc_bp, wander_bp and caravan_bp; each pack must also work on its own.
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {Vector3 & { id: string, dim: string, name: string }} LabelTarget */

const PASSABLE = /(^|:|_)(air|short_grass|tall_grass|fern|large_fern|dead_bush|bush|seagrass|kelp|vine|vines|sapling|propagule|flower|tulip|poppy|dandelion|orchid|allium|bluet|daisy|cornflower|lily_of_the_valley|rose|lilac|peony|sunflower|petals|leaf_litter|torchflower|pitcher_plant|crimson_roots|warped_roots|hanging_roots|sprouts|fungus|mushroom|wheat|carrots|potatoes|beetroot|sweet_berry_bush|torch|candle|sign|banner|carpet|rail|button|lever|pressure_plate|tripwire|tripwire_hook|redstone_wire|string|ladder|cobweb|coral_fan|coral|glow_lichen|deadbush|fire|light_block(_\d+)?|structure_void|scaffolding|snow_layer)$/;

/**
 * First wall on the short projection ray. Fine steps also catch a wall right beside the camera;
 * the half-block setback stays in front of its near face, not inside the sampled block.
 * @param {Dimension} dim @param {Vector3} from
 * @param {number} ux @param {number} uy @param {number} uz @param {number} maxDist
 */
export function firstWallDist(dim, from, ux, uy, uz, maxDist) {
  for (let s = 0.25; s <= maxDist; s += 0.25) {
    const b = dim.getBlock({ x: Math.floor(from.x + ux * s), y: Math.floor(from.y + uy * s), z: Math.floor(from.z + uz * s) });
    if (!b || (!b.isAir && !b.isLiquid && !PASSABLE.test(b.typeId))) return s;
  }
  return undefined;
}

/** @param {Map<string, Entity>} labels @param {string} id */
function removeLabel(labels, id) {
  const label = labels.get(id);
  try {
    if (label?.isValid) label.remove();
  } catch {
    // Unloaded labels are removed by the entity-load audit.
  }
  labels.delete(id);
}

/** @param {Entity} entity @param {Map<string, Entity>} labels @param {string} type */
export function removeOrphanLabel(entity, labels, type) {
  if (entity.typeId !== type) return false;
  if (entity.isValid && ![...labels.values()].some((label) => label.id === entity.id)) entity.remove();
  return true;
}

/**
 * One shared-world projection per character, aimed for its closest non-spectator viewer.
 * @param {{
 * labels: Map<string, Entity>, targets: LabelTarget[], players: Player[], maxRange: number,
 * labelType: string, ownerTag: string, labelTag: string, labelIdTag: string,
 * dimension: (id: string) => Dimension
 * }} options
 */
export function updateNameLabels({ labels, targets, players, maxRange, labelType, ownerTag, labelTag, labelIdTag, dimension }) {
  const active = new Set();
  const viewers = maxRange > 0 ? players.filter((p) => p.isValid !== false && p.getGameMode().toLowerCase() !== "spectator") : [];
  for (const target of targets) {
    let near;
    let nearest = maxRange;
    for (const p of viewers) {
      if (p.dimension.id !== target.dim) continue;
      const loc = p.location;
      const d = Math.hypot(target.x - loc.x, target.y - loc.y, target.z - loc.z);
      if (d <= nearest) {
        near = p;
        nearest = d;
      }
    }
    if (!near) continue;
    try {
      let label = labels.get(target.id);
      if (label && !label.isValid) {
        labels.delete(target.id);
        label = undefined;
      }
      const dim = dimension(target.dim);
      const eye = near.getHeadLocation();
      const dx = target.x - eye.x, dy = target.y + 2.25 - eye.y, dz = target.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 0.5) continue;
      const ux = dx / d, uy = dy / d, uz = dz / d;
      const wall = firstWallDist(dim, eye, ux, uy, uz, Math.min(d, 8.5));
      const closeClear = d <= 6.5 && wall === undefined;
      const projDist = wall !== undefined ? Math.max(0.1, wall - 0.55) : Math.min(d - 0.3, 7.5);
      const pos = closeClear
        ? { x: target.x, y: target.y + 2.05, z: target.z }
        : { x: eye.x + ux * projDist, y: eye.y + uy * projDist, z: eye.z + uz * projDist };
      if (!dim.getBlock({ x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) })) continue;
      if (!label) {
        label = dim.spawnEntity(labelType, pos);
        labels.set(target.id, label);
        for (const tag of [ownerTag, labelTag, labelIdTag + target.id]) label.addTag(tag);
      } else {
        label.teleport(pos, { dimension: dim });
      }
      const name = `${target.name}${d >= 10 ? ` §8(${Math.round(d)}m)` : ""}`;
      if (label.nameTag !== name) label.nameTag = name;
      active.add(target.id);
    } catch {
      // One unloaded spot or a player leaving must not prevent other labels updating.
    }
  }
  for (const id of labels.keys()) if (!active.has(id)) removeLabel(labels, id);
}
