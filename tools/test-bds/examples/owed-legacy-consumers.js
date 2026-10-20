// Owed stores (O23, W4) in the five packs besides Cooking: Relics (gifts), Fishing (tournament prizes), Bounties (Crowns),
// Guilds (reputation) and Town Projects (Crowns and finished projects). Each one saved everything it owed absent players in
// one property; a world saved with that old layout, in each pack's real legacy shape, is migrated by the real pack on first
// use to one property per player plus an index. Checked per pack: the migrated value (unknown fields kept), the index, an
// id too long to index and a record the pack's own normalize rejects both left in the old property, the player paid exactly
// once by the pack's own join code, and all of it still true after a physical restart.
// The properties belong to each pack's add-on, so they are seeded and read by a harness-only probe added to copies of the
// packs (tools/test-bds/hooks/owed-probe.mjs). It uses only raw properties and the pack's own playerSpawn listeners, so the
// same recipe runs a tree from before the owed stores (7eb5f72): there, phase 2 fails at the first pack's "per-player key
// and index exist" (the old code still keeps the one property), which is the migration this checks. About 4 minutes:
//   mkdir -p /tmp/owed-consumers
//   node tools/test-bds/hooks/owed-probe.mjs /tmp/owed-consumers/packs relics_bp,fishing_bp,bounty_bp,guilds_bp,town_bp
//   node tools/test-bds/run.mjs --quiet --timeout 1200 --packs /tmp/owed-consumers/packs --only relics_bp,fishing_bp,bounty_bp,guilds_bp,town_bp --scenario tools/test-bds/examples/owed-legacy-consumers.js
const LONG = "9".repeat(30);
const PACKS = [
  {
    folder: "relics_bp",
    base: "relics:pending",
    who: "Relic",
    seed: { 7001: { r: ["rain_charm"], s: 5, note: "kept" }, [LONG]: { r: [], s: 1 }, 7003: 5 },
    rejected: "7003",
  },
  {
    folder: "fishing_bp",
    base: "fishing:owed",
    who: "Fisher",
    seed: { 7001: [300, "Fishing tournament: 1st place", "tournament_5"], [LONG]: [10, "x", "y"], 7003: { crowns: 9 } },
    rejected: "7003",
  },
  { folder: "bounty_bp", base: "bounty:pending", who: "Hunter", seed: { 7001: 250, [LONG]: 5, 7003: "lots" }, rejected: "7003" },
  {
    folder: "guilds_bp",
    base: "guilds:pending",
    who: "Member",
    seed: { 7001: { miners: 40, growers: 7, keep: "kept" }, [LONG]: { miners: 1 }, 7003: [1] },
    rejected: "7003",
  },
  {
    folder: "town_bp",
    base: "town:owed",
    who: "Builder",
    seed: { 7001: { cr: 120, q: [["well", "The Well", "growers"]], note: "kept" }, [LONG]: { cr: 1, q: [] }, 7003: "x" },
    rejected: "7003",
  },
];

