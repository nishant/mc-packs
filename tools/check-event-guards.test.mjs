// F25: tools/check-event-guards.mjs catches a handler whose own id guard drifted from its onScriptEvent ids.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkFile } from "./check-event-guards.mjs";

const dir = mkdtempSync(join(tmpdir(), "event-guards-"));
let n = 0;
const run = (/** @type {string} */ src) => {
  const f = join(dir, `f${++n}.js`);
  writeFileSync(f, `import { onScriptEvent } from "./script-events.js";\n${src}\n`);
  return checkFile(f);
};

test("a guard that lists exactly the registered ids passes", () => {
  assert.deepEqual(run(`onScriptEvent(["realm:a", "realm:b"], ({ id }) => { if (id !== "realm:a" && id !== "realm:b") return; go(id); });`), []);
  assert.deepEqual(run(`onScriptEvent("realm:a", (ev) => { if (ev.id !== "realm:a" || ev.sourceType !== 1) return; go(); });`), []);
});

test("an id registered but missing from the guard is reported", () => {
  const out = run(`onScriptEvent(["realm:a", "realm:b", "realm:new"], ({ id }) => { if (id !== "realm:a" && id !== "realm:b") return; go(id); });`);
  assert.equal(out.length, 1);
  assert.match(out[0], /drops "realm:new"/);
});

test("the guard part of an || condition counts too", () => {
  const out = run(`onScriptEvent(["realm:t", "realm:u"], (ev) => { if (ev.id !== "realm:t" || ev.sourceType !== 1) return; go(); });`);
  assert.match(out.join("\n"), /drops "realm:u"/);
});

test("ids an earlier branch took and returned from don't need to be in a later guard", () => {
  const src = `onScriptEvent(["realm:a", "realm:b", "realm:c"], ({ id, message }) => {
    if (id === "realm:a") { pingA(); return; }
    if (id === "realm:b") return;
    if (id !== "realm:c") return;
    use(message);
  });`;
  assert.deepEqual(run(src), []);
  const drift = src.replace(`["realm:a", "realm:b", "realm:c"]`, `["realm:a", "realm:b", "realm:c", "realm:d"]`);
  assert.match(run(drift).join("\n"), /drops "realm:d"/);
});

test("comparing with an id that isn't registered is reported, in an if or a switch", () => {
  assert.match(run(`onScriptEvent(["realm:a"], ({ id }) => { if (id === "realm:zz") go(); });`).join("\n"), /checks "realm:zz"/);
  assert.match(run(`onScriptEvent(["realm:a"], ({ id }) => { switch (id) { case "realm:a": break; case "realm:zz": break; } });`).join("\n"), /case "realm:zz"/);
});

test("a named handler, a renamed id and a const list of ids are followed", () => {
  const out = run(`const IDS = ["realm:a", "realm:b"];
function onEvent({ id: what }) { if (what !== "realm:a") return; go(); }
onScriptEvent(IDS, onEvent);`);
  assert.match(out.join("\n"), /drops "realm:b"/);
});

test('a handler for every event ("*") decides by itself and is not checked', () => {
  assert.deepEqual(run(`onScriptEvent("*", ({ id }) => { if (id !== "realm:x") return; go(); });`), []);
});
