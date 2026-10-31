// Chest Finder's mark must be obvious to the searcher only: a bounded bright downward arrow
// above sign height, a direction and distance line, action-bar arbitration, and a generation
// that leave, death, dimension change, timeout and a new search can end without wiping another
// pack's note. Headless particles are not visual proof against chests and signs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainPath = new URL("../packs/find_bp/scripts/main.js", import.meta.url);
const src = readFileSync(mainPath, "utf8");

function body(name) {
  const at = src.indexOf(`function ${name}(`);
  if (at < 0) return "";
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return "";
}

const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;

function signal() {
  return {
    subscribe(fn) {
      return fn;
    },
    unsubscribe() {},
  };
}

const mc = {
  tick: 0,
  runs: new Map(),
  nextRun: 1,
  events: [],
};
const events = () => ({
  playerLeave: signal(),
  playerBreakBlock: signal(),
  playerPlaceBlock: signal(),
  playerInteractWithBlock: signal(),
  playerDimensionChange: signal(),
  entityDie: signal(),
  worldLoad: signal(),
  startup: signal(),
  scriptEventReceive: signal(),
});
class Player {}
class CustomCommandRegistry {}
class System {}
class World {}
class MolangVariableMap {
  constructor() {
    this.colors = {};
  }
  setColorRGB(key, color) {
    this.colors[key] = color;
  }
}
const server = {
  Block: class Block {},
  BlockTypes: { get: () => ({}) },
  BlockVolume: class BlockVolume {},
  CommandPermissionLevel: { Any: 0 },
  Container: class Container {},
  CustomCommandParamType: { String: "string" },
  CustomCommandStatus: { Success: 0, Failure: 1 },
  Dimension: class Dimension {},
  EquipmentSlot: { Mainhand: "mainhand" },
  Player,
  MolangVariableMap,
    CustomCommandRegistry,
    System,
    World,
  system: {
    get currentTick() {
      return mc.tick;
    },
    run() {},
    runTimeout() {},
    runInterval(fn) {
      const id = mc.nextRun++;
      mc.runs.set(id, fn);
      return id;
    },
    clearRun(id) {
      mc.runs.delete(id);
    },
    runJob() {},
    sendScriptEvent(id, message) {
      mc.events.push({ id, message });
    },
    beforeEvents: events(),
    afterEvents: events(),
  },
  world: {
    beforeEvents: events(),
    afterEvents: events(),
    getDimension() {
      return {};
    },
    getDynamicProperty() {
      return undefined;
    },
    setDynamicProperty() {},
    getAllPlayers() {
      return [];
    },
  },
};
const ui = {
  ActionFormData: class ActionFormData {},
  FormCancelationReason: { UserBusy: "UserBusy", UserClosed: "UserClosed" },
};
const settings = { get: (key) => (key === "highlightSeconds" ? 10 : undefined) };

const serverUrl = dataUrl(`const s = globalThis.__findMc; export const { Block, BlockTypes, BlockVolume, CommandPermissionLevel, Container, CustomCommandParamType, CustomCommandStatus, Dimension, EquipmentSlot, Player, MolangVariableMap, CustomCommandRegistry, System, World, system, world } = s;`);
const uiUrl = dataUrl(`const u = globalThis.__findUi; export const { ActionFormData, FormCancelationReason } = u;`);
const settingsUrl = dataUrl(`const g = globalThis.__findSettings; export const get = (key) => g.get(key); export const set = () => undefined;`);
globalThis.__findMc = server;
globalThis.__findUi = ui;
globalThis.__findSettings = settings;

