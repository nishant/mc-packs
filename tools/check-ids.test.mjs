// O39: typed vanilla id sets, pinned particle and sound ids, and bare ids in data
// lists and regex alternations. The checker must stay offline and must not treat
// every minecraft: prefix as valid.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const mod = await import("./check-ids.mjs");

const SETS = {
  block: new Set(["minecraft:stone", "minecraft:deadbush", "minecraft:noteblock", "minecraft:short_grass", "minecraft:grass_block"]),
  item: new Set(["minecraft:diamond", "minecraft:stick", "minecraft:deadbush"]),
  entity: new Set(["minecraft:creeper", "minecraft:cow"]),
  particle: new Set(["minecraft:villager_happy", "minecraft:basic_flame_particle"]),
  sound: new Set(["random.orb", "mob.cow.say"]),
};

function scan(src, extra) {
  assert.equal(typeof mod.scanIdSource, "function", "scanIdSource must exist so typed and bare-id fixtures can fail first");
  return mod.scanIdSource(src, extra ? { ...SETS, ...extra } : SETS);
}

function ids(result, kind) {
  return (result.findings ?? []).filter((f) => !kind || f.kind === kind).map((f) => f.id);
}

test("setType uses the block set, so an entity id is not a valid block", () => {
  const bad = scan('block.setType("minecraft:creeper");');
  assert.ok(ids(bad, "block").includes("minecraft:creeper"));
  const ok = scan('block.setType("minecraft:stone");');
  assert.equal(ids(ok, "block").includes("minecraft:stone"), false);
  const spawned = scan('dim.spawnEntity("minecraft:creeper", loc);');
  assert.equal(ids(spawned).includes("minecraft:creeper"), false);
  const wrongSpawn = scan('dim.spawnEntity("minecraft:stone", loc);');
  assert.ok(ids(wrongSpawn, "entity").includes("minecraft:stone"));
});

test("ItemStack and give use the item set", () => {
  const bad = scan('const stack = new ItemStack("minecraft:creeper");');
  assert.ok(ids(bad, "item").includes("minecraft:creeper"));
  const ok = scan('const stack = new ItemStack("minecraft:diamond");');
  assert.equal(ids(ok).includes("minecraft:diamond"), false);
  const give = scan('player.runCommand("give @s minecraft:creeper");');
  assert.ok(ids(give, "item").includes("minecraft:creeper"));
});

test("an untyped minecraft id may be any real kind, but a made-up prefix is not valid", () => {
  const entity = scan('const id = "minecraft:creeper";');
  assert.equal(ids(entity).includes("minecraft:creeper"), false);
  const fake = scan('const id = "minecraft:not_a_real_thing";');
  assert.ok(ids(fake).includes("minecraft:not_a_real_thing"));
});

test("bare dead_bush and note_block in regex alternations are checked", () => {
  const bush = scan("const SOFT = /sand|dead_bush|short_grass/;");
  assert.ok(ids(bush, "bare").includes("dead_bush"));
  assert.equal(ids(bush, "bare").includes("short_grass"), false);
  const note = scan("const BUILT = /jukebox|note_block|scaffolding/;");
  assert.ok(ids(note, "bare").includes("note_block"));
  assert.match(note.findings.find((f) => f.id === "note_block").message, /noteblock/);
});

test("bare ids in data lists are checked, and prose is not", () => {
  const list = scan('const ids = ["dead_bush", "minecraft:stone", "short_grass"];');
  assert.ok(ids(list, "bare").includes("dead_bush"));
  assert.equal(ids(list, "bare").includes("short_grass"), false);
  const prose = scan('const hint = "A dead_bush is not a list entry.";');
  assert.equal(ids(prose, "bare").includes("dead_bush"), false);
});

