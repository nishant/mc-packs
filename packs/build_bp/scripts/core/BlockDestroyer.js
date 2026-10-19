// @ts-nocheck
import { ItemStack, system, world, EquipmentSlot } from "@minecraft/server";
import { isCreative } from "../utils/InventoryUtils.js";
import { t } from "../utils/Text.js";
import { getMaxBlocks, getUndoThreshold, getDestroyDrops, getBuildSpeed } from "./Settings.js";
import { recordSnapshot } from "./UndoRedo.js";
import { lockActionBar } from "../utils/ActionBar.js";
import { filterSafeZonePositions, isBuildBlockedForPlayer } from "./Protection.js";
import { bedPartnerPos, isBedType, expandDestroyForClaims, dropIncompleteBeds, trimPlacement, chargeUnits } from "./beds.js";

export const UNBREAKABLE = new Set([
    "minecraft:bedrock",
    "minecraft:barrier",
    "minecraft:command_block",
    "minecraft:chain_command_block",
    "minecraft:repeating_command_block",
    "minecraft:structure_block",
    "minecraft:jigsaw",
    "minecraft:end_portal",
    "minecraft:end_gateway",
    "minecraft:end_portal_frame",
    "minecraft:water",
    "minecraft:flowing_water",
    "minecraft:lava",
    "minecraft:flowing_lava",
    ...Array.from({ length: 16 }, (_, i) => `minecraft:light_block_${i}`),
    "minecraft:portal",
    "minecraft:mob_spawner",
    "minecraft:vault",
    "minecraft:trial_spawner",
    "minecraft:allow",
    "minecraft:deny",
    "minecraft:structure_void",
    "minecraft:powder_snow",
    "minecraft:bubble_column",
    "minecraft:undyed_shulker_box",
    "minecraft:white_shulker_box",
    "minecraft:orange_shulker_box",
    "minecraft:magenta_shulker_box",
    "minecraft:light_blue_shulker_box",
    "minecraft:yellow_shulker_box",
    "minecraft:lime_shulker_box",
    "minecraft:pink_shulker_box",
    "minecraft:gray_shulker_box",
    "minecraft:light_gray_shulker_box",
    "minecraft:cyan_shulker_box",
    "minecraft:purple_shulker_box",
    "minecraft:blue_shulker_box",
    "minecraft:brown_shulker_box",
    "minecraft:green_shulker_box",
    "minecraft:red_shulker_box",
    "minecraft:black_shulker_box",
]);

const SHOVEL_BLOCKS = new Set([
    "minecraft:dirt", "minecraft:coarse_dirt",
    "minecraft:grass_block", "minecraft:mycelium", "minecraft:podzol",
    "minecraft:farmland", "minecraft:dirt_with_roots",
    "minecraft:sand", "minecraft:red_sand",
    "minecraft:gravel",
    "minecraft:clay",
    "minecraft:snow", "minecraft:snow_layer",
    "minecraft:soul_sand", "minecraft:soul_soil",
    "minecraft:mud", "minecraft:muddy_mangrove_roots",
    "minecraft:suspicious_sand", "minecraft:suspicious_gravel",
    "minecraft:moss_block", "minecraft:moss_carpet",
]);

const AXE_MISC = new Set([
    "minecraft:bamboo_block", "minecraft:bamboo_mosaic",
    "minecraft:crafting_table", "minecraft:chest", "minecraft:trapped_chest",
    "minecraft:barrel", "minecraft:bookshelf", "minecraft:chiseled_bookshelf",
    "minecraft:lectern", "minecraft:cartography_table", "minecraft:fletching_table",
    "minecraft:smithing_table", "minecraft:loom", "minecraft:composter",
    "minecraft:beehive", "minecraft:bee_nest",
    "minecraft:pumpkin", "minecraft:carved_pumpkin", "minecraft:lit_pumpkin",
    "minecraft:melon_block", "minecraft:jukebox", "minecraft:noteblock",
    "minecraft:ladder",
]);

function isAxeBlock(typeId) {
    return typeId.endsWith("_log")    || typeId.endsWith("_wood")   ||
           typeId.endsWith("_stem")   || typeId.endsWith("_hyphae") ||
           typeId.endsWith("_planks") || typeId.includes("stripped_") ||
           AXE_MISC.has(typeId);
}

