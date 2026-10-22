// Generated from tools/side-shared.js by node tools/sync-side.mjs: edit that file, not this copy.
// The side boxes protocol: up to nine short readouts on screen at once, drawn by Side HUD (hud_rp).
// Packs never import each other, so every pack that shows a readout keeps a copy of this file as
// scripts/side.js (node tools/sync-side.mjs keeps the copies the same).
//
// Slots: Right 1-4 and Left 1-4 (top to bottom), and Middle (just under the crosshair), which players pick for
// a pack's readout; then two that only the minimap (map_bp) writes: Top (the compass strip at the top center)
// and Radar (above the left boxes); then Quest, the story tracker's big box (saga_bp), which shows at whichever of
// the nine places its text starts with: questCode(slot), so it can sit next to that place's own small box. The
// only text the server can send the HUD besides the action bar is the title and the subtitle, so every slot
// travels in one subtitle:
//
//   title    = MARK                                     ("§s§2§r": color codes only, invisible on its own)
//   subtitle = nine ASCII radar-visibility bytes + seg(right1) + ... + seg(quest)     (in ALL_SLOTS order: 12 segments, 5425 bytes)
//   seg      = sep (1 byte: " " or "\n") + text + "~" * (0..2) + "§r" * n    exactly SEG_BYTES UTF-8 bytes
//   empty    = " " + "§r" * 53
//
// hud_rp cuts slot k out with string expressions: ('%.159s' * (sub - ('%.<9 + 160k + 1>s' * sub))), which
// counts UTF-8 bytes; then removes the "~" filler. "§r" filler is invisible. Without hud_rp the vanilla
// subtitle shows every slot, one per line, in the middle of the screen: still readable.
//
// Every pack keeps the same picture of each player's slots. A pack that changes its slot sends
//   realm:side {player, from, slot, text, ticks, tick}      (text "" = its readout ended)
// and redraws the whole title; the others update their picture and redraw only when they drew in the
// last 2 ticks or later (so a write that crossed theirs isn't lost). When a readout runs out, the pack that
// wrote it redraws (or clears the title with "§s§0§r" when nothing is left). A pack holds one slot per
// player: writing another slot moves its readout there. A pack that shows two readouts at once (the minimap's
// compass and radar) writes the second as a part: `from` is then "<pack>/<part>", which holds a slot of its own.
//
// Real titles (a card name, FIGHT!, a level-up) share the channel, so the title protocol keeps them readable:
//   realm:title {player, ticks, from}     sent right before any other title or subtitle
// ("my title is on this player's screen for ticks", at most MAX_HOLD; ticks 0 ends the sender's hold early).
// While a hold lasts every copy keeps its picture but doesn't draw; when the last hold ends, each pack with a
// readout for that player draws the title again, so the boxes come back.
//
// The compositor claim: the minimap redraws a player's title many times a second and its radar is 1.3 KB, so
// broadcasting its parts would wake every pack's listener on every draw. A pack made with sideBoxes(from,
// { compositor: true }) (only map_bp) never sends its own readouts. Instead it claims the players it draws for:
//   realm:side_comp {from, ticks, players: [ids], part, parts}   ticks 0 = the claim ends; renewed every CLAIM_EVERY
// While a live claim from another pack covers a player, a copy still sends its own small slot changes
// (realm:side as above) but doesn't draw that player's title: the compositor, which keeps every pack's slots in
// its picture, draws them with its own. When the compositor has nothing left to show, it draws once and ends the
// claim; if a claim runs out without being renewed (CLAIM_TICKS), the packs with a readout draw again. So every
// pack still works alone, and the others only pay for their own changes, not for the minimap's.
// Another pack's message is kept as it came and read (JSON.parse) only when this copy draws that player.
import { Player, system, world } from "@minecraft/server";
import { onScriptEvent } from "./script-events.js";

export const MARK = "§s§2§r";
const CLEAR = "§s§0§r";
/** The slots players pick from, in subtitle order. */
export const SLOTS = ["right1", "right2", "right3", "right4", "left1", "left2", "left3", "left4", "middle"];
/** Every slot in subtitle order: the nine, the minimap's compass strip and radar, then the story's quest box. Must match hud_rp/ui/hud_screen.json. */
export const ALL_SLOTS = [...SLOTS, "top", "radar", "quest"];
/** How each of SLOTS reads in menus. */
export const SLOT_NAMES = ["Right 1 (top)", "Right 2", "Right 3", "Right 4 (bottom)", "Left 1 (top)", "Left 2", "Left 3", "Left 4 (bottom)", "Middle of the screen"];
const SEG_BYTES = 160;
/** Bytes of readout text a slot holds (the separator takes one). */
export const TEXT_BYTES = SEG_BYTES - 1;
// Dense33 grid3299 UTF8 bytes plus self glyph3 and ASCII visibility1.
const RADAR_SEG_BYTES = 3304;
export const RADAR_TEXT_BYTES = RADAR_SEG_BYTES - 1;
const QUEST_SEG_BYTES = 512;
/** Bytes of text the quest box holds, its questCode included. */
export const QUEST_TEXT_BYTES = QUEST_SEG_BYTES - 1;
/** Segment bytes of a slot. @param {string} slot */
const segBytesOf = (slot) => (slot === "radar" ? RADAR_SEG_BYTES : slot === "quest" ? QUEST_SEG_BYTES : SEG_BYTES);
/**
 * What the quest box's text starts with to show at one of the nine places ("§s§q§1" for Right 1 ... "§s§q§9" for
 * Middle): color codes only, invisible. @param {string} slot one of SLOTS
 */
