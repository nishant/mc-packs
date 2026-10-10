import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  Entity,
  GameMode,
  Player,
  PlayerPermissionLevel,
  WeatherType,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

// Townsfolk are vanilla minecraft:npc entities (invulnerable, they don't wander, and operators can pick one of
// the game's skins in its NPC editor). Where each one belongs is saved in the world, so an NPC that goes
// missing is found again or spawned again, and taps run the offer round other packs answer (see the spec in
// docs/PACKS.md, "Townsfolk"):
//   realm:npc_talk  { req, player, npc, roles, name }   -> every pack
//   realm:npc_offer { req, pack, key, label, order? }   <- packs with something for this NPC, within 4 ticks
//   realm:npc_choose { player, npc, pack, key }         -> the pack whose button the player picked

const PROP_LIST = "npc:list"; // world: JSON Placed[], where each townsfolk lives
const PROP_WEATHER = "npc:weather"; // world: overworld weather from the last change; scripts can't read the current weather

const NPC_TYPE = "minecraft:npc";
const OWNER_TAG = "realm:npc_owner:npc_bp";
const NPC_TAG = "realm:npc";
const ID_TAG = "realm:npc_id:";
const ROLE_TAG = "realm:npc_role:";
const OVERWORLD = "minecraft:overworld";
const DIMENSIONS = [OVERWORLD, "minecraft:nether", "minecraft:the_end"];

const LOOP_TICKS = 10; // facing, idle lines and the routine
const MISSING_EVERY = 4; // loops between checks for a missing NPC (2 s)
const MISSING_CHECKS = 3; // checks in a row before a missing NPC is spawned again (6 s): its chunk may still be loading
const AUDIT_TICKS = 200; // every 10 s, look for duplicates, leftovers and changed names
const OFFER_TICKS = 4; // how long other packs have to answer realm:npc_talk
const MAX_OFFERS = 16;
const TAP_COOLDOWN = 10;
const MOVE_DISTANCE = 1.5; // farther than this from where it belongs, an NPC is teleported back
const TURN_STEP = 45; // degrees an NPC turns per loop at most, so it turns rather than snaps
const TURN_MIN = 4; // smaller differences aren't worth a teleport

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {typeof CONFIG.townsfolk[number]} Townsfolk */
/** @typedef {keyof Townsfolk["greetings"]} Situation */
/**
 * Where one townsfolk lives. `eid` is the id of its entity (ids stay the same across loads), so any other
 * entity with its tags is a duplicate or a leftover.
 * @typedef {{ id: string, dim: string, x: number, y: number, z: number, yaw: number, eid?: string, home?: Vector3 }} Placed
 */
/** @typedef {{ missing: number, nextIdle: number, speech: number, yaw?: number }} State */
/** @typedef {{ pack: string, key: string, label: string, order: number }} Offer */

const folk = new Map(CONFIG.townsfolk.map((t) => [t.id, t]));

/** @type {Placed[]} */
let list = [];
let ready = false;
let loadFailed = false; // a corrupt list: leave the NPCs alone rather than remove them all
/** @type {WeatherType} */
let weather = WeatherType.Clear;
/** @type {Map<string, State>} townsfolk id -> runtime state */
const states = new Map();

/** @param {Townsfolk} t "§eMara §7the Cartographer": the name above its head */
const displayName = (t) => `§e${t.name}${t.title ? ` §7${t.title}` : ""}`;
/** @param {Townsfolk} t "Mara the Cartographer" */
const plainName = (t) => (t.title ? `${t.name} ${t.title}` : t.name);

/** @param {Player} player */
const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors || player.playerPermissionLevel === PlayerPermissionLevel.Operator;

/** @param {number} ticks */
const wait = (ticks) => new Promise((r) => system.runTimeout(() => r(undefined), ticks));

/** @template T @param {T[]} arr @returns {T | undefined} */
const pick = (arr) => (arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined);

/** @param {string} id */
function stateOf(id) {
  let st = states.get(id);
  if (!st) states.set(id, (st = { missing: 0, nextIdle: system.currentTick + idleDelay(), speech: 0 }));
  return st;
}

/** Ticks until an NPC's next idle line. */
function idleDelay() {
  const a = Math.max(5, Number(get("idleMinSeconds")) || 30);
  const b = Math.max(a, Number(get("idleMaxSeconds")) || 60);
  return Math.round((a + Math.random() * (b - a)) * 20);
}

