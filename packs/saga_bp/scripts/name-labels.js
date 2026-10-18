// Generated from tools/name-labels-shared.js by node tools/sync-labels.mjs: edit that file, not this copy.
// Single-carrier world-fixed nameplate helpers for owned NPCs and characters.
// Native entity nameTag is set to SUPPRESSED_NAME ("§r") so the client hides the native 5-block nameplate
// without triggering the "NPC" fallback or an empty background pill, while keeping a non-empty nameTag so
// named mobs never despawn and other packs treat the entity as named. One zero-hitbox always_show helper
// entity per owned target renders the canonical name (or speech line) at headLocation + 0.4y.

/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {{ id?: string, entity: Entity | undefined, name: string, suppressedName?: string }} LabelTarget */

export const SUPPRESSED_NAME = "§r";
export const HEAD_OFFSET = 0.4;
export const OBSERVER_RANGE = 24;

/**
 * Encodes a stable key into a format-code-only invisible marker string ("§r§7§2§e..." + digits) that has zero
 * visible glyphs in the Bedrock client while uniquely identifying an owned entity across vanilla transformations
 * (such as villager -> witch/zombie_villager, which copy `nameTag` verbatim and strip script tags).
 * @param {string} prefix2 two hex digits (0-9a-f) identifying the pack/family
 * @param {string | number} key
 * @returns {string}
 */
export function encodeHiddenMarker(prefix2, key) {
  let h = 2166136261;
  const s = String(key);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  const hex = `${String(prefix2).toLowerCase().slice(0, 2)}${(h >>> 0).toString(16).padStart(8, "0")}`;
  let out = SUPPRESSED_NAME;
  for (const ch of hex) out += `§${ch}`;
  out += SUPPRESSED_NAME;
  return out;
}

/**
 * True if `nameTag` is a format-code-only suppressed nameplate (`"§r"` or an `encodeHiddenMarker` sequence with no visible text).
 * @param {string | undefined} nameTag
 * @returns {boolean}
 */
export function isSuppressedName(nameTag) {
  return typeof nameTag === "string" && nameTag.length >= 2 && /^(?:§[0-9a-fr])+$/i.test(nameTag);
}

/**
 * Checks whether `actual` matches `marker`, `${marker}§r`, `${canonicalName}${marker}`, or `${canonicalName}${marker}§r`
 * so format-only resend toggles never break causal transformation identity.
 * @param {string | undefined | null} actual
 * @param {string} marker
 * @param {string} [canonicalName]
 */
export function matchesHiddenMarker(actual, marker, canonicalName) {
  if (typeof actual !== "string" || !marker) return false;
  if (actual === marker || actual === `${marker}§r`) return true;
  if (canonicalName && (actual === `${canonicalName}${marker}` || actual === `${canonicalName}${marker}§r`)) return true;
  return false;
}

const NEAR_RESEND_RANGE = 20;
const NEAR_RESEND_STEPS = [1, 3]; // sync steps after a new viewer enters within 20 blocks (~1 s, then ~3 s more)

/**
 * Creates a world-fixed nameplate helper manager for one pack's label entity type.
 * @param {{
 *   labelType: string,
 *   ownerTag?: string,
 *   labelTag?: string,
 *   labelIdTag?: string,
 *   observerRange?: number,
 *   headOffset?: number
 * }} opts
 */