export default async function (t) {
  const reports = new Map();
  t.system.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "harness:owed_report") return;
      try {
        const r = JSON.parse(message);
        reports.set(r.id, r);
      } catch {}
    },
    { namespaces: ["harness"] },
  );
  let seq = 0;
  const probe = async (pack, body) => {
    const id = `${pack.folder}-${t.phase}-${++seq}`;
    await t.console(`scriptevent harness:owed_probe ${JSON.stringify({ id, folder: pack.folder, base: pack.base, ...body })}`);
    const r = await t.waitUntil(() => reports.get(id), { timeout: 100, message: `${pack.folder} answered the owed probe (${JSON.stringify(body).slice(0, 60)})` });
    t.assert(!r.error, `${pack.folder} probe: ${r.error ?? "ok"}`);
    return r;
  };
  const score = (p, objective) => {
    try {
      return t.world.scoreboard.getObjective(objective)?.getScore(p) ?? 0;
    } catch {
      return 0;
    }
  };
  const carried = (p, name) => {
    const inv = p.getComponent("minecraft:inventory").container;
    let n = 0;
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (it && (it.nameTag ?? "").replace(/§./g, "").includes(name)) n += it.amount;
    }
    return n;
  };
  /** What the pack paid the player so far, in its own currency. */
  const paid = (pack, p) => {
    if (pack.folder === "relics_bp") return { charm: carried(p, "Rain Charm"), shards: carried(p, "Relic Shard") };
    if (pack.folder === "guilds_bp") return { miners: score(p, "rep_miners"), growers: score(p, "rep_growers") };
    return { crowns: score(p, "crowns") };
  };
  const expected = {
    relics_bp: { charm: 1, shards: 5 },
    fishing_bp: { crowns: 300 },
    bounty_bp: { crowns: 250 },
    guilds_bp: { miners: 40, growers: 7 },
    town_bp: { crowns: 120 },
  };
  const delta = (a, b) => Object.fromEntries(Object.keys(b).map((k) => [k, b[k] - (a[k] ?? 0)]));
  /** The leftovers: the id that can't be indexed and the record normalize rejected, nothing else. */
  const leftoverOk = (pack, legacy) => !!legacy && typeof legacy === "object" && JSON.stringify(legacy[LONG]) === JSON.stringify(pack.seed[LONG]) && JSON.stringify(legacy[pack.rejected]) === JSON.stringify(pack.seed[pack.rejected]) && !("7001" in legacy);

  if (t.phase === 1) {
    for (const pack of PACKS) {
      const r = await probe(pack, { seed: pack.seed, dump: true });
      t.assert(JSON.stringify(r.legacy) === JSON.stringify(pack.seed), `${pack.folder}: the old one-property layout is saved (${JSON.stringify(r.legacy).slice(0, 120)})`);
    }
    t.restart("old-layout owed maps saved for five packs; restarting with the packs that migrate them");
    return;
  }

  // Joining makes each pack use its store (take on join), which migrates it. Town pays 200 ticks after joining.
  const players = new Map();
  for (const [i, pack] of PACKS.entries()) players.set(pack.folder, await t.player(pack.who, { x: 160 + i * 3, z: 170 }));
  await t.wait(260);

  if (t.phase === 2) {
    for (const pack of PACKS) {
      const p = players.get(pack.folder);
      const r = await probe(pack, { dump: true });
      t.log(`${pack.folder} after migration: ${JSON.stringify(r).slice(0, 400)}`);
      t.assert(r.keys.includes(`${pack.base}:7001`) && r.keys.includes(`${pack.base}_idx`), `${pack.folder}: per-player key and index exist (${r.keys})`);
      t.check(JSON.stringify(r.index) === JSON.stringify(["7001"]), `${pack.folder}: the index lists only the migrated player (${JSON.stringify(r.index)})`);
      const want = { ...pack.seed["7001"] };
      const got = r.values["7001"];
      if (pack.folder === "town_bp") t.check(got?.cr === 120 && got?.note === "kept" && JSON.stringify(got?.q) === JSON.stringify(want.q), `${pack.folder}: the record is migrated, unknown fields kept (${JSON.stringify(got)})`);
      else t.check(JSON.stringify(got) === JSON.stringify(want), `${pack.folder}: the record is migrated as it was, unknown fields kept (${JSON.stringify(got)})`);
      t.check(leftoverOk(pack, r.legacy), `${pack.folder}: the long id and the record it can't read stay in the old property, the moved one is gone (${JSON.stringify(r.legacy)})`);

      // Hand the migrated entry to the player and let the pack's own join code pay it.
      const before = paid(pack, p);
      await probe(pack, { rekey: ["7001", pack.who] });
      await probe(pack, { join: pack.who });
      await t.wait(230);
      const got1 = delta(before, paid(pack, p));
      t.check(JSON.stringify(got1) === JSON.stringify(expected[pack.folder]), `${pack.folder}: paid exactly what was owed on joining (${JSON.stringify(got1)})`);
      const after = await probe(pack, { dump: true });
      t.check(!after.keys.some((k) => k.startsWith(`${pack.base}:`)) && !(after.index ?? []).length, `${pack.folder}: nothing left owed (${JSON.stringify(after.keys)} ${JSON.stringify(after.index)})`);

      const mid = paid(pack, p);
      await probe(pack, { join: pack.who });
      await t.wait(230);
      t.check(JSON.stringify(delta(mid, paid(pack, p))) === JSON.stringify(Object.fromEntries(Object.keys(mid).map((k) => [k, 0]))), `${pack.folder}: joining again pays nothing (${JSON.stringify(delta(mid, paid(pack, p)))})`);
    }
    t.assert(t.failures.length === 0, `phase 2: ${t.failures.length} failed checks`);
    t.restart("paid; restarting to prove it stays paid and the leftovers stay");
    return;
  }

  for (const pack of PACKS) {
    const r = await probe(pack, { dump: true });
    t.check(!r.keys.some((k) => k.startsWith(`${pack.base}:`)) && !(r.index ?? []).length, `${pack.folder}: still nothing owed after the restart (${JSON.stringify(r.keys)})`);
    t.check(leftoverOk(pack, r.legacy), `${pack.folder}: the leftovers are still in the old property after the restart (${JSON.stringify(r.legacy)})`);
  }
  t.assert(t.failures.length === 0, `phase 3: ${t.failures.length} failed checks`);
}