export const questCode = (slot) => `§s§q§${SLOTS.indexOf(slot) + 1}`;
const MAX_TICKS = 1200;
/** Longest real title a hold covers (a story scene line can stay 20 seconds). */
const MAX_HOLD = 600;
const SWEEP_TICKS = 4;
/** A title drawn this close before another pack's write may have crossed it on the way. */
const CROSS_TICKS = 2;
/** A compositor claim lasts this long unless renewed (ticks); the compositor renews its claims every CLAIM_EVERY. */
const CLAIM_TICKS = 100;
const CLAIM_EVERY = 40;
/** Player ids per realm:side_comp message (an id is about 20 characters: well under 2048 in all). */
const CLAIM_IDS = 60;

/** A slot players may pick. @param {unknown} where @returns {where is string} */
export const isSlot = (where) => typeof where === "string" && SLOTS.includes(where);
/** Any slot in the subtitle. @param {unknown} where @returns {where is string} */
const isAnySlot = (where) => typeof where === "string" && ALL_SLOTS.includes(where);

/** UTF-8 bytes of one code point. @param {string} ch */
const bytesOf = (ch) => {
  const c = /** @type {number} */ (ch.codePointAt(0));
  return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
};

const ASCII = /[\x00-\x7f]+/g;
const TWO_BYTES = /[\x80-\u07ff]+/g;
const NOT_SURROGATE = /[^\ud800-\udfff]+/g;
// Serialization needs exact three-byte BMP cells, not ownership of a font's private-use characters.
// Exclude all one/two-byte units and both surrogate ranges; LF is allowed only at exact row boundaries.
const RASTER_21 = /^(?:[^\x00-\u07ff\ud800-\udfff]{21}\n){20}[^\x00-\u07ff\ud800-\udfff]{21}(?![\s\S])/;
const RASTER_33 = /^(?:[^\x00-\u07ff\ud800-\udfff]{33}\n){32}[^\x00-\u07ff\ud800-\udfff]{33}(?![\s\S])/;
// The radar as sent: the same grid, then one three-byte BMP self-arrow glyph and an ASCII "1"/"0" north-badge flag (1123 units, 3303 bytes).
const RASTER_33_META = /^(?:[^\x00-\u07ff\ud800-\udfff]{33}\n){32}[^\x00-\u07ff\ud800-\udfff]{33}[^\x00-\u07ff\ud800-\udfff][01](?![\s\S])/;
/** Known UTF-8 bytes for an exact 21x21 or 33x33 three-byte BMP grid, or the 33x33 grid with its glyph and "1" (including our generated glyphs). @param {string} text */
function rasterBytesOf(text) {
  if (text.length === 461 && RASTER_21.test(text)) return 21 * 21 * 3 + 20;
  if (text.length === 1121 && RASTER_33.test(text)) return 33 * 33 * 3 + 32;
  if (text.length === 1123 && RASTER_33_META.test(text)) return 33 * 33 * 3 + 32 + 3 + 1;
  return undefined;
}
/**
 * UTF-8 bytes of a string. It runs on every readout drawn (the minimap's radar is ~480 characters), so it counts
 * with native regex passes, about ten times faster than a loop here: every unit is 1 byte, plus 1 from U+0080,
 * plus 1 more from U+0800; a surrogate pair (2 + 2 units) is 4 bytes, so each surrogate gives one back.
 * @param {string} s
 */
export function byteLength(s) {
  const wide = s.replace(ASCII, "");
  if (!wide) return s.length;
  const wider = wide.replace(TWO_BYTES, "");
  return s.length + wide.length + wider.length - (wider ? wider.replace(NOT_SURROGATE, "").length : 0);
}

/**
 * Readout text as it can travel: no "~" (the filler), no MARK, no carriage returns, at most maxBytes bytes
 * cut on a whole character, and no "§" left dangling at the end.
 * @param {string} text @param {number} [maxBytes]
 */
