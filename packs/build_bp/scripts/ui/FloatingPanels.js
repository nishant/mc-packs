// @ts-nocheck
import { registerPanel, openPanel, closePanel, openPanelName } from "../core/EntityPanel.js";
import {
    PANEL_MODES, PANEL_STARTER_MODES, PANEL_MODE_SLOTS, PANEL_PALETTE, PANEL_SETTING_CATEGORIES, PANEL_SETTINGS, PANEL_RING,
    PANEL_MODIFIER_CONFIG,
} from "../core/EntityPanelData.js";
import { MODE_LIST } from "../modes/ModeRegistry.js";
import { getSimpleModes, isModeComplexityLocked, setOnboarded } from "../core/Settings.js";
import { getState, getMirrorState, getArrayState, getRadialState, setMirrorState, setArrayState, setRadialState } from "../core/PlayerState.js";
import { getPaletteMode, getDistributionMode, getWeightMode, getSmartPattern, setSmartPattern } from "../core/Palette.js";
import { PRESET_IDS, applyPreset, activePreset } from "../core/Presets.js";
import { system } from "@minecraft/server";
import { startCoach, isCoaching, setCoachMenuOpener, setCoachLessonsOpener, coachProgress } from "../core/Coach.js";
import { changeBookLanguage } from "../core/GuideBook.js";
import { getAllMeta, loadSlotMeta } from "../utils/ClipboardStore.js";
import { getModeOption, setModeOption } from "../utils/ModeOptions.js";
import { isPinned, pinMode, unpinMode } from "../utils/PlayerPins.js";
import { isOp } from "../utils/Permissions.js";
import { usesFloatingUI } from "../utils/CustomUI.js";
import { t } from "../utils/Text.js";
import { WHEEL_SLOTS } from "../utils/QuickWheel.js";
import { coachEvent } from "../utils/CoachEvents.js";
import { TOOLS, chooseMode, toggleSimpleModes, showModeMenu, quickModes, hasOwnWheel, setWheelSlot, resetWheel } from "./ModeSelectUI.js";
import { choosePaletteOption } from "./PaletteUI.js";
import { centerMirrorHere, centerRadialHere, showMirrorConfigUI, showArrayConfigUI, showRadialConfigUI } from "./ModifiersUI.js";
import {
    showClipboardUI, slotTip, loadClipboardSlot, saveClipboardCopy, renameClipboardSlot, deleteClipboardSlot,
    finishCopyCut, cancelCopyCut,
} from "./ClipboardUI.js";
import { SETTINGS, tipOf, changeSetting, showSettingsUI } from "./SettingsUI.js";
import { offerTutorialBook } from "./HelpUI.js";
import { showOnboarding, finishOnboarding } from "./OnboardingUI.js";

setCoachMenuOpener(player => showModeMenu(player));
setCoachLessonsOpener(player => {
    if (!usesFloatingUI(player) || !openPanel(player, "lessons")) startCoach(player);
});

function split(id) {
    const at = id.indexOf(":");
    return at < 0 ? [id, ""] : [id.slice(0, at), id.slice(at + 1)];
}

function modeOf(player) {
    const mode = getState(player).mode || "disable";
    return PANEL_MODES.includes(mode) ? mode : "disable";
}

function slotActive(player, mode, slot) {
    if (slot.type === "pin") return isPinned(player, mode);
    if (slot.type === "option") return getModeOption(player, mode, slot.key) === slot.value;
    return false;
}

function bits(flags) {
    return flags.reduce((sum, flag, i) => sum + (flag ? 2 ** i : 0), 0);
}

function wheelSlots(quick) {
    const out = {};
    for (let slot = 0; slot < WHEEL_SLOTS; slot++) out[`s${slot}`] = Math.max(0, PANEL_MODES.indexOf(quick[slot]));
    return out;
}

function stepOf(player, row, at, burst = 1) {
    if (at.x < row.back[0]) return 0;
    return (player.isSneaking ? 10 : 1) * burst * (at.x < row.back[1] ? -1 : 1);
}

