// Crowns top-list name cache (audit MCP-072/090): keys keep insertion order, the trim drops the longest unseen, size is bounded.
import assert from "node:assert/strict";
import test from "node:test";
import { loadNames, lookupName, rememberInCache } from "../packs/crowns_bp/scripts/names.js";

test("MCP-072: the trim drops the player seen longest ago, not the lowest id", () => {
  const cache = {};
  rememberInCache(cache, 5, "Five", 3);
  rememberInCache(cache, 900, "Nine", 3);
  rememberInCache(cache, 1, "One", 3);
  rememberInCache(cache, 5, "Five!", 3); // five returns: now the newest
  rememberInCache(cache, 2, "Two", 3);
  assert.deepEqual(Object.keys(cache), ["s1", "s5", "s2"]);
  assert.equal(lookupName(cache, 1), "One");
  assert.equal(lookupName(cache, 5), "Five!");
  assert.equal(lookupName(cache, 900), undefined);
});

test("MCP-072: a returning player with a low id is not trimmed in the same call", () => {
  const cache = {};
  for (let i = 1; i <= 800; i++) cache[`s${i}`] = `P${i}`;
  rememberInCache(cache, 1, "Renamed", 800);
  assert.equal(lookupName(cache, 1), "Renamed");
  assert.equal(Object.keys(cache).length, 800);
  rememberInCache(cache, 5000, "New", 800);
  assert.equal(lookupName(cache, 2), undefined, "the longest unseen went");
  assert.equal(lookupName(cache, 1), "Renamed");
});

test("MCP-072: names saved with bare numeric keys are migrated", () => {
  const cache = loadNames({ 7: "Seven", 3: "Three", s9: "Nine", bad: 4 });
  assert.equal(lookupName(cache, 7), "Seven");
  assert.equal(lookupName(cache, 3), "Three");
  assert.equal(cache.s9, "Nine");
  assert.deepEqual(loadNames([1, 2]), {});
  assert.deepEqual(loadNames(null), {});
});

test("MCP-090: the saved JSON stays under the size limit and names are cut to 32 characters", () => {
  const cache = {};
  let json = "";
  for (let i = 0; i < 900; i++) json = rememberInCache(cache, 1000 + i, "名".repeat(60), 800) ?? json;
  assert.ok(json.length <= 30000, `${json.length} characters`);
  assert.equal(lookupName(cache, 1899), "名".repeat(32));
  assert.equal(lookupName(cache, 1000), undefined);
  assert.equal(rememberInCache(cache, 1899, "名".repeat(60), 800), undefined, "unchanged: nothing to save");
});
