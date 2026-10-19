// O38: check-stories must warn on partial color families, reused cast names and wanderer
// ids, ungated pack-only items, unknown champion traits, over-scale rewards, once-built
// prefab gather overlap, and finite interact targets. Fixtures are the proof. The live
// story files are not edited here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const mod = await import("./check-stories.mjs");

const FAMILIES = {
  candle: ["white_candle", "black_candle", "red_candle", "blue_candle"],
  fence: ["oak_fence", "spruce_fence", "birch_fence", "poplar_fence"],
  sapling: ["oak_sapling", "spruce_sapling", "pale_oak_sapling", "poplar_sapling", "bamboo_sapling"],
};
const TRAITS = ["stormcaller", "frostbound", "vampiric", "splitting", "shielded"];
const WANDERERS = [{ id: "pell", name: "Pell the Pilgrim", short: "Pell" }];
const NPCS = { tobin: "Old Tobin", bea: "Bea the Cook" };
const PACK_ITEMS = [
  { name: "Champion's Heart", packs: ["cooking_bp", "elite_bp"] },
  { name: "Harbor Chowder", packs: ["cooking_bp"] },
];
const PREFABS = {
  starfall: { "minecraft:amethyst_cluster": 8, "minecraft:amethyst_block": 2 },
  seal_tide: { "minecraft:sea_lantern": 4, "minecraft:conduit": 1 },
  graveyard: { "minecraft:dirt": 40, "minecraft:grass_block": 12 },
  lighthouse: { "minecraft:spruce_planks": 9 },
};
const DROPS = {
  amethyst_cluster: ["minecraft:amethyst_shard"],
  small_amethyst_bud: ["minecraft:amethyst_shard"],
};

function rules() {
  assert.equal(typeof mod.auditStoryRules, "function", "auditStoryRules must exist so O38 fixtures can fail before the rules do");
  return mod.auditStoryRules;
}

function allow() {
  assert.equal(typeof mod.applyStoryAllowlist, "function", "applyStoryAllowlist must exist so a category cannot be globally suppressed");
  return mod.applyStoryAllowlist;
}

function story(partial) {
  return {
    id: partial.id ?? "demo",
    kind: partial.kind ?? "side",
    giver: partial.giver,
    chapters: partial.chapters,
  };
}

function chapter(partial) {
  return {
    id: partial.id ?? "ch",
    title: partial.title ?? "Chapter",
    hint: partial.hint ?? "Do the step.",
    intro: partial.intro ?? ["Intro."],
    outro: ["Outro."],
    objectives: partial.objectives,
    reward: partial.reward ?? { levels: 3, crowns: 30 },
  };
}

function audit(partial, extra = {}) {
  const fn = rules();
  return fn({
    stories: partial.stories ?? [story(partial)],
    wanderers: WANDERERS,
    npcs: NPCS,
    traits: TRAITS,
    packItems: PACK_ITEMS,
    families: FAMILIES,
    prefabs: PREFABS,
    drops: DROPS,
    templates: partial.templates,
    ...extra,
  });
}

function codes(result, code) {
  return (result.findings ?? []).filter((f) => f.code === code);
}

test("partial color family warns when a candle list has some colors but not all", () => {
  const result = audit({
    chapters: [chapter({
      id: "lights",
      hint: "Any candle will do.",
      objectives: [{ type: "place", label: "Place 4 candles", blocks: ["minecraft:white_candle", "minecraft:black_candle"] }],
    })],
  });
  const hits = codes(result, "partial-family");
  assert.equal(hits.length, 1);
  assert.match(hits[0].message, /red_candle/);
  assert.match(hits[0].at, /demo\/lights/);
});

test("a complete family and a single named color do not warn", () => {
  const complete = audit({
    chapters: [chapter({
      objectives: [{ type: "place", label: "Place 4 candles", blocks: FAMILIES.candle.map((id) => `minecraft:${id}`) }],
    })],
  });
  assert.equal(codes(complete, "partial-family").length, 0);
  const one = audit({
    chapters: [chapter({
      objectives: [{ type: "place", label: "Place the white candle on the altar", blocks: ["minecraft:white_candle"] }],
    })],
  });
  assert.equal(codes(one, "partial-family").length, 0);
});

