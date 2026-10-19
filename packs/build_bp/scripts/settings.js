// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() and shares the same eb:* dynamic properties used by Effortless Building's in-game settings.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { isOp } from "./utils/Permissions.js";

const PACK = "build_bp";
const PREFIX = "build";
const TITLE = "Easy Building";
const BASE = CONFIG;

/** @param {string} prop */
const readWorld = (prop) => () => {
  try {
    return world.getDynamicProperty(prop);
  } catch {
    return undefined;
  }
};
/** @param {string} prop */
const writeWorld = (prop) => (/** @type {any} */ v) => {
  try {
    world.setDynamicProperty(prop, v);
  } catch {}
};

/**
 * Why a player can't use Easy Building at all right now (operators only, or a tag they don't have), for /realm:prefs.
 * @param {Player} p
 */
function cantBuild(p) {
  if (get("operatorsOnly") === true && !isOp(p)) return "Only operators can use Easy Building on this realm";
  const tag = String(get("requiredTag") ?? "");
  if (get("tagRequired") === true && !isOp(p) && !p.hasTag(tag)) return `Easy Building needs the tag "${tag}", which operators give`;
  return undefined;
}

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Easy Building", help: "Disabled: commands only say so and placing blocks builds nothing extra" },
  { key: "operatorsOnly", type: "bool", scope: "world", label: "Only operators can build with the tools" },
  {
    key: "maxBlocksCap",
    type: "int",
    scope: "world",
    label: "Most blocks per build cap",
    min: 64,
    max: 300000,
    step: 64,
    read: readWorld("eb:adminMaxBlocksCap"),
    write: writeWorld("eb:adminMaxBlocksCap"),
  },
  {
    key: "modeComplexity",
    type: "enum",
    scope: "world",
    label: "Mode list complexity",
    choices: ["player", "simple", "advanced"],
    names: ["Players choose", "Force Simple", "Force Advanced"],
    read: readWorld("eb:adminModeComplexity"),
    write: writeWorld("eb:adminModeComplexity"),
  },
  {
    key: "tagRequired",
    type: "bool",
    scope: "world",
    label: "Require a tag to use Easy Building",
    read: readWorld("eb:tagRequired"),
    write: writeWorld("eb:tagRequired"),
  },
  {
    key: "requiredTag",
    type: "text",
    scope: "world",
    label: "Required tag name",
    read: readWorld("eb:requiredTag"),
    write: writeWorld("eb:requiredTag"),
  },
  {
    key: "allowDestroy",
    type: "bool",
    scope: "world",
    label: "Destroy mode with digging tools",
    read: readWorld("eb:allowDestroy"),
    write: writeWorld("eb:allowDestroy"),
  },
  {
    key: "destroyCreativeOnly",
    type: "bool",
    scope: "world",
    label: "Destroy mode in Creative only",
    read: readWorld("eb:destroyCreativeOnly"),
    write: writeWorld("eb:destroyCreativeOnly"),
  },
  {
    key: "allowInfiniteReach",
    type: "bool",
    scope: "world",
    label: "Allow Infinite Reach",
    read: readWorld("eb:allowInfiniteReach"),
    write: writeWorld("eb:allowInfiniteReach"),
  },
  {
    key: "maxReachCap",
    type: "int",
    scope: "world",
    label: "Longest reach cap (blocks, 0 = no cap)",
    min: 0,
    max: 256,
    step: 4,
    read: readWorld("eb:maxReachCap"),
    write: writeWorld("eb:maxReachCap"),
  },
  {
    key: "autoGiveBook",
    type: "bool",
    scope: "world",
    label: "Give books automatically on first join",
    read: readWorld("eb:autoGiveBook"),
    write: writeWorld("eb:autoGiveBook"),
  },
  {
    key: "configTagRequired",
    type: "bool",
    scope: "world",
    label: "Restrict preview quality to required tag",
    read: readWorld("eb:configTagRequired"),
    write: writeWorld("eb:configTagRequired"),
  },
  {
    key: "plainMenusForAll",
    type: "bool",
    scope: "world",
    label: "Plain menus for everyone",
    help: "Use standard menus instead of floating 3D panels for all players",
    read: () => {
      try {
        const v = world.getDynamicProperty("eb:globalCustomUI");
        return typeof v === "boolean" ? !v : undefined;
      } catch {
        return undefined;
      }
    },
    write: (v) => {
      try {
        world.setDynamicProperty("eb:globalCustomUI", typeof v === "boolean" ? !v : undefined);
      } catch {}
    },
  },
  { key: "inOthersClaims", type: "bool", scope: "world", label: "Builds can reach into other players' claims" },
  { key: "safeZonesOperatorsOnly", type: "bool", scope: "world", label: "Only operators build in safe zones", help: "Zones made with /realm:zones" },
  {
    key: "previewMode",
    type: "enum",
    scope: "player",
    lock: [["enabled", false]],
    locked: (p) => cantBuild(p),
    prop: "eb:previewMode",
    default: "outline",
    label: "Build preview style",
    choices: ["particle", "outline", "corner_outline", "disable"],
    names: ["Particles", "Outline", "Outline (Corner)", "Disabled"],
  },
  {
    key: "destroyPreviewMode",
    type: "enum",
    scope: "player",
    lock: [["enabled", false], ["allowDestroy", false]],
    locked: (p) => cantBuild(p),
    prop: "eb:destroyPreviewMode",
    default: "outline",
    label: "Destroy preview style",
    choices: ["outline", "corner_outline", "disable"],
    names: ["Outline", "Outline (Corner)", "Disabled"],
  },
  {
    key: "previewQuality",
    type: "int",
    scope: "player",
    lock: [["enabled", false]],
    locked: (p) => cantBuild(p) ?? (get("configTagRequired") === true && !p.hasTag(String(get("requiredTag") ?? "")) ? `Only players with the tag "${get("requiredTag")}" can change it` : undefined),
    prop: "eb:previewQuality",
    default: 1,
    label: "Preview refresh interval (ticks)",
    min: 1,
    max: 20,
    step: 1,
    choices: ["1", "2", "3", "4", "5", "10", "20"],
  },
  { key: "deferShapeCalc", type: "bool", scope: "player", lock: [["enabled", false]], locked: (p) => cantBuild(p), prop: "eb:deferShapeCalc", default: true, label: "Defer shape calculation while aiming" },
  { key: "flickPreview", type: "bool", scope: "player", lock: [["enabled", false]], locked: (p) => cantBuild(p), prop: "eb:flickPreview", default: false, label: "Flick preview (only flash when aim moves)" },
  { key: "simpleModes", type: "bool", scope: "player", lock: [["enabled", false], ["modeComplexity", "simple"], ["modeComplexity", "advanced"]], locked: (p) => cantBuild(p), prop: "eb:simpleModes", default: false, label: "Simple mode list (Line, Wall, Floor, Cube)" },
  { key: "buildSpeed", type: "int", scope: "player", lock: [["enabled", false]], locked: (p) => cantBuild(p), prop: "eb:buildSpeed", default: 20, label: "Build speed (wave ticks, 1 = instant)", min: 1, max: 100, step: 1 },
  { key: "maxBlocks", type: "int", scope: "player", lock: [["enabled", false]], locked: (p) => cantBuild(p), prop: "eb:maxBlocks", base: "maxBlocksCap", label: "My max blocks per build", min: 64, max: 300000, step: 64 },
  { key: "replaceBlocks", type: "bool", scope: "player", lock: [["enabled", false]], locked: (p) => cantBuild(p), prop: "eb:replaceBlocks", default: true, label: "Replace blocks in Creative mode" },
  { key: "infiniteReach", type: "bool", scope: "player", lock: [["enabled", false], ["allowInfiniteReach", false]], locked: (p) => cantBuild(p), prop: "eb:infiniteReach", default: false, label: "Infinite Reach" },
  { key: "infiniteReachDistance", type: "int", scope: "player", lock: [["enabled", false], ["allowInfiniteReach", false]], locked: (p) => cantBuild(p), prop: "eb:infiniteReachDistance", default: 64, label: "Infinite Reach distance (blocks)", min: 4, max: 256, step: 4 },
  { key: "airBuildReach", type: "int", scope: "player", lock: [["enabled", false]], locked: (p) => cantBuild(p), prop: "eb:airBuildReach", default: 4, label: "Air Build distance (blocks)", min: 1, max: 64, step: 1 },
  { key: "destroyDrops", type: "bool", scope: "player", lock: [["enabled", false], ["allowDestroy", false]], locked: (p) => cantBuild(p), prop: "eb:destroyDrops", default: true, label: "Collect drops in Destroy mode" },
  { key: "undoThreshold", type: "int", scope: "player", lock: [["enabled", false]], locked: (p) => cantBuild(p), prop: "eb:undoThreshold", default: 200, label: "Undo block limit (0 = disabled)", min: 0, max: 1000, step: 50 },
  { key: "floatingUI", type: "bool", scope: "player", lock: [["enabled", false], ["plainMenusForAll", true]], locked: (p) => cantBuild(p), prop: "eb:floatingUI", default: true, label: "Floating 3D panels" },
  { key: "cursor", type: "bool", scope: "player", lock: [["enabled", false], ["plainMenusForAll", true]], locked: (p) => cantBuild(p), prop: "eb:cursor", default: true, label: "Aim cursor on floating panels" },
  {
    key: "panelSize",
    type: "enum",
    scope: "player",
    lock: [["enabled", false], ["plainMenusForAll", true]],
    locked: (p) => cantBuild(p),
    prop: "eb:panelSize",
    default: "normal",
    label: "Floating panel size",
    choices: ["small", "normal", "large"],
    names: ["Small", "Normal", "Large"],
  },
  {
    key: "coachSide",
    type: "enum",
    scope: "player",
    lock: [["enabled", false], ["plainMenusForAll", true]],
    locked: (p) => cantBuild(p),
    prop: "eb:coachSide",
    default: "right",
    label: "Live Coach side",
    choices: ["right", "left"],
    names: ["Right", "Left"],
  },
  {
    key: "panelSounds",
    type: "enum",
    scope: "player",
    lock: [["enabled", false], ["plainMenusForAll", true]],
    locked: (p) => cantBuild(p),
    prop: "eb:panelSounds",
    default: "normal",
    label: "Floating panel sounds",
    choices: ["normal", "quiet", "off"],
    names: ["Normal", "Quiet", "Off"],
  },
  { key: "swapBookActions", type: "bool", scope: "player", lock: [["enabled", false]], locked: (p) => cantBuild(p), prop: "eb:swapBookActions", default: false, label: "Swap Building Book right-click and left-click" },
  { key: "fovZoomEnabled", type: "bool", scope: "player", lock: [["enabled", false]], locked: (p) => cantBuild(p), prop: "eb:fovZoomEnabled", default: true, label: "Selection FOV zoom when aiming far away" },
  { key: "hintsEnabled", type: "bool", scope: "player", lock: [["enabled", false]], locked: (p) => cantBuild(p), prop: "eb:hintsEnabled", default: true, label: "Show gameplay hints" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

// What every pack can change in game, and how. Above this part each pack's scripts/settings.js
// defines PACK (its folder), PREFIX (its dynamic property prefix), TITLE, BASE (its config.js
// values) and OPTIONS, and imports Player, system and world from @minecraft/server.
//
// Realm Settings (settings_bp) talks to this over script events, so packs never import each other:
//   realm:cfg_ping   {id, player?}                 → realm:cfg_schema {id, pack, title, part, parts, options}
//   realm:cfg_set    {id, pack, key, value, player?} → realm:cfg_ack    {id, pack, key, player?, ok, value, error?}
//   realm:cfg_reset  {id, pack}                     → realm:cfg_ack    {id, pack, key: "*", ok}
// World values are saved in `<PREFIX>:cfg` (JSON, only what differs from config.js), player
// values in `<PREFIX>:pref` (JSON) or in an option's own `prop` kept from before this menu.

/**
 * @typedef {object} Option
 * @property {string} key world: path into config.js ("sleep.percent"); player: the preference's name
 * @property {"bool" | "int" | "float" | "enum" | "text"} type
 * @property {"world" | "player"} scope world: set by operators in /realm:config; player: each player's own, in /realm:prefs
 * @property {string} label
 * @property {string} [help] shown as the control's tooltip
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
 * @property {string[]} [choices] enum; or int/float: the only values allowed, as text ("1", "2", "5")
 * @property {string[]} [names] enum only: how each choice reads in the menu, in the same order (default: the choice itself)
 * @property {boolean} [invert] bool only: the value is stored as "off" but the menu shows the switch as "enabled", so it reads without a double negative
 * @property {boolean} [restart] read only when the world starts: shown, but not editable in game
 * @property {string} [base] player only: the world option a player starts with
 * @property {unknown} [default] player only, without `base`: what a player starts with
 * @property {string} [prop] player only: its own dynamic property instead of `<PREFIX>:pref`
 * @property {boolean} [sticky] player only: keep an explicit choice even when it matches the realm default
 * @property {[string, unknown][]} [lock] player only: world options that make this preference do nothing, each with
 *   the value that does it ([["enabled", false]]); /realm:prefs then shows it as set by the operators
 * @property {(player: Player) => string | undefined} [locked] player only: why it can't change for this player now, when
 *   that isn't a plain world value (a tag the player lacks...)
 * @property {() => unknown} [read] world only, saved elsewhere: the saved value, or undefined
 * @property {(value: unknown) => void} [write] world only, saved elsewhere: save it (undefined = back to config.js)
 */

const CFG_PROP = `${PREFIX}:cfg`;
const PREF_PROP = `${PREFIX}:pref`;
/** Script event messages may be at most 2048 characters: answers are split into parts below that, counted in UTF-8 bytes to be safe. */
const MESSAGE_LIMIT = 2048;
const TEXT_MAX = 200;

/** @param {"world" | "player"} scope @param {string} key */
const optionFor = (scope, key) => OPTIONS.find((o) => o.scope === scope && o.key === key);

/** The config.js value at a dotted path such as "sleep.percent". @param {string} key @returns {any} */
function fileDefault(key) {
  /** @type {any} */
  let v = BASE;
  for (const k of key.split(".")) v = v?.[k];
  return v;
}

/** @param {Option} opt @param {unknown} v @returns {string | undefined} why `v` isn't allowed, or undefined if it is */
function problem(opt, v) {
  switch (opt.type) {
    case "bool":
      return typeof v === "boolean" ? undefined : "must be enabled or disabled";
    case "int":
    case "float":
      if (typeof v !== "number" || !Number.isFinite(v)) return "must be a number";
      if (opt.type === "int" && !Number.isInteger(v)) return "must be a whole number";
      if (opt.choices && !opt.choices.includes(String(v))) return `must be one of ${opt.choices.join(", ")}`;
      if ((opt.min !== undefined && v < opt.min) || (opt.max !== undefined && v > opt.max)) return `must be ${opt.min ?? "..."} to ${opt.max ?? "..."}`;
      return undefined;
    case "enum":
      return typeof v === "string" && (opt.choices ?? []).includes(v) ? undefined : `must be one of ${(opt.choices ?? []).join(", ")}`;
    case "text":
      return typeof v === "string" && v.length <= TEXT_MAX ? undefined : `must be text of up to ${TEXT_MAX} characters`;
  }
  return "has an unknown type";
}

// ---------------------------------------------------------------------------
// World options
// ---------------------------------------------------------------------------

/** @type {Record<string, unknown> | undefined} */
let saved;

/** What operators saved in /realm:config (cached; this pack is the only writer). */
function worldOverrides() {
  if (saved) return saved;
  let raw;
  try {
    raw = world.getDynamicProperty(CFG_PROP);
  } catch {
    return {}; // the world isn't loaded yet: config.js for now, and read it again next time
  }
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : {};
    saved = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    console.warn(`[${PREFIX}] ${CFG_PROP} is corrupt; using config.js`);
    saved = {};
  }
  return /** @type {Record<string, unknown>} */ (saved);
}

