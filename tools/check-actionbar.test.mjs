// tools/check-actionbar.mjs on small fixture packs: the protocol's "a request before every setActionBar" must find real
// bypasses (O56: Easy Building's FloatingPanels.js:318 passed because a function that merely calls a function that
// calls a helper somewhere counted as protected) without turning the repo's own, correct writes into problems.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { analyze, functions, problemsOf } from "./check-actionbar.mjs";

const repo = join(import.meta.dirname, "..");

/** A pack whose scripts are `files` (path under scripts/ -> source). @param {Record<string, string>} files */
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "actionbar-"));
  for (const [path, src] of Object.entries(files)) {
    const file = join(root, "packs", "x_bp", "scripts", path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, src);
  }
  return root;
}
/** The functions with an unprotected write, as "file:function". @param {Record<string, string>} files */
const flagged = (files) => [...analyze(fixture(files)).found].flatMap(([file, names]) => [...names].map((n) => `${file.replace("packs/x_bp/scripts/", "")}:${n}`)).sort();

const BAR = `import { system } from "@minecraft/server";
export function lock(id) { system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: id, ticks: 30, from: "x_bp" })); }
export function notify(id) { lock(id); }
`;
const WRITE = 'player.onScreenDisplay.setActionBar("text");';

// ---------------------------------------------------------------------------
// Writes that must be reported
// ---------------------------------------------------------------------------

test("a method of an object a factory returns is not protected by a helper called somewhere else in the pack", () => {
  // FloatingPanels.js: click() writes after calling functions that only send inside a callback of their own.
  assert.deepEqual(
    flagged({
      "bar.js": BAR,
      "menu.js": `import { lock } from "./bar.js";
export function openPanel(player, id) {
  player.run(() => {
    lock(player.id);
  });
}
export function showSettings(player) {
  openPanel(player, "settings");
  lock(player.id);
}
`,
      "panel.js": `import { openPanel, showSettings } from "./menu.js";
export function settingsPanel() {
  return {
    click(player, id) {
      if (id === "tab") {
        openPanel(player, id);
        return;
      }
      if (id === "preset") {
        ${WRITE}
        return;
      }
      showSettings(player);
    },
  };
}
`,
    }),
    ["panel.js:click"],
  );
});

test("a function of the same name in another file is not the helper the call goes to", () => {
  assert.deepEqual(
    flagged({
      "a.js": 'export function show(player) { system.sendScriptEvent("realm:actionbar", "{}"); }\n',
      "b.js": `function show(player, text) {
  player.onScreenDisplay.setActionBar(text);
}
export function run(player) {
  show(player, "x");
}
`,
    }),
    ["b.js:show"],
  );
});

test("an import is matched to the file it names, not to any function of that name in the pack", () => {
  assert.deepEqual(
    flagged({
      "bar.js": BAR,
      "dummy.js": "export function lock(id) { return id; }\n",
      "use.js": `import { lock } from "./dummy.js";
export function note(player) {
  lock(player.id);
  ${WRITE}
}
`,
    }),
    ["use.js:note"],
  );
});

test("a request after the write, or only in a sibling callback, doesn't count", () => {
  assert.deepEqual(
    flagged({
      "bar.js": BAR,
      "late.js": `import { lock } from "./bar.js";
export function late(player) {
  ${WRITE}
  lock(player.id);
}
`,
      "sibling.js": `import { lock } from "./bar.js";
export function sibling(player, system) {
  system.run(() => lock(player.id));
  ${WRITE}
}
`,
    }),
    ["late.js:late", "sibling.js:sibling"],
  );
});

test("a request in another named function doesn't protect a named function's write", () => {
  assert.deepEqual(
    flagged({
      "bar.js": BAR,
      "two.js": `import { lock } from "./bar.js";
function announce(player) { lock(player.id); }
export function open(player) {
  announce(player);
  system.run(() => draw(player));
}
function draw(player) {
  ${WRITE}
}
`,
    }),
    ["two.js:draw"],
  );
});

test("a method call, an alias or a bind can't hide a write or its request", () => {
  assert.deepEqual(
    flagged({
      "bar.js": BAR,
      "method.js": `import { lock } from "./bar.js";
const helpers = { lock };
export function viaMethod(player) {
  helpers.lock(player.id);
  ${WRITE}
}
`,
      "alias.js": `export function alias(player) {
  const write = player.onScreenDisplay.setActionBar.bind(player.onScreenDisplay);
  write("text");
}
`,
    }),
    ["alias.js:alias", "method.js:viaMethod"],
  );
});

test("a write at the top of a file with no request is reported as the top level", () => {
  assert.deepEqual(flagged({ "top.js": `const hook = { bar: (p, t) => p.onScreenDisplay.setActionBar(t) };\n` }), ["top.js:(top level)"]);
});

// ---------------------------------------------------------------------------
// Writes that are protected
// ---------------------------------------------------------------------------

