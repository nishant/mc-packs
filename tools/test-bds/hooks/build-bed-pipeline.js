
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
    const mode = message.mode ?? "line";
    if (!state.anchor || state.mode !== mode || state.blockTypeId !== "minecraft:bed")
      throw new Error("the real native bed anchor was not retained");
    confirmPlacement(player, message.fallback);
    system.sendScriptEvent("realm:build_pipeline_test_report", JSON.stringify({
      player: player.id, entrypoint: "main.confirmPlacement", nativeSecondInput: false, mode,
      secondAnchor: !!getState(player).secondAnchor, anchor: !!getState(player).anchor,
    }));
  } catch (error) {
    console.error(`[bed-pipeline-test] ${error}`);
  }
});
// Test-only mode switch for the all-modes bed scenario: the same setMode the menus call.
onScriptEvent("realm:build_mode_test", (event) => {
  if (event.sourceType !== BedPipelineSource.Server) return;
  try {
    const message = JSON.parse(event.message);
    const player = world.getAllPlayers().find((p) => p.id === message.player);
    if (!player?.isValid) throw new Error("test player is unavailable");
    setMode(player, message.mode);
    system.sendScriptEvent("realm:build_mode_test_report", JSON.stringify({ player: player.id, mode: getState(player).mode }));
  } catch (error) {
    console.error(`[bed-pipeline-test] ${error}`);
  }
});
