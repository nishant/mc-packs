// @ts-nocheck
import { world, system } from "@minecraft/server";
import { PANELS, COACH_STEPS, COACH_LESSONS, COACH_MARKER_ABOVE } from "./EntityPanelData.js";
import { aimPoint, updateCursor, openPanelName, closePanel, setCoaching, registerExternal } from "./EntityPanel.js";
import { getState, getMirrorState, getArrayState, getRadialState } from "./PlayerState.js";
import { getSimpleModes, getCursor, getAllowDestroy, getDestroyCreativeOnly, getPanelScale, getCoachSide } from "./Settings.js";
import { panelSound as sound, scaleEntity, panelLanguage } from "../utils/PanelSound.js";
import { isDiggingTool } from "./BlockDestroyer.js";
import { isCreative } from "../utils/InventoryUtils.js";
import { getPaletteMode, getDistributionMode } from "./Palette.js";
import { getModeOption } from "../utils/ModeOptions.js";
import { usesFloatingUI } from "../utils/CustomUI.js";
import { isBook, isTutorialBook, heldItem, allPlayers } from "../utils/Items.js";
import { eventCount, clearCoachEvents } from "../utils/CoachEvents.js";
import { getWheelLayout } from "../utils/QuickWheel.js";
import { spotBeside, liftClear, yawToward } from "../utils/InFront.js";
import {
    lineBetween, floorRect, hollowCircleXZ, shellSphere, hollowCylinder, hollowCone, hollowArch, diagonalWall, slopeFloor, boxEdges,
} from "../utils/GeometryUtils.js";
import { t } from "../utils/Text.js";

const CARD          = PANELS.coach;
const MARKER_ID     = "eb:coach_marker";
const DISTANCE      = 2.5;
const MIN_DISTANCE  = 1.2;
const ANGLE         = 30;
const RAISE         = 0.2;
const LEASH         = 9;
const VIEW_COS      = 0.5;
const MOVE_COOLDOWN = 12;
const SHUT_TICKS    = 6;
const DWELL_TICKS   = 10;
const STAMP_TICKS   = 16;
const FINISH_TICKS  = 50;
const STUCK_TICKS   = 600;
const CLICK_COOLDOWN = 4;
const GUARD_TICKS   = 8;
const MARKER_TURN   = 1.5;
const FRAME_AHEAD   = 3;
const GHOST_TICKS   = 8;
const GHOST_CAP     = 160;
const GHOST_PARTICLE = "eb:coach_ghost";
const SWEEP_TICKS   = 200;
const COUNTER_STEPS = 8;
const DP_STEP       = "eb:coachStep";
const DP_DONE       = "eb:coachDone";
const DP_LESSONS    = "eb:coachLessons";
const EVENTS        = ["placed", "undo", "redo", "wheel"];
const DIMENSIONS    = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

const coaches = new Map();
const fading  = [];
const touched = new Map();
const GO_TILE = CARD.rects.findIndex(rect => rect.id === "go") + 1;
let openMenu    = null;
let openLessons = null;

export function setCoachMenuOpener(opener) {
    openMenu = opener;
}

export function setCoachLessonsOpener(opener) {
    openLessons = opener;
}

const mode      = player => getState(player).mode || "disable";
const floating  = player => usesFloatingUI(player);
const panelIs   = (player, name) => openPanelName(player.id) === name;
const since     = name => (player, was) => eventCount(player.id, name) > was[name];
const picked    = id => player => mode(player) === id;

function holdsBlock(player) {
    const item = heldItem(player);
    return Boolean(item) && !isBook(item) && !isTutorialBook(item);
}

function wheelKey(player) {
    return JSON.stringify(getWheelLayout(player));
}

function canBreak(player) {
    return getAllowDestroy() && (!getDestroyCreativeOnly() || isCreative(player));
}

const CONDITIONS = {
    creative:    player => isCreative(player),
    survival:    player => !isCreative(player),
    breaking:    canBreak,
    no_breaking: player => !canBreak(player),
    floating:    player => floating(player),
};

function applies(player, step) {
    if (!step.only) return true;
    try { return Boolean(CONDITIONS[step.only](player)); } catch { return true; }
}

function nextStep(player, from) {
    let index = from;
    while (index < COACH_STEPS.length && !applies(player, COACH_STEPS[index])) index++;
    return index;
}

