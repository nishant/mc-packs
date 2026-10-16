// @ts-nocheck
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { getMirrorState, getArrayState, getRadialState, setMirrorState, setArrayState, setRadialState } from "../core/PlayerState.js";
import { t } from "../utils/Text.js";
import { smallIcon, usesFloatingUI, showForm } from "../utils/CustomUI.js";
import { showHintOnce } from "../utils/Hints.js";
import { openPanel } from "../core/EntityPanel.js";

function on()   { return t("eb.common.on");  }
function off()  { return t("eb.common.off"); }
function tog(v) { return v ? on() : off(); }

export function centerMirrorHere(player) {
    const loc = player.location;
    setMirrorState(player, { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) });
    player.onScreenDisplay.setActionBar(
        t("eb.modifiers.mirror.pos_set", Math.floor(loc.x), Math.floor(loc.y), Math.floor(loc.z))
    );
}

export function centerRadialHere(player) {
    const loc = player.location;
    setRadialState(player, { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) });
    player.onScreenDisplay.setActionBar(
        t("eb.modifiers.radial.pos_set", Math.floor(loc.x), Math.floor(loc.y), Math.floor(loc.z))
    );
}

export async function showModifiersUI(player, selected = null) {
    showHintOnce(player, "panel.modifiers", "eb.hint.panel.modifiers");
    if (usesFloatingUI(player) && openPanel(player, "modifiers")) return;
    const mirror = getMirrorState(player);
    const array  = getArrayState(player);
    const radial = getRadialState(player);

    let body;
    if (selected === "mirror") {
        body = t("eb.modifiers.mirror.body",
            tog(mirror.enabled),
            mirror.x, mirror.y, mirror.z,
            mirror.axisX ? "§aON§r" : "§cOFF§r",
            mirror.axisY ? "§aON§r" : "§cOFF§r",
            mirror.axisZ ? "§aON§r" : "§cOFF§r",
            mirror.radius,
            tog(mirror.odd)
        );
    } else if (selected === "array") {
        body = t("eb.modifiers.array.body",
            tog(array.enabled),
            array.ox, array.oy, array.oz,
            array.count
        );
    } else if (selected === "radial") {
        body = t("eb.modifiers.radial.body",
            tog(radial.enabled),
            radial.x, radial.z,
            radial.slices, radial.radius,
            tog(radial.alternate)
        );
    } else {
        body = t("eb.modifiers.overview_body",
            tog(mirror.enabled),
            tog(array.enabled),
            tog(radial.enabled)
        );
    }

    const form = new ActionFormData()
        .title(t("eb.ui.title.modifiers"))
        .body(body);

    form.button(
        t(selected === "mirror" ? "eb.modifiers.btn.mirror_active" : "eb.modifiers.btn.mirror", tog(mirror.enabled)),
        smallIcon("textures/effortless_building/mirror")
    );
    form.button(
        t(selected === "array" ? "eb.modifiers.btn.array_active" : "eb.modifiers.btn.array", tog(array.enabled)),
        smallIcon("textures/effortless_building/array")
    );
    form.button(
        t(selected === "radial" ? "eb.modifiers.btn.radial_active" : "eb.modifiers.btn.radial", tog(radial.enabled)),
        smallIcon("textures/effortless_building/radial")
    );

    const right = [];

    if (selected === "mirror") {
        right.push({ a: "toggle_mirror",  l: t(mirror.enabled ? "eb.modifiers.mirror.btn.disable" : "eb.modifiers.mirror.btn.enable") });
        right.push({ a: "mirror_set_pos", l: t("eb.modifiers.mirror.btn.set_pos") });
        right.push({ a: "mirror_axis_x",  l: t("eb.modifiers.mirror.axis_x_toggle", tog(mirror.axisX)) });
        right.push({ a: "mirror_axis_y",  l: t("eb.modifiers.mirror.axis_y_toggle", tog(mirror.axisY)) });
        right.push({ a: "mirror_axis_z",  l: t("eb.modifiers.mirror.axis_z_toggle", tog(mirror.axisZ)) });
        right.push({ a: "mirror_odd",     l: t("eb.modifiers.mirror.odd_toggle", tog(mirror.odd)) });
        right.push({ a: "mirror_config",  l: t("eb.modifiers.mirror.btn.configure") });

    } else if (selected === "array") {
        right.push({ a: "toggle_array",   l: t(array.enabled ? "eb.modifiers.array.btn.disable" : "eb.modifiers.array.btn.enable") });
        right.push({ a: "array_config",   l: t("eb.modifiers.array.btn.configure") });

    } else if (selected === "radial") {
        right.push({ a: "toggle_radial",  l: t(radial.enabled ? "eb.modifiers.radial.btn.disable" : "eb.modifiers.radial.btn.enable") });
        right.push({ a: "radial_set_pos", l: t("eb.modifiers.radial.btn.set_pos") });
        right.push({ a: "radial_config",  l: t("eb.modifiers.radial.btn.configure") });
    }

    right.push({ a: "close", l: t("eb.modifiers.btn.close") });

    for (const btn of right) form.button(btn.l);

    const res = await showForm(form, player);
    if (res.canceled || res.selection === undefined) return;

    const sel = res.selection;

    if (sel === 0) { await showModifiersUI(player, "mirror"); return; }
    if (sel === 1) { await showModifiersUI(player, "array");  return; }
    if (sel === 2) { await showModifiersUI(player, "radial"); return; }

    const btn = right[sel - 3];
    if (!btn) return;

    switch (btn.a) {

        case "toggle_mirror":
            setMirrorState(player, { enabled: !mirror.enabled });
            await showModifiersUI(player, "mirror");
            break;
        case "mirror_set_pos":
            centerMirrorHere(player);
            await showModifiersUI(player, "mirror");
            break;
        case "mirror_axis_x":
            setMirrorState(player, { axisX: !mirror.axisX });
            await showModifiersUI(player, "mirror");
            break;
        case "mirror_axis_y":
            setMirrorState(player, { axisY: !mirror.axisY });
            await showModifiersUI(player, "mirror");
            break;
        case "mirror_axis_z":
            setMirrorState(player, { axisZ: !mirror.axisZ });
            await showModifiersUI(player, "mirror");
            break;
        case "mirror_odd":
            setMirrorState(player, { odd: !mirror.odd });
            await showModifiersUI(player, "mirror");
            break;
        case "mirror_config":
            await showMirrorConfigUI(player);
            break;

        case "toggle_array":
            setArrayState(player, { enabled: !array.enabled });
            await showModifiersUI(player, "array");
            break;
        case "array_config":
            await showArrayConfigUI(player);
            break;

        case "toggle_radial":
            setRadialState(player, { enabled: !radial.enabled });
            await showModifiersUI(player, "radial");
            break;
        case "radial_set_pos":
            centerRadialHere(player);
            await showModifiersUI(player, "radial");
            break;
        case "radial_config":
            await showRadialConfigUI(player);
            break;

        case "close":
        default:
            return;
    }
}

