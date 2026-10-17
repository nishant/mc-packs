// Structure checks for the Side HUD stack (BDS can't draw a client UI, so this guards the JSON that decides the
// layout: the vanilla scoreboard moves into the right stack, and each stack leaves room for the compass).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ui = JSON.parse(fs.readFileSync(new URL("../packs/hud_rp/ui/hud_screen.json", import.meta.url), "utf8"));
const area = ui.realm_side_area.controls.map((c) => Object.entries(c)[0]);
const byName = (n) => area.find(([k]) => k === n)?.[1];
const names = (stack) => stack.controls.map((c) => Object.keys(c)[0].split("@")[0]);

test("vanilla sidebar leaves root_panel and joins the right stack last", () => {
  const mods = ui.root_panel.modifications;
  assert.ok(mods.some((m) => m.operation === "remove" && m.control_name === "sidebar"));
  const right = names(byName("realm_side_right"));
  assert.equal(right.at(-1), "realm_sidebar");
  const sidebar = byName("realm_side_right").controls.at(-1)["realm_sidebar@scoreboard.scoreboard_sidebar"];
  assert.equal(sidebar.bindings[0].binding_name, "#scoreboard_sidebar_visible");
});

test("right stack order: reserve, radar, four slots, sidebar", () => {
  assert.deepEqual(names(byName("realm_side_right")), [
    "realm_reserve_r", "realm_radar", "realm_right1", "realm_right2", "realm_right3", "realm_right4", "realm_sidebar",
  ]);
});

test("left and right stacks start below the compass band", () => {
  const top = byName("realm_side_top");
  const topH = top.offset[1] + top.controls[0]["realm_top@hud.realm_slot"]["$slot_max"][1];
  for (const [n, spacer] of [["realm_side_right", "realm_reserve_r"], ["realm_side_left", "realm_reserve_l"]]) {
    const stack = byName(n);
    const reserve = stack.controls.find((c) => Object.keys(c)[0].startsWith(spacer))[`${spacer}@hud.realm_reserve`];
    assert.ok(stack.offset[1] + reserve["$reserve_h"] >= topH, `${n} overlaps compass`);
  }
  assert.ok(byName("realm_side_middle").offset[1] >= topH);
});

test("the reserve spacer is visible only while the compass slot is", () => {
  const b = ui.realm_reserve.bindings.at(-1).source_property_name;
  assert.match(b, /%\.1450s/);
  assert.match(b, /§s§2§r/);
});

test("stacks stay in their own half so left and right cannot collide", () => {
  for (const n of ["realm_side_right", "realm_side_left", "realm_side_middle"]) assert.equal(byName(n).size[0], "50%");
});