export function clean(text, maxBytes = TEXT_BYTES) {
  const raw = String(text);
  const rasterBytes = rasterBytesOf(raw);
  if (rasterBytes !== undefined && rasterBytes <= maxBytes) return raw;
  if (raw.length * 3 <= maxBytes && !raw.includes("~") && !raw.includes("\r") && !raw.includes("§")) return raw;
  let s = raw.includes(MARK) ? raw.split(MARK).join("") : raw;
  if (s.includes("~") || s.includes("\r")) s = s.replace(/[~\r]/g, "");
  // Most readouts (the minimap's radar is ~1.3 KB of glyphs and § codes) already fit: one counting pass, no copy.
  if (s.length * 3 <= maxBytes || byteLength(s) <= maxBytes) {
    while (s.endsWith("§")) s = s.slice(0, -1);
    return s;
  }
  let out = "";
  let n = 0;
  for (const ch of s) {
    const b = bytesOf(ch);
    if (n + b > maxBytes) break;
    out += ch;
    n += b;
  }
  while (out.endsWith("§")) out = out.slice(0, -1);
  return out;
}

const PAD_R = "§r".repeat(1102);

/** One slot's segment, exactly segBytes bytes. @param {string} text cleaned @param {string} sep " " or "\n" @param {number} [segBytes] */
export function segment(text, sep, segBytes = SEG_BYTES) {
  const maxText = segBytes - 1;
  const free = maxText - byteLength(text);
  const tilde = free % 3 === 0 ? "" : free % 3 === 1 ? "~" : "~~";
  return sep + text + tilde + PAD_R.slice(0, Math.floor(free / 3) * 2);
}

const EMPTY_SEG = segment("", " ", SEG_BYTES);
const EMPTY_RADAR_SEG = segment("", " ", RADAR_SEG_BYTES);
const EMPTY_QUEST_SEG = segment("", " ", QUEST_SEG_BYTES);

/** The subtitle for a set of slot texts. @param {Record<string, string>} texts slot -> cleaned text */
export function compose(texts) {
  let out = texts.radar ? "R00000000" : "N00000000";
  let first = true;
  for (const slot of ALL_SLOTS) {
    const text = texts[slot] ?? "";
    const segBytes = segBytesOf(slot);
    if (!text) out += slot === "radar" ? EMPTY_RADAR_SEG : slot === "quest" ? EMPTY_QUEST_SEG : EMPTY_SEG;
    else {
      out += segment(text, first ? " " : "\n", segBytes);
      first = false;
    }
  }
  return out;
}

/**
 * What shows in one slot. `src`: the text as it was written or arrived (to tell a resend from a change); `text`: the
 * same, cleaned once this copy draws it (`raw` until then); `body`: its segment without the separator, made once.
 * @typedef {{ from: string, text: string, src: string, until: number, raw?: boolean, body?: string }} Entry
 */
/** player id -> slot -> what shows there. @type {Map<string, Map<string, Entry>>} */
const picture = new Map();
/** player id -> pack -> its last realm:side message, not read yet, and the tick it came. @type {Map<string, Map<string, { msg: string, at: number }>>} */
const inbox = new Map();
/** player id -> a number that changes whenever a slot's text or place changes (the compositor's cache key). @type {Map<string, number>} */
const versions = new Map();
/** player id -> the subtitle this copy last made and the picture's version then. @type {Map<string, { ver: number, sub: string }>} */
const composed = new Map();
/** player id -> tick this pack last drew the title. @type {Map<string, number>} */
const drewAt = new Map();
/** player id -> whether the last title this pack drew had something in it. @type {Map<string, boolean>} */
const drewSome = new Map();
/** Local only: prepared owner frame, bound only by a subsequent owner show/keep. */
/** @type {Map<string,{tag:string,version:number,bound?:number,until:number}>} */
const stagedDelivery = new Map();
/** Last server-accepted owned draw, not proof of client rendering. @type {Map<string,{tag:string,tick:number}>} */
const delivered = new Map();
/** @param {string} id */
function forgetDelivery(id) { stagedDelivery.delete(id); delivered.delete(id); }
/** @param {string} id */
function touchDelivery(id) { const s = stagedDelivery.get(id); if (s) { s.version++; s.bound = undefined; } }
/** @param {string} id @param {number} now */
function hasLiveOwn(id, now) { for (const e of picture.get(id)?.values() ?? []) if (mine(e.from) && e.until > now) return true; return false; }
/** Caller has explicitly supplied/reconfirmed the owned body for this token. @param {string} id */
function bindDelivery(id) {
  const s = stagedDelivery.get(id);
  if (!s) return;
  let until = system.currentTick;
  for (const e of picture.get(id)?.values() ?? []) if (mine(e.from) && e.until > until) until = e.until;
  if (until <= system.currentTick) { forgetDelivery(id); return; }
  s.bound = s.version; s.until = until;
}
let me = "";
let compositor = false;
/** Players whose title this pack (a compositor) draws for everyone. @type {Set<string>} */
const composing = new Set();
let claimsSentAt = -Infinity;
/** player id -> another pack -> tick its compositor claim runs out. @type {Map<string, Map<string, number>>} */
const claims = new Map();
/** Is this readout this pack's (itself or one of its parts)? @param {string} from */
const mine = (from) => !!me && (from === me || from.startsWith(`${me}/`));
/** player id -> pack -> tick its real title ends (the title protocol). @type {Map<string, Map<string, number>>} */
const holds = new Map();

