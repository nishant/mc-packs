// Townsfolk's town mayors (packs/npc_bp/scripts/mayors.js and its use in main.js): a mayor per town with the id
// `mayor:<town>`, built from CONFIG.mayorTemplate with the `mayor` role only; skins saved as `realm_npc:m_<town>`;
// the saved list keeps a mayor only while npc:mayors has it, and mayors are dropped only after a complete list.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { CONFIG } from "../packs/npc_bp/scripts/config.js";
import { MAX_MAYORS, createIdsAssembler, folkFor, isMayorId, keepPlaced, normalizeMayors, parseMayorRequest, skinKey, unlisted } from "../packs/npc_bp/scripts/mayors.js";

const mainFile = path.join(import.meta.dirname, "..", "packs", "npc_bp", "scripts", "main.js");
const main = fs.readFileSync(mainFile, "utf8");

test("mayor ids and skin keys", () => {
  assert.ok(isMayorId("mayor:riverside"));
  assert.ok(!isMayorId("bram") && !isMayorId("mayor:") && !isMayorId("mayor:Oak Hollow") && !isMayorId("mayor:a:b"));
  assert.equal(skinKey("mayor:riverside"), "m_riverside");
  assert.equal(skinKey("bram"), "bram");
  const id = `realm_npc:${skinKey("mayor:oak_hollow_2")}`;
  assert.equal(id.split(":").length, 2, "a structure id has one colon");
  assert.match(main, /SKIN_PREFIX \+ skinKey\(id\)/);
  assert.match(main, /SKIN_PREFIX \+ skinKey\(rec\.id\)/);
  assert.doesNotMatch(main, /SKIN_PREFIX \+ (id|rec\.id)\b(?!\))/, "every skin structure id goes through skinKey");
});

test("folkFor: a mayor from the template, mayor role only, {town} filled in", () => {
  const t = folkFor("mayor:riverside", { n: "Mayor Alda", t: "riverside", tn: "Riverside" }, CONFIG.mayorTemplate);
  assert.equal(t.id, "mayor:riverside");
  assert.equal(t.name, "Mayor Alda");
  assert.equal(t.title, "of Riverside");
  assert.deepEqual(t.roles, ["mayor"], "never questgiver: favors and chapters stay with the cast");
  for (const k of ["morning", "day", "evening", "night", "rain", "thunder"]) {
    assert.ok(t.greetings[k].length > 0, k);
    for (const line of t.greetings[k]) assert.ok(!line.includes("{town}") && /^[\x20-\x7e]*$/.test(line), line);
  }
  assert.ok(t.idle.length > 0 && t.idle.every((l) => !l.includes("{town}")));
  assert.ok(t.greetings.day.some((l) => l.includes("Riverside")));
  assert.ok(!CONFIG.townsfolk.some((c) => c.id.startsWith("mayor:")), "the cast keeps its fixed ids");
});

test("normalizeMayors keeps valid records, at most 64", () => {
  const raw = { "mayor:a": { n: "Mayor A", t: "a", tn: "A" }, bram: { n: "x" }, "mayor:b": { n: "" }, "mayor:c": { n: "Mayoré C§e", t: "c" } };
  const m = normalizeMayors(raw);
  assert.deepEqual([...m.keys()], ["mayor:a", "mayor:c"]);
  assert.equal(m.get("mayor:c")?.n, "Mayor C");
  assert.equal(m.get("mayor:c")?.tn, "c");
  const many = Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`mayor:t${i}`, { n: `M${i}`, t: `t${i}` }]));
  assert.equal(normalizeMayors(many).size, MAX_MAYORS);
  assert.equal(normalizeMayors("nope").size, 0);
  assert.equal(normalizeMayors([1, 2]).size, 0);
});

