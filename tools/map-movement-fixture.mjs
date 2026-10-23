import {selectNetherLayer} from "../packs/map_bp/scripts/nether-layer.js";
import {RADAR_PIXELS,snapshotCoverage,rasterCadenceReady} from "../packs/map_bp/scripts/raster-work.js";
import {reconstructRaster} from "../packs/map_bp/scripts/terrain-estimate.js";
import {rollTerrainDemand} from "../packs/map_bp/scripts/rolling-demand.js";
import { ManualScanner } from "../packs/map_bp/scripts/manual-scanner.js";
import { MAP_PROFILE } from "../packs/map_bp/scripts/map-profile.js";
import * as terrainWork from "../packs/map_bp/scripts/terrain-work.js";
// Exact Sharp4 old-scheduler vs optimized Sharp4 production modules and actual Sidewire.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { Budget, oldestDue } from "../packs/map_bp/scripts/budget.js";
import { CONFIG } from "../packs/map_bp/scripts/config.js";
import { G, overlayGlyph, SELF_ARROWS, estimatedPaletteGlyph } from "../packs/map_bp/scripts/glyphs.js";
import * as terrainAPI from "../packs/map_bp/scripts/terrain.js";
import * as resetAPI from "../packs/map_bp/scripts/reset.js";
import { DetailPersistence, isDetailStore } from "../packs/map_bp/scripts/detail-persistence.js";
import { orderTerrainWork, CatchupWindow, FeatureEnvelope, SCAN_POLICY } from "../packs/map_bp/scripts/scan-policy.js";
import { PreviewPersistence } from "../packs/map_bp/scripts/preview-persistence.js";
import { ResidentTrace } from "../packs/map_bp/scripts/resident-trace.js";
import { createStatePacketizer, createStateReassembler, MAX_EVENT_BYTES } from "../packs/map_bp/scripts/map-debug-state.js";
export const main = fs.readFileSync(new URL("../packs/map_bp/scripts/main.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const sideSource = fs.readFileSync(new URL("../packs/map_bp/scripts/side.js", import.meta.url), "utf8").replace(/^import .+;\r?\n/gm, "").replace(/^export /gm, "");
export const plain = value => JSON.parse(JSON.stringify(value));
export function countedPlayer(id = "p") {
    const reads = { valid: 0, dimension: 0, location: 0, rotation: 0, velocity: 0 };
    const state = { valid: true, dim: { id: "minecraft:overworld" }, at: { x: 0.2, y: 64, z: -0.2 }, yaw: 0, velocity: { x: 0, y: 0, z: 0 } };
    return { id, reads, state,
        get isValid() { reads.valid++; return state.valid; },
        get dimension() { reads.dimension++; return state.dim; },
        get location() { reads.location++; return state.at; },
        getRotation() { reads.rotation++; return { x: 0, y: state.yaw }; },
        getVelocity() { reads.velocity++; return state.velocity; },
        getTags: () => ["realm_party:one"], getSpawnPoint: () => undefined,
        getDynamicProperty: key => key === "map:radarOffReset20261022" ? true : undefined, /* legacy-ON fixtures are already past the one-time OFF reset */ setDynamicProperty() { }, sendMessage() { }, playSound() { },
    };
}
export function fixture(count = 3, options = {}) {
    const intervals = [], handlers = {}, changes = [], messages = [], queries = [], warnings = [], properties = options.properties ?? new Map(), io = [], ioAt = [], puts = [];
    let roster = Array.from({ length: count }, (_, i) => countedPlayer(`p${i}`));
    const initialPlayers = roster.slice(), config = { ...CONFIG, ...(options.config ?? {}) }, toggles = new Map();
    const stats = { gets: 0, sets: 0, roster: 0 };
    const events = name => ({ subscribe(fn) { (handlers[name] ??= []).push(fn); } });
    const rawPackets = [], reassembler = createStateReassembler();
    const system = { currentTick: 0, runInterval(fn, period) { intervals.push({ fn, period }); }, runTimeout() { },
        beforeEvents: { startup: events("startup") }, sendScriptEvent(id, text) {
            if (id === "realm:map_state") {
                // Debug state: EVERY actual packet is checked against the real 2047 UTF-8 byte limit, then the packets
                // merge into ONE logical record for the old assertions (a source note marks it; not Native proof).
                if (Buffer.byteLength(text, "utf8") > MAX_EVENT_BYTES)
                    throw new Error("oversized event " + id);
                rawPackets.push(text);
                const done = reassembler.accept(text, system.currentTick);
                if (done.error) throw new Error("bad map_state packet: " + done.error);
                if (!done.partial)
                    messages.push(done.packets > 1 ? ["event", id, done.text, { source: "reassembled from " + done.packets + " packets by map-debug-state.js; fixture merge, not Native proof" }] : ["event", id, text]);
                return;
            }
            if (text.length >= 2048)
                throw new Error("oversized event " + id); messages.push(["event", id, text]); } };
    let fail = () => false, titleFailure = options.titleFailure === true;
    const block = at => ({ typeId: (Math.floor(at.x) + Math.floor(at.z)) % 3 ? "minecraft:stone" : "minecraft:grass_block", location: { x: at.x, y: 64, z: at.z }, getComponent() { queries.push(["color", system.currentTick, at.x, at.z]); return undefined; } });
    const dimension = id => ({ id, heightRange: { min: -64, max: 320 },
        getBlockFromRay(at) {
            queries.push(["ray", system.currentTick, id, plain(at)]);
            if (options.rayMiss === true) return undefined;
            if (fail(at, system.currentTick))
                throw new Error("unloaded");
            return { block: block(at) };
        },
        getBlock(at) { queries.push(["block", system.currentTick, id, plain(at)]); return options.airProbe === true ? { typeId: "minecraft:air", isAir: true, location: {...at} } : block(at); },
        getEntities(options) { queries.push(["entities", system.currentTick, id, plain(options)]); return [{ getTags: () => ["realm:npc_id:moving"], get location() { return { x: system.currentTick * 0.4 + 3, y: 64, z: -7 }; } }]; },
    });
    const dims = Object.fromEntries(["overworld", "nether", "the_end"].map(n => [n, dimension(`minecraft:${n}`)]));
    for (const p of roster) {
        p.state.dim = dims.overworld;
        p.sendMessage = text => messages.push(["chat", p.id, text]);
        p.playSound = (...args) => messages.push(["sound", p.id, ...args]);
        p.onScreenDisplay = { setTitle: (...args) => { if (titleFailure) throw new Error("injected title failure"); messages.push(["title", p.id, ...args]); } };
    }
    const context = { createStatePacketizer, selectNetherLayer,RADAR_PIXELS,snapshotCoverage,rasterCadenceReady,reconstructRaster, estimatedPaletteGlyph, rollTerrainDemand, ManualScanner, ...terrainWork, EXP: options.profile ?? MAP_PROFILE, ...terrainAPI, ...resetAPI, spendBudget: terrainAPI.spendBudget,
        ResidentTrace, DetailPersistence, isDetailStore, orderTerrainWork, CatchupWindow, FeatureEnvelope, SCAN_POLICY, Budget, oldestDue, CONFIG: config, G, overlayGlyph, SELF_ARROWS, PreviewPersistence,
        Player: class {
        }, CommandPermissionLevel: {Any:0,GameDirectors:1,Admin:2}, CustomCommandParamType: {}, CustomCommandStatus: {},
        Date: { now: () => (options.wallStart ?? 10000) + system.currentTick * 50 }, Math: Object.assign(Object.create(Math), { random: () => 0.5 }), console: { warn: s => warnings.push(s) }, system,
        get: key => config[key], getFor: (p, key) => toggles.get(`${p.id}:${key}`) ?? true,
        onChange: fn => changes.push(fn), setFor(p, key, value) { toggles.set(`${p.id}:${key}`, value); changes.forEach(fn => fn(key, p)); },
        onScriptEvent(ids, fn) { (handlers.protocol ??= []).push({ ids, fn }); },
        world: { afterEvents: Object.fromEntries(["worldLoad", "playerPlaceBlock", "playerBreakBlock", "playerLeave", "playerSpawn", "playerDimensionChange"].map(n => [n, events(n)])),
            getAllPlayers() { stats.roster++; return roster; },
            getDynamicProperty(k) { stats.gets++; ioAt.push(["get",system.currentTick,k]); io.push(["get", k]); return properties.get(k); }, setDynamicProperty(k, v) { stats.sets++; ioAt.push(["set",system.currentTick,k]); io.push(["set", k, v]); properties.set(k, v); } },
    };
    const sideAPI = vm.runInNewContext(`(() => { ${sideSource}; return { sideBoxes, holdTitle }; })()`, context);
    context.sideBoxes = sideAPI.sideBoxes;
    const expose = `\n;({ mainFrame: typeof mainFrame === "undefined" ? undefined : mainFrame, scanFrame: typeof scanFrame === "undefined" ? undefined : scanFrame, redrawFrame: typeof redrawFrame === "undefined" ? undefined : redrawFrame, passFrame: typeof passFrame === "undefined" ? undefined : passFrame, onEvent, poseOf: typeof poseOf === "undefined" ? p => p : poseOf, terrainViewerOf, terrainPickInRange, prefsOf, planFor, views, scanPlans, pendingTerrain, terrainBaseMemo, playerStore, retryAt, lastPose, planNow, passAt, lastText, lastSent, terrain, previewPersistence, previewCost, detailPersistence, detailCost, featureEnvelope, catchupWindow: typeof catchupWindow === "undefined" ? undefined : catchupWindow, labOrder, labPlans, blockChanged, wpCache, resetChecked, tracks, regions, drawBudget, rebuildBudget, passBudget, scanBudget, toggleMinimap, toggleCompass,
    manualScans, dispatchTerrainRead, residentTrace, preparedDetailFrames, publishedDetailFrames, acceptDetailFrame, setReadCostForTest: value => { readCost = value; }, side, render, pass, radarOf, radarSig, replayVisibleDetail, restoreCachedDetail, keepAlive, staleDue, staleSlot, applyReset, planIdle,
    queue: typeof scanQueueCost === "undefined" ? undefined : scanQueueCost,
    counters: () => ({ scanReads, scanTicks, scanPeak, scanEachPeak, scanPlanMs, scanMs, turnMs, turnTicks, turnDraws, turnSends, refreshSends, keepSends, radarRebuilds, radarReuses, radarBuilds, costPlayers, costPasses, costMs, drawMs, turnCheckMs, radarMs, plansMade: planTurn.made }),
  })`;
    const api = vm.runInNewContext((options.mainSource ?? main).replace(/^import .+;\n/gm, "") + expose, context);
    api.redrawFrame = intervals.find(i => i.fn.toString().includes("drawBudget.tick()")).fn;
    api.passFrame = intervals.find(i => i.fn.toString().includes("passBudget.tick()")).fn;
    const nativePut = api.terrain.put.bind(api.terrain);
    api.terrain.put = (s, x, z, d, t, r) => { puts.push([s.id, x, z, plain(d), t, r ?? terrainAPI.COL]); return nativePut(s, x, z, d, t, r); };
    for (const p of roster) {
        api.wpCache.set(p.id, null);
        api.resetChecked.add(p.id);
    }
    const event = (id, payload) => { const message = JSON.stringify(payload); for (const listener of handlers.protocol ?? [])
        if ((Array.isArray(listener.ids) ? listener.ids : [listener.ids]).includes(id))
            listener.fn({ id, message }); };
    const readPump=intervals.find(i=>i.fn.toString().includes("detailPersistence.needsLoad"))?.fn;
    const writePump=intervals.find(i=>i.fn.toString().includes("detailPersistence.flushOne"))?.fn;
    assert.ok(readPump && writePump,"actual shared measured persistence pumps exist");
    const emit = (name, payload) => (handlers[name] ?? []).forEach(fn => fn(payload));
    return { api, context, intervals, messages, rawPackets, queries, warnings, stats, dims, config, initialPlayers, emit, event, properties, io, ioAt, puts,
        get roster() { return roster; }, leave(p) { roster = roster.filter(x => x !== p); emit("playerLeave", { playerId: p.id }); },
        failWhen(fn) { fail = fn; },
        failTitles(value) { titleFailure = value; },
        configChanged(key="*") { changes.forEach(fn => fn(key, undefined)); },
        hold(player,ticks) { sideAPI.holdTitle(player,ticks); },
        readPump(now) { system.currentTick=now; readPump(); },
        writePump(now) { system.currentTick=now; writePump(); },
        tick(now) {
            system.currentTick = now;
            for (const interval of intervals)
                if (now % interval.period === 0)
                    interval.fn();
        },
        scan(now) { system.currentTick = now; api.scanFrame(); },
    };
}
