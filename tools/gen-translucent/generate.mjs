// Generates Translucent Tools (packs/translucent_rp/): every tool, weapon and the shield drawn see-through in your hand.
// From Mojang's own files in tools/gen-translucent/vanilla/ (see its README), so the pack only changes how they're drawn:
//   textures/translucent_tools/<item>.png        the vanilla texture with every pixel at OPACITY (what you see)
//   textures/translucent_tools/shape/<item>.png  the vanilla texture, opaque (only its outline is used, to build the mesh)
//   attachables/*.json                           one per item: the translucent texture with the entity_alphablend material,
//                                                or the opaque one with vanilla's materials for a player who chose solid
//                                                tools (the `realm:solid_tools` player property, set by translucent_bp)
//   models/entity/translucent_tools.geo.json     the held-item mesh (bow and crossbow frames too), built by the game from
//                                                the shape texture (texture_meshes)
//   animations/translucent_tools.animation.json  how a tool sits in the hand: the handheld-tool pose, first and third
//                                                person, main hand and off hand (see HANDHELD)
//   render_controllers/translucent_tools.render_controllers.json  translucent or solid, a soft purple shimmer when enchanted
//   pack_icon.png                                128x128
// Deterministic: the same vanilla files always give the same output.
//
//   node tools/gen-translucent/generate.mjs           write them
//   node tools/gen-translucent/generate.mjs --check   fail if the committed files differ
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { blank, decode, encode, samePixels } from "../gen-rain/png.mjs";

const root = join(import.meta.dirname, "..", "..");
const pack = join(root, "packs", "translucent_rp");
const vanillaDir = join(import.meta.dirname, "vanilla");
const check = process.argv.includes("--check");

/** How much of a held tool you see: 0.5 = half see-through. Every pixel of every item gets this alpha. */
const OPACITY = 0.5;
/** Enchanted items can't keep the glint (no vanilla material blends and glints at once), so they shimmer purple instead. */
const ENCHANTED = { r: 0.6, g: 0.35, b: 1.0, base: 0.22, pulse: 0.08, speed: 120 };
const NS = "realm_translucent";
const TEX = "textures/translucent_tools";

/** Tools: vanilla texture name → item id. Wooden and golden tools use `wood_` and `gold_` textures. */
const TIERS = [["wood", "wooden"], ["stone", "stone"], ["copper", "copper"], ["iron", "iron"], ["gold", "golden"], ["diamond", "diamond"], ["netherite", "netherite"]];
const KINDS = ["sword", "pickaxe", "axe", "shovel", "hoe"];
const TOOLS = [...TIERS.flatMap(([tex, id]) => KINDS.map((k) => ({ tex: `${tex}_${k}`, id: `${id}_${k}` }))), { tex: "mace", id: "mace" }];

/** @type {Map<string, string>} path in the pack → JSON text */
const json = new Map();
/** @type {Map<string, import("../gen-rain/png.mjs").Image>} path in the pack → image */
const images = new Map();
const vanillaJson = (/** @type {string} */ name) => JSON.parse(readFileSync(join(vanillaDir, name), "utf8"));
const vanillaPng = (/** @type {string} */ name) => decode(readFileSync(join(vanillaDir, `${name}.png`)));
const put = (/** @type {string} */ path, /** @type {unknown} */ value) => json.set(path, JSON.stringify(value, null, 2) + "\n");

/** The vanilla texture at OPACITY (fully transparent pixels stay transparent), plus an opaque copy for a mesh outline. */
function textures(/** @type {string} */ name, withShape = true) {
  const img = vanillaPng(name), out = blank(img.width, img.height);
  out.data.set(img.data);
  for (let i = 3; i < out.data.length; i += 4) out.data[i] = Math.round(out.data[i] * OPACITY);
  images.set(`${TEX}/${name}.png`, out);
  if (withShape) images.set(`${TEX}/shape/${name}.png`, img);
  return { see: `${TEX}/${name}`, shape: `${TEX}/shape/${name}` };
}

/**
 * The player property (from translucent_bp's minecraft:player) that asks for solid tools. Attachable queries run on the
 * entity holding the item. Mobs and players without it read 0: translucent, so the pack works the same without
 * translucent_bp, and a failed read falls back to the translucent look rather than hiding it.
 */
