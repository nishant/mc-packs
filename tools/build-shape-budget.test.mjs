// Bounded shape generators (MCP-017) and the opts.cap parameter of getPositions (MCP-033).
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

const G = await import("../packs/build_bp/scripts/utils/GeometryUtils.js");
const { CubeMode } = await import("../packs/build_bp/scripts/modes/CubeMode.js");

test("a huge circle is flagged oversize without scanning", () => {
  const t0 = Date.now();
  for (const out of [
    G.hollowCircleXZ(0, 64, 0, 3000),
    G.circleXZ(0, 64, 0, 3000),
    G.ellipseXZ(0, 64, 0, 3000, 3000),
    G.hollowEllipseXZ(0, 64, 0, 3000, 3000),
    G.sphere({ x: 0, y: 64, z: 0 }, { x: 300, y: 64, z: 0 }),
    G.shellSphere({ x: 0, y: 64, z: 0 }, { x: 300, y: 64, z: 0 }),
    G.cylinder({ x: 0, y: 64, z: 0 }, { x: 3000, y: 70, z: 0 }),
    G.hollowCylinder({ x: 0, y: 64, z: 0 }, { x: 3000, y: 70, z: 0 }),
    G.ellipseCylinder({ x: 0, y: 64, z: 0 }, { x: 3000, y: 70, z: 3000 }),
    G.hollowEllipseCylinder({ x: 0, y: 64, z: 0 }, { x: 3000, y: 70, z: 3000 }),
  ]) {
    assert.equal(out.oversize, true);
    assert.equal(out.length, 0);
  }
  assert.ok(Date.now() - t0 < 500, "oversize detection must not scan the cells");
});

test("a normal circle is unchanged", () => {
  const c = G.circleXZ(0, 64, 0, 10);
  assert.equal(c.oversize, undefined);
  assert.equal(c.length, 317);
  const h = G.hollowCircleXZ(0, 64, 0, 10);
  assert.equal(h.oversize, undefined);
  assert.ok(h.length > 20 && h.length < c.length);
  assert.ok(G.sphere({ x: 0, y: 64, z: 0 }, { x: 10, y: 64, z: 0 }).length > 4000);
});

test("CubeMode.getPositions honors opts.cap", () => {
  const player = { id: "cap1", getDynamicProperty: () => undefined, setDynamicProperty() {} };
  const a = { x: 0, y: 64, z: 0 }, b = { x: 9, y: 73, z: 9 };
  const capped = CubeMode.getPositions(a, b, player, null, { cap: 51 });
  assert.equal(capped.length, 51);
  const full = CubeMode.getPositions(a, b, player, null, { cap: 5000 });
  assert.equal(full.length, 100);
});

test("hollow shapes are judged by their shell, not their bounding volume", () => {
  const cap = 50001;
  const s = G.shellSphere({ x: 0, y: 64, z: 0 }, { x: 50, y: 64, z: 0 }, cap);
  assert.equal(s.oversize, undefined);
  assert.ok(s.length > 20000 && s.length < cap);
  const c = G.hollowCylinder({ x: 0, y: 0, z: 0 }, { x: 50, y: 100, z: 0 }, cap);
  assert.equal(c.oversize, undefined);
  assert.ok(c.length > 40000 && c.length < cap);
  assert.equal(G.hollowCircleXZ(0, 64, 0, 500, cap).oversize, undefined);
});
