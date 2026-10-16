// @ts-nocheck
import { getPanelVolume, getBookLanguage } from "../core/Settings.js";
import { GUIDE_LANGUAGES } from "../core/GuideBookData.js";

export function panelLanguage(player) {
    return Math.max(0, GUIDE_LANGUAGES.findIndex(language => language.id === getBookLanguage(player)));
}

export function panelSound(player, kind) {
    const volume = getPanelVolume(player);
    if (volume <= 0) return;
    try {
        if (volume < 1) player.playSound(`eb.ui.${kind}`, { volume });
        else            player.playSound(`eb.ui.${kind}`);
    } catch {}
}

export function scaleEntity(entity, scale) {
    try {
        const part = entity.getComponent("minecraft:scale");
        if (!part) return 1;
        part.value = scale;
        return part.value;
    } catch { return 1; }
}