// ---------------------------------------------------------------------------
// Saved list
// ---------------------------------------------------------------------------

/** @param {unknown} v */
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function load() {
  try {
    const raw = world.getDynamicProperty(PROP_LIST);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : [];
    /** @type {Placed[]} */
    const out = [];
    for (const r of Array.isArray(parsed) ? parsed : []) {
      if (!r || typeof r.id !== "string" || typeof r.dim !== "string" || !isNum(r.x) || !isNum(r.y) || !isNum(r.z)) continue;
      if (out.some((o) => o.id === r.id)) continue;
      if (!folk.has(r.id)) console.warn(`[npc] "${r.id}" is no longer in config.js: its NPC is removed when its chunk loads`);
      const home = r.home && isNum(r.home.x) && isNum(r.home.y) && isNum(r.home.z) ? { x: r.home.x, y: r.home.y, z: r.home.z } : undefined;
      out.push({ id: r.id, dim: r.dim, x: r.x, y: r.y, z: r.z, yaw: isNum(r.yaw) ? r.yaw : 0, eid: typeof r.eid === "string" ? r.eid : undefined, home });
    }
    list = out.filter((r) => folk.has(r.id));
  } catch (e) {
    console.warn(`[npc] ${PROP_LIST} is corrupt: ${e}`);
    list = [];
    loadFailed = true;
  }
}

function save() {
  try {
    world.setDynamicProperty(PROP_LIST, list.length ? JSON.stringify(list) : undefined);
  } catch (e) {
    console.warn(`[npc] save: ${e}`);
  }
}

/** @param {string} id */
const placedOf = (id) => list.find((r) => r.id === id);

/** The townsfolk id in an entity's tags. @param {Entity} entity */
function idOf(entity) {
  try {
    const tag = entity.getTags().find((t) => t.startsWith(ID_TAG));
    return tag ? tag.slice(ID_TAG.length) : undefined;
  } catch {
    return undefined;
  }
}

/** The townsfolk's entity, if it is loaded. @param {Placed} rec */
function entityOf(rec) {
  if (!rec.eid) return undefined;
  try {
    const e = world.getEntity(rec.eid);
    return e && e.isValid ? e : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Time, weather and where an NPC belongs right now
// ---------------------------------------------------------------------------

world.afterEvents.weatherChange.subscribe(({ dimension, newWeather }) => {
  if (dimension !== OVERWORLD) return;
  weather = newWeather;
  try {
    world.setDynamicProperty(PROP_WEATHER, newWeather);
  } catch (e) {
    console.warn(`[npc] ${e}`);
  }
});

function isNight() {
  const t = world.getTimeOfDay();
  const a = CONFIG.nightStart;
  const b = CONFIG.nightEnd;
  return a <= b ? t >= a && t < b : t >= a || t < b;
}

/** Which greetings fit now, for an NPC in this dimension. @param {string} dim @returns {Situation} */
function situation(dim) {
  if (dim === OVERWORLD && weather === WeatherType.Thunder) return "thunder";
  if (dim === OVERWORLD && weather === WeatherType.Rain) return "rain";
  const t = world.getTimeOfDay();
  if (t >= 23000 || t < 3000) return "morning";
  if (t < 11000) return "day";
  if (t < 13000) return "evening";
  return "night";
}

/** Home at night (with the routine on), else its post. @param {Placed} rec @returns {Vector3} */
function anchorOf(rec) {
  if (rec.home && get("enabled") === true && get("nightRoutine") === true && isNight()) return rec.home;
  return { x: rec.x, y: rec.y, z: rec.z };
}

/** @param {Vector3} a @param {Vector3} b */
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Is the block at `at` loaded? @param {Dimension} dim @param {Vector3} at */
function loaded(dim, at) {
  try {
    return !!dim.getBlock({ x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z) });
  } catch {
    return false;
  }
}

/** Yaw that looks from `from` toward `to` (0 = south, 90 = west). @param {Vector3} from @param {Vector3} to */
const yawTo = (from, to) => (Math.atan2(-(to.x - from.x), to.z - from.z) * 180) / Math.PI;
/** @param {number} a degrees, to -180..180 */
const wrap = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

/** "N", "NE", ... from a step of dx, dz. @param {number} dx @param {number} dz */
function compass(dx, dz) {
  const a = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(a / 45) % 8];
}

