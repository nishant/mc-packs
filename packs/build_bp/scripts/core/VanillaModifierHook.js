// @ts-nocheck
import { world, system, BlockPermutation, EquipmentSlot } from "@minecraft/server";
import { anyModifierEnabled, getRadialState, getState } from "./PlayerState.js";
import { applyModifiers } from "./ModifierPipeline.js";
import { getFlippedStates } from "../modifiers/MirrorModifier.js";
import { isCreative, countBlocks, removeBlocks } from "../utils/InventoryUtils.js";
import { ALWAYS_REPLACEABLE, UNPLACEABLE } from "./BlockPlacer.js";
import { UNBREAKABLE, canMineWithTool, isDiggingTool, getBlockDrop } from "./BlockDestroyer.js";
import { filterSafeZonePositions, isBuildBlockedForPlayer } from "./Protection.js";
import { ItemStack } from "@minecraft/server";

let AIR_PERM = null;
function getAirPerm() {
    if (!AIR_PERM) AIR_PERM = BlockPermutation.resolve("minecraft:air");
    return AIR_PERM;
}

function magnetToPos(entities, target) {
    if (!entities.length) return;
    const TICKS  = 8;
    const FACTOR = 0.45;
    let tick = 0;
    const id = system.runInterval(() => {
        tick++;
        for (const entity of entities) {
            try {
                if (tick >= TICKS) {
                    entity.teleport(target);
                } else {
                    const pos = entity.location;
                    entity.teleport({
                        x: pos.x + (target.x - pos.x) * FACTOR,
                        y: pos.y + (target.y - pos.y) * FACTOR,
                        z: pos.z + (target.z - pos.z) * FACTOR,
                    });
                }
            } catch {}
        }
        if (tick >= TICKS) system.clearRun(id);
    }, 1);
}

function enchLevel(item, enchantId) {
    try {
        const comp = item?.getComponent("minecraft:enchantable");
        if (!comp) return 0;
        for (const e of comp.getEnchantments()) {
            if (e.type?.id === enchantId) return e.level;
        }
    } catch {}
    return 0;
}

function damageTool(player, count) {
    if (count <= 0) return;
    try {
        const eq = player.getComponent("minecraft:equippable");
        if (!eq) return;
        const item = eq.getEquipment(EquipmentSlot.Mainhand);
        if (!item) return;

        const durComp = item.getComponent("minecraft:durability");
        if (!durComp) return;

        const unbreaking = enchLevel(item, "unbreaking");
        let damage = 0;
        for (let i = 0; i < count; i++) {
            if (unbreaking === 0 || Math.random() < 1 / (unbreaking + 1)) damage++;
        }
        if (damage === 0) return;

        const newDamage = durComp.damage + damage;
        if (newDamage >= durComp.maxDurability) {
            eq.setEquipment(EquipmentSlot.Mainhand, undefined);
            try { player.playSound("random.break", { pitch: 0.8 }); } catch {}
        } else {
            durComp.damage = newDamage;
            eq.setEquipment(EquipmentSlot.Mainhand, item);
        }
    } catch {}
}

const pendingPlacements = new Map();

const pendingBreaks = new Map();

