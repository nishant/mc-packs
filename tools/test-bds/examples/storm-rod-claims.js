// Storm Chasing and Land Claims (storm_bp, claims_bp): a charged lightning rod in someone else's claim keeps its
// Storm Glass. A visitor's tap is refused by the claim and collects nothing; the claim's owner then collects it.
// Two things the harness can't do on its own, so this runs against a hand-made test copy:
// - Bedrock stops delivering a canceled beforeEvents event to the packs after the one that canceled it, but not to
//   later subscribers in the same pack. The Realm runs one bundle (claims_bp's scripts load before storm_bp's), so
//   the bug only shows when both are in one pack: the copy is a two-pack mini bundle.
// - A simulated player's useItemOnBlock reaches playerInteractWithBlock only with isFirstEvent false (see
//   storm-cell.js), so the copy's tap handler ignores isFirstEvent.
//   S=/tmp/rodtest; rm -rf $S && mkdir -p $S/mini_bp/scripts
//   cp -r packs/claims_bp/scripts $S/mini_bp/scripts/claims_bp && cp -r packs/storm_bp/scripts $S/mini_bp/scripts/storm_bp
//   printf 'import "./claims_bp/main.js";\nimport "./storm_bp/main.js";\n' > $S/mini_bp/scripts/main.js
//   sed -e 's/6540ee31-3904-4ab5-a977-d106937548d6/11111111-2222-4333-8444-555555555555/' \
//       -e 's/3cd47162-5243-4a21-80e9-bd646fee6830/11111111-2222-4333-8444-666666666666/' packs/storm_bp/manifest.json > $S/mini_bp/manifest.json
//   sed -i 's/if (event.cancel || !isFirstEvent || !isRod/if (event.cancel || !isRod/' $S/mini_bp/scripts/storm_bp/main.js
//   node tools/test-bds/run.mjs --quiet --flat --packs $S --scenario tools/test-bds/examples/storm-rod-claims.js --timeout 420
// Before the fix (no event.cancel check in storm_bp's tap handler) the visitor got the glass and this failed.
export default async function (t) {
  const { ItemStack, Direction } = t.mc;
  const dim = t.dimension;
  const own = await t.player("Owner", { gameMode: "survival" });
  const base = { x: Math.floor(own.location.x), y: Math.floor(own.location.y), z: Math.floor(own.location.z) };
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "c1", pack: "claims_bp", key: "enabled", value: true }));
  await t.wait(3);
  t.answerForm(own, "Claim this land");
  t.cmd(own, "/realm:claim");
  t.log((await t.waitMessage(own, /Claimed/, { timeout: 60 })).plain);

  // The owner places a lightning rod inside the claim, 1 block from its east edge (radius 16).
  const rod = { x: base.x + 15, y: base.y, z: base.z };
  const floor = { x: rod.x, y: rod.y - 1, z: rod.z };
  dim.getBlock(floor).setType("minecraft:stone");
  dim.getBlock(rod).setType("minecraft:air");
  own.teleport({ x: rod.x - 2 + 0.5, y: rod.y, z: rod.z + 0.5 });
  await t.wait(5);
  own.giveItem(new ItemStack("minecraft:lightning_rod", 1), true);
  await t.wait(2);
  own.useItemInSlotOnBlock(own.selectedSlotIndex, floor, Direction.Up);
  await t.waitUntil(() => dim.getBlock(rod)?.typeId === "minecraft:lightning_rod", { timeout: 40, message: "the owner placed the rod" });
  await t.wait(5);
  dim.spawnEntity("minecraft:lightning_bolt", { x: rod.x + 0.5, y: rod.y + 1, z: rod.z + 0.5 });
  await t.wait(20);

  // A visitor just outside the claim taps the charged rod (holding a block, as anyone could).
  const visitor = await t.player("Visitor", { x: rod.x + 2, z: rod.z, gameMode: "survival" });
  visitor.teleport({ x: rod.x + 2 + 0.5, y: rod.y, z: rod.z + 0.5 }, { facingLocation: { x: rod.x + 0.5, y: rod.y + 0.5, z: rod.z + 0.5 } });
  await t.wait(5);
  visitor.giveItem(new ItemStack("minecraft:cobblestone", 1), true);
  await t.wait(2);
  const glass = (p) => {
    const c = p.getComponent("minecraft:inventory").container;
    let n = 0;
    for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId === "minecraft:prismarine_crystals") n += c.getItem(i).amount;
    return n;
  };
  const tapped = t.tick;
  t.assert(visitor.useItemInSlotOnBlock(visitor.selectedSlotIndex, rod, Direction.East), "the visitor tapped the rod");
  await t.wait(20);
  const stolen = t.messages(visitor, { since: tapped }).find((m) => /collect .* Storm Glass/.test(m.plain));
  t.check(!stolen && glass(visitor) === 0, `the visitor gets no Storm Glass from a rod in Owner's claim (${glass(visitor)}${stolen ? `, "${stolen.plain}"` : ""})`);

  // The owner taps it: the glass is still there for them.
  own.giveItem(new ItemStack("minecraft:cobblestone", 1), true);
  await t.wait(2);
  const mine = t.tick;
  own.useItemInSlotOnBlock(own.selectedSlotIndex, rod, Direction.West);
  const got = await t.waitMessage(own, /collect \d+ Storm Glass/, { timeout: 60, since: mine }).catch(() => undefined);
  t.log("owner:", got?.plain);
  t.check(!!got && glass(own) > 0, `the owner collects the glass (${glass(own)})`);
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "c2", pack: "claims_bp", key: "enabled", value: false }));
}
