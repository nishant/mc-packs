
// Appended only in the private native fixture. It invokes unchanged production main.confirmPlacement.
// Simulated second-use delivery and physical mouse/touch remain separate, unverified acceptance.
import { ScriptEventSource as BedPipelineSource } from "@minecraft/server";
onScriptEvent("realm:build_pipeline_test", (event) => {
  if (event.sourceType !== BedPipelineSource.Server) return;
  try {
    const message = JSON.parse(event.message);
    const player = world.getAllPlayers().find((p) => p.id === message.player);
    if (!player?.isValid || !hasRequiredTag(player)) throw new Error("test player is unavailable or cannot build");
    const state = getState(player);
    if (!state.anchor || state.mode !== "line" || state.blockTypeId !== "minecraft:bed")
      throw new Error("the real native bed anchor was not retained");
    confirmPlacement(player, message.fallback);
    system.sendScriptEvent("realm:build_pipeline_test_report", JSON.stringify({
      player: player.id, entrypoint: "main.confirmPlacement", nativeSecondInput: false,
    }));
  } catch (error) {
    console.error(`[bed-pipeline-test] ${error}`);
  }
});
