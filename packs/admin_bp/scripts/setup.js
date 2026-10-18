// Set up this world (Operator Tools, /realm:admin_setup): a guided walk through the server setup checklist
// (presets.js SETUP), one step a page: what it is, why, whether it's done (asked from the packs where they can
// tell), a button that opens the step's own command, Skip, and a summary at the end. Server size (Small Realm /
// Large server) sets a list of other packs' options together over the Realm Settings protocol (realm:cfg_ping ->
// realm:cfg_schema, realm:cfg_set -> realm:cfg_ack), after a list of every change, old -> new.
// Until the wizard is finished (or dismissed), each operator gets one chat line pointing to it, once.
// Operators only: checked when a page opens and again right before anything changes.
// Its listener is subscribed only while it waits for answers, so it costs nothing the rest of the time.
import { CommandPermissionLevel, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, MessageFormData } from "@minecraft/server-ui";
import { OP_COLOR, SETUP, SIZES, SIZE_OPTIONS } from "./presets.js";

const TITLE = "Realm Configuration";
/** World: { d: {step: 1}, s: {step: 1}, f?: 1 finished, x?: 1 dismissed, size?: "small" | "large" } (only ids from SETUP). */
const STATE_PROP = "admin:setup";
/** Player: true once told about Set up this world. */
const TOLD_PROP = "admin:setupTold";
/** A waystone this close to world spawn (blocks, x and z) counts as the one at spawn. */
const SPAWN_NEAR = 48;
/** How long a step page waits for a step's own menu to close before it comes back (ticks). */
const COME_BACK_TICKS = 2400;

/**
 * @typedef {import("@minecraft/server").Player} Player
 * @typedef {import("./catalog.js").Command & { folder: string, pack: string }} Cmd
 * @typedef {(typeof SETUP)[number]} Step
 * @typedef {{ d: Record<string, 1>, s: Record<string, 1>, f?: 1, x?: 1, size?: "small" | "large" }} State
 * @typedef {{ zones: { src: string, dim: string, x: number, z: number, r: number, shape: string }[], npcs: number | undefined,
 *   waystones: { dim: string, x: number, z: number }[] | undefined, spawn: { x: number, z: number }, size: "small" | "large" | "custom" | undefined }} Facts
 * @typedef {{ key: string, type: string, label: string, value: unknown, default: unknown, min?: number, max?: number, choices?: string[], names?: string[], invert?: boolean, restart?: boolean }} Opt
 * @typedef {{ pack: string, title: string, key: string, label: string, opt: Opt, from: unknown, to: unknown }} Change
 * @typedef {{
 *   show: (player: Player, form: any) => Promise<any>,
 *   available: (player: Player) => Promise<Cmd[]>,
 *   openCommand: (player: Player, cmd: Cmd, note?: string, back?: () => Promise<unknown>, ran?: (ok: boolean) => void) => Promise<unknown>,
 *   nameOf: (c: Cmd) => string,
 *   button: (name: string, hint: string, op: boolean) => string,
 *   fit: (s: string, room?: number) => string,
 *   pingZones: () => void,
 *   allZones: () => Facts["zones"],
 *   answerTicks: () => number,
 *   names: Map<string, string>,
 * }} Ctx
 */

/** @param {Player} p */
const isOp = (p) => p.isValid && p.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

// ---------------------------------------------------------------------------
// Saved state
// ---------------------------------------------------------------------------

const IDS = new Set(SETUP.map((s) => s.id));

/** @returns {State} */
export function state() {
  try {
    const v = JSON.parse(String(world.getDynamicProperty(STATE_PROP) ?? "{}"));
    /** @param {unknown} o */
    const ids = (o) => Object.fromEntries(Object.keys(o && typeof o === "object" ? o : {}).filter((k) => IDS.has(k)).map((k) => [k, /** @type {1} */ (1)]));
    return { d: ids(v?.d), s: ids(v?.s), f: v?.f ? 1 : undefined, x: v?.x ? 1 : undefined, size: v?.size === "small" || v?.size === "large" ? v.size : undefined };
  } catch {
    return { d: {}, s: {} };
  }
}

