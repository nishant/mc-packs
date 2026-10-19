// @ts-nocheck
import { world } from "@minecraft/server";
import { get, syncBlockLimitPrefs } from "../settings.js";
import { getCallingBonus } from "./Protection.js";
import { applyBuildBonus, resolveCap, resolveDefaultMaxBlocks, resolvePlayerMaxBlocks } from "./block-limit.js";
import { isOp } from "../utils/Permissions.js";
export const HARD_MAX_BLOCKS = 300_000;
const DP_PREVIEW_MODE   = "eb:previewMode";
const DEFAULT_PREVIEW   = "outline";
export const PREVIEW_MODES  = ["particle", "outline", "corner_outline", "disable"];
export const PREVIEW_LABELS = ["Particles", "Outline", "Outline (Corner)", "Disabled"];
export function getPreviewMode(player) {
    try {
        const val = player.getDynamicProperty(DP_PREVIEW_MODE);
        if (typeof val === "string" && PREVIEW_MODES.includes(val)) return val;
    } catch {  }
    return DEFAULT_PREVIEW;
}
export function setPreviewMode(player, mode) {
    if (!PREVIEW_MODES.includes(mode)) return;
    try { player.setDynamicProperty(DP_PREVIEW_MODE, mode); } catch {  }
}
const DP_DESTROY_PREVIEW_MODE = "eb:destroyPreviewMode";
export const DESTROY_PREVIEW_MODES  = ["outline", "corner_outline", "disable"];
export const DESTROY_PREVIEW_LABELS = ["Outline", "Outline (Corner)", "Disabled"];
export function getDestroyPreviewMode(player) {
    try {
        const val = player.getDynamicProperty(DP_DESTROY_PREVIEW_MODE);
        if (typeof val === "string" && DESTROY_PREVIEW_MODES.includes(val)) return val;
    } catch {  }
    return DEFAULT_PREVIEW;
}
export function setDestroyPreviewMode(player, mode) {
    if (!DESTROY_PREVIEW_MODES.includes(mode)) return;
    try { player.setDynamicProperty(DP_DESTROY_PREVIEW_MODE, mode); } catch {  }
}
const DP_FLICK_PREVIEW = "eb:flickPreview";
export function getFlickPreview(player) {
    try {
        const v = player.getDynamicProperty(DP_FLICK_PREVIEW);
        if (typeof v === "boolean") return v;
    } catch {  }
    return false;
}
export function setFlickPreview(player, enabled) {
    try { player.setDynamicProperty(DP_FLICK_PREVIEW, Boolean(enabled)); } catch (e) {
        console.warn(`[EB] setDynamicProperty failed: ${e}`);
    }
}
const DP_AIR_BUILD_REACH  = "eb:airBuildReach";
const DEFAULT_AIR_REACH   = 4;
export const MAX_AIR_BUILD_REACH = 64;
export function getAirBuildReach(player) {
    try {
        const val = player.getDynamicProperty(DP_AIR_BUILD_REACH);
        if (typeof val === "number" && val >= 1) return Math.floor(val);
    } catch {  }
    return DEFAULT_AIR_REACH;
}
export function setAirBuildReach(player, value) {
    const clamped = Math.max(1, Math.min(MAX_AIR_BUILD_REACH, Math.floor(value)));
    try {
        player.setDynamicProperty(DP_AIR_BUILD_REACH, clamped);
    } catch (e) {
        console.warn(`[EB] setDynamicProperty failed: ${e}`);
    }
    return clamped;
}
const DP_INFINITE_REACH = "eb:infiniteReach";
const DP_INFINITE_REACH_DISTANCE = "eb:infiniteReachDistance";
export function getInfiniteReach(player) {
    if (!getAllowInfiniteReach()) return false;
    try {
        const val = player.getDynamicProperty(DP_INFINITE_REACH);
        if (typeof val === "boolean") return val;
    } catch {  }
    return false;
}
export function setInfiniteReach(player, enabled) {
    try {
        player.setDynamicProperty(DP_INFINITE_REACH, Boolean(enabled));
    } catch (e) {
        console.warn(`[EB] setDynamicProperty failed: ${e}`);
    }
}
export function getInfiniteReachDistance(player) {
    try {
        const val = player.getDynamicProperty(DP_INFINITE_REACH_DISTANCE);
        if (typeof val === "number" && val >= 4) {
            const cap = getMaxReachCap();
            return cap > 0 ? Math.min(Math.floor(val), cap) : Math.floor(val);
        }
    } catch {  }
    const cap = getMaxReachCap();
    return cap > 0 ? Math.min(64, cap) : 64;
}
export function setInfiniteReachDistance(player, value) {
    const clamped = Math.max(4, Math.floor(value));
    try { player.setDynamicProperty(DP_INFINITE_REACH_DISTANCE, clamped); } catch (e) {
        console.warn(`[EB] setDynamicProperty failed: ${e}`);
    }
    return clamped;
}
const DEFAULT_MAX_BLOCKS           = 50_000;
const DEFAULT_ADMIN_MAX_BLOCKS_CAP = 50_000;
const DP_MAX_BLOCKS                = "eb:maxBlocks";
const DP_DEFAULT_MAX_BLOCKS        = "eb:defaultMaxBlocks";
const DP_ADMIN_MAX_BLOCKS_CAP      = "eb:adminMaxBlocksCap";
export function getAdminMaxBlocksCap() {
    let saved;
    try { saved = world.getDynamicProperty(DP_ADMIN_MAX_BLOCKS_CAP); } catch {}
    return resolveCap(saved, Number(get("maxBlocksCap")));
}
export function setAdminMaxBlocksCap(value) {
    const v = Math.max(1, Math.min(HARD_MAX_BLOCKS, Math.floor(value)));
    try { world.setDynamicProperty(DP_ADMIN_MAX_BLOCKS_CAP, v); } catch {}
    syncBlockLimitPrefs();
    return v;
}
export function getDefaultMaxBlocks() {
    let saved;
    try { saved = world.getDynamicProperty(DP_DEFAULT_MAX_BLOCKS); } catch {}
    return resolveDefaultMaxBlocks({
        saved,
        configDefault: Number(get("defaultMaxBlocks")) || DEFAULT_MAX_BLOCKS,
        cap: getAdminMaxBlocksCap(),
    });
}
export function setDefaultMaxBlocks(value) {
    const cap = getAdminMaxBlocksCap();
    const v = Math.max(1, Math.min(cap, Math.floor(value)));
    try { world.setDynamicProperty(DP_DEFAULT_MAX_BLOCKS, v); } catch {}
    return v;
}
export function getMaxBlocks(player) {
    syncBlockLimitPrefs(player);
    const cap = getAdminMaxBlocksCap();
    let saved;
    try { saved = player.getDynamicProperty(DP_MAX_BLOCKS); } catch {}
    const base = resolvePlayerMaxBlocks({ saved, fallback: getDefaultMaxBlocks(), cap });
    return applyBuildBonus(base, getCallingBonus(player, "buildEye"));
}
export function setMaxBlocks(player, value) {
    const adminCap = getAdminMaxBlocksCap();
    const clamped = Math.max(1, Math.min(adminCap, Math.floor(value)));
    try {
        player.setDynamicProperty(DP_MAX_BLOCKS, clamped);
    } catch (e) {
        console.warn(`[EB] setDynamicProperty failed: ${e}`);
    }
    return clamped;
}
const DP_TAG_REQUIRED  = "eb:tagRequired";
const DP_REQUIRED_TAG  = "eb:requiredTag";
const DEFAULT_REQUIRED_TAG = "admin";
export function getTagRequired() {
    try {
        const val = world.getDynamicProperty(DP_TAG_REQUIRED);
        if (typeof val === "boolean") return val;
    } catch {  }
    return Boolean(get("tagRequired"));
}
export function setTagRequired(enabled) {
    try { world.setDynamicProperty(DP_TAG_REQUIRED, Boolean(enabled)); } catch {  }
}
const DP_ALLOW_DESTROY    = "eb:allowDestroy";
const DP_DESTROY_CREATIVE = "eb:destroyCreativeOnly";
const DP_ALLOW_INF_REACH  = "eb:allowInfiniteReach";
const DP_MAX_REACH_CAP    = "eb:maxReachCap";
const DP_AUTO_GIVE_BOOK   = "eb:autoGiveBook";
export function getAllowDestroy() {
    try { const v = world.getDynamicProperty(DP_ALLOW_DESTROY); if (typeof v === "boolean") return v; } catch {}
    return get("allowDestroy") !== false;
}
export function setAllowDestroy(enabled) {
    try { world.setDynamicProperty(DP_ALLOW_DESTROY, Boolean(enabled)); } catch {}
}
export function getDestroyCreativeOnly() {
    try { const v = world.getDynamicProperty(DP_DESTROY_CREATIVE); if (typeof v === "boolean") return v; } catch {}
    return Boolean(get("destroyCreativeOnly"));
}
export function setDestroyCreativeOnly(enabled) {
    try { world.setDynamicProperty(DP_DESTROY_CREATIVE, Boolean(enabled)); } catch {}
}
export function getAllowInfiniteReach() {
    try { const v = world.getDynamicProperty(DP_ALLOW_INF_REACH); if (typeof v === "boolean") return v; } catch {}
    return get("allowInfiniteReach") !== false;
}
export function setAllowInfiniteReach(enabled) {
    try { world.setDynamicProperty(DP_ALLOW_INF_REACH, Boolean(enabled)); } catch {}
}
export function getMaxReachCap() {
    try { const v = world.getDynamicProperty(DP_MAX_REACH_CAP); if (typeof v === "number" && v >= 0) return Math.floor(v); } catch {}
    const cfg = Number(get("maxReachCap"));
    return Number.isFinite(cfg) && cfg >= 0 ? Math.floor(cfg) : 0;
}
export function setMaxReachCap(value) {
    const v = Math.max(0, Math.floor(value));
    try { world.setDynamicProperty(DP_MAX_REACH_CAP, v); } catch {}
    return v;
}
export function getAutoGiveBook() {
    try { const v = world.getDynamicProperty(DP_AUTO_GIVE_BOOK); if (typeof v === "boolean") return v; } catch {}
    return Boolean(get("autoGiveBook"));
}
export function setAutoGiveBook(enabled) {
    try { world.setDynamicProperty(DP_AUTO_GIVE_BOOK, Boolean(enabled)); } catch {}
}
export function getRequiredTag() {
    try {
        const val = world.getDynamicProperty(DP_REQUIRED_TAG);
        if (typeof val === "string" && val.trim().length > 0) return val.trim();
    } catch {  }
    const cfg = String(get("requiredTag") ?? "").trim();
    return cfg || DEFAULT_REQUIRED_TAG;
}
export function setRequiredTag(tag) {
    const trimmed = String(tag).trim();
    if (!trimmed) return;
    try { world.setDynamicProperty(DP_REQUIRED_TAG, trimmed); } catch {  }
}
export function hasRequiredTag(player) {
    if (get("enabled") === false) return false;
    if (get("operatorsOnly") === true && !isOp(player)) return false;
    if (!getTagRequired()) return true;
    if (isOp(player)) return true;
    try { return player.hasTag(getRequiredTag()); } catch { return false; }
}
export const BUILD_SPEED_OPTIONS = [1, 20, 60, 100];
export const BUILD_SPEED_LABELS  = ["Instant", "Fast (Default)", "Normal", "Slow"];
export function waveToQueueSpeed(waveTicks) { return Math.ceil(50000 / waveTicks); }
export const UNDO_THRESHOLD_OPTIONS = [0, 200, 500, 1000];
export const UNDO_THRESHOLD_LABELS  = ["Disabled", "200 blocks (Default)", "500 blocks", "1 000 blocks"];
const DP_UNDO_THRESHOLD      = "eb:undoThreshold";
const DEFAULT_UNDO_THRESHOLD = 200;
export function getUndoThreshold(player) {
    try {
        const val = player.getDynamicProperty(DP_UNDO_THRESHOLD);
        if (typeof val === "number" && val >= 0) return Math.floor(val);
    } catch {}
    return DEFAULT_UNDO_THRESHOLD;
}
export function setUndoThreshold(player, value) {
    const clamped = Math.max(0, Math.floor(value));
    try { player.setDynamicProperty(DP_UNDO_THRESHOLD, clamped); } catch (e) {
        console.warn(`[EB] setDynamicProperty failed: ${e}`);
    }
    return clamped;
}
const DP_REPLACE_BLOCKS = "eb:replaceBlocks";
export function getReplaceBlocks(player) {
    try {
        const val = player.getDynamicProperty(DP_REPLACE_BLOCKS);
        if (typeof val === "boolean") return val;
    } catch {}
    return true;
}
export function setReplaceBlocks(player, enabled) {
    try { player.setDynamicProperty(DP_REPLACE_BLOCKS, Boolean(enabled)); } catch (e) {
        console.warn(`[EB] setDynamicProperty failed: ${e}`);
    }
}
const DP_DESTROY_DROPS = "eb:destroyDrops";
export function getDestroyDrops(player) {
    try { const v = player.getDynamicProperty(DP_DESTROY_DROPS); if (typeof v === "boolean") return v; } catch {}
    return true;
}
export function setDestroyDrops(player, enabled) {
    try { player.setDynamicProperty(DP_DESTROY_DROPS, Boolean(enabled)); } catch (e) {
        console.warn(`[EB] setDynamicProperty failed: ${e}`);
    }
}

