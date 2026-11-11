// Source-level checks for MCP-335, MCP-338, MCP-247, MCP-248 (Wanderers and Townsfolk fixes).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(`../packs/${p}/scripts/main.js`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const wander = read("wander_bp");
const npc = read("npc_bp");

test("wander help text uses the in-game distances, not 300 and 160", () => {
  const line = wander.split("\n").find((l) => l.includes("Out past the town lamps"));
  assert.ok(line);
  assert.match(line, /get\("spawnDistance"\)/);
  assert.match(line, /get\("zoneDistance"\)/);
  assert.doesNotMatch(line, /\b300\b|\b160\b/);
});

test("tapped() frees the busy flag only in finally, after the accuse form", () => {
  const i = wander.indexOf("await accuseForm(player, wid);");
  assert.ok(i > 0);
  const before = wander.slice(i - 400, i);
  assert.doesNotMatch(before, /busy\.delete/);
  assert.match(wander.slice(i, i + 200), /finally \{\n\s+busy\.delete\(player\.id\)/);
});

test("undoMove writes PROP_PREV once, before the per-dimension loop", () => {
  const body = npc.slice(npc.indexOf("async function undoMove"), npc.indexOf("async function undoMove") + 3000);
  assert.equal((body.match(/keepPrev\(\)/g) ?? []).length, 1);
  assert.match(body, /moveTo\(world\.getDimension\(d\), plan, \{ savePrev: false \}\)/);
  assert.ok(body.indexOf("keepPrev()") < body.indexOf("for (const [d, plan] of byDim)"));
  const mv = npc.slice(npc.indexOf("async function moveTo"), npc.indexOf("async function moveTo") + 200);
  assert.match(mv, /savePrev = true/);
  assert.match(npc, /houseNpcs[\s\S]*?await moveTo\(dim, plan\);/);
});

test("gossip about a name-only subject is still recognised by name", () => {
  assert.match(npc, /g\.p === player\.id \|\| g\.p === player\.name \|\| g\.n === player\.name/);
  assert.match(npc, /\(o\.p === g\.p \|\| \(!!g\.n && o\.n === g\.n\)\)/);
});
