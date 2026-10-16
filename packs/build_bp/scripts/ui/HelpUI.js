// @ts-nocheck
import { ActionFormData } from "@minecraft/server-ui";
import { t } from "../utils/Text.js";
import { TUTORIAL_BOOK_ID, hasItem, giveTutorialBook } from "../utils/Items.js";
import { startCoach } from "../core/Coach.js";
import { showOnboarding } from "./OnboardingUI.js";
import { changeBookLanguage } from "../core/GuideBook.js";
import { usesFloatingUI, showForm } from "../utils/CustomUI.js";
import { openPanel } from "../core/EntityPanel.js";

export function offerTutorialBook(player) {
    if (hasItem(player, TUTORIAL_BOOK_ID)) {
        player.sendMessage(t("eb.help.book_hold"));
        return;
    }
    player.sendMessage(t(giveTutorialBook(player) ? "eb.help.book_given" : "eb.help.book_no_room"));
}

export async function showHelpUI(player) {
    if (usesFloatingUI(player) && openPanel(player, "help")) return;
    const res = await showForm(new ActionFormData()
        .title(t("eb.help.title"))
        .body(t("eb.help.body"))
        .button(t("eb.help.btn.book"),   "textures/ui/book_edit_default")
        .button(t("eb.help.btn.language"), "textures/ui/world_glyph_color_2x")
        .button(t("eb.help.btn.guided"), "textures/ui/icon_recipe_construction")
        .button(t("eb.help.btn.setup"),  "textures/ui/icon_new")
        .button(t("eb.config.done")), player);
    if (res.canceled) return;
    switch (res.selection) {
        case 0: offerTutorialBook(player); break;
        case 1: changeBookLanguage(player); break;
        case 2: startCoach(player); break;
        case 3: await showOnboarding(player); break;
    }
}
