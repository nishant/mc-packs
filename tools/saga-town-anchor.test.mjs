import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { pathToFileURL } from "node:url";

import { STORIES } from "../packs/saga_bp/scripts/stories.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const places = read("packs/saga_bp/scripts/places.js");
const KNEE = 300;
const slice = places.slice(places.indexOf("/** World spawn x/z. */"), places.indexOf("/** Place names an objective uses"));

function fixture(saved = {}, spawn = { x: 100, y: 64, z: -40 }) {
  const api = runInNewContext(`${slice.replaceAll("export ", "")}\n({ locate, townXZ, TOWN_STORIES })`, {
    world: { getDefaultSpawnLocation: () => spawn },
    placesOf: () => saved,
    placeLabel: (n) => n,
    farOffset: (o) => o,
    OVERWORLD: "minecraft:overworld",
    STORIES,
  });
  return api;
}

const objectives = (id) => STORIES.find((s) => s.id === id).chapters.flatMap((c) => c.objectives);
const pip = () => STORIES.find((s) => s.id === "act2_choir").chapters.find((c) => c.id === "pip").objectives;
const TOWN = { town: { dim: "minecraft:overworld", x: 5000, y: 70, z: -2000 } };
const square = () => objectives("mayors_burden").find((o) => o.offset);
const farFarm = () => {
  for (const s of STORIES) for (const o of s.chapters.flatMap((c) => c.objectives)) if (o.offset && !STORIES.find((x) => x.id === "act2_choir" && x === s) && Math.hypot(o.offset.x, o.offset.z) > KNEE && !["mayors_burden", "singing_forge", "heart_bram", "fest_judge", "fest_speech", "lost_lambs"].includes(s.id)) return o;
  throw new Error("no far offset story");
};

test("with no town set, offsets stay counted from world spawn", () => {
  const f = fixture();
  assert.deepEqual({ ...f.townXZ() }, { x: 100, z: -40 });
  const sq = square();
  const at = f.locate(sq);
  assert.deepEqual([at.dim, at.x, at.z], ["minecraft:overworld", 100 + sq.offset.x, -40 + sq.offset.z]);
});

test("an operator's town moves every offset of a town story, the Pip route together, and no other story", () => {
  const f = fixture(TOWN);
  const sq = square();
  const at = f.locate(sq);
  assert.deepEqual([at.x, at.z], [5000 + sq.offset.x, -2000 + sq.offset.z]);
  const far = farFarm();
  const out = f.locate(far);
  assert.deepEqual([out.x, out.z], [100 + far.offset.x, -40 + far.offset.z], "a story outside the town set keeps its world-spawn anchor");
  const follow = pip()[0];
  const escort = pip()[2];
  const a = f.locate(follow.offset ? follow : follow.to ?? follow.from);
  const pts = [];
  const take = (w) => w && w.offset && pts.push(f.locate(w));
  for (const o of [follow, escort]) for (const w of [o, o.from, o.to, o.spawnAt]) take(w);
  assert.ok(pts.length >= 2 && a);
  const d = Math.max(...pts.flatMap((p, i) => pts.slice(i + 1).map((q) => Math.hypot(p.x - q.x, p.z - q.z))));
  assert.ok(d < 400 && d > 300, `the whole Pip route stays together at the town (${Math.round(d)} blocks, not thousands)`);
  for (const p of pts) assert.ok(Math.hypot(p.x - 5000, p.z + 2000) < 700, "every Pip endpoint is near the town");
});

test("a town set outside the overworld is ignored, absolute places and explicit coordinates never move", () => {
  const f = fixture({ town: { dim: "minecraft:nether", x: 5, y: 70, z: 5 }, lighthouse: { dim: "minecraft:overworld", x: 900, y: 70, z: 900 } });
  assert.deepEqual({ ...f.townXZ() }, { x: 100, z: -40 });
  assert.deepEqual([f.locate({ place: "lighthouse" }).x, f.locate({ place: "lighthouse" }).z], [900, 900]);
  const t = fixture({ town: { dim: "minecraft:overworld", x: 5000, z: 5000 } });
  assert.deepEqual([t.locate({ at: { x: 7, z: 8 } }).x, t.locate({ at: { x: 7, z: 8 } }).z], [7, 8]);
});

test("town is a registered place; the 15 near-town steps and 7 town stories are exactly the ones anchored", async () => {
  const stories = await import(pathToFileURL(new URL("packs/saga_bp/scripts/stories.js", root).pathname.replace(/^\/(\w:)/, "$1")).href);
  assert.ok("town" in stories.PLACES);
  const f = fixture();
  assert.deepEqual([...f.TOWN_STORIES].sort(), ["act2_choir", "fest_judge", "fest_speech", "heart_bram", "lost_lambs", "mayors_burden", "singing_forge"]);
  const near = new Set();
  const steps = {};
  const seen = new Set();
  const walk = (v, story) => {
    if (!v || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    for (const [k, x] of Object.entries(v)) {
      if (k === "offset" && x && typeof x.x === "number" && Math.hypot(x.x, x.z) <= KNEE) near.add(story);
      walk(x, story);
    }
  };
  for (const s of stories.STORIES) {
    walk(s, s.id);
    for (const c of s.chapters) for (const [i, o] of c.objectives.entries()) {
      const hasNear = (v) => v && typeof v === "object" && Object.entries(v).some(([k, x]) => (k === "offset" && x && Math.hypot(x.x, x.z) <= KNEE) || hasNear(x));
      if (hasNear(o) && !["act2_choir", "lost_lambs"].includes(s.id)) steps[s.id] = (steps[s.id] ?? 0) + 1;
    }
  }
  assert.deepEqual([...near].sort(), [...f.TOWN_STORIES].sort());
  assert.deepEqual(steps, { mayors_burden: 6, singing_forge: 6, heart_bram: 1, fest_judge: 1, fest_speech: 1 });
});

test("usedBy('town') lists the town stories", () => {
  const src = places;
  assert.match(src, /name === TOWN && TOWN_STORIES\.includes\(s\.id\)/);
});

test("hints of town-anchored spots say town, not spawn", () => {
  assert.doesNotMatch(read("packs/saga_bp/scripts/stories/act2_choir.js"), /Marsh farm east of spawn/);
  assert.doesNotMatch(read("packs/saga_bp/scripts/stories/side_bold.js"), /Both farms are a little over 200 blocks southeast of spawn/);
  for (const file of ["side_bold", "side_bright", "side_heart"]) {
    const text = read(`packs/saga_bp/scripts/stories/${file}.js`);
    assert.doesNotMatch(text, /town square near (world )?spawn|forge near spawn|forge is about 50 blocks from spawn|(of|off) world spawn\)?[;.]? ?(\(the tracker|Tie|Once)|just off world spawn/);
  }
});