export function startVanillaModifierHook() {

    world.afterEvents.playerPlaceBlock.subscribe(ev => {
        const { block, player } = ev;
        if (!anyModifierEnabled(player)) return;
        if (getState(player).mode !== "disable") return;
        if (isBuildBlockedForPlayer(player, false)) return;

        const typeId   = block.typeId;
        if (UNPLACEABLE.has(typeId)) return;

        const origin   = block.location;
        const perm     = block.permutation;
        const states   = perm.getAllStates();
        const dim      = player.dimension;
        const creative = isCreative(player);

        const positions = filterSafeZonePositions(player, dim.id, applyModifiers(player, [{ x: origin.x, y: origin.y, z: origin.z }]), false);
        if (positions.length <= 1) return;

        const radialEnabled = getRadialState(player).enabled;
        const playerPendingBreaks = radialEnabled ? pendingBreaks.get(player.id) : null;

        let copies = [];
        for (let i = 1; i < positions.length; i++) {
            const pos = positions[i];
            const key = `${pos.x},${pos.y},${pos.z}`;

            let forceAllow = false;
            if (playerPendingBreaks?.has(key)) {
                system.clearRun(playerPendingBreaks.get(key));
                playerPendingBreaks.delete(key);
                forceAllow = true;
            }

            if (!forceAllow) {
                try {
                    const existing = dim.getBlock(pos)?.typeId;
                    if (!creative && existing === "minecraft:bedrock") continue;
                    if (!ALWAYS_REPLACEABLE.has(existing) && existing !== "minecraft:air") continue;
                } catch { continue; }
            }
            copies.push(pos);
        }
        if (copies.length === 0) return;

        if (!creative) {
            const available = countBlocks(player, typeId);
            if (available <= 0) return;
            if (copies.length > available) copies = copies.slice(0, available);
            removeBlocks(player, typeId, copies.length);
        }

        if (radialEnabled) {

            if (!pendingPlacements.has(player.id)) pendingPlacements.set(player.id, new Map());
            const playerPending = pendingPlacements.get(player.id);

            for (let i = 0; i < copies.length; i++) {
                const pos = copies[i];
                const key = `${pos.x},${pos.y},${pos.z}`;
                const id = system.runTimeout(() => {
                    playerPending.delete(key);
                    try {
                        let targetPerm = perm;
                        if (pos._mx || pos._my || pos._mz) {
                            const flipped = getFlippedStates(states, pos._mx, pos._my, pos._mz);
                            targetPerm = BlockPermutation.resolve(typeId, flipped);
                        }
                        dim.getBlock(pos)?.setPermutation(targetPerm);
                    } catch {}
                }, i);
                playerPending.set(key, id);
            }
        } else {
            system.run(() => {
                for (const pos of copies) {
                    try {
                        let targetPerm = perm;
                        if (pos._mx || pos._my || pos._mz) {
                            const flipped = getFlippedStates(states, pos._mx, pos._my, pos._mz);
                            targetPerm = BlockPermutation.resolve(typeId, flipped);
                        }
                        dim.getBlock(pos)?.setPermutation(targetPerm);
                    } catch {}
                }
            });
        }
    });

    world.afterEvents.playerBreakBlock.subscribe(ev => {
        const { block, player, itemStackBeforeBreak } = ev;
        if (!anyModifierEnabled(player)) return;
        if (getState(player).mode !== "disable") return;
        if (isBuildBlockedForPlayer(player, false)) return;

        const origin   = block.location;
        const dim      = player.dimension;
        const creative = isCreative(player);

        let toolItem     = null;
        let toolTypeId   = null;
        let hasSilkTouch = false;
        let fortuneLevel = 0;
        if (!creative) {
            try {
                toolItem     = itemStackBeforeBreak ?? null;
                toolTypeId   = toolItem?.typeId ?? null;
                hasSilkTouch = enchLevel(toolItem, "silk_touch") > 0;
                fortuneLevel = enchLevel(toolItem, "fortune");
            } catch {}
        }

        const lootMgr = world.getLootTableManager?.() ?? null;

        const positions = filterSafeZonePositions(player, dim.id, applyModifiers(player, [{ x: origin.x, y: origin.y, z: origin.z }]), false);
        if (positions.length <= 1) return;

        if (getRadialState(player).enabled) {
            const playerPending = pendingPlacements.get(player.id);
            if (playerPending?.size) {
                for (let i = 1; i < positions.length; i++) {
                    const key = `${positions[i].x},${positions[i].y},${positions[i].z}`;
                    if (playerPending.has(key)) {
                        system.clearRun(playerPending.get(key));
                        playerPending.delete(key);
                    }
                }
            }
        }

        const copies = [];
        for (let i = 1; i < positions.length; i++) {
            const pos = positions[i];
            try {
                const b = dim.getBlock(pos);
                if (!b) continue;
                const tid = b.typeId;
                if (tid === "minecraft:air") continue;
                if (UNBREAKABLE.has(tid)) continue;
                if (!creative && !canMineWithTool(toolTypeId, tid)) continue;
                copies.push(pos);
            } catch { continue; }
        }
        if (copies.length === 0) return;

        if (getRadialState(player).enabled) {
            const activeCopies = copies;

            if (!pendingBreaks.has(player.id)) pendingBreaks.set(player.id, new Map());
            const playerPendingBreaksMap = pendingBreaks.get(player.id);

            const spawnedEntities = [];
            let broken = 0;
            for (let i = 0; i < activeCopies.length; i++) {
                const pos = activeCopies[i];
                const key = `${pos.x},${pos.y},${pos.z}`;
                const id = system.runTimeout(() => {
                    playerPendingBreaksMap.delete(key);
                    try {
                        const b = dim.getBlock(pos);
                        if (!b || b.typeId === "minecraft:air") return;
                        if (!creative) {
                            try {
                                const spawnPos = { x: pos.x + 0.5, y: pos.y + 0.75, z: pos.z + 0.5 };
                                if (lootMgr) {
                                    const lootItems = lootMgr.generateLootFromBlockPermutation(b.permutation, toolItem);
                                    if (lootItems?.length) {
                                        for (const item of lootItems) {
                                            try {
                                                const entity = dim.spawnItem(item, spawnPos);
                                                if (entity) spawnedEntities.push(entity);
                                            } catch {}
                                        }
                                    }
                                } else {
                                    const drop = getBlockDrop(b, hasSilkTouch, fortuneLevel);
                                    if (drop) {
                                        const entity = dim.spawnItem(new ItemStack(drop.typeId, drop.amount), spawnPos);
                                        if (entity) spawnedEntities.push(entity);
                                    }
                                }
                            } catch {}
                        }
                        b.setPermutation(getAirPerm());
                        broken++;
                    } catch {}
                }, i);
                playerPendingBreaksMap.set(key, id);
            }

            system.runTimeout(() => {
                if (spawnedEntities.length > 0) {
                    magnetToPos(spawnedEntities, { x: origin.x + 0.5, y: origin.y + 0.5, z: origin.z + 0.5 });
                }
                if (!creative && broken > 0) damageTool(player, broken);
            }, activeCopies.length);
        } else {
            system.run(() => {
                let broken = 0;
                const spawnedEntities = [];

                for (const pos of copies) {
                    try {
                        const b = dim.getBlock(pos);
                        if (!b || b.typeId === "minecraft:air") continue;

                        if (!creative) {
                            try {
                                const spawnPos = { x: pos.x + 0.5, y: pos.y + 0.75, z: pos.z + 0.5 };
                                if (lootMgr) {

                                    const lootItems = lootMgr.generateLootFromBlockPermutation(
                                        b.permutation, toolItem
                                    );
                                    if (lootItems?.length) {
                                        for (const item of lootItems) {
                                            try {
                                                const entity = dim.spawnItem(item, spawnPos);
                                                if (entity) spawnedEntities.push(entity);
                                            } catch {}
                                        }
                                    }
                                } else {

                                    const drop = getBlockDrop(b, hasSilkTouch, fortuneLevel);
                                    if (drop) {
                                        const entity = dim.spawnItem(
                                            new ItemStack(drop.typeId, drop.amount), spawnPos
                                        );
                                        if (entity) spawnedEntities.push(entity);
                                    }
                                }
                            } catch {}
                        }

                        b.setPermutation(getAirPerm());
                        broken++;
                    } catch {}
                }

                if (spawnedEntities.length > 0) {
                    magnetToPos(spawnedEntities, {
                        x: origin.x + 0.5,
                        y: origin.y + 0.5,
                        z: origin.z + 0.5,
                    });
                }

                if (!creative && broken > 0) damageTool(player, broken);
            });
        }
    });

}
