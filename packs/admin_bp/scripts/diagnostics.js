// Pack diagnostics (Operator Tools > Pack diagnostics, /realm:diag): profiles every pack for a few seconds
// over the realm:diag_ping protocol (each pack's scripts/diag.js answers, see tools/diag-shared.js), lists
// them by script time with their saved data, and on a pack's page offers to forget its saved data
// (realm:diag_forget, confirmed first). Operators only: checked when the page opens and again before the
// forget is sent.
import { CommandPermissionLevel, system, world } from "@minecraft/server";
import { ActionFormData, MessageFormData } from "@minecraft/server-ui";
import { onScriptEvent } from "./script-events.js";

const TITLE = "Realm Configuration";
/** Over this many ms per tick a pack is over budget (a typical pack needs 0.15 or less). */
export const BUDGET_MS = 0.5;
/** One saved entry over this is close to Bedrock's 32 KB limit for one property. */
export const BIG_BYTES = 24 * 1024;
/** How long packs get to answer once the profiling window is over. */
export const ANSWER_TICKS = 40;
/** How long a forget waits for its answer before saying it is still pending (ticks). */
export const FORGET_TICKS = 200;
export const DEFAULT_SECONDS = 10;
export const MAX_SECONDS = 60;

/**
 * @typedef {{ id: string, pack: string, name?: string, version?: string, bytes?: number, props?: number, big?: number, bigKey?: string,
 *   forgotten?: boolean, shared?: number, total?: number, unowned?: number, unownedProps?: number, ticks?: number, ms?: number, calls?: number, mpt?: number,
 *   top?: { k: string, ms: number, n: number }[] }} Pong
 * @typedef {{ id: string, pack: string, ok: boolean, removed?: number, bytes?: number, error?: string }} Forgot
 * @typedef {{ show: (player: import("@minecraft/server").Player, form: any) => Promise<any>,
 *   installed: () => Promise<Set<string> | undefined>, names: Map<string, string> }} Ctx
 */

/** @type {Map<string, Map<string, Pong>>} answers per request id */
const pongs = new Map();
/** @type {Map<string, Forgot>} */
const forgets = new Map();
/** Forgets sent and not answered yet, by request id: who asked and for which pack, so a late answer still reaches them. @type {Map<string, { pack: string, operator: string, operatorName: string, name: string, at: number, waiting: boolean }>} */
const pending = new Map();
const MAX_PENDING = 16;
/** A forget with no answer after this long is dropped from the list (ticks). */
export const PENDING_TICKS = 12000;
let seq = 0;

/** @param {{ pack: string, operator: string, operatorName: string, name: string }} w @param {Forgot} ans */
function lateAnswer(w, ans) {
  const who = world.getAllPlayers().find((pl) => pl.id === w.operator);
  const text = ans.ok
    ? `${w.name} forgot ${ans.removed ?? 0} saved entr${ans.removed === 1 ? "y" : "ies"} (${kb(ans.bytes ?? 0)}), after taking longer than expected. §eRun /reload or restart the server now.`
    : `${w.name} didn't forget its data: ${plain(ans.error).slice(0, 200)}`;
  console.warn(`[admin] late answer for ${w.operatorName}'s forget of ${w.pack}: ${ans.ok ? `${ans.removed ?? 0} entries, ${ans.bytes ?? 0} bytes` : "failed"}`);
  if (who?.isValid) who.sendMessage(`${ans.ok ? "§7" : "§c"}[${TITLE}] ${text}`);
}

onScriptEvent(
  ["realm:diag_pong", "realm:diag_forgot"],
  ({ id, message }) => {
    if (id !== "realm:diag_pong" && id !== "realm:diag_forgot") return;
    /** @type {any} */
    let m;
    try {
      m = JSON.parse(message);
    } catch {
      return;
    }
    if (!m || typeof m.id !== "string" || typeof m.pack !== "string") return;
    if (id === "realm:diag_pong") return void pongs.get(m.id)?.set(m.pack, m);
    const w = pending.get(m.id);
    if (!w || w.pack !== m.pack) return;
    if (w.waiting) return void forgets.set(m.id, m);
    pending.delete(m.id);
    lateAnswer(w, m);
  },
);

