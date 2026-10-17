// Easy Building (build_bp, Effortless Building v5.0 port): commands, Building Book & Tutorial Book,
// plain/floating mode menu, palette, modifiers, clipboard, settings, and undo/redo.
// Run with: node tools/test-bds/run.mjs --quiet --flat --only build_bp,build_rp,claims_bp --scenario tools/test-bds/examples/build.js
import { system } from "@minecraft/server";

export default async function (t) {
  const items = (p, id) => {
    const c = p.getComponent("inventory").container;
    let n = 0;
    for (let i = 0; i < c.size; i++) {
      const it = c.getItem(i);
      if (it?.typeId === id) n += it.amount;
    }
    return n;
  };

  await t.loadArea(0, 0, { radius: 3 });
  const p = await t.player("Builder", { x: 0, z: 0, gameMode: "creative", op: true });

  // Give Building Book via /realm:build_book
  t.assert(t.cmd(p, "/realm:build_book").ok, "/realm:build_book ran");
  await t.waitUntil(() => items(p, "eb:building_book") === 1, { timeout: 60, message: "received eb:building_book" });
  t.check(items(p, "eb:building_book") === 1, "player received Building Book");

  // Switch to plain menus via realm:cfg_set so build_bp sets eb:floatingUI on its own pack store
  system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "t1", pack: "build_bp", key: "floatingUI", value: false, player: p.id }));
  await t.wait(2);

  // Open mode menu via /realm:build and select Wall mode
  const formP = t.waitForm(p, { timeout: 100 });
  t.assert(t.cmd(p, "/realm:build").ok, "/realm:build ran");
  const form = await formP;
  const wallIdx = form.buttons.findIndex((b) => /Wall/i.test(b));
  t.assert(wallIdx >= 0, "Wall mode button is in /realm:build menu");
  form.answer(wallIdx);

  // Undo and Redo with empty stack report nothing to undo/redo cleanly
  t.assert(t.cmd(p, "/realm:build_undo").ok, "/realm:build_undo ran");
  t.assert(t.cmd(p, "/realm:build_redo").ok, "/realm:build_redo ran");
}