/** @param {Record<string, unknown>} next */
function saveOverrides(next) {
  saved = next;
  world.setDynamicProperty(CFG_PROP, Object.keys(next).length ? JSON.stringify(next) : undefined);
}

/**
 * An option's value for the whole world: what an operator saved in /realm:config, else config.js.
 * Options marked `restart`, and anything not in OPTIONS, always come from config.js.
 * @param {string} key @returns {any}
 */
export function get(key) {
  const opt = optionFor("world", key);
  if (opt && !opt.restart) {
    let v;
    try {
      v = opt.read ? opt.read() : worldOverrides()[key];
    } catch {
      v = undefined;
    }
    if (v !== undefined && !problem(opt, v)) return v;
  }
  return fileDefault(key);
}

/**
 * Saves a world option. The config.js value clears the override, so a later config.js change applies.
 * @param {string} key @param {unknown} value @returns {string | undefined} why it wasn't saved
 */
export function set(key, value) {
  const opt = optionFor("world", key);
  if (!opt) return "isn't a setting";
  if (opt.restart) return "is only read when the world starts: change it in config.js";
  const bad = problem(opt, value);
  if (bad) return bad;
  const keep = value === fileDefault(key) ? undefined : value;
  if (opt.write) opt.write(keep);
  else {
    const next = { ...worldOverrides() };
    if (keep === undefined) delete next[key];
    else next[key] = keep;
    saveOverrides(next);
  }
  changed(key);
  return undefined;
}

