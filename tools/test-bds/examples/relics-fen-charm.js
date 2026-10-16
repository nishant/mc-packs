// Relics: the Fen Charm (vesna_charm) carried keeps Poison off (Wither still takes it until Starlit). BDS 1.26 hands
// beforeEvents.effectAdd the effect's display name ("Poison"), not its id: before relics_bp 1.2.5 the charm compared
// against "poison" and never blocked anything.
//   node tools/test-bds/run.mjs --quiet --only relics_bp --scenario tools/test-bds/examples/relics-fen-charm.js --timeout 300
export default async function (t) {
  const p = await t.player("Fen", { op: true, gameMode: "survival" });
  await t.wait(20);
  const since = t.tick;
  t.system.sendScriptEvent("realm:relic_give", JSON.stringify({ player: p.id, relic: "vesna_charm" }));
  await t.waitUntil(() => t.messages(p, { since }).length > 0, { timeout: 60, message: "the relic was given" });
  t.log("messages:", t.messages(p, { since }).map((m) => m.plain).join(" | "));
  await t.seconds(3); // the pack looks at what each player carries
  p.addEffect("poison", 200, { amplifier: 0 });
  await t.wait(2);
  t.check(!p.getEffect("poison"), `no Poison with the Fen Charm (${p.getEffect("poison")?.duration ?? 0} ticks)`);
  p.addEffect("wither", 100, { amplifier: 1 });
  await t.wait(2);
  t.check(!!p.getEffect("wither"), "Wither still takes (the charm isn't Starlit)");
  p.removeEffect("wither");
  // Without the charm, Poison takes.
  p.getComponent("inventory").container.clearAll();
  await t.seconds(3);
  p.addEffect("poison", 200, { amplifier: 0 });
  await t.wait(2);
  t.check(!!p.getEffect("poison"), "Poison takes without it");
}
