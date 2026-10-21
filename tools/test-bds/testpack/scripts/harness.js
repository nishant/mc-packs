// BDS harness test pack: runs the scenario (scripts/scenario.js) when the harness sends
// `scriptevent harness:start`, and reports to run.mjs through "HARNESS {json}" console lines.
// This pack may use beta modules (@minecraft/server-gametest); the packs under test may not.
import * as mc from "@minecraft/server";
import * as gt from "@minecraft/server-gametest";
import scenario from "./scenario.js";
import { OWNED_AREAS_KEY, addOwnedArea, afterTickingAreaAdd, areaChunkSpots, ownedAreaName, radiusProblem, readOwnedAreas, releaseOwnedAreas, tickingAreaCommandProblem } from "./tickingarea.js";

const { world, system, GameMode, CommandPermissionLevel } = mc;

function out(obj) {
  let s;
  try {
    s = JSON.stringify(obj, (k, v) => (typeof v === "bigint" ? String(v) : v));
  } catch (e) {
    s = JSON.stringify({ type: obj.type, msg: String(obj.msg ?? obj) });
  }
  console.warn("HARNESS " + s);
}

const strip = (s) => String(s ?? "").replace(/\u00a7./g, "");
const fmt = (a) => (typeof a === "string" ? a : (() => { try { return JSON.stringify(a); } catch (e) { return String(a); } })());

// ---------------------------------------------------------------------------
// Relayed messages and forms from the shims in the packs under test
// ---------------------------------------------------------------------------

const parts = new Map();
/** @type {{tick:number, pack:string, kind:string, to:string, text:string, plain:string, raw?:unknown}[]} */
const messages = [];
/** @type {any[]} */
const forms = [];
const answers = new Map(); // player name -> queued answers
const msgWaiters = new Set();
const formWaiters = new Set();
let formTimeout = 100;
let echoActionBar = false;

function reassemble(raw) {
  let p;
  try { p = JSON.parse(raw); } catch (e) { return undefined; }
  if (p.n === 1) return JSON.parse(p.d);
  let entry = parts.get(p.k);
  if (!entry) parts.set(p.k, (entry = []));
  entry[p.i] = p.d;
  if (entry.filter((x) => x !== undefined).length < p.n) return undefined;
  parts.delete(p.k);
  return JSON.parse(entry.join(""));
}

const argText = (a) => {
  if (a === undefined || a === null) return "";
  if (typeof a === "string") return a;
  if (typeof a === "object") {
    let s = "";
    if (typeof a.text === "string") s += a.text;
    if (typeof a.translate === "string") s += "%" + a.translate;
    if (Array.isArray(a.rawtext)) s += a.rawtext.map(argText).join("");
    return s;
  }
  return String(a);
};

/** Turns the recorded builder calls into a readable form description. */
function describe(f) {
  const form = { id: f.id, pack: f.pack, player: f.player, type: f.form, title: "", body: "", buttons: [], elements: [], tick: system.currentTick, answered: false, response: undefined };
  for (const { m, args } of f.calls) {
    switch (m) {
      case "title": form.title = strip(argText(args[0])); break;
      case "body": form.body = strip(argText(args[0])); break;
      case "button": form.buttons.push(strip(argText(args[0]))); form.elements.push({ kind: "button", text: strip(argText(args[0])) }); break;
      case "button1": form.buttons[0] = strip(argText(args[0])); break;
      case "button2": form.buttons[1] = strip(argText(args[0])); break;
      case "label": case "header": form.elements.push({ kind: m, text: strip(argText(args[0])) }); break;
      case "divider": form.elements.push({ kind: "divider", text: "" }); break;
      case "textField": {
        const o = args[2];
        form.elements.push({ kind: "textField", label: strip(argText(args[0])), placeholder: strip(argText(args[1])), default: typeof o === "object" && o ? o.defaultValue ?? "" : o ?? "" });
        break;
      }
      case "dropdown": {
        const o = args[2];
        form.elements.push({ kind: "dropdown", label: strip(argText(args[0])), options: (args[1] || []).map((x) => strip(argText(x))), default: typeof o === "object" && o ? o.defaultValueIndex ?? 0 : o ?? 0 });
        break;
      }
      case "slider": {
        const o = args[3];
        const def = typeof o === "object" && o ? o.defaultValue : args[4];
        form.elements.push({ kind: "slider", label: strip(argText(args[0])), min: args[1], max: args[2], default: def ?? args[1] });
        break;
      }
      case "toggle": {
        const o = args[1];
        form.elements.push({ kind: "toggle", label: strip(argText(args[0])), default: typeof o === "object" && o ? !!o.defaultValue : !!o });
        break;
      }
      case "submitButton": form.submit = strip(argText(args[0])); break;
      default: break;
    }
  }
  return form;
}

