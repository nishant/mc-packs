// MCP-041: the Easy Building panel data (EntityPanelData.js) and the resource-pack animations that draw it must agree.
// Banner ids, coach lesson ranges and coach text lines are written in two places; a drift shows the wrong page or a blank line.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.join(import.meta.dirname, "..");
const { PANELS, COACH_LESSONS, COACH_STEPS } = await import(
  new URL("../packs/build_bp/scripts/core/EntityPanelData.js", import.meta.url).href
);
const animations = path.join(root, "packs", "build_rp", "animations");
const read = (/** @type {string} */ name) => fs.readFileSync(path.join(animations, name), "utf8");
const numeric = (/** @type {number[]} */ list) => [...list].sort((a, b) => a - b);

test("every panel's banner ids match the v.p_coach tests in its animation", () => {
  let checked = 0;
  for (const [key, panel] of Object.entries(PANELS)) {
    const banners = /** @type {number[]} */ (panel.banners ?? []);
    if (!banners.length) continue;
    const text = read(`panel_${key}.animation.json`);
    const found = new Set([...text.matchAll(/v\.p_coach == (\d+)/g)].map((m) => Number(m[1])));
    assert.deepEqual(numeric([...found]), numeric(banners), `${key}: banners vs v.p_coach`);
    checked++;
  }
  assert.ok(checked > 0, "at least one panel has banners");
});

test("the coach animation's lesson step ranges match COACH_LESSONS", () => {
  const text = read("panel_coach.animation.json");
  const ranges = [...text.matchAll(/\(v\.p_step >= (\d+) && v\.p_step <= (\d+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(ranges, COACH_LESSONS.map((l) => [l.first, l.first + l.steps - 1]));
});

test("the coach animation has a text line for every step and a stuck-hint line for every hinted step", () => {
  const text = read("panel_coach.animation.json");
  // v.cs = step * 2 + (stuck ? 1 : 0): the even line is the step text, the odd line is its hint.
  const lines = new Set([...text.matchAll(/v\.cs == (\d+)/g)].map((m) => Number(m[1])));
  const steps = COACH_STEPS.map((_, i) => i);
  assert.deepEqual(numeric([...new Set([...lines].map((n) => Math.floor(n / 2)))]), steps, "a text line for every step");
  const hinted = COACH_STEPS.flatMap((s, i) => (s.hint ? [i] : []));
  const withHint = steps.filter((i) => lines.has(i * 2 + 1));
  assert.deepEqual(withHint, hinted, "the hint line exists exactly for steps with a hint");
});
