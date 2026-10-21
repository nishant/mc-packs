// Town Projects, small life (F40, townLife): Elm is the realm's second town (Hill, far away, has Mayor Bram), so its
// mayor is mayor:elm. Each build at an automatic spot gets a 1-wide grass_path toward the center, made only of the grass
// that was there (each block 4-connected to the next, steps of at most 1, at most 48), saved in town:w; at level 2,
// once the level's builds are up, lantern posts (an oak fence with a lantern) stand beside the paths, at most 12. The
// garden, once built, gets a pen next to it (a fence ring with a gate) with 2 sheep and 2 chickens tagged town:a:elm
// (those that vanish come back while a player is by the pen, a killed one doesn't),
// spawned once. The notice board shows projects done and the resident count, and the newest residents. The town's
// news goes to Townsfolk as gossip kind town_life with from: mayor:elm, which Townsfolk keeps. Remove spot turns the
// well's path back to grass.
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp,npc_bp --scenario tools/test-bds/examples/town-life.js --timeout 9000
export default async function (t) {
  const sys = t.system;
  const dim = t.dimension;
  /** @type {{ id: string, m: any, tick: number }[]} */
  const events = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (!["realm:gossip", "realm:npc_gossip"].includes(id)) return;
      try {
        events.push({ id, m: JSON.parse(message), tick: t.tick });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const of = (id) => events.filter((e) => e.id === id).map((e) => e.m);
  t.server("/gamerule domobspawning false");
  const p = await t.player("Ann", { op: true, x: 0, z: 0 });
  await t.loadArea(0, 0, { radius: 4, whole: true });
  const town = (action, extra = {}) => sys.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", ...extra }));
  const dump = async (id) => {
    await t.wait(1); // a dump just before answered in this tick: never take its message for this one
    const since = t.tick;
    town("dump", { town: id });
    const m = await t.waitMessage(p, (x) => x.startsWith('{"town"'), { since, timeout: 60 });
    return JSON.parse(m.plain);
  };
  const prog = (d, id) => d.progress.find(([x]) => x === id)?.[1];
  const FWD = [[0, 1], [-1, 0], [0, -1], [1, 0]];
  const at = (s, x, y, z) => {
    const [fx, fz] = FWD[s.f];
    const [rx, rz] = [-fz, fx];
    return { x: s.x + rx * x + fx * z, y: s.y + y, z: s.z + rz * x + fz * z };
  };
  // Packed cells, as life.js packCells: 6 base-36 characters, relative to the town's center.
  const cells = (str, cx, cz) => {
    const out = [];
    for (let i = 0; i + 6 <= (str ?? "").length; i += 6) {
      const n = parseInt(str.slice(i, i + 6), 36);
      const y = (n % 512) - 64;
      const r = Math.floor(n / 512);
      out.push({ x: Math.floor(r / 2048) - 1024 + cx, y, z: (r % 2048) - 1024 + cz });
    }
    return out;
  };
  const block = (v) => dim.getBlock(v);
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "res", pack: "town_bp", key: "residents", value: true }));

  // Hill first (far away): it takes Mayor Bram, so Elm gets its own mayor.
  const { top: hillTop } = await t.loadArea(400, 0);
  p.teleport({ x: 400.5, y: hillTop.y + 1, z: 0.5 });
  await t.wait(20);
  let since = t.tick;
  town("add", { name: "Hill" });
  await t.waitMessage(p, /Town Hill added/, { since, timeout: 60 });
  p.teleport({ x: 0.5, y: -59, z: 0.5 });
  await t.wait(20);
  since = t.tick;
  town("add", { name: "Elm" });
  await t.waitMessage(p, /Town Elm added/, { since, timeout: 60 });
  let d = await dump("elm");
  t.check(d.town.m === "mayor:elm", `Elm has its own mayor (${d.town.m})`);

  await t.waitUntil(async () => {
    d = await dump("elm");
    return d.town.spots.well && d.town.spots.notice_board;
  }, { timeout: 6000, interval: 100, message: "level 1 spots picked" });
  town("finish", { town: "elm", project: "well" });
  await t.wait(10);
  town("finish", { town: "elm", project: "notice_board" });
  await t.waitUntil(async () => (d = await dump("elm")).town.lvl === 2, { timeout: 400, interval: 20, message: "level 2" });

  // Paths from the well and the board.
  await t.waitUntil(async () => {
    d = await dump("elm");
    return d.town.spots.well?.pt === 1 && d.town.spots.notice_board?.pt === 1;
  }, { timeout: 3000, interval: 100, message: "paths laid from the well and the notice board" });
  const cx = d.town.x;
  const cz = d.town.z;
  const pathOf = (id) => cells(d.life[id]?.[0], cx, cz);
  for (const id of ["well", "notice_board"]) {
    const path = pathOf(id);
    const s = d.town.spots[id];
    t.log(`${id} path: ${path.length} blocks from ${JSON.stringify(path[0])}`);
    t.check(path.length > 0 && path.length <= 48, `${id}: a path of 1 to 48 blocks (${path.length})`);
    if (!path.length) continue;
    const front = at(s, 0, -1, -1);
    t.check(path[0].x === front.x && path[0].z === front.z, `${id}: it starts in front of the build`);
    t.check(path.every((c) => block(c)?.typeId === "minecraft:grass_path"), `${id}: every block is a grass path`);
    t.check(path.every((c, i) => i === 0 || Math.abs(c.x - path[i - 1].x) + Math.abs(c.z - path[i - 1].z) === 1), `${id}: one block at a time`);
    t.check(path.every((c, i) => i === 0 || Math.abs(c.y - path[i - 1].y) <= 1), `${id}: steps of at most 1`);
    const end = path.at(-1);
    t.check(Math.hypot(end.x - cx, end.z - cz) < Math.hypot(path[0].x - cx, path[0].z - cz), `${id}: it heads for the center`);
  }

  // The garden: its pen next to it, with its animals, once.
  town("finish", { town: "elm", project: "garden" });
  await t.waitUntil(async () => {
    d = await dump("elm");
    return prog(d, "pen")?.built === 1;
  }, { timeout: 4000, interval: 100, message: "the garden pen is built" });
  const pen = d.town.spots.pen;
  const garden = d.town.spots.garden;
  t.check(pen.a === 1, "the pen's spot was picked automatically");
  const gm = at(garden, 0, 0, 3);
  t.check(Math.hypot(pen.x - gm.x, pen.z - gm.z) <= 34, `the pen is next to the garden (${Math.round(Math.hypot(pen.x - gm.x, pen.z - gm.z))} blocks)`);
  t.check(block(at(pen, 0, 0, 1))?.typeId === "minecraft:fence_gate", "a gate in the front side");
  let ring = 0;
  for (let x = -2; x <= 2; x++) for (let z = 1; z <= 5; z++) if ((Math.abs(x) === 2 || z === 1 || z === 5) && block(at(pen, x, 0, z))?.typeId === "minecraft:oak_fence") ring++;
  t.check(ring === 15, `a fence ring (${ring} of 15)`);
  await t.wait(5);
  const animals = dim.getEntities({ tags: ["town:a:elm"] });
  const kinds = animals.map((e) => e.typeId).sort();
  t.check(JSON.stringify(kinds) === JSON.stringify(["minecraft:chicken", "minecraft:chicken", "minecraft:sheep", "minecraft:sheep"]), `2 sheep and 2 chickens (${kinds})`);
  t.check(prog(d, "pen").an === 1, "spawned once (an: 1)");

  // Pen animals are ordinary animals that despawn once players are away: those that vanish come back while a player
  // is by the pen, the ones killed don't (no free food). One sheep killed, the other three removed (as a despawn does).
  const back = { ...p.location };
  animals.find((e) => e.typeId === "minecraft:sheep").kill();
  await t.wait(5);
  for (const e of dim.getEntities({ tags: ["town:a:elm"] })) e.remove();
  p.teleport({ x: pen.x + 0.5, y: pen.y, z: pen.z - 4.5 });
  let again = [];
  await t.waitUntil(() => (again = dim.getEntities({ tags: ["town:a:elm"] })).length >= 3, { timeout: 1600, interval: 20, message: "the vanished animals come back" });
  await t.wait(700); // one more check: nothing more comes
  again = dim.getEntities({ tags: ["town:a:elm"] });
  t.check(JSON.stringify(again.map((e) => e.typeId).sort()) === JSON.stringify(["minecraft:chicken", "minecraft:chicken", "minecraft:sheep"]), `the 3 that vanished are back, not the killed sheep (${again.map((e) => e.typeId)})`);
  d = await dump("elm");
  t.check(JSON.stringify(prog(d, "pen").k) === JSON.stringify(["minecraft:sheep"]), `the kill is counted (k: ${JSON.stringify(prog(d, "pen").k)})`);
  p.teleport(back);
  await t.wait(20);

  // Lantern posts at level 2, once its builds are up (the houses too).
  await t.waitUntil(async () => {
    d = await dump("elm");
    return d.town.lp === 2;
  }, { timeout: 6000, interval: 100, message: "lantern posts placed for level 2" });
  const posts = Object.values(d.life).flatMap((v) => cells(v[1], cx, cz));
  const paths = Object.entries(d.life).filter(([k]) => !k.startsWith("~")).map(([, v]) => cells(v[0], cx, cz));
  t.log(`paths: ${paths.map((x) => x.length).join(", ")}; posts: ${posts.length}`);
  t.check(posts.length <= 12, "at most 12 posts");
  if (paths.some((x) => x.length >= 8)) t.check(posts.length >= 1, "a post beside a path of 8 blocks or more");
  const onPath = new Set(paths.flat().map((c) => `${c.x},${c.z}`));
  for (const q of posts) {
    t.check(block(q)?.typeId === "minecraft:oak_fence" && block({ x: q.x, y: q.y + 1, z: q.z })?.typeId === "minecraft:lantern", `a fence with a lantern at ${q.x}, ${q.y}, ${q.z}`);
    t.check(!onPath.has(`${q.x},${q.z}`), "never on a path");
    t.check([...onPath].some((k) => { const [x, z] = k.split(",").map(Number); return Math.abs(x - q.x) + Math.abs(z - q.z) === 1; }), "right beside a path");
  }

  // The notice board: projects done and residents; the newest residents.
  await t.waitUntil(async () => {
    since = t.tick;
    town("census", { town: "elm" });
    await t.waitMessage(p, /census of elm/, { since, timeout: 60 });
    d = await dump("elm");
    return d.residents.new.length > 0;
  }, { timeout: 2400, interval: 100, message: "a family moved in" });
  await t.wait(5);
  const board = d.town.spots.notice_board;
  const sign = (x) => {
    try {
      return block(at(board, x, 1, 0))?.getComponent("minecraft:sign")?.getText() ?? "";
    } catch {
      return "";
    }
  };
  t.log(`signs: ${JSON.stringify([sign(-1), sign(0), sign(1)])}`);
  const living = d.residents.r.filter((r) => r.d === undefined).length;
  t.check(sign(0).includes("Projects done") && sign(0).includes(`Residents: ${living}`), `sign 2: projects done and ${living} residents`);
  t.check(sign(1).startsWith("New families") && d.residents.new.some((n) => sign(1).includes(n)), "sign 3: the newest residents");

  // The town's news, told by its own mayor.
  await t.waitUntil(() => of("realm:gossip").some((m) => m.kind === "town_life"), { timeout: 2400, interval: 20, message: "town_life gossip" });
  const life = of("realm:gossip").filter((m) => m.kind === "town_life");
  t.log("town_life:", JSON.stringify(life));
  t.check(life.every((m) => m.from === "mayor:elm" && m.place === "Elm" && !m.player), "from Elm's mayor, about Elm, about no player");
  sys.sendScriptEvent("realm:npc_debug", JSON.stringify({ action: "gossip" }));
  await t.waitUntil(() => of("realm:npc_gossip").length > 0, { timeout: 60, message: "npc_gossip answer" });
  const kept = of("realm:npc_gossip").at(-1).last.filter((x) => x[0] === "town_life");
  t.check(kept.length >= 1 && kept.every((x) => x[2] === "Elm" && x[3] === "mayor:elm"), `Townsfolk keeps it as Elm's mayor's (${JSON.stringify(kept)})`);

  // Remove spot: the well's path goes back to grass.
  const wellPath = cells(d.life.well?.[0], cx, cz);
  since = t.tick;
  town("remove", { town: "elm", project: "well" });
  await t.waitMessage(p, /Well was taken away/, { since, timeout: 60 });
  await t.wait(5);
  t.check(wellPath.every((c) => block(c)?.typeId === "minecraft:grass_block"), `the well's path is grass again (${wellPath.length} blocks)`);
  d = await dump("elm");
  t.check(!d.life.well && !d.life["~well"], "and forgotten");
}
