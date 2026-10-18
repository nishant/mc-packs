import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = read("packs/saga_bp/scripts/objectives.js");
const guideSource = source.slice(source.indexOf("const COLOR_GOLD"), source.indexOf("// Progress"));
const radiusSource = source.slice(source.indexOf("export function radiusOf"), source.indexOf("export const isNight")).replace("export ", "");
const inspectSource = source.slice(source.indexOf("function inspectTick("), source.indexOf("/** A tap or hit near a clue."));
const colors = {
  gold: [1, 0.78, 0.18, 0.58],
  green: [0.25, 0.95, 0.55, 0.52],
  cyan: [0.25, 0.88, 1, 0.62],
};

function fixture({ enabled, inside = false, location = { x: 0, y: 64, z: 0 } } = {}) {
  const calls = [];
  const dimension = {
    id: "minecraft:overworld",
    getBlock: () => ({ typeId: "minecraft:bell" }),
    spawnParticle() { assert.fail("quest guides must stay player-local"); },
  };
  const player = {
    location, dimension,
    spawnParticle(id, at, vars) { calls.push({ id, at: { ...at }, vars: vars?.values }); },
  };
  // Store exactly the names passed to the native API, without inventing a variable.* prefix.
  class MolangVariableMap {
    values = new Map();
    setFloat(name, value) { this.values.set(name, value); }
    setColorRGBA(name, { red, green, blue, alpha }) {
      for (const [suffix, value] of Object.entries({ r: red, g: green, b: blue, a: alpha })) {
        this.values.set(`${name}.${suffix}`, value);
      }
    }
  }
  const context = {
    MolangVariableMap, getFor: () => enabled,
    locate: (obj) => obj.loc, playerIn: () => inside,
    across: (a, b) => Math.hypot(a.x - b.x, a.z - b.z),
    groundAt: () => 64, onBed: () => false,
    system: { currentTick: 0 }, sceneFor: () => ({ data: {} }),
    clueSpot: (_s, obj, k) => obj.clues[k], clueFound: () => assert.fail("fixture is not standing on a clue"),
  };
  const api = runInNewContext(`${radiusSource}\n${guideSource}\n${inspectSource}
    ({ guideVars, drawBlockOutline, drawStandingPad, questGuides, inspectTick })`, context);
  const loc = { dim: dimension.id, x: 10.5, y: 64, z: 0.5 };
  return { ...api, calls, dimension, player, loc };
}

function tint(call) {
  return ["r", "g", "b", "a"].map((key) => call.vars.get(`variable.color.${key}`));
}

test("all three particle assets consume the exact variables emitted by quest code", () => {
  const f = fixture();
  const vars = f.guideVars({ r: 0.25, g: 0.88, b: 1, a: 0.62 }, 1).values;
  for (const axis of ["x", "y", "z"]) {
    const asset = read(`packs/build_rp/particles/guide_${axis}.json`);
    for (const name of new Set(asset.match(/variable\.[a-z]+(?:\.[rgba])?/g))) {
      assert.ok(vars.has(name), `${axis} particle input ${name} was not supplied`);
    }
    const effect = JSON.parse(asset).particle_effect;
    assert.equal(effect.description.identifier, `realm:guide_${axis}`);
    assert.equal(effect.components["minecraft:particle_lifetime_expression"].max_lifetime, "variable.life");
  }
  assert.equal(vars.get("variable.life"), 1.15);
  assert.equal(vars.get("variable.style"), 1);
  assert.deepEqual(["r", "g", "b", "a"].map((c) => vars.get(`variable.color.${c}`)), colors.cyan);
  const main = read("packs/saga_bp/scripts/main.js");
  assert.match(main, /const LOOP_TICKS = 20;/);
  assert.ok(vars.get("variable.life") > 20 / 20, "particle lives beyond the next one-second redraw");
});

test("six block faces remain block-aligned, just outside the block, with one shared map", () => {
  const f = fixture();
  const vars = f.guideVars({ r: 1, g: 0.78, b: 0.18, a: 0.58 });
  f.drawBlockOutline(f.player, -1.2, 64.8, 3.9, vars);
  assert.deepEqual(f.calls.map(({ id, at }) => ({ id, at })), [
    { id: "realm:guide_y", at: { x: -1.5, y: 65.015, z: 3.5 } },
    { id: "realm:guide_y", at: { x: -1.5, y: 63.985, z: 3.5 } },
    { id: "realm:guide_x", at: { x: -2.015, y: 64.5, z: 3.5 } },
    { id: "realm:guide_x", at: { x: -0.9850000000000001, y: 64.5, z: 3.5 } },
    { id: "realm:guide_z", at: { x: -1.5, y: 64.5, z: 2.985 } },
    { id: "realm:guide_z", at: { x: -1.5, y: 64.5, z: 4.015 } },
  ]);
  assert.ok(f.calls.every((c) => c.vars === vars.values));
});