const RULES = {
    welcome:         {},
    hold_book:       { done: player => isBook(heldItem(player)) },
    open_menu:       { done: player => !floating(player) || panelIs(player, "menu") },
    pick_line:       { done: picked("line") },
    hold_block:      { done: holdsBlock },
    line_start:      { done: player => Boolean(getState(player).anchor), frame: "player", marks: [[1, 0, 0]] },
    line_end:        { done: since("placed"), frame: "anchor", marks: [[2, 4, 0]], ghost: f => lineBetween(f.base, at(f, 4, 0, 0)) },
    pick_wall:       { done: picked("wall") },
    wall_build:      { done: since("placed"), frame: "player", marks: [[1, 0, 0], [2, 0, 4]], ghost: f => edges(f.base, at(f, 0, 4, 2)) },
    pick_floor:      { done: picked("floor") },
    floor_build:     { done: since("placed"), frame: "player", marks: [[1, 0, 0], [2, 3, 3]], ghost: f => floorRect(f.base, at(f, 3, 3, 0)) },
    pick_cube:       { done: picked("cube") },
    cube_hollow:     { done: player => getModeOption(player, "cube", "fill") === "hollow" },
    cube_base1:      { done: player => Boolean(getState(player).anchor), frame: "player", marks: [[1, 0, 0]] },
    cube_base2:      { done: player => Boolean(getState(player).secondAnchor), frame: "anchor", marks: [[2, 3, 3]],
                       ghost: f => edges(f.base, at(f, 3, 3, 0)) },
    cube_height:     { done: since("placed"), frame: "anchor", ghost: (f, player) => {
        const second = getState(player).secondAnchor;
        return second ? edges(f.base, { x: second.x, y: f.base.y + 3, z: second.z }) : [];
    } },
    undo:            { done: since("undo") },
    redo:            { done: since("redo") },
    undo_survival:   {},
    pick_sphere:     { done: picked("sphere") },
    sphere_build:    { done: since("placed"), frame: "player", marks: [[1, 2, 0], [2, 5, 0]], ghost: f => shellSphere(at(f, 2, 0, 0), at(f, 5, 0, 0)) },
    pick_cylinder:   { done: picked("cylinder") },
    cylinder_build:  { done: since("placed"), frame: "player", marks: [[1, 2, 0], [2, 4, 0]], ghost: f => hollowCylinder(at(f, 2, 0, 0), at(f, 4, 0, 3)) },
    pick_cone:       { done: picked("cone") },
    cone_build:      { done: since("placed"), frame: "player", marks: [[1, 2, 0], [2, 5, 0]], ghost: f => hollowCone(at(f, 2, 0, 0), at(f, 5, 0, 4)) },
    pick_semicircle: { done: picked("semicircle") },
    semicircle_arch: { done: player => getModeOption(player, "semicircle", "orientation") === "arch" },
    semicircle_build: { done: since("placed"), frame: "player", marks: [[1, 2, 0], [2, 2, 3]], ghost: f => {
        const centre = at(f, 2, 0, 0);
        return hollowArch(centre.x, centre.y, centre.z, 3, f.ahead.z !== 0);
    } },
    pick_diagonal_line:  { done: picked("diagonal_line") },
    diagonal_line_build: { done: since("placed"), frame: "player", marks: [[1, 0, 0]], ghost: f => lineBetween(f.base, at(f, 5, 2, 3)) },
    pick_diagonal_wall:  { done: picked("diagonal_wall") },
    diagonal_wall_build: { done: since("placed"), frame: "player", marks: [[1, 0, 0], [2, 4, 2]], ghost: f => diagonalWall(f.base, at(f, 4, 2, 3)) },
    pick_slope_floor:    { done: picked("slope_floor") },
    slope_floor_build:   { done: since("placed"), frame: "player", marks: [[1, 0, 0], [2, 4, 3]],
                           ghost: (f, player) => slopeFloor(f.base, at(f, 4, 3, 2), player.getRotation().y) },
    pick_air:        { done: picked("air_build") },
    air_place:       { done: since("placed") },
    break_pick:      { done: picked("floor") },
    break_tool:      { done: player => isDiggingTool(heldItem(player)?.typeId) },
    break_start:     { done: player => Boolean(getState(player).anchor) && getState(player).blockTypeId === "eb:destroy" },
    break_end:       { done: since("placed") },
    break_off:       {},
    array_on:        { done: player => Boolean(getArrayState(player).enabled) },
    array_build:     { done: since("placed") },
    array_off:       { done: player => !getArrayState(player).enabled },
    radial_on:       { done: player => Boolean(getRadialState(player).enabled) },
    radial_build:    { done: since("placed") },
    radial_off:      { done: player => !getRadialState(player).enabled },
    more_modes:      { done: player => !getSimpleModes(player) },
    pick_circle:     { done: picked("circle") },
    circle_build:    { done: since("placed"), frame: "player", marks: [[1, 2, 0], [2, 5, 0]], ghost: f => {
        const centre = at(f, 2, 0, 0);
        return hollowCircleXZ(centre.x, centre.y, centre.z, 3);
    } },
    open_palette:    { done: player => !floating(player) || panelIs(player, "palette") },
    palette_hotbar:  { done: player => getPaletteMode(player) !== "disable" },
    palette_pattern: { done: (player, was) => getDistributionMode(player) !== was.pattern },
    palette_build:   { done: since("placed") },
    palette_off:     { done: player => getPaletteMode(player) === "disable" },
    open_modifiers:  { done: player => !floating(player) || panelIs(player, "modifiers") },
    mirror_on:       { done: player => Boolean(getMirrorState(player).enabled) },
    mirror_build:    { done: since("placed") },
    mirror_off:      { done: player => !getMirrorState(player).enabled },
    pick_copy:       { done: picked("copy_paste") },
    copy_corner1:    { done: player => Boolean(getState(player).anchor) },
    copy_corner2:    { done: player => Boolean(getState(player).secondAnchor) },
    copy_height:     { done: player => panelIs(player, "copycut") || Boolean(getState(player).clipboard) },
    copy_choose:     { done: player => Boolean(getState(player).clipboard) },
    paste:           { done: (player, was) => (getState(player).lastPasteAt ?? 0) > was.pasteAt },
    wheel_open:      { done: player => panelIs(player, "ring") },
    wheel_pick:      { done: since("wheel") },
    wheel_customize: { done: player => panelIs(player, "wheel") },
    wheel_slot:      { done: (player, was) => wheelKey(player) !== was.wheel },
    finish:          {},
};

