// BDS harness shim. Injected (in the run's temp copy only) in front of every behavior pack's
// script entry. It never runs on a real server. What it does:
//  1. imports @minecraft/server-gametest, without which simulated players are invisible to this
//     pack (events give `undefined`, getAllPlayers() returns [undefined]);
//  2. relays Player.sendMessage / World.sendMessage / title and action bar text to the harness
//     test pack (script event "harness:relay"), so scenarios can read what players are told;
//  3. answers forms shown to simulated players (they cannot click): the form is described to the
//     harness, which replies with the scenario's answer or a cancel.
// The PACK, HAS_UI and UI import lines are filled in when the shim is generated.
import { world, system, Player, World, ScreenDisplay } from "@minecraft/server";
import { SimulatedPlayer } from "@minecraft/server-gametest";
__UI_IMPORT__

const PACK = __PACK__;
const HAS_UI = __HAS_UI__;
const RELAY = __RELAY__; // false with run.mjs --no-relay: messages are not relayed (forms still are)
const MAX = 1800;
let seq = 0;

function textOf(m) {
  if (m === undefined || m === null) return "";
  if (typeof m === "string") return m;
  if (Array.isArray(m)) return m.map(textOf).join("");
  if (typeof m === "object") {
    let s = "";
    if (typeof m.text === "string") s += m.text;
    if (typeof m.translate === "string") {
      const w = m.with;
      const args = Array.isArray(w) ? w.map(textOf) : w && Array.isArray(w.rawtext) ? w.rawtext.map(textOf) : [];
      s += "%" + m.translate + (args.length ? "(" + args.join(", ") + ")" : "");
    }
    if (m.score) s += "{score " + (m.score.name || "") + ":" + (m.score.objective || "") + "}";
    if (Array.isArray(m.rawtext)) s += m.rawtext.map(textOf).join("");
    return s;
  }
  return String(m);
}

function safeJson(v) {
  try {
    return JSON.stringify(v, (k, x) => (typeof x === "bigint" ? String(x) : typeof x === "function" ? undefined : x));
  } catch (e) {
    return JSON.stringify(String(v));
  }
}

function sendNow(id, payload) {
  // Script event messages are limited to 2048 characters: split into parts.
  const s = safeJson(payload);
  const key = PACK + ":" + ++seq;
  const n = Math.max(1, Math.ceil(s.length / MAX));
  for (let i = 0; i < n; i++) {
    system.sendScriptEvent(id, safeJson({ k: key, i, n, d: s.slice(i * MAX, (i + 1) * MAX) }));
  }
}

function relay(payload) {
  try {
    sendNow("harness:relay", payload);
  } catch (e) {
    // Restricted context (a before-event): send on the next tick instead.
    system.run(() => {
      try { sendNow("harness:relay", payload); } catch (e2) { /* give up quietly */ }
    });
  }
}

function nameOf(p) {
  try { return p.name; } catch (e) { return "?"; }
}

function patch(proto, method, kind, toFn) {
  if (!RELAY) return;
  const orig = proto && proto[method];
  if (typeof orig !== "function") return;
  try {
    proto[method] = function (...args) {
      const r = orig.apply(this, args);
      try {
        relay({ type: "msg", kind, pack: PACK, to: toFn(this), text: textOf(args[0]), raw: typeof args[0] === "string" ? undefined : args[0], sub: args.length > 1 && method === "setTitle" ? args[1] : undefined });
      } catch (e) { /* never break the pack */ }
      return r;
    };
  } catch (e) {
    console.warn("[harness-shim] could not patch " + method + ": " + e);
  }
}

patch(Player.prototype, "sendMessage", "chat", (p) => nameOf(p));
patch(World.prototype, "sendMessage", "broadcast", () => "*");
// ScreenDisplay has no player property: remember which player each one came from.
const screenOwner = new WeakMap();
try {
  const desc = Object.getOwnPropertyDescriptor(Player.prototype, "onScreenDisplay");
  if (RELAY && desc && desc.get) {
    Object.defineProperty(Player.prototype, "onScreenDisplay", {
      configurable: true,
      get() {
        const sd = desc.get.call(this);
        try { if (sd && typeof sd === "object") screenOwner.set(sd, nameOf(this)); } catch (e) { /* ignore */ }
        return sd;
      },
    });
  }
} catch (e) { /* ignore */ }
if (ScreenDisplay) {
  patch(ScreenDisplay.prototype, "setActionBar", "actionbar", (sd) => screenOwner.get(sd) || "?");
  patch(ScreenDisplay.prototype, "setTitle", "title", (sd) => screenOwner.get(sd) || "?");
  patch(ScreenDisplay.prototype, "updateSubtitle", "subtitle", (sd) => screenOwner.get(sd) || "?");
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

const pending = new Map(); // form id -> resolve

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== "harness:form_reply") return;
  let msg;
  try { msg = JSON.parse(ev.message); } catch (e) { return; }
  if (!msg || msg.pack !== PACK) return;
  const res = pending.get(msg.id);
  if (!res) return;
  pending.delete(msg.id);
  res(msg.response);
});

function isSimulated(p) {
  try { return p instanceof SimulatedPlayer; } catch (e) { return false; }
}

function wrapForm(Cls, type) {
  if (!Cls || !Cls.prototype) return;
  const proto = Cls.prototype;
  const calls = new WeakMap();
  for (const m of Object.getOwnPropertyNames(proto)) {
    if (m === "constructor" || m === "show") continue;
    const orig = proto[m];
    if (typeof orig !== "function") continue;
    try {
      proto[m] = function (...args) {
        let list = calls.get(this);
        if (!list) calls.set(this, (list = []));
        list.push([m, args]);
        return orig.apply(this, args);
      };
    } catch (e) { /* ignore */ }
  }
  const origShow = proto.show;
  proto.show = function (player) {
    if (!isSimulated(player)) return origShow.call(this, player);
    const id = PACK + "#" + ++seq;
    const list = (calls.get(this) || []).map(([m, args]) => ({ m, args: args.map((a) => (typeof a === "object" && a !== null ? JSON.parse(safeJson(a)) : a)) }));
    return new Promise((resolve) => {
      pending.set(id, (response) => {
        // JSON turned the undefined entries (labels, headers, dividers) into null.
        if (response && Array.isArray(response.formValues)) response.formValues = response.formValues.map((v) => (v === null ? undefined : v));
        resolve(response);
      });
      relay({ type: "form", pack: PACK, id, form: type, player: nameOf(player), calls: list });
      // Never hang a pack forever if the harness does not answer.
      system.runTimeout(() => {
        if (pending.has(id)) { pending.delete(id); resolve({ canceled: true, cancelationReason: "UserClosed" }); }
      }, 1200);
    });
  };
}

if (HAS_UI) {
  wrapForm(ui.ActionFormData, "action");
  wrapForm(ui.ModalFormData, "modal");
  wrapForm(ui.MessageFormData, "message");
}