test("parseMayorRequest", () => {
  assert.deepEqual(parseMayorRequest({ op: "set", id: "mayor:riverside", name: "Mayor Alda", town: "riverside", tn: "Riverside", dim: "overworld", x: 1, y: 64, z: -3, yaw: 90 }), {
    op: "set", id: "mayor:riverside", name: "Mayor Alda", tn: "Riverside", town: "riverside", dim: "minecraft:overworld", x: 1, y: 64, z: -3, yaw: 90,
  });
  assert.deepEqual(parseMayorRequest({ op: "rename", id: "mayor:riverside", name: "  Pell… ", tn: "Riverside" }), { op: "rename", id: "mayor:riverside", name: "Pell", tn: "Riverside" });
  assert.deepEqual(parseMayorRequest({ op: "remove", id: "mayor:riverside" }), { op: "remove", id: "mayor:riverside" });
  assert.ok("error" in parseMayorRequest({ op: "set", id: "bram", name: "x", dim: "overworld", x: 0, y: 0, z: 0 }), "the cast is never a town mayor");
  assert.ok("error" in parseMayorRequest({ op: "set", id: "mayor:a", name: "x", dim: "overworld", x: 0, y: "64", z: 0 }));
  assert.ok("error" in parseMayorRequest({ op: "set", id: "mayor:a", name: "éé", dim: "overworld", x: 0, y: 0, z: 0 }));
  assert.ok("error" in parseMayorRequest({ op: "eat", id: "mayor:a" }));
  for (const r of [parseMayorRequest({ op: "set", id: `mayor:${"a".repeat(40)}`, name: "N".repeat(40), tn: "T".repeat(40), dim: "overworld", x: 1e7, y: 64, z: -1e7, yaw: 0 })]) {
    const ack = JSON.stringify({ id: `mayor:${"a".repeat(40)}`, op: "set", ok: false, error: `too many mayors (at most ${MAX_MAYORS})` });
    assert.ok(JSON.stringify({ op: "set", ...r }).length < 300 && ack.length < 300, "messages stay under 300 characters");
  }
});

test("keepPlaced: the cast while in config.js, a mayor while npc:mayors has it", () => {
  const mayors = new Map([["mayor:riverside", {}]]);
  const inCast = (id) => id === "bram";
  assert.ok(keepPlaced("bram", inCast, mayors));
  assert.ok(keepPlaced("mayor:riverside", inCast, mayors));
  assert.ok(!keepPlaced("mayor:oakfield", inCast, mayors));
  assert.ok(!keepPlaced("gone", inCast, mayors));
});

test("the id list counts only when complete", () => {
  const a = createIdsAssembler();
  assert.equal(a.add({ part: 1, parts: 2, ids: ["mayor:a"] }), undefined);
  assert.deepEqual([...(a.add({ part: 2, parts: 2, ids: ["mayor:b", "bram", 5] }) ?? [])].sort(), ["mayor:a", "mayor:b"]);
  assert.equal(a.add({ part: 2, parts: 2, ids: ["mayor:b"] }), undefined, "a lone second part is not a list");
  assert.equal(a.add({ part: 1, parts: 3, ids: [] }), undefined, "a new list starts at part 1");
  assert.equal(a.add({ part: 2, parts: 3, ids: [] }), undefined);
  assert.deepEqual([...(a.add({ part: 3, parts: 3, ids: ["mayor:c"] }) ?? [])], ["mayor:c"]);
  assert.deepEqual([...(a.add({ part: 1, parts: 0, ids: [] }) ?? ["x"])], [], "parts 0: no towns");
  assert.equal(a.add({ parts: "x" }), undefined);
  assert.equal(a.add(null), undefined);
  const mayors = new Map([["mayor:a", {}], ["mayor:b", {}]]);
  assert.deepEqual(unlisted(mayors, new Set(["mayor:a"])), ["mayor:b"]);
});