export const COACH_RULE_IDS = Object.keys(RULES);

function isLive(entity) {
    try { return entity?.isValid === true; } catch { return false; }
}

function fade(entity) {
    if (!isLive(entity)) return;
    try { entity.setProperty("eb:closing", true); } catch {}
    fading.push({ entity, removeAt: system.currentTick + SHUT_TICKS });
}

function snapshot(player) {
    const was = { pattern: getDistributionMode(player), pasteAt: getState(player).lastPasteAt ?? 0, wheel: wheelKey(player) };
    for (const name of EVENTS) was[name] = eventCount(player.id, name);
    return was;
}

function cardProps(coach) {
    const card = coach.card;
    if (!card || !isLive(card.entity)) return;
    const step = COACH_STEPS[coach.index];
    try {
        card.entity.setProperty("eb:lang", panelLanguage(coach.player));
        card.entity.setProperty("eb:step", coach.index);
        card.entity.setProperty("eb:info", step.info);
        card.entity.setProperty("eb:okn", coach.okn);
        card.entity.setProperty("eb:toastn", coach.toastn);
        card.entity.setProperty("eb:fin", coach.finished);
        card.entity.setProperty("eb:stuck", Boolean(coach.stuck));
        card.entity.setProperty("eb:go", step.go && !coach.finished);
        card.entity.setProperty("eb:spot", step.go && !coach.finished ? GO_TILE : 0);
    } catch {}
}

function cardInView(coach) {
    const card = coach.card;
    if (!card || !isLive(card.entity)) return false;
    const player = coach.player;
    const head = player.getHeadLocation();
    const view = player.getViewDirection();
    const tall = CARD.height / CARD.pixelsPerBlock * card.scale;
    const to   = { x: card.centre.x - head.x, y: card.centre.y + tall / 2 - head.y, z: card.centre.z - head.z };
    const far  = Math.hypot(to.x, to.y, to.z);
    if (far > LEASH) return false;
    return (to.x * view.x + to.y * view.y + to.z * view.z) / Math.max(far, 0.001) >= VIEW_COS;
}