/** @param {string} playerId @param {string} from @param {number} ticks */
function hold(playerId, from, ticks) {
  let byPack = holds.get(playerId);
  if (!byPack) holds.set(playerId, (byPack = new Map()));
  if (ticks > 0) byPack.set(from, system.currentTick + Math.min(ticks, MAX_HOLD));
  // Ended early: let it run out now, so the sweep draws the boxes again.
  else if (byPack.has(from)) byPack.set(from, system.currentTick);
  if (!byPack.size) holds.delete(playerId);
  // The real title replaced whatever we drew.
  drewSome.set(playerId, false);
  composed.delete(playerId);
}

/** Is a real title on this player's screen? @param {string} playerId @param {number} now */
function held(playerId, now) {
  const byPack = holds.get(playerId);
  if (!byPack) return false;
  for (const until of byPack.values()) if (until > now) return true;
  return false;
}

/**
 * Does this copy draw the player's title? Not while another pack's live compositor claim covers them, unless this
 * pack composes them too and its name comes first (only one pack composes).
 * @param {string} playerId @param {number} now
 */
function drawsFor(playerId, now) {
  const by = claims.get(playerId);
  if (!by) return true;
  const ours = compositor && composing.has(playerId);
  for (const [from, until] of by) if (until > now && !(ours && me < from)) return false;
  return true;
}

/** Does this pack have a readout of its own for the player? @param {string} playerId */
function hasOwn(playerId) {
  const slots = picture.get(playerId);
  if (!slots) return false;
  for (const e of slots.values()) if (mine(e.from)) return true;
  return false;
}

/** realm:side_comp for these players (in parts of CLAIM_IDS). @param {string[]} ids @param {number} ticks 0 = the claims end */
function sendClaims(ids, ticks) {
  const parts = Math.ceil(ids.length / CLAIM_IDS);
  for (let i = 0; i < parts; i++) {
    system.sendScriptEvent("realm:side_comp", JSON.stringify({ from: me, ticks, part: i + 1, parts, players: ids.slice(i * CLAIM_IDS, (i + 1) * CLAIM_IDS) }));
  }
}

/** A compositor starts drawing a player's title. @param {string} playerId */
function claim(playerId) {
  if (composing.has(playerId)) return;
  composing.add(playerId);
  sendClaims([playerId], CLAIM_TICKS);
}

/** A compositor with nothing of its own left for a player gives their title back. @param {string} playerId */
function release(playerId) {
  if (!compositor || !composing.has(playerId) || hasOwn(playerId)) return;
  composing.delete(playerId);
  sendClaims([playerId], 0);
}

/** Does this compositor's own readout stay off realm:side for the player (it draws their title itself)? @param {string} playerId */
function local(playerId) {
  if (!compositor) return false;
  claim(playerId);
  return drawsFor(playerId, system.currentTick);
}

/**
 * The title protocol: call right before showing a real title (setTitle with text, updateSubtitle). Every pack's
 * side boxes wait until it is over, then draw again.
 * @param {Player} player @param {number} ticks fadeIn + stay + fadeOut of the title (0 = it's gone now)
 */
export function holdTitle(player, ticks) {
  const t = Math.min(Math.max(Math.round(Number(ticks) || 0), 0), MAX_HOLD);
  hold(player.id, me || "?", t);
  system.sendScriptEvent("realm:title", JSON.stringify({ player: player.id, ticks: t, from: me || "?" }));
}

/**
 * Puts a readout in the picture (or takes `from`'s out, with text ""). A resend of the same text in the same slot
 * only moves its end. @returns {boolean} whether what shows changed
 * @param {string} playerId @param {string} from @param {string} slot @param {string} text @param {number} until @param {boolean} [raw] not cleaned yet
 */