test("a request before the write, a helper before it, an imported or aliased helper, and a namespace import all protect it", () => {
  assert.deepEqual(
    flagged({
      "bar.js": BAR,
      "direct.js": `export function direct(player, system) {
  system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: player.id, ticks: 40 }));
  ${WRITE}
}
`,
      "local.js": `function hold(player, send) { send("realm:actionbar", { player: player.id, ticks: 40 }); }
export function local(player, send) {
  hold(player, send);
  ${WRITE}
}
`,
      "imported.js": `import { lock } from "./bar.js";
export function imported(player) {
  lock(player.id);
  ${WRITE}
}
`,
      "aliased.js": `import { lock as hold } from "./bar.js";
export function aliased(player) {
  hold(player.id);
  ${WRITE}
}
`,
      "ns.js": `import * as Bar from "./bar.js";
export function viaNamespace(player) {
  Bar.lock(player.id);
  ${WRITE}
}
`,
      "chain.js": `import { notify } from "./bar.js";
export function steadyBar(player, text) {
  notify(player.id);
  player.onScreenDisplay.setActionBar(text);
}
export const note = (player, text) => {
  notify(player.id);
  player.onScreenDisplay.setActionBar(text);
};
`,
    }),
    [],
  );
});

test("a callback is protected by the function that hands it over, before or after the callback", () => {
  assert.deepEqual(
    flagged({
      "bar.js": BAR,
      "cb.js": `import { lock } from "./bar.js";
export function before(player, system) {
  lock(player.id);
  system.run(() => player.onScreenDisplay.setActionBar("text"));
}
export function after(player, system) {
  system.run(() => player.onScreenDisplay.setActionBar("text"));
  lock(player.id);
}
export function timeout(player, system) {
  lock(player.id);
  system.runTimeout(() => {
    ${WRITE}
  }, 10);
}
`,
    }),
    [],
  );
});

test("a request inside the callback's own code protects the callback", () => {
  assert.deepEqual(
    flagged({
      "cb.js": `export function whenever(world) {
  world.afterEvents.x.subscribe((event) => {
    world.sendScriptEvent("realm:actionbar", "{}");
    event.player.onScreenDisplay.setActionBar("text");
  });
}
`,
    }),
    [],
  );
});

test("a helper that only sends inside its own callback is not a helper, but one that sends before calling another is", () => {
  const files = {
    "bar.js": BAR,
    "h.js": `import { lock } from "./bar.js";
export function deferred(player, system) {
  system.run(() => lock(player.id));
}
export function direct(player) {
  lock(player.id);
}
`,
    "use.js": `import { deferred, direct } from "./h.js";
export function usesDeferred(player) {
  deferred(player, null);
  ${WRITE}
}
export function usesDirect(player) {
  direct(player);
  ${WRITE}
}
`,
  };
  assert.deepEqual(flagged(files), ["use.js:usesDeferred"]);
});

// ---------------------------------------------------------------------------
// The allowlist and the repository
// ---------------------------------------------------------------------------

test("an allowlisted function passes, any other doesn't, and --list shows both", () => {
  const found = analyze(fixture({ "hud.js": `export function redraw(player) { ${WRITE} }\nexport function other(player) { ${WRITE} }\n` })).found;
  const allow = { "packs/x_bp/scripts/hud.js": ["redraw"] };
  assert.deepEqual(problemsOf(found, allow, false).problems.length, 1);
  assert.match(problemsOf(found, allow, false).problems[0], /other\(\)/);
  assert.equal(problemsOf(found, allow, false).allowed, 1);
  assert.equal(problemsOf(found, allow, true).problems.length, 2);
});

test("the function finder keeps control blocks out and names definitions, callbacks and expression arrows", () => {
  const src = `
function named(a) { if (isOp(a) && ready(a)) { x(); } for (const y of z) { y(); } }
const arrow = (a) => { return a; };
const expr = (a) => a + 1;
const o = { method(a) { return a; }, prop: (a) => { return a; } };
system.run(() => { run(); });
try { f(); } catch (e) { g(); }
`;
  const found = functions(src).map((f) => `${f.name}${f.expr ? "*" : ""}`).sort();
  assert.deepEqual(found, ["(anonymous)", "(anonymous)", "arrow", "expr*", "method", "named"]);
});

test("the repository passes, and its allowlist stays the bottom lines and one default hook", () => {
  const { found, sites } = analyze(repo);
  const allow = JSON.parse(readFileSync(join(repo, "tools", "check-actionbar.allow.json"), "utf8"));
  delete allow.comment;
  assert.deepEqual(allow, {
    "packs/hud_bp/scripts/main.js": ["(anonymous)"],
    "packs/stash_bp/scripts/pages.js": ["(top level)"],
    "packs/stats_bp/scripts/main.js": ["(anonymous)", "clearTicker"],
  }, "a new exception hides new writes: send the request instead, or explain it here and in the allowlist's comment");
  assert.deepEqual(problemsOf(found, allow, false).problems, []);
  assert.ok(sites >= 80, `${sites} writes checked`);
});

test("Easy Building's preset write sends its request first (O49: FloatingPanels.js)", () => {
  const src = readFileSync(join(repo, "packs", "build_bp", "scripts", "ui", "FloatingPanels.js"), "utf8");
  const at = src.indexOf('setActionBar(t("eb.onboarding.tier_applied"');
  assert.ok(at > 0);
  assert.match(src.slice(src.lastIndexOf("applyPreset(player, arg);", at), at), /lockActionBar\(player\.id, \d+\);/);
});
