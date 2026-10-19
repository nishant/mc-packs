// Test-only identity adapter: preserve real saga:p bytes across simulated players' changing IDs.
import { system, world } from "@minecraft/server";
import { forget, markDirty, sagaOf, storyById } from "./data.js";
import { countItem } from "./objectives.js";
import { buildAt, placesOf } from "./places.js";

const PREFIX = "saga_test:starfall:";
const score = (player) => {
  const objective = world.scoreboard.getObjective("crowns");
  return objective?.hasParticipant(player) ? objective.getScore(player) ?? 0 : 0;
};
const snapshot = (player) => {
  const place = placesOf().starfall;
  return {
    playerId: player.id,
    progress: sagaOf(player).s.act1_signs,
    shards: countItem(player, "minecraft:amethyst_shard"),
    level: player.level,
    crowns: score(player),
    hint: storyById.get("act1_signs").chapters.find((chapter) => chapter.id === "fallen").hint,
    place: place ? { dim: place.dim, x: place.x, y: place.y, z: place.z, built: place.b } : undefined,
  };
};

system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
  if (id !== "harness:starfall_request") return;
  const reply = (value) => system.sendScriptEvent("harness:starfall_reply", JSON.stringify(value));
  let request;
  try {
    request = JSON.parse(message);
  } catch (error) {
    console.error(`[starfall-test] Invalid request: ${error}`);
    return;
  }
  void (async () => {
    const player = world.getAllPlayers().find((entry) => entry.id === request.player);
    if (!player?.isValid) throw new Error("Requested test player is unavailable");
    if (request.action === "build") {
      const error = await buildAt("starfall", player.dimension, request.origin, 0, { by: "Starfall regression fixture" });
      if (error) throw new Error(error);
    } else if (request.action === "checkpoint" || request.action === "restore") {
      if (!["partial", "reported"].includes(request.slot)) throw new Error("Unknown bounded checkpoint slot");
      const key = `${PREFIX}${request.slot}`;
      if (request.action === "checkpoint") {
        markDirty(player, true);
        const raw = player.getDynamicProperty("saga:p");
        if (typeof raw !== "string") throw new Error("Production saga:p did not flush");
        world.setDynamicProperty(key, JSON.stringify({ playerId: player.id, raw, level: player.level, crowns: score(player) }));
      } else {
        const raw = world.getDynamicProperty(key);
        if (typeof raw !== "string") throw new Error(`No native saved checkpoint ${request.slot}`);
        const saved = JSON.parse(raw);
        player.setDynamicProperty("saga:p", saved.raw);
        forget(player.id);
        sagaOf(player);
        player.addLevels(saved.level - player.level);
        const crowns = world.scoreboard.getObjective("crowns") ?? world.scoreboard.addObjective("crowns", "Crowns");
        crowns.setScore(player, saved.crowns);
        reply({ req: request.req, ok: true, originalPlayerId: saved.playerId, ...snapshot(player) });
        return;
      }
    } else if (request.action !== "state") throw new Error("Unknown Starfall test action");
    reply({ req: request.req, ok: true, ...snapshot(player) });
  })().catch((error) => {
    console.error(`[starfall-test] ${request.action}: ${error}`);
    reply({ req: request.req, ok: false, error: String(error) });
  });
}, { namespaces: ["harness"] });
