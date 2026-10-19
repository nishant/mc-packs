// @ts-nocheck
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import {
    getMaxBlocks, setMaxBlocks, HARD_MAX_BLOCKS, getAdminMaxBlocksCap, setAdminMaxBlocksCap,
    getDefaultMaxBlocks, setDefaultMaxBlocks,
    getPreviewMode, setPreviewMode, PREVIEW_MODES, PREVIEW_LABELS,
    getDestroyPreviewMode, setDestroyPreviewMode, DESTROY_PREVIEW_MODES, DESTROY_PREVIEW_LABELS,
    getPreviewQuality, setPreviewQuality, PREVIEW_QUALITY_OPTIONS,
    getFlickPreview, setFlickPreview,
    getDeferShapeCalc, setDeferShapeCalc,
    getAirBuildReach, setAirBuildReach, MAX_AIR_BUILD_REACH,
    getTagRequired, setTagRequired, getRequiredTag, setRequiredTag,
    getBuildSpeed, setBuildSpeed, BUILD_SPEED_OPTIONS, BUILD_SPEED_LABELS, waveToQueueSpeed,
    getUndoThreshold, setUndoThreshold, UNDO_THRESHOLD_OPTIONS, UNDO_THRESHOLD_LABELS,
    getInfiniteReach, setInfiniteReach,
    getInfiniteReachDistance, setInfiniteReachDistance,
    getReplaceBlocks, setReplaceBlocks,
    getAllowDestroy, setAllowDestroy,
    getDestroyCreativeOnly, setDestroyCreativeOnly,
    getAllowInfiniteReach, setAllowInfiniteReach,
    getMaxReachCap, setMaxReachCap,
    getAutoGiveBook, setAutoGiveBook,
    getDestroyDrops, setDestroyDrops,
    getConfigTagRequired, setConfigTagRequired,
    getFovZoomStart, setFovZoomStart,
    getFovZoomMax, setFovZoomMax,
    getFovZoomEnabled, setFovZoomEnabled,
    getSwapBookActions, setSwapBookActions,
    getHintsEnabled, setHintsEnabled,
    getSimpleModesPref, setSimpleModes, isModeComplexityLocked,
    getAdminModeComplexity, setAdminModeComplexity,
    MODE_COMPLEXITY_OPTIONS, MODE_COMPLEXITY_LABELS,
    getGlobalCustomUI, setGlobalCustomUI,
    getCursor, setCursor, setCursorTipSeen,
    getPanelSize, setPanelSize, PANEL_SIZES, PANEL_SIZE_LABELS,
    getCoachSide, setCoachSide, COACH_SIDES, COACH_SIDE_LABELS,
    getPanelSounds, setPanelSounds, PANEL_SOUND_OPTIONS, PANEL_SOUND_LABELS,
} from "../core/Settings.js";
import { PRESET_IDS, applyPreset, activePreset } from "../core/Presets.js";
import { setPlayerBuildSpeed } from "../core/PlacementQueue.js";
import { getState, setMode } from "../core/PlayerState.js";
import { SIMPLE_MODE_IDS } from "../modes/ModeRegistry.js";
import { t } from "../utils/Text.js";
import { MENU_STYLES, MENU_STYLE_LABELS, getMenuStyle, setMenuStyle, showForm } from "../utils/CustomUI.js";
import { showHintOnce } from "../utils/Hints.js";
import { isOp } from "../utils/Permissions.js";
import { getBookLanguage } from "../core/Settings.js";
import { GUIDE_LANGUAGES } from "../core/GuideBookData.js";
import { changeBookLanguage } from "../core/GuideBook.js";
import { usesFloatingUI } from "../utils/CustomUI.js";
import { openPanel } from "../core/EntityPanel.js";
import { lockActionBar } from "../utils/ActionBar.js";

const QUALITY_KEYS = { 1: "smooth", 2: "sharp", 3: "crisp", 4: "balanced", 5: "responsive", 10: "lite", 20: "minimal" };

const CATEGORIES = [
    { id: "setup",    icon: "textures/ui/icon_new" },
    { id: "building", icon: "textures/ui/icon_recipe_construction" },
    { id: "preview",  icon: "textures/ui/video_glyph_color_2x" },
    { id: "controls", icon: "textures/ui/keyboard_and_mouse_glyph_color" },
    { id: "admin",    icon: "textures/ui/op", adminOnly: true },
];

function canChangeQuality(player) {
    if (!getConfigTagRequired()) return true;
    try { return player.hasTag(getRequiredTag()); } catch { return false; }
}

