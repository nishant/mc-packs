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

/** Animals watched at once; a tap on another while this many are watched is ignored. */
export const MAX_WATCHED = 256;

/**
 * Watches wild animals players tapped, one watch per animal and player, so a second player's tap never replaces
 * the first. When the animal turns tamed, exactly one player must account for it, or nobody is recorded (the pet
 * stays locked in others' claims, as before this existed): for a mount, the one player who mounted it and still
 * rides it; for feeding, the one player who fed it in the last FEED_TICKS, or, when several did, the one player who
 * tapped it since it was last seen wild (a tick of slack, in case the tamed state shows a tick after the feed). `tap` is called from the interact handler; `step(now)` every few
 * ticks while `size` > 0.
 */
export function createTamerWatch() {
  /** @type {Map<string, { e: any, mount: boolean, lastWild: number | undefined, taps: Map<string, { at: number, until: number, seen: boolean }> }>} */
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
      let w = watched.get(e.id);
      if (!w) {
        if (watched.size >= MAX_WATCHED) return false;
        watched.set(e.id, (w = { e, mount, lastWild: undefined, taps: new Map() }));
      }
      const had = w.taps.get(playerId);
      // A rider's own watch keeps what it saw; a new tap only extends it.
      w.taps.set(playerId, { at: now, until: now + (mount ? MOUNT_TICKS : FEED_TICKS), seen: had?.seen ?? false });
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
        if (!valid) {
          watched.delete(id);
          continue;
        }
        const tamed = has(w.e, "minecraft:is_tamed");
        /** @type {string[]} */
        const riding = [];
        for (const [player, t] of w.taps) {
          if (now > t.until) {
            w.taps.delete(player);
            continue;
          }
          if (!w.mount) continue;
          if (ridden(w.e, player)) {
            t.seen = true;
            riding.push(player);
          } else if (t.seen && !tamed) w.taps.delete(player); // thrown off or got off untamed: a new mount starts over
        }
        if (!tamed) {
          w.lastWild = now;
          if (!w.taps.size) watched.delete(id);
          continue;
        }
        watched.delete(id);
        /** @type {string[]} */
        let who;
        if (w.mount) who = riding.filter((p) => w.taps.get(p)?.seen);
        else {
          who = [...w.taps.keys()];
          if (who.length > 1) {
            const since = w.lastWild === undefined ? -Infinity : w.lastWild - 1;
            who = [...w.taps].filter(([, t]) => t.at >= since).map(([p]) => p);
          }
        }
        if (who.length !== 1) continue; // nobody, or more than one player could have tamed it
        try {
          if (!tamerOf(w.e)) {
            w.e.setDynamicProperty(TAMER_PROP, who[0]);
            saved++;
          }
        } catch {}
      }
      return saved;
    },
  };
}
