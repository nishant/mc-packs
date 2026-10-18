
// ---------------------------------------------------------------------------
// Test hook (tools/test-bds/hooks/rainbow-rvtest.js), appended to a TEST COPY of rainbow_bp/scripts/main.js by the
// header recipe of rainbow-race.js; never shipped. It counts the particles the pack draws per `${player}/${id}`
// and answers rvtest:pot with rvtest:pot_r {pot, counts, busy}.
import { Player as RvPlayer, system as rvSystem } from "@minecraft/server";

const rvCounts = {};
{
  const orig = RvPlayer.prototype.spawnParticle;
  RvPlayer.prototype.spawnParticle = function (effect, ...rest) {
    let who = "?";
    try {
      who = this.name;
    } catch {}
    const key = `${who}/${effect}`;
    rvCounts[key] = (rvCounts[key] ?? 0) + 1;
    return orig.call(this, effect, ...rest);
  };
}
rvSystem.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "rvtest:pot") rvSystem.sendScriptEvent("rvtest:pot_r", JSON.stringify({ pot: pot ?? null, counts: rvCounts, busy }));
  },
  { namespaces: ["rvtest"] },
);