const SOLID_PROP = "realm:solid_tools";
const SOLID_VAR = `variable.realm_solid = query.has_property('${SOLID_PROP}') ? query.property('${SOLID_PROP}') : 0.0;`;
/** Translucent: our material. Solid: vanilla's own materials for held items (entity_alphatest, with the glint when enchanted). */
const MATERIALS = { default: "entity_alphablend", solid: "entity_alphatest", solid_enchanted: "entity_alphatest_glint" };
const GLINT = "textures/misc/enchanted_item_glint";
const material = { "*": "variable.realm_solid ? (variable.is_enchanted ? material.solid_enchanted : material.solid) : material.default" };

const enchantedShimmer = {
  r: ENCHANTED.r, g: ENCHANTED.g, b: ENCHANTED.b,
  a: `(variable.is_enchanted && !variable.realm_solid) ? ${ENCHANTED.base} + ${ENCHANTED.pulse} * math.sin(query.life_time * ${ENCHANTED.speed}) : 0.0`,
};

// ---------------------------------------------------------------------------
// Tools and the mace: vanilla draws them as flat sprites with no attachable, in the game's built-in "hand equipped"
// pose: gripped at the handle (the sprite's bottom-left corner), tilted forward. Each gets an attachable that builds the
// same extruded sprite (texture_meshes) and holds it that way.
//
// The pose is Minecraft's handheld-item display transform (models/item/handheld.json, the parent of every tool's model
// in Java Edition, which Bedrock's hand-equipped items match), turned into bone transforms the way Geyser's
// java2bedrock converter does for 2D items on Bedrock (github.com/Kas-tle/java2bedrock.sh, converter.sh): a bone bound
// to the hand with a fixed base offset per view, then the display's X, Y and Z rotations on three nested bones, then the
// sprite. Until 2026-10 the tools borrowed vanilla's bow pose instead; a bow is gripped at its middle, so every swing
// turned the tool around the middle of its blade instead of its handle, and in third person it stood upright like a bow.
// ---------------------------------------------------------------------------
/** Java's item/handheld display (righthand; the left hand mirrors Y and Z): rotation, translation, scale. */
const HANDHELD = {
  thirdperson: { rotation: [0, -90, 55], translation: [0, 4, 0.5], scale: 0.85 },
  firstperson: { rotation: [0, -90, 25], translation: [1.13, 3.2, 1.13], scale: 0.68 },
};
/** java2bedrock's base offsets for a bone bound to the hand, so a Java display transform lands where it does in Java. */
const BASE = {
  thirdperson: { rotation: [90, 0, 0], position: [0, 13, -3] },
  firstperson: { rotation: [90, 60, -40], position: [4, 10, 4], scale: 1.5 },
};
const B = `${NS}_tool`;
const toolGeo = {
  description: {
    identifier: `geometry.${NS}.tool`, texture_width: 16, texture_height: 16,
    visible_bounds_width: 4, visible_bounds_height: 4.5, visible_bounds_offset: [0, 0.75, 0],
  },
  bones: [
    { name: B, binding: "q.item_slot_to_bone_name(c.item_slot)", pivot: [0, 8, 0] },
    { name: `${B}_x`, parent: B, pivot: [0, 8, 0] },
    { name: `${B}_y`, parent: `${B}_x`, pivot: [0, 8, 0] },
    { name: `${B}_z`, parent: `${B}_y`, pivot: [0, 8, 0], texture_meshes: [{ texture: "shape", position: [0, 8, 0], rotation: [90, 0, -180], local_pivot: [8, 0.5, 8] }] },
  ],
};
/** One view and hand: the base offset, then the handheld display (left hand mirrored, as java2bedrock maps it). */
function toolPose(/** @type {"firstperson" | "thirdperson"} */ view, /** @type {boolean} */ left) {
  const d = HANDHELD[view], base = BASE[view];
  const [rx, ry0, rz0] = d.rotation, ry = left ? -ry0 : ry0, rz = left ? -rz0 : rz0;
  const [tx, ty, tz] = d.translation;
  const px = left ? tx : -tx, pz = view === "firstperson" ? -tz : tz;
  return {
    loop: true,
    bones: {
      [B]: base,
      [`${B}_x`]: { rotation: [-rx, 0, 0], position: [px, ty, pz], scale: d.scale },
      [`${B}_y`]: { rotation: [0, -ry, 0] },
      [`${B}_z`]: { rotation: [0, 0, rz] },
    },
  };
}
const toolAnimations = {
  [`animation.${NS}.tool.first_person`]: toolPose("firstperson", false),
  [`animation.${NS}.tool.third_person`]: toolPose("thirdperson", false),
  [`animation.${NS}.tool.first_person_off_hand`]: toolPose("firstperson", true),
  [`animation.${NS}.tool.third_person_off_hand`]: toolPose("thirdperson", true),
};

