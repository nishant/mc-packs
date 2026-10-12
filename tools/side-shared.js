// The side boxes protocol: up to nine short readouts on screen at once, drawn by Side HUD (hud_rp).
// Packs never import each other, so every pack that shows a readout keeps a copy of this file as
// scripts/side.js (node tools/sync-side.mjs keeps the copies the same).
//
// Slots: Right 1-4 and Left 1-4 (top to bottom), and Middle (just under the crosshair). The only text the
// server can send the HUD besides the action bar is the title and the subtitle, so every slot travels in
// one subtitle:
//
//   title    = MARK                                     ("§s§2§r": color codes only, invisible on its own)
//   subtitle = MARK + seg(right1) + ... + seg(middle)    (in SLOTS order)
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
// player: writing another slot moves its readout there.
//
// Real titles (a card name, FIGHT!, a level-up) share the channel, so the title protocol keeps them readable:
//   realm:title {player, ticks, from}     sent right before any other title or subtitle
// ("my title is on this player's screen for ticks", at most MAX_HOLD; ticks 0 ends the sender's hold early).
// While a hold lasts every copy keeps its picture but doesn't draw; when the last hold ends, each pack with a
// readout for that player draws the title again, so the boxes come back.
import { Player, system, world } from "@minecraft/server";

export const MARK = "§s§2§r";
const CLEAR = "§s§0§r";
/** Slot order in the subtitle. Must match hud_rp/ui/hud_screen.json. */
export const SLOTS = ["right1", "right2", "right3", "right4", "left1", "left2", "left3", "left4", "middle"];
/** How each slot reads in menus. */
export const SLOT_NAMES = ["Right 1 (top)", "Right 2", "Right 3", "Right 4 (bottom)", "Left 1 (top)", "Left 2", "Left 3", "Left 4 (bottom)", "Middle of the screen"];
const SEG_BYTES = 160;
/** Bytes of readout text a slot holds (the separator takes one). */
export const TEXT_BYTES = SEG_BYTES - 1;
const MAX_TICKS = 1200;
/** Longest real title a hold covers (a story scene line can stay 20 seconds). */
const MAX_HOLD = 600;
const SWEEP_TICKS = 4;
/** A title drawn this close before another pack's write may have crossed it on the way. */
const CROSS_TICKS = 2;

/** @param {unknown} where @returns {where is string} */
export const isSlot = (where) => typeof where === "string" && SLOTS.includes(where);

/** UTF-8 bytes of one code point. @param {string} ch */
const bytesOf = (ch) => {
  const c = /** @type {number} */ (ch.codePointAt(0));
  return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
};

/** UTF-8 bytes of a string. @param {string} s */
export function byteLength(s) {
  let n = 0;
  for (const ch of s) n += bytesOf(ch);
  return n;
}

/**
 * Readout text as it can travel: no "~" (the filler), no MARK, no carriage returns, at most TEXT_BYTES bytes
 * cut on a whole character, and no "§" left dangling at the end.
 * @param {string} text
 */
export function clean(text) {
  let s = String(text).split(MARK).join("").replace(/[~\r]/g, "");
  let out = "";
  let n = 0;
  for (const ch of s) {
    const b = bytesOf(ch);
    if (n + b > TEXT_BYTES) break;
    out += ch;
    n += b;
  }
  while (out.endsWith("§")) out = out.slice(0, -1);
  return out;
}

/** One slot's segment, exactly SEG_BYTES bytes. @param {string} text cleaned @param {string} sep " " or "\n" */
export function segment(text, sep) {
  const free = TEXT_BYTES - byteLength(text);
  return sep + text + "~".repeat(free % 3) + "§r".repeat(Math.floor(free / 3));
}

/** The subtitle for a set of slot texts. @param {Record<string, string>} texts slot -> cleaned text */
export function compose(texts) {
  let out = MARK;
  let first = true;
  for (const slot of SLOTS) {
    const text = texts[slot] ?? "";
    if (!text) out += segment("", " ");
    else {
      out += segment(text, first ? " " : "\n");
      first = false;
    }
  }
  return out;
}

