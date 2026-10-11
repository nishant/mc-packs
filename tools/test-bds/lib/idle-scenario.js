// Default scenario: no players, just let the packs start and run for a while.
export default async function (t) {
  const ticks = t.config.idleTicks || 200;
  t.log(`idle scenario: waiting ${ticks} ticks`);
  await t.wait(ticks);
}
