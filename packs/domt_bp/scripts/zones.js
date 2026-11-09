// Generated from tools/zones-shared.js by node tools/sync-zones.mjs: edit that file, not this copy.
// Safe zones: places where world events (meteors, tornadoes, storm lightning, Blood Moon creepers...)
// change no blocks. Every pack that takes part keeps this same file as scripts/zones.js: edit
// tools/zones-shared.js, then run node tools/sync-zones.mjs (npm run check fails on a stale copy).
// Packs never import each other, so zones travel over script events (JSON messages):
//
//   realm:zones       { src, part, parts, zones: [{ id, name, dim, x, z, r, shape? }] }
//                     A provider's full list ("zones" = Safe Zones, "town" = Town Projects, "claims" =
//                     Land Claims), sent when it changes, about 5 s after the world loads and in reply to
//                     a ping. Split into parts under 2048 characters; parts 0 or an empty list clears it.
//                     shape: "circle" (default: within r of x, z) or "square" (x - r to x + r, z - r to z + r).
//                     Zones reach from the bottom of the world to the top.
//   realm:zones_ping  {}   Asks every provider to send its list again.
//   realm:zones_open  { player, action: "add" }   Asks Safe Zones to open its "Add a safe zone here"
//                     form for that player (player id), as if they ran /realm:zones.
//
// Consumers call isProtected() / protectedBox() before changing a block in a world event and skip it
// inside a zone (the event still happens, it just breaks or places nothing there). Providers call
// provideZones(src, list) once and the function it returns whenever their list changes.
import { system, world } from "@minecraft/server";
import { onScriptEvent } from "./script-events.js";

/**
 * @typedef {object} SafeZone
 * @property {string} id unique within its provider
 * @property {string} name
 * @property {string} dim dimension id, e.g. "minecraft:overworld"
 * @property {number} x center
 * @property {number} z center
 * @property {number} r radius (half the side for a square)
 * @property {"circle" | "square"} shape
 * @property {string} src the provider: "zones", "town", "claims"...
 */

/** Script event messages may be at most 2048 characters: lists are split below this, counted in UTF-8 bytes. */
const ZONES_MESSAGE_LIMIT = 2000;
const MAX_RADIUS = 100000;
/** Parts of one list arrive in the same tick; a list still incomplete after this many ticks is dropped. */
const PART_TIMEOUT = 100;

/** @type {Map<string, SafeZone[]>} the latest full list from each provider */
const bySrc = new Map();
/** @type {Map<string, { parts: number, got: Map<number, SafeZone[]>, tick: number }>} lists still arriving */
const arriving = new Map();
/** @type {(() => void)[]} */
const zoneListeners = [];

/** "overworld" and "minecraft:overworld" are the same dimension. @param {unknown} d */
const fullDim = (d) => {
  const s = String(d ?? "");
  return s.includes(":") ? s : `minecraft:${s}`;
};

/** A zone from a message, or undefined if it isn't one. @param {string} src @param {any} z @returns {SafeZone | undefined} */
function cleanZone(src, z) {
  if (!z || typeof z !== "object") return undefined;
  const x = Number(z.x), zz = Number(z.z), r = Number(z.r);
  if (![x, zz, r].every(Number.isFinite) || r <= 0 || r > MAX_RADIUS || !z.dim) return undefined;
  return {
    id: String(z.id ?? `${x},${zz}`),
    name: String(z.name ?? z.id ?? "Safe zone").slice(0, 48),
    dim: fullDim(z.dim),
    x,
    z: zz,
    r,
    shape: z.shape === "square" ? "square" : "circle",
    src,
  };
}

function zonesChanged() {
  for (const fn of zoneListeners) {
    try {
      fn();
    } catch (e) {
      console.warn(`[zones] ${e}`);
    }
  }
}

/**
 * Takes in one realm:zones message. Parts may be numbered from 0 or from 1: a list is complete when
 * `parts` different part numbers have arrived, and a part number seen twice starts a new list.
 * @param {any} msg
 */
