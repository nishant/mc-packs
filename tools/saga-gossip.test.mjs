// W10 Saga O52: townsfolk gossip from act, wander_chain and wander_hostile goes through the
// same 1000-tick town-news gate as the other packs. Runs the real ui.js gossip helper. No Minecraft server.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const UI = path.join(import.meta.dirname, "..", "packs", "saga_bp", "scripts", "ui.js");

/** @param {string} file @param {string} name */
function extractFunction(file, name) {
  const text = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(path.basename(file), text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  /** @type {import("typescript").FunctionDeclaration | undefined} */
  let node;
  function visit(/** @type {import("typescript").Node} */ n) {
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) node = n;
    ts.forEachChild(n, visit);
  }
  visit(source);
  return node?.getText(source);
}

test("saga town gossip waits 1000 game ticks, tells each key once, and remembers 64 keys", () => {
  const gossip = extractFunction(UI, "gossip");
  assert.equal(typeof gossip, "string", "saga ui.js gossip helper missing");
  assert.equal(gossip.includes("Date.now"), false, "gate is timed by game ticks, not wall clock");
  assert.equal(gossip.includes("getDynamicProperty"), false, "gate is process memory, not saved data");

  const sent = [];
  const api = vm.runInNewContext(
    [
      '"use strict";',
      "const NEWS_GAP = 1000;",
      "let newsAt = -NEWS_GAP;",
      "const newsSeen = new Set();",
      "const system = { currentTick: 0 };",
      "const send = (id, msg) => sent.push([id, JSON.stringify(msg)]);",
      gossip,
      "({",
      "  go(key, tick) { system.currentTick = tick; return gossip(key, { kind: 'act', player: 'p' }); },",
      "  size: () => newsSeen.size,",
      "})",
    ].join("\n"),
    { sent },
    { filename: "saga-ui-gossip.js" },
  );

  assert.equal(api.go("a", 0), true, "first gossip at tick 0 is allowed");
  assert.equal(api.go("b", 999), false, "999 ticks later is dropped, not queued");
  assert.equal(api.go("b", 1000), true, "exactly 1000 ticks later is allowed");
  assert.equal(api.go("b", 2000), false, "the same key is told once");
  for (let i = 0; i < 63; i++) assert.equal(api.go("k" + i, 3000 + i * 1000), true, "key " + i);
  assert.equal(api.size(), 64, "remembered keys stay at 64");
  const at = 3000 + 62 * 1000;
  assert.equal(api.go("a", at), false, "a key evicted from memory still waits for the gap");
  assert.equal(api.go("a", at + 1000), true, "after the gap an evicted key can be told again");

  assert.equal(sent.length, 66, "every allowed line is sent once");
  for (const [id, payload] of sent) {
    assert.equal(id, "realm:gossip");
    assert.ok(payload.length < 2048, "payload under 2048 characters");
    assert.match(payload, /^[\x00-\x7f]*$/, "payload is ASCII");
  }
});