function stopZoom(player) {
    try {
        if (player.hasTag("eb:zooming")) {
            player.runCommand("camera @s clear");
            player.removeTag("eb:zooming");
        }
    } catch {}
}

const toggle = (id, tip, get, set, extra = {}) => ({ id, kind: "toggle", tip, get, set, ...extra });
const cycle  = (id, tip, values, labels, get, set, extra = {}) => ({ id, kind: "cycle", tip, values, labels, get, set, ...extra });
const slider = (id, tip, min, max, get, set, extra = {}) => ({ id, kind: "slider", tip, min, max, get, set, ...extra });
const entry  = (id, tip, get, set, extra = {}) => ({ id, kind: "entry", tip, get, set, ...extra });
const action = (id, tip, get, run) => ({ id, kind: "action", tip, get, run });

export const SETTINGS = {
    building: [
        toggle("simple_modes", "eb.settings.player.simple_modes", getSimpleModesPref,
            (p, v) => {
                setSimpleModes(p, v);
                if (v && !SIMPLE_MODE_IDS.has(getState(p).mode)) setMode(p, "disable");
            },
            { visible: () => !isModeComplexityLocked() }),
        cycle("build_speed", "eb.settings.player.build_speed", BUILD_SPEED_OPTIONS, BUILD_SPEED_LABELS, getBuildSpeed,
            (p, v) => {
                setBuildSpeed(p, v);
                setPlayerBuildSpeed(p.id, waveToQueueSpeed(v));
            }),
        entry("max_blocks", () => t("eb.settings.player.max_blocks", getAdminMaxBlocksCap().toLocaleString()), getMaxBlocks,
            (p, v) => setMaxBlocks(p, v), { number: true, min: 1 }),
        toggle("replace_blocks", "eb.settings.player.replace_blocks", getReplaceBlocks, setReplaceBlocks),
        toggle("infinite_reach", "eb.settings.player.infinite_reach", getInfiniteReach, setInfiniteReach,
            { visible: () => getAllowInfiniteReach() }),
        slider("inf_reach_dist", "eb.settings.player.inf_reach_dist", 4, 256, getInfiniteReachDistance, setInfiniteReachDistance,
            { visible: () => getAllowInfiniteReach() }),
        slider("air_reach", "eb.settings.player.air_reach", 1, MAX_AIR_BUILD_REACH, getAirBuildReach, setAirBuildReach),
        toggle("destroy_drops", "eb.settings.player.destroy_drops", getDestroyDrops, setDestroyDrops),
        cycle("undo_limit", "eb.settings.player.undo_limit", UNDO_THRESHOLD_OPTIONS, UNDO_THRESHOLD_LABELS, getUndoThreshold, setUndoThreshold),
    ],
    preview: [
        cycle("preview_style", "eb.settings.player.preview_style", PREVIEW_MODES, PREVIEW_LABELS, getPreviewMode, setPreviewMode),
        cycle("destroy_preview_style", "eb.settings.player.destroy_preview_style", DESTROY_PREVIEW_MODES, DESTROY_PREVIEW_LABELS,
            getDestroyPreviewMode, setDestroyPreviewMode),
        cycle("preview_quality", p => t(`eb.config.quality.${QUALITY_KEYS[getPreviewQuality(p)]}.desc`),
            PREVIEW_QUALITY_OPTIONS, PREVIEW_QUALITY_OPTIONS.map(v => t(`eb.config.quality.${QUALITY_KEYS[v]}.label`)),
            getPreviewQuality, setPreviewQuality,
            { locked: p => !canChangeQuality(p), lockedMessage: () => t("eb.config.restricted", getRequiredTag()) }),
        toggle("defer_shape", "eb.settings.player.defer_shape", getDeferShapeCalc, setDeferShapeCalc),
        toggle("flick_preview", "eb.settings.player.flick_preview", getFlickPreview, setFlickPreview),
    ],
    controls: [
        toggle("swap_book_actions", "eb.settings.player.swap_book_actions", getSwapBookActions, setSwapBookActions),
        toggle("selection_zoom", "eb.settings.player.selection_zoom", getFovZoomEnabled,
            (p, v) => {
                setFovZoomEnabled(p, v);
                if (!v) stopZoom(p);
            }),
        slider("zoom_start", "eb.settings.player.zoom_start", 1, 50, getFovZoomStart,
            (p, v) => {
                setFovZoomStart(p, v);
                if (getFovZoomMax(p) <= v) setFovZoomMax(p, v + 1);
            }),
        slider("zoom_max", "eb.settings.player.zoom_max", 2, 200, getFovZoomMax,
            (p, v) => setFovZoomMax(p, Math.max(v, getFovZoomStart(p) + 1))),
        action("book_language", "eb.set.book_language.tip",
            p => GUIDE_LANGUAGES.find(language => language.id === getBookLanguage(p))?.name ?? "English",
            changeBookLanguage),
        toggle("hints", "eb.settings.player.hints_enabled", getHintsEnabled, setHintsEnabled),
        cycle("menu_style", "eb.set.menu_style.tip", MENU_STYLES, MENU_STYLE_LABELS, getMenuStyle, setMenuStyle,
            { visible: () => getGlobalCustomUI() }),
        toggle("cursor", "eb.set.cursor.tip", getCursor,
            (p, v) => {
                setCursor(p, v);
                setCursorTipSeen(p, true);
            }),
        cycle("panel_size", "eb.set.panel_size.tip", PANEL_SIZES, PANEL_SIZE_LABELS, getPanelSize, setPanelSize,
            { visible: p => usesFloatingUI(p) }),
        cycle("coach_side", "eb.set.coach_side.tip", COACH_SIDES, COACH_SIDE_LABELS, getCoachSide, setCoachSide,
            { visible: p => usesFloatingUI(p) }),
        cycle("panel_sounds", "eb.set.panel_sounds.tip", PANEL_SOUND_OPTIONS, PANEL_SOUND_LABELS, getPanelSounds, setPanelSounds,
            { visible: p => usesFloatingUI(p) }),
    ],
    admin: [
        cycle("admin_mode_list", "eb.settings.admin_mode_complexity", MODE_COMPLEXITY_OPTIONS, MODE_COMPLEXITY_LABELS,
            () => getAdminModeComplexity(), (p, v) => setAdminModeComplexity(v)),
        toggle("admin_require_tag", "eb.settings.admin_require_tag", () => getTagRequired(), (p, v) => setTagRequired(v)),
        entry("admin_tag", () => t("eb.settings.admin_tag", getRequiredTag()), () => getRequiredTag(), (p, v) => setRequiredTag(v)),
        toggle("admin_allow_destroy", "eb.settings.admin_allow_destroy", () => getAllowDestroy(), (p, v) => setAllowDestroy(v)),
        toggle("admin_destroy_creative", "eb.settings.admin_destroy_creative", () => getDestroyCreativeOnly(), (p, v) => setDestroyCreativeOnly(v)),
        toggle("admin_allow_inf_reach", "eb.settings.admin_allow_inf_reach", () => getAllowInfiniteReach(), (p, v) => setAllowInfiniteReach(v)),
        entry("admin_reach_cap", () => t("eb.settings.admin_max_reach_cap", getMaxReachCap()), () => getMaxReachCap(),
            (p, v) => setMaxReachCap(v), { number: true, min: 0 }),
        entry("admin_blocks_cap", () => t("eb.settings.admin_max_blocks_cap", getAdminMaxBlocksCap().toLocaleString(), HARD_MAX_BLOCKS.toLocaleString()),
            () => getAdminMaxBlocksCap(), (p, v) => setAdminMaxBlocksCap(v), { number: true, min: 1 }),
        entry("admin_default_blocks", () => t("eb.settings.admin_default_max_blocks", getDefaultMaxBlocks().toLocaleString(), getAdminMaxBlocksCap().toLocaleString()),
            () => getDefaultMaxBlocks(), (p, v) => setDefaultMaxBlocks(v), { number: true, min: 1 }),
        toggle("admin_auto_give_book", "eb.settings.admin_auto_give_book", () => getAutoGiveBook(), (p, v) => setAutoGiveBook(v)),
        toggle("admin_lock_quality", "eb.settings.admin_config_tag", () => getConfigTagRequired(), (p, v) => setConfigTagRequired(v)),
        toggle("admin_vanilla_menus", "eb.settings.admin_custom_ui_toggle", () => !getGlobalCustomUI(), (p, v) => setGlobalCustomUI(!v)),
    ],
};

