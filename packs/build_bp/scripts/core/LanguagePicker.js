// @ts-nocheck
import { world, system, Player } from "@minecraft/server";
import { GUIDE_LANGUAGES } from "./GuideBookData.js";
import {
    PICKER_PIXELS_PER_BLOCK, PICKER_WIDTH, PICKER_HEIGHT, PICKER_TILES, PICKER_BUTTON, PICKER_CURSOR_LIFT,
} from "./LanguagePickerData.js";
import { setBookLanguage, getBookLanguage, hasBookLanguage, getCursor } from "./Settings.js";
import { spotInFront, yawToward } from "../utils/InFront.js";

const PICKER_ID      = "eb:language_picker";
const DISTANCE       = 2.7;
const MIN_DISTANCE   = 1.3;
const DROP           = PICKER_HEIGHT / PICKER_PIXELS_PER_BLOCK / 2 + 0.05;
const LEASH          = 5;
const SHUT_TICKS     = 7;
const CLICK_COOLDOWN = 4;
const AIM_MARGIN     = 2;
const SWEEP_TICKS    = 200;
const CAMERA_ABOVE_HEAD = 0.1;
const BUTTON_INDEX   = PICKER_TILES.length + 1;
const DIMENSIONS     = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

const pickers   = new Map();
const lastClick = new Map();

function isLive(entity) {
    try { return entity?.isValid === true; } catch { return false; }
}

function remove(entity) {
    try { if (isLive(entity)) entity.remove(); } catch {}
}

function inside(rect, x, y) {
    return x >= rect.x - AIM_MARGIN && x < rect.x + rect.w + AIM_MARGIN
        && y >= rect.y - AIM_MARGIN && y < rect.y + rect.h + AIM_MARGIN;
}

function aimPoint(player, picker, lift = 0) {
    const head = player.getHeadLocation();
    const view = player.getViewDirection();
    const rad  = picker.yaw * Math.PI / 180;
    const face = { x: -Math.sin(rad), z: Math.cos(rad) };
    const at   = isLive(picker.entity) ? picker.entity.location : picker.origin;
    const eyeY = head.y + CAMERA_ABOVE_HEAD;

    const toward = view.x * face.x + view.z * face.z;
    if (toward > -0.05) return null;
    const reach = ((at.x - head.x) * face.x + (at.z - head.z) * face.z + lift) / toward;
    if (reach <= 0 || reach > 8) return null;

    const hit   = { x: head.x + view.x * reach, y: eyeY + view.y * reach, z: head.z + view.z * reach };
    const right = (hit.x - at.x) * Math.cos(rad) + (hit.z - at.z) * Math.sin(rad);
    return {
        x: right * PICKER_PIXELS_PER_BLOCK + PICKER_WIDTH / 2,
        y: PICKER_HEIGHT - (hit.y - at.y) * PICKER_PIXELS_PER_BLOCK,
    };
}

function aimedAt(player, picker) {
    const point = aimPoint(player, picker);
    if (!point) return 0;
    const tile = PICKER_TILES.findIndex(rect => inside(rect, point.x, point.y));
    if (tile >= 0) return tile + 1;
    return inside(PICKER_BUTTON, point.x, point.y) ? BUTTON_INDEX : 0;
}

function setCursor(player, picker) {
    const point = getCursor(player) ? aimPoint(player, picker, PICKER_CURSOR_LIFT) : null;
    const aim   = Boolean(point) && point.x >= 0 && point.x <= PICKER_WIDTH && point.y >= 0 && point.y <= PICKER_HEIGHT;
    if (aim) {
        const cx = Math.round(point.x);
        const cy = Math.round(point.y);
        try {
            if (cx !== picker.cx) picker.entity.setProperty("eb:cx", cx);
            if (cy !== picker.cy) picker.entity.setProperty("eb:cy", cy);
        } catch {}
        picker.cx = cx;
        picker.cy = cy;
    }
    if (aim === picker.aim) return;
    picker.aim = aim;
    try { picker.entity.setProperty("eb:aim", aim); } catch {}
}

function clientLanguage(player) {
    let locale;
    try { locale = player.clientSystemInfo?.locale; } catch { return 0; }
    if (typeof locale !== "string") return 0;
    const code = locale.toLowerCase().split(/[_-]/)[0];
    return GUIDE_LANGUAGES.findIndex(language => language.id === code) + 1;
}

function sound(player, id, pitch, volume) {
    try { player.playSound(id, { pitch, volume }); } catch {}
}

function setHover(player, picker, hover) {
    if (hover === picker.hover) return;
    picker.hover = hover;
    try { picker.entity.setProperty("eb:hover", hover); } catch {}
    if (hover > 0 && (hover !== BUTTON_INDEX || picker.selected > 0)) sound(player, "random.click", 1.9, 0.2);
}

