// @ts-nocheck
import {
    world, system, ItemStack, Player,
    BlockPermutation,
    CommandPermissionLevel, CustomCommandStatus,
} from "@minecraft/server";
import { showModeMenu } from "./ui/ModeSelectUI.js";
import { showModifiersUI } from "./ui/ModifiersUI.js";
import { applyModifiers } from "./core/ModifierPipeline.js";
import { showSettingsUI } from "./ui/SettingsUI.js";
import { showPaletteUI } from "./ui/PaletteUI.js";
import { offerTutorialBook } from "./ui/HelpUI.js";
import { showClipboardUI, showCopyCutPrompt } from "./ui/ClipboardUI.js";
import { showOnboarding } from "./ui/OnboardingUI.js";
import { startLanguagePicker, hasPicker, pickerClick } from "./core/LanguagePicker.js";
import { startEntityPanels, panelClick, hasPanel, removePanel } from "./core/EntityPanel.js";
import "./ui/FloatingPanels.js";
import { startCoachLoop, toggleCoach, coachClick, coachAimed, coachGuards, cleanupCoach } from "./core/Coach.js";
import { coachEvent } from "./utils/CoachEvents.js";
import { startHoldWheel, bookPressed, cleanupHoldWheel } from "./core/HoldWheel.js";
import { startPanelLightCleanup } from "./core/PanelLight.js";
import { startGuideBook, onTutorialBookUse, cleanupGuideBook, changeBookLanguage } from "./core/GuideBook.js";
import { loadSlot, loadSlotMeta, AUTO_SLOT } from "./utils/ClipboardStore.js";
import { getState, setMode, setAnchor, setSecondAnchor, clearAnchor, clearClipboard, removeState, addWaypoint, getWaypoints } from "./core/PlayerState.js";
import { executePaste } from "./core/Clipboard.js";
import { getModeHandler, MODE_LIST } from "./modes/ModeRegistry.js";
import { placeBlocks, ALWAYS_REPLACEABLE, UNPLACEABLE } from "./core/BlockPlacer.js";
import { destroyBlocks, isDiggingTool, canMineWithTool } from "./core/BlockDestroyer.js";
import { startPreviewLoop, getTargetPos, getTargetBlock, getStep3HeightTarget, clearPreviewCache, clearDeferHintState, getLastPreviewTargetPos } from "./core/Preview.js";
import { onChange } from "./settings.js";
import { getMenuStyle } from "./utils/CustomUI.js";
import { startPlacementQueue, setPlayerBuildSpeed, removePlayerBuildSpeed } from "./core/PlacementQueue.js";
import { startModifierVisualizerLoop } from "./core/ModifierVisualizer.js";
import { startVanillaModifierHook } from "./core/VanillaModifierHook.js";
import { performUndo, performRedo, clearPlayerTempStacks } from "./core/UndoRedo.js";
import { getAirBuildTarget, getPlacementStatesFromAir, getPlacementStatesFromFace } from "./modes/AirBuildMode.js";
import { getAirBuildReach, hasRequiredTag, getRequiredTag, getBuildSpeed, waveToQueueSpeed, getInfiniteReach, getInfiniteReachDistance, getAllowDestroy, getDestroyCreativeOnly, getAutoGiveBook, getFovZoomStart, getFovZoomMax, getFovZoomEnabled, getSwapBookActions, getOnboarded, hasSimpleModesPref, setSimpleModes } from "./core/Settings.js";
import { isCreative } from "./utils/InventoryUtils.js";
import { t } from "./utils/Text.js";
import { catmullRomSpline } from "./utils/GeometryUtils.js";
import { getModeOption } from "./utils/ModeOptions.js";
import { lockActionBar, cleanupActionBar } from "./utils/ActionBar.js";
import { BOOK_ID, BOOK_NAME, BOOK_LORE, isBook, isTutorialBook, hasItem, giveBuildingBook, giveTutorialBook, heldItemCached, idleSkip, IDLE_EVERY, allPlayers } from "./utils/Items.js";
import { filterAllowedPositionsAsync, refusal } from "./core/Protection.js";

const GETBOOK_COST = 5;
const anchoredAtMs = new Map();
const lastAirBuildMs = new Map();
const prevSneakState        = new Map();
const lastSneakPressMs      = new Map();
const savedModeBeforeToggle = new Map();
const validBlockIds = new Set();
function isValidBlock(typeId) {
    if (UNPLACEABLE.has(typeId)) return false;
    if (validBlockIds.has(typeId)) return true;
    try { BlockPermutation.resolve(typeId); validBlockIds.add(typeId); return true; } catch { return false; }
}
function isInsidePlayer(player, pos) {
    const loc = player.location;
    return pos.x < loc.x + 0.3 && pos.x + 1 > loc.x - 0.3 &&
        pos.y < loc.y + 1.8 && pos.y + 1 > loc.y &&
        pos.z < loc.z + 0.3 && pos.z + 1 > loc.z - 0.3;
}
const lastInteractMs = new Map();
const wrongToolMsgMs = new Map();
const needsAnchorCapture = new Map();

