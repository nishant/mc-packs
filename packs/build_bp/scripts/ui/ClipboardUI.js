// @ts-nocheck
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { getState } from "../core/PlayerState.js";
import { getAllMeta, loadSlot, loadSlotMeta, deleteSlot, renameSlot, saveToFreeSlot, isAutoSlot } from "../utils/ClipboardStore.js";
import { t } from "../utils/Text.js";
import { smallIcon, usesFloatingUI, showForm } from "../utils/CustomUI.js";
import { openPanel } from "../core/EntityPanel.js";
import { showHintOnce } from "../utils/Hints.js";
import { captureClipboard, cutAndCapture } from "../core/Clipboard.js";
import { autoSaveToStore } from "../utils/ClipboardStore.js";
import { lockActionBar } from "../utils/ActionBar.js";

const SLOT_ICON = "textures/effortless_building/copy_paste";

function slotLabel(m, slot, activeSlot) {
    const active = slot === activeSlot;
    const title  = m ? (m.name ? m.name : `${m.x}x${m.y}x${m.z}`) : null;

    if (isAutoSlot(slot)) {
        if (!m) return t(active ? "eb.clipboard.slot.auto_empty_active" : "eb.clipboard.slot.auto_empty");
        return t(active ? "eb.clipboard.slot.auto_active" : "eb.clipboard.slot.auto", title);
    }
    const num = String(slot + 1);
    if (!m) return t(active ? "eb.clipboard.slot.empty_active" : "eb.clipboard.slot.empty", num);
    return t(active ? "eb.clipboard.slot.filled_active" : "eb.clipboard.slot.filled", num, title);
}

function displayOrder(allMeta) {
    return allMeta
        .map((m, slot) => ({ m, slot }))
        .sort((a, b) => {
            if (!a.m && !b.m) return a.slot - b.slot;
            if (!a.m) return 1;
            if (!b.m) return -1;
            return (b.m.t ?? 0) - (a.m.t ?? 0);
        });
}

export function slotTip(player, slot) {
    const meta = loadSlotMeta(player, slot);
    if (!meta) return t(isAutoSlot(slot) ? "eb.clipboard.tip.auto_empty" : "eb.clipboard.tip.empty");
    return meta.name
        ? t("eb.clipboard.tip.dims_named", meta.name, meta.x, meta.y, meta.z, meta.n)
        : t("eb.clipboard.tip.dims", meta.x, meta.y, meta.z, meta.n);
}

export function newestSlot(player) {
    const newest = displayOrder(getAllMeta(player))[0];
    return newest?.m ? newest.slot : 0;
}

export function loadClipboardSlot(player, slot) {
    const clipboard = loadSlot(player, slot);
    if (!clipboard) { player.sendMessage(t("eb.clipboard.load_failed")); return false; }
    getState(player).clipboard = clipboard;
    player.sendMessage(isAutoSlot(slot)
        ? t("eb.clipboard.loaded_auto")
        : t("eb.clipboard.loaded", String(slot + 1)));
    return true;
}

export function saveClipboardCopy(player, slot) {
    const clipboard = loadSlot(player, slot);
    if (!clipboard) { player.sendMessage(t("eb.clipboard.load_failed")); return null; }
    const saved = saveToFreeSlot(player, clipboard);
    if (saved === null) {
        player.sendMessage(t("eb.clipboard.save_full"));
        return null;
    }
    player.sendMessage(t("eb.clipboard.saved", String(saved + 1)));
    return saved;
}

export async function renameClipboardSlot(player, slot) {
    const meta = loadSlotMeta(player, slot);
    if (!meta) return;
    const nameForm = new ModalFormData()
        .title(t("eb.clipboard.rename_title"))
        .textField(t("eb.clipboard.rename_label"), t("eb.clipboard.rename_placeholder"), { defaultValue: meta.name ?? "" });
    const nameRes = await showForm(nameForm, player);
    if (!nameRes.canceled && nameRes.formValues) {
        renameSlot(player, slot, String(nameRes.formValues[0] ?? ""));
    }
}