/** @param {import("@minecraft/server").Player} p */
const isOp = (p) => p.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
const nextId = () => `diag${system.currentTick % 100000}_${++seq}`;
/** @param {number} bytes */
const kb = (bytes) => (bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`);
/** @param {number | undefined} mpt */
const msText = (mpt) => `${(mpt ?? 0).toFixed(2)} ms/tick`;
/** @param {Pong} p */
const over = (p) => (p.mpt ?? 0) > BUDGET_MS;
/** @param {Pong} p */
const big = (p) => (p.big ?? 0) > BIG_BYTES;
/** @param {unknown} s */
const plain = (s) => String(s ?? "").replace(/§./g, "").replace(/[^\x20-\x7e]/g, "?");

/**
 * Pings every pack and collects the answers: after `ticks` of profiling (0: no profiling), packs get
 * ANSWER_TICKS more; it stops early once every installed pack has answered.
 * @param {number} ticks @param {Set<string> | undefined} expected
 * @returns {Promise<Map<string, Pong>>}
 */
export async function collect(ticks, expected) {
  const id = nextId();
  /** @type {Map<string, Pong>} */
  const got = new Map();
  pongs.set(id, got);
  try {
    system.sendScriptEvent("realm:diag_ping", JSON.stringify(ticks > 0 ? { id, ticks } : { id }));
    if (ticks > 0) await system.waitTicks(ticks);
    for (let waited = 0; waited < ANSWER_TICKS; waited += 2) {
      await system.waitTicks(2);
      if (expected && got.size && [...expected].every((f) => got.has(f))) break;
    }
  } finally {
    pongs.delete(id);
  }
  return got;
}

/** @type {Set<string>} players with a profiling run going */
const busy = new Set();

/**
 * Profiles every pack, then shows the list. `back` is the page to return to (none from /realm:diag).
 * @param {import("@minecraft/server").Player} player @param {Ctx} ctx @param {number} seconds @param {(() => Promise<unknown>) | undefined} back
 * @returns {Promise<unknown>}
 */
export async function diagnostics(player, ctx, seconds = DEFAULT_SECONDS, back = undefined) {
  if (!isOp(player)) {
    player.sendMessage(`§c[${TITLE}] Pack diagnostics is for operators.`);
    return back?.();
  }
  if (busy.has(player.id)) return void player.sendMessage(`§e[${TITLE}] Your pack diagnostics are still running: the list opens when they're done.`);
  const secs = Math.max(1, Math.min(MAX_SECONDS, Math.floor(seconds) || DEFAULT_SECONDS));
  busy.add(player.id);
  /** @type {Map<string, Pong>} */
  let got;
  /** @type {Set<string> | undefined} */
  let expected;
  try {
    player.sendMessage(`§7[${TITLE}] Measuring every pack's script time for ${secs} s. Keep playing: the list opens when it's done.`);
    expected = await ctx.installed();
    got = await collect(secs * 20, expected);
  } finally {
    busy.delete(player.id);
  }
  if (!player.isValid) return;
  if (!isOp(player)) return void player.sendMessage(`§c[${TITLE}] Pack diagnostics didn't open: you aren't an operator any more.`);
  return listPage(player, ctx, got, expected, secs, back);
}

/** @param {Pong} p @param {Ctx} ctx */
const nameOf = (p, ctx) => plain(p.name || ctx.names.get(p.pack) || p.pack);

/**
 * @param {import("@minecraft/server").Player} player @param {Ctx} ctx @param {Map<string, Pong>} got @param {Set<string> | undefined} expected
 * @param {number} secs @param {(() => Promise<unknown>) | undefined} back
 * @returns {Promise<unknown>}
 */
