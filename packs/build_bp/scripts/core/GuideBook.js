// @ts-nocheck
import { world, system, Player } from "@minecraft/server";
import { heldItem, isTutorialBook } from "../utils/Items.js";
import { GUIDE_SPREADS, GUIDE_CHAPTER_SPREADS, GUIDE_LANGUAGES } from "./GuideBookData.js";
import { getBookLanguage, hasBookLanguage } from "./Settings.js";
import { hasPicker, isPickerPinned, openPicker, closePicker, removePicker, pickerClick } from "./LanguagePicker.js";
import { spotInFront, yawToward } from "../utils/InFront.js";

const GUIDE_ID      = "eb:guide_book";
const DP_SPREAD     = "eb:guideSpread";
const DISTANCE      = 1.9;
const MIN_DISTANCE  = 0.9;
const DROP          = 0.55;
const LEASH         = 4.5;
const RECALL_DOT    = 0.55;
const CHECK_TICKS   = 2;
const OPEN_CHECKS   = 3;
const CLOSE_CHECKS  = 2;
const TURN_COOLDOWN = 4;
const SHUT_TICKS    = 14;
const SWEEP_CHECKS  = 100;
const DIMENSIONS    = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

const books      = new Map();
const shutting   = new Map();
const heldChecks = new Map();
const awayChecks = new Map();
const lastTurn   = new Map();

function languageIndex(player) {
    return Math.max(0, GUIDE_LANGUAGES.findIndex(language => language.id === getBookLanguage(player)));
}

export function applyGuideBookLanguage(player) {
    const book = books.get(player.id);
    if (!isLive(book)) return;
    try { book.setProperty("eb:lang", languageIndex(player)); } catch {}
}

function savedSpread(player) {
    try {
        const v = player.getDynamicProperty(DP_SPREAD);
        if (typeof v === "number") return Math.max(0, Math.min(GUIDE_SPREADS - 1, Math.floor(v)));
    } catch {}
    return 0;
}

function spotForBook(player) {
    return spotInFront(player, DISTANCE, MIN_DISTANCE, DROP);
}

function isLive(book) {
    try { return book?.isValid === true; } catch { return false; }
}

function removeBook(book) {
    try { if (isLive(book)) book.remove(); } catch {}
}

function closeBook(player, playerId = player?.id) {
    const book = books.get(playerId);
    books.delete(playerId);
    if (!isLive(book)) return;
    try {
        book.setProperty("eb:closing", true);
        removeBook(shutting.get(playerId)?.book);
        shutting.set(playerId, { book, removeAt: system.currentTick + SHUT_TICKS });
    } catch {
        removeBook(book);
    }
    try { player?.playSound("item.book.put", { pitch: 0.8, volume: 0.6 }); } catch {}
}

function reopenShutting(player) {
    const entry = shutting.get(player.id);
    if (!entry) return false;
    shutting.delete(player.id);
    if (!isLive(entry.book) || entry.book.dimension.id !== player.dimension.id) {
        removeBook(entry.book);
        return false;
    }
    try { entry.book.setProperty("eb:closing", false); } catch { removeBook(entry.book); return false; }
    books.set(player.id, entry.book);
    return true;
}

function finishShutting() {
    const now = system.currentTick;
    for (const [playerId, entry] of shutting) {
        if (now < entry.removeAt && isLive(entry.book)) continue;
        shutting.delete(playerId);
        removeBook(entry.book);
    }
}

function openBook(player) {
    const at  = spotForBook(player);
    const yaw = yawToward(at, player.location);
    let book;
    try {
        book = player.dimension.spawnEntity(GUIDE_ID, at, { initialRotation: yaw });
    } catch {
        try { book = player.dimension.spawnEntity(GUIDE_ID, at); } catch { return; }
    }
    try { book.setProperty("eb:page", savedSpread(player)); } catch {}
    try { book.setProperty("eb:lang", languageIndex(player)); } catch {}
    try { book.setRotation({ x: 0, y: yaw }); } catch {}
    books.set(player.id, book);
    try { player.playSound("armor.equip_leather", { pitch: 1.3, volume: 0.7 }); } catch {}
}

function bringBack(player, book) {
    const at = spotForBook(player);
    try {
        book.teleport(at, { rotation: { x: 0, y: yawToward(at, player.location) } });
    } catch {}
}

function isInView(player, book) {
    const head = player.getHeadLocation();
    const view = player.getViewDirection();
    const to   = { x: book.location.x - head.x, y: book.location.y + 0.5 - head.y, z: book.location.z - head.z };
    const len  = Math.hypot(to.x, to.y, to.z);
    if (len < 0.01) return true;
    return (to.x * view.x + to.y * view.y + to.z * view.z) / len >= RECALL_DOT;
}

