// Expeditions O19: the stash cart window. Giving a Fixed loadout player's items back puts the stash structure down at
// their feet; for a few ticks after that the saved record says "put down, never seen". A disconnect, a broken cart or
// a server restart cutting in at any tick of that window must never put the structure down a second time once its carts
// were in the world (that hands every item out twice: the broken carts drop theirs), and must lose nothing.
// Cases, each with its own named items (a sword and 37 dirt named "O19 <player>", counted everywhere: inventories,
// item entities on the ground, any chest minecart):
//   L<k>  the owner leaves k ticks after the put-down, someone breaks the carts, the owner comes back (k = 0..5)
//   B<k>  the carts are broken k ticks after the put-down while the owner stays (k = 0..5)
//   R<k>  the server restarts k ticks after the put-down (k = 0..4, one phase each): Ra<k> comes back to their carts;
//         Rb<k>'s carts load near someone else after the restart and are broken before Rb<k> comes back
// A cut that lands after the hand-back already finished is logged ("finished before the cut") and not counted.
// Pass: every case puts the structure down once (twice only if no cart of it was ever there), the items exist exactly
// once (37 dirt, 1 sword), and nothing is left in a cart.
// It runs against a test copy of expedition_bp (tools/test-bds/hooks/expedition-carts-window.mjs) because a simulated
// player comes back with a new id: the copy keeps the stash record by name, so the player who comes back "is" the owner.
//   rm -rf /tmp/o19 && node tools/test-bds/hooks/expedition-carts-window.mjs /tmp/o19/packs
//   node tools/test-bds/run.mjs --quiet --flat --packs /tmp/o19/packs --only expedition_bp --scenario tools/test-bds/examples/expedition-carts-window.js --timeout 2400
// Before the fix (base 88cc198 / 5422aac): stage with the base repository as the second argument; L and B cases
// inside the window put the structure down twice (74 dirt, 2 swords).
const K = "harness:exp_o19";
const SPOT = { x: 400, z: 0 };
const KS = [0, 1, 2, 3, 4, 5];
const RESTART_KS = [0, 1, 2, 3, 4];
const load = (t) => JSON.parse(String(t.world.getDynamicProperty(K) ?? "{}"));
const save = (t, v) => t.world.setDynamicProperty(K, JSON.stringify(v));

