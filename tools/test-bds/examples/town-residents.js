// Town Projects, residents (F39): with residents Enabled, a Settlement's finished well brings 2 villagers, tagged
// realm:resident, town:r:<town> and town:rid:<town>.<n>, named from residentNames, with the realm:resident property
// (town_bp's villager_v2 file) and a farmer's and a fisherman's look, standing by the well, and players in the town read
// "A new family moved into Elm". One is killed: its record waits for replaceMinutes of in-game time (5 here), then a
// new family comes with the message. One removed without a death (as a zombie conversion would) is missing for 2
// censuses, then replaced too. A villager given a resident's tags by hand loses them and stays alive.
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp --scenario tools/test-bds/examples/town-residents.js --timeout 4000
export default async function (t) {
  const dim = t.dimension;
  const p = await t.player("Ann", { op: true, x: 0, z: 0 });
  await t.loadArea(0, 0, { radius: 4 });
  const cfg = (key, value) => t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `${key}${t.tick}`, pack: "town_bp", key, value }));
  cfg("residents", true);
  cfg("replaceMinutes", 5);
  const town = (action, extra = {}) => t.system.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", ...extra }));
  const dump = async () => {
    await t.wait(1); // a dump just before answered in this tick: never take its message for this one
    const since = t.tick;
    town("dump", { town: "elm" });
    const m = await t.waitMessage(p, (x) => x.startsWith('{"town"'), { since, timeout: 60 });
    return JSON.parse(m.plain);
  };
  const census = async () => {
    const since = t.tick;
    town("census", { town: "elm" });
    await t.waitMessage(p, /census of elm/, { since, timeout: 60 });
  };
  const residents = () => dim.getEntities({ type: "minecraft:villager_v2", tags: ["town:r:elm"] });
  const NAMES = new Set(["Abel", "Agnes", "Arlo", "Basil", "Bertie", "Bonnie", "Cecil", "Clem", "Cyril", "Dale", "Della", "Dora", "Edie", "Elmer", "Etta", "Ezra", "Faye", "Floyd", "Gus", "Herb", "Hugo", "Jasper", "Lottie", "Lyle", "Mabel", "Milo", "Minnie", "Nora", "Opal", "Otto", "Percy", "Posy", "Rosa", "Rufus", "Tilly", "Toby", "Trudy", "Una", "Walt", "Zeke"]);

  let since = t.tick;
  town("add", { name: "Elm" });
  await t.waitMessage(p, /Town Elm added/, { since, timeout: 60 });
  let d;
  await t.waitUntil(async () => (d = await dump()).town.spots.well, { timeout: 6000, interval: 100, message: "the well's spot is picked" });
  await census();
  t.check(residents().length === 0, "no well built, nobody moves in");

  since = t.tick;
  town("finish", { town: "elm", project: "well" });
  await t.waitUntil(async () => (d = await dump()).progress.find(([x]) => x === "well")?.[1].built === 1, { timeout: 2400, interval: 100, message: "the well is built" });
  await t.waitUntil(async () => {
    await census();
    return residents().length >= 2;
  }, { timeout: 1200, interval: 100, message: "2 residents moved in" });
  await t.waitMessage(p, /A new family moved into Elm: [A-Z][a-z]+\./, { since, timeout: 200 });
  let rs = residents();
  t.check(rs.length === 2, `2 residents (${rs.length})`);
  d = await dump();
  t.check(d.residents.r.length === 2 && d.residents.r.every((r) => r.h === "well"), `both live at the well (${JSON.stringify(d.residents.r)})`);
  const s = d.town.spots.well;
  for (const e of rs) {
    const tags = e.getTags();
    t.check(tags.includes("realm:resident") && tags.some((x) => /^town:rid:elm\.\d+$/.test(x)), `${e.nameTag}: tagged (${tags.join(" ")})`);
    t.check(NAMES.has(e.nameTag), `${e.nameTag}: a name from residentNames`);
    t.check(e.getProperty("realm:resident") === true, `${e.nameTag}: the realm:town_resident group is on (property)`);
    t.check(Math.hypot(e.location.x - s.x, e.location.z - s.z) <= 12, `${e.nameTag}: by the well`);
  }
  t.check(new Set(rs.map((e) => e.nameTag)).size === 2, "two different names");
  t.check(rs.some((e) => e.matches({ families: ["farmer"] })) && rs.some((e) => e.matches({ families: ["fisherman"] })), "a farmer and a fisherman");
  t.check(d.town.log?.some(([, text]) => /new famil/.test(text)), "the story tells of them");

  // A death: replaced after replaceMinutes of in-game time.
  const victim = rs[0];
  const rid = victim.getTags().find((x) => x.startsWith("town:rid:"));
  victim.kill();
  await t.wait(10);
  d = await dump();
  const dead = d.residents.r.find((r) => r.d !== undefined);
  t.check(!!dead, "the death marks the family");
  const now = t.world.getAbsoluteTime();
  t.check(dead && dead.d > now && dead.d <= now + 5 * 1200 + 20, `due ${dead?.d} = about 5 in-game minutes after ${now}`);
  await census();
  t.check(residents().length === 1, "not before its time");
  since = t.tick;
  town("residents_due", { town: "elm" });
  await t.wait(5);
  await census();
  await t.waitMessage(p, /A new family moved into Elm/, { since, timeout: 100 });
  rs = residents();
  t.check(rs.length === 2, `a new family (${rs.length})`);
  t.check(!rs.some((e) => e.getTags().includes(rid)), "the new family has a new resident number");

  // Removed without a death: missing for 2 censuses, then replaced.
  const lost = rs[0];
  const lostId = lost.id;
  lost.remove();
  await census();
  d = await dump();
  t.check(d.residents.r.some((r) => r.m === 1), "missing once");
  await census();
  d = await dump();
  t.check(d.residents.r.some((r) => r.d !== undefined && r.e === undefined), "missing twice: gone");
  town("residents_due", { town: "elm" });
  await t.wait(5);
  await census();
  t.check(residents().length === 2 && !residents().some((e) => e.id === lostId), "replaced");

  // A villager with a resident's tags the town doesn't know: untagged, never killed.
  const stray = dim.spawnEntity("minecraft:villager_v2", { x: s.x + 0.5, y: s.y, z: s.z - 3.5 });
  stray.addTag("realm:resident");
  stray.addTag("town:r:elm");
  stray.addTag("town:rid:elm.999");
  await census();
  t.check(stray.isValid && !stray.hasTag("town:r:elm") && !stray.hasTag("realm:resident"), "a stray loses the tags and stays");
  t.check(residents().length === 2, "still 2");
}