function parseIntOr(str, fallback) {
    const n = parseInt(str, 10);
    return isNaN(n) ? fallback : n;
}

export async function showMirrorConfigUI(player) {
    const m = getMirrorState(player);
    const res = await showForm(new ModalFormData()
        .title(t("eb.modifiers.mirror.config.title"))
        .textField(t("eb.modifiers.mirror.center_x"), "e.g. 0",  { defaultValue: String(m.x) })
        .textField(t("eb.modifiers.mirror.center_y"), "e.g. 64", { defaultValue: String(m.y) })
        .textField(t("eb.modifiers.mirror.center_z"), "e.g. 0",  { defaultValue: String(m.z) })
        .textField(t("eb.modifiers.mirror.radius"),   "e.g. 32", { defaultValue: String(m.radius) }), player);

    if (!res.canceled && res.formValues) {
        const [xStr, yStr, zStr, radStr] = res.formValues;
        const x      = parseIntOr(xStr,   m.x);
        const y      = parseIntOr(yStr,   m.y);
        const z      = parseIntOr(zStr,   m.z);
        const radius = Math.max(1, parseIntOr(radStr, m.radius));
        setMirrorState(player, { x, y, z, radius });
    }
    if (usesFloatingUI(player) && openPanel(player, "mirror_config")) return;
    await showModifiersUI(player, "mirror");
}

export async function showArrayConfigUI(player) {
    const a = getArrayState(player);
    const res = await showForm(new ModalFormData()
        .title(t("eb.modifiers.array.config.title"))
        .textField(t("eb.modifiers.array.offset_x"), "e.g. 1", { defaultValue: String(a.ox) })
        .textField(t("eb.modifiers.array.offset_y"), "e.g. 0", { defaultValue: String(a.oy) })
        .textField(t("eb.modifiers.array.offset_z"), "e.g. 0", { defaultValue: String(a.oz) })
        .textField(t("eb.modifiers.array.count"),    "e.g. 3", { defaultValue: String(a.count) }), player);

    if (!res.canceled && res.formValues) {
        const [oxStr, oyStr, ozStr, countStr] = res.formValues;
        const ox    = parseIntOr(oxStr,    a.ox);
        const oy    = parseIntOr(oyStr,    a.oy);
        const oz    = parseIntOr(ozStr,    a.oz);
        const count = Math.max(1, parseIntOr(countStr, a.count));
        setArrayState(player, { ox, oy, oz, count });
    }
    if (usesFloatingUI(player) && openPanel(player, "array_config")) return;
    await showModifiersUI(player, "array");
}

export async function showRadialConfigUI(player) {
    const r = getRadialState(player);
    const res = await showForm(new ModalFormData()
        .title(t("eb.modifiers.radial.config.title"))
        .textField(t("eb.modifiers.radial.center_x"), "e.g. 0",  { defaultValue: String(r.x) })
        .textField(t("eb.modifiers.radial.center_z"), "e.g. 0",  { defaultValue: String(r.z) })
        .textField(t("eb.modifiers.radial.slices"),   "e.g. 4",  { defaultValue: String(r.slices) })
        .textField(t("eb.modifiers.radial.radius"),   "e.g. 32", { defaultValue: String(r.radius) })
        .toggle(t("eb.modifiers.radial.alternate"), { defaultValue: r.alternate }), player);

    if (!res.canceled && res.formValues) {
        const [xStr, zStr, slicesStr, radStr, alternate] = res.formValues;
        const x      = parseIntOr(xStr,      r.x);
        const z      = parseIntOr(zStr,      r.z);
        const slices = Math.max(2, parseIntOr(slicesStr, r.slices));
        const radius = Math.max(1, parseIntOr(radStr,    r.radius));
        setRadialState(player, { x, z, slices, radius, alternate: Boolean(alternate) });
    }
    if (usesFloatingUI(player) && openPanel(player, "radial_config")) return;
    await showModifiersUI(player, "radial");
}
