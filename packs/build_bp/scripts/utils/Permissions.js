// @ts-nocheck
import { CommandPermissionLevel } from "@minecraft/server";

export function isOp(player) {
    try { return player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors; } catch { return false; }
}
