import "./diag.js";
import { CommandPermissionLevel, CustomCommandStatus, Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { get, getFor, onChange, setFor } from "./settings.js";
import { isSlot, sideBoxes } from "./side.js";
import { onScriptEvent } from "./script-events.js";

// The "on" and "showTime" preferences (player property "hud:pref") and the world options live in settings.js.

const COMPASS_8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const COMPASS_4 = ["N", "E", "S", "W"];
/** The fastest the HUD may update: twice a second. */
const MIN_INTERVAL = 10;

/** In a side box the HUD is sent again only after this many ticks when nothing changed (each send redraws every box). */
const BOX_REFRESH = 100;
const side = sideBoxes("hud");

/** player id -> { text, at, inBox } of what was last shown */
const shown = new Map();
/** player id -> tick until which another pack's action bar message is left alone */
const pausedUntil = new Map();

/** @param {Player} player */
const hudFor = (player) => get("enabled") === true && getFor(player, "on") === true;

/** @param {Player} player */
function facing(player) {
  const north = (player.getRotation().y + 180 + 360) % 360; // yaw 180 = north, -90 = east, 0 = south, 90 = west
  const names = get("eightWay") === true ? COMPASS_8 : COMPASS_4;
  return names[Math.round(north / (360 / names.length)) % names.length];
}

function clock() {
  const t = world.getTimeOfDay(); // 0 = 6:00 AM, 6000 = noon, 18000 = midnight
  const hours = (Math.floor(t / 1000) + 6) % 24;
  // In 10-minute steps: a clock that ticks every in-game minute would redraw the bar every 17 ticks.
  const minutes = Math.floor(((t % 1000) * 6) / 1000) * 10;
  return `${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/**
 * Lines other packs show under the HUD while it's on (realm:hud_line), such as the Stats pack's ticker, which
 * would otherwise fight the HUD for the same bar. player id -> key -> { text, until (tick) }
 * @type {Map<string, Map<string, { text: string, until: number }>>}
 */
const extra = new Map();

/** @param {string} playerId @param {number} now @returns {string[]} the lines still showing, in key order */
function extraLines(playerId, now) {
  const lines = extra.get(playerId);
  if (!lines) return [];
  for (const [key, line] of lines) if (line.until <= now) lines.delete(key);
  if (!lines.size) extra.delete(playerId);
  return [...lines].sort((a, b) => a[0].localeCompare(b[0])).map(([, line]) => line.text);
}

/** Between the sections of the one line above the hotbar. */
const SEP = "  §8|  ";

/**
 * The HUD's text: above the hotbar one line in sections (`X 163  Y 70  Z 169  |  Facing NE  |  Day 4  6:20 AM  |
 * <other packs' lines>`); in a side box, a line each.
 * @param {Player} player @param {number} now @param {boolean} [inBox]
 */
function hudText(player, now, inBox = false) {
  const at = player.location;
  const parts = [`§7X §f${Math.floor(at.x)}  §7Y §f${Math.floor(at.y)}  §7Z §f${Math.floor(at.z)}`, `§7Facing §e${facing(player)}`];
  if (getFor(player, "showTime") === true) parts.push(`§7Day §f${world.getDay() + 1}  §f${clock()}`);
  const extras = extraLines(player.id, now);
  if (inBox) return [`${parts[0]}  ${parts[1]}`, ...parts.slice(2), ...extras].join("§r\n");
  return [...parts, ...extras].map((x) => `${x}§r`).join(SEP);
}

// Who sees the HUD, for packs that add a line under it: sent when it changes, every 5 seconds, and on realm:hud_ping.
//   realm:hud_state {"part":1,"parts":2,"seq":7,"players":["<player id>", ...]}
// The whole list is sent as parts (numbered from 1, each under 2048 characters, one `seq` per publication); a
// receiver replaces its list only when every part of one `seq` has arrived. No part/parts means one part.
const STATE_EVERY = 100;
const STATE_MESSAGE_LIMIT = 1900;
let stateKey = "";
let stateAt = -Infinity;
let stateSeq = 0;

/** @param {string} s */
const utf8Length = (s) => {
  let n = 0;
  for (const ch of s) {
    const c = /** @type {number} */ (ch.codePointAt(0));
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
};

/** The realm:hud_state messages for a full list. @param {string[]} players @param {number} seq */
function statePartMessages(players, seq) {
  const envelope = (/** @type {string[]} */ list, /** @type {number} */ part, /** @type {number} */ parts) =>
    JSON.stringify({ part, parts, seq, players: list });
  /** @type {string[][]} */
  const chunks = [[]];
  for (const id of players) {
    const last = /** @type {string[]} */ (chunks.at(-1));
    if (utf8Length(envelope([id], 9999, 9999)) > STATE_MESSAGE_LIMIT) continue; // can't fit alone: never happens with real ids
    if (last.length && utf8Length(envelope([...last, id], 9999, 9999)) > STATE_MESSAGE_LIMIT) chunks.push([id]);
    else last.push(id);
  }
  return chunks.map((list, i) => envelope(list, i + 1, chunks.length));
}

/**
 * Sent when the list changes, and every STATE_EVERY ticks while someone sees the HUD (Stats and Parties treat a list
 * not heard for 200 ticks as nobody's, so an empty list needs no repeating: a server where nobody uses the HUD sends
 * nothing).
 * @param {string[]} players @param {boolean} [now] send even if nothing changed
 */
function sendState(players, now = false) {
  const key = players.join(",");
  if (!now && key === stateKey && (!players.length || system.currentTick - stateAt < STATE_EVERY)) return;
  stateKey = key;
  stateAt = system.currentTick;
  for (const message of statePartMessages(players, ++stateSeq)) system.sendScriptEvent("realm:hud_state", message);
}

system.runInterval(() => {
  const now = system.currentTick;
  /** @type {string[]} */
  const seeing = [];
  for (const player of world.getAllPlayers()) {
    try {
      if (!hudFor(player)) continue;
      seeing.push(player.id);
      const where = getFor(player, "where");
      const inBox = isSlot(where);
      // Notes above the hotbar from other packs (realm:actionbar) only pause the HUD when it's there too.
      if (!inBox && (pausedUntil.get(player.id) ?? 0) > now) continue;
      const text = hudText(player, now, inBox);
      const key = `${where}|${text}`;
      const last = shown.get(player.id);
      if (last && last.text === key && now - last.at < (inBox ? BOX_REFRESH : CONFIG.refreshTicks)) continue;
      if (last && last.inBox && !inBox) side.clear(player); // moved from a box to the hotbar
      if (inBox) side.show(player, where, text, BOX_REFRESH + 40);
      else player.onScreenDisplay.setActionBar(text);
      shown.set(player.id, { text: key, at: now, inBox });
    } catch (e) {
      console.warn(`[hud] ${e}`);
    }
  }
  sendState(seeing);
}, Math.max(MIN_INTERVAL, CONFIG.intervalTicks));

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  shown.delete(playerId);
  pausedUntil.delete(playerId);
  extra.delete(playerId);
});

const seeingNow = () => world.getAllPlayers().filter(hudFor).map((p) => p.id);

// Turning the HUD off (here, in /realm:prefs, or for the whole realm) clears it right away.
onChange((key, player) => {
  const players = player ? [player] : world.getAllPlayers();
  for (const p of players) {
    const had = shown.get(p.id);
    shown.delete(p.id);
    // Off, or moved: the next round draws it again where it belongs.
    if (had?.inBox) side.clear(p);
    // Not while another pack's note is up (it goes away by itself): an empty bar would wipe it.
    else if (had && !hudFor(p) && (pausedUntil.get(p.id) ?? 0) <= system.currentTick) p.onScreenDisplay.setActionBar("");
  }
  sendState(seeingNow());
});

onScriptEvent(
  ["realm:actionbar", "realm:hud_line", "realm:hud_ping"],
  ({ id, message }) => {
    if (id !== "realm:actionbar" && id !== "realm:hud_line" && id !== "realm:hud_ping") return;
    try {
      if (id === "realm:hud_ping") {
        sendState(seeingNow(), true);
        return;
      }
      const req = JSON.parse(message);
      if (!req || typeof req.player !== "string") return;
      if (id === "realm:hud_line") {
        // A line under the HUD for one player, until `ticks` pass (resend to keep it) or text "" removes it:
        //   /scriptevent realm:hud_line {"player":"<player id>","key":"stats","text":"Deaths 3","ticks":80}
        if (typeof req.key !== "string") return;
        let lines = extra.get(req.player);
        const text = typeof req.text === "string" ? req.text.slice(0, 200) : "";
        if (!text) lines?.delete(req.key);
        else {
          if (!lines) extra.set(req.player, (lines = new Map()));
          lines.set(req.key, { text, until: system.currentTick + Math.min(Math.max(Number(req.ticks) || 80, 1), 400) });
        }
        return;
      }
      // Packs that show a short message on the action bar can ask the HUD to leave it alone for a moment:
      //   /scriptevent realm:actionbar {"player":"<player id>","ticks":40}
      const ticks = Math.min(Math.max(Number(req.ticks) || 40, 0), 200);
      pausedUntil.set(req.player, system.currentTick + ticks);
      if (!shown.get(req.player)?.inBox) shown.delete(req.player); // redraw as soon as the pause ends
    } catch {
      // not for us
    }
  },
);

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:hud",
      description: "Show or hide your coordinates, facing and the time above the hotbar",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      }
      if (get("enabled") !== true) {
        return {
          status: CustomCommandStatus.Failure,
          message: "The coordinates HUD is disabled on this realm. An operator can enable it in /realm:config (Coordinates HUD).",
        };
      }
      const nowOn = getFor(player, "on") !== true;
      system.run(() => setFor(player, "on", nowOn));
      return {
        status: CustomCommandStatus.Success,
        message: nowOn
          ? "Coordinates HUD: Enabled. Run /realm:hud again to hide it. The day and time can be hidden in /realm:prefs."
          : "Coordinates HUD: Disabled. Run /realm:hud again to show it.",
      };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
onScriptEvent(
  "realm:help_ping",
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "hud_bp");
  },
);
