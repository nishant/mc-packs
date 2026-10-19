// Treasure Maps' Warmer / Colder line above the hotbar (O55) is a steady line of the action bar protocol: it sends
// its own rank with every redraw, waits for notes and higher-ranked lines, and lets lower ones wait for it. Before,
// it redrew every 40 ticks with a 45-tick request that carried no `steady` and never listened, so every other
// steady line (the story tracker 20, build mode 30, an expedition 40, the relic readouts 45, the Elytra HUD 50)
// waited for as long as a map was held. The server run is tools/test-bds/examples/maps-warmth-steady.js.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const load = () => import(new URL("../packs/maps_bp/scripts/bar.js", import.meta.url).href);
const mainSrc = readFileSync(new URL("../packs/maps_bp/scripts/main.js", import.meta.url), "utf8");

/** The ranks every other steady writer sends, read from their own source so a new collision shows up here. */
function otherRanks() {
  const ranks = new Map();
  const grab = (pack, file, re) => {
    const m = re.exec(readFileSync(new URL(`../packs/${pack}/scripts/${file}`, import.meta.url), "utf8"));
    assert.ok(m, `${pack} ${file} still states its rank`);
    ranks.set(pack, Number(m[1]));
  };
  grab("elytra_bp", "main.js", /const STEADY = (\d+)/);
  grab("expedition_bp", "main.js", /const STEADY = (\d+)/);
  grab("saga_bp", "objectives.js", /TRACKER_STEADY = (\d+)/);
  grab("relics_bp", "main.js", /const STEADY = (\d+)/);
  grab("build_bp", "utils/ActionBar.js", /const STEADY = (\d+)/);
  grab("find_bp", "main.js", /MARK_STEADY = (\d+)/);
  return ranks;
}

test("the warmth line is a steady line with its own rank between build mode and an expedition's run line", async () => {
  const { WARM_STEADY, WARM_HOLD, warmthRequest } = await load();
  assert.equal(WARM_STEADY, 35);
  assert.equal(WARM_HOLD, 45, "the request outlasts the 40-tick redraw, so lower lines keep waiting only while the map is held");
  assert.deepEqual(warmthRequest("p1"), { player: "p1", ticks: 45, from: "maps_bp", steady: 35 });
  assert.ok(JSON.stringify(warmthRequest("x".repeat(40))).length < 2048);
  const ranks = otherRanks();
  assert.ok(![...ranks.values()].includes(WARM_STEADY), `no other steady line uses ${WARM_STEADY}: ${JSON.stringify([...ranks])}`);
  assert.ok(ranks.get("build_bp") < WARM_STEADY && ranks.get("find_bp") < WARM_STEADY && ranks.get("saga_bp") < WARM_STEADY, "above build mode, the finder and the story tracker");
  assert.ok(WARM_STEADY < ranks.get("expedition_bp") && WARM_STEADY < ranks.get("relics_bp"), "below an expedition run line and the relic readouts");
  assert.ok(WARM_STEADY < ranks.get("elytra_bp"));
});

test("notes and higher ranks hold the line, lower ranks and our own requests do not", async () => {
  const { foreignHolds } = await load();
  const note = { player: "p1", ticks: 40, from: "mobhp_bp" };
  assert.equal(foreignHolds(note), true, "a note (no steady) holds every steady line");
  assert.equal(foreignHolds({ ...note, steady: 50, from: "elytra_bp" }), true);
  assert.equal(foreignHolds({ ...note, steady: 45, from: "relics_bp" }), true);
  assert.equal(foreignHolds({ ...note, steady: 40, from: "expedition_bp" }), true);
  assert.equal(foreignHolds({ ...note, steady: 30, from: "build_bp" }), false, "build mode is lower");
  assert.equal(foreignHolds({ ...note, steady: 25, from: "find_bp" }), false);
  assert.equal(foreignHolds({ ...note, steady: 20, from: "saga_bp" }), false);
  assert.equal(foreignHolds({ ...note, steady: 10, from: "party_bp", background: true }), false, "background lines never hold it");
  assert.equal(foreignHolds({ ...note, steady: 35, from: "aaa_bp" }), true, "a tie goes to the from that sorts first");
  assert.equal(foreignHolds({ ...note, steady: 35, from: "zzz_bp" }), false);
  assert.equal(foreignHolds({ ...note, from: "maps_bp", steady: 35 }), false, "our own request");
  assert.equal(foreignHolds({ ...note, from: "maps_bp" }), false, "our own request, even without a rank");
  assert.equal(foreignHolds(null), false);
  assert.equal(foreignHolds({ ticks: 40 }), false, "no player: nothing to hold");
});

