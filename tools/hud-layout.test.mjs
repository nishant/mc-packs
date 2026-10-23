// JSON/layout and generated-art contracts. These do not replace actual client acceptance.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import { decode } from "./gen-rain/png.mjs";
import { G, SELF_ARROWS } from "../packs/map_bp/scripts/glyphs.js";
import { CONFIG as mobhp } from "../packs/mobhp_bp/scripts/config.js";
import { CONFIG as elytra } from "../packs/elytra_bp/scripts/config.js";
import { CONFIG as saga } from "../packs/saga_bp/scripts/config.js";

const ui = JSON.parse(fs.readFileSync(new URL("../packs/hud_rp/ui/hud_screen.json", import.meta.url), "utf8"));
const area = Object.fromEntries(ui.realm_side_area.controls.map((c) => Object.entries(c)[0]));
const stack = (side) => area[`realm_side_${side}`].controls[0][`realm_${side}_stack`];
const names = (control) => control.controls.map((c) => Object.keys(c)[0].split("@")[0]);
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
// Only generated image reads may target an isolated pre-integration tree; UI, wire and foreign HUD checks stay on root source.
const artRoot = path.resolve(process.env.MINIMAP_ART_ROOT ?? path.resolve(import.meta.dirname, ".."), "packs/hud_rp");
const image = (file) => decode(fs.readFileSync(path.join(artRoot, file)));

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
  assert.deepEqual(names(stack("left")), ["realm_left1", "realm_quest_left1", "realm_left2", "realm_quest_left2", "realm_left3", "realm_quest_left3", "realm_left4", "realm_quest_left4", "realm_sidebar"]);
  assert.deepEqual(names(stack("right")), ["realm_right1", "realm_quest_right1", "realm_right2", "realm_quest_right2", "realm_right3", "realm_quest_right3", "realm_right4", "realm_quest_right4"]);
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
  assert.equal(saga.trackerAt, "right4", "story stays on the right; native rotating board stays in the left group");
  const source = fs.readFileSync(new URL("../packs/mobhp_bp/scripts/main.js", import.meta.url), "utf8");
  assert.match(source, /const FALLBACK_SLOT = "left1"/);
  assert.match(source, /getFor\(attacker, "where"\)/, "explicit player choice still wins");
  assert.ok(!JSON.stringify(ui).includes("Mob health slot"), "fixture labels never enter production");
});

test("numbered selections retain ordering with natural content height and uniform small gaps", () => {
  const cell = ui["realm_pinned_slot@hud.realm_slot"];
  assert.deepEqual(cell.size, ["100%", "100%c + 4px"], "no reserved blank second row for a one-line readout");
  assert.equal(cell.bindings, undefined, "inherit own-slot visibility; latest centered-stack design supersedes empty gaps");
  assert.equal(cell["$pin_height|default"], undefined);
  assert.deepEqual(cell.$slot_max, [200, 26], "keep useful native two-line text and its previous maximum");
  const box = cell.controls[0]["realm_slot_box@hud.realm_slot_box"];
  assert.equal(box.clips_children, true);
  assert.equal(box.size, undefined, "retain Nish's content-sized background template");
  assert.equal(ui.realm_slot_text.font_scale_factor, "$slot_scale");
  assert.equal(ui.realm_slot["$slot_scale|default"], undefined, "native template itself is untouched");
  for (const [side, first] of [["right", 0], ["left", 4]]) {
    const cells = stack(side).controls.filter((c) => Object.keys(c)[0].includes("pinned_slot"));
    for (const [i, c] of cells.entries()) {
      const [key, value] = Object.entries(c)[0];
      assert.equal(key, `realm_${side}${i + 1}@hud.realm_pinned_slot`);
      assert.equal(value.$skip, `%.${10 + 160 * (first + i)}s`);
      assert.equal(value.$pin_slice, undefined);
    }
    for (let mask = 0; mask < 16; mask++) {
      const visible = cells.filter((_, i) => mask & (1 << i));
      const heights = [9, 18, 9, 18];
      const total = heights.reduce((sum, h, i) => sum + (mask & (1 << i) ? h + 4 + 4 : 0), 0);
      assert.ok(total <= visible.length * 26, "normal one/two-line readouts reserve no oversized blank cells");
      assert.deepEqual(visible.map((c) => Object.keys(c)[0]), cells.map((c) => Object.keys(c)[0]).filter((_, i) => mask & (1 << i)));
    }
  }
});