function apply(playerId, from, slot, text, until, raw = false) {
  let slots = picture.get(playerId);
  if (!slots) picture.set(playerId, (slots = new Map()));
  const keep = !!text && isAnySlot(slot);
  const same = keep ? slots.get(slot) : undefined;
  if (same && same.from === from && same.src === text) {
    same.until = until;
    return false;
  }
  let changed = false;
  let ownerChanged = !!(keep && slots.get(slot) && mine(/** @type {Entry} */ (slots.get(slot)).from));
  for (const [s, e] of slots) {
    if (e.from !== from) continue;
    if (mine(e.from)) ownerChanged = true;
    slots.delete(s);
    changed = true;
  }
  if (keep) {
    if (mine(from)) ownerChanged = true;
    slots.set(slot, raw ? { from, text, src: text, until, raw } : { from, text, src: text, until });
    changed = true;
  }
  if (!slots.size) picture.delete(playerId);
  if (changed) versions.set(playerId, (versions.get(playerId) ?? 0) + 1);
  if (ownerChanged) { touchDelivery(playerId); if (!hasLiveOwn(playerId, system.currentTick)) forgetDelivery(playerId); }
  return changed;
}

/** One realm:side message into the picture. @param {string} playerId @param {any} m @param {number} at the tick it came @returns {boolean} whether what shows changed */
function applyMessage(playerId, m, at) {
  if (!m || typeof m.from !== "string" || mine(m.from) || typeof m.slot !== "string") return false;
  const ticks = Math.min(Math.max(Number(m.ticks) || 0, 0), MAX_TICKS);
  return apply(playerId, m.from, m.slot, typeof m.text === "string" ? m.text : "", at + ticks, true);
}

/** Reads the messages kept for a player (only when this copy needs their picture). @param {string} playerId */
function materialize(playerId) {
  const box = inbox.get(playerId);
  if (!box) return;
  inbox.delete(playerId);
  for (const { msg, at } of box.values()) {
    try {
      applyMessage(playerId, JSON.parse(msg), at);
    } catch {
      // not ours
    }
  }
}

/** An entry's text, cleaned the first time this copy needs it. @param {string} slot @param {Entry} e */
function textOf(slot, e) {
  if (e.raw) {
    e.text = clean(e.text, segBytesOf(slot) - 1);
    e.raw = false;
  }
  return e.text;
}

/** The subtitle for a player's picture, each slot's segment made once per text. @param {Map<string, Entry>} slots */
function composeSlots(slots) {
  const radarEntry = slots.get("radar");
  let out = radarEntry && textOf("radar", radarEntry) ? "R00000000" : "N00000000";
  let first = true;
  for (const slot of ALL_SLOTS) {
    const e = slots.get(slot);
    const text = e ? textOf(slot, e) : "";
    if (!e || !text) out += slot === "radar" ? EMPTY_RADAR_SEG : slot === "quest" ? EMPTY_QUEST_SEG : EMPTY_SEG;
    else {
      if (e.body === undefined) e.body = segment(text, "", segBytesOf(slot));
      out += (first ? " " : "\n") + e.body;
      first = false;
    }
  }
  return out;
}

/**
 * Drops readouts that ran out (of the messages read so far). @param {string} playerId @param {number} now
 * @returns {number} 0: none ran out; 1: another pack's did; 3: one of ours did
 */
function prune(playerId, now) {
  const slots = picture.get(playerId);
  if (!slots) return 0;
  let out = 0;
  for (const [s, e] of slots) {
    if (e.until > now) continue;
    slots.delete(s);
    out |= mine(e.from) ? 3 : 1;
  }
  if (!slots.size) picture.delete(playerId);
  if (out) versions.set(playerId, (versions.get(playerId) ?? 0) + 1);
  if (out & 2) forgetDelivery(playerId);
  return out;
}

/** Writes the whole title for a player from this pack's picture. @param {Player} player */
function draw(player) {
  const now = system.currentTick;
  const id = player.id;
  // Another pack composes this player's title (and has our readouts): it draws them.
  if (!drawsFor(id, now)) {if(deliveryTrace.has(id))traceDelivery(id,"claimed");return;}
  materialize(id);
  prune(id, now);
  // A real title is showing: keep the picture, draw once the hold ends (the sweep below).
  const wait = held(id, now);
  const slots = picture.get(id);
  try {
    if (wait) {if(deliveryTrace.has(id))traceDelivery(id,"held",{until:wait});return;}
    drewAt.set(id, now);
    if (!slots) {
      if (drewSome.get(id)) player.onScreenDisplay.setTitle(CLEAR, { subtitle: " ", fadeInDuration: 0, stayDuration: 1, fadeOutDuration: 0 });
      drewSome.set(id, false);
      composed.delete(id);
      return;
    }
    let last = now;
    for (const e of slots.values()) if (e.until > last) last = e.until;
    const ver = versions.get(id) ?? 0;
    let made = composed.get(id);
    if (!made || made.ver !== ver) {
      made = { ver, sub: composeSlots(slots) };
      composed.set(id, made);
    }
    // Capture only AFTER constructing the actual payload; never read a newer staged tag after setTitle.
    const delivery = stagedDelivery.get(id);
    const version = delivery?.version;
    const tag = delivery && delivery.bound === version && delivery.until > now && hasLiveOwn(id, now) ? delivery.tag : undefined;
    if(deliveryTrace.has(id))traceDelivery(id,"native_attempt",{tag:tag??"",version:ver});
    player.onScreenDisplay.setTitle(MARK, { subtitle: made.sub, fadeInDuration: 0, stayDuration: last - now + 2, fadeOutDuration: 0 });
    if(deliveryTrace.has(id))traceDelivery(id,"native_return",{tag:tag??"",version:ver});
    if (delivery && tag !== undefined && stagedDelivery.get(id) === delivery && delivery.version === version && delivery.bound === version && hasLiveOwn(id, now) && drawsFor(id, now)) {delivered.set(id, { tag, tick: now });if(deliveryTrace.has(id))traceDelivery(id,"receipt_accept",{tag});}
    else if(deliveryTrace.has(id))traceDelivery(id,"receipt_reject",{tag:delivery?.tag??"",reasonCode:!delivery?"unstaged":tag===undefined?(delivery.bound!==version?"unbound_before_submit":delivery.until<=now?"expired_before_submit":"no_live_own_before_submit"):stagedDelivery.get(id)!==delivery?"stage_changed":delivery.version!==version?"version_changed":delivery.bound!==version?"binding_changed":!hasLiveOwn(id,now)?"no_live_own":"not_owner"});
    drewSome.set(id, true);
  } catch (error) {
    if(deliveryTrace.has(id))traceDelivery(id,"native_throw",{errorName:error instanceof Error?error.name:"unknown_error"});
    // left meanwhile
  } finally {
    // A compositor with nothing of its own left gives the title back (after drawing the others' readouts).
    release(id);
  }
}

