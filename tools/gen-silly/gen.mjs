// Generates the Silly Enchants resource pack (packs/silly_rp), all but manifest.json:
//   sounds/silly/yay.ogg            the Grunt Birthday cheer: a party-horn toot and a squeaky chorus cheering "yaaay",
//                                   synthesized from scratch in yay.mjs (no recordings, nobody else's audio)
//   sounds/sound_definitions.json   realm.silly.yay
//   particles/*.json                confetti, disco lights and floor, rainbow trail, bubbles that live in air
//   textures/particle/realm_silly.png   the particles' pictures (white, tinted in game)
//   pack_icon.png
// Deterministic (seeded noise, no Math.random). Ogg Vorbis isn't byte-for-byte the same across ffmpeg versions, so the
// generator also writes sounds-lock.json (the sha256 of the 16-bit samples before encoding, and of the .ogg); --check
// recomputes the samples and compares both hashes, and every other file exactly, without ffmpeg.
//
//   node tools/gen-silly/gen.mjs                          write the pack (needs ffmpeg with libvorbis)
//   node tools/gen-silly/gen.mjs --check                  fail if a generated file differs or is missing
//   node tools/gen-silly/gen.mjs --audition docs/media/silly   also write yay.mp3 there (needs libmp3lame)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { blank, decode, encode, samePixels } from "../gen-rain/png.mjs";
import { wav, yay } from "./yay.mjs";

const root = join(import.meta.dirname, "..", "..");
const RP = join(root, "packs", "silly_rp");
const lockFile = join(import.meta.dirname, "sounds-lock.json");
const check = process.argv.includes("--check");
const auditionArg = process.argv.indexOf("--audition");
const audition = auditionArg > 0 ? process.argv[auditionArg + 1] : undefined;
const sha = (/** @type {Buffer | Uint8Array} */ b) => createHash("sha256").update(b).digest("hex");

/** @typedef {import("../gen-rain/png.mjs").Image} Image */
/** @typedef {[number, number, number, number]} RGBA */

/** @param {Image} img @param {number} x @param {number} y @param {RGBA} c */
function put(img, x, y, c) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  const a = c[3] / 255, b = img.data[i + 3] / 255;
  const out = a + b * (1 - a);
  for (let k = 0; k < 3; k++) img.data[i + k] = out ? Math.round((c[k] * a + img.data[i + k] * b * (1 - a)) / out) : 0;
  img.data[i + 3] = Math.round(out * 255);
}

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------

/** 32 x 16: a confetti square (0,0 8x8), a soft square for the rainbow trail (8,0 8x8), a round glow (16,0 16x16). */
function atlas() {
  const img = blank(32, 16);
  // confetti: a solid square with a slightly darker rim, so a flake reads against the sky
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const rim = x === 0 || y === 0 || x === 7 || y === 7;
      put(img, x, y, rim ? [215, 215, 215, 255] : [255, 255, 255, 255]);
    }
  // trail dab: rounded square, soft edge
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const dx = Math.max(0, Math.abs(x - 3.5) - 2), dy = Math.max(0, Math.abs(y - 3.5) - 2);
      const d = Math.hypot(dx, dy);
      put(img, 8 + x, y, [255, 255, 255, Math.round(255 * Math.max(0, Math.min(1, 1.6 - d)))]);
    }
  // glow: bright core, soft falloff
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5) / 8;
      const a = d >= 1 ? 0 : Math.pow(1 - d, 1.6);
      put(img, 16 + x, y, [255, 255, 255, Math.round(255 * a)]);
    }
  return img;
}

