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
  if (ts.isVariableStatement(node) && /\b(postGuard = createSnapGuard|MOVE_DISTANCE = |anchorOf = |dist = )/.test(node.getText(source))) parts.push(node.getText(source));
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