function showCard(coach) {
    const player = coach.player;
    const size   = getPanelScale(player);
    const side   = getCoachSide(player);
    const tall   = CARD.height / CARD.pixelsPerBlock * size;
    const beside = spotBeside(player, DISTANCE, side === "left" ? -ANGLE : ANGLE, MIN_DISTANCE, tall / 2 - RAISE);
    const yaw    = yawToward(beside, player.location);
    const centre = liftClear(player.dimension, beside, yaw, CARD.width / CARD.pixelsPerBlock * size, tall) ?? beside;
    const rad    = yaw * Math.PI / 180;
    const aside  = (CARD.originX - CARD.width / 2) / CARD.pixelsPerBlock * size;
    const origin = { x: centre.x + Math.cos(rad) * aside, y: centre.y, z: centre.z + Math.sin(rad) * aside };
    let entity;
    try {
        entity = player.dimension.spawnEntity(CARD.id, origin, { initialRotation: yaw });
    } catch {
        try { entity = player.dimension.spawnEntity(CARD.id, origin); } catch { return; }
    }
    try { entity.setRotation({ x: 0, y: yaw }); } catch {}
    coach.card = { entity, origin, centre, yaw, def: CARD, hover: 0, cursor: getCursor(player), values: { tip: false },
        wanted: size, scale: scaleEntity(entity, size), side };
    coach.movedAt = system.currentTick;
    cardProps(coach);
    sound(player, "open");
}

function hideCard(coach) {
    if (!coach.card) return;
    fade(coach.card.entity);
    coach.card = null;
}

function cardinal(view) {
    return Math.abs(view.x) > Math.abs(view.z) ? { x: Math.sign(view.x) || 1, z: 0 } : { x: 0, z: Math.sign(view.z) || 1 };
}

function groundAt(dimension, x, from, z) {
    for (let y = from + 2; y >= from - 3; y--) {
        try {
            const block = dimension.getBlock({ x, y, z });
            const above = dimension.getBlock({ x, y: y + 1, z });
            if (block && !block.isAir && above?.isAir) return y;
        } catch { return null; }
    }
    return null;
}

function frameFor(coach, kind) {
    const player = coach.player;
    const ahead  = cardinal(player.getViewDirection());
    const side   = { x: -ahead.z, z: ahead.x };
    if (kind === "anchor") {
        const anchor = getState(player).anchor;
        return anchor ? { base: { x: anchor.x, y: anchor.y, z: anchor.z }, ahead, side } : null;
    }
    const loc = player.location;
    const x   = Math.floor(loc.x) + ahead.x * FRAME_AHEAD;
    const z   = Math.floor(loc.z) + ahead.z * FRAME_AHEAD;
    const y   = groundAt(player.dimension, x, Math.floor(loc.y) - 1, z);
    return y === null ? null : { base: { x, y: y + 1, z }, ahead, side };
}

function at(frame, ahead, side, up) {
    return {
        x: frame.base.x + frame.ahead.x * ahead + frame.side.x * side,
        y: frame.base.y + up,
        z: frame.base.z + frame.ahead.z * ahead + frame.side.z * side,
    };
}

function edges(a, b) {
    return boxEdges(Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y), Math.min(a.z, b.z), Math.max(a.z, b.z));
}

function placeMarker(coach, frame, [n, ahead, side]) {
    const player = coach.player;
    const spot   = at(frame, ahead, side, 0);
    const y      = groundAt(player.dimension, spot.x, frame.base.y - 1, spot.z);
    if (y === null) return;
    const where = { x: spot.x + 0.5, y: y + 1 + COACH_MARKER_ABOVE, z: spot.z + 0.5 };
    const yaw   = yawToward(where, player.location);
    let entity;
    try {
        entity = player.dimension.spawnEntity(MARKER_ID, where, { initialRotation: yaw });
    } catch {
        try { entity = player.dimension.spawnEntity(MARKER_ID, where); } catch { return; }
    }
    try {
        entity.setRotation({ x: 0, y: yaw });
        entity.setProperty("eb:n", n);
    } catch {}
    coach.markers.push(entity);
    coach.markerYaws.set(entity.id, yaw);
}