function flipped(isOn) {
    return isOn ? "on" : "off";
}

function leave(player, kind) {
    if (kind === "close") { closePanel(player.id); return true; }
    if (kind === "back") {
        showModeMenu(player);
        if (openPanelName(player.id) !== "menu") closePanel(player.id);
        return true;
    }
    return false;
}

registerPanel("menu", {
    values(player) {
        const mode = modeOf(player);
        return {
            mode:   PANEL_MODES.indexOf(mode),
            opts:   bits(PANEL_MODE_SLOTS[mode].map(slot => slotActive(player, mode, slot))),
            pins:   bits(PANEL_MODES.map(id => id !== "disable" && isPinned(player, id))),
            simple: Boolean(getSimpleModes(player)),
            locked: Boolean(isModeComplexityLocked()),
        };
    },
    visible(player, id, values) {
        const [kind, arg] = split(id);
        if (kind === "mode")  return !values.simple || PANEL_MODES.indexOf(arg) < PANEL_STARTER_MODES;
        if (kind === "more")  return values.simple && !values.locked;
        if (kind === "fewer") return !values.simple && !values.locked;
        if (kind === "slot")  return Number(arg) < PANEL_MODE_SLOTS[PANEL_MODES[values.mode]].length;
        return true;
    },
    click(player, id) {
        const [kind, arg] = split(id);
        if (kind === "close") {
            closePanel(player.id);
        } else if (kind === "mode") {
            const entry = MODE_LIST.find(mode => mode.id === arg);
            if (entry && modeOf(player) !== arg) chooseMode(player, entry);
        } else if (kind === "more" || kind === "fewer") {
            toggleSimpleModes(player);
        } else if (kind === "slot") {
            const mode = modeOf(player);
            const slot = PANEL_MODE_SLOTS[mode][Number(arg)];
            if (!slot) return;
            if (slot.type === "pin") {
                if (isPinned(player, mode)) unpinMode(player, mode);
                else                        pinMode(player, mode);
                return flipped(isPinned(player, mode));
            } else if (slot.type === "option") {
                setModeOption(player, mode, slot.key, slot.value);
                return "on";
            } else {
                showClipboardUI(player);
            }
        } else if (kind === "wheel") {
            openPanel(player, "wheel");
        } else if (kind === "tool") {
            const tool = TOOLS.find(entry => entry.id === arg);
            if (!tool) return;
            tool.run(player);
            if (arg !== "undo" && arg !== "redo" && openPanelName(player.id) === "menu") closePanel(player.id);
        }
    },
});

registerPanel("ring", {
    values(player, local) {
        const quick       = quickModes(player);
        const [kind, arg] = split(local.look ?? "");
        const look        = kind === "off" ? 1 : kind === "slot" ? PANEL_MODES.indexOf(quick[Number(arg)]) + 1 : 0;
        return { mode: PANEL_MODES.indexOf(modeOf(player)), look, ...wheelSlots(quick) };
    },
    look(player, id, local) {
        local.look = id ?? undefined;
    },
    visible(player, id, values) {
        const [kind, arg] = split(id);
        return kind !== "slot" || values[`s${arg}`] > 0;
    },
    target(point, values) {
        const dx = point.x - PANEL_RING.cx;
        const dy = point.y - PANEL_RING.cy;
        if (Math.hypot(dx, dy) < PANEL_RING.dead) return null;
        const turn  = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;
        const place = Math.round(turn / (360 / PANEL_RING.places)) % PANEL_RING.places;
        if (place === 0) return "off";
        return values[`s${place - 1}`] > 0 ? `slot:${place - 1}` : null;
    },
    click(player, id) {
        const [kind, arg] = split(id);
        const wanted = kind === "off" ? "disable" : quickModes(player)[Number(arg)];
        const entry  = MODE_LIST.find(mode => mode.id === wanted);
        if (entry && modeOf(player) !== wanted) chooseMode(player, entry);
        if (entry) coachEvent(player, "wheel");
        closePanel(player.id);
    },
});

