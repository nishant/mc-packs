import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const load = (pack) => import(pathToFileURL(resolve(`packs/${pack}/scripts/prune.js`)).href);
const NOW = 1_800_000_000_000;
const DAY = 86400000;

for (const pack of ["nick_bp", "titles_bp", "party_bp"]) {
  test(`${pack}: a record with no usable time starts counting and is never deleted`, async () => {
    const { verdict } = await load(pack);
    for (const seen of [undefined, null, 0, -5, NaN, Infinity, "yesterday", {}]) assert.notEqual(verdict(seen, NOW, 365), "drop", String(seen));
    assert.equal(verdict(undefined, NOW, 365), "start");
    assert.equal(verdict(0, NOW, 365), "start");
  });
  test(`${pack}: old records go, recent ones stay, 0 days turns it off`, async () => {
    const { verdict } = await load(pack);
    assert.equal(verdict(NOW - 366 * DAY, NOW, 365), "drop");
    assert.equal(verdict(NOW - 364 * DAY, NOW, 365), "keep");
    assert.equal(verdict(NOW + DAY, NOW, 365), "keep");
    assert.equal(verdict(NOW - 9999 * DAY, NOW, 0), "keep");
    assert.equal(verdict(undefined, NOW, 0), "keep");
  });
  test(`${pack}: main.js and config.js use the policy`, () => {
    const main = readFileSync(`packs/${pack}/scripts/main.js`, "utf8");
    assert.match(main, /from "\.\/prune\.js"/);
    assert.match(main, /function\* forgetOld\(\)/);
    assert.match(main, /runJob\(forgetOld\(\)\)/);
  });
}

test("party_bp: a party with no saved times keeps every member and starts the clock", async () => {
  const { planParty } = await load("party_bp");
  const p = { m: [["a", "A", 0]] };
  const r = planParty(p, NOW, () => false, 180);
  assert.deepEqual(r, { changed: true, drop: false });
  assert.equal(p.m[0][2], NOW);
  const q = { m: [["a", "A"]] };
  assert.equal(planParty(q, NOW, () => false, 180).drop, false);
});

test("party_bp: only a solo party idle for the limit is dropped", async () => {
  const { planParty } = await load("party_bp");
  const old = NOW - 200 * DAY;
  assert.equal(planParty({ m: [["a", "A", old]] }, NOW, () => false, 180).drop, true);
  assert.equal(planParty({ m: [["a", "A", old]] }, NOW, () => true, 180).drop, false, "an online member is active");
  assert.equal(planParty({ m: [["a", "A", old], ["b", "B", old]] }, NOW, () => false, 180).drop, false, "two members: never dropped");
  assert.equal(planParty({ m: [["a", "A", NOW - 10 * DAY]] }, NOW, () => false, 180).drop, false);
  assert.equal(planParty({ m: [["a", "A", old]] }, NOW, () => false, 0).drop, false, "disabled");
});

test("party_bp: an online member's time is refreshed at most once a day", async () => {
  const { planParty } = await load("party_bp");
  const fresh = { m: [["a", "A", NOW - 1000]] };
  assert.equal(planParty(fresh, NOW, () => true, 180).changed, false);
  const aged = { m: [["a", "A", NOW - 2 * DAY]] };
  assert.equal(planParty(aged, NOW, () => true, 180).changed, true);
  assert.equal(aged.m[0][2], NOW);
});

test("the three packs declare conservative defaults", () => {
  assert.match(readFileSync("packs/nick_bp/scripts/config.js", "utf8"), /forgetGamertagsAfterDays: 365/);
  assert.match(readFileSync("packs/titles_bp/scripts/config.js", "utf8"), /forgetAfterDays: 365/);
  assert.match(readFileSync("packs/party_bp/scripts/config.js", "utf8"), /forgetSoloAfterDays: 180/);
});

