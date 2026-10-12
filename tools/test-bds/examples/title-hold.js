// The title protocol: side boxes wait while another pack's real title shows, then come back. Run with a
// Coordinates HUD that shows in a box (always on), Mob Health and the Blood Moon's title:
//   mkdir -p /tmp/th && cp -r packs/hud_bp packs/mobhp_bp packs/moon_bp /tmp/th/
//   sed -i 's/showAt: "hotbar"/showAt: "left1"/; s/defaultOn: false/defaultOn: true/' /tmp/th/hud_bp/scripts/config.js
//   node tools/test-bds/run.mjs --quiet --packs /tmp/th --scenario tools/test-bds/examples/title-hold.js
// Checks: the HUD draws its box (title "§s§2§r"); /realm:moon_set blood shows "Blood Moon" and sends
// realm:title first; no pack draws a box title while it lasts (a mob hit during it included); the box
// comes back within a few ticks after it ends.
const MARK = "§s§2§r";

export default async function (t) {
  for (const pack of ["hud_bp", "mobhp_bp", "moon_bp"]) if (!t.packs.includes(pack)) t.fail(`this scenario needs ${pack}`);
  /** @type {{ tick: number, from: string, ticks: number }[]} */
  const holds = [];
  /** @type {{ tick: number, text: string }[]} */
  const sides = [];
  t.mc.system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "realm:side") {
      const m = JSON.parse(message);
      if (m.from === "mobhp") sides.push({ tick: t.mc.system.currentTick, text: m.text });
    }
    if (id !== "realm:title") return;
    const m = JSON.parse(message);
    holds.push({ tick: t.mc.system.currentTick, from: m.from, ticks: m.ticks });
  });
  const p = await t.player("Tester", { op: true });
  const boxes = (since) => t.messages(p, { kind: "title", since }).filter((m) => m.text === MARK);

  await t.waitUntil(() => boxes(0).some((m) => m.pack === "hud_bp" && (m.subtitle ?? "").startsWith(MARK)), { timeout: 200, message: "the HUD draws its box" });
  t.log(`HUD box drawn, ${boxes(0).length} box titles so far`);

  t.server("/time set midnight");
  const since = t.tick;
  t.assert(t.cmd(p, "/realm:moon_set blood").ok, "/realm:moon_set ran");
  await t.waitUntil(() => t.messages(p, { kind: "title", pack: "moon_bp", since }).length, { timeout: 100, message: "the Blood Moon title shows" });
  const real = t.messages(p, { kind: "title", pack: "moon_bp", since })[0];
  t.log(`real title "${real.plain}" at tick ${real.tick} for ${real.ticks} ticks; subtitle "${real.subtitle}"`);
  const hold = holds.find((h) => h.from === "moon_bp");
  t.assert(hold, "moon_bp sent realm:title");
  t.log(`realm:title from moon_bp received at tick ${hold.tick} (title relayed at ${real.tick}), ticks ${hold.ticks}`);
  t.check(hold.ticks >= real.ticks, "the hold covers the whole title");

  // A hit during the hold: Mob Health updates its picture but doesn't draw.
  await t.wait(20);
  const pig = p.dimension.spawnEntity("minecraft:pig", { x: p.location.x + 1.5, y: p.location.y, z: p.location.z });
  await t.wait(5);
  const hit = pig.applyDamage(2, { cause: "entityAttack", damagingEntity: p });
  t.log(`pig hit: ${hit}, health ${pig.getComponent("minecraft:health")?.currentValue}`);
  await t.wait(5);
  t.check(sides.some((s) => s.tick > real.tick && s.text), `Mob Health wrote its box during the title (${JSON.stringify(sides[0]?.text ?? "nothing")})`);

  const end = real.tick + real.ticks;
  await t.waitUntil(() => t.tick > end, { timeout: 400 });
  const during = boxes(real.tick + 1).filter((m) => m.tick < end);
  t.check(during.length === 0, `no box drawn during the real title (saw ${during.map((m) => `${m.pack}@${m.tick}`).join(", ") || "none"})`);
  await t.waitUntil(() => boxes(end).some((m) => m.pack === "hud_bp"), { timeout: 30, message: "the HUD box comes back after the title" });
  const back = boxes(end).find((m) => m.pack === "hud_bp");
  t.log(`box back at tick ${back.tick} (${back.tick - end} ticks after the title ended)`);
  t.check(back.tick - end <= 8, "the box comes back within 8 ticks");
  t.check(!boxes(end).some((m) => m.pack === "mobhp_bp" && (m.subtitle ?? "").includes("Pig")), "the pig's health, long run out, doesn't come back");
}
