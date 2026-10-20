// The side boxes protocol (tools/side-shared.js) run offline in several packs at once, each in its own context like
// the separate packs of a test run, with one clock and one script event bus (an event reaches every pack, the
// sender included, the next tick). It pins the compositor claim (W1/O1): the minimap draws the titles of the
// players it shows something to, with every pack's slots, and never broadcasts its own 1.3 KB radar, so the other
// packs' listeners stop waking (and parsing) on every minimap draw; and the lazy read: another pack's message is
// parsed only when a copy draws that player.
//   node --test tools/side-compositor.test.mjs
// SIDE_SHARED=<file> runs the same tests against another version of the file (the before-proof).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const FILE = process.env.SIDE_SHARED ?? new URL("./side-shared.js", import.meta.url);
const SOURCE = readFileSync(FILE, "utf8").replace(/^import .*$/gm, "").replace(/^export /gm, "");
const MARK = "§s§2§r";

/** One server: a clock, players and the script event bus, with the side protocol loaded in each pack. */
function server() {
  let tick = 0;
  /** @type {{ id: string, message: string }[]} */
  const queued = [];
  /** @type {{ tick: number, id: string, message: string, from: string }[]} */
  const sent = [];
  /** @type {any[]} */
  const packs = [];
  /** @type {any[]} */
  const players = [];
  const srv = {
    get tick() {
      return tick;
    },
    sent,
    packs,
    players,
    join(id) {
      const p = { id, titles: [], onScreenDisplay: { setTitle: (title, o) => p.titles.push({ tick, by: srv.drawing, title, sub: o?.subtitle, stay: o?.stayDuration }) } };
      players.push(p);
      return p;
    },
    /** Loads side-shared.js as pack `name`. */
    pack(name, options) {
      /** @type {{ ids: string[], cb: Function }[]} */
      const listeners = [];
      /** @type {{ every: number, fn: Function, at: number }[]} */
      const timers = [];
      const parses = { n: 0 };
      const json = { parse: (s) => (parses.n++, JSON.parse(s)), stringify: (v) => JSON.stringify(v) };
      const context = {
        JSON: json,
        Player: class {},
        system: {
          get currentTick() {
            return tick;
          },
          sendScriptEvent(id, message) {
            sent.push({ tick, id, message, from: name });
            queued.push({ id, message });
          },
          runInterval(fn, every) {
            timers.push({ fn, every, at: tick + every });
          },
        },
        world: { afterEvents: { playerLeave: { subscribe() {} } }, getAllPlayers: () => [...players] },
        onScriptEvent(ids, cb) {
          listeners.push({ ids: Array.isArray(ids) ? ids : [ids], cb });
        },
      };
      const api = vm.runInNewContext(`${SOURCE}\n;sideBoxes(${JSON.stringify(name)}, ${JSON.stringify(options ?? {})})`, context);
      const pack = { name, api, listeners, timers, parses, context };
      // Every call into the pack is attributed to it (titles record who drew them).
      for (const k of Object.keys(api)) {
        const f = api[k];
        api[k] = (...a) => {
          srv.drawing = name;
          try {
            return f(...a);
          } finally {
            srv.drawing = undefined;
          }
        };
      }
      packs.push(pack);
      return pack;
    },
    drawing: /** @type {string | undefined} */ (undefined),
    step(n = 1) {
      for (let i = 0; i < n; i++) {
        tick++;
        for (const e of queued.splice(0)) {
          for (const pack of packs) {
            if (pack.off) continue;
            for (const l of pack.listeners) {
              if (!l.ids.includes(e.id)) continue;
              srv.drawing = pack.name;
              l.cb({ id: e.id, message: e.message });
              srv.drawing = undefined;
            }
          }
        }
        for (const pack of packs) {
          if (pack.off) continue;
          for (const t of pack.timers) {
            if (t.at > tick) continue;
            t.at = tick + t.every;
            srv.drawing = pack.name;
            t.fn();
            srv.drawing = undefined;
          }
        }
      }
    },
  };
  return srv;
}

const RADAR = "\u{F301}".repeat(400) + "§r";
/** Slot k's text in a subtitle, the way hud_rp cuts it (UTF-8 bytes), with the filler removed. */
function cut(sub, k) {
  const b = Buffer.from(sub ?? "", "utf8");
  const skip = Buffer.byteLength(MARK) + (k <= 10 ? 160 * k : 160 * 10 + 1352) + 1;
  const len = k === 10 ? 1351 : k === 11 ? 511 : 159;
  return b.subarray(skip, skip + len).toString("utf8").replace(/~/g, "").replace(/§r/g, "");
}
const SLOT = { right1: 0, left1: 4, top: 9, radar: 10 };

