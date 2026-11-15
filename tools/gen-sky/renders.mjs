// Renders before/after pictures of two Realm Skies effects for docs/PACKS.md and minecraft.nish.software
// (docs/media/sky/), from the pack's own particle files: each particle's Molang (lifetime, parametric position, size,
// spin, uv, tint) is evaluated per particle and frame, its sprite comes from the generated texture, and it is spawned
// on the schedule the behavior pack uses. These are approximations, not in-game screenshots: no lighting model beyond
// a flat factor for lit particles, no fog, and a plain sky and ground.
//   rainbow-before.webp  the little rainbow over a pot of gold before rainbow_bp 1.5.0: 259 vanilla colored flames
//                        (Mojang's colored_flame_particle: 0.2 to 0.4 blocks, shrinking, 0.6 to 2 s) every 10 ticks
//   rainbow.webp         now: 7 realm:sky_arc emitters, one per band, every 40 ticks
//   tornado-before.webp  the tornado funnel before tornado_bp 1.3.0 and sky_rp 1.4.0: realm:sky_tornado as it was at
//                        BEFORE (git), each ring redrawn every 5 frames, the skirt and the collar every other frame
//   tornado.webp         now: each ring every 8 frames, the skirt and the collar every 4
// Each is a 2 s loop after 3 s of warm-up, from the same spot as its pair. Deterministic (seeded randoms). Needs git
// (for BEFORE) and ffmpeg with libwebp on PATH. Not part of npm run check (the outputs are committed).
//   node tools/gen-sky/renders.mjs                 all of them
//   node tools/gen-sky/renders.mjs tornado         only the names that contain this
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { blank, decode, encode } from "../gen-rain/png.mjs";

const root = join(import.meta.dirname, "..", "..");
const pack = join(root, "packs", "sky_rp");
const outDir = join(root, "docs", "media", "sky");
/** The commit the "before" particle files are read from: master just before W17a. */
const BEFORE = "a76f666e";
const W = 640, H = 400, FPS = 20, WARM = 3, LOOP = 2;

// ---------------------------------------------------------------------------
// Molang, as far as these particles use it
// ---------------------------------------------------------------------------

