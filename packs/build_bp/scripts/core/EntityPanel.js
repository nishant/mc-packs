// @ts-nocheck
import { world, system, Player } from "@minecraft/server";
import { allPlayers } from "../utils/Items.js";
import { PANELS, PANEL_CURSOR_LIFT, PANEL_TIP_ABOVE } from "./EntityPanelData.js";
import { getCursor, setCursor as saveCursor, getCursorTipSeen, setCursorTipSeen, getPanelScale } from "./Settings.js";
import { panelSound as sound, scaleEntity, panelLanguage } from "../utils/PanelSound.js";
import { t } from "../utils/Text.js";
import { clearSpotInFront, liftClear, yawToward } from "../utils/InFront.js";
import { lockActionBar } from "../utils/ActionBar.js";

const DISTANCE       = 2.7;
const MIN_DISTANCE   = 1.3;
const LEASH          = 5;
const SHUT_TICKS     = 6;
const LEAVE_TICKS    = 6;
const CLICK_COOLDOWN = 4;
const AIM_MARGIN     = 1;
const MISS_MARGIN    = 16;
const SYNC_TICKS     = 5;
const TIP_TICKS      = 20;
const TIP_LOCK_MS    = 1500;
const SWEEP_TICKS    = 200;
const PRESS_STEPS    = 8;
const REPEAT_DELAY   = 8;
const REPEAT_GRACE   = 2;
const REPEAT_FAST    = 80;
const REPEAT_BURST   = 5;
const CAMERA_ABOVE_HEAD = 0.1;
const ENTER_FORWARD  = 1;
const ENTER_BACK     = 2;
const HOME_PANEL     = "menu";
const PANEL_TYPES    = new Set(Object.values(PANELS).map(def => def.id));
const DIMENSIONS     = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

const screens   = new Map();
const panels    = new Map();
const lastClick = new Map();
const leaving   = [];
const coaching  = new Map();
const externals = new Map();
const holding   = new Map();

function isLive(entity) {
    try { return entity?.isValid === true; } catch { return false; }
}

function remove(entity) {
    try { if (isLive(entity)) entity.remove(); } catch {}
}

function heldSlot(player) {
    try { return player.selectedSlotIndex; } catch { return -1; }
}

function aimPoint(player, panel, lift = 0) {
    const head = player.getHeadLocation();
    const view = player.getViewDirection();
    const rad  = panel.yaw * Math.PI / 180;
    const face = { x: -Math.sin(rad), z: Math.cos(rad) };
    const at   = isLive(panel.entity) ? panel.entity.location : panel.origin;
    const eyeY = head.y + CAMERA_ABOVE_HEAD;

    const toward = view.x * face.x + view.z * face.z;
    if (toward > -0.05) return null;
    const size  = panel.scale ?? 1;
    const reach = ((at.x - head.x) * face.x + (at.z - head.z) * face.z + lift * size) / toward;
    if (reach <= 0 || reach > 8) return null;

    const hit   = { x: head.x + view.x * reach, y: eyeY + view.y * reach, z: head.z + view.z * reach };
    const right = (hit.x - at.x) * Math.cos(rad) + (hit.z - at.z) * Math.sin(rad);
    const scale = panel.def.pixelsPerBlock / size;
    return {
        x: right * scale + panel.def.originX,
        y: panel.def.height - (hit.y - at.y) * scale,
    };
}

function onPanel(panel, point) {
    const top = panel.values.tip ? -PANEL_TIP_ABOVE : 0;
    return point.x >= -MISS_MARGIN && point.x < panel.def.width + MISS_MARGIN
        && point.y >= top - MISS_MARGIN && point.y < panel.def.height + MISS_MARGIN;
}

function isTip(id) {
    return id.startsWith("tip:");
}

function answerTip(player, id) {
    setCursorTipSeen(player, true);
    if (id !== "tip:off") return "click";
    saveCursor(player, false);
    try { player.sendMessage(t("eb.cursor.turned_off")); } catch {}
    return "off";
}

function tileAt(player, panel, point) {
    if (!point) return 0;
    const rects = panel.def.rects;
    for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        if (point.x < rect.x - AIM_MARGIN || point.x >= rect.x + rect.w + AIM_MARGIN) continue;
        if (point.y < rect.y - AIM_MARGIN || point.y >= rect.y + rect.h + AIM_MARGIN) continue;
        if (isTip(rect.id)) {
            if (!panel.values.tip) continue;
        } else if (panel.screen.visible && !panel.screen.visible(player, rect.id, panel.values, panel.local)) continue;
        return i + 1;
    }
    return 0;
}