const destroyBlockInteractHandled = new Set();
const selectionFovMap = new Map();

function getBook(player) {
    try {
        const why = refusal(player);
        if (why) {
            player.sendMessage(`§e[EB] ${why}`);
            return;
        }
        if (!hasRequiredTag(player)) {
            player.sendMessage(t("eb.getbook.no_tag", getRequiredTag()));
            return;
        }
        if (hasItem(player, BOOK_ID)) {
            player.sendMessage(t("eb.getbook.already_have"));
            return;
        }
        if (!giveBuildingBook(player)) return;
        player.sendMessage(t("eb.join.received_book"));
    } catch { }
}

function command(registry, name, description, run) {
    registry.registerCommand(
        {
            name,
            description,
            permissionLevel: CommandPermissionLevel.Any,
            cheatsRequired: false,
        },
        origin => {
            const source = origin.initiator ?? origin.sourceEntity;
            if (!(source instanceof Player)) {
                return { status: CustomCommandStatus.Failure, message: "This command can only be run by a player." };
            }
            const why = refusal(source);
            if (why) {
                return { status: CustomCommandStatus.Failure, message: why };
            }
            system.run(() => {
                if (!source.isValid) return;
                try { run(source); } catch (e) { console.warn(`[EB] ${e}`); }
            });
            return { status: CustomCommandStatus.Success };
        }
    );
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry: r }) => {
    command(r, "realm:build", "Easy Building: open the Effortless Building mode menu", showModeMenu);
    command(r, "realm:build_book", "Get an Effortless Building Book", getBook);
    command(r, "realm:build_tutorial", "Get the Effortless Building tutorial book", offerTutorialBook);
    command(r, "realm:build_guide", "Start or stop the live Effortless Building Coach tutorial", toggleCoach);
    command(r, "realm:build_palette", "Open the Effortless Building block palette", showPaletteUI);
    command(r, "realm:build_modifiers", "Open the Effortless Building mirror, array and radial modifiers", showModifiersUI);
    command(r, "realm:build_clipboard", "Open the Effortless Building clipboard manager", showClipboardUI);
    command(r, "realm:build_settings", "Open the Effortless Building settings", player => showSettingsUI(player));
    command(r, "realm:build_preview", "Open the Effortless Building preview settings", player => showSettingsUI(player, "preview"));
    command(r, "realm:build_setup", "Pick an Effortless Building performance preset for your device", player => showOnboarding(player));
    command(r, "realm:build_language", "Choose the language of the Effortless Building menus and tutorial book", changeBookLanguage);
    command(r, "realm:build_undo", "Undo the last Effortless Building placement", performUndo);
    command(r, "realm:build_redo", "Redo the last undone Effortless Building placement", performRedo);
});

system.afterEvents.scriptEventReceive.subscribe(
    ({ id }) => {
        if (id === "realm:help_ping") {
            system.sendScriptEvent("realm:help_pong", "build_bp");
        }
    },
    { namespaces: ["realm"] }
);

function welcome(player) {
    if (getAutoGiveBook()) {
        let received = false;
        if (!player.getDynamicProperty("eb:bookGiven") && giveBuildingBook(player)) {
            player.setDynamicProperty("eb:bookGiven", true);
            received = true;
        }
        if (!player.getDynamicProperty("eb:tutorialBookGiven") && giveTutorialBook(player)) {
            player.setDynamicProperty("eb:tutorialBookGiven", true);
            received = true;
        }
        if (received) player.sendMessage(t("eb.join.welcome"));
    }
    if (!swingSupported && !player.getDynamicProperty("eb:leftClickNoticed")) {
        player.setDynamicProperty("eb:leftClickNoticed", true);
        player.sendMessage(t("eb.join.no_left_click"));
    }
}

