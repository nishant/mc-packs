// C13: in the Realm Bundle a tap another pack canceled (Land Claims) is still delivered to the packs loaded after it.
// Wanderers of the Wilds and the Merchant Caravan open their menus on a tap: their real beforeEvents callbacks must
// leave a canceled tap alone (not read it, not schedule a menu).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

for (const folder of ["wander_bp", "caravan_bp"]) {
  test(`${folder}: a tap another pack canceled is ignored`, () => {
    const text = fs.readFileSync(path.join(import.meta.dirname, "..", "packs", folder, "scripts", "main.js"), "utf8");
    const source = ts.createSourceFile("main.js", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    /** @type {import("typescript").ArrowFunction | undefined} */
    let callback;
    const visit = (/** @type {import("typescript").Node} */ node) => {
      if (ts.isCallExpression(node) && node.expression.getText(source) === "world.beforeEvents.playerInteractWithEntity.subscribe") {
        const first = node.arguments[0];
        if (first && ts.isArrowFunction(first)) callback = first;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    assert.ok(callback, "the test runs the pack's actual tap callback");
    let scheduled = 0;
    const ctx = { system: { run: () => scheduled++, runTimeout: () => scheduled++ }, console: { warn() {} } };
    vm.createContext(ctx);
    const fn = vm.runInContext(`(${callback.getText(source)})`, ctx);
    const ev = {
      cancel: true,
      get player() {
        throw new Error("read the player of a canceled tap");
      },
      get target() {
        throw new Error("read the target of a canceled tap");
      },
    };
    assert.doesNotThrow(() => fn(ev));
    assert.equal(scheduled, 0, "no menu scheduled");
    assert.equal(ev.cancel, true, "still canceled");
  });
}
