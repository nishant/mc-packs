// Generated from tools/census-shared.js by node tools/sync-census.mjs: edit that file, not this copy.
// Which packs are installed: one answer for the whole script context, asked once. Every pack that needs the list
// (Realm Help, News, Welcome, Realm Configuration, Atlas, Saga, Calendar, Bounty Board, Skills) keeps this same file as
// scripts/census.js: edit tools/census-shared.js, then run node tools/sync-census.mjs (npm run check fails on a stale
// copy). It imports only from @minecraft/server; its state lives on globalThis.__realmCensus (by the context's `system`), so in the Realm Bundle
// (one context, this file stored once) every member shares one list and one census.
//
// The set of installed packs cannot change while a script context lives (adding or removing a pack needs a restart or
// /reload, and both restart every script), so the list is built once:
//   - the packs of this context, from the diagnostics registry (globalThis.__realmDiag.packs: every pack's diag.js
//     registers its folder before its main.js runs), known without any event;
//   - packs installed beside it (their own add-ons, other contexts), from the realm:help_ping census: one ping 3 s
//     after the world loads and one more 10 s later, by whichever copy here subscribed first. Each pack answers
//     realm:help_pong with its folder (the /realm:help protocol in docs/PACKS.md); an answer to anyone's ping counts.
// Nothing repeats it on a timer.
import { system, world } from "@minecraft/server";

/** Ticks after the world loads for the first ping, the answers to it, and the second ping. */
const FIRST_PING = 60;
const ANSWER_TICKS = 40;
const SECOND_PING = 260;

/**
 * @typedef {object} CensusState
 * @property {Set<string>} seen every pack folder known so far
 * @property {boolean} ready the first census has had its answers
 * @property {boolean} started
 * @property {boolean} [listening] a copy here listens for the answers
 * @property {(() => void)[]} waiting resolvers for whenReady
 * @property {((folder: string) => void)[]} added listeners for packs heard of later
 */

/**
 * The context's state, kept by its `system` object (one per script context; a test that runs several simulated worlds
 * in one process gets one each).
 * @returns {CensusState}
 */
function state() {
  const G = /** @type {any} */ (globalThis);
  /** @type {WeakMap<object, CensusState>} */
  const all = (G.__realmCensus ??= new WeakMap());
  let st = all.get(system);
  if (!st) all.set(system, (st = { seen: new Set(), ready: false, started: false, waiting: [], added: [] }));
  return st;
}

/** @param {CensusState} st @param {unknown} folder */
function add(st, folder) {
  if (typeof folder !== "string" || !/^[a-z0-9_]{1,40}$/.test(folder) || st.seen.has(folder)) return;
  st.seen.add(folder);
  for (const fn of st.added) {
    try {
      fn(folder);
    } catch (e) {
      console.warn(`[census] ${e}`);
    }
  }
}

/** @param {CensusState} st */
function fromRegistry(st) {
  const packs = /** @type {any} */ (globalThis).__realmDiag?.packs;
  if (packs && typeof packs.keys === "function") for (const folder of packs.keys()) add(st, folder);
}

/** @param {CensusState} st */
function ping(st) {
  fromRegistry(st);
  try {
    system.sendScriptEvent("realm:help_ping", "");
  } catch (e) {
    console.warn(`[census] help_ping: ${e}`);
  }
}

/** @param {CensusState} st */
function start(st) {
  if (st.started) return;
  st.started = true;
  system.runTimeout(() => ping(st), FIRST_PING);
  system.runTimeout(() => {
    fromRegistry(st);
    st.ready = true;
    const waiting = st.waiting.splice(0);
    for (const fn of waiting) fn();
  }, FIRST_PING + ANSWER_TICKS);
  system.runTimeout(() => ping(st), SECOND_PING);
}

/**
 * The installed-packs list for a pack. The first copy in a context to call this listens for realm:help_pong (with
 * its pack's own script event subscriber) and runs the census; later ones share its answer.
 * @param {string} pack this pack's folder
 * @param {(ids: string | readonly string[], fn: (e: any) => void) => unknown} onScriptEvent the pack's own subscriber
 */
export function createCensus(pack, onScriptEvent) {
  const st = state();
  add(st, pack);
  if (!st.listening) {
    st.listening = true;
    onScriptEvent("realm:help_pong", ({ id, message }) => {
      if (id === "realm:help_pong") add(st, message);
    });
    world.afterEvents.worldLoad.subscribe(() => start(st));
  }
  return {
    /** Every pack known so far (this context's at once, the others' after the census). Do not change it. */
    installed() {
      fromRegistry(st);
      return st.seen;
    },
    /** Has the first census had its answers? */
    ready: () => st.ready,
    /** @returns {Promise<Set<string>>} the list once the first census has had its answers (at once after that) */
    whenReady() {
      if (st.ready) return Promise.resolve(st.seen);
      return new Promise((resolve) => st.waiting.push(() => resolve(st.seen)));
    },
    /** Runs `fn(folder)` for each pack heard of from now on (a late answer). @param {(folder: string) => void} fn */
    onAdded(fn) {
      st.added.push(fn);
    },
  };
}
