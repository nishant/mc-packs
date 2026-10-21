// A player on page 2 picks up one item every 10 ticks for 60 s (page 1 has room). Measures what auto-store does.
// Copied from docs/audits/2026-10-deep-audit/fleet-review/scenarios/autostore-perf.js (F2, F13).
// Run: node tools/test-bds/run.mjs --quiet --no-relay --profile --only stash_bp --scenario tools/test-bds/examples/stash-autostore-perf.js
export default async function (t) {
  const mc = t.mc;
  const p = await t.player("Miner", { op: true });
  t.cmd(p, "/gamemode survival");
  const inv = p.getComponent("minecraft:inventory").container;
  const pageNow = () => Number(/Page (\d+)\//.exec(inv.getItem(16)?.nameTag ?? "")?.[1] ?? 0);
  await t.waitUntil(() => inv.getItem(16)?.typeId === "custom:inv_menu", { timeout: 100, message: "pages ready" });
  inv.setItem(17, undefined);
  await t.waitUntil(() => pageNow() === 2, { timeout: 60, message: "on page 2" });
  await t.wait(10);
  for (let s = 0; s < 9; s++) inv.setItem(s, new mc.ItemStack("minecraft:torch", 1 + s));
  await t.wait(10);
  const kinds = ["minecraft:cobblestone", "minecraft:dirt", "minecraft:andesite", "minecraft:diorite", "minecraft:granite", "minecraft:gravel"];
  const t0 = Date.now();
  for (let i = 0; i < 120; i++) {
    inv.addItem(new mc.ItemStack(kinds[i % kinds.length], 1));
    await t.wait(10);
  }
  let here = 0;
  for (let s = 9; s < 36; s++) { const it = inv.getItem(s); if (it && !it.typeId.startsWith("custom:")) here += it.amount; }
  t.log(`page 2 holds ${here} items after 120 pickups; wall ${Date.now() - t0} ms`);
}