export function deleteClipboardSlot(player, slot) {
    deleteSlot(player, slot);
    player.sendMessage(isAutoSlot(slot)
        ? t("eb.clipboard.cleared_auto")
        : t("eb.clipboard.cleared", String(slot + 1)));
    return newestSlot(player);
}

async function show(player, activeSlot) {
    const allMeta = getAllMeta(player);
    const meta    = allMeta[activeSlot];
    const tipText = slotTip(player, activeSlot);

    const order = displayOrder(allMeta);

    const form = new ActionFormData()
        .title(t("eb.ui.title.clipboard"))
        .body(tipText);

    for (const { m, slot } of order) {
        form.button(slotLabel(m, slot, activeSlot), smallIcon(SLOT_ICON));
    }

    const rightBtns = [
        { type: "paste",  label: t(meta ? "eb.clipboard.btn.paste"  : "eb.clipboard.btn.paste_empty")  },
        { type: "save",   label: t(meta ? "eb.clipboard.btn.save"   : "eb.clipboard.btn.save_empty")   },
        { type: "rename", label: t(meta ? "eb.clipboard.btn.rename" : "eb.clipboard.btn.rename_empty") },
        { type: "delete", label: t(meta ? "eb.clipboard.btn.delete" : "eb.clipboard.btn.delete_empty") },
        { type: "done",   label: t("eb.clipboard.btn.done") },
    ];
    for (const btn of rightBtns) form.button(btn.label);

    const response = await showForm(form, player);
    if (response.canceled || response.selection === undefined) return;

    const sel = response.selection;

    if (sel < order.length) {
        await show(player, order[sel].slot);
        return;
    }

    const btn = rightBtns[sel - order.length];
    if (!btn || btn.type === "done") return;

    if (!meta) { await show(player, activeSlot); return; }

    if (btn.type === "paste") {
        loadClipboardSlot(player, activeSlot);
    } else if (btn.type === "save") {
        const slot = saveClipboardCopy(player, activeSlot);
        if (slot !== null || loadSlotMeta(player, activeSlot)) await show(player, slot ?? activeSlot);
    } else if (btn.type === "rename") {
        await renameClipboardSlot(player, activeSlot);
        await show(player, activeSlot);
    } else if (btn.type === "delete") {
        await show(player, deleteClipboardSlot(player, activeSlot));
    }
}

export function cancelCopyCut(player) {
    player.onScreenDisplay.setActionBar(t("eb.bar.copy_cancelled"));
    lockActionBar(player.id, 1500);
}

export async function showCopyCutPrompt(player, corner1, corner2) {
    if (usesFloatingUI(player) && openPanel(player, "copycut", { local: { corner1, corner2 } })) return;
    const res = await showForm(new ActionFormData()
        .title(t("eb.clipboard.action.title"))
        .body(t("eb.clipboard.action.body"))
        .button(t("eb.clipboard.action.copy"))
        .button(t("eb.clipboard.action.cut"))
        .button(t("eb.clipboard.action.cancel")), player);

    if (res.canceled || res.selection === undefined || res.selection === 2) {
        cancelCopyCut(player);
        return;
    }
    finishCopyCut(player, corner1, corner2, res.selection === 1);
}

export function finishCopyCut(player, corner1, corner2, isCut) {
    const count = isCut
        ? cutAndCapture(player, corner1, corner2)
        : captureClipboard(player, corner1, corner2);

    const clip = getState(player).clipboard;
    if (count > 0 && clip) autoSaveToStore(player, clip);

    player.onScreenDisplay.setActionBar(count > 0
        ? t(isCut ? "eb.bar.cut_done" : "eb.bar.copy_done", count)
        : t("eb.bar.copy_empty"));
    lockActionBar(player.id, 2500);
}

export async function showClipboardUI(player, slot = newestSlot(player)) {
    showHintOnce(player, "panel.clipboard", "eb.hint.panel.clipboard");
    if (usesFloatingUI(player) && openPanel(player, "clipboard", { local: { sel: slot } })) return;
    await show(player, slot);
}
