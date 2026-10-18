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

test("unused auxiliary widgets collapse and overflowing stacks are constrained to the viewport", () => {
  const right = byName("realm_side_right");
  assert.equal(right.clips_children, undefined, "a half-width clip would cut off wider natural content");
  assert.equal(ui.realm_side_area.clips_children, true);
  assert.deepEqual(right.max_size, ["100% - 8px", "100% - 8px"]);
  for (const widget of [ui.realm_radar_panel, ui.realm_reserve, ui.realm_sidebar_slot]) {
    assert.ok(widget.bindings.some((b) => b.target_property_name === "#visible" || b.binding_name_override === "#visible"), "auxiliary widgets collapse when hidden");
  }
});

test("numbered slots retain 66-unit cells through the last occupied position on either side", () => {
  const pinned = ui["realm_pinned_slot@hud.realm_slot"];
  assert.ok(pinned, "numbered slots need a fixed-height wrapper instead of a collapsing readout");
  assert.deepEqual(pinned.size, ["100%", 66]);
  assert.equal(66, ui.realm_slot["$slot_max|default"][1] + 4 + 2, "allow full multiline text, background padding and spacing");
  const content = pinned.controls[0]["realm_content@hud.realm_slot"];
  assert.deepEqual([content.anchor_from, content.anchor_to], ["top_left", "top_left"]);
  assert.equal(content.bindings, undefined, "the inner readout retains its own empty-text visibility");
  assert.equal(pinned.bindings.at(-1).source_property_name,
    "((#hud_title_text_string = '§s§2§r') and (not (($pin_slice * (#hud_subtitle_text_string - ($skip * #hud_subtitle_text_string))) = $pin_empty)))");
  assert.equal(pinned["$pin_slice|default"], "%.159s");
  assert.equal(pinned["$pin_empty|default"], "$slot_empty");
  assert.equal(ui.realm_slot.bindings.at(-1).source_property_name,
    "((#hud_title_text_string = '§s§2§r') and (not (($slot_slice * (#hud_subtitle_text_string - ($skip * #hud_subtitle_text_string))) = $slot_empty)))");
  const empty = ui.realm_slot["$slot_empty|default"];
  const sliceBytes = (text, format) => Buffer.from(text).subarray(0, Number(format.match(/\d+/)[0])).toString();
  const segment = (text, separator) => {
    const remaining = 159 - Buffer.byteLength(text);
    return separator + text + "~".repeat(remaining % 3) + "§r".repeat(Math.floor(remaining / 3));
  };
  for (const [side, start] of [["right", 0], ["left", 4]]) {
    const slots = byName(`realm_side_${side}`).controls
      .filter((c) => Object.keys(c)[0].startsWith(`realm_${side}`))
      .map((c) => {
        const [key, value] = Object.entries(c)[0];
        assert.ok(key.endsWith("@hud.realm_pinned_slot"), key);
        return value;
      });
    assert.equal(slots.length, 4);
    for (const [i, slot] of slots.entries()) {
      assert.equal(slot.$skip, `%.${10 + (start + i) * 160}s`);
      assert.equal(slot.$pin_slice ?? pinned["$pin_slice|default"], `%.${(4 - i) * 160 - 1}s`);
      const expectedEmpty = i === 3 ? undefined : `(${Array(4 - i).fill("$slot_empty").join(" + ' ' + ")})`;
      assert.equal(slot.$pin_empty, expectedEmpty);
      assert.equal(slot.$slot_anchor ?? ui.realm_slot["$slot_anchor|default"], `top_${side}`);
      assert.equal(slot.$slot_align ?? ui.realm_slot["$slot_align|default"], side);
    }
    for (let mask = 0; mask < 16; mask++) for (const text of ["Short", "One\nTwo\nThree\nFour\nFive\nSix", "§6Colored§r", "x".repeat(159)]) {
      const texts = Array(11).fill("");
      // Other columns, compass and radar must not reserve numbered cells on this side.
      texts[start ? 0 : 4] = "Other side";
      texts[8] = "Middle";
      texts[9] = "Compass";
      texts[10] = "Radar";
      for (let i = 0; i < 4; i++) if (mask & (1 << i)) texts[start + i] = text;
      let first = true;
      const subtitle = "§s§2§r" + texts.map((text) => {
        const separator = !text || first ? " " : "\n";
        if (text) first = false;
        return segment(text, separator);
      }).join("");
      let height = 0;
      for (const [i, slot] of slots.entries()) {
        const skip = Buffer.byteLength(sliceBytes(subtitle, slot.$skip));
        const tail = sliceBytes(Buffer.from(subtitle).subarray(skip).toString(), slot.$pin_slice ?? pinned["$pin_slice|default"]);
        const visible = tail !== Array(4 - i).fill(empty).join(" ");
        assert.equal(visible, Boolean(mask >> i), `${side} ${mask}: cell ${i + 1}`);
        if (mask & (1 << i)) assert.equal(height, i * 66, `${side} ${i + 1} never rises into a gap`);
        if (visible) height += pinned.size[1];
      }
      assert.equal(height, mask ? (32 - Math.clz32(mask)) * 66 : 0, "unused trailing cells do not push the sidebar down");
    }
  }
});

test("pinned cells do not shrink or overlap at different GUI viewport heights", () => {
  const cell = ui["realm_pinned_slot@hud.realm_slot"];
  assert.ok(cell);
  for (const viewportHeight of [180, 240, 360, 480, 720]) {
    for (const compass of [0, 40]) for (const radar of [0, ui.realm_radar_panel.size[1]]) {
      for (const side of ["left", "right"]) {
        const origin = byName(`realm_side_${side}`).offset[1] + compass + (side === "right" ? radar : 0);
        for (let i = 0; i < 4; i++) {
          const top = origin + i * cell.size[1];
          const backgroundBottom = top + ui.realm_slot["$slot_max|default"][1] + 4;
          assert.ok(backgroundBottom <= top + cell.size[1], "maximum content never reaches the next cell");
          const visibleHeight = Math.max(0, Math.min(backgroundBottom, viewportHeight) - Math.min(top, viewportHeight));
          assert.ok(visibleHeight >= 0 && visibleHeight <= 64 + 1e-9, "viewport clips rather than compacts the cell");
        }
      }
    }
  }
  for (const name of ["realm_side_top", "realm_side_middle"]) {
    assert.ok(Object.keys(byName(name).controls[0])[0].endsWith("@hud.realm_slot"), `${name} stays content-sized`);
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