registerPanel("wheel", {
    values(player, local) {
        const quick = quickModes(player);
        const sel   = local.sel ?? 0;
        return {
            sel,
            cur:    Math.max(0, PANEL_MODES.indexOf(quick[sel])),
            used:   bits(PANEL_MODES.map(id => id !== "disable" && quick.includes(id))),
            auto:   !hasOwnWheel(player),
            simple: Boolean(getSimpleModes(player)),
            ...wheelSlots(quick),
        };
    },
    visible(player, id, values) {
        const [kind, arg] = split(id);
        if (kind === "pick" && arg !== "none") return !values.simple || PANEL_MODES.indexOf(arg) < PANEL_STARTER_MODES;
        if (kind === "reset") return !values.auto;
        return true;
    },
    click(player, id, local) {
        const [kind, arg] = split(id);
        if (leave(player, kind)) return;
        if (kind === "off") return "deny";
        if (kind === "slot") {
            local.sel = Number(arg);
        } else if (kind === "reset") {
            resetWheel(player);
            return "off";
        } else if (kind === "pick") {
            const slot = local.sel ?? 0;
            setWheelSlot(player, slot, arg === "none" ? "" : arg);
            local.sel = (slot + 1) % WHEEL_SLOTS;
            return "on";
        }
    },
});

registerPanel("palette", {
    values(player, local) {
        return {
            tab:     local.tab ?? 0,
            source:  Math.max(0, PANEL_PALETTE.sources.indexOf(getPaletteMode(player))),
            pattern: Math.max(0, PANEL_PALETTE.patterns.indexOf(getDistributionMode(player))),
            weight:  Math.max(0, PANEL_PALETTE.weights.indexOf(getWeightMode(player))),
            tile:    Boolean(getSmartPattern(player)),
        };
    },
    visible(player, id, values) {
        const [kind] = split(id);
        if (kind === "source")  return values.tab === 0;
        if (kind === "pattern") return values.tab === 1;
        if (kind === "weight")  return values.tab === 2;
        return true;
    },
    click(player, id, local) {
        const [kind, arg] = split(id);
        if (leave(player, kind)) return;
        if (kind === "tile") {
            setSmartPattern(player, !getSmartPattern(player));
            return flipped(getSmartPattern(player));
        }
        if (kind === "tab")          local.tab = Number(arg);
        else if (kind === "source")  choosePaletteOption(player, "source", arg);
        else if (kind === "pattern") choosePaletteOption(player, "dist", arg);
        else if (kind === "weight")  choosePaletteOption(player, "weight", arg);
    },
});

registerPanel("modifiers", {
    values(player) {
        const mirror = getMirrorState(player);
        const radial = getRadialState(player);
        return {
            mirror: bits([mirror.enabled, mirror.axisX, mirror.axisY, mirror.axisZ, mirror.odd]),
            array:  Boolean(getArrayState(player).enabled),
            radial: bits([radial.enabled, radial.alternate]),
        };
    },
    click(player, id) {
        const [kind, arg] = split(id);
        if (leave(player, kind)) return;

        if (arg === "config") {
            openPanel(player, `${kind}_config`);
            return;
        }
        if (arg === "center") {
            if (kind === "mirror") centerMirrorHere(player);
            else                   centerRadialHere(player);
            return;
        }
        const get = kind === "mirror" ? getMirrorState : kind === "array" ? getArrayState : getRadialState;
        const set = kind === "mirror" ? setMirrorState : kind === "array" ? setArrayState : setRadialState;
        set(player, { [arg]: !get(player)[arg] });
        return flipped(get(player)[arg]);
    },
});

function settingLocked(player, setting) {
    return Boolean((setting.visible && !setting.visible(player)) || setting.locked?.(player));
}

