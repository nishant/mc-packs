
// ---------------------------------------------------------------------------
// Test hook (tools/test-bds/hooks/maps-rvtest.js), appended to a TEST COPY of maps_bp/scripts/main.js by the
// header recipe of maps-cleanup.js and maps-leave.js; never shipped. Packs can't read each other's dynamic
// properties, so the scenario asks this hook:
//   rvtest:get <name>         -> rvtest:hunts {name, hunts}
//   rvtest:set {name, hunts}  -> saves them (and drops the cache) -> rvtest:ok <name>
//   rvtest:undo               -> rvtest:undo_r <record> for each id in maps:undo, then rvtest:undo_end
import { system as rvSystem, world as rvWorld } from "@minecraft/server";

rvSystem.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    try {
      if (id === "rvtest:get") {
        const p = rvWorld.getAllPlayers().find((x) => x.name === message);
        rvSystem.sendScriptEvent("rvtest:hunts", JSON.stringify({ name: message, hunts: p ? huntsOf(p) : null }));
      } else if (id === "rvtest:set") {
        const m = JSON.parse(message);
        const p = rvWorld.getAllPlayers().find((x) => x.name === m.name);
        if (!p) return;
        cache.delete(p.id);
        p.setDynamicProperty(PROP_HUNTS, m.hunts && m.hunts.length ? JSON.stringify(m.hunts) : undefined);
        rvSystem.sendScriptEvent("rvtest:ok", m.name);
      } else if (id === "rvtest:undo") {
        let list = [];
        try {
          list = JSON.parse(String(rvWorld.getDynamicProperty("maps:undo") ?? "[]"));
        } catch {}
        for (const rid of Array.isArray(list) ? list : []) {
          const raw = rvWorld.getDynamicProperty(`maps:undo:${rid}`);
          if (typeof raw === "string") rvSystem.sendScriptEvent("rvtest:undo_r", raw);
        }
        rvSystem.sendScriptEvent("rvtest:undo_end", "");
      }
    } catch (e) {
      console.warn(`[rvtest] ${e}`);
    }
  },
  { namespaces: ["rvtest"] },
);
