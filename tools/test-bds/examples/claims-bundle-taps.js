// Land Claims with Chairs and Slot Machine (claims_bp, chairs_bp, slots_bp): in someone else's claim a visitor can't
// sit on a stair or play a slot machine; the claim's owner still can.
// Two things the harness can't do on its own, so this runs against a hand-made test copy:
// - Bedrock stops delivering a canceled beforeEvents event to the packs after the one that canceled it, but not to
//   later subscribers in the same pack. The Realm runs one bundle (folders in alphabetical order: chairs_bp's
//   scripts load before claims_bp's, slots_bp's after), so the bug only shows when they are in one pack: the copy
//   is a three-pack mini bundle in that order.
// - A simulated player's empty-hand tap fires no interact event, so the copy's Chairs tap handler also takes a tap
//   with an item in hand (and ignores isFirstEvent, which is false for a simulated player's useItemOnBlock).
//   S=/tmp/claimtaps; rm -rf $S && mkdir -p $S/mini_bp/scripts
//   for p in chairs_bp claims_bp slots_bp; do cp -r packs/$p/scripts $S/mini_bp/scripts/$p; done
//   cp -r packs/chairs_bp/entities $S/mini_bp/
//   printf 'import "./chairs_bp/main.js";\nimport "./claims_bp/main.js";\nimport "./slots_bp/main.js";\n' > $S/mini_bp/scripts/main.js
//   node -e 'const m = require("./packs/chairs_bp/manifest.json"); m.header.uuid = "11111111-2222-4333-8444-777777777777";
//     m.modules.forEach((x, i) => (x.uuid = `11111111-2222-4333-8444-88888888888${i}`));
//     m.dependencies.push({ module_name: "@minecraft/server-ui", version: "2.0.0" });
//     require("fs").writeFileSync(process.argv[1] + "/mini_bp/manifest.json", JSON.stringify(m))' $S
//   sed -i 's/if (event.cancel || !isFirstEvent || itemStack || player.isSneaking)/if (event.cancel || player.isSneaking)/' $S/mini_bp/scripts/chairs_bp/main.js
//   node tools/test-bds/run.mjs --quiet --flat --packs $S --scenario tools/test-bds/examples/claims-bundle-taps.js --timeout 420
// Before the fix (Chairs seated anyone; Slot Machine ignored event.cancel) the visitor sat down and got the machine.
export default async function (t) {
  const { ItemStack, Direction } = t.mc;
  const dim = t.dimension;
  const own = await t.player("Owner", { gameMode: "survival", op: true });
  const base = { x: Math.floor(own.location.x), y: Math.floor(own.location.y), z: Math.floor(own.location.z) };
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "c1", pack: "claims_bp", key: "enabled", value: true }));
  await t.wait(3);
  t.answerForm(own, "Claim this land");
  t.cmd(own, "/realm:claim");
  t.log((await t.waitMessage(own, /Claimed/, { timeout: 60 })).plain);

  // A stair and a note block inside the claim (radius 16), on stone, with air above.
  const stair = { x: base.x + 10, y: base.y, z: base.z };
  const box = { x: base.x + 10, y: base.y, z: base.z + 4 };
  for (const at of [stair, box]) {
    dim.getBlock({ x: at.x, y: at.y - 1, z: at.z }).setType("minecraft:stone");
    for (let dy = 1; dy <= 2; dy++) dim.getBlock({ x: at.x, y: at.y + dy, z: at.z }).setType("minecraft:air");
  }
  dim.getBlock(stair).setType("minecraft:oak_stairs");
  dim.getBlock(box).setType("minecraft:noteblock");

  // The owner (an operator) makes the note block a slot machine.
  own.teleport({ x: box.x - 2 + 0.5, y: box.y, z: box.z + 0.5 }, { facingLocation: { x: box.x + 0.5, y: box.y + 0.5, z: box.z + 0.5 } });
  await t.wait(5);
  own.lookAtBlock(box);
  await t.wait(2);
  const made = t.tick;
  t.answerForm(own, "Operator tools", "Make the block I look at a machine");
  t.cmd(own, "/realm:slots");
  t.log((await t.waitMessage(own, /is now a slot machine/, { timeout: 60, since: made })).plain);

  // A visitor holding a block taps the stair, then the machine.
  const visitor = await t.player("Visitor", { x: stair.x + 2, z: stair.z, gameMode: "survival" });
  const hold = async (p) => {
    p.giveItem(new ItemStack("minecraft:cobblestone", 1), true);
    await t.wait(2);
  };
  const riding = (p) => !!p.getComponent("minecraft:riding");
  visitor.teleport({ x: stair.x + 1 + 0.5, y: stair.y, z: stair.z + 0.5 });
  await t.wait(5);
  await hold(visitor);
  const sat = t.tick;
  t.assert(visitor.useItemInSlotOnBlock(visitor.selectedSlotIndex, stair, Direction.Up), "the visitor tapped the stair");
  await t.wait(20);
  const refused = t.messages(visitor, { since: sat }).some((m) => /This land is claimed/.test(m.plain));
  t.check(!riding(visitor), `the visitor can't sit on a stair in Owner's claim (refused: ${refused})`);

  visitor.teleport({ x: box.x + 1 + 0.5, y: box.y, z: box.z + 0.5 });
  await t.wait(5);
  await hold(visitor);
  const formsBefore = t.forms(visitor).length;
  t.assert(visitor.useItemInSlotOnBlock(visitor.selectedSlotIndex, box, Direction.Up), "the visitor tapped the machine");
  await t.wait(20);
  t.check(t.forms(visitor).length === formsBefore, `the visitor gets no slot machine in Owner's claim (${t.forms(visitor).slice(formsBefore).map((f) => f.title).join(", ")})`);

  // The owner can do both.
  await hold(own);
  const menu = t.waitForm(own, { timeout: 60 });
  own.useItemInSlotOnBlock(own.selectedSlotIndex, box, Direction.Up);
  const form = await menu;
  t.log("owner's machine:", form.title);
  form.answer(null);
  own.teleport({ x: stair.x - 1 + 0.5, y: stair.y, z: stair.z + 0.5 });
  await t.wait(20);
  await hold(own);
  t.assert(own.useItemInSlotOnBlock(own.selectedSlotIndex, stair, Direction.Up), "the owner tapped the stair");
  await t.waitUntil(() => riding(own), { timeout: 40, message: "the owner sits on the stair" });
  t.log("the owner sits");
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "c2", pack: "claims_bp", key: "enabled", value: false }));
}
