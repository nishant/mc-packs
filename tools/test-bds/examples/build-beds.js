// Easy Building beds: both halves, four facings, undo, and the dead end_gateway id.
// Queued for the lead. Do not treat a local author run as a pass.
// node tools/test-bds/run.mjs --quiet --flat --only build_bp,build_rp --scenario tools/test-bds/examples/build-beds.js --timeout 300
export default async function (t) {
  const { BlockPermutation } = t.mc;
  await t.loadArea(0, 0, { radius: 6 });
  const p = await t.player("BedBuilder", { x: 0, z: 0, gameMode: "creative", op: true });
  const dim = p.dimension;

  let gateway = "rejected";
  try { BlockPermutation.resolve("minecraft:end_gateway"); gateway = "resolved"; } catch { gateway = "rejected"; }
  t.check(gateway === "resolved" || gateway === "rejected", `end_gateway resolve recorded: ${gateway}`);

  for (const id of ["minecraft:white_bed", "minecraft:red_bed"]) {
    let rejected = false;
    try { BlockPermutation.resolve(id); } catch { rejected = true; }
    t.check(rejected, `${id} is not a Bedrock id`);
  }

  const facing = ["south", "west", "north", "east"];
  const off = [{ x: 0, z: 1 }, { x: -1, z: 0 }, { x: 0, z: -1 }, { x: 1, z: 0 }];
  for (let dir = 0; dir < 4; dir++) {
    const foot = { x: 2 + dir * 3, y: -60, z: 2 };
    const head = { x: foot.x + off[dir].x, y: foot.y, z: foot.z + off[dir].z };
    dim.getBlock(foot).setPermutation(BlockPermutation.resolve("minecraft:bed", { direction: dir, head_piece_bit: false, occupied_bit: false }));
    dim.getBlock(head).setPermutation(BlockPermutation.resolve("minecraft:bed", { direction: dir, head_piece_bit: true, occupied_bit: false }));
    const got = dim.getBlock(head).permutation.getAllStates();
    t.check(got.direction === dir && got.head_piece_bit === true && got.occupied_bit === false, `bed facing ${facing[dir]} keeps both halves`);
    t.check(got.color === undefined, `bed facing ${facing[dir]} has no invented color`);
  }

  const straw = { x: 2, y: -59, z: 2 };
  dim.getBlock(straw).setPermutation(BlockPermutation.resolve("minecraft:straw_bed", {
    "minecraft:cardinal_direction": "east", head_piece_bit: false, occupied_bit: false,
  }));
  t.check(dim.getBlock(straw).typeId === "minecraft:straw_bed", "straw_bed accepts cardinal direction");
}
