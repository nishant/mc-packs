// Bedrock beds are one item and two blocks. Java color ids are not Bedrock ids.
// direction: south 0, west 1, north 2, east 3. The head sits one block that way.
// Both halves share the facing. head_piece_bit tells them apart. occupied_bit stays
// false unless the caller already has it. A color property is copied only when present.

/**
 * @typedef {{
 *   direction?: number | string,
 *   "minecraft:cardinal_direction"?: string,
 *   head_piece_bit?: boolean,
 *   occupied_bit?: boolean,
 *   color?: string,
 *   u?: number
 * }} BedStates
 */
/** @typedef {{x:number,y:number,z:number,typeId?:string,states?:BedStates,direction?:number,_alreadyHalf?:boolean,_bedGroup?:number,_bedHead?:boolean,_bedItems?:number,_bedBlocks?:number,_resolvedStates?:BedStates,_mx?:boolean,_my?:boolean,_mz?:boolean}} BedEntry */

export const BED_TYPES = new Set(["minecraft:bed", "minecraft:straw_bed"]);

const CARDINAL = ["south", "west", "north", "east"];
const HEAD = [
    { x: 0, z: 1 },
    { x: -1, z: 0 },
    { x: 0, z: -1 },
    { x: 1, z: 0 },
];

/** @param {string} typeId */
export function isBedType(typeId) {
    return BED_TYPES.has(typeId);
}

/** @param {number} yaw */
export function directionFromYaw(yaw) {
    const n = ((Number(yaw) % 360) + 360) % 360;
    if (n < 45 || n >= 315) return 0;
    if (n < 135) return 1;
    if (n < 225) return 2;
    return 3;
}

/** @param {BedStates | null | undefined} states */
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

/** @param {number} direction */
export function headOffset(direction) {
    return HEAD[direction] ?? null;
}

/**
 * @param {string} typeId
 * @param {number} direction
 * @param {boolean} head
 * @param {BedStates | null | undefined} extra
 */
export function bedStates(typeId, direction, head, extra) {
    /** @type {BedStates} */
    const states = {
        occupied_bit: extra?.occupied_bit === true,
        head_piece_bit: !!head,
    };
    if (typeId === "minecraft:straw_bed") states["minecraft:cardinal_direction"] = CARDINAL[direction];
    else states.direction = direction;
    if (extra && Object.prototype.hasOwnProperty.call(extra, "color")) states.color = extra.color;
    return states;
}

/**
 * @param {{x:number,y:number,z:number}} pos
 * @param {BedStates | null | undefined} states
 */
export function bedPartnerPos(pos, states) {
    const dir = directionFromStates(states);
    const off = dir === null ? null : headOffset(dir);
    if (!off) return null;
    const sign = states?.head_piece_bit === true ? -1 : 1;
    return { x: pos.x + off.x * sign, y: pos.y, z: pos.z + off.z * sign };
}

/** @param {{x:number,y:number,z:number}} p */
function keyOf(p) {
    return `${p.x},${p.y},${p.z}`;
}

/**
 * Turn bed feet into foot + head before the cap and the item count.
 * A batch that already has a head is left alone so a paste is not expanded twice.
 * If either half cannot be placed, or the halves overlap something already kept, the whole bed is dropped.
 * Heads are not a second item.
 * @param {BedEntry[]} entries
 * @param {(pos: {x:number,y:number,z:number}, typeId: string) => boolean} [canPlace]
 */