/** @param {(s: State) => void} change */
function save(change) {
  const s = state();
  change(s);
  try {
    world.setDynamicProperty(STATE_PROP, JSON.stringify(s));
  } catch (e) {
    console.warn(`[admin] setup: ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Asking the packs (a listener only while waiting)
// ---------------------------------------------------------------------------

/** @type {Set<(id: string, message: string) => void>} */
const waiting = new Set();
/** @type {((ev: import("@minecraft/server").ScriptEventCommandMessageAfterEvent) => void) | undefined} */
let listener;

/** Hears realm: events while `fn` runs. @template T @param {(id: string, message: string) => void} onEvent @param {() => Promise<T>} fn @returns {Promise<T>} */
async function hearing(onEvent, fn) {
  waiting.add(onEvent);
  if (!listener) {
    listener = system.afterEvents.scriptEventReceive.subscribe(
      ({ id, message }) => {
        for (const w of waiting) {
          try {
            w(id, message);
          } catch {
            // not a message for this one
          }
        }
      },
      { namespaces: ["realm"] }
    );
  }
  try {
    return await fn();
  } finally {
    waiting.delete(onEvent);
    if (!waiting.size && listener) {
      system.afterEvents.scriptEventReceive.unsubscribe(listener);
      listener = undefined;
    }
  }
}

let seq = 0;

/** World spawn's x and z. */
function spawnXZ() {
  try {
    const s = world.getDefaultSpawnLocation();
    return { x: s.x, z: s.z };
  } catch {
    return { x: 0, z: 0 };
  }
}

/**
 * What the packs say is set up: safe zones and towns, how many townsfolk are placed, the waystones this operator
 * knows, and (withSize: every pack answers, so only where it's shown) which server size the settings match. One
 * wait for all of them.
 * @param {Ctx} ctx @param {Player} player @param {boolean} [withSize] @returns {Promise<Facts>}
 */
export async function facts(ctx, player, withSize = false) {
  /** @type {Map<number, unknown[]>} */
  const folk = new Map();
  let folkParts = -1;
  /** @type {Map<number, any[]>} */
  const ways = new Map();
  let wayParts = -1;
  /** @type {Map<string, Map<number, Opt[]>>} */
  const schemas = new Map();
  const id = `setup-${++seq}`;
  const sizeKeys = new Set(SIZE_OPTIONS.map((o) => `${o.pack}:${o.key}`));
  await hearing(
    (ev, message) => {
      if (ev === "realm:npc_places") {
        const m = JSON.parse(message);
        folkParts = Number(m.parts) || 0;
        if (Array.isArray(m.folk)) folk.set(Number(m.part) || 1, m.folk);
      } else if (ev === "realm:waystones_known") {
        const m = JSON.parse(message);
        if (m.player !== player.id) return;
        wayParts = Number(m.parts) || 0;
        if (Array.isArray(m.list)) ways.set(Number(m.part) || 1, m.list);
      } else if (ev === "realm:cfg_schema") {
        const m = JSON.parse(message);
        if (m.id !== id || !SIZE_OPTIONS.some((o) => o.pack === m.pack)) return;
        const parts = schemas.get(m.pack) ?? new Map();
        parts.set(Number(m.part) || 1, (Array.isArray(m.options) ? m.options : []).filter((/** @type {Opt} */ o) => sizeKeys.has(`${m.pack}:${o.key}`)));
        schemas.set(m.pack, parts);
      }
    },
    async () => {
      ctx.pingZones();
      system.sendScriptEvent("realm:npc_places_ping", "{}");
      system.sendScriptEvent("realm:waystones_known_ping", JSON.stringify({ player: player.id }));
      if (withSize) system.sendScriptEvent("realm:cfg_ping", JSON.stringify({ id }));
      await system.waitTicks(ctx.answerTicks());
    }
  );
  const values = new Map([...schemas].flatMap(([pack, parts]) => [...parts.values()].flat().map((o) => [`${pack}:${o.key}`, o])));
  return {
    zones: ctx.allZones(),
    npcs: folkParts < 0 ? undefined : [...folk.values()].flat().length,
    waystones: wayParts < 0 ? undefined : [...ways.values()].flat().map((w) => ({ dim: String(w?.dim ?? ""), x: Number(w?.x), z: Number(w?.z) })),
    spawn: spawnXZ(),
    size: sizeOf(values),
  };
}

/** Which profile the installed options match, if any. @param {Map<string, Opt>} values */
function sizeOf(values) {
  const here = SIZE_OPTIONS.map((o) => ({ o, opt: values.get(`${o.pack}:${o.key}`) })).filter((x) => x.opt);
  if (!here.length) return undefined;
  if (here.every(({ opt }) => opt?.value === opt?.default)) return "small";
  if (here.every(({ o, opt }) => opt?.value === o.large)) return "large";
  return "custom";
}

const OVERWORLD = "minecraft:overworld";
/** @param {string} d */
const fullDim = (d) => (d.includes(":") ? d : `minecraft:${d}`);

/**
 * Whether a step is done: what its pack says, else whether it ran from here or was marked done.
 * @param {Step} step @param {Facts} f @param {State} st
 * @returns {{ done: boolean, known: boolean, note: string }} known: the packs said so (not only "it ran from here")
 */
export function statusOf(step, f, st) {
  const ran = !!st.d[step.id];
  switch (step.done) {
    case "towns":
    case "zones": {
      const n = f.zones.filter((z) => z.src === (step.done === "towns" ? "town" : "zones")).length;
      return { done: n > 0, known: true, note: n ? `${n} ${step.done === "towns" ? "town" : "safe zone"}${n === 1 ? "" : "s"}` : "none yet" };
    }
    case "npcs":
      if (f.npcs === undefined) break;
      return { done: f.npcs > 0, known: true, note: f.npcs ? `${f.npcs} placed` : "none placed yet" };
    case "spawnZone": {
      const { x, z } = f.spawn;
      const hit = f.zones.find((zn) => fullDim(zn.dim) === OVERWORLD && (zn.shape === "square" ? Math.abs(x - zn.x) <= zn.r && Math.abs(z - zn.z) <= zn.r : (x - zn.x) ** 2 + (z - zn.z) ** 2 <= zn.r ** 2));
      return { done: !!hit, known: true, note: hit ? (hit.src === "town" ? "a town covers spawn" : "spawn is covered") : "nothing covers spawn yet" };
    }
    case "spawnWaystone": {
      if (f.waystones === undefined) break;
      const { x, z } = f.spawn;
      const near = f.waystones.some((w) => fullDim(w.dim) === OVERWORLD && Math.abs(w.x - x) <= SPAWN_NEAR && Math.abs(w.z - z) <= SPAWN_NEAR);
      return { done: near || ran, known: near, note: near ? "you know one near spawn" : ran ? "the menu ran from here" : `none you know within ${SPAWN_NEAR} blocks of spawn` };
    }
    case "size": {
      // Done once an operator chose one (a fresh world matches Small Realm without anyone choosing).
      const name = (/** @type {string | undefined} */ id) => (id === "small" ? "Small Realm" : "Large server");
      if (st.size) return { done: true, known: true, note: f.size === undefined || f.size === st.size ? name(st.size) : `${name(st.size)}, some settings changed since` };
      const now = f.size === "small" || f.size === "large" ? name(f.size) : f.size === "custom" ? "your own mix" : "";
      return { done: false, known: true, note: `not chosen${now ? ` (now ${now})` : ""}` };
    }
  }
  return { done: ran, known: false, note: ran ? "ran from here" : "can't be checked from here" };
}

/** The checklist mark of a step: [x] done, [ ] not, [-] skipped. @param {{ done: boolean, known: boolean }} s @param {boolean} skipped */
export const markOf = (s, skipped) => (s.done ? "§2[x]" : skipped ? "§8[-]" : s.known ? "§c[ ]" : "§8[ ]");

/**
 * The steps this world has (their command is installed), with what each one runs.
 * @param {Ctx} ctx @param {Player} player
 */
async function stepsFor(ctx, player) {
  const cmds = await ctx.available(player);
  return SETUP.flatMap((step) => {
    const cmd = step.cmd ? cmds.find((c) => c.name === step.cmd) : undefined;
    if (step.cmd && !cmd) return [];
    return [{ step, cmd, alt: step.alt ? cmds.find((c) => c.name === step.alt) : undefined }];
  });
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

/**
 * Shows a step page, waiting while another screen is open: the step's own menu (a command opened it), chat or the
 * inventory. Comes back when that closes, up to COME_BACK_TICKS.
 * @param {Player} player @param {ActionFormData} form
 */
async function showWaiting(player, form) {
  const until = system.currentTick + COME_BACK_TICKS;
  while (player.isValid) {
    const res = /** @type {any} */ (await form.show(player));
    if (res.canceled && res.cancelationReason === FormCancelationReason.UserBusy && system.currentTick < until) {
      await system.waitTicks(20);
      continue;
    }
    if (res.canceled && res.cancelationReason === FormCancelationReason.UserBusy) player.sendMessage(`§7[${TITLE}] Setup paused. Open it again from Operator Tools > Set up this world, or /realm:admin_setup.`);
    return res.canceled ? undefined : res;
  }
  return undefined;
}

/** @param {Player} player */
function refuse(player) {
  if (player.isValid) player.sendMessage(`§c[${TITLE}] Set up this world is for operators.`);
}

/**
 * The start page: what the wizard does, every step with its mark (tap one to go there), and Continue.
 * @param {Ctx} ctx @param {Player} player @param {(() => Promise<unknown>) | undefined} back
 */
export async function wizard(ctx, player, back) {
  if (!isOp(player)) return refuse(player);
  const steps = await stepsFor(ctx, player);
  const f = await facts(ctx, player, true);
  if (!isOp(player)) return refuse(player);
  const st = state();
  const marks = steps.map(({ step }) => ({ step, s: statusOf(step, f, st), skipped: !!st.s[step.id] }));
  const next = marks.findIndex((m) => !m.s.done && !m.skipped);
  const done = marks.filter((m) => m.s.done).length;
  const form = new ActionFormData().title("Set up this world");
  form.body(`The one-time jobs a new world needs, one at a time: what each one is for, whether it's done, and a button that does it. Skip any you don't need; you can come back to any step later.\n\n${done} of ${marks.length} done.`);
  /** @type {(() => Promise<unknown>)[]} */
  const opens = [];
  const go = (/** @type {number} */ i) => () => stepPage(ctx, player, steps, i, back);
  if (next >= 0) {
    form.button(`${OP_COLOR}${next === 0 && !done ? "Start" : "Continue"}\n§8${ctx.fit(marks[next].step.title)}`);
    opens.push(go(next));
  } else {
    form.button(`${OP_COLOR}See the summary\n§8Every step is done or skipped`);
    opens.push(() => summary(ctx, player, steps, back));
  }
  form.divider().label("§l§6Steps");
  marks.forEach((m, i) => {
    form.button(`${markOf(m.s, m.skipped)} ${OP_COLOR}${m.step.title}\n§8${ctx.fit(m.s.note)}`);
    opens.push(go(i));
  });
  if (!st.f && !st.x) {
    form.divider();
    form.button(`Don't remind operators\n§8No more chat line about this`);
    opens.push(async () => {
      save((s) => void (s.x = 1));
      player.sendMessage(`§7[${TITLE}] Operators won't be reminded about Set up this world. It stays in Operator Tools.`);
      return wizard(ctx, player, back);
    });
  }
  if (back) {
    form.divider();
    form.button("Back\n§8To the page before");
    opens.push(back);
  }
  const res = await ctx.show(player, form);
  if (res?.selection === undefined) return;
  return opens[res.selection]?.();
}

/**
 * One step: what it is, why, whether it's done, and its buttons.
 * @param {Ctx} ctx @param {Player} player @param {Awaited<ReturnType<typeof stepsFor>>} steps @param {number} i @param {(() => Promise<unknown>) | undefined} back
 */
async function stepPage(ctx, player, steps, i, back) {
  if (!isOp(player)) return refuse(player);
  const { step, cmd, alt } = steps[i];
  const f = await facts(ctx, player, step.id === "size");
  if (!isOp(player)) return refuse(player);
  const st = state();
  const s = statusOf(step, f, st);
  const skipped = !!st.s[step.id];
  const again = () => stepPage(ctx, player, steps, i, back);
  const forward = () => (i + 1 < steps.length ? stepPage(ctx, player, steps, i + 1, back) : summary(ctx, player, steps, back));
  const shown = s.done ? `§2Done§r: ${s.note}` : skipped ? `§8Skipped§r (${s.note})` : s.known ? `§cNot done yet§r: ${s.note}` : `§7Not checked: ${s.note}`;
  const form = new ActionFormData().title(`Set up: step ${i + 1} of ${steps.length}`).body(`§l§6${step.title}§r\n${shown}\n\n${step.help}\n\n§7Why: ${step.why}`);
  /** @type {(() => Promise<unknown>)[]} */
  const opens = [];
  /** @param {Cmd} c */
  const run = (c) => () =>
    ctx.openCommand(player, c, step.help, again, (ok) => {
      if (ok) save((x) => {
        x.d[step.id] = 1;
        delete x.s[step.id];
      });
    });
  if (step.id === "size") {
    form.button(`${OP_COLOR}Choose a size\n§8Small Realm or Large server`);
    opens.push(() => sizePage(ctx, player, again));
  }
  if (cmd) {
    form.button(ctx.button(ctx.nameOf(cmd), `Runs /${cmd.name}`, true));
    opens.push(run(cmd));
  }
  if (alt) {
    form.button(ctx.button(ctx.nameOf(alt), `Or /${alt.name}`, true));
    opens.push(run(alt));
  }
  if (!s.done && !s.known) {
    form.button(`Mark as done\n§8It's done another way`);
    opens.push(async () => {
      save((x) => {
        x.d[step.id] = 1;
        delete x.s[step.id];
      });
      return forward();
    });
  }
  form.divider();
  if (s.done) {
    form.button(`${i + 1 < steps.length ? "Next" : "Finish"}\n§8${ctx.fit(i + 1 < steps.length ? steps[i + 1].step.title : "See the summary")}`);
    opens.push(forward);
  } else {
    form.button(`Skip\n§8${ctx.fit(i + 1 < steps.length ? `Next: ${steps[i + 1].step.title}` : "See the summary")}`);
    opens.push(async () => {
      save((x) => void (x.s[step.id] = 1));
      return forward();
    });
  }
  if (i > 0) {
    form.button(`Previous step\n§8${ctx.fit(steps[i - 1].step.title)}`);
    opens.push(() => stepPage(ctx, player, steps, i - 1, back));
  }
  form.button("All steps\n§8The list, with what's done");
  opens.push(() => wizard(ctx, player, back));
  const res = await showWaiting(player, form);
  if (res?.selection === undefined) return;
  return opens[res.selection]?.();
}

/**
 * The end: every step done, skipped or not done. Reaching it finishes the wizard (no more reminders).
 * @param {Ctx} ctx @param {Player} player @param {Awaited<ReturnType<typeof stepsFor>>} steps @param {(() => Promise<unknown>) | undefined} back
 */
async function summary(ctx, player, steps, back) {
  if (!isOp(player)) return refuse(player);
  const f = await facts(ctx, player, true);
  const st = state();
  const rows = steps.map(({ step }) => ({ step, s: statusOf(step, f, st), skipped: !!st.s[step.id] }));
  const done = rows.filter((r) => r.s.done).length;
  const skipped = rows.filter((r) => !r.s.done && r.skipped).length;
  const open = rows.length - done - skipped;
  const first = !st.f;
  save((x) => void (x.f = 1));
  if (first) player.sendMessage(`§6[${TITLE}] §rSetup finished: ${done} done, ${skipped} skipped${open ? `, ${open} not done` : ""}. Every step stays in Operator Tools > Set up this world.`);
  const lines = rows.map((r) => `${markOf(r.s, r.skipped)}§r ${r.step.title}: ${r.s.done ? "done" : r.skipped ? "skipped" : `§cnot done§r §8(${r.s.note})`}`);
  const form = new ActionFormData()
    .title("Setup summary")
    .body(`${done} done, ${skipped} skipped${open ? `, ${open} not done` : ""}.\n\n${lines.join("\n")}\n\n§7Anything skipped can be done later: Operator Tools > Set up this world, or the server setup checklist.`);
  form.button("All steps\n§8Go back to any step");
  form.button("Close\n§8Done for now");
  const res = await ctx.show(player, form);
  if (res?.selection === 0) return wizard(ctx, player, back);
}

// ---------------------------------------------------------------------------
// Server size
// ---------------------------------------------------------------------------

/** An option's value as the menu shows it. @param {Opt} o @param {unknown} v */
function shown(o, v) {
  if (typeof v === "boolean") return (o.invert ? !v : v) ? "Enabled" : "Disabled";
  if (o.type === "enum" && o.choices && o.names) return o.names[o.choices.indexOf(String(v))] ?? String(v);
  return String(v);
}

/**
 * Every option of SIZE_OPTIONS that an installed pack has, with its current value and its default.
 * @param {Ctx} ctx @returns {Promise<{ pack: string, title: string, opt: Opt, large: unknown }[]>}
 */
async function sizeOptions(ctx) {
  /** @type {Map<string, { title: string, parts: Map<number, Opt[]>, total: number }>} */
  const got = new Map();
  const id = `setup-${++seq}`;
  const complete = () => [...got.values()].every((g) => g.parts.size >= g.total);
  await hearing(
    (ev, message) => {
      if (ev !== "realm:cfg_schema") return;
      const m = JSON.parse(message);
      if (m.id !== id || !SIZE_OPTIONS.some((o) => o.pack === m.pack)) return;
      const g = got.get(m.pack) ?? { title: String(m.title ?? m.pack), parts: new Map(), total: Number(m.parts) || 1 };
      g.parts.set(Number(m.part) || 1, Array.isArray(m.options) ? m.options : []);
      got.set(m.pack, g);
    },
    async () => {
      system.sendScriptEvent("realm:cfg_ping", JSON.stringify({ id }));
      await system.waitTicks(ctx.answerTicks());
      if (!complete()) await system.waitTicks(ctx.answerTicks()); // a long answer comes in parts
    }
  );
  return SIZE_OPTIONS.flatMap((o) => {
    const g = got.get(o.pack);
    const opt = g ? [...g.parts.values()].flat().find((x) => x.key === o.key) : undefined;
    return g && opt && !opt.restart ? [{ pack: o.pack, title: g.title, opt, large: o.large }] : [];
  });
}

/**
 * Server size: both profiles, which one the settings match now, then the list of changes before anything changes.
 * @param {Ctx} ctx @param {Player} player @param {(() => Promise<unknown>) | undefined} back
 */
export async function sizePage(ctx, player, back) {
  if (!isOp(player)) return refuse(player);
  const opts = await sizeOptions(ctx);
  if (!isOp(player)) return refuse(player);
  const now = sizeOf(new Map(opts.map((o) => [`${o.pack}:${o.opt.key}`, o.opt])));
  const form = new ActionFormData()
    .title("Server size")
    .body(`Pick how many players this world is for. The settings that depend on it change together; you see every change, old -> new, before anything changes.\n\nNow: ${now === "small" ? "§2Small Realm§r" : now === "large" ? "§2Large server§r" : now === "custom" ? "your own mix of settings" : "none of these packs is installed"}. ${opts.length} settings in ${new Set(opts.map((o) => o.pack)).size} packs.`);
  for (const s of SIZES) form.button(`${OP_COLOR}${s.title}${now === s.id ? " §2(now)" : ""}\n§8${ctx.fit(s.hint)}`);
  if (back) form.button("Back\n§8To the page before");
  const res = await ctx.show(player, form);
  if (res?.selection === undefined) return;
  const size = SIZES[res.selection];
  if (!size) return back?.();
  return applySize(ctx, player, size.id, opts, back);
}

/**
 * Shows every change of a profile and applies them after a confirmation.
 * @param {Ctx} ctx @param {Player} player @param {"small" | "large"} id @param {Awaited<ReturnType<typeof sizeOptions>>} opts @param {(() => Promise<unknown>) | undefined} back
 */
async function applySize(ctx, player, id, opts, back) {
  const size = /** @type {(typeof SIZES)[number]} */ (SIZES.find((s) => s.id === id));
  /** @type {Change[]} */
  const changes = [];
  const out = [];
  for (const { pack, title, opt, large } of opts) {
    const to = id === "small" ? opt.default : large;
    if (typeof to === "number" && ((opt.min !== undefined && to < opt.min) || (opt.max !== undefined && to > opt.max))) {
      out.push(`${title}: ${opt.label} (this version takes ${opt.min} to ${opt.max})`);
      continue;
    }
    if (opt.type === "enum" && !(opt.choices ?? []).includes(String(to))) {
      out.push(`${title}: ${opt.label} (this version has no "${to}")`);
      continue;
    }
    if (opt.value !== to) changes.push({ pack, title, key: opt.key, label: opt.label, opt, from: opt.value, to });
  }
  const same = opts.length - changes.length - out.length;
  const missing = [...new Set(SIZE_OPTIONS.map((o) => o.pack))].filter((p) => !opts.some((o) => o.pack === p));
  if (!changes.length) {
    const res = await ctx.show(player, new MessageFormData().title(size.title).body(`Every setting already matches ${size.title}${same ? ` (${same} settings)` : ""}. Nothing to change.${out.length ? `\n\nNot changed: ${out.join("; ")}.` : ""}`).button1("Remember it").button2("Back"));
    if (res?.selection === 0 && isOp(player)) {
      save((s) => void (s.size = id));
      player.sendMessage(`§7[${TITLE}] Server size: ${size.title}.`);
    }
    return back?.();
  }
  const list = changes.map((c) => `§r${c.title}: ${c.label}: §c${shown(c.opt, c.from)}§r -> §2${shown(c.opt, c.to)}`).join("\n");
  const body = `These ${changes.length} settings change, for the whole world:\n${list}${same ? `\n\n§7${same} more already match.` : ""}${out.length ? `\n§7Not changed: ${out.join("; ")}.` : ""}${missing.length ? `\n§7Not installed: ${missing.map((p) => ctx.names.get(p) ?? p).join(", ")}.` : ""}\n\n§r${size.help} Each one can be changed back in Realm Settings, or with the other size.`;
  const res = await ctx.show(player, new MessageFormData().title(`Apply ${size.title}?`).body(body).button1(`Yes, change ${changes.length}`).button2("Cancel"));
  if (res?.selection !== 0) return back?.();
  if (!isOp(player)) return void player.sendMessage(`§c[${TITLE}] Server size didn't change: you aren't an operator any more.`);

  /** @type {Map<string, any>} */
  const acks = new Map();
  const req = `setup-${++seq}`;
  await hearing(
    (ev, message) => {
      if (ev !== "realm:cfg_ack") return;
      const m = JSON.parse(message);
      if (m.id === req && typeof m.pack === "string" && typeof m.key === "string") acks.set(`${m.pack}:${m.key}`, m);
    },
    async () => {
      for (const c of changes) system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: req, pack: c.pack, key: c.key, value: c.to }));
      for (let t = 0; t < ctx.answerTicks() * 2 && acks.size < changes.length; t++) await system.waitTicks(1);
    }
  );
  const ok = changes.filter((c) => acks.get(`${c.pack}:${c.key}`)?.ok);
  const failed = changes.filter((c) => !acks.get(`${c.pack}:${c.key}`)?.ok);
  if (ok.length) save((s) => void (s.size = id));
  if (!player.isValid) return;
  player.sendMessage(`§6[${TITLE}] §rServer size: ${size.title}. Changed ${ok.length} setting${ok.length === 1 ? "" : "s"}${failed.length ? `; §c${failed.length} didn't change§r (${failed.map((c) => `${c.title}: ${c.label}: ${acks.get(`${c.pack}:${c.key}`)?.error ?? "no answer"}`).join("; ")})` : ""}.`);
  return back?.();
}

// ---------------------------------------------------------------------------
// The reminder
// ---------------------------------------------------------------------------

/**
 * An operator on a world whose setup was never finished hears about Set up this world once: one chat line.
 * @param {Player} player
 */
export function remind(player) {
  try {
    if (player.getDynamicProperty(TOLD_PROP) === true) return;
    const st = state();
    if (st.f || st.x) return;
    player.setDynamicProperty(TOLD_PROP, true);
  } catch {
    return;
  }
  player.sendMessage(`§6[${TITLE}] §rNew world? §6Set up this world§r walks you through the one-time setup (townsfolk, a town, safe zones, server size...): open the item, then Operator Tools, or run /realm:admin_setup. Not needed? Pick Don't remind operators there.`);
}
