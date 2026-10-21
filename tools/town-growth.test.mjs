// Town Projects' growth (packs/town_bp/scripts/growth.js, F38): the town's story (a bounded log of [Realm day, text]),
// the projects' why lines and what the next level brings, and main.js's wiring of them (the story is written when a
// town is founded, a project finished and a level reached; the day comes from realm:calendar).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { LOG_MAX, LOG_TEXT, addLog, cleanText, logLine, nextLevelText, readLog, townJson } from "../packs/town_bp/scripts/growth.js";
import { CONFIG } from "../packs/town_bp/scripts/config.js";

const main = fs.readFileSync(path.join(import.meta.dirname, "..", "packs", "town_bp", "scripts", "main.js"), "utf8");

test("the log keeps the newest 12 entries of at most 60 plain ASCII characters, dated with the Realm day when known", () => {
  let log;
  for (let i = 1; i <= 20; i++) log = addLog(log, i, `Entry ${i}`);
  assert.equal(log.length, LOG_MAX);
  assert.deepEqual(log[0], [9, "Entry 9"]);
  assert.deepEqual(log.at(-1), [20, "Entry 20"]);
  const long = addLog([], 3, `§6The ${"x".repeat(100)} … was finished`);
  assert.equal(long[0][1].length, LOG_TEXT);
  assert.ok(/^[\x20-\x7e]+$/.test(long[0][1]), "ASCII only, no color codes");
  assert.deepEqual(addLog(undefined, undefined, "Founded by Ann"), [[0, "Founded by Ann"]], "no calendar: no day");
  assert.equal(logLine([12, "The Well was finished"]), "Day 12: The Well was finished");
  assert.equal(logLine([0, "Founded by Ann"]), "Founded by Ann");
  assert.deepEqual(addLog([[1, "a"]], 2, "  "), [[1, "a"]], "an empty line adds nothing");
});

test("a saved log is cleaned on read: bad entries dropped, at most 12; towns from before have none", () => {
  assert.equal(readLog(undefined), undefined);
  assert.equal(readLog("nope"), undefined);
  assert.equal(readLog([]), undefined);
  assert.deepEqual(readLog([[3, "ok"], "bad", [null, "no day"], [-1, "neg"], [2.7, "§cred"], [1, ""]]), [[3, "ok"], [0, "no day"], [0, "neg"], [2, "red"]]);
  const many = Array.from({ length: 30 }, (_, i) => [i + 1, `e${i}`]);
  assert.equal(readLog(many).length, LOG_MAX);
  assert.equal(cleanText(42), "42");
});

test("what the next level brings: its projects and the new houses; nothing at the top", () => {
  assert.equal(nextLevelText({ lvl: 1, max: 5, name: "Village", projects: ["Lamp Posts", "Garden Plot"], housesNow: 0, housesNext: 4 }), "Next, as a Village (level 2): new projects (Lamp Posts, Garden Plot) and 4 new houses for families.");
  assert.equal(nextLevelText({ lvl: 4, max: 5, name: "Capital", projects: [], housesNow: 8, housesNext: 10 }), "Next, as a Capital (level 5): 2 new houses for families.");
  assert.equal(nextLevelText({ lvl: 3, max: 5, name: "City", projects: ["Bell Tower"], housesNow: 6, housesNext: 6 }), "Next, as a City (level 4): new projects (Bell Tower).");
  assert.equal(nextLevelText({ lvl: 5, max: 5, name: "x", projects: [], housesNow: 10, housesNext: 10 }), undefined);
});

test("the town record stays under the property limit: the oldest story entries go first", () => {
  const t = { id: "a", n: "A", spots: { big: { lv: "x".repeat(400) } }, log: Array.from({ length: 12 }, (_, i) => [i, "y".repeat(60)]) };
  const json = townJson(t, 600);
  assert.ok(json.length <= 600, `${json.length}`);
  assert.ok(t.log.length < 12 && t.log.length > 0);
  assert.equal(townJson({ id: "b" }, 10).length > 0, true, "nothing to drop: saved as is");
});