export function expandBeds(entries, canPlace) {
    const pasted = entries.some((e) => isBedType(e.typeId ?? "") && e.states?.head_piece_bit === true);
    const out = [];
    const reserved = new Set();
    let dropped = 0;
    let group = 0;
    for (const entry of entries) {
        const typeId = entry.typeId ?? "";
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
        if (typeof dir !== "number" || !Number.isInteger(dir)) { dropped++; continue; }
        const off = headOffset(dir);
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

/**
 * Keep a prefix of whole beds. Both halves count toward maxBlocks. Only the foot counts toward maxItems.
 * @param {BedEntry[]} entries
 * @param {number} [maxBlocks]
 * @param {number} [maxItems]
 */
export function trimPlacement(entries, maxBlocks, maxItems) {
    /** @type {Map<number | string, BedEntry[]>} */
    const groups = new Map();
    /** @type {Array<number | string>} */
    const order = [];
    let n = 0;
    for (const entry of entries) {
        const id = entry._bedGroup ?? `s${n++}`;
        const list = groups.get(id) ?? [];
        if (!groups.has(id)) order.push(id);
        list.push(entry);
        groups.set(id, list);
    }
    /** @type {BedEntry[]} */
    const kept = [];
    let blocks = 0;
    let items = 0;
    for (const id of order) {
        const g = groups.get(id) ?? [];
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

/** @param {BedEntry[]} entries */
export function placementItemCount(entries) {
    return entries.reduce((sum, e) => sum + (e._bedHead ? 0 : (e._bedItems ?? 1)), 0);
}

/**
 * @param {{x:number,y:number,z:number}} pos
 * @returns {string}
 */
function posKey(pos) {
    return `${pos.x},${pos.y},${pos.z}`;
}

/**
 * One bed is one item. A head half, or an explicit zero, is not charged.
 * @param {string} typeId
 * @param {BedStates | null | undefined} states
 * @param {boolean} [headFlag]
 * @returns {number}
 */
export function chargeUnits(typeId, states, headFlag) {
    if (headFlag) return 0;
    if (states && states.u === 0) return 0;
    if (isBedType(typeId) && states && states.head_piece_bit === true) return 0;
    if (!typeId || typeId === "minecraft:air" || typeId === "air") return 0;
    return 1;
}

/**
 * Expand bed feet before a claims or safe-zone filter. Other blocks pass through.
 * @param {Array<{x:number,y:number,z:number,typeId?:string,states?:BedStates,_mx?:boolean,_my?:boolean,_mz?:boolean,_resolvedStates?:BedStates}>} positions
 * @param {string} typeId
 * @param {BedStates | null | undefined} blockStates
 * @param {number} [yaw]
 */
export function expandForClaims(positions, typeId, blockStates, yaw) {
    if (!Array.isArray(positions) || !positions.length || !isBedType(typeId)) return positions ?? [];
    const dir = directionFromStates(blockStates) ?? directionFromYaw(yaw ?? 0);
    const entries = positions.map((p) => {
        const states = p.states ?? p._resolvedStates ?? blockStates ?? {};
        return {
            x: p.x, y: p.y, z: p.z,
            typeId: p.typeId && isBedType(p.typeId) ? p.typeId : typeId,
            states,
            direction: directionFromStates(states) ?? dir,
            _alreadyHalf: states.head_piece_bit === true,
            _mx: p._mx, _my: p._my, _mz: p._mz,
        };
    });
    return expandBeds(entries).positions.map((p) => ({
        x: p.x, y: p.y, z: p.z,
        typeId: p.typeId,
        states: p._resolvedStates,
        _resolvedStates: p._resolvedStates,
        _bedGroup: p._bedGroup,
        _bedHead: p._bedHead,
        _bedItems: p._bedItems,
        _bedBlocks: p._bedBlocks,
        _mx: p._mx, _my: p._my, _mz: p._mz,
    }));
}

/**
 * Drop a bed when the filter kept only one half. Other blocks stay.
 * @param {Array<{x:number,y:number,z:number,_bedGroup?: number}>} positions
 */
export function dropIncompleteBeds(positions) {
    if (!Array.isArray(positions)) return [];
    /** @type {Map<number, Array<{x:number,y:number,z:number,_bedGroup?: number}>>} */
    const groups = new Map();
    /** @type {Array<{x:number,y:number,z:number,_bedGroup?: number}>} */
    const kept = [];
    for (const pos of positions) {
        if (pos._bedGroup == null) { kept.push(pos); continue; }
        const list = groups.get(pos._bedGroup) ?? [];
        list.push(pos);
        groups.set(pos._bedGroup, list);
    }
    for (const group of groups.values()) {
        if (group.length >= 2) kept.push(...group);
    }
    return kept;
}

/**
 * Add the other half of a bed already in the world, before the destroy cap.
 * @param {Array<{x:number,y:number,z:number}>} positions
 * @param {(pos: {x:number,y:number,z:number}) => {typeId: string, states: object} | null} readBlock
 */
export function expandDestroyForClaims(positions, readBlock) {
    /** @type {Array<{x:number,y:number,z:number,_bedGroup?: number,_bedHead?: boolean,_bedItems?: number,_bedBlocks?: number,states?: object}>} */
    const out = [];
    const seen = new Set();
    let group = 0;
    for (const pos of positions ?? []) {
        const key = posKey(pos);
        if (seen.has(key)) continue;
        const info = readBlock(pos);
        if (!info || !isBedType(info.typeId)) {
            seen.add(key);
            out.push(pos);
            continue;
        }
        const partner = bedPartnerPos(pos, info.states);
        const id = ++group;
        const head = /** @type {{head_piece_bit?: boolean}} */ (info.states).head_piece_bit === true;
        seen.add(key);
        out.push({
            x: pos.x, y: pos.y, z: pos.z,
            _bedGroup: id,
            _bedHead: head,
            _bedItems: head ? 0 : 1,
            _bedBlocks: 1,
            states: info.states,
        });
        if (!partner) continue;
        const partnerKey = posKey(partner);
        if (seen.has(partnerKey)) continue;
        seen.add(partnerKey);
        out.push({
            x: partner.x, y: partner.y, z: partner.z,
            _bedGroup: id,
            _bedHead: !head,
            _bedItems: head ? 1 : 0,
            _bedBlocks: 1,
            states: { ...info.states, head_piece_bit: !head },
        });
    }
    return out;
}

/**
 * Keep both halves of a bed in the same wave tick.
 * @param {Array<{x:number,y:number,z:number,_bedGroup?: number}>} positions
 */
export function keepBedHalvesTogether(positions) {
    /** @type {Array<{x:number,y:number,z:number,_bedGroup?: number}>} */
    const out = [];
    const seen = new Set();
    for (const pos of positions ?? []) {
        const key = posKey(pos);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(pos);
        if (pos._bedGroup == null) continue;
        for (const other of positions) {
            if (other === pos || other._bedGroup !== pos._bedGroup) continue;
            const otherKey = posKey(other);
            if (seen.has(otherKey)) continue;
            seen.add(otherKey);
            out.push(other);
        }
    }
    return out;
}
