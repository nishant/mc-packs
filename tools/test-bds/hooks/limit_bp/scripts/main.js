// Test pack for tools/test-bds/examples/harness-event-limit.js (never shipped): on rvtest:long <n> it sends a
// realm:test_long script event of n characters, so the scenario can see the harness shim's 2048 check.
import { system } from "@minecraft/server";

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "rvtest:long") return;
    const n = Math.max(0, Math.min(100000, Number(message) || 0));
    system.sendScriptEvent("realm:test_long", "a".repeat(n));
    system.sendScriptEvent("rvtest:long_sent", String(n));
  },
  { namespaces: ["rvtest"] },
);