/** Runs main.js's own load() and upgrade() against a fake world. */
function runLoad(listJson, mayorsJsonText) {
  const source = ts.createSourceFile("main.js", main, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const parts = [];
  const want = new Set(["load", "upgrade", "loadMayors", "save", "saveMayors"]);
  ts.forEachChild(source, (node) => {
    if (ts.isFunctionDeclaration(node) && want.has(node.name?.text ?? "")) parts.push(node.getText(source));
    if (ts.isVariableStatement(node) && /\b(isNum|spotOrNot|inCast|keepAtLoad) = /.test(node.getText(source))) parts.push(node.getText(source));
  });
  const props = new Map([["npc:list", listJson], ["npc:mayors", mayorsJsonText]]);
  const warnings = [];
  const ctx = {
    world: { getDynamicProperty: (k) => props.get(k), setDynamicProperty: (k, v) => props.set(k, v) },
    console: { warn: (m) => warnings.push(m) },
    folk: new Map(CONFIG.townsfolk.map((t) => [t.id, t])),
    normalizeMayors,
    keepPlaced,
    isMayorId,
    mayorsJson: (m) => Object.fromEntries(m),
    placesSoon() {},
    mayorFolk: new Map(),
    PROP_LIST: "npc:list",
    PROP_MAYORS: "npc:mayors",
  };
  vm.runInNewContext(`var list = [], loadFailed = false, mayors = new Map(), mayorsCorrupt = false;\n${parts.join("\n")}\nloadMayors(); load(); this.out = { list, mayors, mayorsCorrupt };`, ctx);
  return { ...ctx.out, warnings };
}

test("load keeps the cast and listed mayors, drops unlisted mayors", () => {
  const list = [
    { id: "bram", dim: "minecraft:overworld", x: 0.5, y: 64, z: 0.5, yaw: 0 },
    { id: "mayor:riverside", dim: "minecraft:overworld", x: 200.5, y: 70, z: 0.5, yaw: 90 },
    { id: "mayor:gone", dim: "minecraft:overworld", x: 400.5, y: 70, z: 0.5, yaw: 0 },
  ];
  const r = runLoad(JSON.stringify(list), JSON.stringify({ "mayor:riverside": { n: "Mayor Alda", t: "riverside", tn: "Riverside" } }));
  assert.deepEqual([...r.list.map((x) => x.id)], ["bram", "mayor:riverside"]);
  assert.ok(r.warnings.some((w) => w.includes("mayor:gone")));
  // An old world without npc:mayors: the cast loads as before, no mayors.
  const old = runLoad(JSON.stringify(list.slice(0, 1)), undefined);
  assert.deepEqual([...old.list.map((x) => x.id)], ["bram"]);
  assert.equal(old.mayors.size, 0);
  // A corrupt npc:mayors: mayor entities are left alone by the audit (mayorsCorrupt).
  const bad = runLoad(JSON.stringify(list), "{not json");
  assert.equal(bad.mayorsCorrupt, true);
  assert.deepEqual([...bad.list.map((x) => x.id)], ["bram", "mayor:riverside", "mayor:gone"], "posts kept until Town Projects sets them again");
  assert.match(main, /if \(!loadFailed && !\(mayorsCorrupt && isMayorId\(id\)\)\) entity\.remove\(\);/);
});

test("affinity, gifts and keepsakes stay with the cast; houses move the cast only", () => {
  const tapped = /async function tapped\([\s\S]*?\n}\n/.exec(main)?.[0] ?? "";
  assert.match(tapped, /const t = folkOf\(id\);/);
  assert.match(tapped, /const cast = folk\.has\(id\);/);
  assert.match(tapped, /if \(cast\) \{\s*talkedTo\(player, t\);\s*keepsake\(player, t\);/);
  assert.match(tapped, /const hearth = cast && get\("affinity"\) === true;/);
  assert.match(tapped, /if \(gift && cast && /);
  assert.match(main, /const ids = list\.map\(\(r\) => r\.id\)\.filter\(inCast\);/);
  // gain() and the affinity cache only know the cast.
  assert.match(main, /function gain\([\s\S]*?const t = folk\.get\(id\);/);
  assert.match(main, /if \(e && folk\.has\(id\)\) aff\[id\] = e;/);
});