/** @param {string} dim */
const dimName = (dim) => (dim === "minecraft:nether" ? "the Nether" : dim === "minecraft:the_end" ? "the End" : "the Overworld");

// ---------------------------------------------------------------------------
// Entities: dress, spawn, find again, clean up
// ---------------------------------------------------------------------------

/** Tags and name as config.js has them now. @param {Entity} entity @param {Townsfolk} t */
function dress(entity, t) {
  const want = new Set([NPC_TAG, OWNER_TAG, ID_TAG + t.id, ...t.roles.map((r) => ROLE_TAG + r)]);
  for (const tag of entity.getTags()) {
    if ((tag.startsWith(ROLE_TAG) || tag.startsWith(ID_TAG)) && !want.has(tag)) entity.removeTag(tag);
  }
  for (const tag of want) if (!entity.hasTag(tag)) entity.addTag(tag);
  const st = stateOf(t.id);
  if (system.currentTick >= st.speech && entity.nameTag !== displayName(t)) entity.nameTag = displayName(t);
}

/** @param {Placed} rec @param {Townsfolk} t @param {Vector3} at */
function spawn(rec, t, at) {
  const dim = world.getDimension(rec.dim);
  const entity = dim.spawnEntity(NPC_TYPE, at);
  dress(entity, t);
  entity.teleport(at, { rotation: { x: 0, y: rec.yaw } });
  rec.eid = entity.id;
  stateOf(t.id).yaw = rec.yaw;
  save();
  return entity;
}

/**
 * Checks one of our NPC entities: a townsfolk no longer placed (or no longer in config.js) is removed, a second
 * one of the same townsfolk is removed, and an NPC found while its saved entity isn't loaded becomes the one.
 * @param {Entity} entity
 */
function audit(entity) {
  if (!ready || !entity.isValid || entity.typeId !== NPC_TYPE || !entity.hasTag(OWNER_TAG)) return;
  const id = idOf(entity);
  const rec = id ? placedOf(id) : undefined;
  const t = id ? folk.get(id) : undefined;
  if (!rec || !t) {
    if (!loadFailed) entity.remove();
    return;
  }
  if (rec.eid !== entity.id) {
    const current = entityOf(rec);
    if (current && current.id !== entity.id) {
      entity.remove(); // a duplicate: the saved one is here
      return;
    }
    rec.eid = entity.id; // the saved one isn't loaded: this one takes over, and the other goes when it loads
    save();
  }
  dress(entity, t);
}

world.afterEvents.entityLoad.subscribe(({ entity }) => {
  try {
    if (entity.typeId === NPC_TYPE) audit(entity);
  } catch (e) {
    console.warn(`[npc] ${e}`);
  }
});

function auditAll() {
  for (const id of DIMENSIONS) {
    try {
      for (const e of world.getDimension(id).getEntities({ type: NPC_TYPE, tags: [OWNER_TAG] })) audit(e);
    } catch (e) {
      console.warn(`[npc] audit: ${e}`);
    }
  }
}

// An NPC that dies anyway (/kill) is spawned again at once, if anyone is around.
world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  try {
    if (deadEntity.typeId !== NPC_TYPE) return;
    const rec = list.find((r) => r.eid === deadEntity.id);
    if (rec) stateOf(rec.id).missing = MISSING_CHECKS;
  } catch (e) {
    console.warn(`[npc] ${e}`);
  }
});

/**
 * Called every 2 s for a townsfolk whose entity isn't loaded. If a player has been near the spot it belongs at
 * for a few checks and that spot is loaded, it's found by its tags or spawned again there.
 * @param {Placed} rec @param {Townsfolk} t
 */
function checkMissing(rec, t) {
  const st = stateOf(rec.id);
  const dim = world.getDimension(rec.dim);
  const at = anchorOf(rec);
  if (!loaded(dim, at) || !dim.getPlayers({ location: at, maxDistance: CONFIG.respawnRange }).length) {
    st.missing = 0;
    return;
  }
  if (++st.missing < MISSING_CHECKS) return;
  st.missing = 0;
  const found = dim.getEntities({ type: NPC_TYPE, tags: [OWNER_TAG, ID_TAG + rec.id] }).filter((e) => e.isValid);
  if (found.length) {
    found.sort((a, b) => dist(a.location, at) - dist(b.location, at));
    rec.eid = found[0].id;
    save();
    for (const e of found.slice(1)) e.remove();
    dress(found[0], t);
    return;
  }
  spawn(rec, t, at);
}

