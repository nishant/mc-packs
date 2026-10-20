// Townsfolk's behave (packs/npc_bp/scripts/main.js), run for real in node with a fake NPC: one whose floor was dug
// out used to be put back up on its post every check and fall again. Now its post moves down to where it landed (no
// loop); one pushed off again and again waits longer each time; one pushed off once goes straight back.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as tether from "./tether-shared.js";

const file = process.env.NPC_MAIN ?? path.join(import.meta.dirname, "..", "packs", "npc_bp", "scripts", "main.js");
const text = fs.readFileSync(file, "utf8");
const source = ts.createSourceFile("main.js", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
/** @type {string[]} */
const parts = [];
function visit(/** @type {import("typescript").Node} */ node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "behave") parts.push(node.getText(source));
  if (ts.isVariableStatement(node) && /\b(postGuard = createSnapGuard|postFall = createFallWatch|MOVE_DISTANCE = |anchorOf = |dist = )/.test(node.getText(source))) parts.push(node.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(parts.some((p) => p.includes("function behave")), "the test runs the actual behave");

/** Air everywhere except a floor at y 63 (feet at 64) with a 2-deep hole at 0,0. */
const blocks = {
  getBlock({ x, y, z }) {
    const hole = x === 0 && z === 0;
    const solid = y < 62 || (y <= 63 && !hole);
    return solid ? { typeId: "minecraft:stone", isAir: false, isLiquid: false } : { typeId: "minecraft:air", isAir: true, isLiquid: false };
  },
};

function run(rec, entity) {
  const ctx = {
    world: { getDimension: () => ({ id: "minecraft:overworld", ...blocks }) },
    system: { currentTick: 0 },
    stateOf: () => ({}),
    save() {},
    loaded: () => true,
    occupied: () => false,
    liftSaved: () => false,
    get: () => false,
    console: { warn() {} },
    createSnapGuard: tether.createSnapGuard,
    settledBelow: tether.settledBelow,
    standable: tether.standable,
    createFallWatch: tether.createFallWatch ?? (() => ({ falling: () => false, forget() {} })),
    floorGone: tether.floorGone,
    freeSpotNear: tether.freeSpotNear,
  };
  vm.createContext(ctx);
  vm.runInContext(`${parts.join("\n")}\nthis.behave = behave;`, ctx);
  return { ctx, check: () => ctx.behave(rec, {}, entity, false) };
}

test("a townsfolk whose floor was dug out is not put back up to fall again", () => {
  const rec = { id: "mara", dim: "minecraft:overworld", x: 0.5, y: 64, z: 0.5, yaw: 0 };
  let ups = 0;
  const ent = {
    dimension: { id: "minecraft:overworld", ...blocks },
    location: { x: 0.5, y: 62, z: 0.5 },
    isOnGround: true,
    teleport(to) {
      ups++;
      this.location = { ...to };
    },
  };
  const { ctx, check } = run(rec, ent);
  for (let k = 0; k < 120; k++) {
    ctx.system.currentTick = k * 10;
    check();
    ent.location = { x: 0.5, y: 62, z: 0.5 }; // put up there, it only falls back down
  }
  assert.ok(ups <= 1, `${ups} put-backs in 60 s`);
  assert.equal(rec.y, 62, "its post moved down to where it stands");
});

test("pushed off once: straight back; pushed off every check: it waits longer each time", () => {
  const rec = { id: "tobin", dim: "minecraft:overworld", x: 5.5, y: 64, z: 5.5, yaw: 0 };
  /** @type {number[]} */
  const at = [];
  const ent = {
    dimension: { id: "minecraft:overworld", ...blocks },
    location: { x: 8.5, y: 64, z: 5.5 },
    isOnGround: true,
    teleport(to) {
      at.push(ctx.system.currentTick);
      this.location = { ...to };
    },
  };
  const { ctx, check } = run(rec, ent);
  check();
  assert.deepEqual(at, [0], "the first push: back at once");
  for (let k = 1; k <= 120; k++) {
    ctx.system.currentTick = k * 10;
    ent.location = { x: 8.5, y: 64, z: 5.5 };
    check();
  }
  assert.ok(at.length < 15, `${at.length} put-backs in 60 s, not 121`);
});

test("dug out, then refilled: the townsfolk goes back up onto its own post, not left inside the new blocks", () => {
  let filled = false;
  const dim = {
    getBlock({ x, y, z }) {
      const hole = x === 0 && z === 0 && !filled;
      const solid = y < 62 || (y <= 63 && !hole);
      return solid ? { typeId: "minecraft:stone", isAir: false, isLiquid: false } : { typeId: "minecraft:air", isAir: true, isLiquid: false };
    },
  };
  const rec = { id: "mara", dim: "minecraft:overworld", x: 0.5, y: 64, z: 0.5, yaw: 0 };
  const ent = {
    dimension: { id: "minecraft:overworld", ...dim },
    location: { x: 0.5, y: 62, z: 0.5 },
    isOnGround: true,
    teleport(to) {
      this.location = { ...to };
    },
  };
  const { ctx } = run(rec, ent);
  ctx.world.getDimension = () => ({ id: "minecraft:overworld", ...dim });
  const check = () => ctx.behave(rec, {}, ent, false);
  check();
  assert.equal(rec.y, 62, "the post moved down while the floor is gone");
  filled = true; // the builder puts the floor back: she is now inside it
  for (let k = 1; k <= 3; k++) {
    ctx.system.currentTick = k * 10;
    check();
  }
  assert.equal(rec.y, 64, "back on its own post");
  assert.equal(ent.location.y, 64, "standing on the refilled floor");
  assert.equal(rec.orig, undefined, "nothing left to go back to");
});

test("its floor dug into water: a townsfolk floating there is not left in the water for good", () => {
  // Floor at y 63 with a pit at 0,0 down to water at y 60 and 61 (stone under it).
  const dim = {
    getBlock({ x, y, z }) {
      const pit = x === 0 && z === 0;
      if (pit && (y === 60 || y === 61)) return { typeId: "minecraft:water", isAir: false, isLiquid: true };
      const solid = y < 60 || (y <= 63 && !pit);
      return solid ? { typeId: "minecraft:stone", isAir: false, isLiquid: false } : { typeId: "minecraft:air", isAir: true, isLiquid: false };
    },
  };
  const rec = { id: "mara", dim: "minecraft:overworld", x: 0.5, y: 64, z: 0.5, yaw: 0 };
  const ent = {
    dimension: { id: "minecraft:overworld", ...dim },
    location: { x: 0.5, y: 61.2, z: 0.5 }, // floating in the pit's water
    isOnGround: false,
    isInWater: true,
    teleport(to) {
      this.location = { ...to };
      this.isInWater = false;
      this.isOnGround = to.y === 64;
    },
  };
  const { ctx } = run(rec, ent);
  ctx.world.getDimension = () => ({ id: "minecraft:overworld", ...dim });
  for (let k = 0; k < 60; k++) {
    ctx.system.currentTick = k * 10;
    ctx.behave(rec, {}, ent, false);
    if (ent.location.y < 63) ent.isInWater = true; // put back over the pit, it drops into the water again
    if (ent.location.y >= 64 && Math.floor(ent.location.x) === 0 && Math.floor(ent.location.z) === 0) ent.location = { x: 0.5, y: 61.2, z: 0.5 };
  }
  assert.ok(ent.location.y >= 64, `out of the water, on the floor (${JSON.stringify(ent.location)})`);
  assert.ok(!(Math.floor(ent.location.x) === 0 && Math.floor(ent.location.z) === 0), "next to the pit, not over it");
});