function visibleCategories(player) {
    return CATEGORIES.filter(cat => !cat.adminOnly || isOp(player));
}

function visibleSettings(player, catId) {
    return (SETTINGS[catId] ?? []).filter(s => !s.visible || s.visible(player));
}

export function tipOf(player, setting) {
    return typeof setting.tip === "function" ? setting.tip(player) : t(setting.tip);
}

function valueText(player, setting) {
    const value = setting.get(player);
    if (setting.kind === "toggle") return t(value ? "eb.common.on" : "eb.common.off");
    if (setting.kind === "cycle") {
        const label = setting.labels[Math.max(0, setting.values.indexOf(value))];
        return typeof label === "string" ? { text: `§e${label}` } : { rawtext: [{ text: "§e" }, label] };
    }
    return { text: `§e${typeof value === "number" ? value.toLocaleString() : value}` };
}

function settingLabel(player, setting) {
    return {
        rawtext: [
            t(`eb.set.${setting.id}`),
            { text: "§r: " },
            valueText(player, setting),
            { text: "§r" },
        ],
    };
}

async function askValue(player, setting) {
    const current = setting.get(player);
    const form    = new ModalFormData().title(t(`eb.set.${setting.id}`));

    if (setting.kind === "slider") {
        const value = Math.max(setting.min, Math.min(setting.max, current));
        form.slider(tipOf(player, setting), setting.min, setting.max, { defaultValue: value, valueStep: 1 });
    } else {
        form.textField(tipOf(player, setting), String(current), { defaultValue: String(current) });
    }

    const res = await showForm(form, player);
    if (res.canceled || !res.formValues) return;

    const raw = res.formValues[0];
    if (setting.kind === "slider") {
        setting.set(player, Math.floor(Number(raw)));
        return;
    }
    if (setting.number) {
        const parsed = parseInt(String(raw ?? "").trim(), 10);
        if (isNaN(parsed) || parsed < setting.min) return;
        setting.set(player, parsed);
        return;
    }
    const trimmed = String(raw ?? "").trim();
    if (trimmed.length > 0) setting.set(player, trimmed);
}

