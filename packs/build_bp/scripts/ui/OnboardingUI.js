// @ts-nocheck
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { system } from "@minecraft/server";
import { setOnboarded } from "../core/Settings.js";
import { PRESET_IDS, applyPreset } from "../core/Presets.js";
import { t } from "../utils/Text.js";
import { usesFloatingUI } from "../utils/CustomUI.js";
import { openPanel } from "../core/EntityPanel.js";

const REOPEN_DELAY_TICKS = 20;
const MAX_REOPENS        = 30;

function waitTicks(ticks) {
    return new Promise(resolve => system.runTimeout(resolve, ticks));
}

async function showPersistent(player, buildForm, persist) {
    for (let attempt = 0; ; attempt++) {
        if (!player || player.isValid !== true) return null;
        const res = await buildForm().show(player);
        if (!player || player.isValid !== true) return null;
        if (!res.canceled) return res;
        if (res.cancelationReason === FormCancelationReason.UserBusy && attempt < MAX_REOPENS) {
            await waitTicks(2);
            continue;
        }
        if (!persist) return res;

        const reopenable = res.cancelationReason === FormCancelationReason.UserBusy
                        || res.cancelationReason === FormCancelationReason.UserClosed;
        if (!reopenable || attempt >= MAX_REOPENS) return null;

        await waitTicks(REOPEN_DELAY_TICKS);
    }
}

export function finishOnboarding(player, presetId) {
    setOnboarded(player, true);
    if (presetId) {
        applyPreset(player, presetId);
        player.sendMessage(t("eb.onboarding.tier_applied", t(`eb.onboarding.tier.${presetId}`)));
    }
    player.sendMessage(t("eb.onboarding.complete"));
}

export async function showOnboarding(player, { persist = false } = {}) {
    if (usesFloatingUI(player) && openPanel(player, "setup", { pinned: persist, local: { first: persist } })) return;
    const buildForm = () => new ActionFormData()
        .title(t("eb.onboarding.title"))
        .body(t("eb.onboarding.welcome.body"))
        .button(t("eb.onboarding.btn.low"))
        .button(t("eb.onboarding.btn.mid"))
        .button(t("eb.onboarding.btn.high"))
        .button(t("eb.onboarding.btn.skip"));

    const res = await showPersistent(player, buildForm, persist);
    if (!res || res.canceled || res.selection === undefined) {
        if (!persist) setOnboarded(player, true);
        return;
    }
    finishOnboarding(player, PRESET_IDS[res.selection]);
}