export function aimingAtPicker(player) {
    const picker = pickers.get(player.id);
    if (!picker || picker.shutAt !== null) return false;
    const point = aimPoint(player, picker);
    return Boolean(point) && point.x >= 0 && point.x <= PICKER_WIDTH && point.y >= 0 && point.y <= PICKER_HEIGHT;
}

export function hasPicker(playerId) {
    return pickers.has(playerId);
}

export function isPickerPinned(playerId) {
    return pickers.get(playerId)?.pinned === true;
}

export function openPicker(player, { pinned = false } = {}) {
    removePicker(player.id);
    const origin = spotInFront(player, DISTANCE, MIN_DISTANCE, DROP);
    const yaw    = yawToward(origin, player.location);
    let entity;
    try {
        entity = player.dimension.spawnEntity(PICKER_ID, origin, { initialRotation: yaw });
    } catch {
        try { entity = player.dimension.spawnEntity(PICKER_ID, origin); } catch { return; }
    }
    try { entity.setRotation({ x: 0, y: yaw }); } catch {}
    const selected = hasBookLanguage(player)
        ? GUIDE_LANGUAGES.findIndex(language => language.id === getBookLanguage(player)) + 1
        : clientLanguage(player);
    if (selected > 0) {
        try { entity.setProperty("eb:selected", selected); } catch {}
    }
    pickers.set(player.id, { entity, origin, yaw, hover: 0, selected, shutAt: null, pinned });
    sound(player, "item.book.put", 1.2, 0.6);
}

export function closePicker(playerId) {
    const picker = pickers.get(playerId);
    if (!picker || picker.shutAt !== null) return;
    picker.shutAt = system.currentTick + SHUT_TICKS;
    try { picker.entity.setProperty("eb:closing", true); } catch { removePicker(playerId); }
}

export function removePicker(playerId) {
    remove(pickers.get(playerId)?.entity);
    pickers.delete(playerId);
    lastClick.delete(playerId);
}

export function pickerClick(player) {
    const picker = pickers.get(player.id);
    if (!picker || picker.shutAt !== null || !isLive(picker.entity)) return;

    const now = system.currentTick;
    if (now - (lastClick.get(player.id) ?? -100) < CLICK_COOLDOWN) return;
    lastClick.set(player.id, now);

    const target = aimedAt(player, picker);
    setHover(player, picker, target);

    if (target >= 1 && target < BUTTON_INDEX) {
        if (picker.selected === target) return;
        picker.selected = target;
        try { picker.entity.setProperty("eb:selected", target); } catch {}
        sound(player, "random.click", 1.2, 0.7);
        return;
    }
    if (target !== BUTTON_INDEX) return;

    if (picker.selected === 0) {
        sound(player, "note.bass", 0.8, 0.5);
        return;
    }
    setBookLanguage(player, GUIDE_LANGUAGES[picker.selected - 1].id);
    sound(player, "random.orb", 1.1, 0.5);
    closePicker(player.id);
}

function sweepStrays() {
    const kept = new Set();
    for (const picker of pickers.values()) {
        if (isLive(picker.entity)) kept.add(picker.entity.id);
    }
    for (const dimensionId of DIMENSIONS) {
        try {
            for (const entity of world.getDimension(dimensionId).getEntities({ type: PICKER_ID })) {
                if (!kept.has(entity.id)) entity.remove();
            }
        } catch {}
    }
}

export function startLanguagePicker() {
    world.beforeEvents.playerInteractWithEntity.subscribe(ev => {
        if (ev.target?.typeId !== PICKER_ID) return;
        ev.cancel = true;
        const player = ev.player;
        system.run(() => pickerClick(player));
    });

    world.afterEvents.entityHitEntity.subscribe(ev => {
        if (ev.hitEntity?.typeId !== PICKER_ID) return;
        if (!(ev.damagingEntity instanceof Player)) return;
        pickerClick(ev.damagingEntity);
    });

    let ticks = 0;
    system.runInterval(() => {
        if (pickers.size > 0) {
            const online = new Map(world.getAllPlayers().map(player => [player.id, player]));
            for (const [playerId, picker] of pickers) {
                try {
                    const player = online.get(playerId);
                    if (!player || !isLive(picker.entity) || player.dimension.id !== picker.entity.dimension.id) {
                        removePicker(playerId);
                        continue;
                    }
                    if (picker.shutAt !== null) {
                        if (system.currentTick >= picker.shutAt) removePicker(playerId);
                        continue;
                    }
                    const loc = player.location;
                    if (Math.hypot(loc.x - picker.origin.x, loc.z - picker.origin.z) > LEASH) {
                        closePicker(playerId);
                        continue;
                    }
                    setHover(player, picker, aimedAt(player, picker));
                    setCursor(player, picker);
                } catch {}
            }
        }
        if (ticks++ % SWEEP_TICKS === 0) sweepStrays();
    }, 1);
}
