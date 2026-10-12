// Easy Building (build_bp): every shape at its smallest and largest settings, the block limits, a huge modifier
// combination refused quickly, and how long the build mode guide takes with modifiers on a big shape.
// Run with: node tools/test-bds/run.mjs --quiet --flat --timeout 600 --only build_bp --scenario tools/test-bds/examples/build-limits.js
export default async function (t) {
  const { ItemStack } = t.mc;
  const dim = t.dimension;
  const Y = -60;
  const hold = (p, id, n) => {
    const c = p.getComponent("inventory").container;
    c.clearAll();
    c.setItem(0, new ItemStack(id, n));
    p.selectedSlotIndex = 0;
  };
  const aim = async (p, x, z) => {
    p.teleport({ x: x + 0.5, y: Y, z: z + 0.5 }, { rotation: { x: 0, y: 0 } });
    await t.waitUntil(() => dim.getBlock({ x, y: Y, z: z + 4 }), { timeout: 200, message: "chunks load" });
    dim.setBlockType({ x, y: Y, z: z + 4 }, "minecraft:bedrock");
    await t.wait(2);
    p.lookAtBlock({ x, y: Y, z: z + 4 });
    await t.wait(4);
  };
  /** Every input at its min or max (Size: from the numbers). */
  const extreme = (which) => (form) =>
    form.elements.map((el) => {
      if (!("default" in el)) return undefined;
      if (el.kind === "slider") return which === "max" ? el.max : el.min;
      if (el.kind === "dropdown" && el.label === "Size") return 0;
      return el.default;
    });
  const pickShape = async (p, i, answer) => {
    t.answerForm(p, "Choose a shape", i, answer);
    t.assert(t.cmd(p, "/realm:build").ok, "/realm:build ran");
    await t.waitMessage(p, /build mode is on|place the start block/i, { pack: "build_bp" });
  };
  const result = /Built \d+ blocks?|That's|Nothing|Out of|Not enough|Point \d+|Start set/;

  await t.loadArea(0, 0, { radius: 4 });
  const cre = await t.player("Cre", { x: 0, z: 0, gameMode: "creative", op: true });
  hold(cre, "minecraft:oak_stairs", 64);
  cre.getComponent("inventory").container.setItem(1, new ItemStack("minecraft:spruce_log", 64));
  t.cmd(cre, "/realm:build_mode"); // on
  await t.wait(2);

  for (const which of ["min", "max"]) {
    const out = [];
    for (let i = 0; i < 26; i++) {
      if (i === 19 || i === 20) continue;
      await pickShape(cre, i, extreme(which));
      await aim(cre, 0, 0);
      const t0 = t.tick;
      t.cmd(cre, "/realm:build_here");
      const m = await t.waitMessage(cre, result, { pack: "build_bp", timeout: 600 });
      const took = t.tick - t0;
      const n = (/Built (\d+)/.exec(m.plain) ?? [])[1];
      out.push(`${i}:${n ?? m.plain.slice(0, 40)}(${took}t)`);
      t.check(/Built \d+ blocks?|That's/.test(m.plain), `${which} shape ${i}: ${m.plain}`);
      if (n) {
        t.cmd(cre, "/realm:build_undo");
        await t.waitMessage(cre, /Undone|Nothing/, { pack: "build_bp", timeout: 600 });
        await t.wait(2);
      }
    }
    t.log(`${which} sizes:`, out.join(" "));
  }

  // ---- A huge modifier combination is refused within a tick or two ----
  t.answerForm(cre, "Modifiers", { "Mirror X": true, "Mirror Y": true, "Mirror Z": true, "Radial: turned": true, "Radial slices": 16, "Array: repeat": true, "Array step X": 32, "Array step Y": 0, "Array step Z": 0, "Array copies": 16 });
  t.cmd(cre, "/realm:build");
  await t.waitMessage(cre, /Modifiers:/, { pack: "build_bp" });
  await pickShape(cre, 14, { Radius: 32, Hollow: false, Size: 0 });
  await aim(cre, 0, 0);
  let t0 = t.tick;
  const w0 = Date.now();
  t.cmd(cre, "/realm:build_here");
  let m = await t.waitMessage(cre, result, { pack: "build_bp" });
  t.log("huge combo:", m.plain, `${t.tick - t0} ticks, ${Date.now() - w0} ms`);
  t.check(/That's more than/.test(m.plain) && t.tick - t0 <= 4, "a huge modifier combination is refused at once");

  // ---- The guide with modifiers on a big shape: wall time of 40 ticks while looking around ----
  const lookAround = async (label) => {
    const start = Date.now();
    for (let k = 0; k < 20; k++) {
      cre.teleport({ x: 0.5 + (k % 5), y: Y, z: 0.5 }, { rotation: { x: 10, y: 0 } });
      await t.wait(2);
    }
    const ms = Date.now() - start;
    t.log(`guide ${label}: 40 ticks took ${ms} ms`);
    return ms;
  };
  await pickShape(cre, 14, { Radius: 20, Hollow: true, Size: 0 });
  t.answerForm(cre, "Modifiers", { "Mirror X": false, "Mirror Y": false, "Mirror Z": false, "Radial: turned": false, "Array: repeat": false });
  t.cmd(cre, "/realm:build");
  await t.waitMessage(cre, /Modifiers:/, { pack: "build_bp" });
  const plain = await lookAround("sphere r20, no modifiers");
  t.answerForm(cre, "Modifiers", { "Mirror X": true });
  t.cmd(cre, "/realm:build");
  await t.waitMessage(cre, /Modifiers:/, { pack: "build_bp" });
  const mirrored = await lookAround("sphere r20, mirror X");
  t.check(mirrored < plain + 1500, `the guide with a mirror stays cheap (${mirrored} ms vs ${plain} ms)`);
  t.answerForm(cre, "Modifiers", { "Mirror X": false });
  t.cmd(cre, "/realm:build");
  await t.waitMessage(cre, /Modifiers:/, { pack: "build_bp" });

  // ---- Survival: a build over maxBlocks (4096) is refused with the count; one at the limit is fine ----
  const sur = await t.player("Sur", { x: 0, z: 0, gameMode: "survival" });
  hold(sur, "minecraft:cobblestone", 64);
  await pickShape(sur, 1, { Width: 64, Height: 64, Thickness: 2, Size: 0 });
  await aim(sur, 0, 0);
  t0 = t.tick;
  t.cmd(sur, "/realm:build_here");
  m = await t.waitMessage(sur, result, { pack: "build_bp" });
  t.log("survival 8192:", m.plain);
  t.check(/most one build can place is 4096 in survival/.test(m.plain), "survival: 8192 blocks refused");
  await pickShape(sur, 1, { Width: 64, Height: 64, Thickness: 1, Size: 0 });
  t.cmd(sur, "/realm:build_here");
  m = await t.waitMessage(sur, result, { pack: "build_bp", timeout: 400 });
  t.log("survival 4096 with 64 cobblestone:", m.plain);
  t.check(/Built 64 blocks/.test(m.plain), "survival: 4096 is allowed and builds what you have (64)");
}