export function receiveZones(msg) {
  if (!msg || typeof msg !== "object" || typeof msg.src !== "string" || !msg.src) return;
  const src = msg.src;
  const parts = Math.floor(Number(msg.parts ?? 1));
  const list = (Array.isArray(msg.zones) ? msg.zones : []).map((/** @type {any} */ z) => cleanZone(src, z)).filter((/** @type {SafeZone | undefined} */ z) => !!z);
  if (!Number.isFinite(parts) || parts <= 0 || (parts === 1 && !list.length)) {
    arriving.delete(src);
    bySrc.set(src, []);
    zonesChanged();
    return;
  }
  const part = Math.floor(Number(msg.part ?? 1));
  const now = system.currentTick;
  let buf = arriving.get(src);
  if (!buf || buf.parts !== parts || buf.got.has(part) || now - buf.tick > PART_TIMEOUT) {
    buf = { parts, got: new Map(), tick: now };
    arriving.set(src, buf);
  }
  buf.got.set(part, /** @type {SafeZone[]} */ (list));
  if (buf.got.size < parts) return;
  arriving.delete(src);
  const all = [...buf.got.entries()].sort((a, b) => a[0] - b[0]).flatMap(([, zs]) => zs);
  bySrc.set(src, all);
  zonesChanged();
}

/** Is x, z inside this zone? @param {SafeZone} zone @param {number} x @param {number} z */
export function zoneHolds(zone, x, z) {
  const dx = x - zone.x, dz = z - zone.z;
  return zone.shape === "square" ? Math.abs(dx) <= zone.r && Math.abs(dz) <= zone.r : dx * dx + dz * dz <= zone.r * zone.r;
}

/** Every zone from every provider. @returns {SafeZone[]} */
export function allZones() {
  return [...bySrc.values()].flat();
}

/** The providers heard from since the world loaded (even with an empty list), e.g. "zones". */
export function zoneProviders() {
  return new Set(bySrc.keys());
}

/**
 * The zones holding a spot. Blocks: pass the block's x + 0.5, z + 0.5 for its center.
 * @param {string} dimensionId @param {number} x @param {number} z @returns {SafeZone[]}
 */
export function zonesAt(dimensionId, x, z) {
  const dim = fullDim(dimensionId);
  return allZones().filter((zone) => zone.dim === dim && zoneHolds(zone, x, z));
}

/** Is this spot in any safe zone? @param {string} dimensionId @param {number} x @param {number} z */
export function isProtected(dimensionId, x, z) {
  const dim = fullDim(dimensionId);
  for (const list of bySrc.values()) for (const zone of list) if (zone.dim === dim && zoneHolds(zone, x, z)) return true;
  return false;
}

/**
 * Does any safe zone reach into this box (only x and z count: zones go top to bottom)?
 * @param {string} dimensionId @param {{ x: number, z: number }} min @param {{ x: number, z: number }} max
 */
export function protectedBox(dimensionId, min, max) {
  const dim = fullDim(dimensionId);
  const x0 = Math.min(min.x, max.x), x1 = Math.max(min.x, max.x), z0 = Math.min(min.z, max.z), z1 = Math.max(min.z, max.z);
  for (const list of bySrc.values()) {
    for (const zone of list) {
      if (zone.dim !== dim) continue;
      if (zone.shape === "square") {
        if (zone.x + zone.r >= x0 && zone.x - zone.r <= x1 && zone.z + zone.r >= z0 && zone.z - zone.r <= z1) return true;
        continue;
      }
      const cx = Math.max(x0, Math.min(zone.x, x1)), cz = Math.max(z0, Math.min(zone.z, z1)); // the box's nearest point to the center
      if ((cx - zone.x) ** 2 + (cz - zone.z) ** 2 <= zone.r * zone.r) return true;
    }
  }
  return false;
}

/**
 * The nearest spot at least `margin` blocks outside every safe zone, or the spot itself when it already
 * is. Undefined if none turns up within a few thousand blocks.
 * @param {string} dimensionId @param {number} x @param {number} z @param {number} [margin]
 * @returns {{ x: number, z: number } | undefined}
 */
