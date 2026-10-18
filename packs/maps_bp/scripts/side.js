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
//   subtitle = MARK + seg(right1) + ... + seg(quest)     (in ALL_SLOTS order: 12 segments, 3473 bytes)
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
import { Player, system, world } from "@minecraft/server";

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
const RADAR_SEG_BYTES = 1352;
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

const PAD_R = "§r".repeat(455);

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
  let out = MARK;
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

/** `raw`: another pack's text as it arrived, cleaned only when this copy draws it. @typedef {{ from: string, text: string, until: number, raw?: boolean }} Entry */
/** player id -> slot -> what shows there. @type {Map<string, Map<string, Entry>>} */
const picture = new Map();
/** player id -> tick this pack last drew the title. @type {Map<string, number>} */
const drewAt = new Map();
/** player id -> whether the last title this pack drew had something in it. @type {Map<string, boolean>} */
const drewSome = new Map();
let me = "";
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
}

/** Is a real title on this player's screen? @param {string} playerId @param {number} now */
function held(playerId, now) {
  const byPack = holds.get(playerId);
  if (!byPack) return false;
  for (const until of byPack.values()) if (until > now) return true;
  return false;
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

/** @param {string} playerId @param {string} from @param {string} slot @param {string} text @param {number} until @param {boolean} [raw] not cleaned yet */
function apply(playerId, from, slot, text, until, raw = false) {
  let slots = picture.get(playerId);
  if (!slots) picture.set(playerId, (slots = new Map()));
  for (const [s, e] of slots) if (e.from === from) slots.delete(s);
  if (text && isAnySlot(slot)) slots.set(slot, raw ? { from, text, until, raw } : { from, text, until });
  if (!slots.size) picture.delete(playerId);
}

/** An entry's text, cleaned the first time this copy needs it. @param {string} slot @param {Entry} e */
function textOf(slot, e) {
  if (e.raw) {
    e.text = clean(e.text, segBytesOf(slot) - 1);
    e.raw = false;
  }
  return e.text;
}

/** Drops readouts that ran out. @param {string} playerId @param {number} now @returns {boolean} whether one of ours ran out */
function prune(playerId, now) {
  const slots = picture.get(playerId);
  if (!slots) return false;
  let ours = false;
  for (const [s, e] of slots) {
    if (e.until > now) continue;
    slots.delete(s);
    if (mine(e.from)) ours = true;
  }
  if (!slots.size) picture.delete(playerId);
  return ours;
}

/** Writes the whole title for a player from this pack's picture. @param {Player} player */
function draw(player) {
  const now = system.currentTick;
  prune(player.id, now);
  // A real title is showing: keep the picture, draw once the hold ends (the sweep below).
  if (held(player.id, now)) return;
  const slots = picture.get(player.id);
  drewAt.set(player.id, now);
  try {
    if (!slots) {
      if (drewSome.get(player.id)) player.onScreenDisplay.setTitle(CLEAR, { subtitle: " ", fadeInDuration: 0, stayDuration: 1, fadeOutDuration: 0 });
      drewSome.set(player.id, false);
      return;
    }
    /** @type {Record<string, string>} */
    const texts = {};
    let last = now;
    for (const [s, e] of slots) {
      texts[s] = textOf(s, e);
      last = Math.max(last, e.until);
    }
    player.onScreenDisplay.setTitle(MARK, { subtitle: compose(texts), fadeInDuration: 0, stayDuration: last - now + 2, fadeOutDuration: 0 });
    drewSome.set(player.id, true);
  } catch {
    // left meanwhile
  }
}

/** @param {string} playerId */
const playerById = (playerId) => world.getAllPlayers().find((p) => p.id === playerId);

/**
 * The side boxes for one pack.
 * @param {string} from this pack's name in realm:side (its dynamic property prefix)
 */
export function sideBoxes(from) {
  me = from;
  return {
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
      apply(player.id, from, slot, t, tick + span);
      system.sendScriptEvent("realm:side", JSON.stringify({ player: player.id, from, slot, text: t, ticks: span, tick }));
      if (now) draw(player);
    },
    /** Takes this pack's readout (or one part's) off the player's screen. @param {Player} player @param {string} [part] @param {boolean} [now] false: don't draw yet */
    clear(player, part = "", now = true) {
      const from = part ? `${me}/${part}` : me;
      const had = [...(picture.get(player.id)?.values() ?? [])].some((e) => e.from === from);
      if (!had) return;
      apply(player.id, from, "", "", 0);
      system.sendScriptEvent("realm:side", JSON.stringify({ player: player.id, from, slot: "", text: "", ticks: 0, tick: system.currentTick }));
      if (now) draw(player);
    },
    /** Draws the title now, after show or clear with `now` false. @param {Player} player */
    redraw(player) {
      draw(player);
    },
    /** Is another pack's readout in this slot for the player right now? @param {Player} player @param {string} slot */
    taken(player, slot) {
      const e = picture.get(player.id)?.get(slot);
      return !!e && !mine(e.from) && e.until > system.currentTick;
    },
    /** Is a real title holding the player's boxes back (the title protocol)? @param {Player} player */
    held(player) {
      return held(player.id, system.currentTick);
    },
    /** What this pack's copy would put in the subtitle now (for tests). @param {Player} player */
    payload(player) {
      prune(player.id, system.currentTick);
      /** @type {Record<string, string>} */
      const texts = {};
      for (const [s, e] of picture.get(player.id) ?? []) texts[s] = textOf(s, e);
      return compose(texts);
    },
  };
}