// ---------------------------------------------------------------------------
// Behavior: turning, idle lines, the routine
// ---------------------------------------------------------------------------

/** Turns (a step) toward `yaw`, staying where it belongs. @param {Entity} entity @param {State} st @param {Vector3} at @param {number} yaw @param {boolean} snap */
function turn(entity, st, at, yaw, snap) {
  const current = st.yaw ?? entity.getRotation().y;
  const diff = wrap(yaw - current);
  if (Math.abs(diff) < TURN_MIN) return;
  const next = snap ? yaw : wrap(current + Math.max(-TURN_STEP, Math.min(TURN_STEP, diff)));
  const loc = entity.location;
  entity.teleport(dist(loc, at) > 0.3 ? at : loc, { rotation: { x: 0, y: next } });
  st.yaw = next;
}

/** Shows a line above the NPC for a few seconds, in place of its name. @param {Entity} entity @param {Townsfolk} t @param {string} line */
function say(entity, t, line) {
  const st = stateOf(t.id);
  const ticks = Math.max(1, Math.round(CONFIG.speechSeconds * 20));
  st.speech = system.currentTick + ticks;
  entity.nameTag = `§f${line}`;
  system.runTimeout(() => {
    try {
      if (entity.isValid && system.currentTick >= st.speech) entity.nameTag = displayName(t);
    } catch {
      // unloaded meanwhile: the audit puts the name back
    }
  }, ticks);
}

/** @param {string} line @param {string} name */
const fill = (line, name) => line.split("{player}").join(name);

/** @param {Placed} rec @param {Townsfolk} t @param {Entity} entity */
function behave(rec, t, entity) {
  const st = stateOf(rec.id);
  const dim = world.getDimension(rec.dim);
  const at = anchorOf(rec);
  if (entity.dimension.id !== rec.dim || dist(entity.location, at) > MOVE_DISTANCE) {
    // Pushed, moved by someone, or time to go home or back to its post. Only into a loaded spot.
    if (loaded(dim, at)) {
      entity.teleport(at, { dimension: dim, rotation: { x: 0, y: rec.yaw } });
      st.yaw = rec.yaw;
    }
    return;
  }
  const range = Number(get("faceRange")) || 0;
  const loc = entity.location;
  const [near] = range > 0 ? dim.getPlayers({ location: loc, maxDistance: range, closest: 1 }) : [];
  turn(entity, st, at, near ? yawTo(loc, near.location) : rec.yaw, false);

  if (system.currentTick >= st.nextIdle) {
    st.nextIdle = system.currentTick + idleDelay();
    const [listener] = dim.getPlayers({ location: loc, maxDistance: CONFIG.idleRange, closest: 1 });
    if (!listener) return;
    // Mostly idle chatter, sometimes a remark that fits the time and weather.
    const line = Math.random() < 0.7 ? pick(t.idle) : pick(t.greetings[situation(rec.dim)] ?? []);
    if (line) say(entity, t, fill(line, listener.name));
  }
}

let loops = 0;
function loop() {
  loops++;
  const lively = get("enabled") === true;
  for (const rec of list) {
    const t = folk.get(rec.id);
    if (!t) continue;
    try {
      const entity = entityOf(rec);
      if (!entity) {
        if (loops % MISSING_EVERY === 0) checkMissing(rec, t);
        continue;
      }
      stateOf(rec.id).missing = 0;
      if (lively) behave(rec, t, entity);
    } catch (e) {
      console.warn(`[npc] ${rec.id}: ${e}`); // usually an unloaded chunk
    }
  }
}

world.afterEvents.worldLoad.subscribe(() => {
  try {
    const saved = world.getDynamicProperty(PROP_WEATHER);
    if (saved === WeatherType.Rain || saved === WeatherType.Thunder) weather = saved;
  } catch {
    // keep Clear
  }
  load();
  ready = true;
  // A line left above an NPC by a restart mid-speech is put back by the audit.
  auditAll();
  system.runInterval(loop, LOOP_TICKS);
  system.runInterval(auditAll, AUDIT_TICKS);
});

