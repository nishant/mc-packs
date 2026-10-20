// One script event listener for the whole pack. Every `realm:` script event wakes each listener of every pack in
// the Realm Bundle, so a pack registers its handlers here by id and this file keeps the pack's ONE native
// `system.afterEvents.scriptEventReceive` subscription: an event no handler of the pack wants costs one map lookup,
// not one callback per handler. Synced into every behavior pack as scripts/script-events.js by tools/sync-events.mjs; never
// edit a pack's copy.
//
//   onScriptEvent("realm:help_ping", () => system.sendScriptEvent("realm:help_pong", "afk_bp"));
//   onScriptEvent(["realm:npc_talk", "realm:npc_choose"], ({ id, message }) => { ... });
//   onScriptEvent("*", (event) => { ... });   // every realm: event (a handler that decides by itself)
//   offScriptEvent(handler);                  // like unsubscribe; the last one also drops the native listener
//
// What stays the same as one subscription per handler:
// - Namespace: the native listener asks for `{ namespaces: ["realm"] }`, the only namespace packs use.
// - Order: handlers run in the order they registered, across ids and "*" (earliest first). Another pack's order is
//   decided by when this pack subscribed its first handler, which is when the pack's modules load.
// - Errors: a handler that throws does not stop the others. The first error is rethrown once every handler has run,
//   so the game reports it exactly as before; a second error in the same event is logged with console.error.
// - Source filtering (a console-only test hook checks `event.sourceType`) stays in the handler, which gets the event.
// - Diagnostics: diag.js (imported first by main.js) wraps the one native subscription for this pack and lets the
//   first `realm:` listener of the context answer `realm:diag_ping`; the pack's whole script event time shows as one
//   callback (`system.after.scriptEventReceive scriptEvents @ scripts/<pack>/events.js`).
// This module sends no script events and imports nothing from other packs.
import { system } from "@minecraft/server";

/** @typedef {import("@minecraft/server").ScriptEventCommandMessageAfterEvent} ScriptEvent */
/** @typedef {(event: ScriptEvent) => unknown} ScriptEventHandler */
/** @typedef {{ seq: number, fn: ScriptEventHandler }} Entry */

const NAMESPACE = "realm";
/** @type {readonly Entry[]} */
const NONE = [];

/** Handlers per id, in registration order. Lists are replaced, never edited, so a handler may (un)register while an event is delivered. @type {Map<string, readonly Entry[]>} */
const byId = new Map();
/** Handlers for every realm: event. @type {readonly Entry[]} */
let anyId = NONE;
let seq = 0;
let listening = false;

/** @param {ScriptEvent} event */
function scriptEvents(event) {
  const own = byId.get(event.id) ?? NONE;
  const any = anyId;
  if (!own.length && !any.length) return;
  let failed = false;
  /** @type {unknown} */
  let first;
  let a = 0;
  let b = 0;
  while (a < own.length || b < any.length) {
    const entry = b >= any.length || (a < own.length && own[a].seq < any[b].seq) ? own[a++] : any[b++];
    try {
      entry.fn(event);
    } catch (error) {
      if (failed) console.error(`[events] ${event.id}: ${error}`);
      else {
        failed = true;
        first = error;
      }
    }
  }
  if (failed) throw first;
}

/**
 * Registers a handler for one id, several ids or every realm: event ("*"). Returns the handler, for offScriptEvent.
 * @template {ScriptEventHandler} H
 * @param {string | readonly string[]} ids
 * @param {H} fn
 * @returns {H}
 */
export function onScriptEvent(ids, fn) {
  if (typeof fn !== "function") throw new TypeError("onScriptEvent: the handler must be a function");
  const wanted = typeof ids === "string" ? [ids] : [...ids];
  if (!wanted.length) throw new TypeError("onScriptEvent: no ids");
  for (const id of wanted) {
    if (typeof id !== "string" || (id !== "*" && !(id.startsWith(`${NAMESPACE}:`) && id.length > NAMESPACE.length + 1))) throw new TypeError(`onScriptEvent: "${id}" is not a ${NAMESPACE}: script event id (or "*")`);
  }
  if (!listening) {
    system.afterEvents.scriptEventReceive.subscribe(scriptEvents, { namespaces: [NAMESPACE] });
    listening = true;
  }
  const entry = { seq: ++seq, fn };
  for (const id of new Set(wanted)) {
    if (id === "*") anyId = [...anyId, entry];
    else byId.set(id, [...(byId.get(id) ?? NONE), entry]);
  }
  return fn;
}

/**
 * Removes a handler from every id it was registered for. The last one also unsubscribes the native listener (a later
 * onScriptEvent subscribes again). Returns whether it was registered.
 * @param {ScriptEventHandler} fn
 */
export function offScriptEvent(fn) {
  let removed = false;
  /** @param {readonly Entry[]} list */
  const without = (list) => {
    const next = list.filter((entry) => entry.fn !== fn);
    if (next.length !== list.length) removed = true;
    return next;
  };
  anyId = without(anyId);
  for (const [id, list] of byId) {
    const next = without(list);
    if (next.length) byId.set(id, next);
    else byId.delete(id);
  }
  if (listening && !anyId.length && !byId.size) {
    system.afterEvents.scriptEventReceive.unsubscribe(scriptEvents);
    listening = false;
  }
  return removed;
}