test("nick: the sweep rereads days, online and the saved time for every entry after each pause", async () => {
  const { sweepGamertags } = await load("nick_bp");
  const world = { "seen:a": "A", "seen:b": "B", "seen:c": "C", "time:A": NOW - 400 * DAY, "time:B": NOW - 400 * DAY, "time:C": NOW - 400 * DAY };
  let days = 365;
  const online = new Set();
  const dropped = [];
  const job = sweepGamertags({
    keys: () => ["seen:a", "seen:b", "seen:c"],
    owner: (k) => world[k],
    online: (id) => online.has(id),
    seen: (id) => world[`time:${id}`],
    days: () => days,
    now: () => NOW,
    start: (id, now) => (world[`time:${id}`] = now),
    drop: (k) => dropped.push(k),
    warn: (e) => assert.fail(String(e)),
  });
  job.next(); // a is gone
  world["time:B"] = NOW; // B joined during the pause and was saved
  online.add("C"); // C is online now
  job.next();
  job.next();
  assert.deepEqual(dropped, ["seen:a"]);
  const off = sweepGamertags({ ...{ keys: () => ["seen:a"], owner: (k) => world[k], online: () => false, seen: () => NOW - 999 * DAY, days: () => 0, now: () => NOW, start() {}, drop: (k) => dropped.push(`off:${k}`), warn() {} } });
  off.next();
  assert.deepEqual(dropped, ["seen:a"], "a setting of 0 disables the sweep even mid-run");
  days = 0;
});

test("titles: the sweep rereads online, cache and the saved record per entry; a record with no time starts counting", async () => {
  const { sweepRecords } = await load("titles_bp");
  const rec = (ls) => JSON.stringify({ n: "x", t: ["T"], ls });
  const world = { "p:a": rec(NOW - 400 * DAY), "p:b": rec(NOW - 400 * DAY), "p:c": rec(NOW - 400 * DAY), "p:d": JSON.stringify({ n: "d", t: [] }) };
  const online = new Set();
  const dropped = [];
  const started = [];
  const job = sweepRecords({
    keys: () => ["p:a", "p:b", "p:c", "p:d"],
    raw: (k) => world[k],
    online: (k) => online.has(k),
    days: () => 365,
    now: () => NOW,
    start: (k) => started.push(k),
    drop: (k) => dropped.push(k),
    warn: (e) => assert.fail(String(e)),
  });
  job.next();
  world["p:b"] = rec(NOW); // joined and saved during the pause
  online.add("p:c");
  job.next();
  job.next();
  job.next();
  assert.deepEqual(dropped, ["p:a"]);
  assert.deepEqual(started, ["p:d"]);
});

test("titles: unknown record fields survive, and an unknown last-seen is never written as 0", async () => {
  const { unknownFields, savedForm } = await load("titles_bp");
  assert.deepEqual(unknownFields({ n: "a", future: { x: 1 }, z: 2 }, ["n"]), { future: { x: 1 }, z: 2 });
  assert.deepEqual(unknownFields([1], ["n"]), {});
  assert.equal("ls" in savedForm({ n: "a", ls: 0 }), false);
  assert.equal("ls" in savedForm({ n: "a", ls: NaN }), false);
  assert.equal(savedForm({ n: "a", ls: NOW }).ls, NOW);
  const src = readFileSync("packs/titles_bp/scripts/main.js", "utf8");
  assert.match(src, /\.\.\.unknownFields\(v, /);
  assert.match(src, /savedForm\(/);
});

test("party: extra tuple elements and unknown party fields survive", async () => {
  const { memberOf, unknownFields } = await load("party_bp");
  assert.deepEqual(memberOf(["id", "Ann", NOW, "extra", 7]), ["id", "Ann", NOW, "extra", 7]);
  assert.deepEqual(memberOf(["id"]), ["id", "", 0]);
  assert.deepEqual(unknownFields({ l: "a", m: [], mode: "open" }, ["l", "m"]), { mode: "open" });
  const src = readFileSync("packs/party_bp/scripts/main.js", "utf8");
  assert.match(src, /\.\.\.unknownFields\(any, /);
  assert.match(src, /memberOf\(m\)/);
});

test("the forget jobs read the live settings, which operators can change", () => {
  for (const [pack, key] of [["nick_bp", "forgetGamertagsAfterDays"], ["titles_bp", "forgetAfterDays"], ["party_bp", "forgetSoloAfterDays"]]) {
    const src = readFileSync(`packs/${pack}/scripts/main.js`, "utf8");
    assert.doesNotMatch(src, new RegExp(`CONFIG\\.${key}`), pack);
    assert.match(src, new RegExp(`get\\("${key}"\\)`), pack);
    assert.match(readFileSync(`packs/${pack}/scripts/settings.js`, "utf8"), new RegExp(`key: "${key}"`), pack);
  }
});