const CANCEL = { canceled: true, cancelationReason: "UserClosed" };

/** Turns a scenario answer into a form response. */
function toResponse(form, answer) {
  if (typeof answer === "function") answer = answer(form);
  if (answer === null || answer === undefined || answer === "cancel") return CANCEL;
  if (answer === "busy") return { canceled: true, cancelationReason: "UserBusy" };
  if (form.type === "action" || form.type === "message") {
    let sel = answer;
    if (typeof answer === "string") {
      const want = strip(answer).toLowerCase();
      sel = form.buttons.findIndex((b) => b !== undefined && strip(b).toLowerCase() === want);
      if (sel < 0) sel = form.buttons.findIndex((b) => b !== undefined && strip(b).toLowerCase().includes(want));
      if (sel < 0) throw new Error(`form "${form.title}" has no button matching "${answer}" (buttons: ${form.buttons.join(" | ")})`);
    }
    if (typeof sel !== "number") throw new Error(`answer for ${form.type} form "${form.title}" must be a button index or label`);
    return { canceled: false, selection: sel };
  }
  // modal
  if (Array.isArray(answer)) return { canceled: false, formValues: answer };
  if (typeof answer === "object") {
    const used = new Set();
    const values = form.elements.map((el) => {
      if (!("default" in el)) return undefined;
      const key = Object.keys(answer).find((k) => !used.has(k) && strip(el.label).toLowerCase().includes(strip(k).toLowerCase()));
      if (key === undefined) return el.default;
      used.add(key);
      let v = answer[key];
      if (el.kind === "dropdown" && typeof v === "string") {
        const i = el.options.findIndex((o) => o.toLowerCase().includes(v.toLowerCase()));
        if (i < 0) throw new Error(`dropdown "${el.label}" has no option "${v}" (options: ${el.options.join(" | ")})`);
        v = i;
      }
      return v;
    });
    const unused = Object.keys(answer).filter((k) => !used.has(k));
    if (unused.length) throw new Error(`modal form "${form.title}" has no input matching: ${unused.join(", ")}`);
    return { canceled: false, formValues: values };
  }
  if (answer === true || answer === "submit") return { canceled: false, formValues: form.elements.map((el) => el.default) };
  throw new Error(`cannot use ${fmt(answer)} as a modal form answer`);
}

function reply(form, response) {
  if (form.answered) return false;
  form.answered = true;
  form.response = response;
  system.sendScriptEvent("harness:form_reply", JSON.stringify({ pack: form.pack, id: form.id, response }));
  out({ type: "form_answer", player: form.player, pack: form.pack, title: form.title, response });
  return true;
}

function onForm(raw) {
  const form = describe(raw);
  form.answer = (a) => reply(form, toResponse(form, a));
  forms.push(form);
  if (forms.length > 5000) forms.splice(0, 1000); // a long soak shows thousands: keep memory flat, like messages
  out({ type: "form", player: form.player, pack: form.pack, form: form.type, title: form.title, body: form.body.slice(0, 300), buttons: form.buttons, elements: form.type === "modal" ? form.elements : undefined });
  const queue = answers.get(form.player);
  if (queue && queue.length) {
    const a = queue.shift();
    try { form.answer(a); } catch (e) { out({ type: "error", msg: String(e) }); reply(form, CANCEL); }
  } else {
    system.runTimeout(() => reply(form, CANCEL), formTimeout);
  }
  for (const w of [...formWaiters]) w(form);
}

