// JSON/layout and generated-art contracts. These do not replace actual client acceptance.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { decode } from "./gen-rain/png.mjs";
import { CONFIG as mobhp } from "../packs/mobhp_bp/scripts/config.js";
import { CONFIG as elytra } from "../packs/elytra_bp/scripts/config.js";

const ui = JSON.parse(fs.readFileSync(new URL("../packs/hud_rp/ui/hud_screen.json", import.meta.url), "utf8"));
const area = Object.fromEntries(ui.realm_side_area.controls.map((c) => Object.entries(c)[0]));
const stack = (side) => area[`realm_side_${side}`].controls[0][`realm_${side}_stack`];
const names = (control) => control.controls.map((c) => Object.keys(c)[0].split("@")[0]);
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const image = (file) => decode(fs.readFileSync(new URL(`../packs/hud_rp/${file}`, import.meta.url)));

test("published compass geometry, shared templates and art remain exactly unchanged", () => {
  for (const [value, expected] of [
    [area.realm_side_top, "26bcf3150d7967d1a31bb61b086b5ef24bb5e9ddef052dd578c89a2aaf06437c"],
    [ui.realm_slot, "a9da7ef03c4b2c627fc99d749d50373699725a6a6cc71524ea55a3a0d7f48eca"],
    [ui.realm_slot_text, "d34b07939d7b7052a50bffd3bd6663123c2958ebcd3dd79b5dbdc2441894a439"],
    [ui.realm_slot_box, "3b208354bd631922288283c8ae2f2c09ac1ddca458a407b87ae1db47aa8257fc"],
  ]) assert.equal(hash(value), expected, "matches published 12b27d0");
  const font = image("font/glyph_F3.png");
  assert.equal(crypto.createHash("sha256").update(font.data.subarray(0, 256 * 48 * 4)).digest("hex"),
    "ebe32002d650c0b2698de595c7f22dbe4fc5e66498af1c35c9aded3228d4635f");
});

test("the accepted minimap stays fixed at its exact top-right position", () => {
  const radar = area.realm_side_radar;
  assert.ok(radar);
  assert.deepEqual(radar.offset, [-4, 48]);
  assert.deepEqual(radar.size, ["50%", 108]);
  assert.deepEqual([radar.anchor_from, radar.anchor_to], ["top_right", "top_right"]);
  assert.deepEqual(names(radar), ["realm_radar"]);
  assert.deepEqual(radar.controls[0]["realm_radar@hud.realm_radar_panel"], {});
  assert.equal(ui.realm_radar_panel.size[1], 108);
});

test("readout groups center inside separate unobstructed regions, never the minimap or compass", () => {
  for (const [side, top, height] of [["left", 48, "100% - 52px"], ["right", 156, "100% - 160px"]]) {
    const frame = area[`realm_side_${side}`];
    assert.equal(frame.type, "panel");
    assert.deepEqual(frame.size, ["100% - 8px", height]);
    assert.deepEqual(frame.offset, [side === "left" ? 4 : -4, top]);
    assert.equal(frame.clips_children, true, "overflow stays below the compass and fixed map");
    const group = stack(side);
    assert.equal(group.type, "stack_panel");
    assert.equal(group.orientation, "vertical");
    assert.deepEqual(group.size, ["50%", "100%c"], "actual native scoreboard height contributes to group height");
    assert.deepEqual(group.max_size, ["100%", "100%"]);
    assert.deepEqual([group.anchor_from, group.anchor_to], [`${side}_middle`, `${side}_middle`]);
    assert.equal(group.use_child_anchors, true);
    assert.equal(group.clips_children, undefined, "no half-width clip cuts natural-width content");
  }
  assert.ok(area.realm_side_middle.offset[1] >= 48);
});