const PICKAXE_MISC = new Set([
    "minecraft:coal_ore", "minecraft:deepslate_coal_ore",
    "minecraft:quartz_ore", "minecraft:nether_gold_ore",
    "minecraft:coal_block", "minecraft:gilded_blackstone",
    "minecraft:raw_iron_block", "minecraft:raw_gold_block", "minecraft:raw_copper_block",
    "minecraft:netherrack", "minecraft:nether_wart_block", "minecraft:shroomlight",
    "minecraft:calcite", "minecraft:tuff", "minecraft:dripstone_block", "minecraft:pointed_dripstone",
    "minecraft:sea_lantern", "minecraft:glowstone",
    "minecraft:iron_bars", "minecraft:iron_door", "minecraft:iron_trapdoor",
    "minecraft:heavy_weighted_pressure_plate", "minecraft:light_weighted_pressure_plate",
    "minecraft:iron_chain", "minecraft:lantern", "minecraft:soul_lantern",
    "minecraft:cauldron", "minecraft:hopper", "minecraft:dispenser",
    "minecraft:dropper", "minecraft:observer", "minecraft:piston", "minecraft:sticky_piston",
    "minecraft:lodestone",
]);

function isPickaxeBlock(typeId) {
    if (PICKAXE_MISC.has(typeId)) return true;
    return typeId.includes("_ore")          ||
           typeId.includes("stone")         ||
           typeId.includes("deepslate")     ||
           typeId.includes("granite")       || typeId.includes("diorite")    ||
           typeId.includes("andesite")      || typeId.includes("basalt")     ||
           typeId.includes("blackstone")    || typeId.includes("prismarine") ||
           typeId.includes("nether_brick")  || typeId.includes("terracotta") ||
           typeId.includes("amethyst")      || typeId.includes("tuff")       ||
           typeId.includes("dripstone")     || typeId.includes("quartz")     ||
           typeId.includes("_brick")        ||
           (typeId.includes("concrete") && !typeId.endsWith("_concrete_powder"));
}

const TOOL_TIER = {
    "minecraft:wooden_pickaxe":    0,
    "minecraft:golden_pickaxe":    0,
    "minecraft:stone_pickaxe":     1,
    "minecraft:copper_pickaxe":    1,
    "minecraft:iron_pickaxe":      2,
    "minecraft:diamond_pickaxe":   3,
    "minecraft:netherite_pickaxe": 4,
};

const TIER_1 = new Set([
    "minecraft:iron_ore", "minecraft:deepslate_iron_ore",
    "minecraft:copper_ore", "minecraft:deepslate_copper_ore",
    "minecraft:lapis_ore", "minecraft:deepslate_lapis_ore",
    "minecraft:iron_block", "minecraft:raw_iron_block",
    "minecraft:copper_block", "minecraft:exposed_copper", "minecraft:weathered_copper", "minecraft:oxidized_copper",
    "minecraft:cut_copper", "minecraft:exposed_cut_copper", "minecraft:weathered_cut_copper", "minecraft:oxidized_cut_copper",
    "minecraft:cut_copper_slab", "minecraft:exposed_cut_copper_slab", "minecraft:weathered_cut_copper_slab", "minecraft:oxidized_cut_copper_slab",
    "minecraft:cut_copper_stairs", "minecraft:exposed_cut_copper_stairs", "minecraft:weathered_cut_copper_stairs", "minecraft:oxidized_cut_copper_stairs",
    "minecraft:waxed_copper", "minecraft:waxed_exposed_copper", "minecraft:waxed_weathered_copper", "minecraft:waxed_oxidized_copper",
    "minecraft:waxed_cut_copper", "minecraft:waxed_exposed_cut_copper", "minecraft:waxed_weathered_cut_copper", "minecraft:waxed_oxidized_cut_copper",
    "minecraft:waxed_cut_copper_slab", "minecraft:waxed_exposed_cut_copper_slab", "minecraft:waxed_weathered_cut_copper_slab", "minecraft:waxed_oxidized_cut_copper_slab",
    "minecraft:waxed_cut_copper_stairs", "minecraft:waxed_exposed_cut_copper_stairs", "minecraft:waxed_weathered_cut_copper_stairs", "minecraft:waxed_oxidized_cut_copper_stairs",
    "minecraft:raw_copper_block",
    "minecraft:lapis_block",
    "minecraft:lightning_rod",
]);