/** @typedef {{ from: string, text: string, until: number }} Entry */
/** player id -> slot -> what shows there. @type {Map<string, Map<string, Entry>>} */
const picture = new Map();
/** player id -> tick this pack last drew the title. @type {Map<string, number>} */
const drewAt = new Map();
/** player id -> whether the last title this pack drew had something in it. @type {Map<string, boolean>} */
const drewSome = new Map();
let me = "";
/** player id -> pack -> tick its real title ends (the title protocol). @type {Map<string, Map<string, number>>} */
const holds = new Map();

/** @param {string} playerId @param {string} from @param {number} ticks */
function hold(playerId, from, ticks) {
  let byPack = holds.get(playerId);
  if (!byPack) holds.set(playerId, (byPack = new Map()));
  if (ticks > 0) byPack.set(from, system.currentTick + Math.min(ticks, MAX_HOLD));
  else byPack.delete(from);
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

/** @param {string} playerId @param {string} from @param {string} slot @param {string} text @param {number} until */
function apply(playerId, from, slot, text, until) {
  let slots = picture.get(playerId);
  if (!slots) picture.set(playerId, (slots = new Map()));
  for (const [s, e] of slots) if (e.from === from) slots.delete(s);
  if (text && isSlot(slot)) slots.set(slot, { from, text, until });
  if (!slots.size) picture.delete(playerId);
}

/** Drops readouts that ran out. @param {string} playerId @param {number} now @returns {boolean} whether one of ours ran out */
function prune(playerId, now) {
  const slots = picture.get(playerId);
  if (!slots) return false;
  let ours = false;
  for (const [s, e] of slots) {
    if (e.until > now) continue;
    slots.delete(s);
    if (e.from === me) ours = true;
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
      texts[s] = e.text;
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
     * @param {Player} player @param {string} slot one of SLOTS @param {string} text @param {number} ticks
     */
    show(player, slot, text, ticks) {
      if (!isSlot(slot)) return;
      const t = clean(text);
      const span = Math.min(Math.max(Math.round(ticks), 1), MAX_TICKS);
      const now = system.currentTick;
      apply(player.id, me, slot, t, now + span);
      system.sendScriptEvent("realm:side", JSON.stringify({ player: player.id, from: me, slot, text: t, ticks: span, tick: now }));
      draw(player);
    },
    /** Takes this pack's readout off the player's screen now. @param {Player} player */
    clear(player) {
      const had = [...(picture.get(player.id)?.values() ?? [])].some((e) => e.from === me);
      if (!had) return;
      apply(player.id, me, "", "", 0);
      system.sendScriptEvent("realm:side", JSON.stringify({ player: player.id, from: me, slot: "", text: "", ticks: 0, tick: system.currentTick }));
      draw(player);
    },
    /** Is another pack's readout in this slot for the player right now? @param {Player} player @param {string} slot */
    taken(player, slot) {
      const e = picture.get(player.id)?.get(slot);
      return !!e && e.from !== me && e.until > system.currentTick;
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
      for (const [s, e] of picture.get(player.id) ?? []) texts[s] = e.text;
      return compose(texts);
    },
  };
}

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id === "realm:title" && me) {
      try {
        const m = JSON.parse(message);
        // Our own holdTitle already applied it (and the clock moved since).
        if (m && typeof m.player === "string" && typeof m.from === "string" && m.from !== me) hold(m.player, m.from, Math.max(Number(m.ticks) || 0, 0));
      } catch {
        // not ours
      }
      return;
    }
    if (id !== "realm:side" || !me) return;
    try {
      const m = JSON.parse(message);
      if (!m || typeof m.player !== "string" || typeof m.from !== "string" || m.from === me || typeof m.slot !== "string") return;
      const ticks = Math.min(Math.max(Number(m.ticks) || 0, 0), MAX_TICKS);
      const sent = typeof m.tick === "number" ? m.tick : system.currentTick;
      apply(m.player, m.from, m.slot, typeof m.text === "string" ? clean(m.text) : "", system.currentTick + ticks);
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
    if (![...(picture.get(playerId)?.values() ?? [])].some((e) => e.from === me)) continue;
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