function chapterStep(spread, direction) {
    if (direction > 0) {
        return GUIDE_CHAPTER_SPREADS.find(s => s > spread) ?? GUIDE_SPREADS - 1;
    }
    for (let i = GUIDE_CHAPTER_SPREADS.length - 1; i >= 0; i--) {
        if (GUIDE_CHAPTER_SPREADS[i] < spread) return GUIDE_CHAPTER_SPREADS[i];
    }
    return 0;
}

function turn(player, direction) {
    const book = books.get(player.id);
    if (!isLive(book)) return;

    const now = system.currentTick;
    if (now - (lastTurn.get(player.id) ?? -100) < TURN_COOLDOWN) return;
    lastTurn.set(player.id, now);

    if (!isInView(player, book)) {
        bringBack(player, book);
        return;
    }

    let spread = 0;
    try { spread = book.getProperty("eb:page") ?? 0; } catch {}
    const next = player.isSneaking
        ? chapterStep(spread, direction)
        : Math.max(0, Math.min(GUIDE_SPREADS - 1, spread + direction));
    if (next === spread) return;

    try { book.setProperty("eb:page", next); } catch { return; }
    try { player.setDynamicProperty(DP_SPREAD, next); } catch {}
}

export function changeBookLanguage(player) {
    closeBook(player);
    openPicker(player, { pinned: true });
}

export function onTutorialBookUse(player) {
    if (hasPicker(player.id)) {
        pickerClick(player);
        return;
    }
    if (!books.has(player.id)) return;
    turn(player, 1);
}

function sweepStrays() {
    const kept = new Set();
    for (const book of books.values()) {
        if (isLive(book)) kept.add(book.id);
    }
    for (const entry of shutting.values()) {
        if (isLive(entry.book)) kept.add(entry.book.id);
    }
    for (const dimensionId of DIMENSIONS) {
        try {
            for (const book of world.getDimension(dimensionId).getEntities({ type: GUIDE_ID })) {
                if (!kept.has(book.id)) book.remove();
            }
        } catch {}
    }
}

export function cleanupGuideBook(playerId) {
    removePicker(playerId);
    removeBook(books.get(playerId));
    removeBook(shutting.get(playerId)?.book);
    books.delete(playerId);
    shutting.delete(playerId);
    heldChecks.delete(playerId);
    awayChecks.delete(playerId);
    lastTurn.delete(playerId);
}

export function startGuideBook() {
    world.beforeEvents.playerInteractWithEntity.subscribe(ev => {
        if (ev.target?.typeId !== GUIDE_ID) return;
        ev.cancel = true;
        const player = ev.player;
        system.run(() => turn(player, 1));
    });

    world.afterEvents.entityHitEntity.subscribe(ev => {
        if (ev.hitEntity?.typeId !== GUIDE_ID) return;
        if (!(ev.damagingEntity instanceof Player)) return;
        turn(ev.damagingEntity, -1);
    });

    let checks = 0;
    system.runInterval(() => {
        const online = new Set();
        for (const player of world.getAllPlayers()) {
            online.add(player.id);
            try {
                const holding = isTutorialBook(heldItem(player));
                const book    = books.get(player.id);

                if (!holding) {
                    heldChecks.delete(player.id);
                    if (!isPickerPinned(player.id)) closePicker(player.id);
                    if (!book) continue;
                    const away = (awayChecks.get(player.id) ?? 0) + 1;
                    awayChecks.set(player.id, away);
                    if (away >= CLOSE_CHECKS) {
                        awayChecks.delete(player.id);
                        closeBook(player);
                    }
                    continue;
                }
                awayChecks.delete(player.id);

                if (!isLive(book)) {
                    books.delete(player.id);
                    if (hasPicker(player.id)) continue;
                    if (reopenShutting(player)) continue;
                    const held = (heldChecks.get(player.id) ?? 0) + 1;
                    heldChecks.set(player.id, held);
                    if (held >= OPEN_CHECKS) {
                        heldChecks.delete(player.id);
                        if (hasBookLanguage(player)) openBook(player);
                        else                         openPicker(player);
                    }
                    continue;
                }

                if (book.dimension.id !== player.dimension.id) {
                    closeBook(player);
                    continue;
                }

                const loc  = player.location;
                const at   = book.location;
                const dist = Math.hypot(loc.x - at.x, loc.y - at.y, loc.z - at.z);
                if (dist > LEASH) {
                    bringBack(player, book);
                } else {
                    book.setRotation({ x: 0, y: yawToward(at, loc) });
                }
            } catch {}
        }

        for (const playerId of [...books.keys(), ...shutting.keys()]) {
            if (!online.has(playerId)) cleanupGuideBook(playerId);
        }
        finishShutting();

        if (checks++ % SWEEP_CHECKS === 0) sweepStrays();
    }, CHECK_TICKS);
}