test("the full native rotating scoreboard joins the left group without a one-row budget", () => {
  assert.ok(ui.root_panel.modifications.some((m) => m.operation === "remove" && m.control_name === "sidebar"));
  assert.deepEqual(names(stack("left")), ["realm_left1", "realm_left2", "realm_left3", "realm_left4", "realm_sidebar"]);
  assert.deepEqual(names(stack("right")), ["realm_right1", "realm_right2", "realm_right3", "realm_right4"]);
  assert.deepEqual(ui.realm_sidebar_slot.size, ["100%", "100%c"]);
  const child = ui.realm_sidebar_slot.controls[0]["sidebar@scoreboard.scoreboard_sidebar"];
  assert.deepEqual([child.anchor_from, child.anchor_to], ["top_left", "top_left"]);
  assert.equal(child.size, undefined, "preserve native content width and full natural height");
  assert.equal(child.max_size, undefined, "do not pretend a whole scoreboard is one row");
  assert.equal(child.bindings[0].binding_name, "#scoreboard_sidebar_visible");
});

test("new defaults put health and flight left without resetting saved preferences or changing content", () => {
  assert.equal(mobhp.showAt, "left1");
  assert.equal(elytra.showAt, "left2");
  const source = fs.readFileSync(new URL("../packs/mobhp_bp/scripts/main.js", import.meta.url), "utf8");
  assert.match(source, /const FALLBACK_SLOT = "left1"/);
  assert.match(source, /getFor\(attacker, "where"\)/, "explicit player choice still wins");
  assert.ok(!JSON.stringify(ui).includes("Mob health slot"), "fixture labels never enter production");
});

test("numbered selections retain stable ordering and fixed occupied heights, with centered empty slots collapsed", () => {
  const cell = ui["realm_pinned_slot@hud.realm_slot"];
  assert.deepEqual(cell.size, ["100%", 32]);
  assert.equal(cell.bindings, undefined, "inherit own-slot visibility; latest centered-stack design supersedes empty gaps");
  assert.equal(cell["$pin_height|default"], undefined);
  const content = cell.controls[0]["realm_content@hud.realm_slot"];
  const box = content.controls[0]["realm_slot_box@hud.realm_slot_box"];
  assert.equal(box.clips_children, true);
  assert.deepEqual(box.$slot_max, [200, "100% - 4px"]);
  assert.equal(ui.realm_slot_text.font_scale_factor, "$slot_scale");
  assert.equal(ui.realm_slot["$slot_scale|default"], undefined, "native template itself is untouched");
  for (const [side, first] of [["right", 0], ["left", 4]]) {
    const cells = stack(side).controls.slice(0, 4);
    for (const [i, c] of cells.entries()) {
      const [key, value] = Object.entries(c)[0];
      assert.equal(key, `realm_${side}${i + 1}@hud.realm_pinned_slot`);
      assert.equal(value.$skip, `%.${10 + 160 * (first + i)}s`);
      assert.equal(value.$pin_slice, undefined);
    }
    for (let mask = 0; mask < 16; mask++) {
      const visible = cells.filter((_, i) => mask & (1 << i));
      assert.equal(visible.length * cell.size[1], mask.toString(2).replace(/0/g, "").length * 32);
      assert.deepEqual(visible.map((c) => Object.keys(c)[0]), cells.map((c) => Object.keys(c)[0]).filter((_, i) => mask & (1 << i)));
    }
  }
});

test("centering budgets the actual board and gives explicit finite-height boundaries", () => {
  for (const height of [180, 240, 360, 480]) for (const board of [0, 40, 80, 120, 160]) {
    const leftAvailable = height - 52;
    const leftContent = 2 * 32 + board;
    const rightAvailable = height - 160;
    const rightContent = 2 * 32;
    for (const [top, available, content] of [[48, leftAvailable, leftContent], [156, rightAvailable, rightContent]]) {
      const measured = Math.min(available, content);
      const groupTop = top + (available - measured) / 2;
      assert.ok(groupTop >= top);
      if (content <= available) assert.ok(groupTop + content <= height - 4);
    }
    if (height >= 240 && board <= 120) assert.ok(leftContent <= leftAvailable, "normal default left group includes a full 120-unit board");
    if (height >= 240) assert.ok(rightContent <= rightAvailable, "two default right readouts fit below the fixed map");
  }
  assert.ok(64 > 180 - 160, "severely short right viewport cannot display two full readouts");
  assert.ok(64 + 160 > 240 - 52, "unbounded tall scoreboard has an explicit fallback, not a false fit claim");
});