const rad = Math.PI / 180;
const MOLANG = {
  cosd: (/** @type {number} */ a) => Math.cos(a * rad),
  sind: (/** @type {number} */ a) => Math.sin(a * rad),
  clamp: (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => Math.max(lo, Math.min(hi, v)),
  mod: (/** @type {number} */ a, /** @type {number} */ b) => a - Math.floor(a / b) * b,
};

/** A Molang expression (or a number) as a function of the variables `v` and a random source `rnd`. @param {number | string} e */
function molang(e) {
  if (typeof e === "number") return () => e;
  const js = e
    .replace(/variable\./g, "v.")
    .replace(/Math\.cos\(/gi, "cosd(")
    .replace(/Math\.sin\(/gi, "sind(")
    .replace(/Math\.random\(/gi, "rnd(")
    .replace(/Math\.clamp\(/gi, "clamp(")
    .replace(/Math\.mod\(/gi, "mod(")
    .replace(/Math\.round\(/gi, "Math.round(")
    .replace(/Math\.(floor|min|max|sqrt|abs|pow)\(/gi, (_, f) => `Math.${f.toLowerCase()}(`);
  const fn = new Function("v", "rnd", "cosd", "sind", "clamp", "mod", `return (${js});`);
  return (/** @type {Record<string, number>} */ v, /** @type {(a: number, b: number) => number} */ rnd) => {
    const proxy = new Proxy(v, { get: (t, k) => (typeof k === "string" && k in t ? t[k] : 0) }); // unset variables read 0
    return Number(fn(proxy, rnd, MOLANG.cosd, MOLANG.sind, MOLANG.clamp, MOLANG.mod)) || 0;
  };
}

/** Deterministic randoms. @param {number} seed */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Particle effects from their JSON
// ---------------------------------------------------------------------------

/** @typedef {{ x: number, y: number, z: number }} V3 */
/**
 * @typedef {{ tex: import("../gen-rain/png.mjs").Image, add: boolean, lit: boolean, count?: Function, rate?: number, max?: number,
 *   active: Function, life: Function, pos: Function[], size: Function[], uv: Function[], uvSize: number[], texSize: number[],
 *   color: Function[], rot: Function, rotRate: Function }} Effect
 */

/** @param {any} json @returns {Effect} */
function effect(json) {
  const pe = json.particle_effect, c = pe.components;
  const texName = pe.description.basic_render_parameters.texture.split("/").pop();
  const tex = decode(readFileSync(join(pack, "textures", "particle", `${texName}.png`)));
  const bb = c["minecraft:particle_appearance_billboard"];
  const tint = c["minecraft:particle_appearance_tinting"].color;
  const spin = c["minecraft:particle_initial_spin"] ?? {};
  return {
    tex,
    add: pe.description.basic_render_parameters.material === "particles_add",
    lit: "minecraft:particle_appearance_lighting" in c,
    count: c["minecraft:emitter_rate_instant"] ? molang(c["minecraft:emitter_rate_instant"].num_particles) : undefined,
    rate: c["minecraft:emitter_rate_steady"]?.spawn_rate,
    max: c["minecraft:emitter_rate_steady"]?.max_particles,
    active: molang(c["minecraft:emitter_lifetime_once"]?.active_time ?? 0),
    life: molang(c["minecraft:particle_lifetime_expression"].max_lifetime),
    pos: c["minecraft:particle_motion_parametric"].relative_position.map(molang),
    size: bb.size.map(molang),
    uv: bb.uv.uv.map(molang),
    uvSize: bb.uv.uv_size,
    texSize: [bb.uv.texture_width, bb.uv.texture_height],
    color: tint.map(molang),
    rot: molang(spin.rotation ?? 0),
    rotRate: molang(spin.rotation_rate ?? 0),
  };
}

const readPack = (/** @type {string} */ name) => JSON.parse(readFileSync(join(pack, "particles", `${name}.json`), "utf8"));
const readBefore = (/** @type {string} */ name) => JSON.parse(execFileSync("git", ["-C", root, "show", `${BEFORE}:packs/sky_rp/particles/${name}.json`], { encoding: "utf8" }));

/**
 * A particle world: emitters spawn particles (instant or steady); each frame every particle is placed by its
 * parametric position and drawn. `spawn` is what a behavior pack's spawnParticle does.
 */
function world(/** @type {number} */ seed) {
  const rnd = mulberry32(seed);
  const rand = (/** @type {number} */ a, /** @type {number} */ b) => a + rnd() * (b - a);
  /** @type {{ fx: Effect, at: V3, vars: Record<string, number>, born: number, active: number, debt: number, alive: number }[]} */
  const emitters = [];
  /** @type {{ fx: Effect, at: V3, v: Record<string, number>, born: number, life: number, rot: number, rate: number, src: unknown }[]} */
  const particles = [];
  let now = 0;
  const birth = (/** @type {Effect} */ fx, /** @type {V3} */ at, /** @type {Record<string, number>} */ vars, /** @type {unknown} */ src = undefined) => {
    const v = { ...vars, particle_random_1: rnd(), particle_random_2: rnd(), particle_random_3: rnd(), particle_random_4: rnd(), particle_age: 0 };
    const life = fx.life(v, rand);
    v.particle_lifetime = life;
    particles.push({ fx, at, v, born: now, life, rot: fx.rot(v, rand), rate: fx.rotRate(v, rand), src });
  };
  return {
    rand,
    /** @param {Effect} fx @param {V3} at @param {Record<string, number>} vars */
    spawn(fx, at, vars) {
      if (fx.count) for (let n = Math.round(fx.count(vars, rand)), i = 0; i < n; i++) birth(fx, at, vars);
      else emitters.push({ fx, at, vars, born: now, active: fx.active(vars, rand), debt: 0, alive: 0 });
    },
    /** @param {number} dt */
    step(dt) {
      now += dt;
      for (const e of emitters) {
        if (now - e.born > e.active) continue;
        e.debt += /** @type {number} */ (e.fx.rate) * dt;
        let mine = particles.filter((p) => p.src === e).length;
        for (; e.debt >= 1; e.debt--) if (mine++ < /** @type {number} */ (e.fx.max)) birth(e.fx, e.at, e.vars, e);
      }
      for (let i = emitters.length - 1; i >= 0; i--) if (now - emitters[i].born > emitters[i].active) emitters.splice(i, 1);
      for (let i = particles.length - 1; i >= 0; i--) if (now - particles[i].born >= particles[i].life) particles.splice(i, 1);
    },
    /** Everything alive now, placed: { p, x, y, z, hw, hh, rot, uv, rgba }. */
    placed() {
      return particles.map((p) => {
        p.v.particle_age = now - p.born;
        const v = p.v;
        const [x, y, z] = p.fx.pos.map((f) => f(v, rand));
        return {
          fx: p.fx, x: p.at.x + x, y: p.at.y + y, z: p.at.z + z,
          hw: p.fx.size[0](v, rand), hh: p.fx.size[1](v, rand), rot: p.rot + p.rate * v.particle_age,
          uv: p.fx.uv.map((f) => f(v, rand)), rgba: p.fx.color.map((f) => f(v, rand)),
        };
      });
    },
    get count() {
      return particles.length;
    },
  };
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/**
 * A camera at `eye` looking at `look`, `fov` degrees across.
 * @param {V3} eye @param {V3} look @param {number} fov
 */
function camera(eye, look, fov) {
  const f = norm({ x: look.x - eye.x, y: look.y - eye.y, z: look.z - eye.z });
  const r = norm({ x: -f.z, y: 0, z: f.x });
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
  const focal = W / 2 / Math.tan((fov / 2) * rad);
  return {
    eye, f, r, u, focal,
    /** @param {V3} p */
    project(p) {
      const d = { x: p.x - eye.x, y: p.y - eye.y, z: p.z - eye.z };
      const z = dot(d, f);
      return { sx: W / 2 + (dot(d, r) / z) * focal, sy: H / 2 - (dot(d, this.u) / z) * focal, z };
    },
  };
}
const dot = (/** @type {V3} */ a, /** @type {V3} */ b) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (/** @type {V3} */ a) => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/** Sky (top to horizon) and ground colors, linear 0-1. @param {ReturnType<typeof camera>} cam @param {number[][]} sky @param {number[]} ground */
function backdrop(cam, sky, ground) {
  const img = new Float32Array(W * H * 3);
  // The horizon is where the view direction is level.
  const horizon = H / 2 + (cam.f.y / Math.hypot(cam.f.x, cam.f.z)) * cam.focal;
  for (let y = 0; y < H; y++) {
    const t = Math.max(0, Math.min(1, y / Math.max(1, horizon)));
    const below = y >= horizon;
    const c = below ? ground.map((g) => g * (0.85 + 0.15 * Math.min(1, (y - horizon) / 80))) : sky[0].map((a, i) => a + (sky[1][i] - a) * t);
    for (let x = 0; x < W; x++) img.set(c, (y * W + x) * 3);
  }
  return img;
}

/** Draws the placed particles far to near onto `img`. @param {Float32Array} img @param {ReturnType<typeof camera>} cam @param {any[]} list @param {number} light */
function draw(img, cam, list, light) {
  const shown = list.map((q) => ({ q, ...cam.project(q) })).filter((s) => s.z > 0.5).sort((a, b) => b.z - a.z);
  for (const { q, sx, sy, z } of shown) {
    const fx = /** @type {Effect} */ (q.fx);
    const hw = (Math.abs(q.hw) / z) * cam.focal, hh = (Math.abs(q.hh) / z) * cam.focal;
    if (hw < 0.05 || hh < 0.05) continue;
    const reach = Math.ceil(Math.hypot(hw, hh)) + 1;
    const cos = Math.cos(q.rot * rad), sin = Math.sin(q.rot * rad);
    const [tw, th] = fx.texSize, [cw, ch] = fx.uvSize, [u0, v0] = q.uv;
    const k = fx.lit ? light : 1;
    const [cr, cg, cb] = q.rgba.slice(0, 3).map((c) => Math.max(0, c) * k);
    const ca = Math.max(0, Math.min(1, q.rgba[3] ?? 1));
    if (ca <= 0) continue;
    for (let py = Math.max(0, Math.floor(sy - reach)); py < Math.min(H, Math.ceil(sy + reach)); py++) {
      for (let px = Math.max(0, Math.floor(sx - reach)); px < Math.min(W, Math.ceil(sx + reach)); px++) {
        const dx = px + 0.5 - sx, dy = py + 0.5 - sy;
        const lx = (dx * cos + dy * sin) / hw, ly = (-dx * sin + dy * cos) / hh; // -1..1 across the sprite
        if (lx < -1 || lx >= 1 || ly < -1 || ly >= 1) continue;
        const tx = Math.floor(((u0 + ((lx + 1) / 2) * cw) / tw) * fx.tex.width), ty = Math.floor(((v0 + ((ly + 1) / 2) * ch) / th) * fx.tex.height);
        const o = (Math.min(fx.tex.height - 1, Math.max(0, ty)) * fx.tex.width + Math.min(fx.tex.width - 1, Math.max(0, tx))) * 4;
        const a = (fx.tex.data[o + 3] / 255) * ca;
        if (a <= 0.003) continue;
        const r = (fx.tex.data[o] / 255) * cr, g = (fx.tex.data[o + 1] / 255) * cg, b = (fx.tex.data[o + 2] / 255) * cb;
        const i = (py * W + px) * 3;
        if (fx.add) {
          img[i] += r * a, img[i + 1] += g * a, img[i + 2] += b * a;
        } else {
          img[i] += (r - img[i]) * a, img[i + 1] += (g - img[i + 1]) * a, img[i + 2] += (b - img[i + 2]) * a;
        }
      }
    }
  }
}

/** A flat-colored round dot standing in for Mojang's flame sprite (alpha-tested), for the vanilla colored flame. */
function dotSprite() {
  const n = 8, img = blank(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const inside = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) <= n / 2 - 0.5;
    img.data.set([255, 255, 255, inside ? 255 : 0], (y * n + x) * 4);
  }
  return img;
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

// The rainbow: rainbow_bp's arc, 20 blocks foot to foot, its red foot on the pot, seen face on from 24 blocks.
const COLORS = [[0.95, 0.2, 0.2], [1, 0.55, 0.12], [1, 0.9, 0.25], [0.3, 0.85, 0.3], [0.22, 0.52, 1], [0.36, 0.3, 0.92], [0.62, 0.3, 0.95]];
const ARC_R = 10, BAND = 0.5;

/** The flame dots rainbow_bp drew before 1.5.0: 7 bands, a dot about every 0.75 blocks (259 in all). */
function oldArcDots() {
  /** @type {{ x: number, y: number, z: number, band: number }[]} */
  const out = [];
  COLORS.forEach((_, band) => {
    const r = ARC_R - band * BAND, n = Math.max(2, Math.ceil((Math.PI * r) / 0.75));
    for (let i = 0; i <= n; i++) out.push({ x: Math.cos((Math.PI * i) / n) * r, y: 0.9 + Math.sin((Math.PI * i) / n) * r, z: 0, band });
  });
  return out;
}

const rainbowCam = () => camera({ x: 0, y: 1.6, z: -24 }, { x: 0, y: 4.5, z: 0 }, 70);
const DAY = [[0.36, 0.58, 0.9], [0.72, 0.84, 0.96]], GRASS = [0.33, 0.5, 0.22];

const SCENES = {
  "rainbow-before": () => {
    /** @type {Effect} */
    const flame = {
      tex: dotSprite(), add: false, lit: false, active: () => 0,
      life: (/** @type {any} */ v, /** @type {any} */ rnd) => rnd(0.6, 2.0), pos: [() => 0, () => 0, () => 0],
      size: [0, 1].map(() => (/** @type {any} */ v) => Math.max(0, 0.1 + v.particle_random_1 * 0.1 - 0.1 * v.particle_age)),
      uv: [() => 0, () => 0], uvSize: [8, 8], texSize: [8, 8],
      color: [0, 1, 2, 3].map((i) => (/** @type {any} */ v) => (i < 3 ? v[`c${i}`] : 1)), rot: () => 0, rotRate: () => 0,
      count: () => 1,
    };
    const dots = oldArcDots();
    return { cam: rainbowCam(), sky: DAY, ground: GRASS, light: 1, seed: 1, every: 10, run: (/** @type {any} */ w) => dots.forEach((d) => w.spawn(flame, d, { c0: COLORS[d.band][0], c1: COLORS[d.band][1], c2: COLORS[d.band][2] })) };
  },
  rainbow: () => {
    const arc = effect(readPack("sky_arc"));
    const bands = COLORS.map((c, band) => ({ r: ARC_R - band * BAND, ux: 1, uz: 0, cr: c[0], cg: c[1], cb: c[2], life: 2.1 }));
    const at = { x: 0, y: 0.9, z: 0 };
    return { cam: rainbowCam(), sky: DAY, ground: GRASS, light: 1, seed: 1, every: 40, run: (/** @type {any} */ w) => bands.forEach((b) => w.spawn(arc, at, b)) };
  },
  "tornado-before": () => tornado(readBefore, { redraw: 5, collarEvery: 2 }),
  tornado: () => tornado(readPack, { redraw: 8, collarEvery: 4 }),
};

// The tornado: tornado_bp's funnel (its radius and sway, copied from main.js), 42 blocks tall, seen from 46 blocks,
// drawn as one near viewer's copy (22 rings).
function funnelRadius(/** @type {number} */ f) {
  const trunk = 1.35 + 4.8 * f ** 1.55;
  const skirt = f < 0.09 ? (1 - f / 0.09) ** 1.4 * 2.1 : 0;
  const collar = f > 0.76 ? ((f - 0.76) / 0.24) ** 1.5 * 5.2 : 0;
  return trunk + skirt + collar;
}
function funnelAxis(/** @type {number} */ frame, /** @type {number} */ f, /** @type {number} */ top) {
  const time = frame / 10, lean = 0.6;
  const swayA = Math.sin(time * 0.65 + f * 3.2) * f * 3.6;
  const swayB = Math.cos(time * 0.45 + f * 2.4) * f * (1 - f) * 2.2;
  const perp = lean + Math.PI / 2;
  return { x: Math.cos(lean) * swayA + Math.cos(perp) * swayB, y: f * top, z: Math.sin(lean) * swayA + Math.sin(perp) * swayB };
}

/** @param {(name: string) => any} read @param {{ redraw: number, collarEvery: number }} plan */
function tornado(read, plan) {
  const ring = effect(read("sky_tornado")), debris = effect(read("sky_debris"));
  const top = 42, rings = 22;
  let frame = 0;
  const run = (/** @type {any} */ w) => {
    frame++;
    const slice = Math.ceil(rings / plan.redraw);
    for (let k = 0; k < slice; k++) {
      const i = (frame * slice + k) % rings;
      const f = (i + w.rand(0, 0.7)) / rings;
      w.spawn(ring, funnelAxis(frame, f, top), { radius: funnelRadius(f), spin: 8 - 4.5 * f, height: f });
    }
    if (frame % plan.collarEvery === 0) w.spawn(ring, { x: 0, y: 0.35, z: 0 }, { radius: 3.2, spin: 8.8, height: 0.02 });
    else if (frame % plan.collarEvery === plan.collarEvery / 2) w.spawn(ring, funnelAxis(frame, 0.94, top), { radius: funnelRadius(0.94), spin: 3.5, height: 0.94 });
    if (frame % 2 === 0) w.spawn(debris, { x: w.rand(-1.2, 1.2), y: w.rand(0.2, 2), z: w.rand(-1.2, 1.2) }, { radius: w.rand(1.8, 3.8) });
  };
  const STORM = [[0.2, 0.23, 0.29], [0.42, 0.46, 0.52]];
  return { cam: camera({ x: 0, y: 1.6, z: -64 }, { x: 0, y: 21, z: 0 }, 72), sky: STORM, ground: [0.24, 0.32, 0.2], light: 0.9, seed: 3, every: 2, run };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

// --frames <dir>: also keep each scene's first frame as a PNG there, to look at without an animated WebP viewer.
const framesAt = process.argv.indexOf("--frames");
const framesDir = framesAt >= 0 ? process.argv[framesAt + 1] : undefined;
const only = process.argv.slice(2).filter((a, i, all) => a !== "--frames" && all[i - 1] !== "--frames");
mkdirSync(outDir, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "gen-sky-renders-"));
try {
  for (const [name, make] of Object.entries(SCENES)) {
    if (only.length && !only.some((o) => name.includes(o))) continue;
    const scene = make();
    const w = world(scene.seed);
    const back = backdrop(scene.cam, scene.sky, scene.ground);
    const ticks = (WARM + LOOP) * 20;
    let n = 0, alive = 0;
    for (let tick = 0; tick < ticks; tick++) {
      if (tick % scene.every === 0) scene.run(w);
      w.step(1 / 20);
      if (tick < WARM * 20) continue;
      alive += w.count;
      const img = Float32Array.from(back);
      draw(img, scene.cam, w.placed(), scene.light);
      const png = blank(W, H);
      for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) png.data[i * 4 + c] = Math.round(255 * Math.min(1, Math.max(0, img[i * 3 + c])) ** (1 / 1.1));
      for (let i = 0; i < W * H; i++) png.data[i * 4 + 3] = 255;
      if (framesDir && n === 0) writeFileSync(join(framesDir, `${name}.png`), encode(png));
      writeFileSync(join(tmp, `${name}-${String(n++).padStart(3, "0")}.png`), encode(png));
    }
    const out = join(outDir, `${name}.webp`);
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-framerate", String(FPS), "-i", join(tmp, `${name}-%03d.png`), "-c:v", "libwebp_anim", "-quality", "85", "-compression_level", "6", "-loop", "0", "-map_metadata", "-1", out]);
    console.log(`${relative(root, out)}: ${n} frames, about ${Math.round(alive / n)} particles alive, ${(statSync(out).size / 1024).toFixed(0)} KB`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
