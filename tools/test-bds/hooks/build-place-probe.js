
// Appended only to a test copy of build_bp/scripts/main.js (build-queue-unloaded.js, build-job-interrupt.js). It hands
// the unchanged production placeBlocks a row of cells, as a confirmed Line would after the claims answer, so a scenario
// can build where no simulated player can aim (into unloaded chunks). Present before and after the fix it checks.
import { ScriptEventSource as PlaceProbeSource } from "@minecraft/server";
onScriptEvent("realm:build_place_test", (event) => {
  if (event.sourceType !== PlaceProbeSource.Server) return;
  try {
    const m = JSON.parse(event.message);
    const player = world.getAllPlayers().find((p) => p.id === m.player);
    if (!player?.isValid) throw new Error("test player is unavailable");
    const positions = [];
    for (let i = 0; i < m.length; i++) positions.push({ x: m.from.x + i, y: m.from.y, z: m.from.z });
    const placed = placeBlocks(player, positions, m.from, m.typeId, {});
    system.sendScriptEvent("realm:build_place_test_report", JSON.stringify({ player: player.id, placed }));
  } catch (error) {
    console.error(`[build-place-probe] ${error}`);
  }
});
