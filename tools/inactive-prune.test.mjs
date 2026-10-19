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