function targetOf(player, panel, point) {
    if (!panel.screen.target) return tileAt(player, panel, point);
    if (!point) return 0;
    let id = null;
    try { id = panel.screen.target(point, panel.values); } catch {}
    return id ? panel.def.rects.findIndex(rect => rect.id === id) + 1 : 0;
}

function setCursor(player, panel) {
    const point = panel.cursor ? aimPoint(player, panel, PANEL_CURSOR_LIFT) : null;
    const top   = panel.values.tip ? -PANEL_TIP_ABOVE : 0;
    const aim   = Boolean(point) && point.x >= 0 && point.x <= panel.def.width && point.y >= top && point.y <= panel.def.height;
    if (aim) {
        const cx = Math.round(point.x);
        const cy = Math.round(point.y) + PANEL_TIP_ABOVE;
        try {
            if (cx !== panel.cx) panel.entity.setProperty("eb:cx", cx);
            if (cy !== panel.cy) panel.entity.setProperty("eb:cy", cy);
        } catch {}
        panel.cx = cx;
        panel.cy = cy;
    }
    if (aim === panel.aim) return;
    panel.aim = aim;
    try { panel.entity.setProperty("eb:aim", aim); } catch {}
}

function hoveredId(panel) {
    return panel.hover > 0 ? panel.def.rects[panel.hover - 1].id : null;
}

function showTip(player, panel) {
    if (panel.hover === 0 || !panel.screen.hover) return;
    let tip;
    try { tip = panel.screen.hover(player, hoveredId(panel), panel.values, panel.local); } catch { return; }
    if (!tip) return;
    try {
        player.onScreenDisplay.setActionBar(tip);
        lockActionBar(player.id, TIP_LOCK_MS);
    } catch {}
}

function setHover(player, panel, hover) {
    if (hover === panel.hover) return;
    panel.hover = hover;
    try { panel.entity.setProperty("eb:hover", hover); } catch {}
    if (hover > 0) sound(player, "hover");
    if (panel.screen.look) {
        try { panel.screen.look(player, hoveredId(panel), panel.local); } catch {}
        sync(player, panel);
    }
    showTip(player, panel);
}

function retire(panel) {
    if (panel.retired) return;
    panel.retired = true;
    if (panel.local.done || !panel.screen.dismissed) return;
    try { panel.screen.dismissed(panel.player, panel.local); } catch (e) { console.warn(`[EB] panel ${panel.name} dismissed failed: ${e}`); }
}

function sync(player, panel) {
    let values;
    try { values = panel.screen.values(player, panel.local); } catch (e) { console.warn(`[EB] panel ${panel.name} values failed: ${e}`); return; }
    panel.cursor = getCursor(player);
    const size   = getPanelScale(player);
    if (size !== panel.wanted) {
        panel.wanted = size;
        panel.scale  = scaleEntity(panel.entity, size);
    }
    values.tip   = panel.cursor && !getCursorTipSeen(player);
    values.lang  = panelLanguage(player);
    const coach  = coaching.get(player.id);
    const spot   = coach?.spot?.[panel.name];
    values.spot  = spot ? panel.def.rects.findIndex(rect => rect.id === spot) + 1 : 0;
    values.coach = coach && panel.def.banners.includes(coach.step) ? coach.step : 0;
    for (const [key, value] of Object.entries(values)) {
        if (panel.values[key] === value) continue;
        try { panel.entity.setProperty(`eb:${key}`, value); } catch {}
    }
    panel.values = values;
}

function press(panel, target) {
    panel.pressed = ((panel.pressed ?? 0) + 1) % PRESS_STEPS;
    try {
        panel.entity.setProperty("eb:press", target);
        panel.entity.setProperty("eb:pressn", panel.pressed);
    } catch {}
}

function repeatClick(player, panel, tick) {
    const again = panel.repeat;
    if (!again) return;
    const since = holding.get(player.id);
    if (since === undefined || since < again.since - REPEAT_GRACE) {
        if (tick - again.since > REPEAT_GRACE) panel.repeat = null;
        return;
    }
    if (tick < again.next) return;
    const point  = aimPoint(player, panel);
    const target = targetOf(player, panel, point);
    if (target !== again.target) {
        panel.repeat = null;
        return;
    }
    const held = tick - again.since;
    const rect = panel.def.rects[target - 1];
    again.next = tick + (held < 24 ? 3 : held < 50 ? 2 : 1);
    again.count++;
    try {
        panel.screen.click(player, rect.id, panel.local, { x: point.x - rect.x, y: point.y - rect.y }, held < REPEAT_FAST ? 1 : REPEAT_BURST);
    } catch (e) {
        console.warn(`[EB] panel ${panel.name} repeat failed: ${e}`);
    }
    if (panels.get(player.id) !== panel || panel.shutAt !== null) return;
    if (again.count % 2 === 0) sound(player, "hover");
    sync(player, panel);
}

