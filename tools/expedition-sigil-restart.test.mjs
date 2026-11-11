// MCP-081: a sigil lost to a restart before the run starts is given back. The existing mocks cannot drive worldLoad
// for the whole main.js, so this runs the production parseSigilLine, keepSigil, restoreSigil and recordOf (cut out of
// main.js) against small stubs, and checks the wiring in the source.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const src = readFileSync(new URL("../packs/expedition_bp/scripts/main.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const grab = (re) => {
  const m = src.match(re);
  assert.ok(m, `production ${re}`);
  return m[0];
};
const code = [
  grab(/^const PROP_SIGIL = .*$/m),
  grab(/^const PROP_RUN = .*$/m),
  grab(/^const SIGIL_LINE = .*$/m),
  grab(/^function parseSigilLine\([\s\S]*?^\}/m),
  grab(/^function readSigil\([\s\S]*?^\}/m),
  grab(/^function keepSigil\([\s\S]*?^\}/m),
  grab(/^function restoreSigil\([\s\S]*?^\}/m),
  grab(/^const recordOf = [\s\S]*?^\}\);/m),
].join("\n");

function setup() {
  const props = new Map();
  const parcels = [];
  const dropped = new Map();
  const dungeon = { id: "crypt", name: "Crypt" };
  const ctx = vm.createContext({
    CONFIG: { sigilItem: "realm:sigil" },
    AFFIXES: [{ id: "swift", code: "sw" }, { id: "brutal", code: "br" }],
    dungeonById: (id) => (id === "crypt" ? dungeon : undefined),
    makeSigil: (d, tier, affixes) => ({ typeId: "realm:sigil", d, tier, affixes, getLore: () => [`§8#${d.id}/${tier}/${affixes.map((a) => ({ swift: "sw", brutal: "br" })[a]).join(".")}`] }),
    readJson: (k) => (props.has(k) ? JSON.parse(props.get(k)) : undefined),
    writeJson: (k, v) => (v === undefined ? props.delete(k) : props.set(k, JSON.stringify(v))),
    site: () => ({ x: 100, z: 200 }),
    parcelUp: (o, kind, by) => { parcels.push({ o, kind, by }); return []; },
    dropped,
    console,
    spoilChests: () => [],
  });
  vm.runInContext(`${code}\nthis.api = { parseSigilLine, readSigil, keepSigil, restoreSigil, recordOf, PROP_SIGIL, PROP_RUN };`, ctx);
  return { ctx, api: ctx.api, props, parcels, dropped, dungeon };
}

const LINE = "§8#crypt/3/sw.br";
const mkRun = (api, line) => ({
  id: 1, slot: 1, dungeon: { id: "crypt" }, seed: 5, o: { x: 10, y: -40, z: 20 }, leaderName: "Ann", leaderId: "p1", phase: "gathering",
  level: 5, lay: { grid: 3, cell: 16 }, top: 7, members: new Map(),
  sigilItem: line ? { typeId: "realm:sigil", getLore: () => [line] } : undefined,
});

test("parseSigilLine reads the line the way readSigil does", () => {
  const { api } = setup();
  const s = api.parseSigilLine(LINE);
  assert.equal(s.d.id, "crypt");
  assert.equal(s.tier, 3);
  assert.deepEqual([...s.affixes], ["swift", "brutal"]);
  assert.equal(api.parseSigilLine("§8#nowhere/3/"), undefined);
  assert.equal(api.parseSigilLine("§8#crypt/99/"), undefined);
  assert.equal(api.readSigil({ typeId: "realm:sigil", getLore: () => ["x", LINE] }).line, LINE);
});

test("a sigil run's saved data carries the line and the leader", () => {
  const { api, props } = setup();
  const run = mkRun(api, LINE);
  assert.equal(api.recordOf(run).sg, LINE);
  assert.equal(api.recordOf(run).lid, "p1");
  api.keepSigil(run);
  assert.deepEqual(JSON.parse(props.get(api.PROP_SIGIL + "1")), { sg: LINE, lid: "p1", x: 10, y: -40, z: 20 });
  run.sigilItem = undefined; // the party went in
  assert.equal("sg" in api.recordOf(run), false);
  api.keepSigil(run);
  assert.equal(props.has(api.PROP_SIGIL + "1"), false);
});

test("after a reload the leader gets a sigil parcel and the entry is cleared", () => {
  const { api, props, parcels, dropped } = setup();
  api.keepSigil(mkRun(api, LINE));
  api.restoreSigil(1, undefined);
  assert.equal(parcels.length, 1);
  assert.equal(parcels[0].kind, "sigil");
  assert.deepEqual(JSON.parse(JSON.stringify(parcels[0].o)), { x: 10, y: -40, z: 20 });
  const item = parcels[0].by.get("p1")[0];
  assert.equal(item.getLore()[0], LINE);
  assert.equal(props.has(api.PROP_SIGIL + "1"), false);
  assert.equal(dropped.size, 0);
  api.restoreSigil(1, undefined); // nothing left to give twice
  assert.equal(parcels.length, 1);
});

test("a record with sg/lid (box built) is restored once, and a failed parcel falls back to memory", () => {
  const { api, props, parcels, dropped, ctx } = setup();
  const rec = { slot: 2, seed: 1, x: 1, y: 2, z: 3, sg: LINE, lid: "p9" };
  ctx.parcelUp = () => ["p9"];
  api.restoreSigil(2, rec);
  assert.equal(dropped.get("p9").length, 1);
  assert.equal("sg" in rec, false);
  assert.equal(JSON.parse(props.get(api.PROP_RUN + "2")).lid, undefined);
  assert.equal(parcels.length, 0);
});

test("wiring: kept at start, cleared on entry and refund, restored at worldLoad", () => {
  assert.match(src, /runs\.set\(slot, run\);\n {2}keepSigil\(run\);/);
  assert.match(src, /run\.sigilItem = undefined; \/\/ used up for good\n {2}keepSigil\(run\);/);
  assert.match(src, /run\.sigilItem = undefined;\n {2}keepSigil\(run\);/);
  assert.match(src, /restoreSigil\(slot, pending\.get\(slot\)\)/);
});
