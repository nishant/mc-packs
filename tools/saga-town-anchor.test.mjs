import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const places = read("packs/saga_bp/scripts/places.js");
const KNEE = 300;
const slice = places.slice(places.indexOf("/** World spawn x/z. */"), places.indexOf("/** Place names an objective uses"));

function fixture(saved = {}, spawn = { x: 100, y: 64, z: -40 }) {
  const api = runInNewContext(`${slice.replaceAll("export ", "")}\n({ locate, townXZ })`, {
    world: { getDefaultSpawnLocation: () => spawn },
    placesOf: () => saved,
    placeLabel: (n) => n,
    farOffset: (o) => o,
    OVERWORLD: "minecraft:overworld",
    KNEE,
  });
  return api;
}

const SQUARE = { offset: { x: 17, z: -3 }, mark: "Town square" };
const FARM = { offset: { x: 260, z: -310 }, mark: "Far farm" };

test("with no town set, near-spawn offsets stay counted from world spawn", () => {
  const f = fixture();
  assert.deepEqual({ ...f.townXZ() }, { x: 100, z: -40 });
  const at = f.locate(SQUARE);
  assert.deepEqual([at.dim, at.x, at.z], ["minecraft:overworld", 117, -43]);
});

test("an operator's town moves every near-spawn offset, but not the far ones", () => {
  const f = fixture({ town: { dim: "minecraft:overworld", x: 5000, y: 70, z: -2000 } });
  const sq = f.locate(SQUARE);
  assert.deepEqual([sq.x, sq.z], [5017, -2003]);
  const far = f.locate(FARM);
  assert.deepEqual([far.x, far.z], [100 + 260, -40 - 310], "a spot past 300 blocks keeps its world-spawn anchor");
  const lamb = f.locate({ offset: { x: -170, z: 130 } });
  assert.deepEqual([lamb.x, lamb.z], [4830, -1870]);
});

test("a town set outside the overworld is ignored, absolute places and explicit coordinates never move", () => {
  const f = fixture({ town: { dim: "minecraft:nether", x: 5, y: 70, z: 5 }, lighthouse: { dim: "minecraft:overworld", x: 900, y: 70, z: 900 } });
  assert.deepEqual({ ...f.townXZ() }, { x: 100, z: -40 });
  assert.deepEqual([f.locate({ place: "lighthouse" }).x, f.locate({ place: "lighthouse" }).z], [900, 900]);
  const t = fixture({ town: { dim: "minecraft:overworld", x: 5000, z: 5000 } });
  assert.deepEqual([t.locate({ at: { x: 7, z: 8 } }).x, t.locate({ at: { x: 7, z: 8 } }).z], [7, 8]);
});

test("town is a registered place operators can set, and every near-spawn story spot is covered", async () => {
  const stories = await import(pathToFileURL(new URL("packs/saga_bp/scripts/stories.js", root).pathname.replace(/^\/(\w:)/, "$1")).href);
  assert.ok("town" in stories.PLACES);
  const near = new Set();
  const seen = new Set();
  const walk = (v, story) => {
    if (!v || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    for (const [k, x] of Object.entries(v)) {
      if (k === "offset" && x && typeof x.x === "number" && Math.hypot(x.x, x.z) <= KNEE) near.add(story);
      walk(x, story);
    }
  };
  for (const s of stories.STORIES) walk(s, s.id);
  assert.deepEqual([...near].sort(), ["act2_choir", "fest_judge", "fest_speech", "heart_bram", "lost_lambs", "mayors_burden", "singing_forge"]);
});

test("hints of town-anchored spots no longer send players to world spawn", () => {
  for (const file of ["side_bold", "side_bright", "side_heart"]) {
    const text = read(`packs/saga_bp/scripts/stories/${file}.js`);
    assert.doesNotMatch(text, /town square near (world )?spawn|forge near spawn|forge is about 50 blocks from spawn|(of|off) world spawn\)?[;.]? ?(\(the tracker|Tie|Once)|just off world spawn/);
  }
});
