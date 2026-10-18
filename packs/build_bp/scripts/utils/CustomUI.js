// @ts-nocheck
import { system } from "@minecraft/server";
import { FormCancelationReason } from "@minecraft/server-ui";
import { getGlobalCustomUI } from "../core/Settings.js";

const DP_CUSTOM_UI   = "eb:customUI";
const DP_FLOATING_UI = "eb:floatingUI";

export const MENU_STYLES       = ["floating", "plain"];
export const MENU_STYLE_LABELS = ["Floating", "Plain"];

export async function showForm(form, player, maxRetries = 15) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            if (!player || player.isValid !== true) return { canceled: true };
            const res = await form.show(player);
            if (!player || player.isValid !== true) return { canceled: true };
            if (res.canceled && res.cancelationReason === FormCancelationReason.UserBusy && attempt < maxRetries) {
                await new Promise(resolve => system.runTimeout(resolve, 2));
                continue;
            }
            return res;
        } catch {
            return { canceled: true };
        }
    }
    return { canceled: true };
}

export function getMenuStyle(player) {
    if (!getGlobalCustomUI()) return "plain";
    let floating, legacy;
    try {
        floating = player.getDynamicProperty(DP_FLOATING_UI);
        legacy   = player.getDynamicProperty(DP_CUSTOM_UI);
    } catch {}
    if (typeof floating === "boolean") return floating ? "floating" : "plain";
    if (typeof legacy === "boolean") {
        // The old switch: move it to the one /realm:prefs shows, so that menu reads and sets what counts.
        try {
            player.setDynamicProperty(DP_FLOATING_UI, legacy);
            player.setDynamicProperty(DP_CUSTOM_UI, undefined);
        } catch {}
    }
    return legacy === false ? "plain" : "floating";
}

export function setMenuStyle(player, style) {
    try {
        player.setDynamicProperty(DP_FLOATING_UI, style === "floating");
    } catch (e) {
        console.warn(`[EB] setMenuStyle failed: ${e}`);
    }
}

export function usesFloatingUI(player) {
    return getMenuStyle(player) === "floating";
}

const ICON_FOLDER = "textures/effortless_building/";

export function smallIcon(path) {
    return path.replace(ICON_FOLDER, `${ICON_FOLDER}small/`);
}