const DP_PREVIEW_QUALITY      = "eb:previewQuality";
export const PREVIEW_QUALITY_OPTIONS = [1, 2, 3, 4, 5, 10, 20];
export const PREVIEW_QUALITY_LABELS  = ["Smooth (1 tick)", "Sharp (2 ticks)", "Crisp (3 ticks)", "Balanced (4 ticks)", "Responsive (5 ticks)", "Lite (10 ticks)", "Minimal (20 ticks)"];
export function getPreviewQuality(player) {
    try {
        const val = player.getDynamicProperty(DP_PREVIEW_QUALITY);
        if (typeof val === "number" && PREVIEW_QUALITY_OPTIONS.includes(val)) return val;
    } catch {}
    return 1;
}
export function setPreviewQuality(player, value) {
    const v = PREVIEW_QUALITY_OPTIONS.includes(value) ? value : 1;
    try { player.setDynamicProperty(DP_PREVIEW_QUALITY, v); } catch (e) {
        console.warn(`[EB] setDynamicProperty failed: ${e}`);
    }
    return v;
}

const DP_DEFER_SHAPE_CALC = "eb:deferShapeCalc";

export const SHAPE_SETTLE_TICKS = 10;
export function getDeferShapeCalc(player) {
    try {
        const v = player.getDynamicProperty(DP_DEFER_SHAPE_CALC);
        if (typeof v === "boolean") return v;
    } catch {}
    return true;
}
export function setDeferShapeCalc(player, enabled) {
    try { player.setDynamicProperty(DP_DEFER_SHAPE_CALC, Boolean(enabled)); } catch (e) {
        console.warn(`[EB] setDynamicProperty failed: ${e}`);
    }
}