/** @param {string} playerId */
const playerById = (playerId) => world.getAllPlayers().find((p) => p.id === playerId);

/**
 * The side boxes for one pack.
 * @param {string} from this pack's name in realm:side (its dynamic property prefix)
 * @param {{ compositor?: boolean }} [options] compositor: this pack redraws often and big (the minimap): it draws the
 *   titles of the players it shows something to with every pack's slots and never sends its own (see the top)
 */
/** RD_DIAG optional local observer; no event/wire or title behavior changes. @type {Map<string,(e:any)=>void>} */
const deliveryTrace = new Map();
/** @param {string} id @param {string} reason @param {any} [data] */
function traceDelivery(id,reason,data={}) { const listener=deliveryTrace.get(id);if(listener)listener({tick:system.currentTick,reason,...data}); }
/** @param {string} from @param {{compositor?:boolean}} [options] */
export function sideBoxes(from, options = {}) {
  me = from;
  compositor = options.compositor === true;
  return {
    /** RD_DIAG local-only observer. @param {Player} player @param {((e:any)=>void)|undefined} listener */
    traceDelivery(player,listener){if(listener)deliveryTrace.set(player.id,listener);else deliveryTrace.delete(player.id);},
    /** Local frame token, no wire/IO. Bind it with following show/keep; redraw alone cannot relabel old parts. @param {Player} player @param {string} tag */
    stage(player, tag) {
      if (typeof tag !== "string" || tag.length < 1 || tag.length > 256 || !/^[\x20-\x7e]+$/.test(tag)) { forgetDelivery(player.id); return false; }
      stagedDelivery.set(player.id, { tag, version: 0, until: system.currentTick + MAX_TICKS });
      return true;
    },
    /** Copy of last successful owned setTitle receipt; caller must match its unique frame token. @param {Player} player */
    delivery(player) {
      if (!hasLiveOwn(player.id, system.currentTick)) { forgetDelivery(player.id); return undefined; }
      const receipt = delivered.get(player.id);
      return receipt ? { tag: receipt.tag, tick: receipt.tick } : undefined;
    },
    /**
     * Shows `text` in `slot` for `ticks`; write again to keep it. Plain text with § codes, "\n" for a second line.
     * @param {Player} player @param {string} slot one of ALL_SLOTS @param {string} text @param {number} ticks
     * @param {string} [part] a second readout of this pack (it holds its own slot) @param {boolean} [now] false: don't draw yet (call redraw)
     */
    show(player, slot, text, ticks, part = "", now = true) {
      if (!isAnySlot(slot)) return;
      const from = part ? `${me}/${part}` : me;
      const t = clean(text, segBytesOf(slot) - 1);
      const span = Math.min(Math.max(Math.round(ticks), 1), MAX_TICKS);
      const tick = system.currentTick;
      // The messages kept unread came before this: read first, so an older one can't take the slot from it.
      materialize(player.id);
      apply(player.id, from, slot, t, tick + span);
      bindDelivery(player.id);
      if (!local(player.id)) system.sendScriptEvent("realm:side", JSON.stringify({ player: player.id, from, slot, text: t, ticks: span, tick }));
      if (now) draw(player);
    },
    /** Takes this pack's readout (or one part's) off the player's screen. @param {Player} player @param {string} [part] @param {boolean} [now] false: don't draw yet */
    clear(player, part = "", now = true) {
      forgetDelivery(player.id);
      const from = part ? `${me}/${part}` : me;
      materialize(player.id);
      const had = [...(picture.get(player.id)?.values() ?? [])].some((e) => e.from === from);
      if (!had) return;
      apply(player.id, from, "", "", 0);
      if (!(compositor && composing.has(player.id) && drawsFor(player.id, system.currentTick))) {
        system.sendScriptEvent("realm:side", JSON.stringify({ player: player.id, from, slot: "", text: "", ticks: 0, tick: system.currentTick }));
      }
      if (now) draw(player);
    },
    /**
     * Keeps this pack's readouts up `ticks` longer without changing them, and draws. A compositor sends nothing and
     * reuses the subtitle it made (nothing changed); another pack sends its readout again.
     * `parts`: the parts ("" for the readout itself) that must all still be up; if one ran out, nothing is kept and
     * the caller shows them again (keeping only the rest would leave the missing one off for good).
     * @param {Player} player @param {number} ticks @param {string[]} [parts]
     * @returns {boolean} false: none of this pack's readouts is up, or one of `parts` isn't (show them)
     */
    keep(player, ticks, parts) {
      const tick = system.currentTick;
      materialize(player.id);
      prune(player.id, tick);
      const slots = picture.get(player.id);
      if (!slots || !hasOwn(player.id)) return false;
      if (parts) {
        const up = new Set();
        for (const e of slots.values()) if (mine(e.from)) up.add(e.from);
        for (const part of parts) if (!up.has(part ? `${me}/${part}` : me)) return false;
      }
      const span = Math.min(Math.max(Math.round(ticks), 1), MAX_TICKS);
      const quiet = compositor && composing.has(player.id) && drawsFor(player.id, tick);
      for (const [slot, e] of slots) {
        if (!mine(e.from)) continue;
        e.until = tick + span;
        if (!quiet) system.sendScriptEvent("realm:side", JSON.stringify({ player: player.id, from: e.from, slot, text: e.text, ticks: span, tick }));
      }
      bindDelivery(player.id);
      draw(player);
      return true;
    },
    /** Draws the title now, after show or clear with `now` false. @param {Player} player */
    redraw(player) {
      draw(player);
    },
    /** Is another pack's readout in this slot for the player right now? @param {Player} player @param {string} slot */
    taken(player, slot) {
      materialize(player.id);
      const e = picture.get(player.id)?.get(slot);
      return !!e && !mine(e.from) && e.until > system.currentTick;
    },
    /** Is a real title holding the player's boxes back (the title protocol)? @param {Player} player */
    held(player) {
      return held(player.id, system.currentTick);
    },
    /** What this pack's copy would put in the subtitle now (for tests). @param {Player} player */
    payload(player) {
      materialize(player.id);
      prune(player.id, system.currentTick);
      const slots = picture.get(player.id);
      return slots ? composeSlots(slots) : compose({});
    },
  };
}

