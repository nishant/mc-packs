// Elytra HUD's Run Away disc with Land Claims (claims_bp, elytra_bp): a visitor can't take the disc out of a jukebox
// in someone else's claim; the owner still can.
// In the Realm Bundle (folders in alphabetical order) claims_bp's tap handler runs before elytra_bp's in one script
// context, so Elytra still gets the tap Claims canceled; the harness runs packs separately, which hides it. So this
// runs against a two-pack mini bundle in that order:
//   S=/tmp/jukeclaims; rm -rf $S && mkdir -p $S/mini_bp/scripts
//   for p in claims_bp elytra_bp; do cp -r packs/$p/scripts $S/mini_bp/scripts/$p; done
//   cp -r packs/elytra_bp/items packs/elytra_bp/recipes $S/mini_bp/
//   printf 'import "./claims_bp/main.js";\nimport "./elytra_bp/main.js";\n' > $S/mini_bp/scripts/main.js
//   node -e 'const m = require("./packs/elytra_bp/manifest.json"); m.header.uuid = "21111111-2222-4333-8444-777777777777";
//     m.modules.forEach((x, i) => (x.uuid = `21111111-2222-4333-8444-88888888888${i}`));
//     m.dependencies.push({ module_name: "@minecraft/server-ui", version: "2.0.0" });
//     require("fs").writeFileSync(process.argv[1] + "/mini_bp/manifest.json", JSON.stringify(m))' $S
//   node tools/test-bds/run.mjs --quiet --flat --packs $S --scenario tools/test-bds/examples/elytra-jukebox-claims.js --timeout 300
// Before the fix (the jukebox tap ignored event.cancel) the visitor's tap ejected the disc onto the ground.
const DISC = "custom:music_disc_run_away";

export default async function (t) {
  const { ItemStack, Direction } = t.mc;
  const dim = t.dimension;
  const own = await t.player("Owner", { gameMode: "survival", op: true });
  const base = { x: Math.floor(own.location.x), y: Math.floor(own.location.y), z: Math.floor(own.location.z) };
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "j1", pack: "claims_bp", key: "enabled", value: true }));
  await t.wait(3);
  t.answerForm(own, "Claim this land");
  t.cmd(own, "/realm:claim");
  t.log((await t.waitMessage(own, /Claimed/, { timeout: 60 })).plain);

  const box = { x: base.x + 8, y: base.y, z: base.z };
  dim.getBlock({ x: box.x, y: box.y - 1, z: box.z }).setType("minecraft:stone");
  for (let dy = 1; dy <= 2; dy++) dim.getBlock({ x: box.x, y: box.y + dy, z: box.z }).setType("minecraft:air");
  dim.getBlock(box).setType("minecraft:jukebox");
  const discs = () => dim.getEntities({ type: "minecraft:item", location: { x: box.x + 0.5, y: box.y + 1, z: box.z + 0.5 }, maxDistance: 4 })
    .filter((e) => e.getComponent("minecraft:item")?.itemStack?.typeId === DISC).length;

  // The owner puts the disc in.
  const inv = own.getComponent("minecraft:inventory").container;
  inv.setItem(0, new ItemStack(DISC, 1));
  own.selectedSlotIndex = 0;
  own.teleport({ x: box.x - 2 + 0.5, y: box.y, z: box.z + 0.5 }, { facingLocation: { x: box.x + 0.5, y: box.y + 0.5, z: box.z + 0.5 } });
  await t.wait(10);
  own.useItemInSlotOnBlock(0, box, Direction.Up);
  await t.wait(10);
  t.assert(inv.getItem(0)?.typeId !== DISC, "the owner's disc went into the jukebox");

  // A visitor holding a block taps the jukebox: the disc stays in.
  const visitor = await t.player("Visitor", { x: box.x + 2, z: box.z, gameMode: "survival" });
  visitor.getComponent("minecraft:inventory").container.setItem(0, new ItemStack("minecraft:cobblestone", 1));
  visitor.selectedSlotIndex = 0;
  visitor.teleport({ x: box.x + 2 + 0.5, y: box.y, z: box.z + 0.5 }, { facingLocation: { x: box.x + 0.5, y: box.y + 0.5, z: box.z + 0.5 } });
  await t.wait(10);
  visitor.useItemInSlotOnBlock(0, box, Direction.Up);
  await t.wait(20);
  const vinv = visitor.getComponent("minecraft:inventory").container;
  let took = 0;
  for (let i = 0; i < vinv.size; i++) if (vinv.getItem(i)?.typeId === DISC) took++;
  t.check(discs() + took === 0, `the visitor's tap leaves the disc in the jukebox (${discs()} on the ground, ${took} picked up)`);

  // The owner takes it out.
  inv.setItem(0, new ItemStack("minecraft:cobblestone", 1));
  await t.wait(30);
  own.useItemInSlotOnBlock(0, box, Direction.Up);
  await t.wait(20);
  // The ejected disc pops out on top of the jukebox: either player, standing 2 blocks away, may pick it up.
  let picked = 0;
  for (const c of [inv, vinv]) for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId === DISC) picked++;
  t.check(discs() + picked === 1, `the owner's tap ejects the disc (${discs()} on the ground, ${picked} picked up)`);
}
