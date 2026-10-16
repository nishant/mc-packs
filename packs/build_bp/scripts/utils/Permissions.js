// @ts-nocheck
import { CommandPermissionLevel } from "@minecraft/server";

export function isOp(player) {
    try { if (player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors) return true; } catch {}
    try { if (player.isOp?.() === true) return true; } catch {}
    try { if (player.isOp === true) return true; } catch {}
    try { if (player.isOperator?.() === true) return true; } catch {}
    try { if (player.isOperator === true) return true; } catch {}
    try { return player.hasTag("eb:admin"); } catch {}
    return false;
}