export async function changeSetting(player, setting, step = 1) {
    if (setting.locked?.(player)) {
        player.sendMessage(setting.lockedMessage(player));
        return;
    }
    if (setting.kind === "toggle") {
        setting.set(player, !setting.get(player));
    } else if (setting.kind === "cycle") {
        const count = setting.values.length;
        const index = Math.max(0, setting.values.indexOf(setting.get(player)));
        setting.set(player, setting.values[(index + step + count) % count]);
    } else {
        await askValue(player, setting);
    }
}

async function showSettingsPanel(player, catId, lastSetting = null) {
    const categories = visibleCategories(player);
    if (!categories.some(cat => cat.id === catId)) catId = categories[0].id;
    if (usesFloatingUI(player) && openPanel(player, `settings_${catId}`)) return;

    const settings = visibleSettings(player, catId);
    const preset   = catId === "setup" ? activePreset(player) : null;

    const form = new ActionFormData()
        .title(t("eb.settings.title"))
        .body(lastSetting ? tipOf(player, lastSetting) : t(`eb.set.cat.${catId}.desc`));

    for (const cat of categories) {
        form.button(
            { rawtext: [{ text: cat.id === catId ? "§l§e" : "§f" }, t(`eb.set.cat.${cat.id}`), { text: "§r" }] },
            cat.icon
        );
    }

    if (catId === "setup") {
        for (const id of PRESET_IDS) {
            form.button({ rawtext: [{ text: id === preset ? "§l§e" : "" }, t(`eb.onboarding.tier.${id}`), { text: "§r" }] });
        }
    } else {
        for (const setting of settings) form.button(settingLabel(player, setting));
    }
    form.button(t("eb.config.done"));

    const res = await showForm(form, player);
    if (res.canceled || res.selection === undefined) return;

    let sel = res.selection;
    if (sel < categories.length) {
        await showSettingsPanel(player, categories[sel].id);
        return;
    }
    sel -= categories.length;

    if (catId === "setup") {
        const id = PRESET_IDS[sel];
        if (!id) return;
        applyPreset(player, id);
        lockActionBar(player.id, 1500);
        player.onScreenDisplay.setActionBar(t("eb.onboarding.tier_applied", t(`eb.onboarding.tier.${id}`)));
        await showSettingsPanel(player, catId);
        return;
    }

    const setting = settings[sel];
    if (!setting) return;
    if (setting.kind === "action") {
        setting.run(player);
        return;
    }
    await changeSetting(player, setting);
    await showSettingsPanel(player, catId, setting);
}

export async function showSettingsUI(player, catId = "building") {
    showHintOnce(player, "panel.settings", "eb.hint.panel.settings");
    await showSettingsPanel(player, catId);
}