test("reused cast names and wanderer who.id values warn, but the wanderer's own chain does not", () => {
  const reused = audit({
    chapters: [chapter({
      objectives: [{ type: "meet", label: "Meet Inspector Pell", who: { id: "prewitt", name: "Inspector Pell", entity: "minecraft:villager_v2" }, place: "cove" }],
    })],
  });
  assert.equal(codes(reused, "reused-name").length, 1);
  assert.match(codes(reused, "reused-name")[0].message, /Pell/);
  const stolen = audit({
    id: "smugglers_run",
    kind: "side",
    giver: "quill",
    chapters: [chapter({
      objectives: [{ type: "escort", label: "Walk with Pell", who: { id: "pell", name: "Pell the Pilgrim", entity: "minecraft:villager_v2" } }],
    })],
  });
  assert.equal(codes(stolen, "reused-wanderer-id").length, 1);
  const own = audit({
    id: "w_pell_road",
    kind: "wander",
    giver: "w_pell",
    chapters: [chapter({
      objectives: [{ type: "escort", label: "Walk Pell to the chapel", who: { id: "pell", name: "Pell the Pilgrim", entity: "minecraft:villager_v2" } }],
    })],
  });
  assert.equal(codes(own, "reused-wanderer-id").length, 0);
  assert.equal(codes(own, "reused-name").length, 0);
  const alias = audit({
    chapters: [chapter({
      objectives: [{ type: "defend", label: "Defend Brother Hollis", ward: { id: "hollis_ward", name: "Brother Hollis", entity: "minecraft:villager_v2" } }],
    })],
  }, { npcs: { ...NPCS, hollis: "Brother Hollis" } });
  assert.equal(codes(alias, "reused-name").length, 0);
});

test("a pack-only named item without its pack gate warns, and a gated step does not", () => {
  const open = audit({
    chapters: [chapter({
      objectives: [{ type: "collect", label: "Get a Champion's Heart", name: "Champion's Heart", item: "minecraft:beetroot", count: 1 }],
    })],
  });
  const hits = codes(open, "ungated-pack-item");
  assert.equal(hits.length, 1);
  assert.match(hits[0].message, /cooking_bp/);
  assert.match(hits[0].message, /elite_bp/);
  const gated = audit({
    chapters: [chapter({
      objectives: [{
        type: "collect",
        label: "Get a Champion's Heart",
        name: "Champion's Heart",
        item: "minecraft:beetroot",
        when: { "pack:cooking_bp": "on", "pack:elite_bp": "on" },
      }],
    })],
  });
  assert.equal(codes(gated, "ungated-pack-item").length, 0);
  const optional = audit({
    chapters: [chapter({
      objectives: [{ type: "deliver", label: "Optional chowder", name: "Harbor Chowder", item: "minecraft:beetroot_soup", optional: true }],
    })],
  });
  assert.equal(codes(optional, "ungated-pack-item").length, 0);
});

test("an unknown champion trait warns and a real trait does not", () => {
  const bad = audit({
    chapters: [chapter({
      objectives: [{
        type: "defeat",
        label: "Defeat the spider",
        champion: { tag: "realm:saga:x", mob: "minecraft:spider", name: "Spider", trait: "relentless" },
      }],
    })],
  });
  assert.equal(codes(bad, "unknown-trait").length, 1);
  assert.match(codes(bad, "unknown-trait")[0].message, /relentless/);
  const ok = audit({
    chapters: [chapter({
      objectives: [{
        type: "defeat",
        label: "Defeat the spider",
        champion: { tag: "realm:saga:x", mob: "minecraft:spider", name: "Spider", trait: "frostbound" },
      }],
    })],
  });
  assert.equal(codes(ok, "unknown-trait").length, 0);
});