/** 128 x 128: a party hat in a shower of confetti. */
function packIcon() {
  const N = 128, img = blank(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - 64, y - 60) / 90;
      put(img, x, y, [Math.round(70 - 30 * d), Math.round(30 - 12 * d), Math.round(110 - 40 * d), 255]);
    }
  // the hat: a cone from (64, 18) to a base 30..98 at y 106, pink and yellow stripes
  for (let y = 18; y <= 106; y++) {
    const half = ((y - 18) / 88) * 34;
    for (let x = Math.floor(64 - half); x <= Math.ceil(64 + half); x++) {
      const cover = Math.max(0, Math.min(1, half + 0.5 - Math.abs(x + 0.5 - 64)));
      const stripe = Math.floor((y - 0.6 * (x - 64) - 10) / 14) % 2 === 0;
      const shade = 1 - 0.25 * ((x - 64 + half) / (2 * half + 1));
      const c = stripe ? [255, 92, 170] : [255, 214, 64];
      put(img, x, y, [Math.round(c[0] * shade), Math.round(c[1] * shade), Math.round(c[2] * shade), Math.round(255 * cover)]);
    }
  }
  // pom-pom
  for (let y = 6; y < 30; y++)
    for (let x = 52; x < 77; x++) {
      const d = Math.hypot(x + 0.5 - 64, y + 0.5 - 17);
      if (d < 9.5) put(img, x, y, [255, 255, 255, Math.round(255 * Math.min(1, 9.5 - d))]);
    }
  // brim band
  for (let y = 102; y < 110; y++) for (let x = 28; x < 101; x++) put(img, x, y, [120, 230, 255, 255]);
  // confetti
  const colors = [[255, 70, 70], [255, 160, 40], [250, 240, 70], [80, 220, 100], [70, 150, 255], [170, 90, 250]];
  let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(rnd() * 120), y = Math.floor(rnd() * 120), c = colors[i % colors.length];
    const w = 3 + Math.floor(rnd() * 3), h = 2 + Math.floor(rnd() * 3);
    if (Math.abs(x - 64) < ((y - 18) / 88) * 34 + 6 && y > 10 && y < 112) continue; // keep the hat clear
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) put(img, x + xx, y + yy, [c[0], c[1], c[2], 255]);
  }
  return img;
}

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------

const TEX = "textures/particle/realm_silly";
/** Six party colors, picked per particle by `interpolant` (keys doubled so the gradient steps instead of blending). */
function rainbowSteps(/** @type {number} */ alpha) {
  const c = [[1, 0.25, 0.25], [1, 0.6, 0.12], [1, 0.95, 0.25], [0.3, 0.9, 0.35], [0.3, 0.6, 1], [0.7, 0.35, 1]];
  /** @type {Record<string, number[]>} */
  const g = {};
  c.forEach((rgb, i) => {
    g[(i / 6).toFixed(3)] = [...rgb, alpha];
    g[((i + 1) / 6 - 0.001).toFixed(3)] = [...rgb, alpha];
  });
  return g;
}
const fade = "(1 - Math.max(0, variable.particle_age / variable.particle_lifetime - 0.7) / 0.3)";

/** @param {string} id @param {string} texture @param {Record<string, unknown>} components */
const particle = (id, texture, components) => ({
  format_version: "1.10.0",
  particle_effect: { description: { identifier: id, basic_render_parameters: { material: "particles_alpha", texture } }, components },
});