test("every project says why the town wants it, in at most 60 plain characters", () => {
  for (const p of CONFIG.projects) {
    assert.equal(typeof p.why, "string", p.id);
    assert.ok(p.why.length > 0 && p.why.length <= LOG_TEXT && /^[\x20-\x7e]+$/.test(p.why), `${p.id}: ${p.why}`);
  }
});

test("main.js writes the story and shows it on the mayor's page", () => {
  assert.match(main, /from "\.\/growth\.js"/);
  const body = (name) => {
    const i = main.indexOf(`function ${name}(`);
    assert.ok(i >= 0, name);
    return main.slice(i, main.indexOf("\n}\n", i));
  };
  assert.match(body("addTown"), /storyAdd\(t, `Founded by/);
  assert.match(body("finishProject"), /storyAdd\(t, `The \$\{p\.name\} was finished/);
  assert.match(body("levelUp"), /storyAdd\(t, `It became a/);
  assert.match(body("saveTown"), /townJson\(t, PROP_LIMIT\)/);
  assert.match(body("townMenu"), /storyLines\(t\)/);
  assert.match(body("townMenu"), /nextLines\(t\)/);
  assert.match(body("projectLine"), /p\.why/);
  assert.match(main, /"realm:calendar"\]/, "listens for the Realm day");
  assert.match(main, /send\("realm:calendar_ping"/, "asks for it at load");
  assert.match(body("readSites"), /readLog\(t\.log\)/, "a saved log is cleaned on read");
});

// --- Houses (F40): town works house_1 .. house_N from level 2 ---

import { HOUSE_MAX, PEN_ID, houseCount, isWorkId, makePen, makeWorks } from "../packs/town_bp/scripts/growth.js";
import { BUILDS, designFootprint } from "../packs/town_bp/scripts/designs.js";

test("houses per level: none at level 1, then the level's families, capped by residentCapTown and 10", () => {
  const per = CONFIG.residentsPerLevel;
  assert.deepEqual(per, [2, 4, 6, 8, 10]);
  assert.deepEqual([1, 2, 3, 4, 5].map((l) => houseCount(l, per, CONFIG.residentCapTown)), [0, 4, 6, 8, 10]);
  assert.deepEqual([2, 3, 5].map((l) => houseCount(l, per, 5)), [4, 5, 5], "the town cap");
  assert.equal(houseCount(5, [2, 4, 6, 8, 99], 40), HOUSE_MAX, "never more than 10");
  assert.equal(houseCount(6, per, 10), 10, "past the list: its last entry");
  assert.equal(houseCount(3, "bad", 10), 0);
  assert.equal(houseCount(3, per, "bad"), 6, "a bad cap: 10");
  assert.equal(houseCount(2, [2, -3], 10), 0);
});

test("the works: house_1 .. house_10, each a house with the next job site in turn, ids no config project may take", () => {
  const works = makeWorks(CONFIG.houseJobs);
  assert.deepEqual(works.map((w) => w.id), Array.from({ length: 10 }, (_, i) => `house_${i + 1}`));
  assert.deepEqual(works.map((w) => w.job), CONFIG.houseJobs);
  assert.ok(works.every((w) => w.build === "house" && w.work === 1 && Object.keys(w.needs).length === 0 && w.level === 2));
  assert.equal(makeWorks(["minecraft:loom"])[3].job, "minecraft:loom");
  assert.equal(makeWorks([])[0].job, "minecraft:composter");
  assert.ok(isWorkId("house_1") && isWorkId("house_10") && !isWorkId("house_11") && !isWorkId("house_0") && !isWorkId("well"));
  for (const p of CONFIG.projects) assert.ok(!isWorkId(p.id), `${p.id} is not a house id`);
});

test("a town with every spot (7 projects, 10 houses, a pen to come), full plans, lists and story stays under 30,000 characters", () => {
  const spot = (kind) => {
    const fp = designFootprint(kind, { x: -12345, y: 100, z: -12345, f: 0 });
    const n = (fp.max.x - fp.min.x + 5) * (fp.max.z - fp.min.z + 5); // the footprint plus a 2-block apron, one char a column
    return { x: -12345, y: 100, z: -12345, f: 3, snap: 1, b: [-123456, -64, -123456, -123456, 320, -123456], a: 1, lv: "6".repeat(n), lt: "coarse_dirt", bs: 1 };
  };
  const ids = [...CONFIG.projects.map((p) => p.id), ...makeWorks(CONFIG.houseJobs).map((w) => w.id), "pen"];
  const spots = Object.fromEntries(ids.map((id) => [id, spot(byBuild(id))]));
  function byBuild(id) {
    const p = CONFIG.projects.find((x) => x.id === id);
    return p ? p.build : id === "pen" ? "garden" : "house";
  }
  assert.ok(BUILDS.includes("house"));
  const t = { id: "x".repeat(24), n: "y".repeat(24), dim: "minecraft:overworld", x: -12345, y: 100, z: -12345, lvl: 5, spots, by: "z".repeat(16), at: Date.now(), prot: 0, v: 2, m: `mayor:${"x".repeat(24)}`, mn: "m".repeat(24), plf: 1, scan: ids, nos: ids, rt: ids, as: 1, log: Array.from({ length: 12 }, () => [99999, "w".repeat(60)]) };
  const json = townJson(t, 30000);
  assert.equal(t.log.length, 12, "nothing had to be dropped");
  assert.ok(json.length < 30000, `${json.length} characters`);
  assert.ok(json.length < 12000, `well under it (${json.length})`);
});

test("main.js builds houses as town works: due from level 2, scanned and built like projects, no rewards", () => {
  const body = (name) => {
    const i = main.indexOf(`function ${name}(`);
    assert.ok(i >= 0, name);
    return main.slice(i, main.indexOf("\n}\n", i));
  };
  assert.match(main, /const WORKS = .*makeWorks\(CONFIG\.houseJobs\)/);
  assert.match(main, /const ALL = \[\.\.\.PROJECTS, \.\.\.WORKS, PEN\]/);
  assert.match(main, /const byId = new Map\(ALL\.map/);
  assert.match(main, /const projectsAt = \(lvl\) => PROJECTS\.filter/, "leveling stays on the projects");
  assert.match(body("levelUp"), /queueWorks\(t\)/);
  assert.match(body("autoTick"), /queueWorks\(t\)/, "towns already past level 2 get their houses");
  assert.match(body("queueWorks"), /pr\.done = 1/);
  assert.match(body("queueWorks"), /queueScan\(t, due\)/);
  assert.match(body("deleteTown"), /for \(const p of ALL\)/);
  assert.match(body("build"), /isHouse\(p\) && get\("houses"\) !== true/);
  assert.match(body("announceBuilt"), /isWork\(p\)/);
  assert.doesNotMatch(body("finishProject"), /WORKS|ALL/, "rewards stay on projects");
  assert.match(main, /for \(const p of ALL\) \{\n\s+const s = t\.spots\[p\.id\];/, "the build check covers houses");
});

test("the garden pen is a town work with its own reserved id", () => {
  const pen = makePen();
  assert.deepEqual([pen.id, pen.build, pen.work, Object.keys(pen.needs).length], [PEN_ID, "pen", 1, 0]);
  assert.ok(!isWorkId(PEN_ID), "not a house");
  assert.ok(!CONFIG.projects.some((p) => p.id === PEN_ID));
  assert.match(main, /p\.id !== PEN_ID && p\.level >= 1/, "a config project named pen is skipped");
  assert.match(main, /const isWork = \(p\) => isWorkId\(p\.id\) \|\| p\.id === PEN_ID;/);
});