test("rewards above the story and wanderer scale warn, including a finale over 300 Crowns", () => {
  const side = audit({
    kind: "side",
    chapters: [chapter({ id: "last", reward: { levels: 10, crowns: 200, title: "Deep-Listener" } })],
  });
  assert.equal(codes(side, "reward-scale").length, 1);
  assert.match(codes(side, "reward-scale")[0].message, /10/);
  assert.match(codes(side, "reward-scale")[0].message, /200/);
  const finale = audit({
    kind: "main",
    chapters: [
      chapter({ id: "middle", reward: { levels: 6, crowns: 80 } }),
      chapter({ id: "dawn_relight", reward: { levels: 10, crowns: 400, title: "Lanternbearer" } }),
    ],
  });
  const over = codes(finale, "reward-scale");
  assert.ok(over.some((f) => /400/.test(f.message) && /dawn_relight/.test(f.at)));
  const atCap = audit({
    kind: "main",
    chapters: [chapter({ id: "dawn_gift", reward: { levels: 10, crowns: 300, title: "Keeper's Heir" } })],
  });
  assert.equal(codes(atCap, "reward-scale").length, 0);
  const oneOff = audit({
    stories: [],
    templates: [{ id: "t_hungry", reward: { levels: 8, crowns: 100 }, objectives: [{ type: "collect", label: "Bring food", item: "minecraft:bread" }] }],
  });
  assert.equal(codes(oneOff, "reward-scale").length, 1);
});

test("prefab gather overlap uses any same-chapter place, and a signposted alternate clears it", () => {
  const locked = audit({
    chapters: [chapter({
      id: "fallen",
      hint: "Mine the crater clusters for shards.",
      intro: ["Bring back amethyst from the crater's teeth."],
      objectives: [
        { type: "reach", label: "Find the Starfall Crater", place: "starfall" },
        { type: "collect", label: "Gather 8 amethyst shards", item: "minecraft:amethyst_shard", count: 8 },
      ],
    })],
  });
  const hits = codes(locked, "prefab-gather");
  assert.equal(hits.length, 1);
  assert.match(hits[0].message, /starfall/);
  assert.match(hits[0].message, /amethyst/);
  const signposted = audit({
    chapters: [chapter({
      id: "fallen",
      hint: "Eight amethyst shards count from any source: another geode, shards you already have, or a party mate.",
      intro: ["Another geode, shards you already carry, or a party mate's hand all count."],
      objectives: [
        { type: "reach", label: "Find the Starfall Crater", place: "starfall" },
        { type: "collect", label: "Gather 8 amethyst shards", item: "minecraft:amethyst_shard", count: 8 },
      ],
    })],
  });
  assert.equal(codes(signposted, "prefab-gather").length, 0);
});

test("the engine accepting inventory is not itself a signpost", () => {
  const result = audit({
    chapters: [chapter({
      id: "fallen",
      hint: "Mine the crater clusters.",
      objectives: [
        { type: "vision", label: "Touch the crater", place: "starfall" },
        { type: "collect", label: "Gather 8 amethyst shards", item: "minecraft:amethyst_shard", count: 8 },
      ],
    })],
  }, { engineAcceptsInventory: true });
  assert.equal(codes(result, "prefab-gather").length, 1);
});

test("a worldgen mine with no place filter is not a finite prefab lock", () => {
  const result = audit({
    chapters: [chapter({
      id: "confession",
      hint: "Dig the crypt steps.",
      objectives: [
        { type: "mine", label: "Break 12 dirt", blocks: ["minecraft:dirt", "minecraft:grass_block"], count: 12 },
        { type: "inspect", label: "Search the crypt", place: "graveyard" },
      ],
    })],
  });
  assert.equal(codes(result, "prefab-gather").length, 0);
});

test("trees and logs in the hint are an alternate for a crafted prefab block", () => {
  const open = audit({
    chapters: [chapter({
      id: "patch",
      hint: "Bring the planks to the dock.",
      objectives: [
        { type: "deliver", label: "Bring 24 spruce planks", item: "minecraft:spruce_planks", count: 24 },
        { type: "place", label: "Lay planks at the lighthouse", place: "lighthouse", blocks: ["minecraft:spruce_planks"], count: 6 },
      ],
    })],
  });
  assert.equal(codes(open, "prefab-gather").length, 1);
  const logs = audit({
    chapters: [chapter({
      id: "patch",
      hint: "Spruce planks come from spruce logs (taiga trees).",
      objectives: [
        { type: "deliver", label: "Bring 24 spruce planks", item: "minecraft:spruce_planks", count: 24 },
        { type: "place", label: "Lay planks at the lighthouse", place: "lighthouse", blocks: ["minecraft:spruce_planks"], count: 6 },
      ],
    })],
  });
  assert.equal(codes(logs, "prefab-gather").length, 0);
});

