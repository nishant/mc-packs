// Story Questlines' tendActors (packs/saga_bp/scripts/actors.js), run for real in node with a fake actor: an anchored
// story character whose floor is gone falls, and used to be teleported back up every second to fall again. Now it gets
// a new spot where it landed (no loop), one pushed off again and again waits longer each time, and one pushed off once
// goes straight back.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as tether from "./tether-shared.js";

const file = process.env.SAGA_ACTORS ?? path.join(import.meta.dirname, "..", "packs", "saga_bp", "scripts", "actors.js");
const text = fs.readFileSync(file, "utf8");
const source = ts.createSourceFile("actors.js", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
/** @type {string[]} */
const parts = [];
function visit(/** @type {import("typescript").Node} */ node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "tendActors") parts.push(node.getText(source).replace(/^export /, ""));
  if (ts.isVariableStatement(node) && /anchorGuard = createSnapGuard|anchorFall = createFallWatch/.test(node.getText(source))) parts.push(node.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(parts.some((p) => p.includes("function tendActors")), "the test runs the actual tendActors");

function run(entity, anchor) {
  const ctx = {
    actors: new Map([["a1", { ent: entity, anchor: { ...anchor }, invul: false }]]),
    dressing: new Map(),
    nameLabels: { removeFor() {} },
    dress() {},
    dressed: () => true,
    dist3: (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
    system: { currentTick: 0 },
    createSnapGuard: tether.createSnapGuard,
    settledBelow: tether.settledBelow,
    standable: tether.standable,
    createFallWatch: tether.createFallWatch,
    floorGone: tether.floorGone,
    freeSpotNear: tether.freeSpotNear,
  };
  vm.createContext(ctx);
  vm.runInContext(`${parts.join("\n")}\nthis.tend = tendActors;`, ctx);
  return ctx;
}

/** Air everywhere except a floor at y 63 (feet at 64) that has a 3-deep hole at 0,0. */
const dim = {
  getBlock({ x, y, z }) {
    const hole = x === 0 && z === 0;
    const solid = y < 63 ? !(hole && y >= 61) : y === 63 && !hole;
    return solid ? { typeId: "minecraft:stone", isAir: false, isLiquid: false } : { typeId: "minecraft:air", isAir: true, isLiquid: false };
  },
};

test("an anchored character whose floor is gone is not put back up to fall again", () => {
  const anchor = { x: 0.5, y: 64, z: 0.5 };
  let teleports = 0;
  const ent = {
    isValid: true,
    dimension: dim,
    location: { x: 0.5, y: 61, z: 0.5 }, // fell to the bottom of the hole
    isOnGround: true,
    teleport(to) {
      teleports++;
      this.location = { ...to };
    },
  };
  const ctx = run(ent, anchor);
  for (let s = 0; s < 60; s++) {
    ctx.system.currentTick = s * 20;
    ctx.tend();
    ent.location = { x: 0.5, y: 61, z: 0.5 }; // a teleport up only drops it back down
  }
  assert.ok(teleports <= 1, `${teleports} put-backs in 60 s`);
  assert.equal(ctx.actors.get("a1").anchor.y, 61, "its spot moved down to where it landed");
});

test("pushed off once: straight back; pushed off every second: it waits longer each time", () => {
  const anchor = { x: 5.5, y: 64, z: 5.5 };
  /** @type {number[]} */
  const at = [];
  const ent = {
    isValid: true,
    dimension: dim,
    location: { x: 9.5, y: 64, z: 5.5 },
    isOnGround: true,
    teleport(to) {
      at.push(ctx.system.currentTick);
      this.location = { ...to };
    },
  };
  const ctx = run(ent, anchor);
  ctx.tend();
  assert.deepEqual(at, [0], "the first push: back at once");
  for (let s = 1; s <= 60; s++) {
    ctx.system.currentTick = s * 20;
    ent.location = { x: 9.5, y: 64, z: 5.5 }; // something pushes it off again
    ctx.tend();
  }
  assert.ok(at.length < 15, `${at.length} put-backs in 60 s, not 61`);
  const gaps = at.slice(1).map((t, i) => t - at[i]);
  assert.ok(gaps.every((g, i) => i === 0 || g >= gaps[i - 1]), `waits grow: ${gaps.join(",")}`);
});

test("floor gone, then refilled: the character goes back up onto its own spot, not left inside the new blocks", () => {
  let filled = false;
  const dim2 = {
    getBlock({ x, y, z }) {
      if (filled) return y <= 63 ? { typeId: "minecraft:stone", isAir: false, isLiquid: false } : { typeId: "minecraft:air", isAir: true, isLiquid: false };
      return dim.getBlock({ x, y, z });
    },
  };
  const ent = {
    isValid: true,
    dimension: dim2,
    location: { x: 0.5, y: 61, z: 0.5 },
    isOnGround: true,
    teleport(to) {
      this.location = { ...to };
    },
  };
  const ctx = run(ent, { x: 0.5, y: 64, z: 0.5 });
  ctx.tend();
  assert.equal(ctx.actors.get("a1").anchor.y, 61, "a new spot where it landed while the floor is gone");
  filled = true;
  ctx.system.currentTick = 20;
  ctx.tend();
  assert.equal(ctx.actors.get("a1").anchor.y, 64, "its own spot again");
  assert.equal(ent.location.y, 64, "standing on the refilled floor");
});

test("its floor dug into water: a character floating there is not left in the water for good", () => {
  const dim3 = {
    getBlock({ x, y, z }) {
      const pit = x === 0 && z === 0;
      if (pit && (y === 60 || y === 61)) return { typeId: "minecraft:water", isAir: false, isLiquid: true };
      const solid = y < 60 || (y <= 63 && !pit);
      return solid ? { typeId: "minecraft:stone", isAir: false, isLiquid: false } : { typeId: "minecraft:air", isAir: true, isLiquid: false };
    },
  };
  const ent = {
    isValid: true,
    dimension: dim3,
    location: { x: 0.5, y: 61.2, z: 0.5 },
    isOnGround: false,
    isInWater: true,
    teleport(to) {
      this.location = { ...to };
      this.isInWater = false;
      this.isOnGround = true;
    },
  };
  const ctx = run(ent, { x: 0.5, y: 64, z: 0.5 });
  for (let s = 0; s < 30; s++) {
    ctx.system.currentTick = s * 20;
    ctx.tend();
    // Put back over the pit, it only drops into the water again.
    if (Math.floor(ent.location.x) === 0 && Math.floor(ent.location.z) === 0) Object.assign(ent, { location: { x: 0.5, y: 61.2, z: 0.5 }, isInWater: true, isOnGround: false });
  }
  assert.ok(ent.location.y >= 64, `out of the water, on the floor (${JSON.stringify(ent.location)})`);
  assert.ok(!(Math.floor(ent.location.x) === 0 && Math.floor(ent.location.z) === 0), "next to the pit, not over it");
});
