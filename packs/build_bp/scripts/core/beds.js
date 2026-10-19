// Bedrock beds are one item and two blocks. Java color ids are not Bedrock ids.
// direction: south 0, west 1, north 2, east 3. The head sits one block that way.
// Both halves share the facing. head_piece_bit tells them apart. occupied_bit stays
// false unless the caller already has it. A color property is copied only when present.

export const BED_TYPES = new Set(["minecraft:bed", "minecraft:straw_bed"]);

const CARDINAL = ["south", "west", "north", "east"];
const HEAD = [
    { x: 0, z: 1 },
    { x: -1, z: 0 },
    { x: 0, z: -1 },
    { x: 1, z: 0 },
];

export function isBedType(typeId) {
    return BED_TYPES.has(typeId);
}

export function directionFromYaw(yaw) {
    const n = ((Number(yaw) % 360) + 360) % 360;
    if (n < 45 || n >= 315) return 0;
    if (n < 135) return 1;
    if (n < 225) return 2;
    return 3;
}

export function directionFromStates(states) {
    if (!states || typeof states !== "object") return null;
    if (states.direction !== undefined && states.direction !== null && states.direction !== "") {
        const d = Number(states.direction);
        return Number.isInteger(d) && d >= 0 && d <= 3 ? d : null;
    }
    const card = states["minecraft:cardinal_direction"];
    if (typeof card !== "string") return null;
    const i = CARDINAL.indexOf(card);
    return i >= 0 ? i : null;
}

export function headOffset(direction) {
    return HEAD[direction] ?? null;
}

export function bedStates(typeId, direction, head, extra) {
    const states = {
        occupied_bit: extra?.occupied_bit === true,
        head_piece_bit: !!head,
    };
    if (typeId === "minecraft:straw_bed") states["minecraft:cardinal_direction"] = CARDINAL[direction];
    else states.direction = direction;
    if (extra && Object.prototype.hasOwnProperty.call(extra, "color")) states.color = extra.color;
    return states;
}

export function bedPartnerPos(pos, states) {
    const dir = directionFromStates(states);
    const off = dir === null ? null : headOffset(dir);
    if (!off) return null;
    const sign = states?.head_piece_bit === true ? -1 : 1;
    return { x: pos.x + off.x * sign, y: pos.y, z: pos.z + off.z * sign };
}

function keyOf(p) {
    return `${p.x},${p.y},${p.z}`;
}

/**
 * Turn bed feet into foot + head before the cap and the item count.
 * A batch that already has a head is left alone so a paste is not expanded twice.
 * If either half cannot be placed, or the halves overlap something already kept, the whole bed is dropped.
 * Heads are not a second item.
 * @param {Array<{x:number,y:number,z:number,typeId?:string,states?:object,direction?:number,_alreadyHalf?:boolean}>} entries
 * @param {(pos: {x:number,y:number,z:number}, typeId: string) => boolean} [canPlace]
 */
export function expandBeds(entries, canPlace) {
    const pasted = entries.some((e) => isBedType(e.typeId) && e.states?.head_piece_bit === true);
    const out = [];
    const reserved = new Set();
    let dropped = 0;
    let group = 0;
    for (const entry of entries) {
        const typeId = entry.typeId;
        if (!isBedType(typeId) || pasted || entry._alreadyHalf) {
            const k = keyOf(entry);
            if (reserved.has(k)) { dropped++; continue; }
            reserved.add(k);
            out.push({
                ...entry,
                _bedItems: 1,
                _bedBlocks: 1,
                _resolvedStates: isBedType(typeId) ? (entry.states ?? entry._resolvedStates) : entry._resolvedStates,
            });
            continue;
        }
        const dir = entry.direction;
        const off = Number.isInteger(dir) ? headOffset(dir) : null;
        if (!off) { dropped++; continue; }
        const head = { x: entry.x + off.x, y: entry.y, z: entry.z + off.z };
        const fk = keyOf(entry);
        const hk = keyOf(head);
        if (fk === hk || reserved.has(fk) || reserved.has(hk)) { dropped++; continue; }
        if (canPlace && (!canPlace(entry, typeId) || !canPlace(head, typeId))) { dropped++; continue; }
        reserved.add(fk);
        reserved.add(hk);
        const gid = ++group;
        out.push({
            x: entry.x, y: entry.y, z: entry.z, typeId,
            _bedGroup: gid, _bedItems: 1, _bedBlocks: 1,
            _resolvedStates: bedStates(typeId, dir, false, entry.states),
        });
        out.push({
            x: head.x, y: head.y, z: head.z, typeId,
            _bedGroup: gid, _bedHead: true, _bedItems: 0, _bedBlocks: 1,
            _resolvedStates: bedStates(typeId, dir, true, entry.states),
        });
    }
    return { positions: out, dropped };
}

/** Keep a prefix of whole beds. Both halves count toward maxBlocks. Only the foot counts toward maxItems. */
export function trimPlacement(entries, maxBlocks, maxItems) {
    const groups = new Map();
    const order = [];
    let n = 0;
    for (const entry of entries) {
        const id = entry._bedGroup ?? `s${n++}`;
        if (!groups.has(id)) { groups.set(id, []); order.push(id); }
        groups.get(id).push(entry);
    }
    const kept = [];
    let blocks = 0;
    let items = 0;
    for (const id of order) {
        const g = groups.get(id);
        const b = g.reduce((sum, e) => sum + (e._bedBlocks ?? 1), 0);
        const it = g.reduce((sum, e) => sum + (e._bedItems ?? (e._bedHead ? 0 : 1)), 0);
        if (maxBlocks !== undefined && blocks + b > maxBlocks) break;
        if (maxItems !== undefined && items + it > maxItems) break;
        blocks += b;
        items += it;
        kept.push(...g);
    }
    return { positions: kept, blocks, items };
}

export function placementItemCount(entries) {
    return entries.reduce((sum, e) => sum + (e._bedHead ? 0 : (e._bedItems ?? 1)), 0);
}
