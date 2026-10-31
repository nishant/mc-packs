// Kitchen: the rare-ingredient windows. A Harvest Moon, an aurora, a meteor and a Blood Moon each
// announce their window once (no repeats while it's open), and ripe wheat harvested in the stardust
// window gives Starwright Flour now and then (unripe wheat never). About 1 minute:
//   node tools/test-bds/run.mjs --quiet --only cooking_bp,harvest_bp --scenario tools/test-bds/examples/cooking-windows.js
export default async function (t) {
  const p = await t.player("Tester", { op: true });
  const ev = (id, msg) => t.console(`scriptevent ${id} ${JSON.stringify(msg)}`);
  const kitchenLines = () => t.messages(p).filter((m) => m.pack === "cooking_bp" && /Kitchen|Stardust/.test(m.plain));
  await ev("realm:moon", { state: "harvest" });
  await ev("realm:moon", { state: "harvest" });
  await ev("realm:sky_event", { kind: "aurora" });
  await ev("realm:sky_event", { kind: "meteor" });
  await ev("realm:sky_event", { kind: "meteor" });
  await t.wait(10);
  const lines = kitchenLines();
  t.log(lines.map((m) => m.plain).join(" / "));
  t.check(lines.length === 2, `one line for the Harvest Moon and one for the stardust (${lines.length})`);
  await ev("realm:moon", { state: "blood" });
  await ev("realm:moon", { state: "blood" });
  await t.wait(10);
  t.check(kitchenLines().length === 3, `one more line for the Blood Moon (${kitchenLines().length})`);
  await ev("realm:moon", { state: "normal" });

  // Ripe wheat on farmland, in a row next to the player.
  const at = p.location;
  const y = Math.floor(at.y) - 1;
  const x0 = Math.floor(at.x) + 2;
  const z = Math.floor(at.z);
  const N = 40;
  const flour = () => {
    const inv = p.getComponent("inventory").container;
    let n = 0;
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (it?.nameTag?.replace(/§./g, "") === "Starwright Flour") n += it.amount;
    }
    return n;
  };
  // A flat strip to walk along (the ground rises east of the spawn).
  t.server(`/fill ${x0 - 1} ${y + 1} ${z - 2} ${x0 + N} ${y + 5} ${z} air`);
  t.server(`/fill ${x0 - 1} ${y - 1} ${z - 2} ${x0 + N} ${y} ${z - 1} grass_block`);
  const plant = () => {
    t.server(`/fill ${x0} ${y} ${z} ${x0 + N - 1} ${y} ${z} farmland`);
    t.server(`/fill ${x0} ${y + 1} ${z} ${x0 + N - 1} ${y + 1} ${z} wheat ["growth"=7]`);
  };
  // Breaks. (Taps can't be tested here: a simulated player's tap on a crop fires no interact event.)
  plant();
  await t.wait(5);
  for (let i = 0; i < N; i++) {
    p.teleport({ x: x0 + i + 0.5, y: y + 1, z: z - 1.5 }, { dimension: t.dimension });
    await t.wait(2);
    p.breakBlock({ x: x0 + i, y: y + 1, z });
    await t.wait(5);
  }
  const fromBreaks = flour();
  t.log(`breaks: ${fromBreaks} Starwright Flour from ${N} breaks`);
  t.check(fromBreaks > 0 && fromBreaks < N, `breaks give flour now and then (${fromBreaks})`);
  // Unripe wheat gives nothing.
  plant();
  t.server(`/fill ${x0} ${y + 1} ${z} ${x0 + N - 1} ${y + 1} ${z} wheat ["growth"=3]`);
  await t.wait(5);
  const before = flour();
  for (let i = 0; i < N; i++) {
    p.teleport({ x: x0 + i + 0.5, y: y + 1, z: z - 1.5 }, { dimension: t.dimension });
    await t.wait(2);
    p.breakBlock({ x: x0 + i, y: y + 1, z });
    await t.wait(3);
  }
  t.check(flour() === before, "unripe wheat gives nothing");
}