// ---------------------------------------------------------------------------
// Taps: the offer round
// ---------------------------------------------------------------------------

/** @type {Map<string, Offer[]>} request id -> offers so far */
const rounds = new Map();
/** @type {Set<string>} players with an NPC menu open */
const busy = new Set();
/** @type {Map<string, number>} player id -> tick of the last tap */
const lastTap = new Map();
let requests = 0;

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  busy.delete(playerId);
  lastTap.delete(playerId);
});

world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  const { player, target } = ev;
  try {
    if (target.typeId !== NPC_TYPE || !target.hasTag(OWNER_TAG)) return;
    let creative = false;
    try {
      creative = player.getGameMode() === GameMode.Creative;
    } catch {
      creative = false;
    }
    if (player.isSneaking && creative && isOp(player)) return; // the game's NPC editor, to pick a skin
    ev.cancel = true;
    const id = idOf(target);
    system.run(() => {
      if (!id || !player.isValid) return;
      tapped(player, target, id).catch((e) => console.warn(`[npc] ${e}`));
    });
  } catch (e) {
    console.warn(`[npc] ${e}`);
  }
});

/**
 * Shows a form, retrying while the player still has chat or another screen open.
 * @param {Player} player @param {ActionFormData} form
 */
async function show(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await wait(20);
  }
  return undefined;
}

/** @param {Player} player @param {Entity} entity @param {string} id */
async function tapped(player, entity, id) {
  const now = system.currentTick;
  if (busy.has(player.id) || now - (lastTap.get(player.id) ?? -TAP_COOLDOWN) < TAP_COOLDOWN) return;
  lastTap.set(player.id, now);
  const t = folk.get(id);
  if (!t) return;
  busy.add(player.id);
  try {
    // Look at whoever is talking.
    if (get("enabled") === true && entity.isValid) {
      const rec = placedOf(id);
      if (rec) turn(entity, stateOf(id), anchorOf(rec), yawTo(entity.location, player.location), true);
    }
    const req = `npc:${id}:${player.id}:${now}:${++requests}`;
    rounds.set(req, []);
    system.sendScriptEvent("realm:npc_talk", JSON.stringify({ req, player: player.id, npc: id, roles: t.roles, name: plainName(t) }));
    await wait(OFFER_TICKS);
    const offers = rounds.get(req) ?? [];
    rounds.delete(req);
    offers.push({ pack: "npc_bp", key: "who", label: "Who lives here?", order: 95 });
    offers.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
    if (!player.isValid) return;

    const dimId = entity.isValid ? entity.dimension.id : player.dimension.id;
    const greeting = fill(pick(t.greetings[situation(dimId)] ?? []) ?? "Hello, {player}.", player.name);
    const form = new ActionFormData().title(plainName(t)).body(`§e${t.name}:§r "${greeting}"`);
    for (const o of offers) form.button(o.label);
    form.button("Goodbye");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
    const offer = offers[res.selection];
    if (!offer) return; // Goodbye
    if (offer.pack === "npc_bp") {
      busy.delete(player.id);
      await whoLivesHere(player, t);
      return;
    }
    system.sendScriptEvent("realm:npc_choose", JSON.stringify({ player: player.id, npc: id, pack: offer.pack, key: offer.key }));
  } finally {
    busy.delete(player.id);
  }
}

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:npc_offer") return;
    try {
      const o = JSON.parse(message);
      if (!o || typeof o.req !== "string" || typeof o.pack !== "string" || typeof o.key !== "string" || typeof o.label !== "string") return;
      const offers = rounds.get(o.req);
      if (!offers || offers.length >= MAX_OFFERS || offers.some((x) => x.pack === o.pack && x.key === o.key)) return;
      const order = typeof o.order === "number" && Number.isFinite(o.order) ? o.order : 50;
      offers.push({ pack: o.pack.slice(0, 64), key: o.key.slice(0, 64), label: o.label.slice(0, 80), order });
    } catch {
      // not ours to fix: ignore malformed offers
    }
  },
  { namespaces: ["realm"] },
);

// ---------------------------------------------------------------------------
// Where everyone is
// ---------------------------------------------------------------------------