/** @type {Record<string, object>} */
const PARTICLES = {
  // Confetti: variable.count flakes burst up and out, tumble (the height flips) and settle on the ground.
  "realm:silly_confetti": particle("realm:silly_confetti", TEX, {
    "minecraft:emitter_rate_instant": { num_particles: "variable.count" },
    "minecraft:emitter_lifetime_once": { active_time: 0.05 },
    "minecraft:emitter_shape_sphere": { radius: 0.25, direction: ["Math.random(-1, 1)", "Math.random(0.5, 1.6)", "Math.random(-1, 1)"] },
    "minecraft:particle_initial_speed": "Math.random(4, 8)",
    "minecraft:particle_initial_spin": { rotation: "Math.random(0, 360)", rotation_rate: "Math.random(-500, 500)" },
    "minecraft:particle_lifetime_expression": { max_lifetime: "Math.random(1.8, 2.8)" },
    "minecraft:particle_motion_dynamic": { linear_acceleration: [0, -6, 0], linear_drag_coefficient: 3 },
    "minecraft:particle_motion_collision": { collision_radius: 0.03, collision_drag: 10, coefficient_of_restitution: 0.05 },
    "minecraft:particle_appearance_billboard": {
      size: [
        `(0.045 + variable.particle_random_3 * 0.03) * ${fade}`,
        `(0.045 + variable.particle_random_3 * 0.03) * ${fade} * (0.25 + 0.75 * Math.abs(Math.cos(variable.particle_age * (300 + variable.particle_random_2 * 400))))`,
      ],
      facing_camera_mode: "lookat_xyz",
      uv: { texture_width: 32, texture_height: 16, uv: [0, 0], uv_size: [8, 8] },
    },
    "minecraft:particle_appearance_tinting": { color: { interpolant: "variable.particle_random_4", gradient: rainbowSteps(1) } },
  }),
  // Disco lights: eight glows in a ring around you (so you see them too), in variable.color, drifting up and fading.
  "realm:silly_light": particle("realm:silly_light", TEX, {
    "minecraft:emitter_rate_instant": { num_particles: 8 },
    "minecraft:emitter_lifetime_once": { active_time: 0.05 },
    "minecraft:emitter_shape_disc": { radius: 1.3, plane_normal: [0, 1, 0], surface_only: true, direction: "outwards" },
    "minecraft:particle_initial_speed": 0.3,
    "minecraft:particle_lifetime_expression": { max_lifetime: 0.45 },
    "minecraft:particle_motion_dynamic": { linear_acceleration: [0, 1.2, 0] },
    "minecraft:particle_appearance_billboard": {
      size: [0.2, 0.2],
      facing_camera_mode: "lookat_xyz",
      uv: { texture_width: 32, texture_height: 16, uv: [16, 0], uv_size: [16, 16] },
    },
    "minecraft:particle_appearance_tinting": { color: ["variable.color.r", "variable.color.g", "variable.color.b", "1 - variable.particle_age / variable.particle_lifetime * 0.8"] },
  }),
  // Disco floor: nine tiles on a 5 x 5 grid of half blocks under your feet, each its own color, flat on the ground.
  "realm:silly_floor": particle("realm:silly_floor", TEX, {
    "minecraft:emitter_rate_instant": { num_particles: 9 },
    "minecraft:emitter_lifetime_once": { active_time: 0.05 },
    "minecraft:emitter_shape_custom": { offset: ["Math.floor(Math.random(0, 5)) * 0.5 - 1", 0, "Math.floor(Math.random(0, 5)) * 0.5 - 1"], direction: [0, 1, 0] },
    "minecraft:particle_initial_speed": 0,
    "minecraft:particle_lifetime_expression": { max_lifetime: 0.3 },
    "minecraft:particle_motion_dynamic": {},
    "minecraft:particle_appearance_billboard": {
      size: [0.23, 0.23],
      facing_camera_mode: "emitter_transform_xz",
      uv: { texture_width: 32, texture_height: 16, uv: [8, 0], uv_size: [8, 8] },
    },
    "minecraft:particle_appearance_tinting": { color: { interpolant: "variable.particle_random_1", gradient: rainbowSteps(0.8) } },
  }),
  // Rainbow trail: one flat dab on the ground in variable.color that fades over two seconds.
  "realm:silly_trail": particle("realm:silly_trail", TEX, {
    "minecraft:emitter_rate_instant": { num_particles: 1 },
    "minecraft:emitter_lifetime_once": { active_time: 0.05 },
    "minecraft:emitter_shape_point": { offset: [0, 0, 0], direction: [0, 1, 0] },
    "minecraft:particle_initial_speed": 0,
    "minecraft:particle_lifetime_expression": { max_lifetime: 2.2 },
    "minecraft:particle_motion_dynamic": {},
    "minecraft:particle_appearance_billboard": {
      size: [0.24, 0.24],
      facing_camera_mode: "emitter_transform_xz",
      uv: { texture_width: 32, texture_height: 16, uv: [8, 0], uv_size: [8, 8] },
    },
    "minecraft:particle_appearance_tinting": { color: ["variable.color.r", "variable.color.g", "variable.color.b", "0.9 * (1 - variable.particle_age / variable.particle_lifetime)"] },
  }),
  // Bubbles that float up through air as well as water (the vanilla bubbles vanish as soon as they leave water).
  "realm:silly_bubble": particle("realm:silly_bubble", "textures/particle/particles", {
    "minecraft:emitter_rate_instant": { num_particles: 3 },
    "minecraft:emitter_lifetime_once": { active_time: 0.05 },
    "minecraft:emitter_shape_sphere": { radius: 0.35, direction: [0, 1, 0] },
    "minecraft:particle_initial_speed": "Math.random(0.2, 0.6)",
    "minecraft:particle_lifetime_expression": { max_lifetime: "Math.random(0.9, 1.7)" },
    "minecraft:particle_motion_dynamic": {
      linear_acceleration: ["Math.sin(variable.particle_age * 360 + variable.particle_random_1 * 360) * 1.2", 0.8, "Math.cos(variable.particle_age * 360 + variable.particle_random_2 * 360) * 1.2"],
      linear_drag_coefficient: 1.5,
    },
    "minecraft:particle_appearance_billboard": {
      size: ["0.07 + variable.particle_random_3 * 0.05", "0.07 + variable.particle_random_3 * 0.05"],
      facing_camera_mode: "lookat_xyz",
      uv: { texture_width: 128, texture_height: 128, uv: [0, 16], uv_size: [8, 8] },
    },
  }),
};

// ---------------------------------------------------------------------------
// Sounds
// ---------------------------------------------------------------------------

