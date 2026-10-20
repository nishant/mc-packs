// Story Questlines: a party shares a step's scene (objectives.js partyPlays) exactly when party sync shares the chapter
// (party.js together()). Before, partyPlays left out together()'s `installed.ready`, so while the installed packs were
// not known yet the main story's scenes were already shared but its progress was not, and a mate the shared scene's
// credit didn't reach lost the step. Both functions run for real in node, with every setting combination.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const dir = path.join(import.meta.dirname, "..", "packs", "saga_bp", "scripts");
/** The text of a function declared in a file. @param {string} file @param {string} name */
function grab(file, name) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(dir, file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  /** @type {string | undefined} */
  let fn;
  (function visit(/** @type {import("typescript").Node} */ node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) fn = node.getText(source).replace(/^export /, "");
    ts.forEachChild(node, visit);
  })(source);
  assert.ok(fn, `the test runs the actual ${name}`);
  return fn;
}

/** @type {Record<string, unknown>} */
const settings = {};
const ctx = { installed: { ready: false }, get: (/** @type {string} */ k) => settings[k] };
vm.createContext(ctx);
vm.runInContext(`${grab("party.js", "together")}\n${grab("objectives.js", "partyPlays")}\nthis.together = together; this.partyPlays = partyPlays;`, ctx);
const { together, partyPlays } = /** @type {any} */ (ctx);

test("a scene is shared exactly when party sync shares the chapter", () => {
  let cases = 0;
  for (const ready of [false, true])
    for (const enabled of [true, false])
      for (const partyStory of [true, false])
        for (const partyShare of [true, false])
          for (const kind of ["main", "side", "festival", undefined, "heart", "wanderer"]) {
            ctx.installed.ready = ready;
            Object.assign(settings, { enabled, partyStory, partyShare });
            const story = { id: "s", kind };
            const why = JSON.stringify({ ready, enabled, partyStory, partyShare, kind });
            assert.equal(partyPlays({ story }), together(story), why);
            assert.equal(partyPlays({ story, fav: 0 }), false, `a daily favor stays the player's own ${why}`);
            assert.equal(partyPlays({ story, wv: "w" }), false, `a wanderer job stays the player's own ${why}`);
            cases++;
          }
  assert.equal(cases, 96);
});

test("the main story isn't shared before the installed packs are known", () => {
  ctx.installed.ready = false;
  Object.assign(settings, { enabled: true, partyStory: true, partyShare: true });
  assert.equal(partyPlays({ story: { id: "act1_signs", kind: "main" } }), false);
  ctx.installed.ready = true;
  assert.equal(partyPlays({ story: { id: "act1_signs", kind: "main" } }), true);
});