/** One line per placed townsfolk: distance and direction from the player. @param {Player} player */
function whereabouts(player) {
  const here = player.location;
  return list
    .filter((r) => folk.has(r.id))
    .map((r) => {
      const t = /** @type {Townsfolk} */ (folk.get(r.id));
      const entity = entityOf(r);
      const at = entity && entity.dimension.id === r.dim ? entity.location : anchorOf(r);
      const roles = t.roles.length ? ` §8(${t.roles.join(", ")})` : "";
      if (r.dim !== player.dimension.id) return { d: Infinity, text: `${displayName(t)}§f - in ${dimName(r.dim)}${roles}` };
      const d = Math.round(Math.hypot(at.x - here.x, at.z - here.z));
      const where = d < 4 ? "right here" : `${d}m ${compass(at.x - here.x, at.z - here.z)}`;
      return { d, text: `${displayName(t)}§f - ${where}${roles}` };
    })
    .sort((a, b) => a.d - b.d)
    .map((x) => x.text);
}

/** @param {Player} player @param {Townsfolk} t */
async function whoLivesHere(player, t) {
  const lines = whereabouts(player);
  const form = new ActionFormData()
    .title(plainName(t))
    .body(`§e${t.name}:§r "Folk around here? Let me think."\n\n${lines.join("\n")}`)
    .button("Thanks");
  await show(player, form);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** @param {import("@minecraft/server").CustomCommandOrigin} origin */
const playerOf = (origin) => {
  const p = origin.initiator ?? origin.sourceEntity;
  return p instanceof Player ? p : undefined;
};

/** @param {Vector3} loc block-centered x/z, feet height */
const centered = (loc) => ({ x: Math.floor(loc.x) + 0.5, y: Math.round(loc.y * 100) / 100, z: Math.floor(loc.z) + 0.5 });
/** @param {Vector3} p */
const coords = (p) => `${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}`;

/** @param {Player} player @param {string} id */
function addNpc(player, id) {
  const t = folk.get(id);
  if (!t) return player.sendMessage(`§cNo townsfolk "${id}" in config.js.`);
  const at = centered(player.location);
  const yaw = wrap(player.getRotation().y + 180); // facing the operator who placed it
  const dim = player.dimension;
  let rec = placedOf(id);
  let note = "";
  if (rec) {
    if (rec.home && rec.dim !== dim.id) {
      rec.home = undefined;
      note = " §7Their home was in another dimension, so it was cleared.";
    }
    Object.assign(rec, { dim: dim.id, x: at.x, y: at.y, z: at.z, yaw });
  } else {
    rec = { id, dim: dim.id, x: at.x, y: at.y, z: at.z, yaw };
    list.push(rec);
  }
  save();
  const st = stateOf(id);
  st.missing = 0;
  const entity = entityOf(rec);
  let moved = false;
  if (entity) {
    try {
      entity.teleport(at, { dimension: dim, rotation: { x: 0, y: yaw } });
      dress(entity, t);
      st.yaw = yaw;
      moved = true;
    } catch (e) {
      console.warn(`[npc] move ${id}: ${e}`);
      entity.remove();
    }
  }
  // Not loaded (or couldn't move): a new one here; the old one is removed when its chunk loads.
  if (!moved) spawn(rec, t, at);
  player.sendMessage(`§aPlaced ${plainName(t)} at ${coords(at)}.§7 Sneak and tap them in creative mode to pick a skin.${note}`);
}

/** @param {Player} player */
function removeNpc(player) {
  const [entity] = player.dimension.getEntities({ type: NPC_TYPE, tags: [OWNER_TAG], location: player.location, maxDistance: CONFIG.removeRange, closest: 1 });
  if (!entity) return player.sendMessage(`§cNo townsfolk within ${CONFIG.removeRange} blocks.`);
  const id = idOf(entity);
  const t = id ? folk.get(id) : undefined;
  const before = list.length;
  list = list.filter((r) => r.id !== id);
  if (list.length !== before) save();
  if (id) states.delete(id);
  entity.remove();
  player.sendMessage(`§aRemoved ${t ? plainName(t) : "that NPC"}. §7Place them again with /realm:npc_add ${id ?? "<id>"}.`);
}

/** @param {Player} player @param {string} id */
function setHome(player, id) {
  const t = folk.get(id);
  const rec = placedOf(id);
  if (!t || !rec) return player.sendMessage(`§c${t ? plainName(t) : id} isn't placed yet: /realm:npc_add ${id} first.`);
  if (player.dimension.id !== rec.dim) return player.sendMessage(`§cA home must be in the same dimension as their post (${dimName(rec.dim)}).`);
  const at = centered(player.location);
  if (dist(at, rec) <= 2) {
    rec.home = undefined;
    save();
    return player.sendMessage(`§a${plainName(t)} no longer has a home: they stay at their post day and night.`);
  }
  rec.home = { x: at.x, y: at.y, z: at.z };
  save();
  const far = dist(at, rec) > 96 ? " §eTip: a home close to the post (under 96 blocks) loads together with it, so they never miss the walk." : "";
  const off = get("nightRoutine") === true ? "" : " §7(Go home at night is disabled in /realm:config.)";
  player.sendMessage(`§a${plainName(t)} now goes home to ${coords(at)} at night.${off}${far}`);
}

/** @param {Player} player */
function listForOps(player) {
  const lines = list.map((r) => {
    const t = folk.get(r.id);
    const home = r.home ? ` §7home ${coords(r.home)}` : "";
    const state = entityOf(r) ? "§a(loaded)" : "§8(not loaded)";
    return `§e${r.id}§f ${t ? plainName(t) : ""}: ${coords(r)} in ${dimName(r.dim)}${home} ${state}`;
  });
  const missing = CONFIG.townsfolk.filter((t) => !placedOf(t.id)).map((t) => t.id);
  player.sendMessage(
    [
      `§6Townsfolk placed: ${list.length}`,
      ...lines,
      missing.length ? `§7Not placed: ${missing.join(", ")} §8(/realm:npc_add <id>)` : "§7Every townsfolk is placed.",
    ].join("\n"),
  );
}

/** @param {Player} player */
function listForPlayers(player) {
  const lines = whereabouts(player);
  if (!lines.length) return player.sendMessage("§7No townsfolk live on this realm yet. Operators place them with /realm:npc_add.");
  player.sendMessage([`§6Townsfolk on the realm §7(tap one to talk):`, ...lines].join("\n"));
}

/**
 * Runs `fn` with the player who ran the command, outside the read-only command context.
 * @param {import("@minecraft/server").CustomCommandOrigin} origin @param {(player: Player) => void} fn
 * @returns {import("@minecraft/server").CustomCommandResult}
 */
function withPlayer(origin, fn) {
  const player = playerOf(origin);
  if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
  system.run(() => {
    try {
      if (!ready) return player.sendMessage("§cThe world is still loading. Try again in a moment.");
      if (player.isValid) fn(player);
    } catch (e) {
      console.warn(`[npc] ${e}`);
      if (player.isValid) player.sendMessage(`§cThat didn't work: ${e}`);
    }
  });
  return { status: CustomCommandStatus.Success };
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerEnum("realm:npc_id", CONFIG.townsfolk.map((t) => t.id));
  const idParam = [{ name: "realm:npc_id", type: CustomCommandParamType.Enum }];

  customCommandRegistry.registerCommand(
    { name: "realm:npc", description: "Townsfolk: who lives on the realm and where they are", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => withPlayer(origin, listForPlayers),
  );
  customCommandRegistry.registerCommand(
    { name: "realm:npc_list", description: "Townsfolk: every placed NPC with its coordinates and home", permissionLevel: CommandPermissionLevel.GameDirectors, cheatsRequired: false },
    (origin) => withPlayer(origin, listForOps),
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:npc_add",
      description: "Townsfolk: place an NPC here, facing you (moves it if it is already placed)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: idParam,
    },
    (origin, /** @type {string} */ id) => withPlayer(origin, (p) => addNpc(p, id)),
  );
  customCommandRegistry.registerCommand(
    { name: "realm:npc_remove", description: "Townsfolk: remove the nearest townsfolk NPC within 5 blocks", permissionLevel: CommandPermissionLevel.GameDirectors, cheatsRequired: false },
    (origin) => withPlayer(origin, removeNpc),
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:npc_home",
      description: "Townsfolk: the NPC goes here at night (run it at their post to clear)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: idParam,
    },
    (origin, /** @type {string} */ id) => withPlayer(origin, (p) => setHome(p, id)),
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "npc_bp");
  },
  { namespaces: ["realm"] },
);