/** Every world option back to config.js. Players' own choices are kept. */
export function reset() {
  for (const o of OPTIONS) if (o.scope === "world" && o.write) o.write(undefined);
  saveOverrides({});
  changed("*");
}

// ---------------------------------------------------------------------------
// Player options
// ---------------------------------------------------------------------------

/** What a player has until they choose: the realm's value (`base`), or the option's `default`. @param {Option} opt @returns {any} */
const playerBase = (opt) => (opt.base !== undefined ? get(opt.base) : opt.default);

/** @param {Player} player @returns {Record<string, unknown>} */
function prefsOf(player) {
  try {
    const raw = player.getDynamicProperty(PREF_PROP);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * A player's own value for a player option (from /realm:prefs or the pack's toggle command), else
 * the realm's. For a key that is only a world option, the world value.
 * @param {Player} player @param {string} key @returns {any}
 */
export function getFor(player, key) {
  const opt = optionFor("player", key);
  if (!opt) return get(key);
  let v;
  try {
    v = opt.prop ? player.getDynamicProperty(opt.prop) : prefsOf(player)[key];
  } catch {
    v = undefined;
  }
  return v !== undefined && !problem(opt, v) ? v : playerBase(opt);
}

/**
 * Saves a player's own choice. Unless the option is sticky, choosing what the realm has clears it
 * so the player follows later changes to the realm's value.
 * @param {Player} player @param {string} key @param {unknown} value @returns {string | undefined} why it wasn't saved
 */
export function setFor(player, key, value) {
  const opt = optionFor("player", key);
  if (!opt) return "isn't a preference";
  const bad = problem(opt, value);
  if (bad) return bad;
  const keep = /** @type {boolean | number | string | undefined} */ (opt.sticky !== true && value === playerBase(opt) ? undefined : value);
  if (opt.prop) player.setDynamicProperty(opt.prop, keep);
  else {
    const prefs = prefsOf(player);
    if (keep === undefined) delete prefs[key];
    else prefs[key] = keep;
    player.setDynamicProperty(PREF_PROP, Object.keys(prefs).length ? JSON.stringify(prefs) : undefined);
  }
  changed(key, player);
  return undefined;
}

// ---------------------------------------------------------------------------
// Change listeners
// ---------------------------------------------------------------------------

/** @type {((key: string, player?: Player) => void)[]} */
const listeners = [];

/**
 * Runs `fn` after a setting changes: `key` is the option ("*" after a reset), `player` is set for a player option.
 * @param {(key: string, player?: Player) => void} fn
 */
export function onChange(fn) {
  listeners.push(fn);
}

/** @param {string} key @param {Player} [player] */
function changed(key, player) {
  for (const fn of listeners) {
    try {
      fn(key, player);
    } catch (e) {
      console.warn(`[${PREFIX}] ${e}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Realm Settings protocol
// ---------------------------------------------------------------------------

/**
 * Why a player's preference does nothing right now because of the operators, in words for /realm:prefs ("Coordinates
 * HUD is Disabled for the whole realm"), or undefined when the player's choice counts.
 * @param {Option} o @param {Player} player
 */
function lockedFor(o, player) {
  for (const [key, value] of o.lock ?? []) {
    if (get(key) !== value) continue;
    const w = optionFor("world", key);
    const shown = typeof value === "boolean" ? (w?.invert ? !value : value) ? "Enabled" : "Disabled" : w?.type === "enum" && w.names && w.choices ? w.names[w.choices.indexOf(String(value))] ?? String(value) : String(value);
    return `${w?.label ?? key} is ${shown} for the whole realm`;
  }
  try {
    return o.locked?.(player);
  } catch {
    return undefined;
  }
}

/** @param {Player | undefined} player @returns {object[]} the options, with their current values */
function describe(player) {
  return OPTIONS.filter((o) => o.scope === "world" || player).map((o) => {
    const isWorld = o.scope === "world";
    return {
      key: o.key,
      type: o.type,
      label: o.label,
      help: o.help,
      value: isWorld ? get(o.key) : getFor(/** @type {Player} */ (player), o.key),
      default: isWorld ? fileDefault(o.key) : playerBase(o),
      min: o.min,
      max: o.max,
      step: o.step,
      choices: o.choices,
      names: o.names,
      invert: o.invert || undefined,
      scope: o.scope,
      restart: o.restart || undefined,
      locked: isWorld ? undefined : lockedFor(o, /** @type {Player} */ (player)),
    };
  });
}

/** UTF-8 length, so a message is under the limit however the game counts it. @param {string} s */
function bytes(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? 2 : 3; // a surrogate pair counts 2 + 2
  }
  return n;
}

/** @param {string} id @returns {Player | undefined} */
const online = (id) => {
  try {
    const e = world.getEntity(id); // one lookup, not a scan of every player (each pack answers every /realm:prefs open)
    return e instanceof Player ? e : undefined;
  } catch {
    return undefined;
  }
};

/** @param {any} req */
function answer(req) {
  const player = typeof req.player === "string" ? online(req.player) : undefined;
  /** @param {object[]} options @param {number} part @param {number} parts */
  const envelope = (options, part, parts) => JSON.stringify({ id: req.id, pack: PACK, title: TITLE, part, parts, options });
  /** @type {object[][]} */
  const parts = [[]];
  for (const o of describe(player)) {
    const last = /** @type {object[]} */ (parts.at(-1));
    if (last.length && bytes(envelope([...last, o], 99, 99)) > MESSAGE_LIMIT) parts.push([o]);
    else last.push(o);
  }
  parts.forEach((options, i) => system.sendScriptEvent("realm:cfg_schema", envelope(options, i + 1, parts.length)));
}

/** @param {any} req */
function applySet(req) {
  const { key, value } = req;
  if (typeof key !== "string") return;
  const forPlayer = typeof req.player === "string";
  if (!optionFor(forPlayer ? "player" : "world", key)) return; // unknown keys are ignored
  const player = forPlayer ? online(req.player) : undefined;
  let error = forPlayer && !player ? "that player isn't online" : undefined;
  if (!error) error = player ? setFor(player, key, value) : set(key, value);
  const ack = {
    id: req.id,
    pack: PACK,
    key,
    player: req.player,
    ok: !error,
    error,
    value: player ? getFor(player, key) : forPlayer ? undefined : get(key),
  };
  system.sendScriptEvent("realm:cfg_ack", JSON.stringify(ack));
}

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:cfg_ping" && id !== "realm:cfg_set" && id !== "realm:cfg_reset") return;
    try {
      const req = JSON.parse(message);
      if (!req || typeof req !== "object") return;
      if (id === "realm:cfg_ping") answer(req);
      else if (req.pack !== PACK) return;
      else if (id === "realm:cfg_set") applySet(req);
      else {
        reset();
        system.sendScriptEvent("realm:cfg_ack", JSON.stringify({ id: req.id, pack: PACK, key: "*", ok: true }));
      }
    } catch (e) {
      console.warn(`[${PREFIX}] settings: ${e}`);
    }
  },
  { namespaces: ["realm"] }
);