test("full-width clipping ancestors preserve natural-width side content and edge margins", () => {
  assert.equal(ui.realm_side_area.clips_children, true);
  for (const width of [320, 480, 853, 1536]) for (const naturalWidth of [40, 206, 224]) {
    assert.ok(naturalWidth <= width - 8);
    const left = 4;
    const right = width - 4;
    assert.ok(left + naturalWidth <= right);
    assert.ok(right - naturalWidth >= left);
  }
});

test("the calibrated native-aspect map keeps all grid ink inside its thin boundary", () => {
  const widget = ui.realm_radar_panel.controls[0].radar_widget;
  const children = Object.fromEntries(widget.controls.map((c) => Object.entries(c)[0]));
  assert.deepEqual(widget.size, [100.8, 105.8]);
  assert.deepEqual(children.radar_border.size, widget.size);
  assert.equal(children.radar_shade, undefined);
  assert.deepEqual(children.radar_clip.size, [98.8, 103.8]);
  assert.deepEqual(children.radar_bg.size, children.radar_clip.size);
  const font = (103.8 - 2) / (20 * 9 + 8);
  const x = (98.8 - 21 * 8.5 * font) / 2;
  for (const [i, c] of children.radar_clip.controls.entries()) {
    const mesh = c[`radar_mesh_${i}`];
    assert.equal(mesh.font_scale_factor, font);
    assert.equal(mesh.line_padding, 7.7753571428571435);
    assert.ok(Math.abs(mesh.offset[0] - x - (i ? font / 2 : 0)) < 1e-9);
    assert.equal(mesh.offset[1], 1);
    for (const axis of [0, 1]) {
      const last = mesh.offset[axis] + (20 * (axis ? 9 : 8.5) + 8) * font;
      assert.ok(mesh.offset[axis] >= 1 - 1e-9);
      assert.ok(last <= children.radar_clip.size[axis] - 1 + 1e-9);
    }
    assert.match(mesh.bindings.at(-1).source_property_name, /%\.1351s/);
    assert.match(mesh.bindings.at(-1).source_property_name, /%\.1610s/);
  }
});

test("generated map art keeps the thin frame and player-only emphasis", () => {
  const font = image("font/glyph_F3.png");
  for (const file of ["textures/ui/radar_frame.png", "textures/ui/radar_shade.png"]) {
    const png = image(file);
    assert.deepEqual([png.width, png.height], [101, 106]);
    for (let y = 1; y < png.height - 1; y++) for (let x = 1; x < png.width - 1; x++)
      assert.equal(png.data[(y * png.width + x) * 4 + 3], 0);
  }
  const pixels = (cell) => {
    const data = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const i = (((cell >> 4) * 16 + y) * font.width + cell % 16 * 16 + x) * 4;
      data.push(...font.data.slice(i, i + 4));
    }
    return Buffer.from(data);
  };
  for (const [cell, expected] of [[0x30, "62414901d52eaf22012057186fb80a30989279428d30d08accc3631e1f1737ee"],
    [0x31, "79b0bf24b1d6ef05caeb1e4484e1997ebbcce39f07cbe0e4ca87e54d376ef02d"],
    [0x32, "b3ae4f03886c68503e1e743aa3a67dfc5adc8053c59d03a246016e406fdbe787"]])
    assert.equal(crypto.createHash("sha256").update(pixels(cell)).digest("hex"), expected);
  const count = (cell, predicate) => {
    const data = pixels(cell);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (predicate(...data.slice(i, i + 3))) n++;
    return n;
  };
  const white = (r, g, b) => r > 220 && g > 220 && b > 220;
  assert.ok(count(0x37, white) > 26);
  assert.ok(count(0x40, white) > 34);
  assert.ok(count(0x33, (r, g, b) => r < 100 && g > 110 && b > 200) > 48);
  const luma = (cell) => {
    const data = pixels(cell);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    return sum / 256;
  };
  assert.ok(luma(0xba) - luma(0xb9) > 95);
  assert.ok(luma(0xb2) - luma(0xb1) > 80);
  assert.ok(luma(0xbe) - luma(0xbd) > 75);
  assert.ok(luma(0xd2) - luma(0xd1) > 75);
});