function drawGhost(coach) {
    const player = coach.player;
    const spawn  = typeof player.spawnParticle === "function"
        ? where => player.spawnParticle(GHOST_PARTICLE, where)
        : where => player.dimension.spawnParticle(GHOST_PARTICLE, where);
    for (const spot of coach.ghost) {
        try { spawn({ x: spot.x + 0.5, y: spot.y + 0.5, z: spot.z + 0.5 }); } catch {}
    }
}

function faceMarkers(coach) {
    for (const entity of coach.markers) {
        if (!isLive(entity)) continue;
        const yaw  = yawToward(entity.location, coach.player.location);
        const was  = coach.markerYaws.get(entity.id) ?? 1000;
        const turn = Math.abs(((yaw - was + 540) % 360) - 180);
        if (turn < MARKER_TURN) continue;
        coach.markerYaws.set(entity.id, yaw);
        try { entity.setRotation({ x: 0, y: yaw }); } catch {}
    }
}

function clearMarkers(coach) {
    for (const entity of coach.markers) fade(entity);
    coach.markers = [];
    coach.markerYaws.clear();
}

function save(coach) {
    try { coach.player.setDynamicProperty(DP_STEP, coach.index); } catch {}
}

function begin(coach) {
    const step = COACH_STEPS[coach.index];
    const rule = RULES[step.id] ?? {};
    coach.was     = snapshot(coach.player);
    coach.begunAt = system.currentTick;
    coach.doneAt  = null;
    coach.stuck   = false;
    if (step.lesson !== coach.lesson) {
        coach.lesson  = step.lesson;
        coach.skipped = false;
    }
    clearMarkers(coach);
    coach.ghost = [];
    const frame = rule.frame ? frameFor(coach, rule.frame) : null;
    if (frame) {
        for (const mark of rule.marks ?? []) placeMarker(coach, frame, mark);
        if (rule.ghost) {
            let shape = [];
            try { shape = rule.ghost(frame, coach.player) ?? []; } catch {}
            const every = Math.ceil(shape.length / GHOST_CAP);
            coach.ghost = every > 1 ? shape.filter((_, i) => i % every === 0) : shape;
        }
    }
    setCoaching(coach.player.id, { step: coach.index + 1, spot: step.spot });
    save(coach);
    if (coach.card && !cardInView(coach)) hideCard(coach);
    cardProps(coach);
}

function complete(coach) {
    coach.doneAt = system.currentTick;
    coach.okn = (coach.okn + 1) % COUNTER_STEPS;
    cardProps(coach);
    sound(coach.player, "done");
}

function lessonsDone(player) {
    try {
        const saved = player.getDynamicProperty(DP_LESSONS);
        return typeof saved === "number" ? Math.floor(saved) : 0;
    } catch { return 0; }
}

function tickLesson(coach, lesson) {
    if (coach.skipped) return;
    const done = lessonsDone(coach.player);
    if (Math.floor(done / 2 ** lesson) % 2 === 1) return;
    try { coach.player.setDynamicProperty(DP_LESSONS, done + 2 ** lesson); } catch {}
}

function closeSpentPanel(coach, next) {
    const panel = openPanelName(coach.player.id);
    const uses  = PANELS[panel]?.banners;
    if (!uses?.includes(coach.index + 1) || uses.includes(next + 1)) return;
    closePanel(coach.player.id);
}

function advance(coach) {
    const lesson = COACH_STEPS[coach.index].lesson;
    const next   = nextStep(coach.player, coach.index + 1);
    closeSpentPanel(coach, next);
    if (next >= COACH_STEPS.length) {
        tickLesson(coach, lesson);
        finish(coach);
        return;
    }
    coach.index = next;
    if (COACH_STEPS[next].lesson !== lesson) {
        tickLesson(coach, lesson);
        coach.toastn = (coach.toastn + 1) % COUNTER_STEPS;
        sound(coach.player, "lesson");
    }
    begin(coach);
}

export function coachGhost(playerId) {
    return coaches.get(playerId)?.ghost ?? [];
}

export function coachProgress(player) {
    const coach = coaches.get(player.id);
    return { done: lessonsDone(player), now: coach && !coach.finished ? COACH_STEPS[coach.index].lesson + 1 : 0 };
}

