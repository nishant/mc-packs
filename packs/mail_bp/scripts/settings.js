// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "mail_bp";
const PREFIX = "mail";
const TITLE = "Realm Mail";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "inboxLimit", type: "int", scope: "world", label: "Letters per inbox", help: "When a full inbox gets a letter, its oldest read letters are dropped first", min: 10, max: 200, step: 10 },
  { key: "systemInboxLimit", type: "int", scope: "world", label: "Pack letters per inbox", help: "Letters from townsfolk and goals; a newer one pushes out the oldest. Letters from players are never pushed out", min: 1, max: 50, step: 1 },
  { key: "systemLetterDays", type: "int", scope: "world", label: "Days a pack letter is kept", help: "Read or not, then it is deleted", min: 1, max: 365, step: 1 },
  { key: "systemReserve", type: "int", scope: "world", label: "Letters kept free for players", help: "Pack letters stop arriving when the realm holds 5000 minus this", min: 0, max: 4000, step: 100 },
  { key: "sentLimit", type: "int", scope: "world", label: "Letters kept in Sent", min: 0, max: 100, step: 10 },
  { key: "notifyOnJoin", type: "bool", scope: "world", label: "Unread letters notice on join", help: "A chat line on joining for players with unread letters" },
  { key: "sendCooldownSeconds", type: "int", scope: "world", label: "Seconds between letters", help: "Per player. 0 = no wait", min: 0, max: 120, step: 5 },
  { key: "senderUnreadCap", type: "int", scope: "world", label: "Unread letters per sender", help: "Most unread letters from one player in one inbox. 0 = no cap", min: 0, max: 50, step: 1 },
  { key: "joinNotice", type: "bool", scope: "player", base: "notifyOnJoin", label: "Unread letters notice on join", help: "A chat line when you join with unread letters" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