const diagCoreUrl = dataUrl(
  readFileSync(new URL("../packs/find_bp/scripts/diag-core.js", import.meta.url), "utf8").replace('from "@minecraft/server"', `from ${JSON.stringify(serverUrl)}`),
);
const diagSrc = readFileSync(new URL("../packs/find_bp/scripts/diag.js", import.meta.url), "utf8").replace('from "./diag-core.js"', `from ${JSON.stringify(diagCoreUrl)}`);
const eventsSrc = readFileSync(new URL("../packs/find_bp/scripts/script-events.js", import.meta.url), "utf8").replace(
  'from "@minecraft/server"',
  `from ${JSON.stringify(serverUrl)}`,
);
const mainSrc = src
  .replace('import "./diag.js";', `import ${JSON.stringify(dataUrl(diagSrc))};`)
  .replace('from "@minecraft/server"', `from ${JSON.stringify(serverUrl)}`)
  .replace('from "@minecraft/server-ui"', `from ${JSON.stringify(uiUrl)}`)
  .replace('from "./config.js"', `from ${JSON.stringify(new URL("../packs/find_bp/scripts/config.js", import.meta.url).href)}`)
  .replace('from "./script-events.js"', `from ${JSON.stringify(dataUrl(eventsSrc))}`)
  .replace('from "./settings.js"', `from ${JSON.stringify(settingsUrl)}`);
const find = await import(dataUrl(mainSrc + "\n// find marker test load"));