test("a request holds the bar until its ticks run out, at most 200, and the longest hold wins", async () => {
  const { noteRequest, holdsUntil } = await load();
  const held = new Map();
  noteRequest(held, { player: "p1", ticks: 40, from: "mobhp_bp" }, 1000);
  assert.equal(holdsUntil(held, "p1"), 1040);
  noteRequest(held, { player: "p1", ticks: 10, from: "skills_bp" }, 1000);
  assert.equal(holdsUntil(held, "p1"), 1040, "a shorter one doesn't shorten it");
  noteRequest(held, { player: "p1", ticks: 5000, from: "domt_bp" }, 1000);
  assert.equal(holdsUntil(held, "p1"), 1200, "capped at 200 ticks");
  noteRequest(held, { player: "p1", ticks: 100, from: "relics_bp", steady: 40 }, 1000);
  noteRequest(held, { player: "p2", ticks: 30, from: "build_bp", steady: 30 }, 1000);
  assert.equal(holdsUntil(held, "p2"), 0, "a lower rank leaves no hold");
  noteRequest(held, { player: "p3", ticks: 0, from: "x_bp" }, 1000);
  assert.equal(held.has("p3"), false, "a request for 0 ticks holds nothing");
  noteRequest(held, "garbage", 1000);
  noteRequest(held, undefined, 1000);
  assert.equal(held.size, 1);
});

test("a redraw announces itself first, draws when nothing holds the bar and waits otherwise", async () => {
  const { drawWarmth } = await load();
  const log = [];
  const player = { id: "p1", onScreenDisplay: { setActionBar: (/** @type {string} */ text) => log.push(`bar ${text}`) } };
  const send = (/** @type {string} */ id, /** @type {any} */ data) => log.push(`send ${id} ${JSON.stringify(data)}`);
  const held = new Map();
  assert.equal(drawWarmth(player, "§6Warmer", held, 500, send), true);
  assert.deepEqual(log.splice(0), ['send realm:actionbar {"player":"p1","ticks":45,"from":"maps_bp","steady":35}', "bar §6Warmer"], "the request comes before the write");

  held.set("p1", 520);
  assert.equal(drawWarmth(player, "§6Warmer", held, 500, send), false, "a note holds the bar: no write");
  assert.deepEqual(log.splice(0), ['send realm:actionbar {"player":"p1","ticks":45,"from":"maps_bp","steady":35}'], "it still announces, so lower lines keep waiting and it gets the bar back first");
  assert.equal(drawWarmth(player, "§6Warmer", held, 520, send), true, "the hold ended this tick");
  assert.equal(log.at(-1), "bar §6Warmer");
});

test("main.js draws the line through bar.js, listens for requests and forgets players who leave", () => {
  assert.match(mainSrc, /from "\.\/bar\.js"/);
  const at = mainSrc.indexOf('get("warmth") !== true');
  assert.ok(at > 0, "the warmth loop is still there");
  const loop = mainSrc.slice(mainSrc.lastIndexOf("system.runInterval(", at), mainSrc.indexOf("}, 40);", at));
  assert.match(loop, /drawWarmth\(/);
  assert.doesNotMatch(loop, /setActionBar/, "the loop no longer writes the bar itself");
  assert.doesNotMatch(loop, /send\("realm:actionbar"/, "nor sends a note-like request without a rank");
  assert.match(loop, /side\.show\(player, where, text, 45\)/, "the Side HUD box path is unchanged");
  assert.match(mainSrc, /onScriptEvent\(\s*"realm:actionbar"/, "it listens for other packs' requests");
  assert.match(mainSrc, /noteRequest\(barHeld/);
  assert.match(mainSrc, /world\.afterEvents\.playerLeave\.subscribe\(\(\{ playerId \}\) => \{[^}]*barHeld\.delete\(playerId\)/s);
});