// Every pack with side boxes reads every readout (the minimap sends two a draw): only the id is looked at before
// parsing, and another pack's text is kept as it came (cleaned when this copy draws it, which most never do).
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:side" && id !== "realm:title") return;
    if (id === "realm:title" && me) {
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
    // Our own readouts come back to us too: skip them without parsing (a JSON string value can't hold `"from":"`
    // unescaped, so the first one is the key).
    const f = message.indexOf('"from":"');
    if (f >= 0) {
      const end = message.indexOf('"', f + 8);
      if (end > 0 && mine(message.slice(f + 8, end))) return;
    }
    try {
      const m = JSON.parse(message);
      if (!m || typeof m.player !== "string" || typeof m.from !== "string" || mine(m.from) || typeof m.slot !== "string") return;
      const ticks = Math.min(Math.max(Number(m.ticks) || 0, 0), MAX_TICKS);
      const sent = typeof m.tick === "number" ? m.tick : system.currentTick;
      apply(m.player, m.from, m.slot, typeof m.text === "string" ? m.text : "", system.currentTick + ticks, true);
      // Our last title may have crossed theirs (events arrive a little later): draw again with both.
      if ((drewAt.get(m.player) ?? -Infinity) >= sent - CROSS_TICKS) {
        const p = playerById(m.player);
        if (p) draw(p);
      } else if (!picture.has(m.player)) drewSome.set(m.player, false); // they cleared the screen
      else drewSome.set(m.player, true);
    } catch {
      // not ours
    }
  },
  { namespaces: ["realm"] }
);

// Readouts that run out: the pack that wrote one draws the title again without it. Real titles that end:
// every pack with a readout for that player draws the boxes again (they all draw the same picture).
system.runInterval(() => {
  const now = system.currentTick;
  for (const [playerId, byPack] of [...holds]) {
    for (const [from, until] of [...byPack]) if (until <= now) byPack.delete(from);
    if (byPack.size) continue;
    holds.delete(playerId);
    prune(playerId, now);
    if (![...(picture.get(playerId)?.values() ?? [])].some((e) => mine(e.from))) continue;
    const p = playerById(playerId);
    if (p) draw(p);
  }
  if (!picture.size) return;
  for (const playerId of [...picture.keys()]) {
    if (!prune(playerId, now)) continue;
    const p = playerById(playerId);
    if (p) draw(p);
  }
}, SWEEP_TICKS);

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  picture.delete(playerId);
  drewAt.delete(playerId);
  drewSome.delete(playerId);
  holds.delete(playerId);
});
