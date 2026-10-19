// W7 O38/O40 follow-up: the real story data must pass the O38 content rules with no allowlist at all,
// except the four O64 rewards the owner has not decided. These tests read the shipped story files
// through check-stories' exported validator, so a new partial color family or an interact step that
// players can no longer finish fails here, not in a fixture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");
const scripts = join(root, "packs", "saga_bp", "scripts");
const { STORIES, NPC_NAMES } = await import(pathToFileURL(join(scripts, "stories.js")).href);
const { FAVORS, WANDERERS, WANDER_TEMPLATES } = await import(pathToFileURL(join(scripts, "stories", "index.js")).href);
const mod = await import("./check-stories.mjs");
const live = await mod.liveContentFindings(root, { STORIES, FAVORS, WANDERERS, WANDER_TEMPLATES, NPC_NAMES });

/** Rewards the owner has not decided (O64): the checker warns, the amounts stay. */
const OWNER_PENDING = [
  "reward-scale act5_lantern/dawn_relight",
  "reward-scale act5_lantern/herald",
  "reward-scale act5_lantern/choice",
  "reward-scale listening_deep/last_listen",
];

/** @param {string} at "story/chapter objective N" */
function objectiveAt(at) {
  const m = /^(\S+)\/(\S+) objective (\d+)$/.exec(at);
  assert.ok(m, at);
  const story = STORIES.find((/** @type {any} */ s) => s.id === m[1]);
  assert.ok(story, `story ${m[1]}`);
  const chapter = story.chapters.find((/** @type {any} */ c) => c.id === m[2]);
  assert.ok(chapter, `chapter ${m[1]}/${m[2]}`);
  const objective = chapter.objectives[Number(m[3]) - 1];
  assert.ok(objective, at);
  return { story, chapter, objective };
}

test("live story data has no O38 finding except the four owner-pending rewards", () => {
  const seen = live.findings.map((/** @type {any} */ f) => `${f.code} ${f.at}`).sort();
  assert.deepEqual(seen, [...OWNER_PENDING].sort(), live.findings.map((/** @type {any} */ f) => `${f.code} ${f.at}: ${f.message}`).join("\n"));
});

test("the allowlist keeps only the four owner-pending rewards, and each still fires", () => {
  const raw = JSON.parse(readFileSync(join(root, "tools", "check-stories.allow.json"), "utf8"));
  const rows = (raw.entries ?? []).map((/** @type {any} */ e) => `${e.code} ${e.at}`).sort();
  assert.deepEqual(rows, [...OWNER_PENDING].sort());
  for (const entry of raw.entries) {
    assert.match(entry.reason, /OWNER-PENDING O64/, entry.at);
    assert.ok(live.findings.some((/** @type {any} */ f) => f.code === entry.code && f.at === entry.at), `${entry.at} no longer fires: remove it`);
  }
});

test("owner-pending rewards keep their shipped amounts", () => {
  const reward = (/** @type {string} */ story, /** @type {string} */ id) => STORIES.find((/** @type {any} */ s) => s.id === story).chapters.find((/** @type {any} */ c) => c.id === id).reward;
  const dawn = reward("act5_lantern", "dawn_relight");
  assert.equal(dawn.levels, 10);
  assert.equal(dawn.crowns, 400);
  const herald = reward("act5_lantern", "herald");
  assert.equal(herald.levels, 10);
  assert.equal(herald.crowns, 200);
  const choice = reward("act5_lantern", "choice");
  assert.equal(choice.levels, 8);
  assert.equal(choice.crowns, 150);
  const listen = reward("listening_deep", "last_listen");
  assert.equal(listen.levels, 10);
  assert.equal(listen.crowns, 200);
});

// The finite-interact chapters: a player may have mined out the prefab block, so the chapter hint says
// what to place and how close (the objective's own radius), and the engine takes any such block there.
const SIGNPOSTS = [
  { at: "drowned_bell/sunken objective 2", noun: "bell", block: "minecraft:bell" },
  { at: "act1_signs/keeper objective 1", noun: "candle", block: "minecraft:candle" },
  { at: "act2_choir/double objective 3", noun: "barrel", block: "minecraft:barrel" },
  { at: "act2_choir/hollis_night objective 2", noun: "bell", block: "minecraft:bell" },
  { at: "act2_choir/ring_burns objective 5", noun: "bell", block: "minecraft:bell" },
  { at: "act4_seals/tide_echo objective 2", noun: "sea lantern", block: "minecraft:sea_lantern" },
  { at: "act5_lantern/smugglers objective 1", noun: "barrel", block: "minecraft:barrel" },
  { at: "act5_lantern/choice objective 2", noun: "end rod", block: "minecraft:end_rod" },
  { at: "vesna_bargain/fen_mother objective 1", noun: "cauldron", block: "minecraft:cauldron" },
  { at: "vesna_bargain/break_heart objective 1", noun: "cauldron", block: "minecraft:cauldron" },
  { at: "heart_hollis/vigil objective 1", noun: "candle", block: "minecraft:candle" },
  { at: "w_pell_road/chapel objective 3", noun: "candle", block: "minecraft:candle" },
  { at: "w_anwen_survey/rest objective 1", noun: "lodestone", block: "minecraft:lodestone" },
];

