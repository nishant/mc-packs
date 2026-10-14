// Story Questlines: farScale brings far story spots toward world spawn. With the default 0.5 the
// Three Pins (about 1,100-1,200 blocks out as written) are about 700-750 blocks out: the tracker
// points there and the chapter's text says so. Set to 1, the spots and the text go back to the
// written distances; a spot within 300 blocks never moves.
//   node tools/test-bds/run.mjs --quiet --only saga_bp,npc_bp --scenario tools/test-bds/examples/saga-far-scale.js --timeout 400
export default async function (t) {
  const sys = t.system;
  /** @type {{ tick: number, m: any }[]} */
  const tracks = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      try {
        if (id === "realm:track") tracks.push({ tick: sys.currentTick, m: JSON.parse(message) });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const send = (id, m) => sys.sendScriptEvent(id, JSON.stringify(m));
  const debug = (p, msg) => send("realm:saga_debug", { player: p.name, ...msg });
  const spawn = t.world.getDefaultSpawnLocation();
  const PINS = [
    [900, -700],
    [-1100, -200],
    [150, 1200],
  ];
  const scaled = (x, z, f) => {
    const d = Math.hypot(x, z);
    if (d <= 300) return [x, z];
    const k = (300 + (d - 300) * f) / d;
    return [Math.round(x * k), Math.round(z * k)];
  };
  /** Starts the Three Pins chapter for a player and returns the chat after accepting. */
  async function startPins(p) {
    debug(p, { action: "finish", story: "drowned_bell" });
    debug(p, { action: "jump", story: "last_map", chapter: "far" });
    await t.wait(5);
    const since = t.tick;
    send("realm:npc_choose", { pack: "saga_bp", player: p.id, npc: "mara", key: "start:last_map" });
    for (;;) {
      const f = await t.waitForm(p, { timeout: 200 });
      if (f.buttons.some((b) => /^next$/i.test(b))) {
        f.answer("Next");
        continue;
      }
      f.answer(f.buttons.find((b) => /accept/i.test(b)) ?? 0);
      break;
    }
    await t.waitMessage(p, /first pin/i, { since, timeout: 100 });
    await t.wait(5);
    return t
      .messages(p, { since })
      .map((m) => m.plain)
      .join("\n");
  }
  /** The tracker's target for a player since a tick, as an offset from spawn. */
  async function target(p, since) {
    await t.waitUntil(() => tracks.some((e) => e.tick >= since && e.m.player === p.id && typeof e.m.x === "number"), { timeout: 120, message: "saga sends realm:track with a spot" });
    const m = tracks.filter((e) => e.tick >= since && e.m.player === p.id && typeof e.m.x === "number").at(-1).m;
    return [Math.round(m.x - Math.floor(spawn.x)), Math.round(m.z - Math.floor(spawn.z))];
  }
  const near = (a, b) => Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1;

  // Default 0.5.
  const p = await t.player("Scaler", { op: true });
  let since = t.tick;
  let chat = await startPins(p);
  t.log("chat:", chat.split("\n").filter((l) => /pin/.test(l)).join(" | "));
  t.check(/first pin \(about 700 blocks northeast\)/.test(chat), "the first pin reads about 700 blocks (1,140 written)");
  t.check(/third pin \(about 750 blocks south\)/.test(chat), "the third pin reads about 750 blocks (1,209 written)");
  t.check(!/\{far:/.test(chat), "no raw tokens in chat");
  let at = await target(p, since);
  t.log("target at 0.5:", at.join(", "));
  t.check(
    PINS.some(([x, z]) => near(at, scaled(x, z, 0.5))),
    `the tracker points to a scaled pin (${at}; expected one of ${PINS.map(([x, z]) => scaled(x, z, 0.5)).join(" / ")})`,
  );
  t.check(Math.hypot(at[0], at[1]) < 800, "the pin is under 800 blocks from spawn");

  // farScale 1: back to the written distances.
  send("realm:cfg_set", { id: "t_far", pack: "saga_bp", key: "farScale", value: 1 });
  await t.wait(10);
  since = t.tick;
  at = await target(p, since);
  t.log("target at 1:", at.join(", "));
  t.check(
    PINS.some(([x, z]) => near(at, [x, z])),
    `the tracker points to a pin as written (${at})`,
  );
  const q = await t.player("Plain", { op: true });
  chat = await startPins(q);
  t.check(/first pin \(about 1,150 blocks northeast\)/.test(chat), "at 1 the first pin reads about 1,150 blocks");
  t.check(/second pin \(about 1,100 blocks west\)/.test(chat), "at 1 the second pin reads about 1,100 blocks");
  t.pass("far spots scale and the text follows");
}