for (const t of TOOLS) {
  const { see, shape } = textures(t.tex);
  put(`attachables/${t.id}.json`, {
    format_version: "1.10.0",
    "minecraft:attachable": {
      description: {
        identifier: `minecraft:${t.id}`,
        materials: MATERIALS,
        textures: { default: see, solid: shape, shape, enchanted: GLINT },
        geometry: { default: `geometry.${NS}.tool` },
        animations: {
          first_person: `animation.${NS}.tool.first_person`,
          third_person: `animation.${NS}.tool.third_person`,
          first_person_off_hand: `animation.${NS}.tool.first_person_off_hand`,
          third_person_off_hand: `animation.${NS}.tool.third_person_off_hand`,
        },
        scripts: {
          pre_animation: [SOLID_VAR, "variable.main_hand = c.item_slot == 'main_hand';", "variable.off_hand = c.item_slot == 'off_hand';"],
          animate: [
            { first_person: "variable.main_hand && c.is_first_person" },
            { third_person: "variable.main_hand && !c.is_first_person" },
            { first_person_off_hand: "variable.off_hand && c.is_first_person" },
            { third_person_off_hand: "variable.off_hand && !c.is_first_person" },
          ],
        },
        render_controllers: [`controller.render.${NS}.item`],
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Bow, crossbow, shield, trident: vanilla already has attachables for them. Each is vanilla's file (so their poses and
// animations stay exactly vanilla's) with only the materials, textures and render controller swapped, plus one line
// that reads the solid-tools property. Bow and crossbow frames get a mesh-outline texture each, which is also their
// solid look; the shield and trident's solid look is vanilla's own texture path, as vanilla draws them.
// ---------------------------------------------------------------------------
/** @param {string} file @param {Record<string, string>} vanillaTextures alias → vanilla texture name in vanilla/ */
function override(file, vanillaTextures, /** @type {string} */ controller, /** @type {Record<string, string> | null} */ geometry) {
  const a = vanillaJson(file), d = a["minecraft:attachable"].description;
  const vanillaPaths = d.textures;
  d.materials = MATERIALS;
  d.textures = {};
  for (const [alias, name] of Object.entries(vanillaTextures)) {
    const { see, shape } = textures(name, !!geometry);
    d.textures[alias] = see;
    if (geometry) d.textures[`shape_${alias}`] = shape;
    else d.textures.solid = vanillaPaths[alias];
  }
  d.textures.enchanted = GLINT;
  if (geometry) d.geometry = geometry;
  d.scripts.pre_animation = [SOLID_VAR, ...(d.scripts.pre_animation ?? [])];
  d.render_controllers = [controller];
  put(`attachables/${file}`, a);
}

/** Vanilla's bow or crossbow geometries, renamed into our namespace, each mesh built from its frame's opaque outline. */
function frames(/** @type {string} */ file, /** @type {string} */ prefix) {
  /** @type {Record<string, string>} */ const map = {};
  const geos = vanillaJson(file)["minecraft:geometry"].map((/** @type {any} */ g) => {
    const vid = g.description.identifier, alias = vid === `geometry.${prefix}_standby` ? "default" : vid.replace(`geometry.${prefix}_`, `${prefix}_`);
    const id = `geometry.${NS}.${vid.slice("geometry.".length)}`;
    map[alias] = id;
    return {
      description: { ...g.description, identifier: id },
      bones: g.bones.map((/** @type {any} */ b) => ({ ...b, texture_meshes: b.texture_meshes.map((/** @type {any} */ m) => ({ ...m, texture: `shape_${m.texture}` })) })),
    };
  });
  return { geos, map, format: vanillaJson(file).format_version };
}
const bow = frames("bow.geo.json", "bow"), crossbow = frames("crossbow.geo.json", "crossbow");
override("bow.json", { default: "bow_standby", bow_pulling_0: "bow_pulling_0", bow_pulling_1: "bow_pulling_1", bow_pulling_2: "bow_pulling_2" }, `controller.render.${NS}.bow`, bow.map);
override("crossbow.entity.json", {
  default: "crossbow_standby", crossbow_pulling_0: "crossbow_pulling_0", crossbow_pulling_1: "crossbow_pulling_1",
  crossbow_pulling_2: "crossbow_pulling_2", crossbow_arrow: "crossbow_arrow", crossbow_rocket: "crossbow_firework",
}, `controller.render.${NS}.crossbow`, crossbow.map);
override("shield.entity.json", { default: "shield" }, `controller.render.${NS}.item`, null);
override("trident.entity.json", { default: "trident" }, `controller.render.${NS}.item`, null);

put("models/entity/translucent_tools.geo.json", { format_version: bow.format, "minecraft:geometry": [toolGeo, ...bow.geos, ...crossbow.geos] });
put("animations/translucent_tools.animation.json", { format_version: "1.10.0", animations: toolAnimations });

/**
 * One frame controller from vanilla's bow/crossbow one: the frame arrays kept, each frame's translucent texture first
 * and its opaque outline (the solid look) after them, picked by the frame plus the frame count when solid.
 */
function framed(/** @type {string} */ file, /** @type {string} */ id) {
  const c = structuredClone(vanillaJson(file).render_controllers[id]);
  const [name, list] = /** @type {[string, string[]]} */ (Object.entries(c.arrays.textures)[0]);
  c.arrays.textures[name] = [...list, ...list.map((t) => t.replace("texture.", "texture.shape_"))];
  c.materials = [material];
  c.textures = c.textures.map((/** @type {string} */ t) => t.replace(`${name}[query.get_animation_frame]`, `${name}[query.get_animation_frame + variable.realm_solid * ${list.length}]`));
  if (!c.textures[0].includes("variable.realm_solid")) throw new Error(`${file}: unexpected texture expression ${c.textures[0]}`);
  c.overlay_color = enchantedShimmer;
  return c;
}
put("render_controllers/translucent_tools.render_controllers.json", {
  format_version: "1.10.0",
  render_controllers: {
    [`controller.render.${NS}.item`]: {
      arrays: { textures: { [`array.${NS}_look`]: ["texture.default", "texture.solid"] } },
      geometry: "geometry.default",
      materials: [material],
      textures: [`array.${NS}_look[variable.realm_solid]`, "texture.enchanted"],
      overlay_color: enchantedShimmer,
    },
    [`controller.render.${NS}.bow`]: framed("bow.render_controllers.json", "controller.render.bow"),
    [`controller.render.${NS}.crossbow`]: framed("crossbow.render_controllers.json", "controller.render.crossbow"),
  },
});

// ---------------------------------------------------------------------------
// pack_icon.png: a diamond sword over the shield's face, both at OPACITY, on a checkerboard so the see-through shows.
// ---------------------------------------------------------------------------
function icon() {
  const size = 128, img = blank(size, size);
  const over = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number[]} */ c, /** @type {number} */ a) => {
    const o = (y * size + x) * 4;
    for (let k = 0; k < 3; k++) img.data[o + k] = Math.round(img.data[o + k] * (1 - a) + c[k] * a);
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = ((x >> 4) + (y >> 4)) % 2 ? 0x8a : 0x5c;
    img.data.set([v, v, v, 255], (y * size + x) * 4);
  }
  const shield = vanillaPng("shield"); // the face is the 12x22 texel block at (1, 1) of the 64x64 texture
  for (let y = 0; y < 22 * 5; y++) for (let x = 0; x < 12 * 5; x++) {
    const o = ((1 + Math.floor(y / 5)) * shield.width + 1 + Math.floor(x / 5)) * 4;
    if (shield.data[o + 3]) over(8 + x, 9 + y, [...shield.data.subarray(o, o + 3)], OPACITY);
  }
  const sword = vanillaPng("diamond_sword");
  for (let y = 0; y < 16 * 7; y++) for (let x = 0; x < 16 * 7; x++) {
    const o = (Math.floor(y / 7) * 16 + Math.floor(x / 7)) * 4;
    if (sword.data[o + 3]) over(14 + x, 8 + y, [...sword.data.subarray(o, o + 3)], OPACITY + 0.2);
  }
  return img;
}
images.set("pack_icon.png", icon());

// ---------------------------------------------------------------------------
// docs/media/translucent/textures.png: six items at 8x on a checkerboard, vanilla on top, this pack's below. A picture of
// the textures, not of the game: how big and where a held tool shows is up to the game.
// ---------------------------------------------------------------------------
const SHOWN = ["diamond_sword", "netherite_pickaxe", "iron_axe", "gold_shovel", "mace", "bow_standby"];
function strip() {
  const cell = 16 * 8, pad = 16, w = SHOWN.length * (cell + pad) + pad, h = 2 * (cell + pad) + pad, img = blank(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = ((x >> 4) + (y >> 4)) % 2 ? 0xd8 : 0x40;
    img.data.set([v, v, v, 255], (y * w + x) * 4);
  }
  SHOWN.forEach((name, i) => {
    const src = vanillaPng(name);
    for (const [row, alpha] of /** @type {[number, number][]} */ ([[0, 1], [1, OPACITY]])) {
      const ox = pad + i * (cell + pad), oy = pad + row * (cell + pad);
      for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
        const s = (Math.floor(y / 8) * 16 + Math.floor(x / 8)) * 4, a = (src.data[s + 3] / 255) * alpha, o = ((oy + y) * w + ox + x) * 4;
        for (let k = 0; k < 3; k++) img.data[o + k] = Math.round(img.data[o + k] * (1 - a) + src.data[s + k] * a);
      }
    }
  });
  return img;
}
const docsImages = new Map([[join(root, "docs", "media", "translucent", "textures.png"), strip()]]);

// ---------------------------------------------------------------------------
// Write or check. Everything in the pack except manifest.json is generated.
// ---------------------------------------------------------------------------
const generated = new Set([...json.keys(), ...images.keys()]);
/** @returns {string[]} every file in the pack, relative, with forward slashes */
function packFiles(/** @type {string} */ dir = pack) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? packFiles(p) : [relative(pack, p).split("\\").join("/")];
  });
}
const problems = [];
if (check) {
  for (const [path, text] of json) if (!existsSync(join(pack, path)) || readFileSync(join(pack, path), "utf8") !== text) problems.push(`${path}: out of date`);
  for (const [path, img] of images) if (!existsSync(join(pack, path)) || !samePixels(decode(readFileSync(join(pack, path))), img)) problems.push(`${path}: out of date`);
  for (const f of packFiles()) if (f !== "manifest.json" && !generated.has(f)) problems.push(`${f}: not generated by generate.mjs`);
  for (const [file, img] of docsImages) if (!existsSync(file) || !samePixels(decode(readFileSync(file)), img)) problems.push(`${relative(root, file)}: out of date`);
  if (problems.length) {
    console.error(`translucent_rp (run npm run gen:translucent):\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`translucent_rp matches tools/gen-translucent/generate.mjs (${TOOLS.length + 4} items, ${generated.size} files).`);
} else {
  for (const f of packFiles()) if (f !== "manifest.json" && !generated.has(f)) rmSync(join(pack, f));
  for (const [path, text] of json) mkdirSync(dirname(join(pack, path)), { recursive: true }), writeFileSync(join(pack, path), text);
  for (const [path, img] of images) mkdirSync(dirname(join(pack, path)), { recursive: true }), writeFileSync(join(pack, path), encode(img));
  for (const [file, img] of docsImages) mkdirSync(dirname(file), { recursive: true }), writeFileSync(file, encode(img));
  console.log(`wrote ${generated.size} files to ${relative(root, pack)} (${TOOLS.length + 4} items at ${OPACITY * 100}% opacity)`);
}