const DP_CONFIG_TAG_REQUIRED = "eb:configTagRequired";
export function getConfigTagRequired() {
    try { const v = world.getDynamicProperty(DP_CONFIG_TAG_REQUIRED); if (typeof v === "boolean") return v; } catch {}
    return Boolean(get("configTagRequired"));
}
export function setConfigTagRequired(enabled) {
    try { world.setDynamicProperty(DP_CONFIG_TAG_REQUIRED, Boolean(enabled)); } catch {}
}
const DP_BUILD_SPEED      = "eb:buildSpeed";
const DEFAULT_BUILD_SPEED = 20;
export function getBuildSpeed(player) {
    try {
        const val = player.getDynamicProperty(DP_BUILD_SPEED);
        if (typeof val === "number" && val >= 1) return Math.floor(val);
    } catch {}
    return DEFAULT_BUILD_SPEED;
}
export function setBuildSpeed(player, blocksPerTick) {
    const clamped = Math.max(1, Math.floor(blocksPerTick));
    try { player.setDynamicProperty(DP_BUILD_SPEED, clamped); } catch (e) {
        console.warn(`[EB] setDynamicProperty failed: ${e}`);
    }
    return clamped;
}
const DP_SWAP_BOOK_ACTIONS = "eb:swapBookActions";
export function getSwapBookActions(player) {
    try {
        const v = player.getDynamicProperty(DP_SWAP_BOOK_ACTIONS);
        if (typeof v === "boolean") return v;
    } catch {}
    return false;
}
export function setSwapBookActions(player, enabled) {
    try { player.setDynamicProperty(DP_SWAP_BOOK_ACTIONS, Boolean(enabled)); } catch (e) {
        console.warn(`[EB] setDynamicProperty failed: ${e}`);
    }
}

