// Fails if a pack names an entity, block or item that doesn't exist. A wrong id fails quietly in game: nothing
// spawns, a typeId comparison is never true, a block list never matches (history C20: evocation_illager,
// tropicalfish, fence_gate and others were guessed). check-stories.mjs checks the story data; this checks the rest.
//
// What is checked, in every pack's scripts (*.js) and behavior pack JSON (entities, items, blocks, recipes, loot...):
//   - every "minecraft:<name>" string literal: it must be a vanilla id of any kind @minecraft/vanilla-data knows
//     (block, item, entity, effect, enchantment, biome, dimension, feature, camera preset...) or an id
//     @minecraft/server declares (component ids such as minecraft:health). Not checked: object keys
//     ("minecraft:cardinal_direction": ... is a block state, a JSON key a component), prefixes that the code
//     completes ("minecraft:become_" + job), block states (STATES), particles (*_particle, *_emitter and the few named in PARTICLES:
//     vanilla-data has no particle list) and entity events (EVENTS);
//   - an id in a typed place - spawnEntity("..."), new ItemStack("..."), BlockPermutation.resolve("..."),
//     setType("..."), typeId === "...", type: "...", a summon or give command - with any namespace: a
//     minecraft one (or a bare name, which the game reads as minecraft:) as above, any other namespace
//     must be defined by one of our packs (an entity, item or block "identifier" in packs/*).
// Known exceptions that still need a fix in pack code go in tools/check-ids.allow.json ({ "file": ["id", ...] }):
// it warns when one of them is fixed or gone, so the list can be kept current.
//
//   node tools/check-ids.mjs           check
//   node tools/check-ids.mjs --list    print every unknown id with its file, ignoring the allowlist
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = join(import.meta.dirname, "..");
const packsDir = join(root, "packs");
const ALLOW_FILE = join(root, "tools", "check-ids.allow.json");
const listAll = process.argv.includes("--list");

/** @type {any} */
let vanilla;
try {
  vanilla = await import("@minecraft/vanilla-data");
} catch {
  console.error("check-ids: @minecraft/vanilla-data isn't installed (npm install): game ids can't be checked");
  process.exit(1);
}

