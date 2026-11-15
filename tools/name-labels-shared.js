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

/**
 * Spawns an entity and checks what came back: in a world whose entity ids repeat (an old level.dat put back),
 * `spawnEntity` can hand back an entity that already exists (a dropped item, someone's pet), and tagging or naming
 * that one would take it over. Spawns again (the next id is usually free) and throws if it never gets the type.
 * The wrong entity is left alone: it isn't ours to remove.
 * @param {Dimension} dim @param {string} type @param {import("@minecraft/server").Vector3} at @param {any} [opts]
 * @returns {Entity}
 */
export function spawnChecked(dim, type, at, opts) {
  for (let k = 0; k < 4; k++) {
    const e = opts ? dim.spawnEntity(/** @type {any} */ (type), at, opts) : dim.spawnEntity(/** @type {any} */ (type), at);
    if (e && e.isValid && e.typeId === type) return e;
  }
  throw new Error(`spawnEntity(${type}) kept returning another entity`);
}

const NEAR_RESEND_RANGE = 20;
const NEAR_RESEND_SQ = NEAR_RESEND_RANGE * NEAR_RESEND_RANGE;
/** Syncs between checks of what was written (helper captions and places, the targets' own name tags) and, with
 * `trustHandles`, of whether the tracked entities are still valid: every 10th sync. */
const SWEEP_EVERY = 10;
/** A helper is taken down only this far past `observerRange`, so a viewer at the edge doesn't remove and spawn it again. */
const KEEP_MARGIN = 0;
/** Ticks between scans of whole dimensions for strays (a helper the tracked list lost). Loaded strays are removed on
 * their load event already, so this is only a backstop: once a minute (and on the first sync). */
const STRAY_TICKS = 1200;
/** Syncs between those scans without `syncTicks` (a sync every 2 ticks is the fastest caller). */
const STRAY_SYNCS = 600;
const NEAR_RESEND_STEPS = [1, 3]; // syncs after a new viewer enters within 20 blocks, then 3 syncs more
const RESEND_TICKS = [20, 60]; // with `syncTicks`: 1 s after a new viewer enters within 20 blocks, then 3 s more

/**
 * Creates a world-fixed nameplate helper manager for one pack's label entity type.
 * @param {{
 *   labelType: string,
 *   ownerTag?: string,
 *   labelTag?: string,
 *   labelIdTag?: string,
 *   observerRange?: number,
 *   headOffset?: number,
 *   spectatorsExcluded?: boolean,
 *   syncTicks?: number,
 *   trustHandles?: boolean
 * }} opts `syncTicks`: how often the caller syncs, in ticks; the resends after a new viewer comes near are then 1 s
 * and 3 s more later (without it they come 1 sync and 3 syncs later). `spectatorsExcluded`: the observers given to sync never include spectators (the caller asked
 * world.getPlayers to leave them out), so their game mode isn't read again on every sync. `trustHandles`: the caller
 * calls `forget(id)` from `entityRemove` for its target and label types, so between checks (every 10th sync) the
 * targets and helpers are not asked whether they are still valid.
 */