const SOUND_DEFS = {
  format_version: "1.20.20",
  sound_definitions: {
    // The file peaks at -3 dBFS (about -14 LUFS); 0.5 lands it a little under a mob's voice, a cheer, not a blast.
    "realm.silly.yay": { category: "player", max_distance: 24, sounds: [{ name: "sounds/silly/yay", volume: 0.5, load_on_low_memory: true }] },
  },
};

// ---------------------------------------------------------------------------
// Write or check
// ---------------------------------------------------------------------------

/** @type {Map<string, string>} relative path -> JSON text */
const jsonOut = new Map();
for (const [id, def] of Object.entries(PARTICLES)) jsonOut.set(`particles/${id.split(":")[1]}.json`, JSON.stringify(def, null, 2) + "\n");
jsonOut.set("sounds/sound_definitions.json", JSON.stringify(SOUND_DEFS, null, 2) + "\n");
/** @type {Map<string, Image>} */
const pngOut = new Map([
  ["textures/particle/realm_silly.png", atlas()],
  ["pack_icon.png", packIcon()],
]);
const pcm = wav(yay());
const pcmHash = sha(pcm);
const OGG = "sounds/silly/yay.ogg";
const KEEP = new Set(["manifest.json"]);

/** Every file under the pack, relative. @param {string} dir @returns {string[]} */
function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [relative(RP, p).split("\\").join("/")];
  });
}

const made = new Set([...jsonOut.keys(), ...pngOut.keys(), OGG]);
if (check) {
  const bad = [];
  for (const [rel, text] of jsonOut) {
    const f = join(RP, rel);
    if (!existsSync(f) || readFileSync(f, "utf8") !== text) bad.push(rel);
  }
  for (const [rel, img] of pngOut) {
    const f = join(RP, rel);
    if (!existsSync(f) || !samePixels(decode(readFileSync(f)), img)) bad.push(rel);
  }
  const lock = existsSync(lockFile) ? JSON.parse(readFileSync(lockFile, "utf8")) : {};
  if (lock.yay?.pcm !== pcmHash) bad.push(`${OGG} (the cheer's recipe changed)`);
  else if (!existsSync(join(RP, OGG)) || sha(readFileSync(join(RP, OGG))) !== lock.yay.ogg) bad.push(OGG);
  for (const rel of walk(RP)) if (!made.has(rel) && !KEEP.has(rel)) bad.push(`${rel} (not made by the generator)`);
  if (bad.length) {
    console.error(`silly_rp out of date: ${bad.join(", ")} (run node tools/gen-silly/gen.mjs)`);
    process.exit(1);
  }
  console.log(`silly_rp matches tools/gen-silly (${made.size} files).`);
} else {
  for (const rel of walk(RP)) if (!made.has(rel) && !KEEP.has(rel)) rmSync(join(RP, rel));
  for (const [rel, text] of jsonOut) {
    mkdirSync(dirname(join(RP, rel)), { recursive: true });
    writeFileSync(join(RP, rel), text);
  }
  for (const [rel, img] of pngOut) {
    mkdirSync(dirname(join(RP, rel)), { recursive: true });
    writeFileSync(join(RP, rel), encode(img));
  }
  const tmp = mkdtempSync(join(tmpdir(), "gen-silly-"));
  try {
    const src = join(tmp, "yay.wav");
    writeFileSync(src, pcm);
    const lock = existsSync(lockFile) ? JSON.parse(readFileSync(lockFile, "utf8")) : {};
    const ogg = join(RP, OGG);
    // Re-encode only when the samples changed, so the committed .ogg stays put on another ffmpeg.
    if (lock.yay?.pcm !== pcmHash || !existsSync(ogg) || sha(readFileSync(ogg)) !== lock.yay?.ogg) {
      mkdirSync(dirname(ogg), { recursive: true });
      execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-ac", "1", "-c:a", "libvorbis", "-q:a", "6", "-map_metadata", "-1", "-fflags", "+bitexact", ogg]);
    }
    writeFileSync(lockFile, JSON.stringify({ yay: { pcm: pcmHash, ogg: sha(readFileSync(ogg)) } }, null, 2) + "\n");
    if (audition) {
      const out = join(root, audition);
      mkdirSync(out, { recursive: true });
      // A little silence first, so a player that clips the start doesn't eat the toot.
      execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-af", "adelay=250,apad=pad_dur=0.4", "-ac", "1", "-c:a", "libmp3lame", "-q:a", "2", "-map_metadata", "-1", join(out, "yay.mp3")]);
      console.log(`wrote ${relative(root, join(out, "yay.mp3"))}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`wrote ${made.size} files for silly_rp`);
}