function finish(coach) {
    const player = coach.player;
    coach.finished = true;
    coach.toastn   = (coach.toastn + 1) % COUNTER_STEPS;
    coach.endAt    = system.currentTick + FINISH_TICKS;
    cardProps(coach);
    clearMarkers(coach);
    coach.ghost = [];
    setCoaching(player.id, null);
    sound(player, "lesson");
    try {
        player.setDynamicProperty(DP_DONE, true);
        player.setDynamicProperty(DP_STEP, 0);
        player.sendMessage(t("eb.coach.done"));
    } catch {}
}

function drop(playerId) {
    const coach = coaches.get(playerId);
    if (!coach) return;
    hideCard(coach);
    clearMarkers(coach);
    setCoaching(playerId, null);
    coaches.delete(playerId);
}

export function isCoaching(playerId) {
    return coaches.has(playerId);
}

export function coachStep(playerId) {
    const coach = coaches.get(playerId);
    return coach ? COACH_STEPS[coach.index].id : null;
}

export function startCoach(player, { restart = false, lesson = null } = {}) {
    drop(player.id);
    let index = 0;
    if (lesson !== null && COACH_LESSONS[lesson]) {
        index = COACH_LESSONS[lesson].first;
    } else if (!restart) {
        try {
            const saved = player.getDynamicProperty(DP_STEP);
            if (typeof saved === "number" && saved > 0 && saved < COACH_STEPS.length) index = Math.floor(saved);
        } catch {}
    }
    index = nextStep(player, index);
    if (index >= COACH_STEPS.length) index = COACH_STEPS.length - 1;
    const coach = { player, index, lesson: -1, skipped: false, stuck: false, card: null, ghost: [], markers: [], markerYaws: new Map(), okn: 0, toastn: 0, finished: false, endAt: null, movedAt: -100, clickAt: -100 };
    coaches.set(player.id, coach);
    begin(coach);
    try { player.sendMessage(t("eb.coach.started")); } catch {}
}

export function stopCoach(player, quiet = false) {
    if (!coaches.has(player.id)) return;
    drop(player.id);
    sound(player, "close");
    if (!quiet) {
        try { player.sendMessage(t("eb.coach.stopped")); } catch {}
    }
}

export function toggleCoach(player) {
    if (coaches.has(player.id)) stopCoach(player);
    else startCoach(player);
}

export function cleanupCoach(playerId) {
    drop(playerId);
    clearCoachEvents(playerId);
    touched.delete(playerId);
}

export function coachGuards(player) {
    const coach = coaches.get(player.id);
    if (coach && aimedTile(coach)) {
        touched.set(player.id, system.currentTick);
        return true;
    }
    return system.currentTick - (touched.get(player.id) ?? -100) <= GUARD_TICKS;
}

function aimedTile(coach) {
    const card = coach.card;
    if (!card || !isLive(card.entity)) return null;
    const point = aimPoint(coach.player, card);
    if (!point || point.x < 0 || point.x > CARD.width || point.y < 0 || point.y > CARD.height) return null;
    const going = COACH_STEPS[coach.index].go && !coach.finished;
    const index = CARD.rects.findIndex(rect => (rect.id !== "go" || going)
        && point.x >= rect.x && point.x < rect.x + rect.w && point.y >= rect.y && point.y < rect.y + rect.h);
    return { index: index + 1, id: index < 0 ? null : CARD.rects[index].id };
}

export function aimingAtCoach(player) {
    const coach = coaches.get(player.id);
    return Boolean(coach && aimedTile(coach));
}

export function coachAimed(player) {
    const coach = coaches.get(player.id);
    return Boolean(coach && aimedTile(coach)?.id);
}

export function coachClick(player, onButtonOnly = false) {
    const coach = coaches.get(player.id);
    if (!coach) return false;
    const aimed = aimedTile(coach);
    if (!aimed || (onButtonOnly && !aimed.id)) return false;
    touched.set(player.id, system.currentTick);
    if (!aimed.id) return true;

    const now = system.currentTick;
    if (now - coach.clickAt < CLICK_COOLDOWN) return true;
    coach.clickAt = now;
    try {
        coach.card.entity.setProperty("eb:press", aimed.index);
        coach.card.entity.setProperty("eb:pressn", (coach.pressed = ((coach.pressed ?? 0) + 1) % COUNTER_STEPS));
    } catch {}
    sound(player, "click");

    if (aimed.id === "close") {
        stopCoach(player);
    } else if (aimed.id === "go") {
        try { openMenu?.(player); } catch (e) { console.warn(`[EB] coach could not open the menu: ${e}`); }
    } else if (aimed.id === "lessons") {
        try { openLessons?.(player); } catch (e) { console.warn(`[EB] coach could not open the lessons: ${e}`); }
    } else if (coach.finished || coach.doneAt !== null) {
        return true;
    } else if (COACH_STEPS[coach.index].info) {
        complete(coach);
    } else {
        coach.skipped = true;
        advance(coach);
    }
    return true;
}

