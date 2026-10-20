// F11: Chest Finder decides private or world-wide from its own saved data only. In one add-on (as in the Realm Bundle),
// a probe pack imported first saves another pack's key (claims:next) in its world-load handler, before Chest Finder's
// runs, as Land Claims and others do on a brand-new world. The world must still start with the private index.
// Disclosed adaptation: the probe stands in for the other packs' load-time writes; Chest Finder is production.
// Phase 1: a barrel nobody placed or opened, next to the searcher; a nearby search reads it live. Private: no list,
// the private-index message. (Before the fix the probe's key made the world "existing", so it was listed.)
// Phase 2, after a restart: the decision is not made again (still private), and the operator switch to world-wide
// still works through the settings protocol and lists the barrel.
//   mkdir -p /tmp/findmode && node tools/test-bds/hooks/diag-bundle.mjs /tmp/findmode find_bp --probe-first --first-key claims:next
//   node tools/test-bds/run.mjs --quiet --flat --packs /tmp/findmode --scenario tools/test-bds/examples/find-mode-bundle.js --timeout 600
export default async function (t) {
  const { ItemStack } = t.mc;
  const dim = t.dimension;
  const p = await t.player(`Seeker${t.phase}`, { op: false });
  await t.wait(20);
  const at = { x: Math.floor(p.location.x) + 2, y: Math.floor(p.location.y), z: Math.floor(p.location.z) + 2 };
  if (t.phase === 1) {
    dim.getBlock(at).setType("minecraft:barrel");
    dim.getBlock(at).getComponent("minecraft:inventory").container.setItem(0, new ItemStack("minecraft:diamond", 4));
  }
  t.assert(dim.getBlock(at).typeId === "minecraft:barrel", "the barrel is there");

  /** Searches; returns the form if one opened (closed at once), and what Chest Finder said in chat. */
  async function search() {
    const since = t.tick;
    /** @type {any} */
    let form;
    t.answerForm(p, (/** @type {any} */ f) => {
      form = f;
      return null;
    });
    t.assert(t.cmd(p, "/realm:find diamond").ok, "/realm:find diamond runs");
    await t.waitUntil(() => form || t.messages(p, { since, kind: "chat" }).length, { timeout: 120, message: "a list or a chat answer" });
    await t.wait(5);
    const said = t.messages(p, { since, kind: "chat" }).map((m) => m.plain).join(" | ");
    return { form, said };
  }

  const first = await search();
  t.log(`phase ${t.phase}: form=${first.form ? JSON.stringify(first.form.buttons) : "none"} chat=${first.said}`);
  t.check(!first.form, `phase ${t.phase}: private index, the unopened barrel is not listed`);
  t.check(/private/i.test(first.said), `phase ${t.phase}: the private-index message`);

  if (t.phase === 1) {
    p.disconnect();
    await t.wait(10);
    t.restart("decided private; restarting to check the decision is kept");
    return;
  }
  const acks = [];
  t.system.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      try {
        if (id === "realm:cfg_ack") acks.push(JSON.parse(message));
      } catch {
        // not JSON
      }
    },
    { namespaces: ["realm"] }
  );
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "wide", pack: "find_bp", key: "privateIndex", value: false }));
  await t.waitUntil(() => acks.find((x) => x.id === "wide" && x.ok), { timeout: 40, message: "world-wide index ack" });
  const wide = await search();
  t.log(`world-wide: form=${wide.form ? JSON.stringify(wide.form.buttons) : "none"}`);
  t.check(!!wide.form && wide.form.buttons.length === 1 && /4 Diamond/.test(wide.form.buttons[0]), "world-wide lists the barrel");
}
