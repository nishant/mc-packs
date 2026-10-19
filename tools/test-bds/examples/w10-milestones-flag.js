// W10 O53: the first check saves tf on the player's record, so a later join of the same id does not
// re-send old top-tier titles. Simulated rejoin changes the id, so this reads the saved record after leave.
// Not run by the author.
//   node tools/test-bds/run.mjs --quiet --only milestones_bp --scenario tools/test-bds/examples/w10-milestones-flag.js --timeout 300
export default async function (t) {
  /** @type {{ id: string, m: any }[]} */
  const events = [];
  t.system.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "realm:title_unlock") return;
      try {
        events.push({ id, m: JSON.parse(message) });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  await t.console("scoreboard objectives add stats_joins dummy");
  await t.console("scoreboard players set Ann stats_joins 400");
  const ann = await t.player("Ann");
  await t.waitUntil(() => events.some((e) => e.m.player === ann.id && e.m.title === "Loyal III"), { timeout: 400, message: "Loyal III" });
  const id = ann.id;
  ann.disconnect();
  await t.wait(20);
  const raw = t.world.getDynamicProperty("milestones:p:" + id);
  t.log("record:", String(raw).slice(0, 240));
  t.assert(typeof raw === "string", "the record was saved");
  const rec = JSON.parse(String(raw));
  t.check(rec.tf === 1, "join flag saved");
  t.check(rec.n === "Ann" && rec.g && rec.g.joins >= 3, "name and reached tiers stay");
}