test("destinations are gold outside and green inside, with full and corner tiles", () => {
  for (const inside of [false, true]) {
    const f = fixture({ inside });
    f.questGuides(f.player, {}, 0, { type: "reach", loc: f.loc });
    assert.equal(f.calls.length, 15);
    const center = f.calls.find((c) => c.vars.get("variable.style") === 0);
    assert.ok(center, "the standing pad includes a full-outline center tile");
    assert.deepEqual(tint(center), inside ? colors.green : colors.gold);
    assert.equal(f.calls.filter((c) => c.vars.get("variable.style") === 1).length, 14);
    assert.equal(center.at.y, 64.02, "pad is above the supporting floor, not buried inside it");
  }
});

test("zone guides keep the existing twelve-tile, capped-radius ring", () => {
  const f = fixture();
  f.questGuides(f.player, {}, 0, { type: "vigil", radius: 30, loc: f.loc });
  assert.equal(f.calls.length, 27);
  assert.ok(f.calls.slice(15).every(({ at }) => Math.hypot(at.x - f.loc.x, at.z - f.loc.z) < 13));
});

test("interaction targets keep cyan full outlines on at most four matching blocks", () => {
  const f = fixture();
  f.questGuides(f.player, {}, 0, { type: "interact", radius: 1, blocks: ["minecraft:bell"], loc: f.loc });
  assert.equal(f.calls.length, 24);
  assert.ok(f.calls.every((c) => c.vars.get("variable.style") === 0));
  assert.ok(f.calls.every((c) => JSON.stringify(tint(c)) === JSON.stringify(colors.cyan)));
});

test("unfound clues keep cyan block faces and gold air-space brackets", () => {
  const f = fixture();
  f.inspectTick(f.player, { st: {} }, 0, { type: "inspect", loc: f.loc, clues: [{ x: 10.5, y: 64.5, z: 0.5 }] });
  const custom = f.calls.filter((c) => c.id.startsWith("realm:guide_"));
  assert.equal(custom.length, 12);
  assert.deepEqual(tint(custom[0]), colors.cyan);
  assert.deepEqual(tint(custom[6]), colors.gold);
  assert.equal(custom[6].vars.get("variable.style"), 1);
});

test("preferences, unresolved locations, dimensions and nearby ranges still gate guides", () => {
  const disabled = fixture({ enabled: false });
  disabled.questGuides(disabled.player, {}, 0, { type: "reach", loc: disabled.loc });
  disabled.inspectTick(disabled.player, { st: {} }, 0, { type: "inspect", loc: disabled.loc, clues: [{ x: 10.5, y: 64.5, z: 0.5 }] });
  assert.equal(disabled.calls.filter((c) => c.id.startsWith("realm:guide_")).length, 0);
  for (const loc of [undefined, "missing", { pending: true }, { dim: "minecraft:nether" }, { dim: "minecraft:overworld", x: 41, z: 0 }]) {
    const f = fixture();
    f.questGuides(f.player, {}, 0, { type: "reach", loc });
    assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  f.questGuides(f.player, {}, 0, { type: "reach", loc: { ...f.loc, x: 40, z: 0 } });
  assert.equal(f.calls.length, 15, "default-on preference includes the existing 40-block boundary");
  const tick = source.slice(source.indexOf("export function tickPlayer("));
  assert.match(tick, /if \(!helps\(e, obj\) \|\| !active\(e, i, saga\)\) return;[\s\S]*?questGuides\(player, e, i, obj\)/);
  assert.match(read("packs/saga_bp/scripts/settings.js"), /key: "spotGuides"[^\n]*default: true/);
});

test("guide assets retain Easy Building's axis-aligned blended face rendering", () => {
  for (const [axis, plane, reference] of [["x", "yz", "eb_x1"], ["y", "xz", "eb_top"], ["z", "xy", "eb_z1"]]) {
    const guide = JSON.parse(read(`packs/build_rp/particles/guide_${axis}.json`)).particle_effect;
    const building = JSON.parse(read(`packs/build_rp/particles/${reference}.json`)).particle_effect;
    const billboard = guide.components["minecraft:particle_appearance_billboard"];
    assert.equal(guide.description.basic_render_parameters.material, building.description.basic_render_parameters.material);
    assert.equal(billboard.facing_camera_mode, `emitter_transform_${plane}`);
    assert.equal(billboard.facing_camera_mode, building.components["minecraft:particle_appearance_billboard"].facing_camera_mode);
    assert.deepEqual(billboard.size, [0.5, 0.5]);
    assert.deepEqual(billboard.uv.uv, ["variable.style * 32", 0]);
    const texture = readFileSync(new URL(`../packs/build_rp/${guide.description.basic_render_parameters.texture}.png`, import.meta.url));
    assert.equal(texture.readUInt32BE(16), 64);
    assert.equal(texture.readUInt32BE(20), 32);
  }
});
