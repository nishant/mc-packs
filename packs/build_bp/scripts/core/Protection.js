// @ts-nocheck
import { GameMode, system, world } from "@minecraft/server";
import { get } from "../settings.js";
import { allZones } from "../zones.js";
import { isOp } from "../utils/Permissions.js";
import { onScriptEvent } from "../script-events.js";

const callingBonus = new Map();
const askingClaims = new Map();
let nextAsk = 1;
let claimsAnswered = false;

export function getCallingBonus(player, key) {
    if (!player) return 0;
    return Math.max(0, Number(callingBonus.get(player.id)?.[key]) || 0);
}

export function refusal(player) {
    if (get("enabled") !== true) {
        return "Easy Building is disabled on this realm. An operator can enable it in /realm:config (Easy Building).";
    }
    if (get("operatorsOnly") === true && !isOp(player)) {
        return "Only operators can use the building tools on this realm.";
    }
    return undefined;
}

export function isBuildBlockedForPlayer(player, notify = false) {
    const why = refusal(player);
    if (why) {
        if (notify) {
            try { player.sendMessage(`§e[EB] ${why}`); } catch {}
        }
        return true;
    }
    try {
        const mode = player.getGameMode();
        if (mode === GameMode.Adventure || mode === GameMode.Spectator) {
            if (notify) player.sendMessage("§e[EB] The building tools don't work in adventure or spectator mode.");
            return true;
        }
    } catch {}
    return false;
}

export function inSafeZoneAt(dimId, x, z) {
    for (const zone of allZones()) {
        if (zone.src !== "zones" || zone.dim !== dimId) continue;
        if (zone.shape === "square") {
            if (Math.abs(x - zone.x) <= zone.r && Math.abs(z - zone.z) <= zone.r) return zone;
            continue;
        }
        const dx = x - zone.x;
        const dz = z - zone.z;
        if (dx * dx + dz * dz <= zone.r * zone.r) return zone;
    }
    return undefined;
}

export function filterSafeZonePositions(player, dimId, positions, notify = false) {
    if (!positions?.length) return positions;
    if (isOp(player) || get("safeZonesOperatorsOnly") !== true) return positions;
    let blockedZone = undefined;
    const allowed = positions.filter(p => {
        const pos = p.pos ?? p;
        const z = inSafeZoneAt(dimId, pos.x, pos.z);
        if (z) {
            blockedZone = z;
            return false;
        }
        return true;
    });
    if (blockedZone && allowed.length === 0 && notify) {
        try {
            player.sendMessage(`§c[EB] You cannot build or destroy inside safe zone "${blockedZone.name}".`);
        } catch {}
    }
    return allowed;
}

export function queryClaimsInBox(player, dimId, minX, minZ, maxX, maxZ) {
    if (isOp(player) || get("inOthersClaims") === true) return Promise.resolve([]);
    const id = `eb${nextAsk++}`;
    return new Promise(resolve => {
        askingClaims.set(id, resolve);
        try {
            system.sendScriptEvent(
                "realm:claims_check",
                JSON.stringify({ id, player: player.id, dim: dimId, x1: minX, z1: minZ, x2: maxX, z2: maxZ })
            );
        } catch {
            askingClaims.delete(id);
            resolve([]);
            return;
        }
        system.runTimeout(() => {
            if (!askingClaims.has(id)) return;
            askingClaims.delete(id);
            resolve([]);
        }, claimsAnswered ? 20 : 3);
    });
}

export async function filterAllowedPositionsAsync(player, dimId, positions, notify = true) {
    if (!positions?.length) return [];
    if (isBuildBlockedForPlayer(player, notify)) return [];
    let filtered = filterSafeZonePositions(player, dimId, positions, notify);
    if (!filtered.length) return [];
    if (isOp(player) || get("inOthersClaims") === true) return filtered;

    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const item of filtered) {
        const p = item.pos ?? item;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    const claims = await queryClaimsInBox(player, dimId, minX, minZ, maxX, maxZ);
    if (!claims?.length) return filtered;

    const afterClaims = filtered.filter(item => {
        const p = item.pos ?? item;
        return !claims.some(c => p.x >= c.x1 && p.x <= c.x2 && p.z >= c.z1 && p.z <= c.z2);
    });
    if (afterClaims.length === 0 && notify) {
        const owners = [...new Set(claims.map(c => c.n))].join(", ");
        try {
            player.sendMessage(`§c[EB] That area is claimed by ${owners}.`);
        } catch {}
    }
    return afterClaims;
}

try {
    onScriptEvent(
        ["realm:calling", "realm:claims_check_result"],
        ({ id, message }) => {
            if (id === "realm:calling") {
                try {
                    const m = JSON.parse(message);
                    if (m && typeof m.player === "string" && m.bonus && typeof m.bonus === "object") {
                        callingBonus.set(m.player, m.bonus);
                    }
                } catch {}
                return;
            }
            if (id === "realm:claims_check_result") {
                try {
                    const msg = JSON.parse(message);
                    claimsAnswered = true;
                    const done = askingClaims.get(String(msg?.id));
                    if (!done) return;
                    askingClaims.delete(String(msg.id));
                    done(
                        Array.isArray(msg.claims)
                            ? msg.claims.map(c => ({
                                  n: String(c?.n ?? "someone"),
                                  x1: Number(c?.x1),
                                  z1: Number(c?.z1),
                                  x2: Number(c?.x2),
                                  z2: Number(c?.z2),
                              }))
                            : []
                    );
                } catch {}
            }
        },
    );
    world.afterEvents.worldLoad.subscribe(() => {
        system.runTimeout(() => {
            try {
                system.sendScriptEvent("realm:calling_ping", "{}");
                system.sendScriptEvent(
                    "realm:claims_check",
                    JSON.stringify({ id: "hello", player: "", dim: "minecraft:overworld", x1: 0, z1: 0, x2: 0, z2: 0 })
                );
            } catch {}
        }, 60);
    });
    world.afterEvents.playerLeave.subscribe(({ playerId }) => callingBonus.delete(playerId));
} catch {}