export default async function (t) {
  t.formTimeout = 400;
  const st = load(t);
  st.results ??= [];
  const { top } = await t.loadArea(SPOT.x, SPOT.z, { radius: 2 });
  const y = top + 1;
  /** @type {{ id: string, msg: string, tick: number }[]} */
  const events = [];
  t.system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (ev.id.startsWith("exptest:")) events.push({ id: ev.id, msg: ev.message, tick: t.system.currentTick });
    },
    { namespaces: ["exptest"] },
  );
  const dim = t.dimension;
  const evOf = (id, pred = () => true, since = 0) => events.find((e) => e.id === id && e.tick >= since && pred(e.msg));
  const waitEv = (id, pred, since, timeout = 200) => t.waitUntil(() => evOf(id, pred, since), { timeout, interval: 1, message: `${id}` });
  const label = (name) => `O19 ${name}`;
  let slot = 0;
  const spot = () => ({ x: SPOT.x - 12 + 3 * (slot++ % 9), y, z: SPOT.z - 6 + 4 * Math.floor((slot - 1) / 9) % 12 });

  /** Every item named for this case, anywhere it can be. */
  const count = (name) => {
    const tag = label(name);
    const n = { dirt: 0, sword: 0 };
    const add = (it) => {
      if (it?.nameTag !== tag) return;
      if (it.typeId === "minecraft:dirt") n.dirt += it.amount;
      else n.sword += it.amount;
    };
    for (const p of t.world.getAllPlayers()) {
      const inv = p.getComponent("minecraft:inventory")?.container;
      for (let k = 0; inv && k < inv.size; k++) add(inv.getItem(k));
    }
    for (const e of dim.getEntities({ type: "minecraft:item" })) add(e.getComponent("minecraft:item")?.itemStack);
    for (const e of dim.getEntities({ type: "minecraft:chest_minecart" })) {
      const box = e.getComponent("minecraft:inventory")?.container;
      for (let k = 0; box && k < box.size; k++) add(box.getItem(k));
    }
    return n;
  };
  const cartsOf = (tag) => dim.getEntities({ tags: [tag] });
  /** Breaking a chest minecart: its items fall out, the cart goes. */
  const breakCarts = (tag) => {
    let n = 0;
    for (const c of cartsOf(tag)) {
      const box = c.getComponent("minecraft:inventory")?.container;
      for (let k = 0; box && k < box.size; k++) {
        const it = box.getItem(k);
        if (it) dim.spawnItem(it, c.location);
      }
      box?.clearAll();
      c.remove();
      n++;
    }
    return n;
  };
  /** A player with named items, stored like a Fixed loadout Gauntlet stores them. */
  const stashed = async (name, at) => {
    const p = await t.player(name, { x: at.x, y: at.y, z: at.z });
    const inv = p.getComponent("minecraft:inventory").container;
    const sword = new t.mc.ItemStack("minecraft:iron_sword", 1);
    sword.nameTag = label(name);
    const dirt = new t.mc.ItemStack("minecraft:dirt", 37);
    dirt.nameTag = label(name);
    inv.setItem(0, sword);
    inv.setItem(20, dirt);
    const since = t.system.currentTick;
    t.system.sendScriptEvent("exptest:stash", JSON.stringify({ name, x: at.x, y: at.y + 40, z: at.z }));
    const ok = JSON.parse((await waitEv("exptest:ok", (m) => JSON.parse(m).name === name, since)).msg).ok;
    t.assert(ok && !inv.getItem(0) && !inv.getItem(20), `${name}: stored`);
    return p;
  };
  /** Starts the hand-back; resolves the cart tag at the put-down. */
  const restore = async (name) => {
    const since = t.system.currentTick;
    t.system.sendScriptEvent("exptest:restore", name);
    const placed = await waitEv("exptest:placed", () => true, since, 400);
    return { tag: placed.msg, tick: placed.tick, since };
  };
  /** Two hand-backs started in the same tick (their put-downs in the same tick too). */
  const restoreTwo = async (a, b) => {
    const since = t.system.currentTick;
    t.system.sendScriptEvent("exptest:restore", a);
    t.system.sendScriptEvent("exptest:restore", b);
    await t.waitUntil(() => events.filter((e) => e.id === "exptest:placed" && e.tick >= since).length >= 2, { timeout: 400, interval: 1, message: "both put down" });
    const [pa, pb] = events.filter((e) => e.id === "exptest:placed" && e.tick >= since);
    // Stash numbers follow the order the stashes were made (a first), whatever order the put-downs came in.
    const [ta, tb] = [pa.msg, pb.msg].sort((x, y) => Number(x.split("_").pop()) - Number(y.split("_").pop()));
    return [{ tag: ta, since }, { tag: tb, since }];
  };
  const finished = (name, since) => {
    const e = evOf("exptest:restored", (m) => JSON.parse(m).name === name, since);
    return e ? JSON.parse(e.msg) : undefined;
  };
  /** The owner is back (same name, new simulated player): their record goes on them and the hand-back runs to its end. */
  const comeBack = async (name, at) => {
    const p = await t.player(name, { x: at.x, y: at.y, z: at.z });
    let since = t.system.currentTick;
    t.system.sendScriptEvent("exptest:adopt", name);
    const adopted = JSON.parse((await waitEv("exptest:adopted", (m) => JSON.parse(m).name === name, since)).msg);
    t.check(!!adopted.rec, `${name}: the record waited for them (${JSON.stringify(adopted.rec)})`);
    for (let tries = 0; tries < 6; tries++) {
      since = t.system.currentTick;
      t.system.sendScriptEvent("exptest:restore", name);
      const r = JSON.parse((await waitEv("exptest:restored", (m) => JSON.parse(m).name === name, since, 600)).msg);
      if (r.error) t.check(false, `${name}: hand-back threw ${r.error}`);
      if (r.done) return p;
      await t.wait(40);
    }
    t.check(false, `${name}: the hand-back never finished`);
    return p;
  };
  /** Put-downs of this record's structure, in this phase and earlier ones. */
  const puts = (tag) => events.filter((e) => e.id === "exptest:placed" && e.msg === tag).length + (st.puts?.[tag] ?? 0);
  /** Was a cart of this record ever there (watched every tick from the put-down)? */
  const watch = (tag, until) => {
    const out = { seen: false };
    const h = t.system.runInterval(() => {
      if (cartsOf(tag).length) out.seen = true;
      if (t.system.currentTick > until()) t.system.clearRun(h);
    }, 1);
    return out;
  };
  const judge = (c, name, tag, seen) => {
    const n = count(name);
    const put = puts(tag);
    const left = cartsOf(tag).length;
    const line = `${c}: put down ${put}x, carts ever there ${seen}, items ${n.dirt} dirt / ${n.sword} sword, carts left ${left}`;
    t.log(line);
    st.results.push(line);
    t.check(seen ? put === 1 : put <= 2, `${c}: the structure was put down once (${put}x; carts were ${seen ? "" : "never "}there)`);
    t.check(n.dirt === 37 && n.sword === 1, `${c}: every item exists exactly once (${n.dirt}/37 dirt, ${n.sword}/1 sword)`);
    t.check(left === 0, `${c}: no cart left (${left})`);
  };
  const tidy = (name) => {
    for (const e of dim.getEntities({ type: "minecraft:item" })) if (e.getComponent("minecraft:item")?.itemStack?.nameTag === label(name)) e.remove();
  };

  if (t.phase === 1) {
    // L<k>: leave at k, carts broken while away, back later.
    for (const k of KS) {
      const name = `L${k}`;
      const at = spot();
      const p = await stashed(name, at);
      const r = await restore(name);
      let stop = Infinity;
      const w = watch(r.tag, () => stop);
      if (k) await t.wait(k);
      if (finished(name, r.since)?.done) {
        st.results.push(`${name}: finished before the cut`);
        t.log(`${name}: finished before the cut`);
        stop = 0;
        tidy(name);
        p.disconnect();
        continue;
      }
      p.disconnect();
      await t.wait(3);
      breakCarts(r.tag);
      await t.wait(60);
      stop = 0;
      const back = await comeBack(name, at);
      await t.wait(10);
      judge(name, name, r.tag, w.seen);
      tidy(name);
      back.disconnect();
    }
    // B<k>: broken at k while the owner stays.
    for (const k of KS) {
      const name = `B${k}`;
      const at = spot();
      const p = await stashed(name, at);
      const r = await restore(name);
      let stop = Infinity;
      const w = watch(r.tag, () => stop);
      if (k) await t.wait(k);
      if (finished(name, r.since)?.done) {
        st.results.push(`${name}: finished before the cut`);
        t.log(`${name}: finished before the cut`);
        stop = 0;
        tidy(name);
        p.disconnect();
        continue;
      }
      breakCarts(r.tag);
      await t.waitUntil(() => finished(name, r.since), { timeout: 400, interval: 5, message: `${name}: first hand-back settles` });
      stop = 0;
      if (!finished(name, r.since).done) {
        // Tried again, as homecoming does.
        for (let tries = 0; tries < 6; tries++) {
          const since = t.system.currentTick;
          t.system.sendScriptEvent("exptest:restore", name);
          const res = JSON.parse((await waitEv("exptest:restored", (m) => JSON.parse(m).name === name, since, 600)).msg);
          if (res.done) break;
          await t.wait(40);
        }
      }
      await t.wait(10);
      judge(name, name, r.tag, w.seen);
      tidy(name);
      p.disconnect();
    }
  } else {
    // Judge the restart that ended the last phase.
    const prev = st.r;
    st.puts ??= {};
    // Rb: its carts load near someone else (the ticking area, and Ra standing next to them) and are broken first.
    await t.wait(40);
    const aSeen = prev.a.seen || cartsOf(prev.a.tag).length > 0;
    const bSeen = prev.b.seen || cartsOf(prev.b.tag).length > 0;
    if (!prev.b.done) breakCarts(prev.b.tag);
    await t.wait(20);
    if (!prev.a.done) {
      await comeBack(prev.a.name, prev.a.at);
      await t.wait(10);
      judge(prev.a.name, prev.a.name, prev.a.tag, aSeen);
    } else st.results.push(`${prev.a.name}: finished before the cut`);
    if (!prev.b.done) {
      await comeBack(prev.b.name, prev.b.at);
      await t.wait(10);
      judge(prev.b.name, prev.b.name, prev.b.tag, bSeen);
    } else st.results.push(`${prev.b.name}: finished before the cut`);
    tidy(prev.a.name);
    tidy(prev.b.name);
    for (const p of t.world.getAllPlayers()) if (p.name === prev.a.name || p.name === prev.b.name) p.disconnect?.();
  }

  // R<k>: one restart per phase, k ticks after the put-down.
  const k = RESTART_KS[t.phase - 1];
  if (k === undefined) {
    t.log(`results:\n${st.results.join("\n")}`);
    return;
  }
  const a = { name: `Ra${k}`, at: spot() };
  const b = { name: `Rb${k}`, at: spot() };
  await stashed(a.name, a.at);
  await stashed(b.name, b.at);
  const pa = t.world.getAllPlayers().find((p) => p.name === a.name);
  const pb = t.world.getAllPlayers().find((p) => p.name === b.name);
  const [ra, rb] = await restoreTwo(a.name, b.name);
  const seenA = watch(ra.tag, () => Infinity);
  const seenB = watch(rb.tag, () => Infinity);
  if (k) await t.wait(k);
  const doneA = !!finished(a.name, ra.since)?.done;
  const doneB = !!finished(b.name, rb.since)?.done;
  // The server going down takes the players with it at this tick: the hand-back can't go on (t.restart() itself stops
  // the server only about half a second later, which would let it finish).
  pa?.disconnect();
  pb?.disconnect();
  if (doneA) t.log(`${a.name}: finished before the cut`);
  if (doneB) t.log(`${b.name}: finished before the cut`);
  await t.wait(2);
  st.puts ??= {};
  st.puts[ra.tag] = (st.puts[ra.tag] ?? 0) + events.filter((e) => e.id === "exptest:placed" && e.msg === ra.tag).length;
  st.puts[rb.tag] = (st.puts[rb.tag] ?? 0) + events.filter((e) => e.id === "exptest:placed" && e.msg === rb.tag).length;
  st.r = {
    a: { ...a, tag: ra.tag, done: doneA, seen: seenA.seen || cartsOf(ra.tag).length > 0 },
    b: { ...b, tag: rb.tag, done: doneB, seen: seenB.seen || cartsOf(rb.tag).length > 0 },
  };
  save(t, st);
  t.restart(`O19 restart ${k} ticks after the put-down`);
}
