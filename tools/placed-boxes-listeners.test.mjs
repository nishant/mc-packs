// Skills, Guilds and Daily Quests honor realm:blocks_placed boxes (MCP-107): a block inside a box a book built earns
// nothing, as if a player had placed it by hand. Skills is driven end to end; Guilds and Quests are checked for the
// saved property and the box limits (pack-sim loads them, their reward paths need much more of the game).
import assert from "node:assert/strict";
import test from "node:test";
import { createSim } from "./lib/pack-sim.mjs";

const OW = "minecraft:overworld";
const send = (sim, box, extra = {}) => sim.game.deliver("realm:blocks_placed", JSON.stringify({ dim: OW, box, from: "build_bp", ...extra }));

async function skills() {
  const sim = createSim();
  const scores = new Map();
  const scoreboard = {
    getObjective: (id) => ({ id, getScore: (pl) => scores.get(`${id}:${pl.id}`), setScore: (pl, v) => scores.set(`${id}:${pl.id}`, v), addScore: (pl, v) => scores.set(`${id}:${pl.id}`, (scores.get(`${id}:${pl.id}`) ?? 0) + v) }),
    addObjective(id) {
      return this.getObjective(id);
    },
  };
  await sim.load("skills_bp");
  sim.server.world.scoreboard = scoreboard;
  sim.boot();
  const p = sim.join("Ann", { id: "id-Ann" });
  p.getGameMode = () => "Survival";
  p.getEffect = () => undefined;
  p.addEffect = () => {};
  const xp = () => scores.get(`skill_woodcutting:${p.id}`) ?? 0;
  const chop = (x, y, z) => {
    const location = { x, y, z };
    const block = { typeId: "minecraft:oak_log", location, x, y, z, dimension: { id: OW, spawnItem() {}, getBlock: () => undefined } };
    sim.game.emit("world.after.playerBreakBlock", { player: p, block, brokenBlockPermutation: { type: { id: "minecraft:oak_log" } }, itemStackBeforeBreak: undefined });
  };
  return { sim, p, xp, chop };
}

test("skills: a log inside a built box earns no XP, one outside does, and the box is saved after 600 ticks", async () => {
  const { sim, xp, chop } = await skills();
  send(sim, [10, 60, 10, 20, 70, 20]);
  chop(15, 65, 15);
  assert.equal(xp(), 0, "log inside the box");
  chop(40, 65, 40);
  assert.ok(xp() > 0, "log outside the box still gives XP");
  assert.equal(sim.props.get("skills:pbox"), undefined, "not saved yet");
  sim.step(600);
  assert.equal(sim.props.get("skills:pbox"), `${OW}|10,60,10,20,70,20`);
});

test("skills: corners are normalized, a side of 64 is kept and a side of 65 is ignored", async () => {
  const { sim, xp, chop } = await skills();
  send(sim, [20, 70, 20, 10, 60, 10]);
  chop(10, 60, 10);
  assert.equal(xp(), 0, "reversed corners work");
  send(sim, [100, 0, 100, 164, 5, 100]); // 65 wide
  chop(130, 2, 100);
  assert.ok(xp() > 0, "65-wide box ignored");
  send(sim, [200, 0, 200, 263, 5, 200], { dim: "overworld" }); // 64 wide, short dim name
  const xpAfter = xp();
  chop(230, 2, 200);
  assert.equal(xp(), xpAfter, "64-wide box accepted");
  sim.step(600);
  assert.equal(sim.props.get("skills:pbox"), `${OW}|10,60,10,20,70,20;${OW}|200,0,200,263,5,200`);
});

test("skills: x1..z2 fields work, bad messages are ignored, and another dimension is not covered", async () => {
  const { sim, xp, chop } = await skills();
  sim.game.deliver("realm:blocks_placed", JSON.stringify({ dim: OW, x1: 0, y1: 0, z1: 0, x2: 4, y2: 4, z2: 4 }));
  chop(2, 2, 2);
  assert.equal(xp(), 0);
  sim.game.deliver("realm:blocks_placed", "not json");
  sim.game.deliver("realm:blocks_placed", JSON.stringify({ dim: OW, box: [0, 0, 0, "x", 1, 1] }));
  sim.game.deliver("realm:blocks_placed", JSON.stringify({ box: [50, 0, 50, 51, 1, 51] }));
  sim.step(600);
  assert.equal(sim.props.get("skills:pbox"), `${OW}|0,0,0,4,4,4`);
});

test("skills: only the newest 500 boxes are kept", async () => {
  const { sim, xp, chop } = await skills();
  for (let i = 0; i < 502; i++) send(sim, [i * 10, 0, 0, i * 10, 0, 0]);
  sim.step(600);
  assert.equal(String(sim.props.get("skills:pbox")).split(";").length, 500);
  chop(0, 0, 0);
  assert.ok(xp() > 0, "the oldest box was dropped");
});

for (const [pack, prop] of [["guilds_bp", "guilds:pbox"], ["quests_bp", "quests:pbox"]]) {
  test(`${pack}: saves realm:blocks_placed boxes in ${prop} and ignores a side of 65`, async () => {
    const sim = createSim();
    await sim.load(pack);
    sim.boot();
    send(sim, [5, 1, 5, 9, 3, 9]);
    send(sim, [0, 0, 0, 63, 0, 0]);
    send(sim, [0, 0, 0, 0, 0, 3000]);
    sim.step(600);
    assert.equal(sim.props.get(prop), `${OW}|5,1,5,9,3,9;${OW}|0,0,0,63,0,0`);
  });
}

test("guilds: a box covers ores but not a crop with a growth state", async () => {
  const sim = createSim();
  await sim.load("guilds_bp");
  sim.boot();
  const p = sim.join("Ann", { id: "id-Ann" });
  p.getGameMode = () => "Survival";
  send(sim, [0, 60, 0, 10, 70, 10]);
  const dim = { id: OW, spawnItem() {}, getBlock: () => undefined };
  const brk = (typeId, x, y, z, perm) => {
    const location = { x, y, z };
    sim.game.emit("world.after.playerBreakBlock", { player: p, block: { typeId, location, x, y, z, dimension: dim }, brokenBlockPermutation: perm, itemStackBeforeBreak: undefined });
  };
  const prog = () => {
    sim.step(600);
    const raw = p.getDynamicProperty("guilds:prog");
    return raw ? JSON.parse(raw) : { o: 0, c: 0 };
  };
  brk("minecraft:iron_ore", 5, 65, 5, { type: { id: "minecraft:iron_ore" } });
  assert.equal(prog().o, 0, "an ore inside the box earns nothing");
  brk("minecraft:iron_ore", 50, 65, 50, { type: { id: "minecraft:iron_ore" } });
  assert.equal(prog().o, 1, "an ore outside the box does");
  brk("minecraft:wheat", 6, 65, 6, { type: { id: "minecraft:wheat" }, getState: () => 7 });
  assert.equal(prog().c, 1, "ripe wheat inside the box still counts");
});