test("without a compositor every pack still draws the whole picture (unchanged protocol)", () => {
  const s = server();
  const a = s.pack("hud");
  const b = s.pack("mobhp");
  const p = s.join("100");
  a.api.show(p, "right1", "§fX 1 Z 2", 140);
  s.step(1);
  b.api.show(p, "left1", "§cZombie 10/20", 60);
  const last = p.titles.at(-1);
  assert.equal(last.by, "mobhp");
  assert.equal(cut(last.sub, SLOT.right1), "§fX 1 Z 2");
  assert.equal(cut(last.sub, SLOT.left1), "§cZombie 10/20");
  assert.equal(s.sent.filter((e) => e.id === "realm:side").length, 2);
});

test("the minimap composes: no realm:side for its parts, the other packs' slots in its title", () => {
  const s = server();
  const map = s.pack("map", { compositor: true });
  const hud = s.pack("hud");
  const mob = s.pack("mobhp");
  const p = s.join("100");
  hud.api.show(p, "right1", "§fX 1 Z 2", 140);
  s.step(2);
  // 40 draws of the compass and the radar, one a tick.
  for (let i = 0; i < 40; i++) {
    map.api.show(p, "top", `strip ${i}`, 40, "", false);
    map.api.show(p, "radar", RADAR + i, 40, "radar", false);
    map.api.redraw(p);
    s.step(1);
  }
  const mapSides = s.sent.filter((e) => e.id === "realm:side" && e.from === "map");
  assert.equal(mapSides.length, 0, "the minimap never broadcasts its own readouts");
  const claims = s.sent.filter((e) => e.id === "realm:side_comp" && e.from === "map");
  assert.ok(claims.length >= 1 && claims.length <= 3, `a claim and its renewals (${claims.length})`);
  assert.ok(claims.every((e) => e.message.length < 2048));
  // The others read nothing of it.
  assert.equal(hud.parses.n + mob.parses.n <= 2 * claims.length, true, `others parsed ${hud.parses.n + mob.parses.n} messages`);
  const last = p.titles.at(-1);
  assert.equal(last.by, "map");
  assert.equal(cut(last.sub, SLOT.right1), "§fX 1 Z 2", "the Coordinates HUD's box is in the minimap's title");
  assert.equal(cut(last.sub, SLOT.top), "strip 39");
  // While the claim lasts, a change in another pack's box is drawn by the minimap, not by that pack.
  const before = p.titles.length;
  mob.api.show(p, "left1", "§cZombie 10/20", 60);
  assert.equal(p.titles.length, before, "mobhp doesn't draw over the minimap's title");
  s.step(1);
  const drawn = p.titles.at(-1);
  assert.equal(drawn.by, "map", "the minimap draws it the next tick");
  assert.equal(cut(drawn.sub, SLOT.left1), "§cZombie 10/20");
  assert.equal(cut(drawn.sub, SLOT.radar).length > 300, true, "with the radar");
  assert.equal(cut(drawn.sub, SLOT.right1), "§fX 1 Z 2");
  // The same readout sent again (a keep-alive) changes nothing: no extra title.
  const n = p.titles.length;
  mob.api.show(p, "left1", "§cZombie 10/20", 60);
  s.step(1);
  assert.equal(p.titles.length, n, "a resend of the same text draws nothing");
  // Taken off: the minimap redraws without it.
  mob.api.clear(p);
  s.step(1);
  assert.equal(cut(p.titles.at(-1).sub, SLOT.left1), "");
  assert.equal(p.titles.at(-1).by, "map");
});

test("the minimap gives the title back when it has nothing left, and the others draw again", () => {
  const s = server();
  const map = s.pack("map", { compositor: true });
  const hud = s.pack("hud");
  const p = s.join("100");
  hud.api.show(p, "right1", "§fX 1 Z 2", 600);
  s.step(1);
  map.api.show(p, "top", "strip", 40, "", false);
  map.api.show(p, "radar", RADAR, 40, "radar", false);
  map.api.redraw(p);
  s.step(2);
  map.api.clear(p, "", false);
  map.api.clear(p, "radar", false);
  map.api.redraw(p);
  const last = p.titles.at(-1);
  assert.equal(last.by, "map");
  assert.equal(cut(last.sub, SLOT.right1), "§fX 1 Z 2", "its last title keeps the other boxes");
  assert.equal(cut(last.sub, SLOT.radar), "", "without the radar");
  assert.ok(s.sent.some((e) => e.id === "realm:side_comp" && JSON.parse(e.message).ticks === 0), "the claim ends");
  s.step(1);
  hud.api.show(p, "right1", "§fX 5 Z 6", 600);
  assert.equal(p.titles.at(-1).by, "hud", "the Coordinates HUD draws its own box again");
  assert.equal(cut(p.titles.at(-1).sub, SLOT.right1), "§fX 5 Z 6");
});

test("a claim that is not renewed runs out and the others draw their boxes again", () => {
  const s = server();
  const map = s.pack("map", { compositor: true });
  const hud = s.pack("hud");
  const p = s.join("100");
  map.api.show(p, "top", "strip", 1200, "", false);
  map.api.redraw(p);
  s.step(2);
  hud.api.show(p, "right1", "§fX 1 Z 2", 600);
  s.step(1);
  assert.equal(p.titles.at(-1).by, "map");
  // The minimap stops (its script is gone): no renewals.
  map.off = true;
  s.step(110);
  const own = p.titles.filter((t) => t.by === "hud");
  assert.ok(own.length >= 1, "hud drew its box again once the claim ran out");
  assert.equal(cut(own.at(-1).sub, SLOT.right1), "§fX 1 Z 2");
});

