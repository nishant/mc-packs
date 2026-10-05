// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "chairs_bp";
const PREFIX = "chairs";
const TITLE = "Chairs";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "maxReach", type: "float", scope: "world", label: "Farthest a seat may be from you (blocks)", min: 1, max: 5, step: 0.5 },
  { key: "cleanupTicks", type: "int", scope: "world", label: "Ticks between removing empty seats", restart: true },
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
 * @property {string[]} [choices] enum only
 * @property {boolean} [restart] read only when the world starts: shown, but not editable in game
 * @property {string} [base] player only: the world option a player starts with
 * @property {unknown} [default] player only, without `base`: what a player starts with
 * @property {string} [prop] player only: its own dynamic property instead of `<PREFIX>:pref`
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
      return typeof v === "boolean" ? undefined : "must be on or off";
    case "int":
    case "float":
      if (typeof v !== "number" || !Number.isFinite(v)) return "must be a number";
      if (opt.type === "int" && !Number.isInteger(v)) return "must be a whole number";
      if ((opt.min !== undefined && v < opt.min) || (opt.max !== undefined && v > opt.max)) return `must be ${opt.min ?? "…"} to ${opt.max ?? "…"}`;
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
 * Saves a player's own choice. Choosing what the realm has clears it, so the player follows later
 * changes to the realm's value.
 * @param {Player} player @param {string} key @param {unknown} value @returns {string | undefined} why it wasn't saved
 */
export function setFor(player, key, value) {
  const opt = optionFor("player", key);
  if (!opt) return "isn't a preference";
  const bad = problem(opt, value);
  if (bad) return bad;
  const keep = /** @type {boolean | number | string | undefined} */ (value === playerBase(opt) ? undefined : value);
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
      scope: o.scope,
      restart: o.restart || undefined,
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
const online = (id) => world.getAllPlayers().find((p) => p.id === id);

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
