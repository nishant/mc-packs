// Owed stores (O23): a world saved with the old layout (every player's owed dishes in the one property
// `cooking:owed`) is migrated by the real Cooking pack to one property per player plus an index, a physical restart
// keeps that, odd leftovers stay where they were, and a returning player is paid exactly once, even when one part's
// grant fails. The property reads come from Cooking's own console hook (`realm:cooking_owed_test`): dynamic
// properties belong to the add-on that wrote them, so this harness could not see them itself. About 60 s (three phases):
//   node tools/test-bds/run.mjs --quiet --timeout 900 --only cooking_bp --scenario tools/test-bds/examples/owed-legacy-restart.js
export default async function (t) {
  let report;
  t.system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "realm:cooking_owed_test_report") report = JSON.parse(message);
  });
  const ask = async (body) => {
    report = undefined;
    await t.console(`scriptevent realm:cooking_owed_test ${JSON.stringify(body)}`);
    return t.waitUntil(() => report, { timeout: 100, message: "cooking answered the owed test hook" });
  };
  const p = await t.player("Cook");
  const inv = p.getComponent("minecraft:inventory").container;
  const count = (name) => {
    let n = 0;
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (it && (it.nameTag ?? "").replace(/§./g, "").includes(name)) n += it.amount;
    }
    return n;
  };
  const longId = "9".repeat(30);
  const claim = async (fail) => {
    const r = await ask({ claim: "7001", as: "Cook", ...(fail ? { fail } : {}) });
    await t.wait(10);
    return r;
  };

  if (t.phase === 1) {
    await ask({
      seed: {
        7001: { harbor_chowder: 2, fishermans_breakfast: 1, mystery_dish: 3, note: "kept" },
        [longId]: { harbor_chowder: 1 },
      },
    });
    t.restart("old-layout owed map saved; restarting");
    return;
  }

  if (t.phase === 2) {
    const r = await ask({});
    t.log(JSON.stringify(r));
    t.assert(r.keys.includes("cooking:owed:7001") && r.keys.includes("cooking:owed_idx"), `per-player key and index exist (${r.keys})`);
    t.assert(JSON.stringify(r.index) === JSON.stringify(["7001"]), `the index lists the migrated player (${JSON.stringify(r.index)})`);
    const v = r.values["7001"];
    t.assert(v.harbor_chowder === 2 && v.fishermans_breakfast === 1 && v.mystery_dish === 3 && v.note === "kept", `unknown fields kept (${JSON.stringify(v)})`);
    t.assert(r.legacy && r.legacy[longId] && !("7001" in r.legacy), `the entry that can't be indexed stays in the old property, the moved one is gone (${JSON.stringify(r.legacy)})`);

    // The fishermans_breakfast grant fails: only that part is owed again, the chowders are paid once.
    const after = await claim(["fishermans_breakfast"]);
    t.assert(count("Harbor Chowder") === 2, `two chowders paid (${count("Harbor Chowder")})`);
    t.assert(count("Fisherman") === 0, "the failed part was not paid");
    t.assert(after.values["7001"]?.fishermans_breakfast === 1 && !after.values["7001"]?.harbor_chowder, `only the failed part is owed again (${JSON.stringify(after.values["7001"])})`);

    const done = await claim();
    t.assert(count("Fisherman") === 1 && count("Harbor Chowder") === 2, `the rest is paid once (${count("Fisherman")}, ${count("Harbor Chowder")})`);
    t.assert(!("7001" in done.values) && !done.index.includes("7001") && !done.keys.includes("cooking:owed:7001"), "nothing left for the player");
    await claim();
    t.assert(count("Fisherman") === 1 && count("Harbor Chowder") === 2, "a second claim pays nothing");
    t.restart("paid; restarting to prove it stays paid");
    return;
  }

  const r = await ask({});
  t.assert(!r.keys.includes("cooking:owed:7001") && !r.index.includes("7001"), `still nothing owed after the restart (${JSON.stringify(r.keys)})`);
  t.assert(r.legacy && r.legacy[longId], "the leftover is still in the old property");
  await claim();
  t.assert(count("Fisherman") === 0 && count("Harbor Chowder") === 0, "no repeat payment after a restart");
}
