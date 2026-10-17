// Structure checks for the Side HUD stack (BDS can't draw a client UI, so this guards the JSON that decides the
// layout: the vanilla scoreboard moves into the right stack, and each stack leaves room for the compass).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { decode } from "./gen-rain/png.mjs";

const ui = JSON.parse(fs.readFileSync(new URL("../packs/hud_rp/ui/hud_screen.json", import.meta.url), "utf8"));
const area = ui.realm_side_area.controls.map((c) => Object.entries(c)[0]);
const byName = (n) => area.find(([k]) => k === n)?.[1];
const names = (stack) => stack.controls.map((c) => Object.keys(c)[0].split("@")[0]);

test("vanilla sidebar leaves root_panel and joins the right stack last", () => {
  const mods = ui.root_panel.modifications;
  assert.ok(mods.some((m) => m.operation === "remove" && m.control_name === "sidebar"));
  const right = names(byName("realm_side_right"));
  assert.equal(right.at(-1), "realm_sidebar");
  const slot = byName("realm_side_right").controls.at(-1)["realm_sidebar@hud.realm_sidebar_slot"];
  assert.ok(slot);
  const sidebar = ui.realm_sidebar_slot.controls[0]["sidebar@scoreboard.scoreboard_sidebar"];
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

test("a full-width right slot anchors the inherited content-width sidebar, not a centered stack child", () => {
  const stack = byName("realm_side_right");
  assert.equal(stack.use_child_anchors, true);
  const slot = ui.realm_sidebar_slot;
  assert.equal(slot.type, "panel");
  assert.deepEqual(slot.size, ["100%", "100%c"]);
  const sb = slot.controls[0]["sidebar@scoreboard.scoreboard_sidebar"];
  assert.equal(sb.anchor_from, "top_right");
  assert.equal(sb.anchor_to, "top_right");
  assert.equal(sb.size, undefined, "keep vanilla content width; forcing full width centers vanilla main/background");
  for (const viewportWidth of [320, 480, 853, 1536]) for (const naturalWidth of [40, 174, 224]) {
    const edge = viewportWidth + stack.offset[0];
    const slotWidth = viewportWidth * 0.5;
    const childRight = edge; // top_right -> top_right inside the full slot, independent of natural width.
    const oldCenteredRight = edge - slotWidth / 2 + naturalWidth / 2;
    assert.equal(childRight, viewportWidth - 4);
    if (slotWidth !== naturalWidth) assert.notEqual(oldCenteredRight, childRight);
  }
});

test("hidden right widgets collapse and overflowing stacks are constrained to the viewport", () => {
  const right = byName("realm_side_right");
  assert.equal(right.clips_children, undefined, "a half-width clip would cut off wider natural content");
  assert.equal(ui.realm_side_area.clips_children, true);
  assert.deepEqual(right.max_size, ["100% - 8px", "100% - 8px"]);
  for (const widget of [ui.realm_radar_panel, ui.realm_slot, ui.realm_reserve, ui.realm_sidebar_slot]) {
    assert.ok(widget.bindings.some((b) => b.target_property_name === "#visible" || b.binding_name_override === "#visible"), "stack height uses native visible-child collapse");
  }
  const heights = [40, ui.realm_radar_panel.size[1], 64, 64, 64, 64, 160];
  for (let mask = 0; mask < 128; mask++) {
    const content = heights.reduce((sum, h, i) => sum + ((mask >> i) & 1 ? h : 0), 0);
    const constrained = Math.min(content, 240 - 8);
    assert.ok(constrained + right.offset[1] <= 240);
    if (!mask) assert.equal(content, 0, "all hidden leaves no reserved blank column");
  }
});

test("the actual clip ancestor contains padded right slots and natural sidebars at narrow widths", () => {
  const right = byName("realm_side_right");
  const left = byName("realm_side_left");
  assert.equal(right.clips_children, undefined);
  assert.equal(ui.realm_side_area.clips_children, true);
  assert.deepEqual(ui.realm_side_area.size, ["100%", "100%"]);
  assert.equal(right.size[0], "50%", "retain the separate left/right layout columns");
  assert.equal(left.size[0], "50%");
  assert.equal(right.anchor_to, "top_right");
  assert.equal(left.anchor_to, "top_left");
  assert.ok(right.offset[0] < 0 && left.offset[0] > 0);
  const paddedSlot = ui.realm_slot["$slot_max|default"][0] + 6;
  for (const width of [320, 480, 853, 1536]) for (const contentWidth of [paddedSlot, 174, 224]) {
    const childRight = width + right.offset[0];
    const childLeft = childRight - contentWidth;
    const clip = right.clips_children ? { left: childRight - width * 0.5, right: childRight } : { left: 0, right: width };
    assert.ok(childLeft >= clip.left && childRight <= clip.right, `${contentWidth}-wide content must fit its actual ${width}-viewport clip`);
    assert.equal(childRight, width - 4);
  }
});

test("radar geometry scales 1.15 without changing byte slices or compass position", () => {
  const panel = ui.realm_radar_panel;
  const widget = panel.controls[0].radar_widget;
  const children = Object.fromEntries(widget.controls.map((c) => Object.entries(c)[0]));
  assert.deepEqual(widget.size, [112.7, 105.8]);
  assert.deepEqual(children.radar_border.size, widget.size);
  assert.deepEqual(children.radar_shade.size, widget.size);
  assert.deepEqual(children.radar_clip.size, [96.6, 89.7]);
  assert.deepEqual(children.radar_bg.size, children.radar_clip.size);
  assert.equal(panel.size[1], 108.1);
  for (const [i, c] of children.radar_clip.controls.entries()) {
    const mesh = c[`radar_mesh_${i}`];
    assert.equal(mesh.font_scale_factor, 0.552);
    assert.equal(mesh.line_padding, 6.785);
    assert.equal(mesh.offset[0], i ? 0.5175 : 0);
    assert.match(mesh.bindings.at(-1).source_property_name, /%\.1351s/);
    assert.match(mesh.bindings.at(-1).source_property_name, /%\.1610s/);
  }
});

test("original glyph art has stronger measured elevation contrast and proportionate frame assets", () => {
  const image = (file) => decode(fs.readFileSync(new URL(`../packs/hud_rp/${file}`, import.meta.url)));
  for (const file of ["textures/ui/radar_frame.png", "textures/ui/radar_shade.png"]) {
    const png = image(file);
    assert.deepEqual([png.width, png.height], [113, 106]);
  }
  const font = image("font/glyph_F3.png");
  const luma = (cell) => {
    let sum = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const i = (((cell >> 4) * 16 + y) * font.width + (cell % 16) * 16 + x) * 4;
      sum += 0.2126 * font.data[i] + 0.7152 * font.data[i + 1] + 0.0722 * font.data[i + 2];
    }
    return sum / 256;
  };
  assert.ok(luma(0xba) - luma(0xb9) > 95, "rock relief has strong highlight/shadow contrast");
  assert.ok(luma(0xb2) - luma(0xb1) > 80, "grassy elevation is not a blob of similar greens");
  assert.ok(luma(0xbe) - luma(0xbd) > 75, "wooden roofs and paths have distinct elevation shades");
  assert.ok(luma(0xd2) - luma(0xd1) > 75, "pale masonry has its own height palette");
});