export function createNameLabels(opts) {
  const {
    labelType,
    ownerTag,
    labelTag,
    labelIdTag = "realm:label_target:",
    observerRange = OBSERVER_RANGE,
    headOffset = HEAD_OFFSET,
    spectatorsExcluded = false,
    syncTicks,
    trustHandles = false,
  } = opts;
  const resendSteps = syncTicks ? RESEND_TICKS.map((t) => Math.max(1, Math.round(t / syncTicks))) : NEAR_RESEND_STEPS;
  const strayEvery = SWEEP_EVERY;
  /**
   * @type {Map<string, {
   *   target: Entity,
   *   helper: Entity,
   *   dimId: string,
   *   baseName?: string,
   *   nearViewers?: Set<string>,
   *   resendTicks?: number,
   *   resendStage?: number,
   *   useAltVariant?: boolean,
   *   caption?: string,
   *   at?: { x: number, y: number, z: number },
   *   targetTag?: string,
   *   tid: string,
   *   hid: string
   * }>} `caption` and `at`: what was last written to the helper and `targetTag` to the target, so a sync with nothing
   * new reads nothing back; `tid` and `hid`: the target's and the helper's ids, for `forget`
   */
  const tracked = new Map();
  /** @type {Set<string>} */
  const warned = new Set();
  /** Targets with no helper whose own name tag was set to their full name: key -> target id and that text. @type {Map<string, { tid: string, text: string }>} */
  const restored = new Map();
  const rangeSq = observerRange * observerRange;
  const keepSq = (observerRange + KEEP_MARGIN) ** 2;
  let syncs = 0;

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

  /**
   * restoreFallback for a target with no helper, written once: later syncs trust it until the next check, a new
   * entity or a new text. @param {string} key @param {Entity} target @param {string} name @param {boolean} check
   */
  const restoreOnce = (key, target, name, check) => {
    const tid = target.id;
    const was = restored.get(key);
    if (!check && was && was.tid === tid && was.text === name) return;
    restoreFallback(target, name);
    restored.set(key, { tid, text: name });
  };

  /** @param {string} key */
  const removeFor = (key) => {
    warned.delete(key);
    restored.delete(key);
    const entry = tracked.get(key);
    if (!entry) return;
    remove(entry.helper);
    tracked.delete(key);
  };

  /**
   * An entity went (`entityRemove`: removed, killed or unloaded): a helper that went is dropped from the list, and a
   * target that went has its helper taken down. Callers with `trustHandles` call it for their target and label types.
   * @param {string} id
   */
  const forget = (id) => {
    for (const [key, entry] of [...tracked]) {
      if (entry.hid === id) tracked.delete(key);
      else if (entry.tid === id) {
        remove(entry.helper);
        tracked.delete(key);
      }
    }
    for (const [key, r] of [...restored]) if (r.tid === id) restored.delete(key);
  };

  /** Drops tracked entries whose target or helper is gone, or which are in different dimensions. */
  const checkTracked = () => {
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
  };

  /** Removes the helpers of our type in whole dimensions that no tracked entry owns. @param {Dimension[]} [dimensions] */
  const scanStrays = (dimensions = []) => {
    const validHelpers = new Set([...tracked.values()].map((e) => e.hid));
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
  const sweepStrays = (dimensions = []) => {
    checkTracked();
    scanStrays(dimensions);
  };

  /** @param {Dimension[]} [dimensions] */
  const clear = (dimensions = []) => {
    for (const entry of tracked.values()) remove(entry.helper);
    tracked.clear();
    warned.clear();
    restored.clear();
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
    let entry;
    for (const r of tracked.values()) {
      if (r.hid === entity.id) {
        entry = r;
        break;
      }
    }
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
   * Observers and dimensions may be given as functions, called only when they are needed (not on a sync with
   * nothing to label). An observer may be a player or a record `{ dimId, x, y, z, id }` the caller already read (one
   * snapshot of the players shared with its own loop). A target may carry `dimId` (its dimension, which the caller
   * knows) and `head` (where its head is, for a target that stands on a fixed post): neither is then read from it.
   * @param {(LabelTarget & { dimId?: string, head?: import("@minecraft/server").Vector3 })[]} targets
   * @param {(Player | { dimId: string, x: number, y: number, z: number, id: string })[] | (() => (Player | { dimId: string, x: number, y: number, z: number, id: string })[])} observerList
   * @param {Dimension[] | (() => Dimension[])} [dimensionList]
   */
  const sync = (targets, observerList, dimensionList = []) => {
    const n = syncs++;
    const checkNow = n % SWEEP_EVERY === 0;
    const strayNow = n % strayEvery === 0;
    const dims = () => (typeof dimensionList === "function" ? dimensionList() : dimensionList);
    if (checkNow && tracked.size) checkTracked();
    // Nothing to label and nothing left over (no caravan here, no townsfolk placed): no work at all.
    if (!targets.length && !tracked.size) {
      if (strayNow) scanStrays(dims());
      return;
    }
    const observers = !targets.length ? [] : typeof observerList === "function" ? observerList() : observerList;
    /** @type {Set<string>} */
    const wanted = new Set();
    // Each observer's dimension and place, read once per sync (native reads cost more than the math).
    /** @type {{ dimId: string, x: number, y: number, z: number, id: string }[]} */
    const activeObservers = [];
    for (const p of observers) {
      try {
        if (!p) continue;
        if (typeof (/** @type {any} */ (p).dimId) === "string") {
          activeObservers.push(/** @type {any} */ (p));
          continue;
        }
        const pl = /** @type {Player} */ (p);
        if (!spectatorsExcluded && pl.isValid === false) continue; // a fresh getPlayers list holds only valid players
        if (!spectatorsExcluded && typeof pl.getGameMode === "function" && String(pl.getGameMode()).toLowerCase() === "spectator") continue;
        const l = pl.location;
        activeObservers.push({ dimId: pl.dimension.id, x: l.x, y: l.y, z: l.z, id: String(pl.id ?? pl.name ?? "") });
      } catch {
        // gone
      }
    }
    const askValid = !trustHandles || checkNow;

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
        if (askValid && !target.isValid) continue;
        // Distances from its head (one read for both): a block and a half off its feet matters nothing at 20 blocks.
        const loc = item.head ?? target.getHeadLocation();
        const dimId = item.dimId ?? target.dimension.id;
        let entry = tracked.get(key);
        // A helper already up stays until its viewers are KEEP_MARGIN past the range (no remove and respawn at the edge).
        const reachSq = entry ? keepSq : rangeSq;
        let near = false;
        /** @type {Set<string>} */
        const nearIds = new Set();
        for (const p of activeObservers) {
          if (p.dimId !== dimId) continue;
          const d2 = (p.x - loc.x) ** 2 + (p.y - loc.y) ** 2 + (p.z - loc.z) ** 2;
          if (d2 <= reachSq) near = true;
          if (d2 <= NEAR_RESEND_SQ) nearIds.add(p.id);
        }
        if (!near) {
          restoreOnce(key, target, fallback, checkNow);
          continue;
        }
        restored.delete(key);
        const anchor = { x: loc.x, y: loc.y + headOffset, z: loc.z };

        if (entry && ((askValid && !entry.helper.isValid) || entry.tid !== target.id || entry.dimId !== dimId)) {
          remove(entry.helper);
          tracked.delete(key);
          entry = undefined;
        }
        if (!entry) {
          const helper = spawnChecked(target.dimension, labelType, anchor);
          if (ownerTag) helper.addTag(ownerTag);
          if (labelTag) helper.addTag(labelTag);
          if (labelIdTag) helper.addTag(labelIdTag + key);
          // Spawned at the anchor: no teleport to where it already is.
          entry = { target, helper, dimId, useAltVariant: false, at: anchor, tid: target.id, hid: helper.id };
          tracked.set(key, entry);
        }
        entry.target = target;

        // Bedrock's client caches a creature's default name ("NPC") when the entity spawns in the same packet
        // batch as its nameTag or before a newly joined viewer enters range. When a new viewer enters within
        // 20 blocks, toggle BOTH the helper caption and the native suppressed nameTag between their base and
        // `§r`-suffixed variants 1 s and 3 s more later (with `syncTicks`; else 1 sync and 3 more syncs later) so the client receives a fresh
        // actor-data update packet for both entities without flashing a canonical name on the native entity.
        // A caption that already ends in `§r` (a caller's own variant) is taken as the alternate form: the toggle
        // follows it instead of opposing it. No caller toggles on its own today; the resend lives only here.
        const callerAlt = name.endsWith("§r");
        const baseName = callerAlt ? name.slice(0, -2) : name;
        const prevIds = entry.nearViewers;
        if (!prevIds || [...nearIds].some((id) => !prevIds.has(id))) {
          entry.resendStage = 0;
          entry.resendTicks = resendSteps[0];
        } else if (entry.baseName !== undefined && entry.baseName !== baseName) {
          // Caption changed (e.g. speech line started/ended): already sends a fresh packet, reset alt variant.
          entry.useAltVariant = false;
        } else if (entry.resendTicks !== undefined) {
          entry.resendTicks -= 1;
          if (entry.resendTicks <= 0) {
            entry.useAltVariant = !entry.useAltVariant;
            const nextStage = (entry.resendStage ?? 0) + 1;
            entry.resendStage = nextStage;
            entry.resendTicks = nextStage < resendSteps.length ? resendSteps[nextStage] : undefined;
          }
        }
        entry.nearViewers = nearIds;
        entry.baseName = baseName;

        const useAlt = callerAlt !== Boolean(entry.useAltVariant);
        const helperWanted = useAlt ? `${baseName}§r` : baseName;
        const targetWanted = useAlt ? `${suppressed}§r` : suppressed;

        // What was written last is trusted between checks; a check sync reads the helper and the target back in
        // case something else renamed or moved them.
        if (checkNow) {
          entry.caption = entry.helper.nameTag;
          entry.at = entry.helper.location;
          entry.targetTag = target.nameTag;
        }
        if (entry.caption !== helperWanted) {
          entry.helper.nameTag = helperWanted;
          entry.caption = helperWanted;
        }
        const hloc = entry.at;
        if (!hloc || Math.hypot(hloc.x - anchor.x, hloc.y - anchor.y, hloc.z - anchor.z) > 0.01) {
          entry.helper.teleport(anchor);
          entry.at = anchor;
        }
        if (entry.targetTag === undefined) entry.targetTag = target.nameTag;
        if (entry.targetTag !== targetWanted) {
          target.nameTag = targetWanted;
          entry.targetTag = targetWanted;
        }
        wanted.add(key);
        warned.delete(key);
      } catch (e) {
        wanted.delete(key);
        const failed = tracked.get(key);
        if (failed) {
          remove(failed.helper);
          tracked.delete(key);
        }
        restored.delete(key);
        restoreFallback(target, fallback);
        let gone = false;
        try {
          gone = !target.isValid;
        } catch {
          gone = true;
        }
        // A target that went since it was handed over (unloaded this tick) is not worth a warning.
        if (!gone && !warned.has(key)) {
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
    if (strayNow) scanStrays(dims());
  };

  return {
    labelType,
    loaded,
    sync,
    removeFor,
    forget,
    clear,
    sweep: sweepStrays,
  };
}
