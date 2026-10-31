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

/** Live block cap. A missing save uses config.js. Raising this does not write a higher default. */
function liveCap() {
  try {
    const saved = world.getDynamicProperty("eb:adminMaxBlocksCap");
    if (typeof saved === "number" && Number.isFinite(saved) && saved >= 1) return Math.min(300000, Math.floor(saved));
  } catch {}
  const cfg = Number(CONFIG.maxBlocksCap);
  return Number.isFinite(cfg) && cfg >= 1 ? Math.min(300000, Math.floor(cfg)) : 50000;
}

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
    write: (v) => {
      writeWorld("eb:adminMaxBlocksCap")(v);
      syncBlockLimitPrefs();
    },
  },
  {
    key: "defaultMaxBlocks",
    type: "int",
    scope: "world",
    label: "Default blocks per build",
    help: "Players with no saved limit. Raising the cap does not change this. Operators only.",
    min: 64,
    get max() { return liveCap(); },
    step: 64,
    read: () => {
      const cap = liveCap();
      let saved;
      try { saved = world.getDynamicProperty("eb:defaultMaxBlocks"); } catch {}
      const chosen = typeof saved === "number" && Number.isFinite(saved) ? saved : Number(CONFIG.defaultMaxBlocks) || 50000;
      return Math.max(1, Math.min(cap, Math.floor(chosen)));
    },
    write: (v) => {
      if (v === undefined) { writeWorld("eb:defaultMaxBlocks")(undefined); return; }
      const cap = liveCap();
      const n = Math.max(1, Math.min(cap, Math.floor(Number(v))));
      writeWorld("eb:defaultMaxBlocks")(n);
    },
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
  { key: "maxBlocks", type: "int", scope: "player", lock: [["enabled", false]], locked: (p) => { syncBlockLimitPrefs(p); return cantBuild(p); }, get prop() { syncBlockLimitPrefs(); return "eb:maxBlocks"; }, base: "defaultMaxBlocks", label: "My max blocks per build", min: 64, get max() { return liveCap(); }, step: 64 },
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

/** Clamp a saved player limit that is above the live cap so prefs and builds agree. A later cap increase does not restore the old number. */
/** @param {import("@minecraft/server").Player} [player] */
export function syncBlockLimitPrefs(player) {
  const cap = liveCap();
  /** @param {import("@minecraft/server").Player} who */
  const clampOne = (who) => {
    try {
      const v = who.getDynamicProperty("eb:maxBlocks");
      if (typeof v === "number" && Number.isFinite(v) && v > cap) who.setDynamicProperty("eb:maxBlocks", cap);
    } catch {}
  };
  if (player) { clampOne(player); return; }
  try { for (const p of world.getAllPlayers()) clampOne(p); } catch {}
}
try {
  world.afterEvents.playerSpawn.subscribe(({ player }) => syncBlockLimitPrefs(player));
} catch {}

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