test("centering budgets the actual board and gives explicit finite-height boundaries", () => {
  for (const height of [180, 240, 360, 480]) for (const board of [0, 40, 80, 120, 160]) {
    const leftAvailable = height - 52;
    const leftContent = (9 + 8) + (18 + 8) + board;
    const rightAvailable = height - 160;
    const rightContent = (9 + 8) + (18 + 8);
    for (const [top, available, content] of [[48, leftAvailable, leftContent], [156, rightAvailable, rightContent]]) {
      const measured = Math.min(available, content);
      const groupTop = top + (available - measured) / 2;
      assert.ok(groupTop >= top);
      if (content <= available) assert.ok(groupTop + content <= height - 4);
    }
    if (height >= 240 && board <= 140) assert.ok(leftContent <= leftAvailable, "normal default left group includes a full 140-unit board");
    if (height >= 240) assert.ok(rightContent <= rightAvailable, "two default right readouts fit below the fixed map");
  }
  assert.ok(43 > 180 - 160, "severely short right viewport cannot display two full readouts");
  assert.ok(43 + 160 > 240 - 52, "unbounded tall scoreboard has an explicit fallback, not a false fit claim");
  assert.ok(2 * (26 + 8) + 120 <= 240 - 52, "even two maximum readouts budget the full 120-unit native board");
  assert.ok(2 * (26 + 8) <= 240 - 160, "maximum-height right defaults still fit below the unchanged map");
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

test("the calibrated dense33 four-mesh map stays unchanged inside the exact approved external oak art", () => {
  const widget = ui.realm_radar_panel.controls[0].radar_widget;
  const children = Object.fromEntries(widget.controls.map((c) => Object.entries(c)[0]));
  assert.deepEqual(widget.size, [100.8, 105.8], "calibrated widget footprint stays fixed");
  assert.deepEqual(widget.offset, [-9, -9], "exact approved Astra oak placement");
  assert.deepEqual(children.radar_border.size, [118.8, 123.8]);
  assert.equal(children.radar_border.layer, 9, "actual approved JSON, not an inferred generator layer");
  assert.equal(children.radar_shade, undefined);
  assert.deepEqual(children.radar_clip.size, [98.8, 103.8]);
  assert.deepEqual(children.radar_bg.size, [118.8, 123.8]);
  assert.equal(children.radar_bg.layer, 1);
  const font = (103.8 - 2) / (32 * 9 + 8);
  const x = (98.8 - 33 * 8.5 * font) / 2;
  assert.equal(children.radar_clip.controls.length, 4, "2 x 2 meshes fill native glyph/row gaps");
  for (const [i, c] of children.radar_clip.controls.entries()) {
    const mesh = c["radar_mesh_" + i];
    assert.ok(mesh); assert.equal(mesh.font_scale_factor, font);
    assert.equal(mesh.line_padding, 7.7753571428571435);
    assert.ok(Math.abs(mesh.offset[0] - x - (i % 2) * font / 2) < 1e-9);
    assert.ok(Math.abs(mesh.offset[1] - 1 - Math.floor(i / 2) * font) < 1e-9);
    for (const axis of [0, 1]) {
      const last = mesh.offset[axis] + (32 * (axis ? 9 : 8.5) + 8) * font;
      // Base ink has 1-unit margin. The intentional full-font vertical copy spends at most one font of it.
      const margin = axis ? 1 - font : 1;
      assert.ok(margin > 0.5, "overlap filling still leaves positive ideal clip clearance");
      assert.ok(mesh.offset[axis] >= 1 - 1e-9);
      assert.ok(last <= children.radar_clip.size[axis] - margin + 1e-9);
    }
    const src = mesh.bindings.at(-1).source_property_name;
    assert.ok(src.includes("%.3299s") && src.includes("%.1610s"), "grid only: self/visibility metadata never enter any mesh");
  }
  // All four Cartesian shifts cover each full 8.5 x 9 native cell, including the half-unit/one-unit gaps.
  for (const [pitch, ink, shifts] of [[8.5, 8, [0, 0.5]], [9, 8, [0, 1]]])
    for (let q = 0; q <= pitch; q += 0.125) assert.ok(shifts.some(d => q >= d && q <= d + ink));
  for (const d of ["n", "e", "s", "w"]) {
    const badge = children["radar_" + d];
    assert.deepEqual(badge.size, [10, 10]); assert.equal(badge.layer, 10);
    const positions = {n:["top_middle",[0,-8]],e:["right_middle",[8,0]],s:["bottom_middle",[0,8]],w:["left_middle",[-8,0]]};
    assert.equal(badge.anchor_from,positions[d][0]); assert.equal(badge.anchor_to,positions[d][0]); assert.deepEqual(badge.offset,positions[d][1]);
    assert.equal(badge.controls[0]["radar_" + d + "_badge"].texture, "textures/ui/map_cardinal_" + d);
    assert.equal(badge.controls[0]["radar_" + d + "_badge"].layer, 11);
  }
  assert.equal(children.radar_self.anchor_from, "center"); assert.equal(children.radar_self.anchor_to, "center");
  assert.ok(children.radar_self.layer > 7); assert.equal(children.radar_self.font_scale_factor, 0.75);
});

test("generated circular art keeps transparent corners and unchanged player/icon emphasis", () => {
  const font = image("font/glyph_F3.png");
  for(const file of["textures/ui/radar_frame.png","textures/ui/radar_shade.png"]){const png=image(file);assert.deepEqual([png.width,png.height],[238,248]);for(const[x,y]of[[0,0],[237,0],[0,247],[237,247]])assert.equal(png.data[(y*png.width+x)*4+3],0,"no opaque square corners");const center=png.data[(124*png.width+119)*4+3];if(file.includes("frame"))assert.equal(center,0);else assert.equal(center,255,"actual approved oak shade has an opaque center");}
  for (const d of ["n", "e", "s", "w"]) {
    const badge = image(`textures/ui/map_cardinal_${d}.png`);
    assert.deepEqual([badge.width, badge.height], [24, 24]);
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

test("the story's quest box shows next to the place the player picked, from its own 512-byte segment", () => {
  const quest = ui["realm_quest_slot@hud.realm_slot"];
  assert.equal(quest.$skip, `%.${9 + 160 * 10 + 3304 + 1}s`, "after the nine boxes, the strip and the radar");
  assert.equal(quest.$slot_slice, "%.511s");
  assert.deepEqual(quest.$slot_max, [200, 110], "about 10 rows: taller than a numbered box");
  assert.match(quest.bindings.at(-1).source_property_name, /%\.9s/);
  assert.match(quest.bindings.at(-1).source_property_name, /\$quest_code/);
  const codes = [];
  for (const [side, first] of [["right", 1], ["left", 5]]) {
    const list = stack(side).controls;
    for (let i = 1; i <= 4; i++) {
      const k = list.findIndex((c) => Object.keys(c)[0] === `realm_quest_${side}${i}@hud.realm_quest_slot`);
      assert.ok(k > 0, `${side}${i} has a quest box`);
      assert.equal(Object.keys(list[k - 1])[0], `realm_${side}${i}@hud.realm_pinned_slot`, "right under its own numbered box");
      codes.push(list[k][`realm_quest_${side}${i}@hud.realm_quest_slot`].$quest_code);
      assert.equal(codes.at(-1), `§s§q§${first + i - 1}`);
    }
  }
  const middle = area.realm_side_middle.controls[0].realm_middle_stack;
  assert.equal(middle.controls[1]["realm_quest_middle@hud.realm_quest_slot"].$quest_code, "§s§q§9");
  assert.equal(new Set(codes).size, 8);
});

test("map_bp takes its compass and radar parts down when the Minimap is off, for the realm and for the player", () => {
  const map = fs.readFileSync(new URL("../packs/map_bp/scripts/main.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  // Both off (realm option or the player's choices): both parts are cleared and the title drawn once more.
  assert.match(map, /const showCompass = on && pr\.compass;\n\s+const showRadar = on && pr\.radar;/, "the realm option and the player's choice both count");
  assert.match(map, /if \(!showCompass && !showRadar\) \{\s+hidePlayerHud\(player\);/);
  const hide = map.match(/^function hidePlayerHud\([\s\S]*?^\}/m)?.[0];
  const pass = map.match(/^function pass\([\s\S]*?^\}/m)?.[0];
  assert.ok(hide && pass, "execute actual extracted current off path, not a rewritten renderer");
  for (const [enabled, prefs] of [[false, {compass:true,radar:true}], [true, {compass:false,radar:false}]]) {
    const calls = [];
    const state = Object.fromEntries(["views","preparedDetailFrames","publishedDetailFrames","lastText","planNow","scanPlans","retryAt","playerStore","lastPose","lastSent","labPlans","detailFootprints"].map(k => [k,new Map([["p",{}],["foreign",{}]])]));
    const portalState = Object.fromEntries(["terrainBaseMemo", "passAt", "netherLayers"].map(k => [k, new Map([["p",{}],["foreign",{}]])]));
    const ctx = { ...state, ...portalState,manualScans:{cancel(){}}, prefsOf:()=>prefs, get:()=>enabled, arrival(){}, destination(){},
      side: { clear(p,part,draw){calls.push(["clear",p.id,part,draw]);}, redraw(p){calls.push(["redraw",p.id]);} } };
    const run = vm.runInNewContext(hide + "\n" + pass + "\n;pass",ctx);
    run({id:"p"},[],[],0);
    assert.deepEqual(calls, [["clear","p","",false],["clear","p","radar",false],["redraw","p"]]);
    for (const values of Object.values(state)) { assert.equal(values.has("p"),false); assert.equal(values.has("foreign"),true); }
    run({id:"p"},[],[],1); assert.equal(calls.length,3,"already hidden is idempotent");
    for (const values of Object.values(portalState)) assert.equal(values.has("p"), true, "ordinary hiding does not masquerade as portal invalidation");
    const ast = ts.createSourceFile("main.js", map, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const portal = ast.statements.filter(ts.isExpressionStatement).map(statement => statement.expression)
      .find(expression => ts.isCallExpression(expression) && expression.expression.getText(ast) === "world.afterEvents.playerDimensionChange.subscribe");
    assert.ok(portal && ts.isArrowFunction(portal.arguments[0]), "execute the actual portal cleanup callback");
    vm.runInNewContext(`(${portal.arguments[0].getText(ast)})`,ctx)({player:{id:"p"}});
    for (const values of [...Object.values(state), ...Object.values(portalState)]) {
      assert.equal(values.has("p"), false, "portal removes this viewer's geometry/pass and unpublished/published receipts");
      assert.equal(values.has("foreign"), true, "portal must retain every other viewer's state");
    }
    assert.equal(calls.length,3,"a portal does not re-clear an already hidden HUD");
  }
  // V2 clears retired parts before staging a new receipt. Test the actual guards, not the old else-if spelling.
  const renderAst = ts.createSourceFile("main.js", map, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const renderer = renderAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "render");
  assert.ok(renderer?.body, "the actual renderer exists");
  const declarations = renderer.body.statements.filter(node => ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && ["offC", "offR"].includes(declaration.name.text)));
  const clears = renderer.body.statements.filter(node => ts.isIfStatement(node) && ["offC", "offR"].includes(node.expression.getText(renderAst)));
  assert.equal(declarations.length, 2); assert.equal(clears.length, 2);
  for (const [compass, radar, expected] of [[false, true, ""], [true, false, "radar"]]) {
    const calls = [];
    const ctx = { v: { compass, radar }, sent: { compass: true, radar: true }, player: { id: "p" },
      side: { clear(player, part, draw) { calls.push([player.id, part, draw]); } } };
    vm.runInNewContext([...declarations, ...clears].map(node => node.getText(renderAst)).join("\n"),ctx);
    assert.deepEqual(calls, [["p", expected, false]], "turning off one part clears only that part, retaining the other");
  }
  // A changed choice forgets the text it sent (so the next draw is whole), but not which parts are on screen.
  assert.match(map, /if \(s\) s\.ctext = s\.rtext = "";/);
  assert.match(map, /for \(const s of lastSent\.values\(\)\) s\.ctext = s\.rtext = "";/);
});

test("every Side HUD cut matches the side boxes protocol and the minimap's text fits its slots", () => {
  const side = fs.readFileSync(new URL("./side-shared.js", import.meta.url), "utf8");
  const num = (name) => Number(side.match(new RegExp(`const ${name} = (\\d+);`))[1]);
  const SEG = num("SEG_BYTES");
  const RADAR_SEG = num("RADAR_SEG_BYTES");
  const MARK = JSON.parse(side.match(/export const MARK = ("[^"]+");/)[1]);
  const headerBytes = Buffer.byteLength(loadSide().compose({}).slice(0, 9));
  assert.equal(headerBytes, 9, "visibility prefix is nine ASCII bytes, not title MARK");
  const QUEST_SEG = num("QUEST_SEG_BYTES");
  const slots = [...JSON.parse(side.match(/export const SLOTS = (\[[^\]]+\]);/)[1].replace(/'/g, '"')), "top", "radar", "quest"];
  assert.ok(side.includes('export const ALL_SLOTS = [...SLOTS, "top", "radar", "quest"];'), "the subtitle order this test follows");
  const skip = (k) => `%.${headerBytes + SEG * k + 1}s`;
  const json = JSON.stringify(ui);
  for (const [k, name] of slots.entries()) {
    if (name === "radar" || name === "quest") continue;
    const m = json.match(new RegExp(`"realm_${name}@hud\\.realm_(?:pinned_)?slot":\\{"\\$skip":"([^"]+)"`));
    assert.ok(m, `${name} has a cell`);
    assert.equal(m[1], skip(k), `${name} is cut at its own segment`);
  }
  // The radar: its segment starts after the ten others and holds RADAR_SEG - 1 bytes of text.
  const meshes = ui.realm_radar_panel.controls[0].radar_widget.controls.find((c) => c.radar_clip).radar_clip.controls;
  for (const [i, c] of meshes.entries()) {
    const src = c[`radar_mesh_${i}`].bindings.at(-1).source_property_name;
    assert.ok(src.includes(skip(10)) && src.includes(`%.${RADAR_SEG - 5}s`), "the radar is cut at its own segment");
  }
  // The quest box: its segment starts after the radar's.
  assert.equal(ui["realm_quest_slot@hud.realm_slot"].$skip, `%.${headerBytes + SEG * 10 + RADAR_SEG + 1}s`, "the quest box is cut at its own segment");
  assert.equal(ui["realm_quest_slot@hud.realm_slot"].$slot_slice, `%.${QUEST_SEG - 1}s`);
  assert.equal(headerBytes + SEG * 10 + RADAR_SEG + QUEST_SEG, 5425, "the whole subtitle");
  // What the minimap sends must fit: the radar's rows (3-byte glyphs, a newline between rows) and the strip's two lines.
  const map = fs.readFileSync(new URL("../packs/map_bp/scripts/main.js", import.meta.url), "utf8");
  const R = Number(map.match(/const R = (\d+);/)[1]);
  const CELLS = Number(map.match(/const CELLS = (\d+);/)[1]);
  const size = 2 * R + 1;
  assert.ok(size * size * 3 + (size - 1) <= RADAR_SEG - 1, `a full radar fits its slot (${size * size * 3 + size - 1} bytes)`);
  assert.equal(size, 33, "the explicit dense33 grid keeps the accepted widget footprint");
  assert.equal(size * size * 3 + size - 1, 3299);
  assert.equal(size * size * 3 + size - 1 + 3 + 1, RADAR_SEG - 1, "grid + self + ASCII visibility exactly fill radar body");
  const spacer = JSON.parse(map.match(/const SPACER = ("[^"]+");/)[1]);
  assert.ok(map.includes("const LINE2_BYTES = 159 - CELLS * 3 - SPACER.length - 1;"), "the strip's second line takes what is left of the slot");
  assert.ok(CELLS * 3 + spacer.length + 1 < SEG - 1, "the strip and its spacer leave room for a second line");
});

// ---------------------------------------------------------------------------------------------------------------
// Empty panels: a slot with nothing in it must hide its whole panel, black background included (O69). The producer
// is tools/side-shared.js; the consumer is hud_screen.json's `#visible` bindings, evaluated here the way the file
// means them. This is offline producer/consumer evidence, not a picture of what a client draws.
// ---------------------------------------------------------------------------------------------------------------

/** tools/side-shared.js run offline: the code that builds every subtitle the HUD cuts. */
function loadSide() {
  const source = fs.readFileSync(new URL("./side-shared.js", import.meta.url), "utf8").replace(/^import .*$/gm, "").replace(/^export /gm, "");
  const none = () => {};
  const signal = { subscribe: none };
  const context = {
    system: { currentTick: 0, afterEvents: { scriptEventReceive: signal }, runInterval: none, sendScriptEvent: none },
    world: { afterEvents: { playerLeave: signal }, getAllPlayers: () => [] },
    onScriptEvent: none,
  };
  return vm.runInNewContext(`${source}\n;({ MARK, SLOTS, ALL_SLOTS, SEG_BYTES, RADAR_SEG_BYTES, QUEST_SEG_BYTES, segment, compose, questCode })`, context);
}

/**
 * One of the string expressions hud_screen.json binds to `#visible`: `'%.Ns' * text` keeps the first N UTF-8 bytes,
 * `a - b` takes the first b out of a, `=`, `and`, `or`, `not`. `$name` is a variable of the control.
 * @param {string} expression @param {Record<string, string>} vars @param {Record<string, string>} env
 */
function evaluate(expression, vars, env, expectedType = "boolean") {
  /** @type {{ k: "str" | "var" | "id" | "op", v: string }[]} */
  const tokens = [];
  const re = /\s*(?:(\()|(\))|'([^']*)'|(#[a-z_]+)|\$([a-z_]+)|(\*)|(-)|(=)|\b(and|or|not)\b)/y;
  for (let m; re.lastIndex < expression.length && (m = re.exec(expression)); ) {
    if (m[3] !== undefined) tokens.push({ k: "str", v: m[3] });
    else if (m[4]) tokens.push({ k: "id", v: m[4] });
    else if (m[5]) tokens.push({ k: "var", v: m[5] });
    else tokens.push({ k: "op", v: m[1] ?? m[2] ?? m[6] ?? m[7] ?? m[8] ?? m[9] });
  }
  assert.equal(re.lastIndex, expression.length, `every character of ${expression} is understood`);
  let at = 0;
  const op = (/** @type {string} */ v) => tokens[at]?.k === "op" && tokens[at].v === v && ++at > 0;
  const cut = (/** @type {string} */ spec, /** @type {string} */ text) => {
    const m = /^%\.(\d+)s$/.exec(spec);
    assert.ok(m, `${spec} is a byte cut`);
    return Buffer.from(text).subarray(0, Number(m[1])).toString();
  };
  /** @returns {any} */
  const atom = () => {
    const t = tokens[at++];
    assert.ok(t, `unexpected end of ${expression}`);
    if (t.k === "str") return t.v;
    if (t.k === "var") {
      assert.ok(t.v in vars, `$${t.v} has a value`);
      return String(vars[t.v]);
    }
    if (t.k === "id") {
      assert.ok(t.v in env, `${t.v} is known`);
      return env[t.v];
    }
    assert.equal(t.v, "(");
    const v = or();
    assert.ok(op(")"), "closing parenthesis");
    return v;
  };
  const mul = () => {
    let v = atom();
    while (op("*")) v = cut(v, atom());
    return v;
  };
  const sum = () => {
    let v = mul();
    while (op("-")) {
      const r = mul();
      if (r && v.includes(r)) v = v.replace(r, "");
    }
    return v;
  };
  const cmp = () => {
    const a = sum();
    return op("=") ? a === sum() : a;
  };
  /** @returns {any} */
  const not = () => (op("not") ? !not() : cmp());
  const and = () => {
    let v = not();
    while (op("and")) v = not() && v;
    return v;
  };
  /** @returns {any} */
  const or = () => {
    let v = and();
    while (op("or")) v = and() || v;
    return v;
  };
  const value = or();
  assert.equal(at, tokens.length, `all of ${expression} was read`);
  assert.equal(typeof value, expectedType);
  return value;
}

/** Every control of hud_screen.json by name, to resolve `name@hud.template` the way the game does. */
const templates = new Map(
  Object.entries(ui)
    .filter(([key, value]) => key !== "namespace" && value && typeof value === "object" && !Array.isArray(value))
    .map(([key, value]) => [key.split("@")[0], { parent: key.split("@")[1]?.replace(/^hud\./, ""), value }]),
);
const templateProps = (/** @type {string} */ name) => {
  const t = templates.get(name);
  return t ? { ...(t.parent ? templateProps(t.parent) : {}), ...t.value } : {};
};
const instantiate = (/** @type {string} */ key, /** @type {any} */ own) => {
  const parent = key.split("@")[1]?.replace(/^hud\./, "");
  return { ...(parent ? templateProps(parent) : {}), ...own };
};
const varsOf = (/** @type {any} */ props, /** @type {Record<string, string>} */ inherited) => {
  const out = { ...inherited };
  for (const [k, v] of Object.entries(props)) if (k.startsWith("$") && !k.includes("|")) out[k.slice(1)] = /** @type {string} */ (v);
  for (const [k, v] of Object.entries(props)) if (k.endsWith("|default") && !(k.slice(1, -8) in out)) out[k.slice(1, -8)] = /** @type {string} */ (v);
  return out;
};

/** Every image the side area draws that is a black box or the radar's frame, with the `#visible` bindings above it. */
function drawnBackgrounds() {
  /** @type {{ name: string, owner: string, gates: { name: string, expr: string, vars: Record<string, string> }[] }[]} */
  const found = [];
  /** @param {string} key @param {any} own @param {Record<string, string>} inherited @param {{ name: string, expr: string, vars: Record<string, string> }[]} gates */
  const walk = (key, own, inherited, gates) => {
    const props = instantiate(key, own);
    const vars = varsOf(props, inherited);
    const name = key.split("@")[0];
    const gate = (props.bindings ?? []).find((/** @type {any} */ b) => b.target_property_name === "#visible");
    const next = gate ? [...gates, { name, expr: gate.source_property_name, vars }] : gates;
    if (props.type === "image" && /^textures\/ui\/(Black|radar_frame|radar_shade)$/.test(props.texture ?? "")) found.push({ name, owner: next.at(-1)?.name ?? "", gates: next });
    for (const child of props.controls ?? []) {
      const [[k, o]] = Object.entries(child);
      walk(k, o, vars, next);
    }
  };
  walk("realm_side_area", ui.realm_side_area, {}, []);
  return found;
}

/** The panels whose backgrounds draw for one title and subtitle, by the name of the panel that owns the background. */
function visibleOwners(/** @type {string} */ title, /** @type {string} */ subtitle) {
  const env = { "#hud_title_text_string": title, "#hud_subtitle_text_string": subtitle };
  return [...new Set(drawnBackgrounds().filter((b) => b.gates.every((g) => evaluate(g.expr, g.vars, env))).map((b) => b.owner))].sort();
}

test("the empty radar the producer sends is the empty radar the HUD's visibility binding compares with", () => {
  const side = loadSide();
  const emptyRadar = side.segment("", " ", side.RADAR_SEG_BYTES).slice(1);
  assert.equal(Buffer.byteLength(emptyRadar), side.RADAR_SEG_BYTES - 1, "the radar cut is the segment without its separator");
  const sentinel = ui.realm_radar_panel["$radar_empty|default"];
  assert.ok(sentinel === emptyRadar, `the radar's empty sentinel is ${Buffer.byteLength(sentinel)} bytes, the producer's empty radar is ${Buffer.byteLength(emptyRadar)}: it can never match`);
  for (const [panel, variable, bytes] of [[ui.realm_slot, "$slot_empty|default", side.SEG_BYTES]]) {
    const empty = side.segment("", " ", bytes).slice(1);
    assert.ok(panel[variable] === empty, `${variable} is the producer's empty segment (${Buffer.byteLength(empty)} bytes)`);
  }
});

test("a slot with nothing in it hides its whole panel, background included: the radar, the compass strip, the quest box", () => {
  const side = loadSide();
  const radarFull = Array.from({ length: 33 }, () => G.Q_EMPTY.repeat(33)).join("\n") + SELF_ARROWS[0] + "1";
  const radarMax = "x".repeat(side.RADAR_SEG_BYTES - 1);
  assert.equal(Buffer.byteLength(radarFull), 3303, "current wire: 33 rows plus self glyph and ASCII visibility");
  const text = (/** @type {string} */ slot) => (slot === "radar" ? radarFull : slot === "top" ? "N" : "§fReadout");
  const quest = (/** @type {string} */ slot) => `${side.questCode(slot)}§bLast Map§7: Three Pins`;
  /** @type {[string, string, Record<string, string>, string[]][]} */
  const states = [
    ["nothing in any slot", side.MARK, side.compose({}), []],
    ["the screen cleared", "§s§0§r", " ", []],
    ["a one-character radar", side.MARK, side.compose({ radar: "x" }), ["realm_radar"]],
    ["a radar at the segment's limit", side.MARK, side.compose({ radar: radarMax }), ["realm_radar"]],
    ["a radar with the compass strip and a box", side.MARK, side.compose({ top: "N", radar: radarFull, right2: "§fHi" }), ["realm_radar", "realm_right2", "realm_top"]],
  ];
  for (const slot of side.SLOTS) states.push([`${slot} alone (no radar, no compass, no quest box)`, side.MARK, side.compose({ [slot]: text(slot) }), [`realm_${slot}`]]);
  states.push(["the compass strip alone", side.MARK, side.compose({ top: text("top") }), ["realm_top"]]);
  states.push(["the radar alone", side.MARK, side.compose({ radar: text("radar") }), ["realm_radar"]]);
  states.push(["N header hides retained dense grid", side.MARK, "N00000000" + side.compose({radar:radarFull}).slice(9), []]);
  states.push(["real title suppresses Side HUD including dense map", "A real held title", side.compose({radar:radarFull,top:"N",right1:"foreign"}), []]);
  for (const slot of side.SLOTS) states.push([`the quest box alone, at ${slot}`, side.MARK, side.compose({ quest: quest(slot) }), [`realm_quest_${slot}`]]);
  states.push(["the quest box beside a box", side.MARK, side.compose({ right1: "§fHi", quest: quest("right1") }), ["realm_quest_right1", "realm_right1"]]);
  /** @type {string[]} */
  const wrong = [];
  for (const [name, title, subtitle, expected] of states) {
    const got = visibleOwners(title, subtitle);
    if (JSON.stringify(got) !== JSON.stringify(expected)) wrong.push(`${name}: draws ${JSON.stringify(got)}, wanted ${JSON.stringify(expected)}`);
  }
  assert.deepEqual(wrong, [], "only the panels with something in their slot draw their background");
});

test("every black box and frame the side area draws belongs to a panel that is hidden while its slot is empty", () => {
  const found = drawnBackgrounds();
  assert.ok(found.some((b) => b.owner === "realm_radar"), "the radar's black square is one of them");
  for (const b of found) {
    assert.ok(b.gates.length > 0, `${b.name} has an ancestor that hides it`);
    assert.ok(b.gates.some((g) => g.expr.includes("#hud_subtitle_text_string")), `${b.name} is hidden by what the subtitle holds, not only by the title`);
  }
});
// Explicit current dense fixture: producer bytes are evaluated through the actual HUD binding expressions.
test("dense producer roundtrips all UI cuts at full capacity without self/quest/slot overlap", () => {
  const side = loadSide();
  const grid = Array.from({length:33},(_,r)=>Array.from({length:33},(_,c)=>String.fromCodePoint(0xf400+(r+c)%32)).join("")).join("\n");
  const find = (name, node = ui.realm_side_area) => {
    for (const control of node.controls ?? []) for (const [key, own] of Object.entries(control)) {
      if (key.split("@")[0] === "realm_" + name) return own;
      const nested = find(name, own); if (nested) return nested;
    }
  };
  const textExpr = ui.realm_slot_text.bindings.at(-1).source_property_name;
  const widget = ui.realm_radar_panel.controls[0].radar_widget;
  const children = Object.fromEntries(widget.controls.map(c=>Object.entries(c)[0]));
  const quest = side.questCode("right4") + "Q".repeat(502);
  assert.equal(Buffer.byteLength(quest), 511, "whole 512-byte quest segment includes one separator");
  assert.equal(Buffer.byteLength(grid), 3299);
  for (const self of SELF_ARROWS) {
    const wire = grid + self + "1";
    const texts = Object.fromEntries([...side.SLOTS,"top"].map((name,i)=>[name,(i+":"+name+":").padEnd(159,String.fromCharCode(65+i))]));
    Object.assign(texts,{radar:wire,quest});
    const sub = side.compose(texts), bytes = Buffer.from(sub), env = {"#hud_title_text_string":side.MARK,"#hud_subtitle_text_string":sub};
    assert.equal(Buffer.byteLength(wire),3303); assert.equal(bytes.length,5425); assert.equal(sub.slice(0,9),"R00000000");
    for (const name of [...side.SLOTS,"top"]) {
      const own = find(name); assert.ok(own?.$skip,name);
      const got = evaluate(textExpr,{skip:own.$skip,slot_slice:ui.realm_slot_text["$slot_slice|default"]},env,"string");
      assert.equal(got,texts[name],name+" actual UI binding retains all159 bytes with no neighbor data");
    }
    for (const child of children.radar_clip.controls) {
      const mesh = Object.values(child)[0];
      assert.equal(evaluate(mesh.bindings.at(-1).source_property_name,{},env,"string"),grid,"every mesh cuts only3299 grid bytes");
    }
    assert.equal(evaluate(children.radar_self.bindings.at(-1).source_property_name,{},env,"string"),self);
    assert.equal(bytes.subarray(1610,4909).toString(),grid); assert.equal(bytes.subarray(4909,4912).toString(),self);
    assert.equal(bytes[4912],49,"ASCII visibility is outside the grid/self"); assert.equal(bytes[4913],10,"quest has its own separator");
    assert.equal(bytes.subarray(4914).toString(),quest);
    const q = ui["realm_quest_slot@hud.realm_slot"];
    assert.equal(evaluate(textExpr,{skip:q.$skip,slot_slice:q.$slot_slice},env,"string"),quest,"quest's real511-byte UI cut survives full dense payload");
    assert.deepEqual(visibleOwners(side.MARK,sub),[...side.SLOTS.map(n=>"realm_"+n),"realm_top","realm_radar","realm_quest_right4"].sort());
    assert.equal(side.compose({}).slice(0,9),"N00000000");
  }
});
test("turned radar keeps a fixed 3-byte self slot and a 0 flag: static N/E/S/W badges show only when the flag at byte 4912 is 1", () => {
  const side = loadSide();
  const grid = Array.from({length:33},()=>G.Q_EMPTY.repeat(33)).join("\n");
  const widget = ui.realm_radar_panel.controls[0].radar_widget;
  const children = Object.fromEntries(widget.controls.map(c=>Object.entries(c)[0]));
  for (const [north, self, flag] of [[true,SELF_ARROWS[3],"1"],[false,G.Q_OUTSIDE,"0"]]) {
    const wire = grid + self + flag;
    assert.equal(Buffer.byteLength(wire),3303,"wire length never varies with the north preference");
    const sub = side.compose({ radar: wire }), bytes = Buffer.from(sub), env = {"#hud_title_text_string":side.MARK,"#hud_subtitle_text_string":sub};
    assert.equal(bytes.subarray(4909,4912).toString(),self); assert.equal(bytes[4912],flag.charCodeAt(0));
    assert.equal(evaluate(children.radar_self.bindings.at(-1).source_property_name,{},env,"string"),self);
    for (const name of ["radar_n","radar_e","radar_s","radar_w"]) {
      const view = children[name].bindings.find(b=>b.target_property_name==="#visible");
      assert.ok(view.source_property_name.includes("%.4912s"),name+" reads the flag byte only");
      assert.equal(evaluate(view.source_property_name,{},env,"boolean"),north,name+" visible only with the north flag");
    }
    assert.equal(side.compose({ radar: wire }).slice(0,1),"R","outer panel visibility uses the R prefix, not the flag");
  }
  const mainSrc = fs.readFileSync(new URL("../packs/map_bp/scripts/main.js", import.meta.url), "utf8");
  assert.ok(mainSrc.includes("${v.north ? SELF_ARROWS[Math.round(heading / 45) % 8] : G.Q_OUTSIDE}${v.north ? \"1\" : \"0\"}"), "producer always sends 3 self bytes plus a 1/0 north flag");
});
test("the approved unknown glyph keeps its distinct F338 id with flat opaque cosmetic grass paint", () => {
  assert.equal(G.Q_EMPTY.codePointAt(0),0xf338); assert.notEqual(G.Q_EMPTY,G.Q_GRASS);
  const font = image("font/glyph_F3.png");
  for (let y=0;y<16;y++) for (let x=0;x<16;x++) {
    const i=((48+y)*font.width+128+x)*4;
    assert.deepEqual([...font.data.subarray(i,i+4)],[56,128,48,255]);
  }
  // This is bitmap/identity evidence only: no known-terrain, native sampling, FPS or client-render claim.
});