async function listPage(player, ctx, got, expected, secs, back) {
  const list = [...got.values()].sort((a, b) => (b.mpt ?? 0) - (a.mpt ?? 0) || (b.bytes ?? 0) - (a.bytes ?? 0) || a.pack.localeCompare(b.pack));
  const missing = expected ? [...expected].filter((f) => !got.has(f)).sort() : [];
  const total = list.reduce((s, p) => s + (p.mpt ?? 0), 0);
  const flagged = list.filter((p) => over(p) || big(p)).length;
  const again = () => listPage(player, ctx, got, expected, secs, back);
  const form = new ActionFormData().title("Pack diagnostics");
  const ticks = list[0]?.ticks ?? secs * 20;
  let body = `Script time per pack over ${(ticks / 20).toFixed(1)} s with ${world.getAllPlayers().length} online: ${total.toFixed(2)} ms/tick for all ${list.length} packs (a tick has 50 ms).`;
  body += `\n§cRed§r: over budget (more than ${BUDGET_MS} ms/tick), or one saved entry over ${BIG_BYTES / 1024} KB (the limit is 32 KB).`;
  if (flagged) body += ` ${flagged} pack${flagged === 1 ? " is" : "s are"} red.`;
  const shared = list.find((p) => (p.shared ?? 0) > 1);
  if (shared) {
    const n = shared.unownedProps ?? 0;
    body += `\n§7${shared.shared} packs share one add-on (a bundle) and its saved data: ${kb(shared.total ?? 0)} in all.`;
    body += n ? ` ${n} entr${n === 1 ? "y" : "ies"} (${kb(shared.unowned ?? 0)}) no pack has used since the last reload: from a removed pack, or one that reads them later.§r` : "§r";
  }
  if (!list.length) body += "\n\n§eNo pack answered. Packs from before this version don't take part.";
  form.body(body);
  form.label("§l§6Packs, slowest first");
  for (const p of list) {
    const red = over(p) || big(p) ? "§c" : "";
    form.button(`${red}${nameOf(p, ctx)} §8v${plain(p.version)}\n§8${msText(p.mpt)}, ${kb(p.bytes ?? 0)} saved${big(p) ? ", §cbig entry" : ""}${p.forgotten ? ", forgotten" : ""}`);
  }
  if (missing.length) {
    form.divider();
    form.label("§l§6No answer");
    form.label(`§7${missing.map((f) => plain(ctx.names.get(f) ?? f)).join(", ")}: no answer within ${ANSWER_TICKS / 20} s (an older version without diagnostics, or too busy).`);
  }
  form.divider();
  form.button("Measure again\n§8Another " + secs + " s");
  if (back) form.button("Back\n§8To the page before");
  const res = await ctx.show(player, form);
  if (res?.selection === undefined) return;
  if (res.selection < list.length) return packPage(player, ctx, list[res.selection], again);
  if (res.selection === list.length) return diagnostics(player, ctx, secs, back);
  return back?.();
}

/**
 * One pack: its numbers, and a way to forget its saved data.
 * @param {import("@minecraft/server").Player} player @param {Ctx} ctx @param {Pong} p @param {() => Promise<unknown>} back
 */
async function packPage(player, ctx, p, back) {
  const name = nameOf(p, ctx);
  const ticks = Math.max(1, p.ticks ?? 1);
  const lines = [
    `§7${plain(p.pack)}, version ${plain(p.version)}§r`,
    `${over(p) ? "§c" : ""}Script time: ${msText(p.mpt)}§r (${Math.round(p.ms ?? 0)} ms over ${(ticks / 20).toFixed(1)} s, ${((p.calls ?? 0) / ticks).toFixed(1)} calls a tick)`,
  ];
  const top = (p.top ?? []).filter((t) => t && t.ms > 0);
  if (top.length) lines.push(`Most of it: ${top.map((t) => `${plain(t.k)} (${Math.round(t.ms)} ms, ${t.n} calls)`).join("; ")}`);
  lines.push(`Saved in the world: ${p.props ?? 0} entr${p.props === 1 ? "y" : "ies"}, ${kb(p.bytes ?? 0)}`);
  if ((p.big ?? 0) > 0) lines.push(`${big(p) ? "§c" : ""}Biggest entry: ${plain(p.bigKey)} (${kb(p.big ?? 0)}${big(p) ? ", close to the 32 KB limit" : ""})§r`);
  if (p.forgotten) lines.push("§eIts saved data was forgotten: it saves nothing until /reload or a restart.");
  const form = new ActionFormData().title(name).body(lines.join("\n"));
  const canForget = !p.forgotten && (p.props ?? 0) > 0;
  if (canForget) form.button("§4Forget this pack's saved data\n§8Delete what it saved in the world");
  form.button("Back\n§8To the list");
  const res = await ctx.show(player, form);
  if (res?.selection === undefined) return;
  if (canForget && res.selection === 0) {
    await forgetPack(player, ctx, p);
    return back();
  }
  return back();
}

