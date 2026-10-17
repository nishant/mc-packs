// CAPABILITY PROBE ONLY. No production script imports this module or creates this helper type.
// Native minecraft:npc has nameable.always_show=false. Stable server 2.1 cannot change it per instance.
// An always-show helper retains native identity, but close-range duplicate text is an UNRESOLVED client gate.
// Never release this as a 20-block fix based on server coordinates alone. No exact cutoff/scaling is claimed.
// Private-client follow-up: compare native and helper at 5/10/15/20/25 blocks, both opposed viewers,
// camera strafing, NPC movement, walls, head height, interaction targeting and near-range duplicate text.
// Use only an explicitly approved private world; a running Minecraft window may be the live Realm.
// Native run: --flat --only npc_bp,build_rp --scenario tools/test-bds/examples/npc-name-capability.js --strict
//
// Private-client fixture, ONLY AFTER private-world approval:
// Activate npc_bp + build_rp in a NEW Creative flat world, cheats on. Never open or modify the Realm.
// A separate test-only BP uses stable @minecraft/server 2.1.0 and fresh UUIDs, not production manifests.
// Copy this module to that BP's scripts/probe.js. Its scripts/main.js entry is:
//   import { world, system } from "@minecraft/server";
//   import { createNameProbe } from "./probe.js";
//   world.afterEvents.worldLoad.subscribe(() => {
//     const dims = ["overworld", "nether", "the_end"].map(id => world.getDimension(id));
//     const probe = createNameProbe(dims);
//     world.afterEvents.entityLoad.subscribe(({ entity }) => probe.loaded(entity));
//     system.runInterval(() => probe.sync(dims.flatMap(d => d.getEntities({ tags: ["realm:name_probe_fixture"] })), world.getAllPlayers()), 2);
//   });
// Place Ida at 0.5 -60 0.5 with /realm:npc_add ida. Native-only is the untouched baseline.
// Enable the probe: /tag @e[tag=realm:npc_id:ida] add realm:name_probe_fixture
// Disable the probe: /tag @e[tag=realm:npc_id:ida] remove realm:name_probe_fixture
// Observe facing east: /tp @s -4.5 -60 0.5 -90 0, then x=-9.5/-14.5/-19.5/-24.5.
// An opposed second real client stays at 20.5 -60 0.5, yaw=90. Test both clients, not one screenshot.
// Repeat while strafing/turning and moving the tagged NPC; check walls and ordinary/creative taps.
// Native name is intentionally preserved: duplicate close-range text is a possible rejection, not solved.
// Remove the tag while the test BP still runs, wait for zero probes, then remove the test BP.
export const NAME_PROBE_RELEASE_READY = false;
export const NAME_PROBE_TYPE = "realm:npc_name_probe";
const PROBE_TARGET = "realm:name_probe_target:";
const HEAD_OFFSET = 0.4;
const OBSERVER_RANGE = 24; // lifecycle budget only, NOT a per-viewer nameplate draw distance

/**
 * Test-only world-anchored prototype. The target's actual name (including speech) is never modified.
 * No camera orientation/projection, nearest-observer scale or observer-relative offset is used.
 * @param {any[]} dimensions loaded dimensions
 */
export function createNameProbe(dimensions) {
  const tracked = new Map();
  const remove = (entity) => { try { if (entity.isValid) entity.remove(); } catch {} };
  const clear = () => {
    for (const entry of tracked.values()) remove(entry.helper);
    tracked.clear();
    for (const dimension of dimensions) {
      for (const entity of dimension.getEntities({ type: NAME_PROBE_TYPE })) remove(entity);
    }
  };
  clear();
  return {
    loaded(entity) {
      if (entity.typeId !== NAME_PROBE_TYPE) return;
      const entry = [...tracked.values()].find((record) => record.helper.id === entity.id);
      if (!entry || !entry.target.isValid) remove(entity);
    },
    sync(targets, observers) {
      const wanted = new Set();
      for (const target of targets) {
        if (wanted.has(target.id)) continue;
        try {
          if (!target.isValid || !target.nameTag.trim()) continue;
          const location = target.location;
          if (!observers.some((observer) => observer.dimension.id === target.dimension.id &&
            observer.getGameMode().toLowerCase() !== "spectator" &&
            Math.hypot(observer.location.x - location.x, observer.location.y - location.y, observer.location.z - location.z) <= OBSERVER_RANGE)) continue;
          wanted.add(target.id);
          let entry = tracked.get(target.id);
          if (entry && (!entry.helper.isValid || entry.helper.dimension.id !== target.dimension.id)) {
            remove(entry.helper);
            tracked.delete(target.id);
            entry = undefined;
          }
          const head = target.getHeadLocation();
          const anchor = { x: head.x, y: head.y + HEAD_OFFSET, z: head.z };
          if (!entry) {
            const helper = target.dimension.spawnEntity(NAME_PROBE_TYPE, anchor);
            helper.addTag(PROBE_TARGET + target.id);
            entry = { target, helper };
            tracked.set(target.id, entry);
          }
          entry.helper.nameTag = target.nameTag;
          entry.helper.teleport(anchor);
        } catch {
          wanted.delete(target.id); // unload between validation and the head read/spawn/write
        }
      }
      for (const [id, entry] of tracked) {
        if (wanted.has(id)) continue;
        remove(entry.helper);
        tracked.delete(id);
      }
      for (const dimension of dimensions) {
        for (const entity of dimension.getEntities({ type: NAME_PROBE_TYPE })) this.loaded(entity);
      }
    },
    dispose: clear,
  };
}

