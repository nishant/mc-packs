// @ts-nocheck
import { markHolderDirty } from "../utils/tool-gate.js";
const states = new Map();
/** player id -> player, for those with a build anchor (the FOV zoom loop walks only these) */
const anchored = new Map();

const MODIFIER_KEY = "eb:modifiers";

function defaultModifiers() {
    return {
        mirror: { enabled: false, x: 0, y: 64, z: 0, axisX: true, axisY: false, axisZ: false, radius: 32, odd: false },
        array:  { enabled: false, ox: 1, oy: 0, oz: 0, count: 3 },
        radial: { enabled: false, x: 0, y: 64, z: 0, slices: 4, radius: 32, alternate: false },
    };
}

function loadModifiers(player) {
    try {
        const raw = player.getDynamicProperty(MODIFIER_KEY);
        if (typeof raw === "string") {
            const saved = JSON.parse(raw);
            const def   = defaultModifiers();
            return {
                mirror: { ...def.mirror, ...(saved.mirror ?? {}) },
                array:  { ...def.array,  ...(saved.array  ?? {}) },
                radial: { ...def.radial, ...(saved.radial ?? {}) },
            };
        }
    } catch {}
    return defaultModifiers();
}

function saveModifiers(player) {
    try {
        player.setDynamicProperty(MODIFIER_KEY, JSON.stringify(getState(player).modifiers));
    } catch {}
    markHolderDirty(player.id);
}

function defaultState() {
    return {
        mode: "disable",
        anchor: null, secondAnchor: null,
        blockTypeId: null, blockStates: {},
        clipboard: null, lastPasteAt: 0,
        waypoints: [],
        modifiers: defaultModifiers(),
    };
}
export function getState(player) {
    if (!states.has(player.id)) {
        const s = defaultState();
        s.modifiers = loadModifiers(player);
        states.set(player.id, s);
    }
    return states.get(player.id);
}
export function setMode(player, mode) {
    const s = getState(player);
    if (s.mode !== mode) {
        s.mode         = mode;
        s.anchor       = null;
        s.secondAnchor = null;
        s.blockTypeId  = null;
        s.waypoints    = [];
        anchored.delete(player.id);

    }
    markHolderDirty(player.id);
}
export function clearClipboard(player) {
    getState(player).clipboard = null;
}
export function setAnchor(player, location, typeId, blockStates) {
    const s = getState(player);
    s.anchor = { x: location.x, y: location.y, z: location.z, dimensionId: player.dimension.id };
    s.blockTypeId = typeId;
    s.blockStates = blockStates ?? {};
    anchored.set(player.id, player);
    markHolderDirty(player.id);
}
export function setSecondAnchor(player, location) {
    const s = getState(player);
    s.secondAnchor = { x: location.x, y: location.y, z: location.z };
}
export function clearAnchor(player) {
    const s = getState(player);
    s.anchor       = null;
    s.secondAnchor = null;
    s.blockTypeId  = null;
    s.blockStates  = {};
    s.waypoints    = [];
    anchored.delete(player.id);
    markHolderDirty(player.id);
}
export function addWaypoint(player, location) {
    const s = getState(player);
    s.waypoints.push({ x: Math.round(location.x), y: Math.round(location.y), z: Math.round(location.z) });
}
export function getWaypoints(player) {
    return getState(player).waypoints;
}
export function removeState(playerId) {
    states.delete(playerId);
    anchored.delete(playerId);
}
/** Players with a build anchor right now (id -> player). */
export function anchoredPlayers() {
    return anchored;
}

export function getModifiers(player) {
    return getState(player).modifiers;
}
export function getMirrorState(player)  { return getModifiers(player).mirror; }
export function getArrayState(player)   { return getModifiers(player).array; }
export function getRadialState(player)  { return getModifiers(player).radial; }
export function setMirrorState(player, updates)  { Object.assign(getMirrorState(player), updates);  saveModifiers(player); }
export function setArrayState(player, updates)   { Object.assign(getArrayState(player),  updates);  saveModifiers(player); }
export function setRadialState(player, updates)  { Object.assign(getRadialState(player), updates);  saveModifiers(player); }
export function anyModifierEnabled(player) {
    const m = getModifiers(player);
    return m.mirror.enabled || m.array.enabled || m.radial.enabled;
}