world.afterEvents.playerSpawn.subscribe(ev => {
    const player = ev.player;
    if (player.hasTag("eb:zooming")) {
        player.removeTag("eb:zooming");
        system.run(() => { try { player.runCommand("camera @s clear"); } catch {} });
    }
    setPlayerBuildSpeed(player.id, waveToQueueSpeed(getBuildSpeed(player)));

    if (!hasSimpleModesPref(player) && getOnboarded(player)) {
        setSimpleModes(player, false);
    }

    if (!getState(player).clipboard && loadSlotMeta(player, AUTO_SLOT)) {
        try {
            const restored = loadSlot(player, AUTO_SLOT);
            if (restored?.blocks?.length) {
                getState(player).clipboard = restored;
                if (restored.isCut) {
                    system.run(() => player.sendMessage(t("eb.clipboard.restored_cut")));
                }
            }
        } catch { }
    }
    system.run(() => { try { welcome(player); } catch { } });
    if (getAutoGiveBook() && !getOnboarded(player)) {
        system.runTimeout(() => {
            showOnboarding(player, { persist: true });
        }, 40);
    }
});
function confirmPlacement(player, fallbackTarget) {
    const state = getState(player);
    if (state.mode === "disable" || !state.anchor || !state.blockTypeId) return;
    const anchor = { x: state.anchor.x, y: state.anchor.y, z: state.anchor.z };
    const typeId = state.blockTypeId;
    const blockStates = state.blockStates ?? {};
    const mode = state.mode;
    const handler = getModeHandler(mode);
    const isThreeStep = handler?.steps === 3;
    const hasSecond = !!state.secondAnchor;
    if (isThreeStep && !hasSecond) {
        const xzTarget = (handler.getTarget ? handler.getTarget(player, anchor) : null)
            ?? getTargetPos(player)
            ?? fallbackTarget;
        if (!xzTarget) return;
        setSecondAnchor(player, xzTarget);
        const isDestroy3 = typeId === "eb:destroy";
        system.run(() => player.onScreenDisplay.setActionBar(
            t(isDestroy3 ? "eb.bar.xz_set_destroy" : "eb.bar.xz_set_place")
        ));
        lockActionBar(player.id, 1000);
        return;
    }
    const isDestroy = typeId === "eb:destroy";
    const useGetTarget = !(isThreeStep && hasSecond);
    let target;
    if (isThreeStep && hasSecond) {
        target = (handler?.getStep3Target?.(player, anchor, state.secondAnchor)
            ?? getStep3HeightTarget(player, state.secondAnchor)) ?? fallbackTarget;
    } else if (useGetTarget && !isDestroy && handler?.getTarget) {
        target = handler.getTarget(player, anchor) ?? fallbackTarget;
    } else {
        target = fallbackTarget;
    }
    if (!target) return;

    if (!isDestroy && getModeOption(player, mode, "curve") === "bezier") {
        if (!player.isSneaking) {
            addWaypoint(player, target);
            const total = getWaypoints(player).length + 1;
            system.run(() => {
                player.onScreenDisplay.setActionBar(
                    total === 1
                        ? t("eb.bar.bezier_one")
                        : t("eb.bar.bezier", total)
                );
            });
            lockActionBar(player.id, 1500);
            return;
        }

        const allPoints = [anchor, ...getWaypoints(player), target];
        clearAnchor(player);
        clearPreviewCache(player.id);
        system.run(async () => {
            const rawPositions = catmullRomSpline(allPoints);
            if (!rawPositions?.length) return;
            const modPositions = applyModifiers(player, rawPositions);
            if (!modPositions?.length) return;
            const positions = await filterAllowedPositionsAsync(player, player.dimension.id, modPositions, true);
            if (!positions?.length) return;
            const placed = placeBlocks(player, positions, anchor, typeId, blockStates);
            if (placed > 0) {
                player.onScreenDisplay.setActionBar(t("eb.bar.placed", placed, mode));
                lockActionBar(player.id, 2500);
                coachEvent(player, "placed");
            }
        });
        return;
    }

    const secondAnchor = state.secondAnchor
        ? { x: state.secondAnchor.x, y: state.secondAnchor.y, z: state.secondAnchor.z }
        : null;
    clearAnchor(player);
    clearPreviewCache(player.id);
    system.run(async () => {
        if (!handler) return;
        const rawPositions = handler.getPositions(anchor, target, player, secondAnchor);
        if (!rawPositions?.length) return;
        const modPositions = applyModifiers(player, rawPositions);
        if (!modPositions?.length) return;
        const positions = await filterAllowedPositionsAsync(player, player.dimension.id, modPositions, true);
        if (!positions?.length) return;
        if (isDestroy) {
            destroyBlocks(player, positions, (destroyed) => {
                if (destroyed > 0) {
                    player.onScreenDisplay.setActionBar(t("eb.bar.destroyed", destroyed, mode));
                    lockActionBar(player.id, 2500);
                    coachEvent(player, "placed");
                }
            });
        } else {
            const placed = placeBlocks(player, positions, anchor, typeId, blockStates);
            if (placed > 0) {
                player.onScreenDisplay.setActionBar(t("eb.bar.placed", placed, mode));
                lockActionBar(player.id, 2500);
                coachEvent(player, "placed");
            }
        }
    });
}
const DIR_OFFSET = {
    Up: { x: 0, y: 1, z: 0 },
    Down: { x: 0, y: -1, z: 0 },
    North: { x: 0, y: 0, z: -1 },
    South: { x: 0, y: 0, z: 1 },
    East: { x: 1, y: 0, z: 0 },
    West: { x: -1, y: 0, z: 0 },
};
world.beforeEvents.playerInteractWithBlock.subscribe(ev => {
    if (ev.cancel) return;
    const player = ev.player;
    const item = ev.itemStack;
    if (coachAimed(player)) {
        ev.cancel = true;
        system.run(() => coachClick(player, true));
        return;
    }
    if (isBook(item) || isTutorialBook(item)) return;
    const state = getState(player);
    if (state.mode === "disable") return;
    if (!hasRequiredTag(player)) return;
    const off = DIR_OFFSET[ev.blockFace] ?? { x: 0, y: 1, z: 0 };
    const loc = ev.block.location;
    const facePos = { x: loc.x + off.x, y: loc.y + off.y, z: loc.z + off.z };

    if (state.mode === "copy_paste") {
        ev.cancel = true;
        destroyBlockInteractHandled.add(player.id);

        if (player.isSneaking && state.clipboard) {
            clearClipboard(player);
            clearAnchor(player);
            clearPreviewCache(player.id);
            anchoredAtMs.set(player.id, Date.now());
            system.run(() => player.onScreenDisplay.setActionBar(t("eb.bar.copy_cleared")));
            lockActionBar(player.id, 1500);
            return;
        }

        if (state.clipboard && !state.anchor) {
            if (Date.now() - (anchoredAtMs.get(player.id) ?? 0) < 200) return;
            anchoredAtMs.set(player.id, Date.now());
            lastInteractMs.set(player.id, Date.now());
            system.run(() => {
                const count = executePaste(player, facePos);
                if (count > 0) getState(player).lastPasteAt = Date.now();
                player.onScreenDisplay.setActionBar(count > 0
                    ? t("eb.bar.pasted", count)
                    : t("eb.bar.paste_empty"));
                lockActionBar(player.id, 2000);
            });
            return;
        }

        const clickPos = player.isSneaking ? loc : facePos;

        if (!state.anchor) {
            if (Date.now() - (anchoredAtMs.get(player.id) ?? 0) < 200) return;
            setAnchor(player, clickPos, "eb:copy", {});
            anchoredAtMs.set(player.id, Date.now());
            lastInteractMs.set(player.id, Date.now());
            system.run(() => player.onScreenDisplay.setActionBar(t("eb.bar.copy_corner1", clickPos.x, clickPos.y, clickPos.z)));
            lockActionBar(player.id, 600);
            return;
        }

        if (!state.secondAnchor) {
            if (Date.now() - (anchoredAtMs.get(player.id) ?? 0) < 200) return;
            setSecondAnchor(player, clickPos);
            anchoredAtMs.set(player.id, Date.now());
            lastInteractMs.set(player.id, Date.now());
            system.run(() => player.onScreenDisplay.setActionBar(t("eb.bar.copy_corner2", clickPos.x, clickPos.y, clickPos.z)));
            lockActionBar(player.id, 600);
            return;
        }

        if (Date.now() - (anchoredAtMs.get(player.id) ?? 0) < 200) return;
        const corner1 = { x: state.anchor.x,       y: state.anchor.y, z: state.anchor.z };
        const corner2 = { x: state.secondAnchor.x, y: clickPos.y,     z: state.secondAnchor.z };
        clearAnchor(player);
        clearPreviewCache(player.id);
        anchoredAtMs.set(player.id, Date.now());
        lastInteractMs.set(player.id, Date.now());
        system.run(() => showCopyCutPrompt(player, corner1, corner2));
        return;
    }
    if (isDiggingTool(item?.typeId)) {
        if (state.mode === "air_build") {
            if (!state.anchor) {
                system.run(() => player.sendMessage(t("eb.destroy.no_mode")));
            }
            return;
        }
        if (!state.anchor) {
            if (!getAllowDestroy()) {
                system.run(() => player.sendMessage(t("eb.destroy.disabled")));
                return;
            }
            if (getDestroyCreativeOnly() && !isCreative(player)) {
                system.run(() => player.sendMessage(t("eb.destroy.creative_only")));
                return;
            }
            if (Date.now() - (lastInteractMs.get(player.id) ?? 0) < 200) return;
            ev.cancel = true;
            destroyBlockInteractHandled.add(player.id);
            if (!isCreative(player) && !canMineWithTool(item?.typeId, ev.block.typeId)) {
                const now = Date.now();
                if (now - (wrongToolMsgMs.get(player.id) ?? 0) >= 3000) {
                    wrongToolMsgMs.set(player.id, now);
                    system.run(() => player.sendMessage(t("eb.destroy.wrong_tool")));
                }
                return;
            }
            setAnchor(player, loc, "eb:destroy", {});
            anchoredAtMs.set(player.id, Date.now());
            system.run(() => player.onScreenDisplay.setActionBar(
                t("eb.bar.destroy_anchor_set", loc.x, loc.y, loc.z)
            ));
            lockActionBar(player.id, 1000);
            return;
        }
        if (Date.now() - (anchoredAtMs.get(player.id) ?? 0) < 200) return;
        ev.cancel = true;
        destroyBlockInteractHandled.add(player.id);
        anchoredAtMs.set(player.id, Date.now());
        lastInteractMs.set(player.id, Date.now());
        confirmPlacement(player, loc);
        return;
    }
    if (state.mode === "air_build") {
        if (!item) return;
        if (!isValidBlock(item.typeId)) return;
        const reach = getAirBuildReach(player);
        const bl = ev.block.location;
        const head = player.getHeadLocation();
        const distSq = (bl.x + 0.5 - head.x) ** 2 +
            (bl.y + 0.5 - head.y) ** 2 +
            (bl.z + 0.5 - head.z) ** 2;
        ev.cancel = true;
        if (distSq > reach * reach) return;
        const blockStates = getPlacementStatesFromFace(item.typeId, ev.blockFace, player);
        lastAirBuildMs.set(player.id, Date.now());
        system.run(() => {
            if (isInsidePlayer(player, facePos)) return;
            const placed = placeBlocks(player, [facePos], facePos, item.typeId, blockStates, { immediate: true });
            if (placed > 0) {
                player.onScreenDisplay.setActionBar(t("eb.bar.placed_one"));
                coachEvent(player, "placed");
                lockActionBar(player.id, 300);
            }
        });
        return;
    }
    if (item?.typeId?.includes("shulker_box")) return;
    if (!state.anchor) {
        if (!item) return;
        if (!isValidBlock(item.typeId)) return;
        const anchorPos = ALWAYS_REPLACEABLE.has(ev.block.typeId) ? loc : facePos;
        let prevPerm;
        try { prevPerm = player.dimension.getBlock(anchorPos)?.permutation; } catch { }
        needsAnchorCapture.set(player.id, { facePos: anchorPos, blockTypeId: item.typeId, prevPerm });
        anchoredAtMs.set(player.id, Date.now());
        return;
    }
    if (!state.blockTypeId) return;
    if (item?.typeId !== state.blockTypeId) return;
    if (Date.now() - (anchoredAtMs.get(player.id) ?? 0) < 200) return;
    ev.cancel = true;
    lastInteractMs.set(player.id, Date.now());
    const target = ALWAYS_REPLACEABLE.has(ev.block.typeId) ? loc : facePos;
    confirmPlacement(player, target);
});
world.afterEvents.itemUse.subscribe(ev => {
    const player = ev.source;
    const item = ev.itemStack;
    if (coachClick(player, true) || coachGuards(player)) return;
    if (isTutorialBook(item)) {
        onTutorialBookUse(player);
        return;
    }
    if (isBook(item)) {
        if (hasPicker(player.id)) {
            pickerClick(player);
            return;
        }
        if (panelClick(player)) return;
        if (player.isSneaking) {
            showSettingsUI(player);
        } else {
            if (!hasRequiredTag(player)) {
                player.sendMessage(
                    t("eb.tag.required", getRequiredTag())
                );
                return;
            }
            if (!player.hasTag("eb:openedbook")) {
                player.addTag("eb:openedbook");
                player.sendMessage(t("eb.first_open"));
            }
            bookPressed(player, () => {
                if (getSwapBookActions(player)) showPaletteUI(player);
                else showModeMenu(player);
            });
        }
        return;
    }

    if (destroyBlockInteractHandled.has(player.id)) {
        destroyBlockInteractHandled.delete(player.id);
        return;
    }
    const state = getState(player);
    if (!hasRequiredTag(player)) return;
    if (state.mode === "air_build") {
        if (!item) return;
        if (!isValidBlock(item.typeId)) return;
        if (Date.now() - (lastAirBuildMs.get(player.id) ?? 0) < 50) return;
        const reach = getAirBuildReach(player);
        const target = getAirBuildTarget(player, reach);
        if (!target) return;
        if (isInsidePlayer(player, target)) return;
        const blockStates = getPlacementStatesFromAir(item.typeId, player);
        const placed = placeBlocks(player, [target], target, item.typeId, blockStates, { immediate: true });
        if (placed > 0) {
            player.onScreenDisplay.setActionBar(t("eb.bar.placed_one"));
            coachEvent(player, "placed");
            lockActionBar(player.id, 300);
        }
        return;
    }

    if (state.mode === "copy_paste") {
        if (player.isSneaking) {
            if (state.clipboard) {
                clearClipboard(player);
                clearAnchor(player);
                clearPreviewCache(player.id);
                anchoredAtMs.set(player.id, Date.now());
                lastInteractMs.set(player.id, Date.now());
                system.run(() => player.onScreenDisplay.setActionBar(t("eb.bar.copy_cleared")));
                lockActionBar(player.id, 1500);
            } else if (state.anchor) {
                clearAnchor(player);
                clearPreviewCache(player.id);
                anchoredAtMs.set(player.id, Date.now());
                lastInteractMs.set(player.id, Date.now());
                system.run(() => player.onScreenDisplay.setActionBar(t("eb.bar.copy_cancelled")));
                lockActionBar(player.id, 1500);
            }
            return;
        }

        if (state.clipboard && !state.anchor) {
            if (Date.now() - (lastInteractMs.get(player.id) ?? 0) < 200) return;
            lastInteractMs.set(player.id, Date.now());
            const airTarget = getTargetPos(player);
            if (!airTarget) return;
            system.run(() => {
                const count = executePaste(player, airTarget);
                if (count > 0) getState(player).lastPasteAt = Date.now();
                player.onScreenDisplay.setActionBar(count > 0
                    ? t("eb.bar.pasted", count)
                    : t("eb.bar.paste_empty"));
                lockActionBar(player.id, 2000);
            });
            return;
        }

        if (state.clipboard) return;
        if (Date.now() - (lastInteractMs.get(player.id) ?? 0) < 200) return;
        const airPos = getTargetPos(player);
        if (!airPos) return;

        if (!state.anchor) {
            setAnchor(player, airPos, "eb:copy", {});
            anchoredAtMs.set(player.id, Date.now());
            lastInteractMs.set(player.id, Date.now());
            system.run(() => player.onScreenDisplay.setActionBar(t("eb.bar.copy_corner1", airPos.x, airPos.y, airPos.z)));
            lockActionBar(player.id, 600);
            return;
        }

        if (!state.secondAnchor) {
            setSecondAnchor(player, airPos);
            anchoredAtMs.set(player.id, Date.now());
            lastInteractMs.set(player.id, Date.now());
            system.run(() => player.onScreenDisplay.setActionBar(t("eb.bar.copy_corner2", airPos.x, airPos.y, airPos.z)));
            lockActionBar(player.id, 600);
            return;
        }

        const airCorner1 = { x: state.anchor.x,       y: state.anchor.y, z: state.anchor.z };
        const airCorner2 = { x: state.secondAnchor.x, y: airPos.y,       z: state.secondAnchor.z };
        clearAnchor(player);
        clearPreviewCache(player.id);
        anchoredAtMs.set(player.id, Date.now());
        lastInteractMs.set(player.id, Date.now());
        system.run(() => showCopyCutPrompt(player, airCorner1, airCorner2));
        return;
    }
    if (isDiggingTool(item?.typeId) && state.mode !== "disable") {
        if (!state.anchor) {
            if (!getAllowDestroy()) {
                player.sendMessage(t("eb.destroy.disabled"));
                return;
            }
            if (getDestroyCreativeOnly() && !isCreative(player)) {
                player.sendMessage(t("eb.destroy.creative_only"));
                return;
            }
            const infiniteReach = getInfiniteReach(player);
            if (!infiniteReach) return;
            if (Date.now() - (lastInteractMs.get(player.id) ?? 0) < 200) return;
            if (Date.now() - (lastAirBuildMs.get(player.id) ?? 0) < 50) return;
            const target = getTargetBlock(player, getInfiniteReachDistance(player));
            if (!target) return;
            if (!isCreative(player)) {
                const targetBlock = player.dimension.getBlock(target);
                if (targetBlock && !canMineWithTool(item?.typeId, targetBlock.typeId)) {
                    const now = Date.now();
                    if (now - (wrongToolMsgMs.get(player.id) ?? 0) >= 3000) {
                        wrongToolMsgMs.set(player.id, now);
                        player.sendMessage(t("eb.destroy.wrong_tool"));
                    }
                    return;
                }
            }
            setAnchor(player, target, "eb:destroy", {});
            lastAirBuildMs.set(player.id, Date.now());
            anchoredAtMs.set(player.id, Date.now());
            player.onScreenDisplay.setActionBar(
                t("eb.bar.destroy_anchor_set", target.x, target.y, target.z)
            );
            lockActionBar(player.id, 1000);
            return;
        }
        if (state.blockTypeId !== "eb:destroy") return;

        const infiniteReach  = getInfiniteReach(player);
        if (!infiniteReach) return;
        if (Date.now() - (anchoredAtMs.get(player.id) ?? 0) < 200) return;
        if (Date.now() - (lastInteractMs.get(player.id) ?? 0) < 200) return;
        const handler_ = getModeHandler(state.mode);
        const isStep3_ = handler_?.steps === 3 && !!state.secondAnchor;

        const destroyMaxDist = infiniteReach ? getInfiniteReachDistance(player) : 64;
        const target = isStep3_
            ? (getStep3HeightTarget(player, state.secondAnchor) ?? getTargetBlock(player, destroyMaxDist))
            : getTargetBlock(player, destroyMaxDist);
        if (!target) return;
        lastInteractMs.set(player.id, Date.now());
        confirmPlacement(player, target);
        return;
    }
    if (!state.anchor) {
        if (Date.now() - (lastInteractMs.get(player.id) ?? 0) < 200) return;
        const infiniteReach = getInfiniteReach(player);
        if (!infiniteReach || state.mode === "disable") return;
        if (!item || !isValidBlock(item.typeId)) return;
        if (Date.now() - (lastAirBuildMs.get(player.id) ?? 0) < 50) return;
        const reach  = infiniteReach ? getInfiniteReachDistance(player) : getAirBuildReach(player);
        const target = getAirBuildTarget(player, reach);
        if (!target) return;
        if (isInsidePlayer(player, target)) return;
        const blockStates = getPlacementStatesFromAir(item.typeId, player);
        setAnchor(player, target, item.typeId, blockStates);
        lastAirBuildMs.set(player.id, Date.now());
        anchoredAtMs.set(player.id, Date.now());
        player.onScreenDisplay.setActionBar(
            t("eb.bar.anchor_set", target.x, target.y, target.z)
        );
        lockActionBar(player.id, 1000);
        return;
    }
    if (state.mode === "disable" || !state.anchor || !state.blockTypeId) return;
    if (item?.typeId !== state.blockTypeId) return;
    if (Date.now() - (anchoredAtMs.get(player.id) ?? 0) < 200) return;
    if (Date.now() - (lastInteractMs.get(player.id) ?? 0) < 200) return;
    const handler_ = getModeHandler(state.mode);
    const isStep3_ = handler_?.steps === 3 && !!state.secondAnchor;
    const infiniteReach = getInfiniteReach(player);
    const target = isStep3_
        ? (getStep3HeightTarget(player, state.secondAnchor) ?? (infiniteReach ? getAirBuildTarget(player, getInfiniteReachDistance(player)) : getTargetPos(player)))
        : (infiniteReach ? getAirBuildTarget(player, getInfiniteReachDistance(player)) : getTargetPos(player));
    if (!target) return;
    lastInteractMs.set(player.id, Date.now());
    confirmPlacement(player, target);
});
world.afterEvents.playerPlaceBlock.subscribe(ev => {
    const player = ev.player;
    const info = needsAnchorCapture.get(player.id);
    if (!info) return;
    needsAnchorCapture.delete(player.id);
    const { facePos, blockTypeId, prevPerm } = info;
    const block = ev.block;
    if (block.typeId !== blockTypeId) return;
    const states = block.permutation.getAllStates();
    try {
        if (prevPerm) block.setPermutation(prevPerm);
        else block.setType("minecraft:air");
    } catch { }
    if (!isCreative(player)) {
        try {
            const inv = player.getComponent("minecraft:inventory");
            const slot = player.selectedSlotIndex;
            const cur = inv?.container?.getItem(slot);
            if (cur?.typeId === blockTypeId) {
                cur.amount++;
                inv.container.setItem(slot, cur);
            } else {
                inv?.container?.setItem(slot, new ItemStack(blockTypeId, 1));
            }
        } catch { }
    }
    setAnchor(player, facePos, blockTypeId, states);
    player.onScreenDisplay.setActionBar(
        t("eb.bar.anchor_set", facePos.x, facePos.y, facePos.z)
    );
    lockActionBar(player.id, 1000);
});
let swingSupported = false;
try {
    world.afterEvents.playerSwingStart.subscribe(ev => {
        const player = ev.player;
        const inv = player.getComponent("minecraft:inventory")?.container;
        if (!inv) return;
        const item = inv.getItem(player.selectedSlotIndex);
        if (coachGuards(player)) {
            coachClick(player, true);
            return;
        }
        if (!isBook(item)) return;
        if (hasPicker(player.id)) {
            pickerClick(player);
            return;
        }
        if (hasPanel(player.id)) return;
        if (!hasRequiredTag(player)) {
            player.sendMessage(
                t("eb.tag.required", getRequiredTag())
            );
            return;
        }
        if (player.isSneaking) {
            showModifiersUI(player);
        } else if (getSwapBookActions(player)) {
            showModeMenu(player);
        } else {
            showPaletteUI(player);
        }
    });
    swingSupported = true;
} catch {
}
world.afterEvents.playerLeave.subscribe(ev => {
    removeState(ev.playerId);
    removePlayerBuildSpeed(ev.playerId);
    clearPlayerTempStacks(ev.playerId);
    clearPreviewCache(ev.playerId);
    clearDeferHintState(ev.playerId);
    anchoredAtMs.delete(ev.playerId);
    lastAirBuildMs.delete(ev.playerId);
    lastInteractMs.delete(ev.playerId);
    needsAnchorCapture.delete(ev.playerId);
    destroyBlockInteractHandled.delete(ev.playerId);
    prevSneakState.delete(ev.playerId);
    lastSneakPressMs.delete(ev.playerId);
    savedModeBeforeToggle.delete(ev.playerId);
    selectionFovMap.delete(ev.playerId);
    cleanupActionBar(ev.playerId);
    cleanupGuideBook(ev.playerId);
    cleanupCoach(ev.playerId);
    cleanupHoldWheel(ev.playerId);
    removePanel(ev.playerId);
});
startPreviewLoop();
startPlacementQueue();
startModifierVisualizerLoop();
startVanillaModifierHook();
startGuideBook();
startLanguagePicker();
startEntityPanels();
startCoachLoop();
startHoldWheel();
startPanelLightCleanup();
system.run(() => {
    for (const player of allPlayers()) {
        try {
            if (player.hasTag("eb:zooming")) {
                player.removeTag("eb:zooming");
                player.runCommand("camera @s clear");
            }
        } catch {}
    }
});