const DP_HINTS_ENABLED = "eb:hintsEnabled";
export function getHintsEnabled(player) {
    try {
        const v = player.getDynamicProperty(DP_HINTS_ENABLED);
        if (typeof v === "boolean") return v;
    } catch {}
    return true;
}
export function setHintsEnabled(player, enabled) {
    try { player.setDynamicProperty(DP_HINTS_ENABLED, Boolean(enabled)); } catch (e) {
        console.warn(`[EB] setDynamicProperty failed: ${e}`);
    }
}

const DP_FOV_ZOOM_ENABLED = "eb:fovZoomEnabled";
export function getFovZoomEnabled(player) {
    try {
        const v = player.getDynamicProperty(DP_FOV_ZOOM_ENABLED);
        if (typeof v === "boolean") return v;
    } catch {}
    return true;
}
export function setFovZoomEnabled(player, enabled) {
    try { player.setDynamicProperty(DP_FOV_ZOOM_ENABLED, Boolean(enabled)); } catch (e) {
        console.warn(`[EB] setDynamicProperty failed: ${e}`);
    }
}
const DP_FOV_ZOOM_START = "eb:fovZoomStart";
const DP_FOV_ZOOM_MAX   = "eb:fovZoomMax";
export const DEFAULT_FOV_ZOOM_START = 3;
export const DEFAULT_FOV_ZOOM_MAX   = 64;
export function getFovZoomStart(player) {
    try {
        const v = player.getDynamicProperty(DP_FOV_ZOOM_START);
        if (typeof v === "number" && v >= 1) return Math.floor(v);
    } catch {}
    return DEFAULT_FOV_ZOOM_START;
}
export function setFovZoomStart(player, value) {
    const v = Math.max(1, Math.min(50, Math.floor(value)));
    try { player.setDynamicProperty(DP_FOV_ZOOM_START, v); } catch (e) {
        console.warn(`[EB] setDynamicProperty failed: ${e}`);
    }
    return v;
}
export function getFovZoomMax(player) {
    try {
        const v = player.getDynamicProperty(DP_FOV_ZOOM_MAX);
        if (typeof v === "number" && v >= 1) return Math.floor(v);
    } catch {}
    return DEFAULT_FOV_ZOOM_MAX;
}
export function setFovZoomMax(player, value) {
    const v = Math.max(1, Math.min(200, Math.floor(value)));
    try { player.setDynamicProperty(DP_FOV_ZOOM_MAX, v); } catch (e) {
        console.warn(`[EB] setDynamicProperty failed: ${e}`);
    }
    return v;
}