/** The string value of `"key":"` in a JSON message, read without parsing; undefined when it isn't plain. @param {string} message @param {string} key */
function field(message, key) {
  const f = message.indexOf(key);
  if (f < 0) return undefined;
  const start = f + key.length;
  const end = message.indexOf('"', start);
  if (end < 0) return undefined;
  const v = message.slice(start, end);
  return v.includes("\\") ? undefined : v;
}

// Every pack with side boxes hears every readout: only the player and the sender are looked at before parsing (a
// JSON string value can't hold `"from":"` unescaped, so the first one is the key), and another pack's message is
// kept as it came, read only when this copy draws that player (most never do: the minimap draws theirs).
onScriptEvent(
  ["realm:side", "realm:title", "realm:side_comp"],
  ({ id, message }) => {
    if (id !== "realm:side" && id !== "realm:title" && id !== "realm:side_comp") return;
    if (id === "realm:title") {
      if (!me) return;
      try {
        const m = JSON.parse(message);
        // Our own holdTitle already applied it (and the clock moved since).
        if (m && typeof m.player === "string" && typeof m.from === "string" && !mine(m.from)) hold(m.player, m.from, Math.max(Number(m.ticks) || 0, 0));
      } catch {
        // not ours
      }
      return;
    }
    if (!me) return;
    if (id === "realm:side_comp") {
      try {
        const m = JSON.parse(message);
        if (!m || typeof m.from !== "string" || mine(m.from) || !Array.isArray(m.players)) return;
        const ticks = Math.min(Math.max(Number(m.ticks) || 0, 0), MAX_TICKS);
        const now = system.currentTick;
        for (const pid of m.players) {
          if (typeof pid !== "string") continue;
          let by = claims.get(pid);
          if (ticks > 0) {
            if (!by) claims.set(pid, (by = new Map()));
            by.set(m.from, now + ticks);
          } else if (by) {
            by.delete(m.from);
            if (!by.size) claims.delete(pid);
          }
        }
      } catch {
        // not ours
      }
      return;
    }
    // Our own readouts come back to us too: skip them without parsing.
    const from = field(message, '"from":"');
    if (from !== undefined && mine(from)) return;
    const pid = field(message, '"player":"');
    const now = system.currentTick;
    if (from === undefined || pid === undefined) {
      // Not the usual shape: read it now.
      try {
        const m = JSON.parse(message);
        if (!m || typeof m.player !== "string" || typeof m.from !== "string" || mine(m.from)) return;
        const who = /** @type {string} */ (m.player);
        materialize(who);
        if (!applyMessage(who, m, now)) return;
        const ours = compositor && composing.has(who);
        const crossed = (drewAt.get(who) ?? -Infinity) >= (typeof m.tick === "number" ? m.tick : now) - CROSS_TICKS;
        const p = drawsFor(who, now) && (ours || crossed) ? playerById(who) : undefined;
        if (p) draw(p);
        else drewSome.set(who, true);
      } catch {
        // not ours
      }
      return;
    }
    const ours = compositor && composing.has(pid) && drawsFor(pid, now);
    const drew = drewAt.get(pid);
    // Neither the compositor of this player nor a pack that drew them a moment ago: keep it unread.
    if (!ours && !(drew !== undefined && drew >= now - CROSS_TICKS - 2)) {
      let box = inbox.get(pid);
      if (!box) inbox.set(pid, (box = new Map()));
      // Kept in the order they came (a newer one from the same pack goes last), so reading them later gives the
      // same picture as reading each as it came: the last one into a slot has it.
      box.delete(from);
      box.set(from, { msg: message, at: now });
      // Whatever they drew is on screen now (or they cleared it): a later draw of an empty picture clears it.
      drewSome.set(pid, true);
      return;
    }
    try {
      const before = versions.get(pid);
      materialize(pid);
      const m = JSON.parse(message);
      applyMessage(pid, m, now);
      const changed = versions.get(pid) !== before;
      if (ours) {
        // The compositor draws every pack's readouts with its own; a resend that changes nothing draws nothing.
        if (!changed) return;
      } else if (!drawsFor(pid, now) || /** @type {number} */ (drew) < (typeof m.tick === "number" ? m.tick : now) - CROSS_TICKS) {
        drewSome.set(pid, true);
        return;
      }
      // Our last title may have crossed theirs (events arrive a little later): draw again with both.
      const p = playerById(pid);
      if (p) draw(p);
    } catch {
      // not ours
    }
  },
);