const TIER_2 = new Set([
    "minecraft:gold_ore", "minecraft:deepslate_gold_ore",
    "minecraft:redstone_ore", "minecraft:lit_redstone_ore",
    "minecraft:deepslate_redstone_ore", "minecraft:lit_deepslate_redstone_ore",
    "minecraft:diamond_ore", "minecraft:deepslate_diamond_ore",
    "minecraft:emerald_ore", "minecraft:deepslate_emerald_ore",
    "minecraft:gold_block", "minecraft:raw_gold_block",
    "minecraft:diamond_block",
    "minecraft:emerald_block",
    "minecraft:redstone_block",
]);

function getOreXp(typeId, hasSilkTouch) {
    if (hasSilkTouch) return 0;
    switch (typeId) {
        case "minecraft:coal_ore":
        case "minecraft:deepslate_coal_ore":             return rand(0, 2);
        case "minecraft:lapis_ore":
        case "minecraft:deepslate_lapis_ore":            return rand(2, 5);
        case "minecraft:redstone_ore":
        case "minecraft:lit_redstone_ore":
        case "minecraft:deepslate_redstone_ore":
        case "minecraft:lit_deepslate_redstone_ore":     return rand(1, 5);
        case "minecraft:diamond_ore":
        case "minecraft:deepslate_diamond_ore":          return rand(3, 7);
        case "minecraft:emerald_ore":
        case "minecraft:deepslate_emerald_ore":          return rand(3, 7);
        case "minecraft:quartz_ore":                     return rand(2, 5);
        case "minecraft:nether_gold_ore":                return rand(0, 1);
        default:                                         return 0;
    }
}

const SCULK_XP = {
    "minecraft:sculk":          1,
    "minecraft:sculk_catalyst": 5,
    "minecraft:sculk_sensor":   5,
    "minecraft:sculk_shrieker": 5,
};

const TIER_3 = new Set([
    "minecraft:obsidian", "minecraft:crying_obsidian",
    "minecraft:ancient_debris",
    "minecraft:netherite_block",
    "minecraft:respawn_anchor",
]);

function getToolType(typeId) {
    if (!typeId)                     return "hand";
    if (isPickaxe(typeId))           return "pickaxe";
    if (typeId.includes("_axe"))     return "axe";
    if (typeId.includes("_shovel"))  return "shovel";
    return "hand";
}

function canMineWith(toolTypeId, blockTypeId, skipTier = false) {
    const toolType = getToolType(toolTypeId);

    if (SHOVEL_BLOCKS.has(blockTypeId) || blockTypeId.endsWith("_concrete_powder"))
        return toolType === "shovel";

    if (isAxeBlock(blockTypeId))
        return toolType === "axe";

    if (TIER_3.has(blockTypeId) || TIER_2.has(blockTypeId) || TIER_1.has(blockTypeId)) {
        if (toolType !== "pickaxe") return false;
        if (skipTier) return true;
        const tier = TOOL_TIER[toolTypeId] ?? 0;
        if (TIER_3.has(blockTypeId) && tier < 3) return false;
        if (TIER_2.has(blockTypeId) && tier < 2) return false;
        if (TIER_1.has(blockTypeId) && tier < 1) return false;
        return true;
    }

    if (isPickaxeBlock(blockTypeId))
        return toolType === "pickaxe";

    return true;
}

function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function fortuneOre(base, level) {
    if (level === 0) return base;
    return base * Math.max(1, Math.floor(Math.random() * (level + 2)) - 1);
}

function fortuneLapis(level) {
    return rand(4, 9) * (level + 1);
}

function fortuneRedstone(level) {
    return rand(4, 5 + level * 3);
}

function fortuneNuggets(level) {
    return fortuneOre(rand(2, 6), level);
}

function isNoDropBlock(typeId) {
    if (typeId === "minecraft:ice") return true;
    if (typeId === "minecraft:packed_ice") return true;
    if (typeId === "minecraft:blue_ice") return true;
    if (typeId.includes("glass")) return true;
    return false;
}

