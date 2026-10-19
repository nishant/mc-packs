import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { STORIES } from "../packs/saga_bp/scripts/stories/act1_signs.js";

const story = STORIES.find((entry) => entry.id === "act1_signs");
const fallen = story.chapters.find((chapter) => chapter.id === "fallen");
const collectIndex = fallen.objectives.findIndex((objective) => objective.type === "collect");
const collect = fallen.objectives[collectIndex];
const objectivesSource = readFileSync(new URL("../packs/saga_bp/scripts/objectives.js", import.meta.url), "utf8");
const dataSource = readFileSync(new URL("../packs/saga_bp/scripts/data.js", import.meta.url), "utf8");

function productionFunction(source, name) {
  const match = source.match(new RegExp(`^(?:export )?function ${name}\\([\\s\\S]*?^\\}`, "m"));
  assert.ok(match, `load the production ${name} implementation`);
  return match[0].replace(/^export /, "");
}

function fixture(saved) {
  const st = saved ?? { dn: ["smudge"], a: 1, cur: "fallen", o: [], f: {}, ch: {} };
  const saga = { s: { act1_signs: st } };
  const entry = { story, chapter: fallen, st };
  const inventory = [];
  const player = {
    id: "late-player",
    dimension: { id: "minecraft:overworld" },
    location: { x: 900, y: 64, z: 900 },
    isSleeping: false,
    getComponent: () => ({ container: { size: 36, getItem: (slot) => inventory[slot] } }),
    sendMessage() {},
    playSound() {},
  };
  let finishes = 0;
  const context = {
    console,
    system: { currentTick: 0 },
    invChanged: new Set([player.id]),
    collectedAt: new Map(),
    collectSeen: new Map(),
    COLLECT_RECOUNT: 200,
    dreams: new Map(),
    busy: new Set(),
    progressed: new Set(),
    sagaOf: () => saga,
    counting: () => true,
    helps: () => true,
    active: (e, i) => i === collectIndex && (e.st.o[i] ?? 0) < collect.count,
    questGuides() {},
    markDirty() {},
    finishObj() { finishes++; },
    chapterDone: () => false,
    currentStep: () => collectIndex,
    objKey: (e, i) => `${e.story.id}:${e.chapter.id}:${i}`,
    share() {},
    nameKey: () => { throw new Error("this chapter does not ask for a named item"); },
  };
  const functions = [
    productionFunction(dataSource, "target"),
    "const reached = (e, i) => (e.st.o[i] ?? 0) >= target(e.chapter.objectives[i]);",
    productionFunction(objectivesSource, "same"),
    productionFunction(objectivesSource, "countItem"),
    productionFunction(objectivesSource, "bump"),
    productionFunction(objectivesSource, "tickPlayer"),
  ].join("\n");
  const engine = vm.runInNewContext(`${functions}\n;({ tickPlayer, countItem });`, context);
  function shards(...amounts) {
    inventory.length = 0;
    for (const amount of amounts) inventory.push({ typeId: "minecraft:amethyst_shard", amount });
    context.invChanged.add(player.id);
  }
  function tick() {
    context.system.currentTick += 20;
    engine.tickPlayer(player, [entry]);
  }
  return { st, inventory, shards, tick, count: () => engine.countItem(player, collect.item, collect.name), finishes: () => finishes };
}

test("Fallen Light explains another geode or a party mate when the crater is depleted", () => {
  assert.match(fallen.hint, /\bgeodes?\b/i, "the real hint must name a renewable outside route");
  assert.match(fallen.hint, /party mate|friend/i, "the real hint must explain handed-over shards");
  assert.match(fallen.hint, /any source|anywhere|count|already have/i, "the real hint must say those shards count");
});

test("Fallen Light keeps the published objective identity and source-independent item requirement", () => {
  assert.equal(collectIndex, 1, "saved progress indexes cannot move");
  assert.equal(collect.item, "minecraft:amethyst_shard");
  assert.equal(collect.count, 8);
  assert.equal(collect.place, undefined);
  assert.equal(collect.name, undefined);
  assert.equal(collect.type, "collect", "mining the finite crater is not required");
});

test("existing inventory and shards brought from elsewhere already count before the guidance fix", () => {
  const f = fixture();
  f.shards(8);
  assert.equal(f.count(), 8);
  f.tick();
  assert.equal(f.st.o[collectIndex], 8);
  assert.equal(f.finishes(), 1);
  assert.equal(f.inventory[0].amount, 8, "collect does not consume the shards");
});

test("a later solo player can combine partial inventory with handed-over shards", () => {
  const f = fixture();
  f.shards(3);
  f.tick();
  assert.equal(f.st.o[collectIndex], 3);
  assert.equal(f.finishes(), 0);
  f.shards(3, 5);
  f.tick();
  assert.equal(f.st.o[collectIndex], 8);
  assert.equal(f.finishes(), 1);
});

test("partial serialized progress resumes and completed collection never recredits", () => {
  const first = fixture();
  first.shards(3);
  first.tick();
  const resumed = fixture(JSON.parse(JSON.stringify(first.st)));
  resumed.shards(3);
  resumed.tick();
  assert.equal(resumed.st.o[collectIndex], 3);
  resumed.shards(3, 5);
  resumed.tick();
  assert.equal(resumed.st.o[collectIndex], 8);
  resumed.shards();
  resumed.tick();
  resumed.shards(64);
  resumed.tick();
  assert.equal(resumed.st.o[collectIndex], 8);
  assert.equal(resumed.finishes(), 1, "completed collection cannot issue another objective completion");
});
