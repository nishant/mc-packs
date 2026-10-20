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