function settingsPanel(category) {
    const rows = PANEL_SETTINGS[category] ?? [];
    const find = id => SETTINGS[category]?.find(setting => setting.id === id);
    return {
        values(player) {
            const out = { admin: isOp(player) };
            if (category === "setup") {
                out.preset = PRESET_IDS.indexOf(activePreset(player)) + 1;
                return out;
            }
            out.flags = 0;
            out.locks = 0;
            rows.forEach((row, i) => {
                const setting = find(row.id);
                if (!setting) return;
                if (settingLocked(player, setting)) out.locks += 2 ** i;
                const value = setting.get(player);
                if (row.kind === "toggle") {
                    if (value) out.flags += 2 ** i;
                } else if (row.kind === "cycle") {
                    out[`c${i}`] = Math.max(0, setting.values.indexOf(value));
                } else if (row.kind === "number" || row.kind === "slide") {
                    out[`n${i}`] = Math.max(0, Math.min(row.max, Math.floor(Number(value) || 0)));
                }
            });
            return out;
        },
        visible(player, id, values) {
            return id !== "tab:admin" || values.admin;
        },
        hover(player, id) {
            return id === "row:admin_tag" ? tipOf(player, find("admin_tag")) : null;
        },
        repeats(id) {
            const [kind, arg] = split(id);
            return kind === "row" && find(arg)?.kind === "slider";
        },
        click(player, id, local, at, burst) {
            const [kind, arg] = split(id);
            if (leave(player, kind)) return;
            if (kind === "tab") {
                if (arg !== "admin" || isOp(player)) openPanel(player, `settings_${arg}`);
                return;
            }
            if (kind === "preset") {
                applyPreset(player, arg);
                player.onScreenDisplay.setActionBar(t("eb.onboarding.tier_applied", t(`eb.onboarding.tier.${arg}`)));
                return;
            }
            const setting = find(arg);
            if (!setting) return;
            if (setting.visible && !setting.visible(player)) return "deny";
            if (setting.kind === "action") {
                closePanel(player.id);
                setting.run(player);
            } else if (setting.locked?.(player)) {
                changeSetting(player, setting);
                return "deny";
            } else if (setting.kind === "toggle") {
                changeSetting(player, setting);
                return flipped(setting.get(player));
            } else if (setting.kind === "cycle") {
                const back = rows.find(row => row.id === arg)?.back;
                changeSetting(player, setting, back && at.x >= back[0] && at.x < back[1] ? -1 : 1);
            } else if (setting.kind === "slider") {
                const step = stepOf(player, rows.find(row => row.id === arg), at, burst);
                if (step !== 0) setting.set(player, Math.max(setting.min, Math.min(setting.max, setting.get(player) + step)));
            } else {
                closePanel(player.id);
                changeSetting(player, setting).then(() => showSettingsUI(player, category));
            }
        },
    };
}

for (const category of PANEL_SETTING_CATEGORIES) registerPanel(`settings_${category}`, settingsPanel(category));

const MODIFIER_CONFIG = {
    mirror: { get: getMirrorState, set: setMirrorState, type: showMirrorConfigUI, centre: centerMirrorHere },
    array:  { get: getArrayState,  set: setArrayState,  type: showArrayConfigUI },
    radial: { get: getRadialState, set: setRadialState, type: showRadialConfigUI, centre: centerRadialHere },
};

function modifierConfigPanel(kind) {
    const rows = PANEL_MODIFIER_CONFIG[kind];
    const { get, set, type, centre } = MODIFIER_CONFIG[kind];
    return {
        values(player) {
            const state = get(player);
            const out   = { neg: 0 };
            rows.forEach((row, i) => {
                const value = Math.trunc(Number(state[row.id]) || 0);
                out[`n${i}`] = Math.min(row.max, Math.abs(value));
                if (value < 0) out.neg += 2 ** i;
            });
            return out;
        },
        repeats(id) {
            return id.startsWith("row:");
        },
        click(player, id, local, at, burst) {
            const [what, arg] = split(id);
            if (what === "close") {
                closePanel(player.id);
            } else if (what === "back") {
                openPanel(player, "modifiers");
            } else if (what === "type") {
                closePanel(player.id);
                type(player);
            } else if (what === "center") {
                centre?.(player);
            } else if (what === "row") {
                const row  = rows.find(entry => entry.id === arg);
                const step = row ? stepOf(player, row, at, burst) : 0;
                if (step === 0) return;
                const value = Math.trunc(Number(get(player)[arg]) || 0) + step;
                set(player, { [arg]: Math.max(row.min, Math.min(row.max, value)) });
            }
        },
    };
}