test("mined-out interact targets warn separately from gather overlap", () => {
  const result = audit({
    chapters: [chapter({
      id: "tide_echo",
      hint: "Hit 4 of the sea lanterns around the shrine.",
      objectives: [
        { type: "meet", label: "Listen at the Tide Seal", place: "seal_tide" },
        { type: "interact", label: "Relight the Tide Seal: hit 4 of its sea lanterns", place: "seal_tide", blocks: ["minecraft:sea_lantern", "minecraft:conduit"], count: 4 },
      ],
    })],
  });
  const hits = codes(result, "finite-interact");
  assert.equal(hits.length, 1);
  assert.match(hits[0].message, /sea_lantern/);
  assert.equal(codes(result, "prefab-gather").length, 0);
  const replaced = audit({
    chapters: [chapter({
      id: "tide_echo",
      hint: "Hit 4 sea lanterns. Place a sea lantern if they are gone.",
      objectives: [
        { type: "interact", label: "Hit 4 sea lanterns", place: "seal_tide", blocks: ["minecraft:sea_lantern"], count: 4 },
      ],
    })],
  });
  assert.equal(codes(replaced, "finite-interact").length, 0);
  const popped = audit({
    chapters: [chapter({
      id: "sky_vision",
      hint: "Hit the 4 end rods at the ring's crown (they pop off; put them back if you like).",
      objectives: [
        { type: "interact", label: "Light the crown", place: "seal_tide", blocks: ["minecraft:sea_lantern"], count: 4 },
      ],
    })],
  });
  assert.equal(codes(popped, "finite-interact").length, 0);
});

test("an allowlist entry needs a specific place and reason, and cannot suppress a category", () => {
  const apply = allow();
  const findings = [
    { code: "partial-family", at: "demo/lights objective 1", message: "missing red_candle" },
    { code: "finite-interact", at: "act4_seals/tide_echo objective 2", message: "sea lanterns" },
  ];
  const blanket = apply(findings, [{ code: "partial-family", reason: "ignore every partial family" }]);
  assert.equal(blanket.findings.length, 2);
  const vague = apply(findings, [{ code: "finite-interact", at: "*", reason: "suppress the category" }]);
  assert.equal(vague.findings.length, 2);
  const empty = apply(findings, [{ code: "finite-interact", at: "act4_seals/tide_echo objective 2", reason: "" }]);
  assert.equal(empty.findings.length, 2);
  const one = apply(findings, [{
    code: "finite-interact",
    at: "act4_seals/tide_echo objective 2",
    reason: "Active O38 follow-up: sea lanterns can be mined out. Not fixed in this checker.",
  }]);
  assert.equal(one.findings.length, 1);
  assert.equal(one.findings[0].code, "partial-family");
  assert.equal(one.allowed.length, 1);
});

test("the committed story allowlist is specific and does not drop a category", () => {
  const file = join(import.meta.dirname, "check-stories.allow.json");
  assert.equal(existsSync(file), true, "tools/check-stories.allow.json must list each live finding");
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const entries = raw.entries ?? [];
  assert.ok(entries.length > 0);
  const codesSeen = new Set();
  for (const entry of entries) {
    assert.equal(typeof entry.code, "string");
    assert.equal(typeof entry.at, "string");
    assert.notEqual(entry.at, "*");
    assert.equal(entry.at.includes("*"), false);
    assert.equal(typeof entry.reason, "string");
    assert.ok(entry.reason.length >= 40, entry.at);
    codesSeen.add(entry.code);
  }
  assert.equal(entries.some((e) => e.code === "partial-family" && e.reason.length < 20), false);
  assert.ok(codesSeen.size >= 1);
});