export { aimPoint, setCursor as updateCursor };

export function registerPanel(name, screen) {
    screens.set(name, screen);
}

export function registerExternal(typeId, handler) {
    externals.set(typeId, handler);
}

export function setCoaching(playerId, info) {
    if (info) coaching.set(playerId, info);
    else coaching.delete(playerId);
    const panel = panels.get(playerId);
    if (panel && panel.shutAt === null) sync(panel.player, panel);
}

export function hasPanel(playerId) {
    return panels.has(playerId);
}

export function aimingAtPanel(player) {
    const panel = panels.get(player.id);
    if (!panel || panel.shutAt !== null) return false;
    const point = aimPoint(player, panel);
    return Boolean(point) && onPanel(panel, point);
}

export function openPanelName(playerId) {
    return panels.get(playerId)?.name ?? null;
}

export function openPanel(player, name, { local = {}, pinned = false, centre = null } = {}) {
    const def    = PANELS[name];
    const screen = screens.get(name);
    if (!def || !screen) return false;

    const size = getPanelScale(player);
    const tall = def.height / def.pixelsPerBlock * size;
    const wide = def.width / def.pixelsPerBlock * size;
    const old  = panels.get(player.id);
    const swap = Boolean(old && old.shutAt === null && isLive(old.entity));
    let origin, yaw;
    if (centre) {
        origin = { x: centre.x, y: centre.y - tall / 2, z: centre.z };
        yaw    = yawToward(origin, player.location);
    } else if (swap) {
        const oldTall = old.def.height / old.def.pixelsPerBlock * (old.scale ?? 1);
        origin = { x: old.origin.x, y: old.origin.y + oldTall / 2 - tall / 2, z: old.origin.z };
        yaw    = old.yaw;
        origin = liftClear(player.dimension, origin, yaw, wide, tall) ?? origin;
    } else {
        origin = clearSpotInFront(player, DISTANCE, MIN_DISTANCE, wide, tall, tall / 2 + 0.05);
        yaw    = yawToward(origin, player.location);
    }

    let entity;
    try {
        entity = player.dimension.spawnEntity(def.id, origin, { initialRotation: yaw });
    } catch {
        try { entity = player.dimension.spawnEntity(def.id, origin); } catch { return false; }
    }
    try { entity.setRotation({ x: 0, y: yaw }); } catch {}

    const quiet = swap && !centre && old.def.group === def.group;
    const slide = swap && !centre && !quiet ? (name === HOME_PANEL ? ENTER_BACK : ENTER_FORWARD) : 0;
    if (old) retire(old);
    if (slide) {
        try {
            old.entity.setProperty("eb:leave", slide);
            leaving.push({ entity: old.entity, removeAt: system.currentTick + LEAVE_TICKS });
        } catch { remove(old.entity); }
        try { entity.setProperty("eb:enter", slide); } catch {}
    } else {
        remove(old?.entity);
        if (quiet) {
            try { entity.setProperty("eb:quiet", true); } catch {}
        }
    }

    const panel = { name, def, screen, entity, origin, yaw, player, pinned, local, hover: 0, shutAt: null, slot: heldSlot(player), values: {},
        wanted: size, scale: scaleEntity(entity, size) };
    panels.set(player.id, panel);
    sync(player, panel);
    setCursor(player, panel);
    sound(player, quiet ? "click" : swap ? "swap" : "open");
    return true;
}

export function closePanel(playerId) {
    const panel = panels.get(playerId);
    if (!panel || panel.shutAt !== null) return;
    retire(panel);
    panel.shutAt = system.currentTick + SHUT_TICKS;
    sound(panel.player, "close");
    try { panel.entity.setProperty("eb:closing", true); } catch { removePanel(playerId); }
}

export function removePanel(playerId) {
    const panel = panels.get(playerId);
    if (panel) retire(panel);
    remove(panel?.entity);
    panels.delete(playerId);
    lastClick.delete(playerId);
    holding.delete(playerId);
}