const DP_SIMPLE_MODES = "eb:simpleModes";
const DP_ADMIN_MODE_COMPLEXITY = "eb:adminModeComplexity";
export const MODE_COMPLEXITY_OPTIONS = ["player", "simple", "advanced"];
export const MODE_COMPLEXITY_LABELS  = ["Players choose", "Force Simple", "Force Advanced"];

export function getAdminModeComplexity() {
    try {
        const v = world.getDynamicProperty(DP_ADMIN_MODE_COMPLEXITY);
        if (typeof v === "string" && MODE_COMPLEXITY_OPTIONS.includes(v)) return v;
    } catch {}
    const cfg = String(get("modeComplexity") ?? "player");
    return MODE_COMPLEXITY_OPTIONS.includes(cfg) ? cfg : "player";
}
export function setAdminModeComplexity(value) {
    if (!MODE_COMPLEXITY_OPTIONS.includes(value)) return;
    try { world.setDynamicProperty(DP_ADMIN_MODE_COMPLEXITY, value); } catch {}
}
export function isModeComplexityLocked() {
    return getAdminModeComplexity() !== "player";
}

export function getSimpleModesPref(player) {
    try {
        const v = player.getDynamicProperty(DP_SIMPLE_MODES);
        if (typeof v === "boolean") return v;
    } catch {}
    return false;
}
export function hasSimpleModesPref(player) {
    try { return typeof player.getDynamicProperty(DP_SIMPLE_MODES) === "boolean"; }
    catch { return false; }
}
export function setSimpleModes(player, enabled) {
    try { player.setDynamicProperty(DP_SIMPLE_MODES, Boolean(enabled)); } catch (e) {
        console.warn(`[EB] setDynamicProperty failed: ${e}`);
    }
}

export function getSimpleModes(player) {
    const admin = getAdminModeComplexity();
    if (admin === "simple")   return true;
    if (admin === "advanced") return false;
    return getSimpleModesPref(player);
}

const DP_ADVANCED_SETTINGS = "eb:advancedSettings";
export function getAdvancedSettings(player) {
    try {
        const v = player.getDynamicProperty(DP_ADVANCED_SETTINGS);
        if (typeof v === "boolean") return v;
    } catch {}
    return false;
}
export function setAdvancedSettings(player, enabled) {
    try { player.setDynamicProperty(DP_ADVANCED_SETTINGS, Boolean(enabled)); } catch (e) {
        console.warn(`[EB] setDynamicProperty failed: ${e}`);
    }
}


