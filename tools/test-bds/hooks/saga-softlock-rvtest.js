
// ---------------------------------------------------------------------------
// Test hook (tools/test-bds/hooks/saga-softlock-rvtest.js), appended to a TEST COPY of saga_bp/scripts/objectives.js by
// tools/test-bds/hooks/stage-saga-softlock.mjs for tools/test-bds/examples/saga-graveyard-softlock.js; never shipped.
// It reaches the module's own handlers and state, which other packs and the harness can't:
//   sgs:ping                  -> sgs:pong {cancel}   (cancel: this copy has cancelInteractions, the fixed source)
//   sgs:state {name,id,seq}   -> sgs:state_r {...}   (busy lock, health, dimension, inspect bits, progress, clue spots, and
//                                what the server itself fired: its own subscriptions, not the pack's)
//   sgs:tap {name,x,y,z}      -> the real touchedAt handler of playerInteractWithBlock (empty-hand taps of simulated
//                                players fire no interact event, so the scenario calls the handler directly)
//   sgs:cancel {name|id}      -> the pack's cancel function: a SYNTHETIC lifecycle notification (the source before the fix
//                                only has the leave handler's busy.delete)
//   sgs:hold {name,key}       -> a production exclusive + show of a form; sgs:hold_done {key,result} when it ends
//   sgs:holdraw {name,key}    -> a production exclusive around a promise sgs:release {key} settles later (an old operation
//                                whose finally runs after a newer one took the lock)
import { ActionFormData as SgsForm } from "@minecraft/server-ui";
import { system as sgsSystem, world as sgsWorld } from "@minecraft/server";

/** What the server really fired (counted by this hook's own subscriptions). */
const sgsNative = { die: 0, respawn: 0, dimension: 0, leave: 0 };
sgsWorld.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (deadEntity instanceof Player) sgsNative.die++;
});
sgsWorld.afterEvents.playerSpawn.subscribe(({ initialSpawn }) => {
  if (!initialSpawn) sgsNative.respawn++;
});
sgsWorld.afterEvents.playerDimensionChange.subscribe(() => sgsNative.dimension++);
sgsWorld.afterEvents.playerLeave.subscribe(() => sgsNative.leave++);

/** Players the hook has seen, by id (a dead player may be missing from getAllPlayers). @type {Map<string, Player>} */
const sgsSeen = new Map();
/** Settles for the raw holds, by key. @type {Map<string, () => void>} */
const sgsHolds = new Map();
const sgsCancel = typeof cancelInteractions === "function" ? cancelInteractions : (/** @type {string} */ id) => void busy.delete(id);

/** @param {string} id @param {object} msg */
const sgsOut = (id, msg) => sgsSystem.sendScriptEvent(id, JSON.stringify(msg));

/** @param {{ name?: string, id?: string }} m */
function sgsFind(m) {
  const live = sgsWorld.getAllPlayers().find((p) => p.name === m.name || p.id === m.id);
  if (live) sgsSeen.set(live.id, live);
  const seen = m.id ? sgsSeen.get(m.id) : [...sgsSeen.values()].find((p) => p.isValid && p.name === m.name);
  return live ?? (seen?.isValid ? seen : undefined);
}

/** @param {any} m */
function sgsState(m) {
  const p = sgsFind(m);
  /** @type {any} */
  const out = { seq: m.seq, name: m.name, id: m.id, found: !!p, native: { ...sgsNative } };
  if (!p) {
    out.busy = m.id ? busy.has(m.id) : undefined;
  } else {
    out.id = p.id;
    out.valid = p.isValid;
    out.busy = busy.has(p.id);
    if (p.isValid) {
      out.health = p.getComponent("minecraft:health")?.currentValue;
      out.dim = p.dimension.id;
      const hit = open(p, "inspect")[0];
      const sc = hit ? scenes.get(sk(p.id, objKey(hit.e, hit.i))) : undefined;
      if (hit) {
        out.chapter = `${hit.e.story.id}/${hit.e.chapter.id}`;
        out.bits = hit.e.st.x?.[String(hit.i)] ?? 0;
        out.progress = hit.e.st.o?.[hit.i] ?? 0;
        out.spots = sc?.data?.spots;
      }
    }
  }
  sgsOut("sgs:state_r", out);
}

/** @param {any} res */
const sgsResult = (res) => (res === undefined ? "undefined" : res.canceled ? `canceled:${res.cancelationReason}` : `selection:${res.selection}`);

sgsSystem.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    try {
      const m = message ? JSON.parse(message) : {};
      if (id === "sgs:ping") sgsOut("sgs:pong", { cancel: typeof cancelInteractions === "function" });
      else if (id === "sgs:state") sgsState(m);
      else if (id === "sgs:tap") {
        const p = sgsFind(m);
        if (p) touchedAt(p, m.type ?? "minecraft:dirt", p.dimension.id, { x: m.x, y: m.y, z: m.z });
      } else if (id === "sgs:cancel") {
        const pid = m.id ?? sgsFind(m)?.id;
        if (pid) sgsCancel(pid);
      } else if (id === "sgs:hold") {
        const p = sgsFind(m);
        if (!p) return;
        exclusive(p, async () => {
          const res = await show(p, new SgsForm().title("sgs hold").body("lifecycle probe").button("OK"));
          sgsOut("sgs:hold_done", { key: m.key, result: sgsResult(res) });
        })
          .then((ran) => {
            if (!ran) sgsOut("sgs:hold_done", { key: m.key, result: "not-started" });
          })
          .catch((e) => console.warn(`[sgs] hold: ${e}`));
      } else if (id === "sgs:holdraw") {
        const p = sgsFind(m);
        if (!p) return;
        exclusive(p, () => new Promise((resolve) => sgsHolds.set(m.key, () => resolve(undefined))))
          .then((ran) => sgsOut("sgs:holdraw_done", { key: m.key, ran }))
          .catch((e) => console.warn(`[sgs] holdraw: ${e}`));
      } else if (id === "sgs:release") sgsHolds.get(m.key)?.();
    } catch (e) {
      console.warn(`[sgs] hook: ${e}`);
    }
  },
  { namespaces: ["sgs"] },
);
