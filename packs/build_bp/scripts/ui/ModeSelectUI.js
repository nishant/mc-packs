// @ts-nocheck
import { ActionFormData }                          from "@minecraft/server-ui";
import { MODE_LIST, MODE_OPTIONS, SIMPLE_MODE_IDS } from "../modes/ModeRegistry.js";
import { getSimpleModes, setSimpleModes, isModeComplexityLocked } from "../core/Settings.js";
import { getState, setMode }                       from "../core/PlayerState.js";
import { getModeOption, setModeOption }            from "../utils/ModeOptions.js";
import { getPinnedModes, isPinned }                from "../utils/PlayerPins.js";
import { t }                                       from "../utils/Text.js";
import { showClipboardUI }                         from "./ClipboardUI.js";
import { showSettingsUI }                          from "./SettingsUI.js";
import { showPaletteUI }                           from "./PaletteUI.js";
import { showHelpUI }                              from "./HelpUI.js";
import { performUndo, performRedo }                from "../core/UndoRedo.js";
import { showModifiersUI } from "./ModifiersUI.js";
import { smallIcon, usesFloatingUI, showForm } from "../utils/CustomUI.js";
import { showHintOnce } from "../utils/Hints.js";
import { openPanel } from "../core/EntityPanel.js";
import { WHEEL_SLOTS, getWheelLayout, setWheelLayout } from "../utils/QuickWheel.js";

const ICON_TOOLS = "textures/effortless_building/menu";

export const TOOLS = [
    { id: "palette",   label: "eb.mode_select.btn.palette",   icon: "textures/ui/creative_icon",               run: showPaletteUI   },
    { id: "modifiers", label: "eb.mode_select.btn.modifiers", icon: "textures/ui/dressing_room_customization", run: showModifiersUI },
    { id: "clipboard", label: "eb.mode_select.btn.clipboard", icon: "textures/ui/copy",                        run: showClipboardUI },
    { id: "undo",      label: "eb.mode_select.btn.undo",      icon: "textures/ui/arrow_dark_left_stretch",     run: performUndo     },
    { id: "redo",      label: "eb.mode_select.btn.redo",      icon: "textures/ui/arrow_dark_right_stretch",    run: performRedo     },
    { id: "settings",  label: "eb.mode_select.btn.settings",  icon: "textures/ui/gear",                        run: showSettingsUI  },
    { id: "help",      label: "eb.mode_select.btn.help",      icon: "textures/ui/infobulb",                    run: showHelpUI      },
];