test("the mark is a bounded bright downward arrow above sign height, not the faint outline", () => {
  assert.equal(typeof find.markerDraw, "function", "markerDraw is missing; the mark is still the faint villager_happy outline");
  for (const phase of [0, 1]) {
    const pts = find.markerDraw(phase);
    assert.ok(pts.length >= 12 && pts.length <= find.MARKER_CAP, `phase ${phase} has ${pts.length} points`);
    assert.ok(pts.length <= 24);
    for (const p of pts) {
      assert.ok(p.x >= -0.2 && p.x <= 1.2 && p.z >= -0.2 && p.z <= 1.2, "arrow stays on the container column");
      assert.ok(p.y >= 1.5 && p.y <= 6, "arrow floats above the chest, not into the sky");
      assert.ok([find.MARK_BEAM, find.MARK_PULSE].includes(p.particle), p.particle);
      assert.equal(p.particle.includes("villager_happy") || p.particle === "minecraft:endrod", false);
    }
    const shaft = pts.filter((p) => p.x === 0.5 && p.z === 0.5 && p.y >= 2.4);
    assert.ok(shaft.length >= 5, "a beam stands above a sign on the chest face");
    const lowest = pts.reduce((a, b) => (a.y <= b.y ? a : b));
    assert.equal(lowest.x, 0.5);
    assert.equal(lowest.z, 0.5);
    assert.ok(lowest.y < 2.2 && lowest.y > 1.5, "the tip points down at the container, still above its top");
    const wings = pts.filter((p) => p.y > lowest.y && p.y < lowest.y + 1.2 && (p.x !== 0.5 || p.z !== 0.5));
    assert.ok(wings.length >= 4, "the head is a chevron, not another column");
  }
  assert.notDeepEqual(find.markerDraw(0), find.markerDraw(1), "the beam pulses between redraws");
  const draw = body("drawMark");
  assert.match(draw, /markerDraw\(/);
  assert.match(draw, /player\.spawnParticle/);
  assert.equal((draw.match(/spawnParticle/g) || []).length, 1);
  assert.doesNotMatch(draw, /villager_happy|endrod|dimension\.spawnParticle|world\.spawnParticle/);
  assert.match(src, /setColorRGB\(\s*"variable\.color"/);
  assert.ok(find.MARK_COLOR.red + find.MARK_COLOR.green > 1.5 && find.MARK_COLOR.blue < 0.5, "yellow, not the blue endrod column");
});

test("direction and distance are readable and do not leak items or coordinates", () => {
  assert.equal(typeof find.markerGuide, "function");
  assert.deepEqual(find.markerGuide(3, 0, 4), { dist: 5, dir: "SE", vertical: "", text: "5 blocks SE" });
  assert.equal(find.markerGuide(0, 0, -8).dir, "N");
  assert.equal(find.markerGuide(-8, 0, 0).dir, "W");
  assert.equal(find.markerGuide(0, 0, 8).dir, "S");
  assert.equal(find.markerGuide(8, 0, 0).dir, "E");
  assert.equal(find.markerGuide(0, 4.2, -1).text, "4 blocks N, 4 above");
  assert.equal(find.markerGuide(0, -3.2, 1).text, "3 blocks S, 3 below");
  const line = find.markerText("Waxed Oxidized Copper Chest", 1, 0, -12);
  assert.match(line, /^§eWaxed Oxidized Copper Chest§r 12 blocks N$/);
  assert.doesNotMatch(line, /diamond|iron_ingot|-?\d+,\s*-?\d+/);
  assert.doesNotMatch(body("drawMark"), /h\.items|entry\.t/);
  assert.doesNotMatch(body("highlight"), /world\.sendMessage|dimension\.spawnParticle/);
});

test("a redrawn guide requests the action bar and yields to notes and higher steady lines", () => {
  assert.equal(find.MARK_STEADY, 25, "above the story tracker (20), below build mode (30)");
  assert.equal(find.MARK_HOLD, 30);
  assert.deepEqual(find.barPayload("seeker"), { player: "seeker", ticks: 30, from: "find_bp", steady: 25 });
  assert.equal(JSON.stringify(find.barPayload("seeker")).length < 2048, true);
  assert.equal(find.foreignBarHolds({ player: "seeker", ticks: 40, from: "mobhp_bp" }), true);
  assert.equal(find.foreignBarHolds({ player: "seeker", ticks: 40, from: "elytra_bp", steady: 50 }), true);
  assert.equal(find.foreignBarHolds({ player: "seeker", ticks: 40, from: "build_bp", steady: 30 }), true);
  assert.equal(find.foreignBarHolds({ player: "seeker", ticks: 40, from: "saga_bp", steady: 20 }), false);
  assert.equal(find.foreignBarHolds({ player: "seeker", ticks: 40, from: "party_bp", steady: 10, background: true }), false);
  assert.equal(find.foreignBarHolds({ player: "seeker", ticks: 30, from: "find_bp", steady: 25 }), false);
  assert.equal(find.foreignBarHolds({ player: "seeker", ticks: 30, from: "zzz_bp", steady: 25 }), false);
  assert.equal(find.foreignBarHolds({ player: "seeker", ticks: 30, from: "aaa_bp", steady: 25 }), true);
  const draw = body("drawMark");
  assert.match(draw, /requestBar\(/);
  assert.match(draw, /setActionBar\(markerText\(/);
  assert.doesNotMatch(src, /setActionBar\(\s*""\s*\)/);
  assert.match(body("requestBar"), /realm:actionbar/);
});

test("cleanup generations stop the old mark and cannot clear a newer one", () => {
  assert.equal(typeof find.createMarks, "function");
  const marks = find.createMarks();
  const first = find.beginMark(marks, "ann");
  find.claimRun(marks, "ann", first.generation, 11);
  const second = find.beginMark(marks, "ann");
  assert.equal(second.previousRun, 11);
  assert.notEqual(second.generation, first.generation);
  assert.deepEqual(find.endMark(marks, "ann", first.generation), { ended: false, run: undefined });
  assert.equal(marks.byId.get("ann").generation, second.generation);
  find.claimRun(marks, "ann", second.generation, 22);
  assert.equal(find.markShouldDraw({ valid: true, dead: false, sameDimension: true, tick: 10, until: 20, generation: second.generation, current: second.generation }), true);
  assert.equal(find.markShouldDraw({ valid: true, dead: true, sameDimension: true, tick: 10, until: 20, generation: second.generation, current: second.generation }), false);
  assert.equal(find.markShouldDraw({ valid: false, dead: false, sameDimension: true, tick: 10, until: 20, generation: second.generation, current: second.generation }), false);
  assert.equal(find.markShouldDraw({ valid: true, dead: false, sameDimension: false, tick: 10, until: 20, generation: second.generation, current: second.generation }), false);
  assert.equal(find.markShouldDraw({ valid: true, dead: false, sameDimension: true, tick: 21, until: 20, generation: second.generation, current: second.generation }), false);
  assert.equal(find.markShouldDraw({ valid: true, dead: false, sameDimension: true, tick: 10, until: 20, generation: first.generation, current: second.generation }), false);
  const ended = find.endPlayer(marks, "ann");
  assert.equal(ended.ended, true);
  assert.equal(ended.run, 22);
  assert.equal(find.endPlayer(marks, "ann").ended, false);
  assert.match(src, /playerDimensionChange/);
  assert.match(src, /entityDie/);
  assert.match(body("stopOwnedMark") || src, /clearRun/);
  assert.doesNotMatch(body("endOwned") + body("stopOwnedMark") + body("highlight"), /setActionBar\(\s*""\s*\)/);
});
