// Test-only identity adapter: simulated players have new IDs after disconnect/restart.
// Production storage is unchanged; the adapter copies the exact saved handle to the new test player.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { port: { type: "string" } } });
const portArgs = [];
if (values.port !== undefined) {
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65534) throw new Error("--port must be an integer from 1024 to 65534 (the next port is also reserved)");
  portArgs.push("--port", String(port));
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cache = path.join(root, "tools", "test-bds", ".cache", "stash-persistence");
fs.mkdirSync(cache, { recursive: true });
const temp = fs.mkdtempSync(path.join(cache, "packs-"));
const pack = path.join(temp, "stash_bp");
try {
  fs.cpSync(path.join(root, "packs", "stash_bp"), pack, { recursive: true });
  fs.appendFileSync(path.join(pack, "scripts", "main.js"), `
import { carried as testCarried, loadSnapshot as testLoad, saveSnapshot as testSave, stateOf as testState } from "./page-store.js";
import { STORAGE_SLOTS as testSlots, BUTTON_SLOTS as testButtons } from "./pages.js";
import { setFor as testPref } from "./settings.js";
system.afterEvents.scriptEventReceive.subscribe((event) => {
  if (event.id !== "harness:stash_identity") return;
  try {
    const { name, op } = JSON.parse(event.message);
    const player = world.getAllPlayers().find((p) => p.name === name);
    if (!player) throw new Error("test player missing");
    const inv = player.getComponent("minecraft:inventory").container;
    testPref(player, "autoStore", false);
    if (op === "normal_legacy" || op === "hidden_legacy") {
      testPref(player, "invOff", op === "normal_legacy");
      testPref(player, "invButtons", false);
      for (let s = 9; s < 36; s++) {
        const item = new ItemStack("minecraft:diamond_sword");
        item.nameTag = "full-old-" + s;
        item.getComponent("minecraft:durability").damage = s;
        inv.setItem(s, item);
      }
      player.setDynamicProperty("stash:native", JSON.stringify({ v: 1, cur: 1, pages: {} }));
    } else if (op === "legacy_checkpoint") {
      const oldSlots = [10, 11, 12, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35];
      const oldButtons = [9, 13, 17];
      const legacy = (entries) => entries.map(({ s, item }) => {
        const ordinal = testSlots.indexOf(s);
        const button = testButtons.indexOf(s);
        return { s: ordinal >= 0 ? oldSlots[ordinal] : button >= 0 ? oldButtons[button] : s, item };
      });
      const state = testState(player);
      const pages = {};
      for (const [page, ref] of Object.entries(state.pages)) pages[page] = testSave(player, legacy(testLoad(player, ref)));
      world.setDynamicProperty("stash:test:index", JSON.stringify({ v: 1, cur: state.cur, pages }));
      world.setDynamicProperty("stash:test:active", JSON.stringify(testSave(player, legacy(testCarried(inv)))));
      player.sendMessage("stash legacy checkpoint: " + Object.values(pages).length + " unversioned old-layout refs");
    } else if (op === "checkpoint") {
      world.setDynamicProperty("stash:test:index", player.getDynamicProperty("stash:native"));
      world.setDynamicProperty("stash:test:active", JSON.stringify(testSave(player, testCarried(inv))));
    } else if (op === "restore") {
      player.setDynamicProperty("stash:native", world.getDynamicProperty("stash:test:index"));
      const items = testLoad(player, JSON.parse(world.getDynamicProperty("stash:test:active")));
      for (let s = 0; s < inv.size; s++) inv.setItem(s, items.find((e) => e.s === s)?.item);
    } else if (op === "status") {
      const state = testState(player);
      player.sendMessage("stash layout status " + JSON.stringify({ layout: state.layout, cur: state.cur,
        refs: Object.fromEntries(Object.entries(state.pages).map(([page, ref]) => [page, ref.layout || 1])) }));
    } else if (op !== "configure") throw new Error("unknown test operation");
    player.sendMessage("stash identity " + op + " done");
  } catch (e) { console.error("[stash-test] " + e); }
});
`);
  const result = spawnSync(process.execPath, [
    path.join(root, "tools", "test-bds", "run.mjs"), "--packs", temp, "--only", "stash_bp",
    "--scenario", path.join(root, "tools", "test-bds", "examples", "stash-pages-persistence.js"),
    ...portArgs, "--strict", "--quiet", "--timeout", "240",
  ], { cwd: root, stdio: "inherit", env: { ...process.env, BDS_HARNESS_CACHE: process.env.BDS_HARNESS_CACHE || cache } });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