/**
 * Asks, checks the operator again, then sends realm:diag_forget and reports the answer.
 * @param {import("@minecraft/server").Player} player @param {Ctx} ctx @param {Pong} p
 */
async function forgetPack(player, ctx, p) {
  const name = nameOf(p, ctx);
  const sharedNote = (p.shared ?? 0) > 1 ? " Only its own entries go: the other packs in this add-on keep theirs." : "";
  const text =
    `Delete everything ${name} (${plain(p.pack)}) saved in the world: ${p.props ?? 0} entr${p.props === 1 ? "y" : "ies"}, ${kb(p.bytes ?? 0)}. ` +
    `Its settings, records and progress stored there are gone for good, and so is anything it kept for players there (such as stored inventory pages or letters); it starts over as if newly installed.${sharedNote}\n\n` +
    "Not deleted: scoreboards and tags (every pack shares them), structures it saved, and data saved on players.\n\n" +
    `${name} keeps running from memory but saves nothing more until you run /reload or restart the server: do that next.`;
  const res = await ctx.show(player, new MessageFormData().title("Forget saved data?").body(text).button1("Forget it").button2("Cancel"));
  if (res?.selection !== 0) return;
  if (!player.isValid) return;
  if (!isOp(player)) return void player.sendMessage(`§c[${TITLE}] Nothing was deleted: you aren't an operator any more.`);
  const id = nextId();
  for (const [k, w] of pending) if (!w.waiting && system.currentTick - w.at > PENDING_TICKS) pending.delete(k);
  if ([...pending.values()].some((w) => w.pack === p.pack)) return void player.sendMessage(`§e[${TITLE}] A forget for ${name} is still waiting for its answer. Check again in a minute.`);
  if (pending.size >= MAX_PENDING) return void player.sendMessage(`§e[${TITLE}] Too many forgets are waiting for an answer. Try again later.`);
  const w = { pack: p.pack, operator: player.id, operatorName: player.name, name, at: system.currentTick, waiting: true };
  pending.set(id, w);
  try {
    system.sendScriptEvent("realm:diag_forget", JSON.stringify({ id, pack: p.pack, confirm: `FORGET ${p.pack}` }));
    for (let waited = 0; waited < FORGET_TICKS && !forgets.has(id); waited += 2) await system.waitTicks(2);
  } finally {
    w.waiting = false;
  }
  const ans = forgets.get(id);
  forgets.delete(id);
  if (ans) pending.delete(id);
  if (!player.isValid) return void (ans && lateAnswer(w, ans));
  if (!ans) return void player.sendMessage(`§e[${TITLE}] ${name} hasn't answered yet: it may still have deleted its data. You'll get a line here when it does.`);
  if (!ans.ok) return void player.sendMessage(`§c[${TITLE}] ${name} didn't forget its data: ${plain(ans.error).slice(0, 200)}`);
  p.forgotten = true;
  p.props = 0;
  p.bytes = 0;
  p.big = 0;
  console.warn(`[admin] ${player.name} made ${p.pack} forget its saved data (${ans.removed ?? 0} entries, ${ans.bytes ?? 0} bytes)`);
  player.sendMessage(`§7[${TITLE}] ${name} forgot ${ans.removed ?? 0} saved entr${ans.removed === 1 ? "y" : "ies"} (${kb(ans.bytes ?? 0)}). §eRun /reload or restart the server now:§7 until then it keeps running from memory and saves nothing.`);
}