/** Every vanilla id of any kind. */
const VANILLA = new Set();
for (const e of Object.values(vanilla)) {
  if (!e || typeof e !== "object") continue;
  for (const x of Object.values(e)) if (typeof x === "string") VANILLA.add(x.includes(":") ? x : `minecraft:${x}`);
}
/** Ids the script API declares (component ids, dimension ids...). */
const dts = readFileSync(join(root, "node_modules", "@minecraft", "server", "index.d.ts"), "utf8");
for (const m of dts.matchAll(/['"](minecraft:[a-z0-9_.]+)['"]/g)) VANILLA.add(m[1]);
/** Vanilla entities that vanilla-data leaves out because they can't be spawned with an egg. */
const EXTRA_ENTITIES = ["minecraft:evocation_fang", "minecraft:area_effect_cloud", "minecraft:fireworks_rocket", "minecraft:shulker_bullet", "minecraft:wind_charge_projectile", "minecraft:breeze_wind_charge_projectile", "minecraft:ender_crystal", "minecraft:lightning_bolt", "minecraft:xp_orb", "minecraft:item", "minecraft:falling_block", "minecraft:tnt", "minecraft:fishing_hook", "minecraft:thrown_trident", "minecraft:splash_potion", "minecraft:lingering_potion", "minecraft:small_fireball", "minecraft:fireball", "minecraft:dragon_fireball", "minecraft:wither_skull", "minecraft:wither_skull_dangerous", "minecraft:llama_spit", "minecraft:eye_of_ender_signal", "minecraft:leash_knot", "minecraft:painting", "minecraft:player"];
for (const id of EXTRA_ENTITIES) VANILLA.add(id);
/** Vanilla particles named without a _particle or _emitter suffix (vanilla-data has no particle list). */
const PARTICLES = new Set(["villager_happy", "villager_angry", "endrod", "dragon_breath_trail", "large_explosion", "mobspell_emitter", "critical_hit_emitter", "huge_explosion_emitter"].map((n) => `minecraft:${n}`));
/** Entity events that vanilla entity files define (triggerEvent, JSON "event"). */
const EVENTS = /^minecraft:(become_[a-z_]+|entity_born|entity_spawned|entity_transformed|ageable_grow_up|spawn_from_village|as_baby|as_adult|[a-z_]*raid[a-z_]*|on_[a-z_]+|start_[a-z_]+|stop_[a-z_]+)$/;
const isParticle = (/** @type {string} */ id) => PARTICLES.has(id) || /_(particle|emitter|particle_manual)$/.test(id);
/** Block states with the minecraft: namespace (permutation.getState("minecraft:cardinal_direction")); vanilla-data lists none. */
const STATES = new Set(["cardinal_direction", "facing_direction", "block_face", "vertical_half", "corner", "connection_north", "connection_south", "connection_east", "connection_west"].map((n) => `minecraft:${n}`));
const other = (/** @type {string} */ id) => isParticle(id) || EVENTS.test(id) || STATES.has(id) || /[:_.]$/.test(id);

const walk = (/** @type {string} */ dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const rel = (/** @type {string} */ f) => relative(root, f).split(sep).join("/");
const folders = readdirSync(packsDir).filter((f) => existsSync(join(packsDir, f, "manifest.json"))).sort();
const isResource = (/** @type {string} */ folder) => JSON.parse(readFileSync(join(packsDir, folder, "manifest.json"), "utf8")).modules.some((/** @type {any} */ m) => m.type === "resources");

/** Our own entity, item and block ids (every pack's "identifier"s), plus the vanilla ones the overrides redefine. */
const OURS = new Set();
for (const folder of folders) {
  for (const f of walk(join(packsDir, folder))) {
    if (!/\/(entities|items|blocks|attachables)\//.test(f.split(sep).join("/")) || !f.endsWith(".json")) continue;
    for (const m of readFileSync(f, "utf8").matchAll(/"identifier"\s*:\s*"([a-z0-9_.-]+:[a-z0-9_./-]+)"/g)) OURS.add(m[1]);
  }
}

/** A string literal whose code before it on the line makes it an entity, item or block id. */
const TYPED = /(?:spawnEntity|spawnItem|new ItemStack|BlockPermutation\.resolve|setType|hasItem|getEntities\(\s*\{[^}]*\btype|\btypeId\s*[!=]==?|\btype\s*:|\bsummon\s+|\bgive\s+@?\S*\s+|\bclear\s+@?\S*\s+)\s*\(?\s*["'`]$/;

/** @type {Map<string, Set<string>>} file -> unknown ids */
const unknown = new Map();
const add = (/** @type {string} */ file, /** @type {string} */ id) => {
  if (!unknown.has(file)) unknown.set(file, new Set());
  /** @type {Set<string>} */ (unknown.get(file)).add(id);
};

/** @param {string} id a full id */
function known(id) {
  if (id.startsWith("minecraft:")) return VANILLA.has(id);
  return OURS.has(id);
}

/** Script code without comments (strings kept), so commented-out ids don't count. @param {string} src */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, a) => a);
}

let files = 0;
for (const folder of folders) {
  const resource = isResource(folder);
  for (const f of walk(join(packsDir, folder))) {
    const js = f.endsWith(".js");
    if (!js && !(f.endsWith(".json") && !resource)) continue;
    if (!js && /manifest\.json$/.test(f)) continue;
    files++;
    const file = rel(f);
    const src = js ? stripComments(readFileSync(f, "utf8")) : readFileSync(f, "utf8");
    // Every minecraft: literal that isn't an object key.
    for (const m of src.matchAll(/(["'`])(minecraft:[a-z0-9_.]*)\1(\s*:)?/g)) {
      const id = m[2];
      if (m[3] || known(id) || other(id)) continue;
      add(file, id);
    }
    if (!js) continue;
    // Commands in strings: summon <id>, give <who> <id>, clear <who> <id>, setblock/fill with an id.
    for (const m of src.matchAll(/\b(?:summon|give\s+\S+|clear\s+\S+|setblock\s+\S+\s+\S+\s+\S+|fill(?:\s+\S+){6})\s+([a-z0-9_]+:[a-z0-9_]+)\b/g)) {
      const id = m[1];
      if (!known(id) && !other(id)) add(file, id);
    }
    // Typed places: any namespace, or a bare name.
    for (const m of src.matchAll(/(["'`])([a-z0-9_]+(?::[a-z0-9_./]+)?)\1/g)) {
      const before = src.slice(Math.max(0, /** @type {number} */ (m.index) - 80), /** @type {number} */ (m.index) + 1).split("\n").at(-1) ?? "";
      if (!TYPED.test(before)) continue;
      const raw = m[2];
      const id = raw.includes(":") ? raw : `minecraft:${raw}`;
      if (known(id) || other(id)) continue;
      // A bare word after type: is often something else (a form type, a message kind): only names that look like
      // a vanilla id's tail are worth a look, so bare words are checked only in spawn/ItemStack/permutation calls.
      if (!raw.includes(":") && !/(spawnEntity|spawnItem|new ItemStack|BlockPermutation\.resolve|setType|summon\s+)\s*\(?\s*["'`]$/.test(before)) continue;
      add(file, id);
    }
  }
}

/** @type {Record<string, string[]>} */
let allow = {};
try {
  const raw = JSON.parse(readFileSync(ALLOW_FILE, "utf8"));
  for (const [k, v] of Object.entries(raw)) if (k !== "comment" && Array.isArray(v)) allow[k] = v;
} catch (e) {
  if (existsSync(ALLOW_FILE)) {
    console.error(`check-ids: can't read ${rel(ALLOW_FILE)}: ${e}`);
    process.exit(1);
  }
}

const problems = [];
let allowed = 0;
for (const [file, ids] of [...unknown].sort()) {
  for (const id of [...ids].sort()) {
    if (!listAll && allow[file]?.includes(id)) {
      allowed++;
      continue;
    }
    problems.push(`${file}: unknown id "${id}"`);
  }
}
if (!listAll) {
  // A warning, not a failure: several branches fix pack code at once, and a stale line hurts nobody.
  for (const [file, ids] of Object.entries(allow)) for (const id of ids) if (!unknown.get(file)?.has(id)) console.warn(`warning: ${rel(ALLOW_FILE)}: "${id}" in ${file} is fixed or gone: remove it from the allowlist`);
}
if (problems.length) {
  console.error(`Game ids that don't exist (check them against @minecraft/vanilla-data ${vanilla.MinecraftBlockTypes ? "" : "?"}or a pack's identifier):\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  if (!listAll) console.error(`(a known one waiting for a fix goes in ${rel(ALLOW_FILE)})`);
  process.exit(1);
}
console.log(`Game ids: ${files} files checked against @minecraft/vanilla-data and ${OURS.size} ids of our own packs${allowed ? ` (${allowed} known in ${rel(ALLOW_FILE)})` : ""}.`);