export function panelClick(player) {
    const panel = panels.get(player.id);
    if (!panel) return false;
    if (panel.shutAt !== null || !isLive(panel.entity)) return true;

    const now = system.currentTick;
    if (now - (lastClick.get(player.id) ?? -100) < CLICK_COOLDOWN) return true;
    lastClick.set(player.id, now);

    const point  = aimPoint(player, panel);
    const target = targetOf(player, panel, point);
    if (target === 0 && (!point || !onPanel(panel, point))) {
        closePanel(player.id);
        return true;
    }
    setHover(player, panel, target);
    if (target === 0) return true;

    press(panel, target);
    panel.repeat = null;
    let result;
    try {
        const rect = panel.def.rects[target - 1];
        if (isTip(rect.id)) result = answerTip(player, rect.id);
        else result = panel.screen.click(player, rect.id, panel.local, { x: point.x - rect.x, y: point.y - rect.y }, 1);
        if (panel.screen.repeats?.(rect.id)) panel.repeat = { target, since: now, next: now + REPEAT_DELAY, count: 0 };
    } catch (e) {
        console.warn(`[EB] panel ${panel.name} click failed: ${e}`);
    }
    if (panels.get(player.id) !== panel || panel.shutAt !== null) return true;
    sound(player, typeof result === "string" ? result : "click");
    sync(player, panel);
    return true;
}

export function releasePanel(player) {
    const panel = panels.get(player.id);
    if (!panel || panel.shutAt !== null || !isLive(panel.entity)) return;
    const point  = aimPoint(player, panel);
    const target = targetOf(player, panel, point);
    if (target === 0) {
        closePanel(player.id);
        return;
    }
    press(panel, target);
    sound(player, "click");
    try {
        panel.screen.click(player, panel.def.rects[target - 1].id, panel.local, { x: 0, y: 0 });
    } catch (e) {
        console.warn(`[EB] panel ${panel.name} release failed: ${e}`);
    }
}

function sweepStrays() {
    const kept = new Set();
    for (const panel of panels.values()) {
        if (isLive(panel.entity)) kept.add(panel.entity.id);
    }
    for (const gone of leaving) {
        if (isLive(gone.entity)) kept.add(gone.entity.id);
    }
    for (const outside of externals.values()) {
        try { for (const id of outside.keep()) kept.add(id); } catch {}
    }
    for (const dimensionId of DIMENSIONS) {
        try {
            for (const entity of world.getDimension(dimensionId).getEntities({ families: ["eb_panel"] })) {
                if (!kept.has(entity.id)) entity.remove();
            }
        } catch {}
    }
}

export function startEntityPanels() {
    world.beforeEvents.playerInteractWithEntity.subscribe(ev => {
        if (!PANEL_TYPES.has(ev.target?.typeId)) return;
        ev.cancel = true;
        const player  = ev.player;
        const outside = externals.get(ev.target.typeId);
        system.run(() => outside ? outside.click(player) : panelClick(player));
    });

    world.afterEvents.entityHitEntity.subscribe(ev => {
        if (!PANEL_TYPES.has(ev.hitEntity?.typeId)) return;
        if (!(ev.damagingEntity instanceof Player)) return;
        const outside = externals.get(ev.hitEntity.typeId);
        if (outside) outside.click(ev.damagingEntity);
        else panelClick(ev.damagingEntity);
    });

    world.afterEvents.itemStartUse.subscribe(ev => holding.set(ev.source.id, system.currentTick));
    world.afterEvents.itemStopUse.subscribe(ev => holding.delete(ev.source.id));

    let ticks = 0;
    system.runInterval(() => {
        while (leaving.length > 0 && system.currentTick >= leaving[0].removeAt) remove(leaving.shift().entity);
        if (panels.size > 0) {
            const online = new Map(allPlayers().map(player => [player.id, player]));
            for (const [playerId, panel] of panels) {
                try {
                    const player = online.get(playerId);
                    if (!player || player.isValid !== true || !isLive(panel.entity) || player.dimension.id !== panel.entity.dimension.id) {
                        removePanel(playerId);
                        continue;
                    }
                    if (panel.shutAt !== null) {
                        if (system.currentTick >= panel.shutAt) removePanel(playerId);
                        continue;
                    }
                    const loc = player.location;
                    if ((!panel.pinned && heldSlot(player) !== panel.slot) || Math.hypot(loc.x - panel.origin.x, loc.z - panel.origin.z) > LEASH) {
                        closePanel(playerId);
                        continue;
                    }
                    if (ticks % SYNC_TICKS === 0) sync(player, panel);
                    setHover(player, panel, targetOf(player, panel, aimPoint(player, panel)));
                    setCursor(player, panel);
                    repeatClick(player, panel, system.currentTick);
                    if (ticks % TIP_TICKS === 0) showTip(player, panel);
                } catch {}
            }
        }
        if (ticks++ % SWEEP_TICKS === 0) sweepStrays();
    }, 1);
}