const DP_ONBOARDED = "eb:onboarded";
export function getOnboarded(player) {
    try {
        const v = player.getDynamicProperty(DP_ONBOARDED);
        if (typeof v === "boolean") return v;
    } catch {}
    return false;
}
export function setOnboarded(player, enabled) {
    try { player.setDynamicProperty(DP_ONBOARDED, Boolean(enabled)); } catch (e) {
        console.warn(`[EB] setDynamicProperty failed: ${e}`);
    }
}

const DP_BOOK_LANGUAGE = "eb:bookLanguage";
export function hasBookLanguage(player) {
    try { return typeof player.getDynamicProperty(DP_BOOK_LANGUAGE) === "string"; }
    catch { return false; }
}
export function getBookLanguage(player) {
    try {
        const v = player.getDynamicProperty(DP_BOOK_LANGUAGE);
        if (typeof v === "string") return v;
    } catch {}
    return "en";
}
export function setBookLanguage(player, languageId) {
    try { player.setDynamicProperty(DP_BOOK_LANGUAGE, String(languageId)); } catch (e) {
        console.warn(`[EB] setDynamicProperty failed: ${e}`);
    }
}

const DP_GLOBAL_CUSTOM_UI = "eb:globalCustomUI";
export function getGlobalCustomUI() {
    try {
        const v = world.getDynamicProperty(DP_GLOBAL_CUSTOM_UI);
        if (typeof v === "boolean") return v;
    } catch {}
    return get("plainMenusForAll") !== true;
}
export function setGlobalCustomUI(enabled) {
    try { world.setDynamicProperty(DP_GLOBAL_CUSTOM_UI, Boolean(enabled)); }
    catch (e) { console.warn(`[EB] setGlobalCustomUI failed: ${e}`); }
}

const DP_CURSOR = "eb:cursor";
export function getCursor(player) {
    try {
        const val = player.getDynamicProperty(DP_CURSOR);
        if (typeof val === "boolean") return val;
    } catch {}
    return true;
}
export function setCursor(player, enabled) {
    try { player.setDynamicProperty(DP_CURSOR, Boolean(enabled)); } catch {}
}
const DP_CURSOR_TIP_SEEN = "eb:cursorTipSeen";
export function getCursorTipSeen(player) {
    try { return player.getDynamicProperty(DP_CURSOR_TIP_SEEN) === true; } catch { return false; }
}
export function setCursorTipSeen(player, seen) {
    try { player.setDynamicProperty(DP_CURSOR_TIP_SEEN, Boolean(seen)); } catch {}
}

function playerChoice(player, key, options) {
    try {
        const val = player.getDynamicProperty(key);
        if (typeof val === "string" && options.includes(val)) return val;
    } catch {}
    return null;
}

const DP_PANEL_SIZE = "eb:panelSize";
const PANEL_SCALES  = { small: 0.8, normal: 1, large: 1.25 };
export const PANEL_SIZES       = ["small", "normal", "large"];
export const PANEL_SIZE_LABELS = ["Small", "Normal", "Large"];
export function getPanelSize(player) {
    return playerChoice(player, DP_PANEL_SIZE, PANEL_SIZES) ?? "normal";
}
export function setPanelSize(player, size) {
    try { player.setDynamicProperty(DP_PANEL_SIZE, size); } catch {}
}
export function getPanelScale(player) {
    return PANEL_SCALES[getPanelSize(player)];
}

const DP_COACH_SIDE = "eb:coachSide";
export const COACH_SIDES       = ["right", "left"];
export const COACH_SIDE_LABELS = ["Right", "Left"];
export function getCoachSide(player) {
    return playerChoice(player, DP_COACH_SIDE, COACH_SIDES) ?? "right";
}
export function setCoachSide(player, side) {
    try { player.setDynamicProperty(DP_COACH_SIDE, side); } catch {}
}

const DP_PANEL_SOUNDS = "eb:panelSounds";
const PANEL_VOLUMES   = { off: 0, quiet: 0.35, normal: 1 };
export const PANEL_SOUND_OPTIONS = ["normal", "quiet", "off"];
export const PANEL_SOUND_LABELS  = ["Normal", "Quiet", "Off"];
export function getPanelSounds(player) {
    return playerChoice(player, DP_PANEL_SOUNDS, PANEL_SOUND_OPTIONS) ?? "normal";
}
export function setPanelSounds(player, option) {
    try { player.setDynamicProperty(DP_PANEL_SOUNDS, option); } catch {}
}
export function getPanelVolume(player) {
    return PANEL_VOLUMES[getPanelSounds(player)];
}