// Readouts that run out: the pack that wrote one draws the title again without it (a compositor draws whenever any
// of its players' readouts runs out). Real titles that end: every pack with a readout for that player draws the
// boxes again (they all draw the same picture). A compositor claim that ran out without being renewed: the packs
// with a readout draw again. A compositor renews its claims every CLAIM_EVERY ticks.
system.runInterval(() => {
  const now = system.currentTick;
  for (const [id, stage] of stagedDelivery) if (stage.until <= now || !hasLiveOwn(id, now)) forgetDelivery(id);
  for (const [playerId, byPack] of [...holds]) {
    for (const [from, until] of [...byPack]) if (until <= now) byPack.delete(from);
    if (byPack.size) continue;
    holds.delete(playerId);
    prune(playerId, now);
    if (!hasOwn(playerId) || !drawsFor(playerId, now)) continue;
    const p = playerById(playerId);
    if (p) draw(p);
  }
  for (const [playerId, by] of [...claims]) {
    let ran = false;
    for (const [from, until] of [...by]) {
      if (until > now) continue;
      by.delete(from);
      ran = true;
    }
    if (!by.size) claims.delete(playerId);
    if (!ran || !hasOwn(playerId) || !drawsFor(playerId, now)) continue;
    const p = playerById(playerId);
    if (p) draw(p);
  }
  if (compositor && composing.size && now - claimsSentAt >= CLAIM_EVERY) {
    claimsSentAt = now;
    sendClaims([...composing], CLAIM_TICKS);
  }
  if (!picture.size) return;
  for (const playerId of [...picture.keys()]) {
    const ran = prune(playerId, now);
    if (!(ran & 2) && !(ran && compositor && composing.has(playerId))) continue;
    const p = playerById(playerId);
    if (p) draw(p);
    else if (compositor) release(playerId);
  }
}, SWEEP_TICKS);

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  forgetDelivery(playerId);
  picture.delete(playerId);
  inbox.delete(playerId);
  versions.delete(playerId);
  composed.delete(playerId);
  drewAt.delete(playerId);
  drewSome.delete(playerId);
  holds.delete(playerId);
  claims.delete(playerId);
  composing.delete(playerId);
});