function onMsg(m) {
  const msg = { tick: system.currentTick, pack: m.pack, kind: m.kind, to: m.to, text: m.text, plain: strip(m.text), raw: m.raw };
  // setTitle's options: the subtitle as sent, and how long the title shows (fade in + stay + fade out).
  if (m.kind === "title" && m.sub && typeof m.sub === "object") {
    if (typeof m.sub.subtitle === "string") msg.subtitle = m.sub.subtitle;
    msg.ticks = (Number(m.sub.fadeInDuration) || 0) + (Number(m.sub.stayDuration) || 0) + (Number(m.sub.fadeOutDuration) || 0);
  }
  messages.push(msg);
  if (messages.length > 5000) messages.splice(0, 1000);
  if (m.kind !== "actionbar" || echoActionBar) out({ type: "msg", kind: m.kind, pack: m.pack, to: m.to, text: msg.plain.slice(0, 500) });
  for (const w of [...msgWaiters]) w(msg);
}

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id === "harness:relay") {
    let p;
    try { p = reassemble(ev.message); } catch (e) { out({ type: "error", msg: "bad relay: " + e }); return; }
    if (!p) return;
    if (p.type === "msg") onMsg(p);
    else if (p.type === "form") onForm(p);
  } else if (ev.id === "harness:profile_reset") {
    tickMeterReset();
  } else if (ev.id === "harness:profile_dump") {
    tickMeterDump();
  } else if (ev.id === "harness:start") {
    let cfg = {};
    try { cfg = JSON.parse(ev.message || "{}"); } catch (e) { /* ignore */ }
    system.run(() => run(cfg));
  }
});

// ---------------------------------------------------------------------------
// Server tick meter (run.mjs --profile): wall time between consecutive ticks, as one script sees it
// ---------------------------------------------------------------------------

let meter = null;
function tickMeterReset() {
  if (meter) system.clearRun(meter.id);
  meter = { startTick: system.currentTick, startWall: Date.now(), last: Date.now(), deltas: [] };
  const m = meter;
  m.id = system.runInterval(() => { const n = Date.now(); m.deltas.push(n - m.last); m.last = n; }, 1);
}
function tickMeterDump() {
  if (!meter) return;
  const d = meter.deltas.slice(1);
  const sorted = [...d].sort((a, b) => a - b);
  const pct = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
  const ticks = system.currentTick - meter.startTick;
  const wallMs = Date.now() - meter.startWall;
  console.warn("PROFILE_SERVER " + JSON.stringify({
    ticks, wallMs, tps: ticks / Math.max(0.001, wallMs / 1000),
    tickIntervalAvgMs: d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0,
    tickIntervalP95Ms: pct(0.95), tickIntervalP99Ms: pct(0.99), tickIntervalMaxMs: sorted[sorted.length - 1] || 0,
    ticksOver50ms: d.filter((x) => x > 55).length, ticksOver100ms: d.filter((x) => x > 100).length,
  }));
}

// ---------------------------------------------------------------------------
// Scenario API
// ---------------------------------------------------------------------------

class Stop extends Error {
  constructor(ok, msg, restart = false) { super(msg); this.ok = ok; this.restart = restart; }
}

const PERM = { any: 0, member: 0, gamedirectors: 1, op: 1, operator: 1, admin: 2, host: 3, owner: 4 };
const MODES = { survival: GameMode.Survival, creative: GameMode.Creative, adventure: GameMode.Adventure, spectator: GameMode.Spectator };

