// MCP-305: stone and basalt generators refill one spot, so a filler block there gives Mining XP once per 5 minutes.
import assert from "node:assert/strict";
import test from "node:test";
import { createSim } from "./lib/pack-sim.mjs";

const OW = "minecraft:overworld";

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
  const xp = () => scores.get(`skill_mining:${p.id}`) ?? 0;
  const mine = (id, x, y, z) => {
    const location = { x, y, z };
    const block = { typeId: id, location, x, y, z, dimension: { id: OW, spawnItem() {}, getBlock: () => undefined } };
    sim.game.emit("world.after.playerBreakBlock", { player: p, block, brokenBlockPermutation: { type: { id } }, itemStackBeforeBreak: undefined });
  };
  return { xp, mine };
}

test("skills: filler stone at the same spot twice gives XP once, another spot gives XP, an ore always does", async () => {
  const { xp, mine } = await skills();
  mine("minecraft:stone", 1, 60, 1);
  const first = xp();
  assert.ok(first > 0, "first break earns XP");
  mine("minecraft:stone", 1, 60, 1);
  assert.equal(xp(), first, "same spot again earns nothing");
  mine("minecraft:stone", 2, 60, 1);
  assert.ok(xp() > first, "a different spot earns XP");
  const before = xp();
  mine("minecraft:coal_ore", 1, 60, 1);
  const a = xp();
  assert.ok(a > before, "ore at that spot earns XP");
  mine("minecraft:coal_ore", 1, 60, 1);
  assert.ok(xp() > a, "ore again earns XP");
});