test("particle and sound calls use the pinned sets, not a suffix or prefix exception", () => {
  const badParticle = scan('dim.spawnParticle("minecraft:not_a_real_particle", loc);');
  assert.ok(ids(badParticle, "particle").includes("minecraft:not_a_real_particle"));
  const okParticle = scan('dim.spawnParticle("minecraft:villager_happy", loc);');
  assert.equal(ids(okParticle, "particle").length, 0);
  const badSound = scan('player.playSound("mob.not_a_sound");');
  assert.ok(ids(badSound, "sound").includes("mob.not_a_sound"));
  const okSound = scan('player.playSound("random.orb");');
  assert.equal(ids(okSound, "sound").length, 0);
  const dynamic = scan("player.playSound(`eb.ui.${kind}`);");
  assert.equal(ids(dynamic, "sound").length, 0);
});

test("an allowlist id is kept only with a specific reason", () => {
  assert.equal(typeof mod.applyIdAllowlist, "function", "applyIdAllowlist must require a reason");
  const findings = [{ file: "packs/climate_bp/scripts/main.js", id: "dead_bush", kind: "bare" }];
  const missing = mod.applyIdAllowlist(findings, { "packs/climate_bp/scripts/main.js": ["dead_bush"] }, {});
  assert.equal(missing.findings.length, 1);
  const kept = mod.applyIdAllowlist(findings, { "packs/climate_bp/scripts/main.js": ["dead_bush"] }, {
    "packs/climate_bp/scripts/main.js|dead_bush": "Java name in a classifier regex. Bedrock id is deadbush. Pack edit is outside W7.",
  });
  assert.equal(kept.findings.length, 0);
  assert.match(kept.allowed[0].reason, /deadbush/);
});

test("pinned vanilla-id data names its source and is offline", () => {
  const dir = join(import.meta.dirname, "vanilla-ids");
  const source = join(dir, "SOURCE.json");
  const particles = join(dir, "particles.json");
  const sounds = join(dir, "sounds.json");
  assert.equal(existsSync(source), true);
  assert.equal(existsSync(particles), true);
  assert.equal(existsSync(sounds), true);
  const meta = JSON.parse(readFileSync(source, "utf8"));
  assert.equal(meta.vanillaData.version, "1.26.52");
  assert.match(meta.bedrockSamples.commit, /^[0-9a-f]{40}$/);
  assert.match(meta.bedrockSamples.repo, /Mojang\/bedrock-samples/);
  assert.match(meta.bedrockSamples.license, /MIT/);
  assert.match(meta.note, /identifier/i);
  const particleIds = JSON.parse(readFileSync(particles, "utf8"));
  const soundIds = JSON.parse(readFileSync(sounds, "utf8"));
  assert.ok(particleIds.includes("minecraft:villager_happy"));
  assert.ok(soundIds.includes("random.orb"));
  assert.ok(particleIds.length > 50);
  assert.ok(soundIds.length > 500);
  const checker = readFileSync(join(import.meta.dirname, "check-ids.mjs"), "utf8");
  assert.equal(checker.includes("fetch("), false);
  assert.equal(checker.includes("https://github.com/Mojang"), false);
});

test("the id allowlist reasons stay specific", () => {
  const file = join(import.meta.dirname, "check-ids.allow.json");
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const reasons = raw.reasons ?? {};
  for (const [fileName, ids] of Object.entries(raw)) {
    if (fileName === "comment" || fileName === "reasons" || !Array.isArray(ids)) continue;
    for (const id of ids) {
      const reason = reasons[`${fileName}|${id}`];
      assert.equal(typeof reason, "string", `${fileName} ${id}`);
      assert.ok(reason.length >= 40, `${fileName} ${id}`);
      assert.equal(reason.includes("ignore all"), false);
    }
  }
  assert.ok(Object.values(reasons).some((reason) => reason.includes("dead_bush") || reason.includes("deadbush")));
  assert.ok(Object.values(reasons).some((reason) => reason.includes("note_block") || reason.includes("noteblock")));
});