export function createNameLabels(opts) {
  const {
    labelType,
    ownerTag,
    labelTag,
    labelIdTag = "realm:label_target:",
    observerRange = OBSERVER_RANGE,
    headOffset = HEAD_OFFSET,
  } = opts;
  /**
   * @type {Map<string, {
   *   target: Entity,
   *   helper: Entity,
   *   dimId: string,
   *   baseName?: string,
   *   nearViewers?: Set<string>,
   *   resendTicks?: number,
   *   resendStage?: number,
   *   useAltVariant?: boolean
   * }>}
   */
  const tracked = new Map();
  /** @type {Set<string>} */
  const warned = new Set();

  /** @param {Entity | undefined} entity */
  const remove = (entity) => {
    try {
      if (entity && entity.isValid) entity.remove();
    } catch {
      // already unloaded or removed
    }
  };

  /** @param {Entity | undefined} target @param {string} name */
  const restoreFallback = (target, name) => {
    try {
      if (target && target.isValid && typeof name === "string" && name.trim() && target.nameTag !== name) {
        target.nameTag = name;
      }
    } catch {
      // unloaded
    }
  };

  /** @param {string} key */
  const removeFor = (key) => {
    warned.delete(key);
    const entry = tracked.get(key);
    if (!entry) return;
    remove(entry.helper);
    tracked.delete(key);
  };

  /** @param {Dimension[]} [dimensions] */
  const sweepStrays = (dimensions = []) => {
    for (const [key, entry] of [...tracked]) {
      try {
        if (!entry.target.isValid || !entry.helper.isValid || entry.target.dimension.id !== entry.helper.dimension.id) {
          remove(entry.helper);
          tracked.delete(key);
        }
      } catch {
        remove(entry.helper);
        tracked.delete(key);
      }
    }
    const validHelpers = new Set([...tracked.values()].map((e) => e.helper.id));
    for (const dim of dimensions) {
      try {
        for (const ent of dim.getEntities({ type: labelType })) {
          if (!validHelpers.has(ent.id)) remove(ent);
        }
      } catch {
        // dimension not ticking
      }
    }
  };

  /** @param {Dimension[]} [dimensions] */
  const clear = (dimensions = []) => {
    for (const entry of tracked.values()) remove(entry.helper);
    tracked.clear();
    warned.clear();
    for (const dim of dimensions) {
      try {
        for (const ent of dim.getEntities({ type: labelType })) remove(ent);
      } catch {
        // ignore
      }
    }
  };

  /**
   * Handles an entityLoad event: removes any untracked or orphaned helper of our type immediately.
   * @param {Entity} entity
   * @returns {boolean} true if `entity` is of `labelType`
   */
  const loaded = (entity) => {
    if (!entity || entity.typeId !== labelType) return false;
    const entry = [...tracked.values()].find((r) => r.helper.id === entity.id);
    if (!entry) {
      remove(entity);
      return true;
    }
    try {
      if (!entry.target.isValid || entry.target.dimension.id !== entity.dimension.id) {
        remove(entity);
        for (const [k, v] of tracked) if (v === entry) tracked.delete(k);
      }
    } catch {
      remove(entity);
      for (const [k, v] of tracked) if (v === entry) tracked.delete(k);
    }
    return true;
  };

  /**
   * Syncs helpers for the active targets and observers.
   * @param {LabelTarget[]} targets
   * @param {Player[]} observers
   * @param {Dimension[]} [dimensions]
   */
  const sync = (targets, observers, dimensions = []) => {
    /** @type {Set<string>} */
    const wanted = new Set();
    /** @type {Player[]} */
    const activeObservers = [];
    for (const p of observers) {
      try {
        if (!p || p.isValid === false) continue;
        if (typeof p.getGameMode === "function" && String(p.getGameMode()).toLowerCase() === "spectator") continue;
        activeObservers.push(p);
      } catch {
        // gone
      }
    }

    for (const item of targets) {
      const target = item?.entity;
      const name = item?.name;
      if (!target || typeof name !== "string" || !name.trim()) continue;
      const key = String(item.id ?? target.id);
      if (wanted.has(key)) continue;
      const suppressed =
        typeof item.suppressedName === "string" && isSuppressedName(item.suppressedName)
          ? item.suppressedName
          : SUPPRESSED_NAME;
      const fallback = suppressed === SUPPRESSED_NAME ? name : `${name}${suppressed}`;
      try {
        if (!target.isValid) continue;
        const loc = target.location;
        const dim = target.dimension;
        const dimId = dim.id;
        const sameDimObservers = activeObservers.filter((p) => p.dimension.id === dimId);
        const near = sameDimObservers.some(
          (p) => Math.hypot(p.location.x - loc.x, p.location.y - loc.y, p.location.z - loc.z) <= observerRange,
        );
        if (!near) {
          restoreFallback(target, fallback);
          continue;
        }
        const head = target.getHeadLocation();
        const anchor = { x: head.x, y: head.y + headOffset, z: head.z };

        let entry = tracked.get(key);
        if (entry && (!entry.helper.isValid || entry.target.id !== target.id || entry.helper.dimension.id !== dimId)) {
          remove(entry.helper);
          tracked.delete(key);
          entry = undefined;
        }
        if (!entry) {
          const helper = dim.spawnEntity(/** @type {any} */ (labelType), anchor);
          if (!helper || !helper.isValid) throw new Error(`helper ${labelType} invalid on spawn`);
          if (ownerTag) helper.addTag(ownerTag);
          if (labelTag) helper.addTag(labelTag);
          if (labelIdTag) helper.addTag(labelIdTag + key);
          entry = { target, helper, dimId, useAltVariant: false };
          tracked.set(key, entry);
        }

        // Bedrock's client caches a creature's default name ("NPC") when the entity spawns in the same packet
        // batch as its nameTag or before a newly joined viewer enters range. When a new viewer enters within
        // 20 blocks, toggle BOTH the helper caption and the native suppressed nameTag between their base and
        // `§r`-suffixed variants after 1 step (~1 s) and 3 steps (~3 s) so the client receives a fresh
        // actor-data update packet for both entities without flashing a canonical name on the native entity.
        // Notice `name.endsWith("§r")` when the caller (`npc_bp`/`caravan_bp` watchName) already drives its
        // own 1 s / 3 s resend toggle: follow the caller's toggle instead of opposing it.
        const callerAlt = name.endsWith("§r");
        const baseName = callerAlt ? name.slice(0, -2) : name;
        const nearIds = new Set(
          sameDimObservers
            .filter((p) => Math.hypot(p.location.x - loc.x, p.location.y - loc.y, p.location.z - loc.z) <= NEAR_RESEND_RANGE)
            .map((p) => String(p.id ?? p.name ?? "")),
        );
        const prevIds = entry.nearViewers;
        if (!prevIds || [...nearIds].some((id) => !prevIds.has(id))) {
          entry.resendStage = 0;
          entry.resendTicks = NEAR_RESEND_STEPS[0];
        } else if (entry.baseName !== undefined && entry.baseName !== baseName) {
          // Caption changed (e.g. speech line started/ended): already sends a fresh packet, reset alt variant.
          entry.useAltVariant = false;
        } else if (entry.resendTicks !== undefined) {
          entry.resendTicks -= 1;
          if (entry.resendTicks <= 0) {
            entry.useAltVariant = !entry.useAltVariant;
            const nextStage = (entry.resendStage ?? 0) + 1;
            entry.resendStage = nextStage;
            entry.resendTicks = nextStage < NEAR_RESEND_STEPS.length ? NEAR_RESEND_STEPS[nextStage] : undefined;
          }
        }
        entry.nearViewers = nearIds;
        entry.baseName = baseName;

        const useAlt = callerAlt !== Boolean(entry.useAltVariant);
        const helperWanted = useAlt ? `${baseName}§r` : baseName;
        const targetWanted = useAlt ? `${suppressed}§r` : suppressed;

        if (entry.helper.nameTag !== helperWanted) entry.helper.nameTag = helperWanted;
        const hloc = entry.helper.location;
        if (Math.hypot(hloc.x - anchor.x, hloc.y - anchor.y, hloc.z - anchor.z) > 0.01) {
          entry.helper.teleport(anchor);
        }
        if (!entry.helper.isValid || entry.helper.nameTag !== helperWanted) {
          throw new Error(`helper ${labelType} failed caption sync`);
        }
        if (target.nameTag !== targetWanted) target.nameTag = targetWanted;
        wanted.add(key);
        warned.delete(key);
      } catch (e) {
        wanted.delete(key);
        const failed = tracked.get(key);
        if (failed) {
          remove(failed.helper);
          tracked.delete(key);
        }
        restoreFallback(target, fallback);
        if (!warned.has(key)) {
          warned.add(key);
          console.warn(`[name-labels] ${labelType} (${key}): ${e}`);
        }
      }
    }

    for (const [key, entry] of [...tracked]) {
      if (wanted.has(key)) continue;
      remove(entry.helper);
      tracked.delete(key);
    }
    sweepStrays(dimensions);
  };

  return {
    labelType,
    loaded,
    sync,
    removeFor,
    clear,
    sweep: sweepStrays,
  };
}
