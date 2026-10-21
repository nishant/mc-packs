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
/** Syncs between scans of whole dimensions for strays (a helper the tracked list lost). Loaded strays are removed
 * on their load event already, so this is only a backstop: every 10th sync (1 s at a sync every 2 ticks). */
const SWEEP_EVERY = 10;
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
 *   observersPerDimension?: boolean
 * }} opts `syncTicks`: how often the caller syncs, in ticks; the resends after a new viewer comes near are then 1 s
 * and 3 s more later (without it they come 1 sync and 3 syncs later). `spectatorsExcluded`: the observers given to sync never include spectators (the caller asked
 * world.getPlayers to leave them out), so their game mode isn't read again on every sync. `observersPerDimension`: sync's
 * observer list is a function of a Dimension that returns only the players in it (`dim.getPlayers(...)`), called once per
 * dimension with a target in it, so no player's dimension is read (with 40 players that was most of a sync's reads)
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
    observersPerDimension = false,
  } = opts;
  const resendSteps = syncTicks ? RESEND_TICKS.map((t) => Math.max(1, Math.round(t / syncTicks))) : NEAR_RESEND_STEPS;
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
   *   targetName?: string
   * }>} `caption` and `at`: what was last written to the helper, and `targetName` to the target, so a sync with nothing
   * new reads nothing back
   */
  const tracked = new Map();
  /** @type {Set<string>} */
  const warned = new Set();
  const rangeSq = observerRange * observerRange;
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
    let entry;
    for (const r of tracked.values()) {
      if (r.helper.id === entity.id) {
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
   * nothing to label).
   * @param {LabelTarget[]} targets
   * @param {Player[] | (() => Player[])} observerList
   * @param {Dimension[] | (() => Dimension[])} [dimensionList]
   */
  const sync = (targets, observerList, dimensionList = []) => {
    const sweepNow = syncs++ % SWEEP_EVERY === 0;
    const dims = () => (typeof dimensionList === "function" ? dimensionList() : dimensionList);
    // Nothing to label and nothing left over (no caravan here, no townsfolk placed): no work at all.
    if (!targets.length && !tracked.size) {
      if (sweepNow) sweepStrays(dims());
      return;
    }
    /** @type {Set<string>} */
    const wanted = new Set();
    // Each observer's place (and dimension), read once per sync (native reads cost more than the math); its id only
    // when it is within the resend range of a target.
    /** @typedef {{ dimId: string, x: number, y: number, z: number, p: any, id?: string }} Observer */
    /** @param {any} p @param {string | undefined} dimId @param {Observer[]} out */
    const observe = (p, dimId, out) => {
      try {
        if (!p || (!spectatorsExcluded && p.isValid === false)) return; // a fresh getPlayers list holds only valid players
        if (!spectatorsExcluded && typeof p.getGameMode === "function" && String(p.getGameMode()).toLowerCase() === "spectator") return;
        const l = p.location;
        out.push({ dimId: dimId ?? p.dimension.id, x: l.x, y: l.y, z: l.z, p });
      } catch {
        // gone
      }
    };
    /** @param {Observer} o */
    const idOf = (o) => (o.id ??= String(o.p.id ?? o.p.name ?? ""));
    /** Observers by dimension id (observersPerDimension), each list read on first need. @type {Map<string, Observer[]>} */
    const byDim = new Map();
    /** @type {Observer[]} */
    const activeObservers = [];
    if (targets.length && !observersPerDimension) {
      const observers = typeof observerList === "function" ? observerList() : observerList;
      for (const p of observers) observe(p, undefined, activeObservers);
    }
    /** @param {Dimension} dim @param {string} dimId @returns {Observer[]} */
    const observersIn = (dim, dimId) => {
      if (!observersPerDimension) return activeObservers;
      let list = byDim.get(dimId);
      if (!list) {
        byDim.set(dimId, (list = []));
        let players = [];
        try {
          players = typeof observerList === "function" ? /** @type {any} */ (observerList)(dim) : observerList.filter((p) => p.dimension.id === dimId);
        } catch {
          // dimension not ticking
        }
        for (const p of players) observe(p, dimId, list);
      }
      return list;
    };

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
        // Distances from its head (one read for both): a block and a half off its feet matters nothing at 20 blocks.
        const loc = target.getHeadLocation();
        const dim = target.dimension;
        const dimId = dim.id;
        let near = false;
        /** @type {Set<string>} */
        const nearIds = new Set();
        for (const p of observersIn(dim, dimId)) {
          if (p.dimId !== dimId) continue;
          const d2 = (p.x - loc.x) ** 2 + (p.y - loc.y) ** 2 + (p.z - loc.z) ** 2;
          if (d2 <= rangeSq) near = true;
          if (d2 <= NEAR_RESEND_SQ) nearIds.add(idOf(p));
        }
        if (!near) {
          restoreFallback(target, fallback);
          continue;
        }
        const anchor = { x: loc.x, y: loc.y + headOffset, z: loc.z };

        let entry = tracked.get(key);
        if (entry && (!entry.helper.isValid || entry.target.id !== target.id || entry.dimId !== dimId)) {
          remove(entry.helper);
          tracked.delete(key);
          entry = undefined;
        }
        if (!entry) {
          const helper = spawnChecked(dim, labelType, anchor);
          if (ownerTag) helper.addTag(ownerTag);
          if (labelTag) helper.addTag(labelTag);
          if (labelIdTag) helper.addTag(labelIdTag + key);
          entry = { target, helper, dimId, useAltVariant: false };
          tracked.set(key, entry);
        }

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

        // What was written last is trusted between sweeps; a sweep sync reads the helper back in case something
        // else renamed or moved it.
        if (sweepNow) {
          entry.caption = entry.helper.nameTag;
          entry.at = entry.helper.location;
          entry.targetName = undefined;
        }
        if (entry.caption !== helperWanted) {
          entry.helper.nameTag = helperWanted;
          if (entry.helper.nameTag !== helperWanted) throw new Error(`helper ${labelType} failed caption sync`);
          entry.caption = helperWanted;
        }
        const hloc = entry.at;
        if (!hloc || Math.hypot(hloc.x - anchor.x, hloc.y - anchor.y, hloc.z - anchor.z) > 0.01) {
          entry.helper.teleport(anchor);
          entry.at = anchor;
        }
        // The target's name is read back only on a sweep sync too (or when it is new to this entry): something else
        // renaming it (a name tag item) is put right within a sweep.
        if (entry.targetName === undefined) {
          if (target.nameTag !== targetWanted) target.nameTag = targetWanted;
          entry.targetName = targetWanted;
        } else if (entry.targetName !== targetWanted) {
          target.nameTag = targetWanted; // a resend toggle: what is there is what was written last
          entry.targetName = targetWanted;
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
    if (sweepNow) sweepStrays(dims());
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