system.runInterval(() => {
    for (const player of allPlayers()) {
        try {
            const state = getState(player);
            const selecting = state.mode !== "disable" && state.mode !== "copy_paste" && !!state.anchor && getFovZoomEnabled(player);

            if (!selecting) {
                if (selectionFovMap.has(player.id)) {
                    selectionFovMap.delete(player.id);
                    player.runCommand("camera @s clear");
                    try { player.removeTag("eb:zooming"); } catch {}
                }
                continue;
            }

            const target = getLastPreviewTargetPos(player.id);
            if (!target) continue;
            const loc = player.location;
            const dist = Math.sqrt(
                (target.x - loc.x) ** 2 +
                (target.y - loc.y) ** 2 +
                (target.z - loc.z) ** 2
            );

            const MIN_DIST = getFovZoomStart(player), MAX_DIST = getFovZoomMax(player);
            const t = Math.max(0, Math.min(1, (dist - MIN_DIST) / (MAX_DIST - MIN_DIST)));
            const fov = Math.round(110 - t * t * (110 - 30));

            if (selectionFovMap.get(player.id) === fov) continue;
            const wasZooming = selectionFovMap.has(player.id);
            selectionFovMap.set(player.id, fov);
            if (!wasZooming) try { player.addTag("eb:zooming"); } catch {}
            player.runCommand(`camera @s fov_set ${fov} 0.15 linear`);
        } catch { }
    }
}, 2);
system.runInterval(() => {
    for (const player of allPlayers()) {
        try {
            const inv = player.getComponent("minecraft:inventory")?.container;
            if (!inv) continue;
            const slot = player.selectedSlotIndex;
            const item = inv.getItem(slot);
            if (!isBook(item)) continue;
            if (item.nameTag === BOOK_NAME && item.getLore().join("\n") === BOOK_LORE.join("\n")) continue;
            item.nameTag = BOOK_NAME;
            item.setLore(BOOK_LORE);
            inv.setItem(slot, item);
        } catch { }
    }
}, 20);
/** Players holding the Building Book: their sneaks are watched every tick, everyone else's hand every few ticks. */
const sneakBusy = new WeakSet();
system.runInterval(() => {
    const all = allPlayers();
    for (let i = 0; i < all.length; i++) {
        const player = all[i];
        if (idleSkip(player, i, sneakBusy)) continue;
        try {
            const item = heldItemCached(player, IDLE_EVERY);
            if (!isBook(item)) { sneakBusy.delete(player); prevSneakState.delete(player.id); continue; }
            sneakBusy.add(player);
            const isSneaking  = player.isSneaking;
            const wasSneaking = prevSneakState.get(player.id) ?? false;
            prevSneakState.set(player.id, isSneaking);
            if (!isSneaking || wasSneaking) continue;
            const now  = Date.now();
            const last = lastSneakPressMs.get(player.id) ?? 0;
            if (now - last <= 400) {
                lastSneakPressMs.delete(player.id);
                const state = getState(player);
                if (state.mode !== "disable") {
                    savedModeBeforeToggle.set(player.id, state.mode);
                    setMode(player, "disable");
                    player.onScreenDisplay.setActionBar(t("eb.bar.toggle_disabled"));
                    lockActionBar(player.id, 2000);
                } else {
                    const saved = savedModeBeforeToggle.get(player.id);
                    if (saved) {
                        savedModeBeforeToggle.delete(player.id);
                        setMode(player, saved);
                        const entry = MODE_LIST.find(m => m.id === saved);
                        const label = entry ? entry.label.replace(/§./g, "") : saved;
                        player.onScreenDisplay.setActionBar(t("eb.bar.toggle_restored", label));
                        lockActionBar(player.id, 2000);
                    }
                }
            } else {
                lastSneakPressMs.set(player.id, now);
            }
        } catch { }
    }
}, 1);

// /realm:prefs changes apply right away: the build speed's queue limit (otherwise set at spawn and in the book's
// settings), and the menu style's old switch (eb:customUI), which would otherwise outrank the new one.
onChange((key, player) => {
    if (!player?.isValid) return;
    if (key === "buildSpeed") setPlayerBuildSpeed(player.id, waveToQueueSpeed(getBuildSpeed(player)));
    if (key === "floatingUI") {
        try { player.setDynamicProperty("eb:customUI", undefined); } catch {}
    }
});
// Players with the old menu switch move to the new one as they join, so /realm:prefs shows what they have.
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
    if (initialSpawn) getMenuStyle(player);
});