for (const kind of Object.keys(PANEL_MODIFIER_CONFIG)) registerPanel(`${kind}_config`, modifierConfigPanel(kind));

registerPanel("clipboard", {
    values(player, local) {
        const all  = getAllMeta(player);
        const meta = all[local.look ?? local.sel ?? 0];
        const size = value => Math.max(0, Math.min(999, Math.floor(Number(value) || 0)));
        return {
            filled: bits(all.map(Boolean)),
            sel:    local.sel ?? 0,
            dx:     meta ? size(meta.x) : 0,
            dy:     meta ? size(meta.y) : 0,
            dz:     meta ? size(meta.z) : 0,
            dn:     meta ? Math.max(1, Math.min(999999, Math.floor(Number(meta.n) || 0))) : 0,
        };
    },
    look(player, id, local) {
        const [kind, arg] = split(id ?? "");
        local.look = kind === "slot" ? Number(arg) : undefined;
    },
    hover(player, id, values, local) {
        const [kind, arg] = split(id);
        if (kind === "slot") return slotTip(player, Number(arg));
        if (kind === "act")  return slotTip(player, local.sel ?? 0);
        return null;
    },
    click(player, id, local) {
        const [kind, arg] = split(id);
        if (leave(player, kind)) return;
        if (kind === "slot") {
            local.sel = Number(arg);
            return;
        }
        const slot = local.sel ?? 0;
        if (!loadSlotMeta(player, slot)) return "deny";
        if (arg === "load") {
            if (loadClipboardSlot(player, slot)) closePanel(player.id);
        } else if (arg === "save") {
            const saved = saveClipboardCopy(player, slot);
            if (saved !== null) local.sel = saved;
        } else if (arg === "rename") {
            closePanel(player.id);
            renameClipboardSlot(player, slot).then(() => showClipboardUI(player, slot));
        } else if (arg === "delete") {
            local.sel = deleteClipboardSlot(player, slot);
        }
    },
});

registerPanel("help", {
    values() {
        return {};
    },
    click(player, id) {
        const [kind, arg] = split(id);
        if (leave(player, kind)) return;
        if (arg === "setup") {
            showOnboarding(player);
            return;
        }
        if (arg === "guided") {
            openPanel(player, "lessons");
            return;
        }
        closePanel(player.id);
        if (arg === "book")          offerTutorialBook(player);
        else if (arg === "language") changeBookLanguage(player);
        else if (arg === "guided")   startCoach(player);
    },
});

registerPanel("lessons", {
    values(player) {
        return coachProgress(player);
    },
    click(player, id) {
        const [kind, arg] = split(id);
        if (leave(player, kind)) return;
        closePanel(player.id);
        if (kind === "lesson") startCoach(player, { lesson: Number(arg) });
        else                   startCoach(player);
    },
});

registerPanel("setup", {
    values(player) {
        return { preset: PRESET_IDS.indexOf(activePreset(player)) + 1 };
    },
    click(player, id, local) {
        const [kind, arg] = split(id);
        if (kind === "close") {
            closePanel(player.id);
            return;
        }
        local.done = true;
        finishOnboarding(player, kind === "preset" ? arg : undefined);
        closePanel(player.id);
        if (local.first) {
            system.runTimeout(() => {
                if (!isCoaching(player.id)) startCoach(player);
            }, 40);
        }
    },
    dismissed(player, local) {
        if (!local.first) setOnboarded(player, true);
    },
});

registerPanel("copycut", {
    values() {
        return {};
    },
    click(player, id, local) {
        if (id === "copy" || id === "cut") {
            local.done = true;
            finishCopyCut(player, local.corner1, local.corner2, id === "cut");
        }
        closePanel(player.id);
    },
    dismissed(player) {
        cancelCopyCut(player);
    },
});