export function escapeZones(dimensionId, x, z, margin = 0) {
  const dim = fullDim(dimensionId);
  const zones = allZones().filter((zone) => zone.dim === dim);
  const grown = zones.map((zone) => ({ ...zone, r: zone.r + margin }));
  const free = (/** @type {number} */ px, /** @type {number} */ pz) => !grown.some((zone) => zoneHolds(zone, px, pz));
  if (free(x, z)) return { x, z };
  // Step out of the zone holding the spot, straight away from its center; a neighbor may hold the new spot, so repeat.
  let px = x, pz = z;
  for (let i = 0; i < 8; i++) {
    const zone = grown.find((g) => zoneHolds(g, px, pz));
    if (!zone) return { x: px, z: pz };
    let dx = px - zone.x, dz = pz - zone.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) [dx, dz] = [1, 0];
    else [dx, dz] = [dx / d, dz / d];
    if (zone.shape === "square") {
      if (Math.abs(dx) >= Math.abs(dz)) px = zone.x + Math.sign(dx || 1) * (zone.r + 1);
      else pz = zone.z + Math.sign(dz || 1) * (zone.r + 1);
    } else {
      px = zone.x + dx * (zone.r + 1);
      pz = zone.z + dz * (zone.r + 1);
    }
  }
  // Boxed in: rings of spots farther and farther out.
  for (let ring = 1; ring <= 40; ring++) {
    const d = ring * 64;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const qx = x + Math.cos(a) * d, qz = z + Math.sin(a) * d;
      if (free(qx, qz)) return { x: qx, z: qz };
    }
  }
  return undefined;
}

/** Runs `fn` whenever any provider's list changes. @param {() => void} fn */
export function onZonesChange(fn) {
  zoneListeners.push(fn);
}

/** Asks every provider to send its list again. */
export function pingZones() {
  try {
    system.sendScriptEvent("realm:zones_ping", "{}");
  } catch {
    // too early: the world-load ping comes later
  }
}

/** UTF-8 length, so a message is under the limit however the game counts it. @param {string} s */
function utf8Length(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? 2 : 3;
  }
  return n;
}

/** One decimal is plenty (a claim's square edge sits on a block boundary: x.5). @param {number} n */
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * The realm:zones messages for a provider's full list (parts numbered from 1).
 * @param {string} src @param {{ id: string, name: string, dim: string, x: number, z: number, r: number, shape?: "circle" | "square" }[]} list
 * @returns {string[]}
 */
export function zoneMessages(src, list) {
  /** @param {object[]} zones @param {number} part @param {number} parts */
  const envelope = (zones, part, parts) => JSON.stringify({ src, part, parts, zones });
  /** @type {object[][]} */
  const parts = [[]];
  for (const z of list) {
    const zone = { id: z.id, name: z.name, dim: z.dim, x: round1(z.x), z: round1(z.z), r: round1(z.r), shape: z.shape === "square" ? "square" : undefined };
    const last = /** @type {object[]} */ (parts.at(-1));
    if (last.length && utf8Length(envelope([...last, zone], 999, 999)) > ZONES_MESSAGE_LIMIT) parts.push([zone]);
    else last.push(zone);
  }
  return parts.map((zones, i) => envelope(zones, i + 1, parts.length));
}

/**
 * Makes this pack a provider: its list is sent about 5 s after the world loads and in reply to each
 * ping (once per tick however many pings come). Call the returned function when the list changes.
 * @param {string} src @param {() => { id: string, name: string, dim: string, x: number, z: number, r: number, shape?: "circle" | "square" }[]} getList
 * @returns {() => void}
 */
export function provideZones(src, getList) {
  let queued = false;
  const publish = () => {
    if (queued) return;
    queued = true;
    system.run(() => {
      queued = false;
      try {
        for (const m of zoneMessages(src, getList())) system.sendScriptEvent("realm:zones", m);
      } catch (e) {
        console.warn(`[zones] ${src}: ${e}`);
      }
    });
  };
  onScriptEvent("realm:zones_ping", ({ id }) => {
    if (id === "realm:zones_ping") publish();
  });
  world.afterEvents.worldLoad.subscribe(() => system.runTimeout(publish, 100));
  return publish;
}

onScriptEvent("realm:zones", ({ id, message }) => {
  if (id !== "realm:zones") return;
  try {
    receiveZones(JSON.parse(message));
  } catch (e) {
    console.warn(`[zones] ${e}`);
  }
});

world.afterEvents.worldLoad.subscribe(() => {
  pingZones();
  // Once more a little later, in case a provider wasn't ready to answer the first time.
  system.runTimeout(() => {
    if (!bySrc.size) pingZones();
  }, 200);
});
