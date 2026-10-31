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
  getTopmostBlock: () => ({ y: 64 }),
  getBlock: ({ x, y, z }) => ({ typeId: x === 1 && y === 64 && z === 1 ? type : "minecraft:stone" }),
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
