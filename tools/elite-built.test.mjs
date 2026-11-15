import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { MinecraftBlockTypes } from "@minecraft/vanilla-data";

const text = fs.readFileSync(path.join(import.meta.dirname, "..", "packs", "elite_bp", "scripts", "main.js"), "utf8");
const source = ts.createSourceFile("elite.js", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const wanted = new Set(["nearBuilt", "scanBuilt", "builtAround"]);
const snippets = [];
for (const statement of source.statements) {
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(source) === "BUILT") snippets.push(`const BUILT = ${declaration.initializer.getText(source)};`);
    }
  } else if (ts.isFunctionDeclaration(statement) && statement.name && wanted.has(statement.name.text)) {
    snippets.push(statement.getText(source));
  }
}
assert.equal(snippets.length, 4, "execute the actual classifier and both actual protection scanners");
const { nearBuilt, builtAround } = vm.runInNewContext(`${snippets.join("\n")}\n({nearBuilt, builtAround});`);
const makeDimension = (type = "minecraft:stone") => ({
  heightRange: { min: 0, max: 320 },
  // The top block is the block at y 64, read through getBlock so a test that breaks getBlock breaks it too.
  getTopmostBlock({ x, z }) {
    const b = this.getBlock({ x, y: 64, z });
    return { y: 64, get typeId() { return b.typeId; } };
  },
  getBlock: ({ x, y, z }) => ({ typeId: x === 1 && y === 64 && z === 1 ? type : "minecraft:stone" }),
});

test("the lightning scan finds a build under the top blocks too, and reads the top blocks before anything below them", () => {
  const reads = [];
  const dim = makeDimension();
  dim.getBlock = ({ x, y, z }) => {
    reads.push(y);
    return { typeId: x === -3 && y === 62 && z === 2 ? "minecraft:chest" : "minecraft:stone" };
  };
  assert.equal(nearBuilt(dim, 0, 0), true, "a chest two blocks under the surface");
  assert.ok(reads.slice(0, 81).every((y) => y === 64), "the 81 top blocks come first");
  reads.length = 0;
  dim.getTopmostBlock = ({ x, z }) => ({ y: 64, typeId: x === 4 && z === 4 ? "minecraft:oak_planks" : "minecraft:grass_block" });
  assert.equal(nearBuilt(dim, 0, 0), true, "planks on top in the last column");
  assert.equal(reads.length, 0, "a build on top ends the scan before any block under the tops is read");
});

test("the pinned vanilla registry spells the block minecraft:noteblock", () => {
  assert.ok(Object.values(MinecraftBlockTypes).includes("minecraft:noteblock"));
  assert.equal(Object.values(MinecraftBlockTypes).includes("minecraft:note_block"), false);
});

test("a Bedrock noteblock protects nearby lightning columns", () => {
  assert.equal(nearBuilt(makeDimension("minecraft:noteblock"), 0, 0), true);
});

test("a Bedrock noteblock protects a champion's spawn box", () => {
  assert.equal(builtAround(makeDimension("minecraft:noteblock"), { x: 0, y: 64, z: 0 }), true);
});

test("existing player-made blocks still protect both areas and natural stone does not", () => {
  for (const type of ["minecraft:oak_planks", "minecraft:chest", "minecraft:brick_stairs"]) {
    assert.equal(nearBuilt(makeDimension(type), 0, 0), true, type);
    assert.equal(builtAround(makeDimension(type), { x: 0, y: 64, z: 0 }), true, type);
  }
  assert.equal(nearBuilt(makeDimension(), 0, 0), false);
  assert.equal(builtAround(makeDimension(), { x: 0, y: 64, z: 0 }), false);
});

test("unreadable columns remain protected rather than becoming a spawn candidate", () => {
  const dim = makeDimension();
  dim.getBlock = () => { throw new Error("LocationInUnloadedChunkError"); };
  assert.equal(nearBuilt(dim, 0, 0), true);
  assert.equal(builtAround(dim, { x: 0, y: 64, z: 0 }), true);
});