export function getBlockDrop(block, hasSilkTouch, fortuneLevel) {
    const typeId = block.typeId;
    if (hasSilkTouch) return { typeId, amount: 1 };
    if (isNoDropBlock(typeId)) return null;

    switch (typeId) {
        case "minecraft:stone":                          return { typeId: "minecraft:cobblestone",         amount: 1 };
        case "minecraft:deepslate":                      return { typeId: "minecraft:cobbled_deepslate",   amount: 1 };
        case "minecraft:coal_ore":
        case "minecraft:deepslate_coal_ore":             return { typeId: "minecraft:coal",                amount: fortuneOre(1, fortuneLevel) };
        case "minecraft:iron_ore":
        case "minecraft:deepslate_iron_ore":             return { typeId: "minecraft:raw_iron",            amount: fortuneOre(1, fortuneLevel) };
        case "minecraft:copper_ore":
        case "minecraft:deepslate_copper_ore":           return { typeId: "minecraft:raw_copper",          amount: fortuneOre(rand(2, 5), fortuneLevel) };
        case "minecraft:lapis_ore":
        case "minecraft:deepslate_lapis_ore":            return { typeId: "minecraft:lapis_lazuli",        amount: fortuneLapis(fortuneLevel) };
        case "minecraft:gold_ore":
        case "minecraft:deepslate_gold_ore":             return { typeId: "minecraft:raw_gold",            amount: fortuneOre(1, fortuneLevel) };
        case "minecraft:nether_gold_ore":                return { typeId: "minecraft:gold_nugget",         amount: fortuneNuggets(fortuneLevel) };
        case "minecraft:redstone_ore":
        case "minecraft:lit_redstone_ore":
        case "minecraft:deepslate_redstone_ore":
        case "minecraft:lit_deepslate_redstone_ore":     return { typeId: "minecraft:redstone",            amount: fortuneRedstone(fortuneLevel) };
        case "minecraft:diamond_ore":
        case "minecraft:deepslate_diamond_ore":          return { typeId: "minecraft:diamond",             amount: fortuneOre(1, fortuneLevel) };
        case "minecraft:emerald_ore":
        case "minecraft:deepslate_emerald_ore":          return { typeId: "minecraft:emerald",             amount: fortuneOre(1, fortuneLevel) };
        case "minecraft:quartz_ore":                     return { typeId: "minecraft:quartz",              amount: fortuneOre(1, fortuneLevel) };
        case "minecraft:glowstone":                      return { typeId: "minecraft:glowstone_dust",      amount: rand(2, 4) };
        case "minecraft:sea_lantern":                    return { typeId: "minecraft:prismarine_crystals", amount: rand(2, 3) };
        default: {
            try {
                const native = block.getItemStack(fortuneLevel, hasSilkTouch);
                if (native) return { typeId: native.typeId, amount: native.amount };
            } catch { }
            return { typeId, amount: 1 };
        }
    }
}

export function canMineWithTool(toolTypeId, blockTypeId) { return canMineWith(toolTypeId, blockTypeId); }
export function isPickaxe(typeId)    { return typeof typeId === "string" && typeId.includes("_pickaxe"); }
export function isAxe(typeId)        { return typeof typeId === "string" && typeId.includes("_axe");     }
export function isShovel(typeId)     { return typeof typeId === "string" && typeId.includes("_shovel");  }
export function isDiggingTool(typeId){ return isPickaxe(typeId) || isAxe(typeId) || isShovel(typeId);   }

function getEnchantLevel(tool, enchantId) {
    try {
        const comp = tool?.getComponent("minecraft:enchantable");
        if (!comp) return 0;
        for (const ench of comp.getEnchantments()) {
            if (ench.type?.id === enchantId) return ench.level;
        }
    } catch { }
    return 0;
}

export function startMagnetEffect(player, entities) {
    const TICKS        = 20;
    const STOP_DIST_SQ = 1.0;
    const GRAVITY_COMP = 0.08;

    let tick = 0;
    const id = system.runInterval(() => {
        tick++;
        if (tick > TICKS) { system.clearRun(id); return; }

        let head;
        try { head = player.getHeadLocation(); } catch { system.clearRun(id); return; }

        let anyAlive = false;
        for (const entity of entities) {
            let pos;
            try { pos = entity.location; } catch { continue; }
            anyAlive = true;

            const dx = head.x - pos.x;
            const dy = head.y - pos.y;
            const dz = head.z - pos.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            if (distSq <= STOP_DIST_SQ) continue;

            const dist  = Math.sqrt(distSq);
            const speed = Math.max(0.6, dist * 0.25);
            const scale = speed / dist;

            try {
                const vel = entity.getVelocity();
                entity.applyImpulse({
                    x: dx * scale - vel.x,
                    y: dy * scale - vel.y + GRAVITY_COMP,
                    z: dz * scale - vel.z,
                });
            } catch { }
        }
        if (!anyAlive) system.clearRun(id);
    }, 1);
}

