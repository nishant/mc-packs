// Test hook for tools/test-bds/examples/claims-animals.js and claims-own-pet.js: copies claims_bp and adds a
// harness-only probe that hands claims_bp's own tap handlers a tap the way a real player's would arrive. A simulated player's interactWithEntity never
// fires world.beforeEvents.playerInteractWithEntity (only the after event and the game's own handling: the wheat is
// eaten, the sheep sheared), and its useItemInSlotOnBlock fires playerInteractWithBlock with isFirstEvent false, so
// the pack never says "This land is claimed by ..." to it. Neither can be tested natively without this.
// The probe records every handler main.js subscribes to those two before events (it is imported right after diag.js,
// before main.js subscribes) and, on request, calls each with an event object carrying the real player, the real
// entity or block, the held item and isFirstEvent true, and reports whether a handler canceled it. The handlers run
// on the real world, claims and settings; only the event object is made up. It uses nothing of the protection code,
// so the same recipe runs the code from before it (the second argument, e.g. 4dc2433^).
// scripts/harness_claims_taps.js answers the console-only script event `harness:claims_tap`
// { id, kind: "entity" | "block", player, entity?, block?: { x, y, z }, face?, item? } with
// `harness:claims_tap_report` { id, handlers, cancel, error? }.
//   node tools/test-bds/hooks/claims-taps.mjs <out dir> [source repository]
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [out, from] = process.argv.slice(2);
if (!out) throw new Error("usage: claims-taps.mjs <out dir> [source repository]");
const root = from ? resolve(from) : join(import.meta.dirname, "..", "..", "..");
if (existsSync(out)) throw new Error(`fixture output already exists: ${out}`);
mkdirSync(out, { recursive: true });
cpSync(join(root, "packs", "claims_bp"), join(out, "claims_bp"), { recursive: true });
writeFileSync(
  join(out, "claims_bp", "scripts", "harness_claims_taps.js"),
  `// Harness only (tools/test-bds/hooks/claims-taps.mjs); never shipped.
import { Direction, ItemStack, ScriptEventSource, system, world } from "@minecraft/server";

/** @type {Record<string, Function[]>} */
const handlers = { entity: [], block: [] };
// On the signal objects themselves, like diag.js wraps them (it replaces each signal's own subscribe, so a patch on the
// prototype would never be called): this wraps diag.js's wrapper and records what main.js hands it.
for (const [kind, name] of [["entity", "playerInteractWithEntity"], ["block", "playerInteractWithBlock"]]) {
  try {
    const sig = world.beforeEvents[name];
    const subscribe = sig.subscribe;
    sig.subscribe = function (callback, ...rest) {
      handlers[kind].push(callback);
      return subscribe.call(this, callback, ...rest);
    };
  } catch (e) {
    console.warn("[claims-taps] could not record the " + kind + " tap handlers: " + e);
  }
}

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message, sourceType }) => {
    if (id !== "harness:claims_tap" || sourceType !== ScriptEventSource.Server) return;
    let req;
    const report = (r) => system.sendScriptEvent("harness:claims_tap_report", JSON.stringify({ id: req?.id, ...r }));
    try {
      req = JSON.parse(message);
      const player = world.getAllPlayers().find((p) => p.name === req.player);
      if (!player) return report({ error: "no player " + req.player });
      const itemStack = req.item ? new ItemStack(req.item, 1) : undefined;
      /** @type {any} */
      let event;
      if (req.kind === "entity") {
        const target = world.getEntity(req.entity);
        if (!target) return report({ error: "no entity " + req.entity });
        event = { player, target, itemStack, cancel: false };
      } else {
        const block = player.dimension.getBlock(req.block);
        if (!block) return report({ error: "no block at " + JSON.stringify(req.block) });
        const face = req.face ?? Direction.Up;
        event = { player, block, blockFace: face, faceLocation: { x: 0.5, y: 1, z: 0.5 }, isFirstEvent: true, itemStack, cancel: false };
      }
      const list = handlers[req.kind] ?? [];
      for (const h of list) {
        h(event); // every handler, like Bedrock does within one pack (a later one sees event.cancel already set)
      }
      report({ handlers: list.length, cancel: event.cancel === true });
    } catch (e) {
      report({ error: String(e) });
    }
  },
  { namespaces: ["harness"] },
);
`,
);
const mainFile = join(out, "claims_bp", "scripts", "main.js");
const lines = readFileSync(mainFile, "utf8").split("\n");
const diag = lines.findIndex((l) => /^import\s+["']\.\/diag\.js["'];?\s*$/.test(l));
lines.splice(diag + 1, 0, 'import "./harness_claims_taps.js";');
writeFileSync(mainFile, lines.join("\n"));
console.log(`wrote ${out} (claims_bp with the tap probe${from ? `, from ${root}` : ""})`);
