// @ts-nocheck
import {
    getPreviewQuality, setPreviewQuality,
    getPreviewMode, setPreviewMode,
    getDestroyPreviewMode, setDestroyPreviewMode,
    getFlickPreview, setFlickPreview,
    getDeferShapeCalc, setDeferShapeCalc,
    getMaxBlocks, setMaxBlocks,
    getAdminMaxBlocksCap, setAdminMaxBlocksCap,
} from "./Settings.js";
import { isOp } from "../utils/Permissions.js";
import { t } from "../utils/Text.js";

export const PRESET_IDS = ["low", "mid", "high"];

export const PRESETS = {
    low:  { maxBlocks: 10_000,  quality: 4, buildPreview: "corner_outline", destroyPreview: "corner_outline", flick: true,  deferShape: true  },
    mid:  { maxBlocks: 50_000,  quality: 2, buildPreview: "outline",        destroyPreview: "corner_outline", flick: false, deferShape: true  },
    high: { maxBlocks: 100_000, quality: 1, buildPreview: "outline",        destroyPreview: "outline",        flick: false, deferShape: false },
};

function applyMaxBlocks(player, requested) {
    const adminCap = getAdminMaxBlocksCap();
    if (requested > adminCap) {
        if (isOp(player)) {
            setAdminMaxBlocksCap(requested);
        } else {
            player.sendMessage(t("eb.onboarding.capped_by_admin", adminCap.toLocaleString()));
        }
    }
    return setMaxBlocks(player, requested);
}

export function applyPreset(player, presetId) {
    const preset = PRESETS[presetId];
    if (!preset) return;
    setPreviewQuality(player, preset.quality);
    setPreviewMode(player, preset.buildPreview);
    setDestroyPreviewMode(player, preset.destroyPreview);
    setFlickPreview(player, preset.flick);
    setDeferShapeCalc(player, preset.deferShape);
    applyMaxBlocks(player, preset.maxBlocks);
}

export function activePreset(player) {
    const maxBlocks = getMaxBlocks(player);
    const adminCap  = getAdminMaxBlocksCap();
    return PRESET_IDS.find(id => {
        const preset = PRESETS[id];
        return getPreviewQuality(player) === preset.quality
            && getPreviewMode(player) === preset.buildPreview
            && getDestroyPreviewMode(player) === preset.destroyPreview
            && getFlickPreview(player) === preset.flick
            && getDeferShapeCalc(player) === preset.deferShape
            && maxBlocks === Math.min(preset.maxBlocks, adminCap);
    }) ?? null;
}
