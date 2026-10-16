// @ts-nocheck
const counts = new Map();

export function coachEvent(player, name) {
    let mine = counts.get(player.id);
    if (!mine) counts.set(player.id, mine = {});
    mine[name] = (mine[name] ?? 0) + 1;
}

export function eventCount(playerId, name) {
    return counts.get(playerId)?.[name] ?? 0;
}

export function clearCoachEvents(playerId) {
    counts.delete(playerId);
}
