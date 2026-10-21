// Test copy of expedition_bp for examples/expedition-carts-window.js (O19), never shipped. Usage:
//   node tools/test-bds/hooks/expedition-carts-window.mjs <new output directory> [source repository]
// A simulated player comes back with a new id, and a pack's player properties can't be read from the test add-on, so
// the copy carries a hook (script events exptest:*, from the console or the test pack only) that does what a real
// player keeping their id would get for free:
//   exptest:stash {name, x, y, z}  saveStash for that player, its pocket at x y z -> exptest:ok {name, ok}
//   exptest:restore name           restoreStash -> exptest:restored {name, done}
//   exptest:adopt name             the stash record the old player had (mirrored, by name) goes on this player
// and announces every put-down of a stored record's structure: exptest:placed <cart tag>. The pack's own code is
// otherwise unchanged; each patch is checked to apply exactly once, so a moved line fails the staging, not the test.
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [out, from] = process.argv.slice(2);
if (!out) throw new Error("usage: expedition-carts-window.mjs <new output directory> [source repository]");
const root = from ? resolve(from) : join(import.meta.dirname, "..", "..", "..");
if (existsSync(join(out, "expedition_bp"))) throw new Error(`fixture output already exists: ${out}/expedition_bp`);
mkdirSync(out, { recursive: true });
cpSync(join(root, "packs", "expedition_bp"), join(out, "expedition_bp"), { recursive: true });
const file = join(out, "expedition_bp", "scripts", "gauntlet.js");
let src = readFileSync(file, "utf8");

/** @param {string} a @param {string} b */
function patch(a, b) {
  const n = src.split(a).length - 1;
  if (n !== 1) throw new Error(`patch target found ${n} times, expected once: ${a}`);
  src = src.replace(a, b);
}
// Every put-down of a stored record's structure is announced.
patch("      placeCarts(rec.id, dim, at);\n", '      placeCarts(rec.id, dim, at);\n      system.sendScriptEvent("exptest:placed", rec.tag);\n');
// The stash record, mirrored by player name in the world on every save (the player's own copy dies with a simulated player).
patch(
  "(r) => p.setDynamicProperty(STASH_PROP, JSON.stringify(r))",
  '(r) => (p.setDynamicProperty(STASH_PROP, JSON.stringify(r)), world.setDynamicProperty("exptest:last:" + p.name, JSON.stringify(r)))',
);
writeFileSync(file, src);

appendFileSync(
  file,
  `
// ---------------------------------------------------------------------------
// Test hook (tools/test-bds/hooks/expedition-carts-window.mjs): never shipped.
import { ScriptEventSource as ExpTestSource } from "@minecraft/server";
system.afterEvents.scriptEventReceive.subscribe(
  (ev) => {
    if (ev.sourceType !== ExpTestSource.Server && ev.sourceType !== ExpTestSource.Entity) return;
    try {
      const reply = (id, v) => system.sendScriptEvent(id, JSON.stringify(v));
      if (ev.id === "exptest:stash") {
        const m = JSON.parse(ev.message);
        const p = world.getAllPlayers().find((x) => x.name === m.name);
        const ok = !!p && saveStash(p, p.dimension, { x: m.x, y: m.y, z: m.z });
        if (ok) world.setDynamicProperty("exptest:last:" + m.name, JSON.stringify(stashOf(p)));
        reply("exptest:ok", { name: m.name, ok });
      } else if (ev.id === "exptest:restore") {
        const p = world.getAllPlayers().find((x) => x.name === ev.message);
        if (!p) return reply("exptest:restored", { name: ev.message, done: false, error: "no player" });
        restoreStash(p).then(
          (done) => {
            if (done) world.setDynamicProperty("exptest:last:" + ev.message, undefined); // finished: nothing to adopt
            reply("exptest:restored", { name: ev.message, done });
          },
          (e) => reply("exptest:restored", { name: ev.message, done: false, error: String(e).slice(0, 200) }),
        );
      } else if (ev.id === "exptest:adopt") {
        const p = world.getAllPlayers().find((x) => x.name === ev.message);
        const raw = world.getDynamicProperty("exptest:last:" + ev.message);
        if (p && typeof raw === "string" && raw !== "null") p.setDynamicProperty(STASH_PROP, raw);
        reply("exptest:adopted", { name: ev.message, rec: typeof raw === "string" ? JSON.parse(raw) : null });
      }
    } catch (e) {
      console.warn("[exptest] " + e);
    }
  },
  { namespaces: ["exptest"] },
);
`,
);
console.log(`wrote ${out}/expedition_bp (O19 cart window test copy)`);