test("another pack's message is read only when a copy draws that player", () => {
  const s = server();
  const a = s.pack("calendar");
  const b = s.pack("elytra");
  const p = s.join("100");
  for (let i = 0; i < 50; i++) {
    a.api.show(p, "left1", `§cSiege ${i}`, 40);
    s.step(1);
  }
  assert.equal(b.parses.n, 0, `elytra parsed ${b.parses.n} of calendar's 50 messages without drawing`);
  // When it draws, it has calendar's latest readout.
  b.api.show(p, "right2", "§fSpeed 30", 20);
  const last = p.titles.at(-1);
  assert.equal(last.by, "elytra");
  assert.equal(cut(last.sub, SLOT.left1), "§cSiege 49");
  assert.ok(b.parses.n <= 2, `then read once (${b.parses.n})`);
});

test("a compositor's keep-alive reuses its title: no message and no new subtitle", () => {
  const s = server();
  const map = s.pack("map", { compositor: true });
  s.pack("hud");
  const p = s.join("100");
  map.api.show(p, "top", "strip", 40, "", false);
  map.api.show(p, "radar", RADAR, 40, "radar", false);
  map.api.redraw(p);
  s.step(30);
  const sides = s.sent.filter((e) => e.id === "realm:side").length;
  const first = p.titles.at(-1);
  map.api.keep(p, 40);
  const again = p.titles.at(-1);
  assert.notEqual(again, first, "drawn again");
  assert.equal(again.sub, first.sub, "the same subtitle");
  assert.equal(again.stay, 42, "staying 40 more ticks");
  assert.equal(s.sent.filter((e) => e.id === "realm:side").length, sides, "no realm:side");
});

test("a keep-alive that names its parts keeps nothing when one of them ran out, so the caller shows it again", () => {
  const s = server();
  const map = s.pack("map", { compositor: true });
  s.pack("hud");
  const p = s.join("100");
  // The strip is sent at 0 (up until 40), the radar at 15 (until 55); a real title holds the screen in between.
  map.api.show(p, "top", "strip", 40, "", false);
  map.api.redraw(p);
  s.step(15);
  map.api.show(p, "radar", RADAR, 40, "radar", false);
  map.api.redraw(p);
  s.step(35);
  // Tick 50: the strip ran out, the radar is still up.
  const titles = p.titles.length;
  assert.equal(map.api.keep(p, 40, ["", "radar"]), false, "not kept: the strip is gone");
  assert.equal(p.titles.length, titles, "nothing drawn");
  s.step(6);
  // Tick 56: the radar ran out too, so it was not extended by the refused keep.
  assert.equal(map.api.keep(p, 40, ["radar"]), false, "the radar was not kept either");
  // Shown again, both are in the title and a keep naming both now holds.
  map.api.show(p, "top", "strip", 40, "", false);
  map.api.show(p, "radar", RADAR, 40, "radar", false);
  map.api.redraw(p);
  assert.equal(map.api.keep(p, 40, ["", "radar"]), true, "both up: kept");
  assert.equal(cut(p.titles.at(-1).sub, SLOT.top), "strip", "the strip is back");
});

test("realm:side traffic per tick with a minimap drawing 40 players", () => {
  const s = server();
  const map = s.pack("map", { compositor: true });
  const others = ["hud", "saga", "elytra", "calendar", "maps", "mobhp"].map((n) => s.pack(n));
  const players = Array.from({ length: 40 }, (_, i) => s.join(String(-4294967295 + i)));
  let warm = 0;
  for (let t = 0; t < 250; t++) {
    // The first draw of each player claims them (one message each): count the steady 200 ticks after.
    if (t === 50) {
      warm = s.sent.length;
      for (const o of others) o.parses.n = 0;
    }
    // Eight draws a tick, like the per-tick redraw's TURN_BUDGET.
    for (let k = 0; k < 8; k++) {
      const p = players[(t * 8 + k) % players.length];
      map.api.show(p, "top", `strip ${t}`, 40, "", false);
      map.api.show(p, "radar", RADAR + t, 40, "radar", false);
      map.api.redraw(p);
    }
    s.step(1);
  }
  const events = s.sent.slice(warm).filter((e) => e.id.startsWith("realm:")).length / 200;
  assert.ok(events < 0.5, `realm: events per tick ${events.toFixed(2)} (2 per draw before)`);
  const parsed = others.reduce((n, o) => n + o.parses.n, 0) / 200 / others.length;
  assert.ok(parsed < 0.1, `each other pack parses ${parsed.toFixed(2)} messages a tick`);
  assert.ok(s.sent.filter((e) => e.id === "realm:side_comp").every((e) => e.message.length < 2048), "every claim message under 2048");
});