function tickCoach(coach, tick) {
    const player = coach.player;
    if (coach.finished) {
        if (tick >= coach.endAt) drop(player.id);
        return;
    }
    faceMarkers(coach);
    const panel    = openPanelName(player.id);
    const bannered = panel !== null && PANELS[panel]?.banners?.includes(coach.index + 1);
    if (bannered || panel === "lessons") {
        hideCard(coach);
    } else if (!coach.card || !isLive(coach.card.entity)) {
        coach.card = null;
        if (tick - coach.movedAt >= MOVE_COOLDOWN) showCard(coach);
    } else {
        const card = coach.card;
        const loc  = player.location;
        if (Math.hypot(loc.x - card.origin.x, loc.z - card.origin.z) > LEASH || player.dimension.id !== card.entity.dimension.id
            || card.wanted !== getPanelScale(player) || card.side !== getCoachSide(player)) {
            hideCard(coach);
        } else {
            const aimed = aimedTile(coach);
            const hover = aimed?.index ?? 0;
            if (hover !== card.hover) {
                card.hover = hover;
                try { card.entity.setProperty("eb:hover", hover); } catch {}
                if (hover > 0) sound(player, "hover");
            }
            updateCursor(player, card);
        }
    }

    if (coach.doneAt !== null) {
        if (tick >= coach.doneAt + STAMP_TICKS) advance(coach);
        return;
    }
    if (coach.ghost.length > 0 && (tick - coach.begunAt) % GHOST_TICKS === 0) drawGhost(coach);
    const step = COACH_STEPS[coach.index];
    const done = RULES[step.id]?.done;
    if (step.info || !done || tick - coach.begunAt < DWELL_TICKS) return;
    if (!coach.stuck && step.hint && tick - coach.begunAt >= STUCK_TICKS) {
        coach.stuck = true;
        cardProps(coach);
        sound(player, "hint");
    }
    let passed = false;
    try { passed = Boolean(done(player, coach.was)); } catch {}
    if (passed) complete(coach);
}

function sweepStrays() {
    const kept = new Set();
    for (const coach of coaches.values()) {
        if (coach.card && isLive(coach.card.entity)) kept.add(coach.card.entity.id);
        for (const entity of coach.markers) if (isLive(entity)) kept.add(entity.id);
    }
    for (const gone of fading) if (isLive(gone.entity)) kept.add(gone.entity.id);
    for (const dimensionId of DIMENSIONS) {
        for (const type of [CARD.id, MARKER_ID]) {
            try {
                for (const entity of world.getDimension(dimensionId).getEntities({ type })) {
                    if (!kept.has(entity.id)) entity.remove();
                }
            } catch {}
        }
    }
}

export function startCoachLoop() {
    registerExternal(CARD.id, {
        click: player => coachClick(player),
        keep: () => [...coaches.values()].map(coach => coach.card?.entity).concat(fading.map(gone => gone.entity)).filter(isLive).map(entity => entity.id),
    });

    let ticks = 0;
    system.runInterval(() => {
        const tick = system.currentTick;
        while (fading.length > 0 && tick >= fading[0].removeAt) {
            const gone = fading.shift();
            try { if (isLive(gone.entity)) gone.entity.remove(); } catch {}
        }
        if (coaches.size > 0) {
            const online = new Map(allPlayers().map(player => [player.id, player]));
            for (const [playerId, coach] of coaches) {
                const player = online.get(playerId);
                if (!player) { drop(playerId); continue; }
                coach.player = player;
                try { tickCoach(coach, tick); } catch (e) { console.warn(`[EB] coach failed: ${e}`); }
            }
        }
        if (ticks++ % SWEEP_TICKS === 0) sweepStrays();
    }, 1);
}