export function destroyBlocks(player, positions, onComplete) {
    if (isBuildBlockedForPlayer(player, true)) { onComplete?.(0); return; }
    const dim      = player.dimension;
    const dimId    = dim.id;
    const yMin     = dimId === "minecraft:nether" || dimId === "minecraft:the_end" ? 0 : -64;
    const yMax     = dimId === "minecraft:nether" ? 127 : dimId === "minecraft:the_end" ? 255 : 319;
    const expanded = expandDestroyForClaims(positions, (p) => {
        try {
            const block = dim.getBlock(p);
            if (!block) return null;
            return { typeId: block.typeId, states: block.permutation.getAllStates() };
        } catch { return null; }
    });
    const safePos  = dropIncompleteBeds(filterSafeZonePositions(player, dim.id, expanded, true).filter(p => p.y >= yMin && p.y <= yMax));
    if (!safePos.length) { onComplete?.(0); return; }
    const cap      = getMaxBlocks(player);
    let   capped   = trimPlacement(safePos.map((p) => ({
        ...p,
        _bedBlocks: p._bedBlocks ?? 1,
        _bedItems: p._bedItems ?? (p._bedHead ? 0 : 1),
    })), cap).positions;
    const creative = isCreative(player);

    let equip          = null;
    let toolTypeId     = null;
    let initialDamage  = 0;
    let maxDurability  = 0;
    let tool           = null;
    let hasSilkTouch   = false;
    let fortuneLevel   = 0;
    let unbreakingLevel = 0;

    let spareTools          = [];
    let activeIsMainhand    = true;
    let activeSlot          = -1;
    let activeInitialDamage = 0;
    let activeMaxDurability = 0;
    let inv                 = null;

    if (!creative) {
        try {
            equip = player.getComponent("minecraft:equippable");
            const held = equip?.getEquipment(EquipmentSlot.Mainhand);
            if (held && isDiggingTool(held.typeId)) {
                toolTypeId       = held.typeId;
                tool             = held;
                hasSilkTouch     = getEnchantLevel(held, "silk_touch") > 0;
                fortuneLevel     = getEnchantLevel(held, "fortune");
                unbreakingLevel  = getEnchantLevel(held, "unbreaking");
                const durComp    = held.getComponent("minecraft:durability");
                if (durComp) {
                    initialDamage = durComp.damage;
                    maxDurability = durComp.maxDurability;
                }
            }
        } catch { }

        activeInitialDamage = initialDamage;
        activeMaxDurability = maxDurability;

        if (toolTypeId) {
            try {
                inv = player.getComponent("minecraft:inventory")?.container;
                if (inv) {
                    for (let s = 0; s < inv.size; s++) {
                        if (s === player.selectedSlotIndex) continue;
                        const spare = inv.getItem(s);
                        if (!spare || !isDiggingTool(spare.typeId)) continue;
                        if (getToolType(spare.typeId) !== getToolType(toolTypeId)) continue;
                        const dc = spare.getComponent("minecraft:durability");
                        if (!dc) continue;
                        const spareDur = dc.maxDurability - dc.damage;
                        if (spareDur <= 0) continue;
                        spareTools.push({
                            slot:           s,
                            typeId:         spare.typeId,
                            initialDamage:  dc.damage,
                            maxDurability:  dc.maxDurability,
                            durabilityLeft: spareDur,
                            unbreakingLevel: getEnchantLevel(spare, "unbreaking"),
                            fortuneLevel:    getEnchantLevel(spare, "fortune"),
                            hasSilkTouch:    getEnchantLevel(spare, "silk_touch") > 0,
                            item: spare,
                        });
                    }
                }
            } catch { }
        }
    }

    let durabilityLeft = creative ? Infinity : (maxDurability > 0 ? maxDurability - initialDamage : Infinity);

    const threshold = getUndoThreshold(player);
    const snapshot  = threshold > 0 ? { dim: dim.id, bef: [], aft: [], destroy: true, survival: !creative } : null;

    const lootMgr      = world.getLootTableManager?.();
    const BULK_THRESHOLD = 500;
    const useBulk        = capped.length > BULK_THRESHOLD;
    const spawnDrops     = !creative;
    const collectDrops   = !creative && getDestroyDrops(player);
    const drops          = (useBulk && collectDrops) ? new Map() : null;
    const spawnedEntities = [];
    let totalXp    = 0;
    let count      = 0;
    let damageDealt = 0;
    let idx           = 0;
    let pendingRetries = 0;
    const pending  = [];
    const clearedBeds = new Set();

    const blocksPerTick = Math.ceil(capped.length / getBuildSpeed(player));

    const runId = system.runInterval(() => {
        if (!player || player.isValid !== true) {
            system.clearRun(runId);
            return;
        }
        const end = Math.min(idx + blocksPerTick, capped.length);

        for (; idx < end; idx++) {
            if (!creative && durabilityLeft <= 0) {
                if (spareTools.length > 0) {

                    try {
                        if (activeIsMainhand) equip?.setEquipment(EquipmentSlot.Mainhand, undefined);
                        else                  inv?.setItem(activeSlot, undefined);
                    } catch { }
                    const next          = spareTools.shift();
                    activeIsMainhand    = false;
                    activeSlot          = next.slot;
                    activeInitialDamage = next.initialDamage;
                    activeMaxDurability = next.maxDurability;
                    durabilityLeft      = next.durabilityLeft;
                    unbreakingLevel     = next.unbreakingLevel;
                    fortuneLevel        = next.fortuneLevel;
                    hasSilkTouch        = next.hasSilkTouch;
                    tool                = next.item;
                    toolTypeId          = next.typeId;
                    damageDealt         = 0;
                } else {
                    idx = capped.length;
                    break;
                }
            }
            try {
                const pos   = capped[idx];
                const posKey = `${pos.x},${pos.y},${pos.z}`;
                if (clearedBeds.has(posKey)) continue;
                const block = dim.getBlock(pos);
                if (!block) { pending.push(pos); continue; }
                if (block.isAir || UNBREAKABLE.has(block.typeId)) continue;
                if (!creative && !canMineWith(toolTypeId, block.typeId, !!lootMgr)) continue;

                const bedHead = isBedType(block.typeId) && (pos._bedHead === true || block.permutation.getAllStates()?.head_piece_bit === true);
                let lootItems = null;
                let drop      = null;
                if (spawnDrops && !bedHead) {
                    if (lootMgr) {
                        lootItems = lootMgr.generateLootFromBlockPermutation(block.permutation, tool);
                    } else {
                        drop = getBlockDrop(block, hasSilkTouch, fortuneLevel);
                    }
                }

                const xpGain = (!hasSilkTouch && SCULK_XP[block.typeId] ? SCULK_XP[block.typeId] : 0)
                             + getOreXp(block.typeId, hasSilkTouch);
                let snapBef = null;
                if (snapshot) {
                    const packed = block.typeId.startsWith("minecraft:") ? block.typeId.slice(10) : block.typeId;
                    const states = block.permutation.getAllStates();
                    const units = chargeUnits(block.typeId, states, pos._bedHead === true);
                    snapBef = { x: pos.x, y: pos.y, z: pos.z, t: packed, s: states, u: units };
                }
                const bedStates = isBedType(block.typeId) ? block.permutation.getAllStates() : null;
                const partner = bedStates ? bedPartnerPos(pos, bedStates) : null;
                const pk = partner ? `${partner.x},${partner.y},${partner.z}` : null;
                if (partner && pk && !clearedBeds.has(pk)) {
                    if (!filterSafeZonePositions(player, dim.id, [partner], false).length) continue;
                    try {
                        const other = dim.getBlock(partner);
                        if (!other || !isBedType(other.typeId) || UNBREAKABLE.has(other.typeId)) continue;
                    } catch { continue; }
                }
                try { block.setType("minecraft:air"); } catch { continue; }
                clearedBeds.add(posKey);
                if (bedStates && partner && pk && !clearedBeds.has(pk)) {
                    try {
                        const other = dim.getBlock(partner);
                        if (other && isBedType(other.typeId)) {
                            if (snapshot) {
                                const packed = other.typeId.startsWith("minecraft:") ? other.typeId.slice(10) : other.typeId;
                                const otherStates = other.permutation.getAllStates();
                                const head = otherStates?.head_piece_bit === true || chargeUnits(other.typeId, otherStates) === 0;
                                snapshot.bef.push({ x: partner.x, y: partner.y, z: partner.z, t: packed, s: otherStates, u: head ? 0 : 1 });
                                snapshot.aft.push({ x: partner.x, y: partner.y, z: partner.z, t: "air", s: {} });
                            }
                            other.setType("minecraft:air");
                            clearedBeds.add(pk);
                        }
                    } catch {}
                }

                totalXp += xpGain;
                if (snapshot && snapBef) {
                    snapshot.bef.push(snapBef);
                    snapshot.aft.push({ x: pos.x, y: pos.y, z: pos.z, t: "air", s: {} });
                }

                if (spawnDrops) {
                    if (lootItems?.length) {
                        if (drops) {
                            for (const item of lootItems)
                                drops.set(item.typeId, (drops.get(item.typeId) ?? 0) + item.amount);
                        } else {
                            for (const item of lootItems) {
                                try {
                                    const entity = dim.spawnItem(item, { x: pos.x + 0.5, y: pos.y + 1.0, z: pos.z + 0.5 });
                                    if (entity) spawnedEntities.push(entity);
                                } catch { }
                            }
                        }
                    } else if (drop) {
                        if (drops) {
                            drops.set(drop.typeId, (drops.get(drop.typeId) ?? 0) + drop.amount);
                        } else {
                            try {
                                const entity = dim.spawnItem(new ItemStack(drop.typeId, drop.amount), { x: pos.x + 0.5, y: pos.y + 1.0, z: pos.z + 0.5 });
                                if (entity) spawnedEntities.push(entity);
                            } catch { }
                        }
                    }
                }

                count++;
                if (!creative && Math.random() < 1 / (unbreakingLevel + 1)) {
                    durabilityLeft--;
                    damageDealt++;
                }
            } catch { }
        }

        if (idx < capped.length) {
            try {
                lockActionBar(player.id, 200);
                player.onScreenDisplay.setActionBar(t("eb.bar.destroying", (capped.length - idx) + pending.length));
            } catch { }
            return;
        }

        if (pending.length > 0 && pendingRetries < 40) {
            pendingRetries++;
            capped = pending.splice(0);
            idx    = 0;
            try {
                lockActionBar(player.id, 200);
                player.onScreenDisplay.setActionBar(t("eb.bar.destroying", capped.length));
            } catch { }
            return;
        }

        system.clearRun(runId);

        if (useBulk && drops && drops.size > 0) {
            try {
                const head     = player.getHeadLocation();
                const spawnPos = { x: head.x, y: head.y - 1, z: head.z };
                for (const [typeId, total] of drops) {
                    let rem = total;
                    while (rem > 0) {
                        const n = Math.min(rem, 64);
                        try { dim.spawnItem(new ItemStack(typeId, n), spawnPos); } catch { }
                        rem -= n;
                    }
                }
            } catch { }
        } else if (spawnedEntities.length > 0 && collectDrops) {
            startMagnetEffect(player, spawnedEntities);
        }

        if (!creative && toolTypeId && damageDealt > 0) {
            try {
                if (activeIsMainhand) {
                    const held = equip?.getEquipment(EquipmentSlot.Mainhand);
                    if (held?.typeId === toolTypeId) {
                        const durComp = held.getComponent("minecraft:durability");
                        if (durComp) {
                            const newDamage = activeInitialDamage + damageDealt;
                            if (newDamage >= activeMaxDurability) {
                                equip.setEquipment(EquipmentSlot.Mainhand, undefined);
                                player.sendMessage(t("eb.destroy.pickaxe_broke"));
                            } else {
                                durComp.damage = newDamage;
                                equip.setEquipment(EquipmentSlot.Mainhand, held);
                            }
                        }
                    }
                } else if (inv) {
                    const spare = inv.getItem(activeSlot);
                    if (spare?.typeId === toolTypeId) {
                        const durComp = spare.getComponent("minecraft:durability");
                        if (durComp) {
                            const newDamage = activeInitialDamage + damageDealt;
                            if (newDamage >= activeMaxDurability) {
                                inv.setItem(activeSlot, undefined);
                                player.sendMessage(t("eb.destroy.pickaxe_broke"));
                            } else {
                                durComp.damage = newDamage;
                                inv.setItem(activeSlot, spare);
                            }
                        }
                    }
                }
            } catch { }
        }

        if (totalXp > 0) {
            try { player.addExperience(totalXp); } catch { }
        }

        if (snapshot) recordSnapshot(player, snapshot);
        if (onComplete) onComplete(count);
    }, 1);
}