function cap(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function plain(label) {
    return label.replace(/§./g, "");
}

function showModeUseHint(player, modeId) {
    if (modeId === "disable") return;
    showHintOnce(player, `mode_use.${modeId}`, `eb.hint.mode.${modeId}`);
}

function visibleModes(player) {
    return getSimpleModes(player)
        ? MODE_LIST.filter(m => SIMPLE_MODE_IDS.has(m.id))
        : MODE_LIST;
}

function sortedModeList(player) {
    const available = visibleModes(player);
    const pins = getPinnedModes(player);
    const disable = available.find(m => m.id === "disable");
    const rest = available.filter(m => m.id !== "disable");
    return [
        ...(disable ? [disable] : []),
        ...pins.map(id => rest.find(m => m.id === id)).filter(Boolean),
        ...rest.filter(m => !pins.includes(m.id))
    ];
}

export function toggleSimpleModes(player) {
    const nowSimple = !getSimpleModes(player);
    setSimpleModes(player, nowSimple);
    if (nowSimple && !SIMPLE_MODE_IDS.has(getState(player).mode)) {
        setMode(player, "disable");
    }
    player.sendMessage(t(nowSimple ? "eb.mode_select.simple_on" : "eb.mode_select.simple_off"));
}

export function chooseMode(player, entry) {
    setMode(player, entry.id);
    player.sendMessage(t("eb.mode_select.mode_set", plain(entry.label)));
    showModeUseHint(player, entry.id);
}

async function showVanillaOptionsMenu(player, modeId, modeLabel) {
    const opts = MODE_OPTIONS[modeId] || [];

    if (!opts.length && modeId !== "copy_paste") return;

    while (true) {
        const summary = opts
            .map(o => `${o.label}: §e${cap(getModeOption(player, modeId, o.key))}§r`)
            .join("  §8|§r  ");

        const form = new ActionFormData()
            .title(t("eb.mode_select.options_title", modeLabel))
            .body(summary);

        const btns = [];
        for (const opt of opts) {
            const cur = getModeOption(player, modeId, opt.key);
            for (const choice of opt.choices) {
                const active = cur === choice;
                form.button(`${active ? "§l§a> §r" : ""}${opt.label}: ${cap(choice)}`);
                btns.push({ key: opt.key, value: choice });
            }
        }
        if (modeId === "copy_paste") {
            form.button(t("eb.mode_select.btn.clipboard"), "textures/ui/copy");
            btns.push({ type: "clipboard" });
        }
        form.button(t("eb.mode_select.btn.done"));
        btns.push(null);

        const res = await showForm(form, player);
        if (res.canceled || res.selection === undefined) return;
        const btn = btns[res.selection];
        if (!btn) return;
        if (btn.type === "clipboard") { await showClipboardUI(player); return; }
        setModeOption(player, modeId, btn.key, btn.value);
    }
}

async function showVanillaTools(player) {
    const form = new ActionFormData()
        .title(t("eb.ui.title.mode_select"))
        .body(t("eb.mode_select.quick_access"));

    for (const tool of TOOLS) form.button(t(tool.label), tool.icon);

    const res = await showForm(form, player);
    if (res.canceled || res.selection === undefined) return;
    await TOOLS[res.selection]?.run(player);
}

async function showVanillaModeMenu(player) {
    const state     = getState(player);
    const modes     = sortedModeList(player);
    const canToggle = !isModeComplexityLocked();
    const simple    = getSimpleModes(player);

    const form = new ActionFormData()
        .title(t("eb.ui.title.mode_select"))
        .body(t("eb.mode_select.body"));

    form.button(t("eb.mode_select.btn.tools"), smallIcon(ICON_TOOLS));

    for (const entry of modes) {
        const isActive = entry.id === state.mode;
        const pin  = entry.id !== "disable" && isPinned(player, entry.id) ? "* " : "";
        const name = plain(entry.label);
        form.button(isActive ? `§l§e${pin}${name}§r` : `${pin}${name}`, smallIcon(entry.icon));
    }
    if (canToggle) {
        form.button(t(simple ? "eb.mode_select.btn.more_modes" : "eb.mode_select.btn.fewer_modes"));
    }

    const res = await showForm(form, player);
    if (res.canceled || res.selection === undefined) return;

    if (res.selection === 0) {
        await showVanillaTools(player);
        return;
    }
    const sel = res.selection - 1;

    if (canToggle && sel === modes.length) {
        toggleSimpleModes(player);
        await showVanillaModeMenu(player);
        return;
    }

    const chosen = modes[sel];
    if (!chosen) return;
    chooseMode(player, chosen);

    if (MODE_OPTIONS[chosen.id]?.length || chosen.id === "copy_paste") {
        await showVanillaOptionsMenu(player, chosen.id, chosen.label);
    }
}

export function wheelLayout(player) {
    const own = getWheelLayout(player);
    if (own) return own;
    const auto = sortedModeList(player).filter(entry => entry.id !== "disable").map(entry => entry.id);
    return Array.from({ length: WHEEL_SLOTS }, (_, slot) => auto[slot] ?? "");
}

export function quickModes(player) {
    const allowed = new Set(visibleModes(player).map(entry => entry.id));
    return wheelLayout(player).map(id => id !== "disable" && allowed.has(id) ? id : "");
}

export function hasOwnWheel(player) {
    return Boolean(getWheelLayout(player));
}

export function setWheelSlot(player, slot, id) {
    const layout = wheelLayout(player);
    const from   = id ? layout.indexOf(id) : -1;
    if (from >= 0 && from !== slot) layout[from] = layout[slot];
    layout[slot] = id;
    setWheelLayout(player, layout);
}

export function resetWheel(player) {
    setWheelLayout(player, null);
}

export async function showModeMenu(player) {
    const floating = usesFloatingUI(player);
    showHintOnce(player, floating ? "panel.mode_menu_floating" : "panel.mode_menu",
        floating ? "eb.hint.panel.mode_menu_floating" : "eb.hint.panel.mode_menu");
    if (floating && openPanel(player, "menu")) return;
    await showVanillaModeMenu(player);
}