export default async function (t) {
  const dimensions = ["overworld", "nether", "the_end"].map((id) => t.world.getDimension(id));
  const dim = t.dimension;
  const count = () => dimensions.reduce((n, d) => n + d.getEntities({ type: NAME_PROBE_TYPE }).length, 0);
  const close = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.025;
  const p = await t.player("NameWest", { op: true, gameMode: "creative", x: -20, z: 0 });
  const q = await t.player("NameEast", { op: true, gameMode: "creative", x: 20, z: 0 });
  await t.loadArea(0, 0, { radius: 4 });
  t.server("/gamerule doMobSpawning false");
  const base = { x: 0.5, y: p.location.y, z: 0.5 };
  if (t.phase === 2) {
    t.check(count() === 1, "a saved capability probe loads before the explicit test-only sweep");
    const probe = createNameProbe(dimensions);
    t.check(count() === 0, "restart sweep removes saved capability probes without touching legacy cleanup");
    probe.dispose();
    t.log("RELEASE BLOCKED: native lifecycle is not pixel/readability/no-duplicate evidence.");
    return;
  }
  const probe = createNameProbe(dimensions);
  const loaded = ({ entity }) => probe.loaded(entity);
  t.world.afterEvents.entityLoad.subscribe(loaded);
  const target = dim.spawnEntity("minecraft:npc", base);
  target.nameTag = "Native Identity";
  const components = target.getComponents().map((component) => component.typeId);
  t.log(`Native NPC script component surface: ${components.sort().join(", ")}`);
  t.check(!components.includes("minecraft:nameable"), "stable script surface exposes no writable nameable visibility component");
  t.check(target.typeId === "minecraft:npc", "native NPC type and intrinsic editor/dialogue identity are retained");
  const observers = [p, q];
  probe.sync([target, target], observers);
  t.check(count() === 1, "opposed observers share exactly one target-owned probe");
  let [helper] = dim.getEntities({ type: NAME_PROBE_TYPE });
  t.assert(!!helper, "helper spawned");
  const anchor = () => { const h = target.getHeadLocation(); return { x: h.x, y: h.y + HEAD_OFFSET, z: h.z }; };
  t.check(close(helper.location, anchor()), "helper anchor uses target head world coordinates");
  t.check(target.nameTag === "Native Identity", "native actual name remains available to interactions/quests");
  for (const distance of [5, 10, 15, 20, 25]) {
    p.teleport({ ...base, x: base.x - distance }, { rotation: { x: 0, y: -90 } });
    q.teleport({ ...base, x: base.x + 20 }, { rotation: { x: 0, y: 90 } });
    probe.sync([target], observers);
    t.check(count() === 1 && close(helper.location, anchor()), `${distance}-block observer does not alter shared anchor for the opposite viewer`);
  }
  const ray = dim.getEntitiesFromRay({ x: base.x - 3, y: base.y + 1, z: base.z }, { x: 1, y: 0, z: 0 }, { maxDistance: 6 });
  t.check(ray.some((hit) => hit.entity.id === target.id), "entity targeting ray can still hit the NPC");
  t.check(ray.every((hit) => hit.entity.typeId !== NAME_PROBE_TYPE), "zero-hitbox helper does not intercept entity targeting");
  const helperRay = dim.getEntitiesFromRay({ ...helper.location, x: helper.location.x - 3 }, { x: 1, y: 0, z: 0 }, { maxDistance: 6 });
  t.check(helperRay.every((hit) => hit.entity.typeId !== NAME_PROBE_TYPE), "a ray through the helper's own anchor cannot select it");
  target.teleport({ ...base, z: base.z + 4 });
  target.nameTag = "A speech line";
  probe.sync([target], observers);
  t.check(close(helper.location, anchor()) && helper.nameTag === target.nameTag, "moving target and speech changes update the same helper");
  const duplicate = dim.spawnEntity(NAME_PROBE_TYPE, base);
  probe.loaded(duplicate);
  t.check(!duplicate.isValid && count() === 1, "duplicate loaded probes are removed");
  const netherPlayer = await t.player("NameNether", { op: true, gameMode: "creative", dimension: "nether", x: 0, z: 0 });
  netherPlayer.dimension.runCommand("fill -2 99 -2 2 106 2 air");
  netherPlayer.teleport({ x: 0.5, y: 100, z: 0.5 });
  target.teleport(netherPlayer.location, { dimension: netherPlayer.dimension });
  await t.waitUntil(() => target.isValid && target.dimension.id === netherPlayer.dimension.id, { timeout: 40, message: "native dimension transfer completes" });
  probe.sync([target], [netherPlayer]);
  [helper] = netherPlayer.dimension.getEntities({ type: NAME_PROBE_TYPE });
  t.check(count() === 1 && dim.getEntities({ type: NAME_PROBE_TYPE }).length === 0, "dimension change replaces, rather than strands, the helper");
  t.check(!!helper && close(helper.location, anchor()), "dimension change retains a head-world anchor");
  probe.sync([], [netherPlayer]);
  t.check(count() === 0, "a lost/unloaded target leaves no tracked helper");
  const orphan = dim.spawnEntity(NAME_PROBE_TYPE, base);
  probe.loaded(orphan);
  t.check(count() === 0, "late orphan load cannot resurrect a helper");
  const remoteArea = await t.loadArea(1536, 0, { radius: 2 });
  const remote = { x: 1536.5, y: remoteArea.top.location.y + 1, z: 0.5 };
  const remoteTarget = dim.spawnEntity("minecraft:npc", remote);
  remoteTarget.nameTag = "Unload fixture";
  remoteTarget.addTag("realm:name_probe_unload");
  p.teleport({ ...remote, x: remote.x - 5 });
  probe.sync([remoteTarget], [p]);
  const remoteId = remoteTarget.id;
  const [remoteHelper] = dim.getEntities({ type: NAME_PROBE_TYPE });
  t.assert(!!remoteHelper, "remote chunk has a probe before unload");
  p.teleport(base);
  dim.runCommand(`tickingarea remove ${remoteArea.name}`);
  await t.waitUntil(() => !remoteTarget.isValid && !remoteHelper.isValid, { timeout: 800, message: "remote NPC and helper really unload" });
  probe.sync([remoteTarget], observers);
  await t.loadArea(1536, 0, { radius: 2 });
  await t.waitUntil(() => !!t.world.getEntity(remoteId)?.isValid, { timeout: 100, message: "remote target reloads" });
  await t.wait(5);
  t.check(dim.getEntities({ type: NAME_PROBE_TYPE }).length === 0, "reloading a genuinely unloaded orphan removes it via entityLoad");
  const reloaded = t.world.getEntity(remoteId);
  p.teleport({ ...remote, x: remote.x - 5 });
  probe.sync([reloaded], [p]);
  t.check(count() === 1, "reloaded target gets exactly one fresh helper");
  probe.sync([], []);
  if (reloaded?.isValid) reloaded.remove();
  p.teleport(base);
  t.check(count() === 0, "unload/reload lifecycle finishes with zero orphan helpers");
  probe.dispose();
  t.world.afterEvents.entityLoad.unsubscribe(loaded);
  if (target.isValid) target.remove();
  // This test type is deliberately NOT in legacy-label cleanup; its own explicit lifecycle must remove it.
  const saved = dim.spawnEntity(NAME_PROBE_TYPE, { ...base, y: base.y + 2 });
  saved.nameTag = "Saved capability fixture";
  return t.restart("verify the distinct probe type and its explicit restart sweep");
}
