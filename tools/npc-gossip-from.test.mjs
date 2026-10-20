// Townsfolk gossip with `from` (packs/npc_bp/scripts/main.js hearGossip and gossipLine, mayors.js gossipFrom and
// tellsGossip): a piece of realm:gossip that names who tells it ("mayor:<town>", or "bram" for his town) is told only
// by that townsfolk; pieces without it stay everyone's. Two towns' mayors' news are two pieces, not one replacing the
// other. Town Projects sends { kind: "town_life", place: <town>, from: <the town's mayor> }.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { GOSSIP } from "../packs/npc_bp/scripts/hearth.js";
import { gossipFrom, tellsGossip } from "../packs/npc_bp/scripts/mayors.js";

const main = fs.readFileSync(path.join(import.meta.dirname, "..", "packs", "npc_bp", "scripts", "main.js"), "utf8");
const NAMES = ["GOSSIP_KIND", "GOSSIP_REPEAT_MS", "GOSSIP_PER_KIND", "gossipAlive", "hearGossip", "fillGossip", "gossipLine", "isNum", "pick"];

function extract() {
  const src = ts.createSourceFile("main.js", main, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const out = new Map();
  ts.forEachChild(src, (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && NAMES.includes(n.name.text)) out.set(n.name.text, n.getText(src));
    if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) if (ts.isIdentifier(d.name) && NAMES.includes(d.name.text)) out.set(d.name.text, n.getText(src));
  });
  for (const n of NAMES) assert.ok(out.has(n), `main.js has ${n}`);
  return [...out.values()].join("\n");
}

/** main.js's own gossip intake and greeting line, with a fake world. */
function load() {
  const heard = new Map();
  const ctx = {
    world: { getAllPlayers: () => [] },
    CONFIG: { gossipHours: 48, gossipMax: 24 },
    get: (k) => (k === "affinity" ? true : k === "gossipChance" ? 100 : undefined),
    heardOf: (p) => heard.get(p.id) ?? [],
    heardCache: { set: (id, v) => heard.set(id, v) },
    crowned: () => false,
    saveGossip: () => {},
    HEARTH: {},
    GOSSIP,
    gossipFrom,
    tellsGossip,
    Math,
    Date,
  };
  vm.runInNewContext(`var gossip = [], gossipNext = 1;\n${extract()}\nthis.fns = { hearGossip, gossipLine, all: () => gossip };`, ctx);
  return ctx.fns;
}

const player = (id) => ({ id, name: id, setDynamicProperty: () => {} });
const folk = (id) => ({ id, name: id });

test("gossipFrom and tellsGossip", () => {
  assert.equal(gossipFrom("mayor:riverside"), "mayor:riverside");
  assert.equal(gossipFrom("bram"), "bram");
  for (const bad of [undefined, "", 5, "Mayor Alda", "mayor:Oak Hollow", "x".repeat(40), "a:b:c"]) assert.equal(gossipFrom(bad), undefined, String(bad));
  assert.ok(tellsGossip({}, "tobin"), "no from: everyone tells it");
  assert.ok(tellsGossip({ f: "mayor:elm" }, "mayor:elm"));
  assert.ok(!tellsGossip({ f: "mayor:elm" }, "bram"));
  assert.ok(!tellsGossip({ f: "bram" }, "mayor:elm"));
  assert.ok(tellsGossip({ f: 7 }, "tobin"), "a damaged from is ignored");
});

test("hearGossip keeps from; only that townsfolk tells the piece, others tell the rest", () => {
  const g = load();
  g.hearGossip({ kind: "town_life", place: "Elm", from: "mayor:elm" });
  assert.equal(g.all()[0].f, "mayor:elm");
  assert.equal(g.gossipLine(player("ann"), folk("tobin")), undefined, "Tobin doesn't tell Elm's mayor's news");
  assert.equal(g.gossipLine(player("ann"), folk("mayor:oak")), undefined, "nor does another town's mayor");
  const line = g.gossipLine(player("ann"), folk("mayor:elm"));
  assert.ok(line && line.includes("Elm"), `Elm's mayor tells it: ${line}`);
  assert.ok(!/\{(name|place|player|n)\}/.test(line), "every placeholder filled");
  assert.equal(g.gossipLine(player("ann"), folk("mayor:elm")), undefined, "heard once");
  // Without from, everyone tells it (as before).
  g.hearGossip({ kind: "caravan", place: "Market Square" });
  assert.ok(g.gossipLine(player("bob"), folk("tobin"))?.includes("Market Square"));
  // A bad from is dropped: the piece is everyone's.
  g.hearGossip({ kind: "caravan", place: "Dock", from: "Not An Id" });
  assert.equal(g.all().at(-1).f, undefined);
});

test("two towns' news within 30 minutes are two pieces; the same town's again replaces its own", () => {
  const g = load();
  g.hearGossip({ kind: "town_life", place: "Elm", from: "mayor:elm" });
  g.hearGossip({ kind: "town_life", place: "Oak", from: "mayor:oak" });
  assert.equal(g.all().length, 2);
  g.hearGossip({ kind: "town_life", place: "Elm", from: "mayor:elm" });
  assert.equal(g.all().filter((x) => x.f === "mayor:elm").length, 1);
  assert.equal(g.all().length, 2);
  g.hearGossip({ kind: "town_life", place: "First", from: "bram" });
  assert.ok(g.gossipLine(player("cy"), folk("bram"))?.includes("First"), "Bram tells his town's news");
});

test("town_life lines: plain ASCII, no {name} (town news names nobody)", () => {
  assert.ok(GOSSIP.town_life.length >= 3);
  for (const pair of GOSSIP.town_life)
    for (const line of pair) {
      assert.match(line, /^[\x20-\x7e]+$/);
      assert.ok(!line.includes("{name}") && line.includes("{place}"), line);
    }
});
