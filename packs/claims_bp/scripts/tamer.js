// Who tamed a pet. A vanilla pet loses `minecraft:tameable` / `minecraft:tamemount` (and their `tamedToPlayerId`)
// the moment it is tamed: those components live only in the wild component group, and the tamed group has
// `minecraft:is_tamed`, which says nothing about the owner. So Land Claims writes the tamer down itself: a player
// who taps a wild tameable animal (feeding a wolf a bone, a cat fish, mounting a horse) is watched for a short while,
// and if the animal turns tamed meanwhile (a mount: while that player still rides it), the player's id is saved on
// the animal (`claims:tamer`). Pets tamed before this, bred or tamed by a command have no record.

export const TAMER_PROP = "claims:tamer";
/** Ticks a fed animal is watched, and a mounted one (taming a horse can take a while of riding). */
export const FEED_TICKS = 40;
export const MOUNT_TICKS = 1200;

/** @param {any} e @param {string} id */
function has(e, id) {
  try {
    return e.getComponent(id) !== undefined;
  } catch {
    return false;
  }
}

/** The owner's player id, or undefined. @param {any} e */
export function tamerOf(e) {
  try {
    const own = e.getComponent("minecraft:tameable")?.tamedToPlayerId ?? e.getComponent("minecraft:tamemount")?.tamedToPlayerId;
    if (typeof own === "string" && own) return own;
    const saved = e.getDynamicProperty(TAMER_PROP);
    return typeof saved === "string" && saved ? saved : undefined;
  } catch {
    return undefined;
  }
}

/** @param {any} e @param {string} playerId */
function ridden(e, playerId) {
  try {
    return (e.getComponent("minecraft:rideable")?.getRiders() ?? []).some((r) => r.id === playerId);
  } catch {
    return false;
  }
}

/**
 * Watches wild animals a player tapped. `tap` is called from the interact handler; `step(now)` every few ticks
 * while `size` > 0.
 */
export function createTamerWatch() {
  /** @type {Map<string, { e: any, player: string, until: number, mount: boolean, seen: boolean }>} */
  const watched = new Map();
  return {
    get size() {
      return watched.size;
    },
    /** @param {any} e @param {string} playerId @param {number} now */
    tap(e, playerId, now) {
      if (has(e, "minecraft:is_tamed")) return false;
      const mount = has(e, "minecraft:tamemount");
      if (!mount && !has(e, "minecraft:tameable")) return false;
      watched.set(e.id, { e, player: playerId, until: now + (mount ? MOUNT_TICKS : FEED_TICKS), mount, seen: false });
      return true;
    },
    /** @param {number} now @returns {number} how many tamers were saved */
    step(now) {
      let saved = 0;
      for (const [id, w] of watched) {
        let valid = false;
        try {
          valid = w.e.isValid;
        } catch {}
        if (!valid || now > w.until) {
          watched.delete(id);
          continue;
        }
        const on = w.mount && ridden(w.e, w.player);
        if (on) w.seen = true;
        else if (w.mount && w.seen) {
          // Thrown off or got off untamed: the next mount starts a new watch.
          if (!has(w.e, "minecraft:is_tamed")) {
            watched.delete(id);
            continue;
          }
        }
        if (!has(w.e, "minecraft:is_tamed")) continue;
        watched.delete(id);
        if (w.mount && !w.seen) continue; // tamed while someone else rode it
        try {
          if (!tamerOf(w.e)) {
            w.e.setDynamicProperty(TAMER_PROP, w.player);
            saved++;
          }
        } catch {}
      }
      return saved;
    },
  };
}