for (const { at, noun, block } of SIGNPOSTS) {
  test(`${at} tells a player who finds the ${noun} gone what to place and how close`, () => {
    const { chapter, objective } = objectiveAt(at);
    assert.equal(objective.type, "interact");
    assert.ok(objective.blocks.includes(block), `${at} accepts ${block}`);
    const hint = String(chapter.hint);
    assert.match(hint, new RegExp(`place (?:a |an |one |new )?[^.;]{0,30}${noun}`, "i"), `hint names the ${noun} to place`);
    assert.match(hint, /\b(?:gone|mined out|missing|none (?:is|are) left)\b/i, "hint says when to place it");
    assert.match(hint, new RegExp(`within ${objective.radius} blocks`), `hint gives the objective's radius ${objective.radius}`);
    assert.equal(/[^\x20-\x7e\n]/.test(hint), false, "hint is plain ASCII");
  });
}

// Partial families: every list keeps its accepted ids and gains the ids this Minecraft version added.
const FAMILY_LISTS = [
  { at: "act5_lantern/alone objective 1", kept: ["minecraft:oak_fence", "minecraft:warped_fence", "minecraft:nether_brick_fence", "minecraft:diorite_wall", "minecraft:cobbled_deepslate"], gained: ["minecraft:poplar_fence"] },
  { at: "act5_lantern/forty objective 1", kept: ["minecraft:oak_sapling", "minecraft:pale_oak_sapling", "minecraft:mangrove_propagule"], gained: ["minecraft:bamboo_sapling", "minecraft:poplar_sapling"] },
  { at: "lost_lambs/shed objective 2", kept: ["minecraft:oak_fence", "minecraft:warped_fence"], gained: ["minecraft:poplar_fence"] },
  { at: "hatchlings/fence objective 1", kept: ["minecraft:oak_fence", "minecraft:warped_fence"], gained: ["minecraft:poplar_fence"] },
  { at: "mayors_burden/feud objective 3", kept: ["minecraft:oak_fence", "minecraft:warped_fence"], gained: ["minecraft:poplar_fence"] },
  { at: "edges_of_map/mouth objective 2", kept: ["minecraft:oak_planks", "minecraft:warped_planks"], gained: ["minecraft:poplar_planks"] },
  { at: "w_vesk_home/name objective 1", kept: ["minecraft:oak_sapling", "minecraft:pale_oak_sapling", "minecraft:mangrove_propagule"], gained: ["minecraft:bamboo_sapling", "minecraft:poplar_sapling"] },
];

for (const { at, kept, gained } of FAMILY_LISTS) {
  test(`${at} accepts every vanilla id of its family`, () => {
    const { objective } = objectiveAt(at);
    for (const id of [...kept, ...gained]) assert.ok(objective.blocks.includes(id), `${at} accepts ${id}`);
    assert.equal(new Set(objective.blocks).size, objective.blocks.length, `${at} lists no id twice`);
  });
}

// O40: the Bible's "As shipped" section and writing rules say what the story files actually do.
test("STORY_BIBLE as-shipped facts match the story data", () => {
  const bible = readFileSync(join(root, "docs", "STORY_BIBLE.md"), "utf8");
  /** @type {string[]} */
  const prewitt = [];
  /** @type {any[]} */
  const gristle = [];
  for (const s of STORIES) {
    for (const c of s.chapters) {
      for (const o of c.objectives) {
        if (o.who?.id === "prewitt") prewitt.push(`${s.id}: ${o.who.name}`);
        if (o.set?.heart === "gristle") gristle.push(o);
      }
    }
  }
  assert.deepEqual(prewitt, ["smugglers_run: Inspector Prewitt"]);
  assert.equal(gristle.length, 2, "one Gristle step per missing pack");
  for (const o of gristle) {
    assert.equal(o.place, "watchtower");
    assert.equal(o.champion.mob, "minecraft:spider");
    assert.equal(o.champion.name, "Grandmother Gristle");
  }
  assert.deepEqual(gristle.map((o) => o.when).sort((a, b) => Object.keys(a).length - Object.keys(b).length), [{ "pack:cooking_bp": "off" }, { "pack:cooking_bp": "on", "pack:elite_bp": "off" }]);
  for (const text of ["`NO_KITCHEN`", "Grandmother Gristle", "`heart` = `gristle`", "2 rabbit stews", "Inspector Prewitt", "Dace, Brynn and Orrin", "Barnaby Pike and Rosalind", "Saltwife", "`marigold_supper`", "Tamsin Galeward"]) {
    assert.ok(bible.includes(text), `STORY_BIBLE.md mentions ${text}`);
  }
  assert.match(bible, /^9\. A named character must not reuse a townsfolk's or a wanderer's name/m);
  assert.match(bible, /^10\. A step that names a kind of block/m);
  assert.equal(/Inspector Pell/.test(bible.replace(/not Inspector Pell/, "")), false, "no Inspector Pell outside the correction");
});
