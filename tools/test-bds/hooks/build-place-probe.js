
// Appended only to a test copy of build_bp/scripts/main.js (build-queue-unloaded.js, build-job-interrupt.js). It hands
// the unchanged production placeBlocks a row or a box of cells, as a confirmed shape would after the claims answer, so
// a scenario can build where no simulated player can aim (into unloaded chunks) and interrupt the build in the same
// tick (`then`: "nether" sends the player to the Nether, "kill" kills them). Works whether placeBlocks returns the
// count or a Promise of it, so it runs on the code before and after the fix it checks.
import { ScriptEventSource as PlaceProbeSource } from "@minecraft/server";
onScriptEvent("realm:build_place_test", async (event) => {
  if (event.sourceType !== PlaceProbeSource.Server) return;
  try {
    const m = JSON.parse(event.message);
    const player = world.getAllPlayers().find((p) => p.id === m.player);
    if (!player?.isValid) throw new Error("test player is unavailable");
    const size = m.size ?? { x: m.length, y: 1, z: 1 };
    const positions = [];
    for (let x = 0; x < size.x; x++)
      for (let y = 0; y < size.y; y++)
        for (let z = 0; z < size.z; z++) positions.push({ x: m.from.x + x, y: m.from.y + y, z: m.from.z + z });
    const pending = placeBlocks(player, positions, m.from, m.typeId, {});
    if (m.then === "nether") player.teleport({ x: 0.5, y: 70, z: 0.5 }, { dimension: world.getDimension("minecraft:nether") });
    if (m.then === "kill") player.kill();
    const placed = await Promise.resolve(pending);
    system.sendScriptEvent("realm:build_place_test_report", JSON.stringify({ player: player.id, placed }));
  } catch (error) {
    console.error(`[build-place-probe] ${error}`);
  }
});