function runCmd(target, cmd) {
  const c = String(cmd).replace(/^\s*\//, "");
  const bad = tickingAreaCommandProblem(c);
  if (bad) throw new Stop(false, `/${c}: ${bad}`);
  try {
    const r = target.runCommand(c);
    return { ok: (r?.successCount ?? 0) > 0, successCount: r?.successCount ?? 0 };
  } catch (e) {
    return { ok: false, successCount: 0, error: String(e?.message ?? e) };
  }
}

/**
 * Ticking areas are saved with the world, so the ones loadArea added would still be there after t.restart(). Removes
 * them, only the ones this harness added (its saved list, checked name by name; a scenario's own areas are never
 * touched) and says why when one cannot be removed. It runs when a phase asks for the restart, while every chunk of its
 * areas is loaded: removed at the start of the next phase instead, an area whose chunks were still loading from the
 * save left those chunks unloadable for that whole run (no area added over them afterwards ever loaded them: the
 * atlas scenario's phase 2, "chunk at 2000,2000 did not load in 400 ticks", with only the new area in use). The start
 * of each phase still removes what is listed, for a phase that ended without asking for the restart.
 * An area that cannot be removed at the restart stays listed so the next phase's start tries once more; that start is
 * the last try, and what still fails there leaves the list (the game answers a remove of an area that is already gone,
 * say after a scenario's "/tickingarea remove_all", with no success, so keeping it would retry and log it forever).
 * @param {string} what how the log names the areas
 * @param {{ keepFailed?: boolean }} [options] keepFailed: list what could not be removed for the next phase to retry
 */
function removeOwnedAreas(what, { keepFailed = false } = {}) {
  let raw;
  try {
    raw = world.getDynamicProperty(OWNED_AREAS_KEY);
  } catch (e) {
    out({ type: "log", msg: `ticking area cleanup: the saved list could not be read: ${e}` });
    return;
  }
  const { removed, problems } = releaseOwnedAreas(raw, (area) => runCmd(world.getDimension(area.dimension), `tickingarea remove ${area.name}`));
  if (removed.length) out({ type: "log", msg: `${what} removed: ${removed.map((a) => a.name).join(", ")}` });
  for (const problem of problems) out({ type: "log", msg: `ticking area cleanup: ${problem}` });
  const failed = readOwnedAreas(raw).areas.filter((a) => !removed.some((r) => r.name === a.name && r.dimension === a.dimension));
  if (failed.length && !keepFailed) out({ type: "log", msg: `ticking area cleanup: no more tries for ${failed.map((a) => a.name).join(", ")}; dropped from the saved list (an area that is already gone cannot be removed either)` });
  const left = keepFailed ? failed : [];
  try {
    // this key only: a scenario's own saved data is not ours to clear
    world.setDynamicProperty(OWNED_AREAS_KEY, left.length ? JSON.stringify(left) : undefined);
  } catch (e) {
    out({ type: "log", msg: `ticking area cleanup: the saved list could not be updated: ${e}` });
  }
}

/**
 * Ticks loadArea (and a phase start, for the saved areas) waits after the last chunk of an area can be read, before
 * the area may be removed. Measured on BDS 1.26.52 with two busy CPU loops beside it (the perf soak's spawn pattern,
 * 12 spawns a run, x 2 runs each): removed 2 ticks after, 2 to 5 of 12 spawns a chunk over failed; 10, 20 or 40 ticks
 * after, none did. 20 is twice the shortest that held.
 */
const AREA_SETTLE_TICKS = 20;

/**
 * The areas an earlier phase saved with the world load again when the server starts, and one removed before its chunks
 * have loaded leaves them unloadable for the whole run (areaChunkSpots in tickingarea.js). So the start of a phase waits
 * (up to `timeout` ticks) until every chunk of each listed area can be read, before they are removed.
 * @param {number} [timeout]
 */
async function settleOwnedAreas(timeout = 400) {
  let listed;
  try {
    listed = readOwnedAreas(world.getDynamicProperty(OWNED_AREAS_KEY)).areas;
  } catch (e) {
    return;
  }
  // An entry saved without its place (a list from before places were kept): give the world's areas the time an area of
  // radius 4 takes to load all its chunks (30 ticks after its middle in BDS 1.26.52), with room to spare.
  if (listed.some((a) => a.radius === undefined)) await system.waitTicks(Math.min(timeout, 100));
  const areas = listed.filter((a) => a.radius !== undefined);
  if (!areas.length) return;
  const spots = areas.flatMap((a) => areaChunkSpots(/** @type {number} */ (a.x), /** @type {number} */ (a.z), /** @type {number} */ (a.radius)).map((s) => ({ ...s, dimension: a.dimension })));
  const loading = () => spots.filter((s) => { try { return !world.getDimension(s.dimension).getBlock({ x: s.x, y: 0, z: s.z }); } catch (e) { return true; } });
  const end = system.currentTick + timeout;
  while (loading().length && system.currentTick < end) await system.waitTicks(1);
  const left = loading().length;
  if (!left) await system.waitTicks(AREA_SETTLE_TICKS);
  if (left) out({ type: "log", msg: `ticking area cleanup: ${left} of the ${spots.length} chunks of ${areas.map((a) => a.name).join(", ")} still loading after ${timeout} ticks; removing them anyway` });
}

function matches(text, pattern) {
  if (pattern === undefined) return true;
  if (pattern instanceof RegExp) return pattern.test(text);
  if (typeof pattern === "function") return !!pattern(text);
  return text.toLowerCase().includes(String(pattern).toLowerCase());
}

const toName = (p) => (p === undefined ? undefined : typeof p === "string" ? p : p.name);

const SEE_THROUGH = /air|barrier|structure_void|light_block|vine|snow_layer|tallgrass|short_grass|tall_grass|fern|flower|torch|sapling|bush/;
/** The highest block a player can stand on, skipping invisible marker blocks some packs place high up. */
function findGround(dimension, top) {
  let b = top;
  for (let i = 0; i < 400 && b; i++) {
    if (!SEE_THROUGH.test(b.typeId) && b.isSolid !== false) return b;
    b = b.below(); // throws while the chunk is not ticking: loadArea retries
  }
  return false;
}

function makeT(cfg) {
  const failures = [];
  let spawnArea = 0;
  /** The areas loadArea added in this phase, saved so the next phase can remove them. @type {{ name: string, dimension: string }[]} */
  let owned = [];
  const t = {
    mc, gt, world, system,
    config: cfg,
    /** run.mjs --arg key=value pairs (strings). */
    args: cfg.args || {},
    packs: cfg.packs || [],
    /** With run.mjs --bundle: [{folder, name, members}] of the bundle running as one script context; otherwise null. */
    bundle: cfg.bundle || null,
    get tick() { return system.currentTick; },
    get dimension() { return world.getDimension("overworld"); },
    get messagesAll() { return messages; },
    failures,

    log: (...a) => out({ type: "log", msg: a.map(fmt).join(" ") }),
    /** Hands run.mjs a named structured result (the perf soak's workload report); it lands in the profile JSON. */
    report: (name, data) => out({ type: "report", name: String(name), data }),
    wait: (ticks = 1) => system.waitTicks(Math.max(1, Math.floor(ticks))),
    seconds: (s) => system.waitTicks(Math.max(1, Math.round(s * 20))),

    async waitUntil(fn, { timeout = 200, interval = 1, message } = {}) {
      const end = system.currentTick + timeout;
      for (;;) {
        let v;
        try { v = await fn(); } catch (e) { v = undefined; }
        if (v) return v;
        if (system.currentTick >= end) throw new Stop(false, message || `waitUntil timed out after ${timeout} ticks`);
        await system.waitTicks(interval);
      }
    },

    assert(cond, msg = "assertion failed") {
      if (!cond) throw new Stop(false, msg);
      out({ type: "check", ok: true, msg });
    },
    check(cond, msg = "check failed") {
      out({ type: "check", ok: !!cond, msg });
      if (!cond) failures.push(msg);
      return !!cond;
    },
    fail(msg = "failed") { throw new Stop(false, msg); },
    /** Ends this phase; run.mjs stops the server, starts it again on the same world and runs the scenario again with t.phase + 1. */
    restart(msg = "restart requested") { throw new Stop(true, msg, true); },
    phase: cfg.phase || 1,
    pass(msg = "passed") { throw new Stop(true, msg); },
    allowError(pattern) {
      out({ type: "allow_error", pattern: pattern instanceof RegExp ? pattern.source : String(pattern), flags: pattern instanceof RegExp ? pattern.flags : "" });
    },
    set formTimeout(n) { formTimeout = n; },
    get formTimeout() { return formTimeout; },
    set echoActionBar(v) { echoActionBar = !!v; },

    /** Waits until the chunk column at x,z can be read, loading it with a ticking area (circle radius 1 to 4), and until every chunk of that area is loaded, so the area can be removed at once. */
    async loadArea(x, z, { dimension = world.getDimension("overworld"), radius = 2, timeout = 400 } = {}) {
      const badRadius = radiusProblem(radius);
      if (badRadius) throw new Stop(false, `loadArea(${x}, ${z}): ${badRadius}`);
      const name = ownedAreaName(t.phase, ++spawnArea);
      const add = runCmd(dimension, `tickingarea add circle ${Math.floor(x)} 0 ${Math.floor(z)} ${radius} ${name} true`);
      if (add.ok) {
        try {
          owned = addOwnedArea(owned, { name, dimension: dimension.id, x: Math.floor(x), z: Math.floor(z), radius });
          world.setDynamicProperty(OWNED_AREAS_KEY, JSON.stringify(owned));
        } catch (e) {
          out({ type: "log", msg: `ticking area ${name} is not in the harness's saved list, so the next phase will not remove it: ${e}` });
        }
      }
      // getTopmostBlock can answer before the chunk ticks (with y 319): also require that the
      // block can be read and that a standing spot below it can be found.
      const readGround = () => {
        const top = dimension.getTopmostBlock({ x: Math.floor(x), z: Math.floor(z) });
        if (!top || !dimension.getBlock(top.location)) return false;
        return findGround(dimension, top);
      };
      if (!add.ok) {
        let readable = false;
        try { readable = !!readGround(); } catch (e) { readable = false; }
        const after = afterTickingAreaAdd({ x, z, radius, add, readable });
        if (after.action === "fail") throw new Stop(false, after.message);
        out({ type: "log", msg: `loadArea: ${after.message}` });
      }
      const startTick = system.currentTick;
      const ground = await t.waitUntil(readGround, { timeout, message: `chunk at ${x},${z} did not load in ${timeout} ticks` });
      if (add.ok) {
        // The rest of the area too: removing an area while some of its chunks are still loading leaves them
        // unloadable for the whole run (tickingarea.js, areaChunkSpots), and scenarios remove it right after.
        const spots = areaChunkSpots(x, z, radius);
        const y = ground.location.y;
        const loading = () => spots.filter((s) => { try { return !dimension.getBlock({ x: s.x, y, z: s.z }); } catch (e) { return true; } });
        const left = Math.max(1, timeout - (system.currentTick - startTick));
        const all = await t.waitUntil(() => loading().length === 0, { timeout: left }).then(() => true, () => false);
        if (!all) throw new Stop(false, `chunk at ${x},${z} loaded, but ${loading().length} of the ${spots.length} chunks of its ticking area ${name} did not load in ${timeout} ticks`);
        // A chunk that can be read is not quite done yet: removed within 2 ticks of that, chunks still got stuck.
        await system.waitTicks(AREA_SETTLE_TICKS);
      }
      return { top: ground, name };
    },

    /**
     * Spawns a simulated player. opts: {x, y, z} (y defaults to the top block + 1; x, z default to
     * the world spawn), dimension ("overworld"), gameMode ("survival"), op (false; true = GameDirectors,
     * or a level name such as "admin").
     */
    async player(name = "Tester", opts = {}) {
      const dimension = typeof opts.dimension === "string" ? world.getDimension(opts.dimension) : opts.dimension || world.getDimension("overworld");
      const sp = world.getDefaultSpawnLocation();
      const x = opts.x ?? sp.x, z = opts.z ?? sp.z;
      let y = opts.y, groundId;
      if (y === undefined) {
        const { top: ground } = await t.loadArea(x, z, { dimension });
        groundId = ground.typeId;
        y = ground.location.y + 1;
      } else {
        await t.loadArea(x, z, { dimension }).catch(() => undefined);
      }
      const mode = MODES[String(opts.gameMode || "survival").toLowerCase()] ?? GameMode.Survival;
      const p = gt.spawnSimulatedPlayer({ dimension, x: Math.floor(x) + 0.5, y, z: Math.floor(z) + 0.5 }, name, mode);
      out({ type: "player", name, location: { x: Math.floor(x), y, z: Math.floor(z) }, standingOn: groundId });
      if (opts.op) t.op(p, opts.op === true ? "gamedirectors" : opts.op);
      await system.waitTicks(opts.settle ?? 10);
      return p;
    },

    /** Sets a player's command permission level ("gamedirectors" by default, i.e. operator). */
    op(p, level = "gamedirectors") {
      const v = typeof level === "number" ? level : PERM[String(level).toLowerCase()];
      p.commandPermissionLevel = v ?? CommandPermissionLevel.GameDirectors;
      out({ type: "log", msg: `${p.name} commandPermissionLevel = ${p.commandPermissionLevel}` });
    },
    deop(p) { p.commandPermissionLevel = CommandPermissionLevel.Any; },

    /** Runs a command as the player (custom realm: commands work). Returns {ok, successCount, error}. */
    cmd(p, cmd) {
      const r = runCmd(p, cmd);
      out({ type: "cmd", as: p.name, cmd: String(cmd), ...r });
      return r;
    },
    /** Runs a command as the server, from the overworld (no player: commands needing one fail). */
    server(cmd) {
      const r = runCmd(world.getDimension("overworld"), cmd);
      out({ type: "cmd", as: "server", cmd: String(cmd), ...r });
      return r;
    },
    /** Types a command into the BDS console (output appears in the log only). */
    async console(cmd) {
      out({ type: "console", cmd: String(cmd).replace(/^\s*\//, "") });
      await system.waitTicks(2);
    },
    /** Makes the simulated player chat (packs cannot see chat with stable APIs). */
    chat(p, text) { p.chat(text); },

    /** Messages sent to a player (sendMessage, titles, action bar) and broadcasts. */
    messages(p, { kind, pack, since = 0 } = {}) {
      const n = toName(p);
      return messages.filter((m) => (n === undefined || m.to === n || m.to === "*") && (!kind || m.kind === kind) && (!pack || m.pack === pack) && m.tick >= since);
    },
    clearMessages() { messages.length = 0; },
    /** Waits for a message to the player whose plain text matches (string = contains, RegExp, fn). */
    waitMessage(p, pattern, { timeout = 200, kind, pack, since } = {}) {
      const n = toName(p);
      const ok = (m) => (n === undefined || m.to === n || m.to === "*") && (!kind || m.kind === kind) && (!pack || m.pack === pack) && matches(m.plain, pattern);
      if (since !== undefined) {
        const hit = messages.find((m) => m.tick >= since && ok(m));
        if (hit) return Promise.resolve(hit);
      }
      return new Promise((resolve, reject) => {
        const w = (m) => { if (ok(m)) { msgWaiters.delete(w); system.clearRun(timer); resolve(m); } };
        msgWaiters.add(w);
        const timer = system.runTimeout(() => { msgWaiters.delete(w); reject(new Stop(false, `no message matching ${pattern} for ${n ?? "anyone"} within ${timeout} ticks`)); }, timeout);
      });
    },

    /** Queues answers for the next forms shown to the player (index, button label, values, null = close). */
    answerForm(p, ...ans) {
      const n = toName(p);
      if (!answers.has(n)) answers.set(n, []);
      answers.get(n).push(...ans);
    },
    forms(p) { const n = toName(p); return forms.filter((f) => n === undefined || f.player === n); },
    /** Waits for the next form shown to the player (from now on); returns it, still open unless an answer was queued. */
    waitForm(p, { timeout = 200, title } = {}) {
      const n = toName(p);
      return new Promise((resolve, reject) => {
        const w = (f) => { if ((n === undefined || f.player === n) && matches(f.title, title)) { formWaiters.delete(w); system.clearRun(timer); resolve(f); } };
        formWaiters.add(w);
        const timer = system.runTimeout(() => { formWaiters.delete(w); reject(new Stop(false, `no form${title ? ` titled ${title}` : ""} for ${n ?? "anyone"} within ${timeout} ticks`)); }, timeout);
      });
    },
  };
  return t;
}

let started = false;
async function run(cfg) {
  if (started) return;
  started = true;
  const t = makeT(cfg);
  out({ type: "start", tick: system.currentTick });
  await settleOwnedAreas();
  removeOwnedAreas("ticking areas from earlier phases");
  let ok = true, msg = "scenario finished", restart = false;
  try {
    await scenario(t);
  } catch (e) {
    if (e instanceof Stop) { ok = e.ok; msg = e.message; restart = e.restart && !t.failures.length; }
    else { ok = false; msg = `scenario threw: ${e}${e && e.stack ? "\n" + e.stack : ""}`; }
  }
  if (ok && t.failures.length) { ok = false; msg = `${t.failures.length} check(s) failed: ${t.failures.join("; ")}`; }
  if (restart) removeOwnedAreas("this phase's ticking areas (before the restart)", { keepFailed: true });
  out({ type: "done", ok, msg, restart, phase: t.phase, forms: forms.length, messages: messages.length });
}

system.runTimeout(() => out({ type: "ready" }), 1);
