// Easy Building settings: admin re-checks, nearest option for odd values, presets never raise the realm cap (MCP-038, MCP-035, MCP-032).
import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const mockUrl = pathToFileURL(path.resolve("tools/build-w9-mc-mock.mjs")).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@minecraft/server" || specifier === "@minecraft/server-ui") return { url: mockUrl, shortCircuit: true };
    return next(specifier, context);
  },
});

const S = await import("../packs/build_bp/scripts/core/Settings.js");
const { SETTINGS, changeSetting } = await import("../packs/build_bp/scripts/ui/SettingsUI.js");
const { applyPreset } = await import("../packs/build_bp/scripts/core/Presets.js");

let seq = 0;
function player(op) {
  const props = new Map();
  const sent = [];
  return {
    id: `sa${++seq}`, name: `Sa${seq}`, isValid: true, sent,
    getDynamicProperty: (k) => props.get(k), setDynamicProperty: (k, v) => { if (v === undefined) props.delete(k); else props.set(k, v); },
    hasTag: (tag) => (op ? tag === "admin" || tag === "op" : false),
    commandPermissionLevel: op ? 3 : 0,
    sendMessage: (m) => sent.push(m),
    onScreenDisplay: { setActionBar() {} },
  };
}

test("every admin setting is adminOnly", () => {
  assert.ok(SETTINGS.admin.length > 0);
  for (const s of SETTINGS.admin) assert.equal(s.adminOnly, true, s.id);
});

test("a non-op cannot change an admin setting through changeSetting", async () => {
  const p = player(false);
  const s = SETTINGS.admin.find((x) => x.id === "admin_allow_destroy");
  const before = s.get(p);
  await changeSetting(p, s);
  assert.equal(s.get(p), before);
  await changeSetting(player(true), s);
  assert.notEqual(s.get(p), before, "an op can");
  await changeSetting(player(true), s);
});

test("nearestIndex picks the closest option", () => {
  assert.equal(S.nearestIndex([1, 20, 60, 100], 37), 1);
  assert.equal(S.nearestIndex([1, 20, 60, 100], 1000), 3);
  assert.equal(S.nearestIndex([1, 20, 60, 100], "x"), 0);
});

test("a preset never raises the admin blocks cap", () => {
  const p = player(true);
  S.setAdminMaxBlocksCap(5000);
  const cap = S.getAdminMaxBlocksCap();
  applyPreset(p, "high");
  assert.equal(S.getAdminMaxBlocksCap(), cap);
  assert.equal(S.getMaxBlocks(p), cap);
});
