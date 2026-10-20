import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const text = fs.readFileSync(path.join(import.meta.dirname, "..", "packs", "npc_bp", "scripts", "main.js"), "utf8");
const ownerTag = /^const OWNER_TAG = "([^"]+)";/m.exec(text)?.[1];
assert.ok(ownerTag, "use the production townsfolk ownership tag");
const source = ts.createSourceFile("main.js", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
/** @type {import("typescript").ArrowFunction | undefined} */
let callback;
function visit(/** @type {import("typescript").Node} */ node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === "world.beforeEvents.playerInteractWithEntity.subscribe") {
    const first = node.arguments[0];
    if (first && ts.isArrowFunction(first)) callback = first;
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(callback, "the test runs Townsfolk's actual entity-interaction callback");
const code = `(${callback.getText(source)})`;

function fixture({ creative = false } = {}) {
  const queued = [];
  const timed = [];
  const warnings = [];
  const conversations = [];
  let identified = 0;
  const handler = vm.runInNewContext(code, {
    NPC_TYPE: "minecraft:npc",
    OWNER_TAG: ownerTag,
    GameMode: { Creative: "Creative" },
    SKIN_SAVE_AFTER: [1, 20],
    isOp: () => true,
    idOf: () => { identified++; return "tobin"; },
    skinAfterEdit: () => undefined,
    tapped: async (...args) => { conversations.push(args); },
    system: {
      run: (fn) => queued.push(fn),
      runTimeout: (fn) => timed.push(fn),
    },
    console: { warn: (message) => warnings.push(message) },
  });
  const player = { isSneaking: creative, isValid: true, getGameMode: () => creative ? "Creative" : "Survival" };
  const target = { typeId: "minecraft:npc", hasTag: (tag) => tag === ownerTag };
  return { handler, player, target, queued, timed, warnings, conversations, identified: () => identified };
}

test("an already-canceled matching townsfolk tap cannot schedule a conversation", () => {
  const f = fixture();
  f.handler({ cancel: true, player: f.player, target: f.target });
  assert.equal(f.identified(), 0);
  assert.equal(f.queued.length, 0);
  assert.equal(f.timed.length, 0);
  assert.equal(f.warnings.length, 0);
});

test("an already-canceled operator edit cannot schedule skin snapshots", () => {
  const f = fixture({ creative: true });
  f.handler({ cancel: true, player: f.player, target: f.target });
  assert.equal(f.identified(), 0);
  assert.equal(f.timed.length, 0);
});

test("an ordinary matching tap still cancels vanilla UI and opens its conversation", async () => {
  const f = fixture();
  const event = { cancel: false, player: f.player, target: f.target };
  f.handler(event);
  assert.equal(event.cancel, true);
  assert.equal(f.queued.length, 1);
  await f.queued[0]();
  assert.equal(f.conversations.length, 1);
  assert.equal(f.conversations[0][0], f.player);
  assert.equal(f.conversations[0][1], f.target);
  assert.equal(f.conversations[0][2], "tobin");
  assert.equal(f.conversations[0][3], false);
});

test("a non-townsfolk interaction is left alone", () => {
  const f = fixture();
  const event = { cancel: false, player: f.player, target: { ...f.target, typeId: "minecraft:armor_stand" } };
  f.handler(event);
  assert.equal(event.cancel, false);
  assert.equal(f.identified(), 0);
  assert.equal(f.queued.length, 0);
});
