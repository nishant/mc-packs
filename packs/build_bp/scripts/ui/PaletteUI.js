// @ts-nocheck
import { ActionFormData } from "@minecraft/server-ui";
import {
    getPaletteMode,      setPaletteMode,
    getDistributionMode, setDistributionMode,
    getWeightMode,       setWeightMode,
    getSmartPattern,     setSmartPattern,
} from "../core/Palette.js";
import { t } from "../utils/Text.js";
import { smallIcon, usesFloatingUI, showForm } from "../utils/CustomUI.js";
import { showHintOnce } from "../utils/Hints.js";
import { openPanel } from "../core/EntityPanel.js";

const CATEGORIES = [
    { id: "source", icon: "textures/effortless_building/palette_source"  },
    { id: "dist",   icon: "textures/effortless_building/palette_pattern" },
    { id: "weight", icon: "textures/effortless_building/palette_weight"  },
];

const SOURCE_IDS = ["disable", "hotbar", "inventory", "hotbar_inventory"];
const DIST_IDS   = [
    "dissolve", "dissolve_x", "dissolve_y", "dissolve_z",
    "random", "spread",
    "grad_x", "grad_y", "grad_z", "grad_radial", "grad_diagonal", "concentric",
    "checker", "stripes_h", "stripes_v", "stripes_d", "brick", "herringbone",
    "noise", "cell", "marble",
    "border", "wave", "spiral",
];

const BEST_DIST_ID = "dissolve";
const WEIGHT_IDS = ["amount", "slots", "unique"];

function getOptionIds(cat) {
    return cat === "source" ? SOURCE_IDS : cat === "dist" ? DIST_IDS : WEIGHT_IDS;
}
function getCatNs(cat) {
    return cat === "source" ? "eb.palette.source."
         : cat === "dist"   ? "eb.palette.dist."
         :                    "eb.palette.weight.";
}
function getCurrent(player, cat) {
    return cat === "source" ? getPaletteMode(player)
         : cat === "dist"   ? getDistributionMode(player)
         :                    getWeightMode(player);
}
function setCurrent(player, cat, id) {
    if (cat === "source") setPaletteMode(player, id);
    else if (cat === "dist") setDistributionMode(player, id);
    else setWeightMode(player, id);
}

async function showPaletteCombinedUI(player, activeCat) {
    const curSource = getPaletteMode(player);
    const curDist   = getDistributionMode(player);
    const curWeight = getWeightMode(player);
    const currentVal = getCurrent(player, activeCat);

    const tipKey = `${getCatNs(activeCat)}${currentVal}.desc`;
    const form = new ActionFormData()
        .title(t("eb.ui.title.palette"))
        .body(t(tipKey));

    for (const cat of CATEGORIES) {
        const curId    = cat.id === "source" ? curSource : cat.id === "dist" ? curDist : curWeight;
        const ns       = getCatNs(cat.id);
        const isActive = cat.id === activeCat;
        form.button(
            {
                rawtext: [
                    { text: isActive ? "§l§f" : "§f" },
                    t("eb.palette.cat." + cat.id),
                    { text: "§r: §e" },
                    t(ns + curId),
                    { text: "§r" },
                ]
            },
            smallIcon(cat.icon)
        );
    }

    const ids       = getOptionIds(activeCat);
    const ns        = getCatNs(activeCat);
    const rightBtns = [];

    for (const id of ids) {
        rightBtns.push({ id, isOpt: true });
    }
    rightBtns.push({ id: "smart_pattern", isOpt: false });
    rightBtns.push(null);

    for (const btn of rightBtns) {
        if (!btn) {
            form.button(t("eb.palette.btn.done"));
        } else if (btn.id === "smart_pattern") {
            const smartEnabled = getSmartPattern(player);
            form.button(t(smartEnabled ? "eb.palette.tile_pattern_on" : "eb.palette.tile_pattern_off"));
        } else {
            const lbl    = t(ns + btn.id);
            const active = btn.id === currentVal;
            const isBest = activeCat === "dist" && btn.id === BEST_DIST_ID;
            form.button(active || isBest
                ? { rawtext: [
                    { text: active ? "§l§e" : "§f" },
                    lbl,
                    ...(isBest ? [t("eb.palette.best_tag")] : []),
                    { text: "§r" },
                  ] }
                : lbl
            );
        }
    }

    const response = await showForm(form, player);
    if (response.canceled || response.selection === undefined) return;

    const sel      = response.selection;
    const CAT_COUNT = CATEGORIES.length;

    if (sel < CAT_COUNT) {
        await showPaletteCombinedUI(player, CATEGORIES[sel].id);
    } else {
        const btn = rightBtns[sel - CAT_COUNT];
        if (!btn) return;

        if (btn.id === "smart_pattern") {
            setSmartPattern(player, !getSmartPattern(player));
            await showPaletteCombinedUI(player, activeCat);
            return;
        }

        choosePaletteOption(player, activeCat, btn.id);
        await showPaletteCombinedUI(player, activeCat);
    }
}

export function choosePaletteOption(player, cat, id) {
    if (!getOptionIds(cat).includes(id)) return;
    const prevSource = getPaletteMode(player);
    setCurrent(player, cat, id);

    const src  = getPaletteMode(player);
    const dist = getDistributionMode(player);
    const wgt  = getWeightMode(player);

    if (cat === "source" && src !== prevSource) {
        if (src !== "disable") {
            player.sendMessage(t("eb.palette.enabled_notice", t(`eb.palette.source.${src}`)));
        } else {
            player.sendMessage(t("eb.palette.disabled_notice"));
        }
    }

    if (src !== "disable") {
        player.onScreenDisplay.setActionBar(
            t("eb.palette.bar",
                t(`eb.palette.source.${src}`),
                t(`eb.palette.dist.${dist}`),
                t(`eb.palette.weight.${wgt}`)
            )
        );
    }
}

export async function showPaletteUI(player) {
    showHintOnce(player, "panel.palette", "eb.hint.panel.palette");
    if (usesFloatingUI(player) && openPanel(player, "palette")) return;
    await showPaletteCombinedUI(player, "source");
}
