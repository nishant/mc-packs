// Performance of the townsfolk name labels with a crowd: all 12 townsfolk placed in a square near the spawn and
// many simulated players walking in and out around them (in and out of the 20-block resend range), so the helper
// labels are spawned, moved, resent and removed. Meant for run.mjs --profile; it checks only that every townsfolk
// has exactly one helper while players are near and that no helper is left once they all go far away.
//   node tools/test-bds/run.mjs --quiet --no-relay --profile --only npc_bp,build_rp --scenario tools/test-bds/examples/npc-labels-perf.js --arg players=40 --arg seconds=60 --timeout 900
// Arguments: players (default 20), seconds (default 60).
const IDS = ["mara", "tobin", "reyes", "elsie", "bram", "quill", "ida", "sol", "hollis", "moss", "wren", "bea"];

export default async function (t) {
  const N = Math.max(1, Number(t.args.players ?? 20));
  const SECONDS = Math.max(10, Number(t.args.seconds ?? 60));
  t.server("/gamerule domobspawning false");
  const op = await t.player("Op", { op: true, gameMode: "creative" });
  const dim = t.dimension;
  const c = { x: Math.floor(op.location.x) + 0.5, z: Math.floor(op.location.z) + 0.5 };
  for (let i = 0; i < IDS.length; i++) {
    const x = c.x + (i % 4) * 3, z = c.z + Math.floor(i / 4) * 3;
    const top = dim.getTopmostBlock({ x, z });
    op.teleport({ x, y: (top?.location.y ?? op.location.y) + 1, z });
    await t.wait(4);
    t.cmd(op, `/realm:npc_add ${IDS[i]}`);
    await t.wait(2);
  }
  const players = [op];
  for (let i = 1; i < N; i++) {
    const a = (i / N) * Math.PI * 2, r = 10 + (i % 3) * 6;
    players.push(await t.player(`Walker${String(i).padStart(2, "0")}`, { x: c.x + 4 + Math.cos(a) * r, z: c.z + 3 + Math.sin(a) * r }));
  }
  const labels = () => dim.getEntities({ type: "realm:npc_label" }).length;
  await t.wait(40);
  t.log(`${players.length} players around ${IDS.length} townsfolk: ${labels()} helpers`);
  t.check(labels() === IDS.length, `one helper per townsfolk (${labels()})`);
  const end = t.tick + SECONDS * 20;
  let walks = 0;
  while (t.tick < end) {
    for (const p of players) {
      if (Math.random() < 0.3) {
        const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 26;
        try {
          p.moveToLocation({ x: c.x + 4 + Math.cos(a) * r, y: p.location.y, z: c.z + 3 + Math.sin(a) * r });
          walks++;
        } catch {
          // left
        }
      }
    }
    await t.wait(20);
  }
  t.log(`${walks} walks; ${labels()} helpers`);
  t.check(labels() <= IDS.length, `never more than one helper each (${labels()})`);
  for (const p of players) p.teleport({ x: c.x + 400, y: 120, z: c.z });
  await t.wait(20);
  t.check(labels() === 0, `no helper left once everyone is far away (${labels()})`);
}
