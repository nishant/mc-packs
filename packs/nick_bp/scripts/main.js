import "./diag.js";
import { CommandPermissionLevel, CustomCommandStatus, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get, onChange } from "./settings.js";
import { onScriptEvent } from "./script-events.js";
import { stale, sweepGamertags } from "./prune.js";
import { spreadPlayers } from "./spread.js";

// A nickname shows above the player's head (Player.nameTag). The stable Script API has no chat
// events, so chat, the player list and death messages keep the gamertag.
//
// The AFK pack sets the same name tag (to "[AFK] Name" and back), so twice a second this pack puts the
// nickname back on anyone whose tag differs, keeping the AFK prefix while the player has the afk tag.
//
// A title from the Titles & Trails pack (the player tag `realm_title:<text>`) shows as a gray line
// under the name, with or without a nickname. Tags can change at any time, so the same twice-a-second
// check picks it up, and puts the plain gamertag back once the title is gone.

/** @typedef {{ n: string, c: string, g: string }} Nick nickname, color code (one character after §), gamertag when last seen */

const KEY_PREFIX = "nick:p:"; // world property per player: nick:p:<player id> -> Nick
const SEEN_PREFIX = "nick:g:"; // world property per gamertag ever seen here: nick:g:<lowercase gamertag> -> player id
const TIME_PREFIX = "nick:t:"; // world property per player: nick:t:<player id> -> when last seen (ms)
const NAME_RULE = /^[A-Za-z0-9_ ]{3,16}$/;
const LIST_MAX = 40; // entries read from a reserved list
/** A name as compared with the reserved lists: lowercase, without spaces or underscores ("Ad min" and "Admin_" are "admin"). @param {string} s */
const squash = (s) => s.toLowerCase().replace(/[ _]/g, "");
/** @param {string} key "reservedNames" or "reservedGamertags" @returns {Set<string>} */
function reservedSet(key) {
  const v = get(key);
  const out = new Set();
  if (typeof v !== "string") return out;
  for (const part of v.split(/[,\n]/).slice(0, LIST_MAX)) {
    const s = squash(part.trim());
    if (s) out.add(s);
  }
  return out;
}
const DISABLED = "Nicknames are disabled on this realm. An operator can enable them in /realm:config (Nicknames).";

/** The colors to choose from: name, and the code after §. */
const COLORS = [
  { name: "White", code: "f" },
  { name: "Gray", code: "7" },
  { name: "Red", code: "c" },
  { name: "Dark red", code: "4" },
  { name: "Gold", code: "6" },
  { name: "Yellow", code: "e" },
  { name: "Green", code: "a" },
  { name: "Dark green", code: "2" },
  { name: "Aqua", code: "b" },
  { name: "Dark aqua", code: "3" },
  { name: "Blue", code: "9" },
  { name: "Light purple", code: "d" },
  { name: "Dark purple", code: "5" },
];

const enabled = () => get("enabled") === true;
/** @param {Player} player */
const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

// ---------------------------------------------------------------------------
// Saved nicknames (cached: this pack is the only writer)
// ---------------------------------------------------------------------------

/** @type {Map<string, Nick> | undefined} */
let cache;

/** @returns {Map<string, Nick>} player id -> nickname */
function nicks() {
  if (cache) return cache;
  /** @type {Map<string, Nick>} */
  const map = new Map();
  try {
    for (const key of world.getDynamicPropertyIds()) {
      if (!key.startsWith(KEY_PREFIX)) continue;
      try {
        const raw = world.getDynamicProperty(key);
        const v = typeof raw === "string" ? JSON.parse(raw) : undefined;
        if (v && typeof v.n === "string" && typeof v.c === "string") map.set(key.slice(KEY_PREFIX.length), { n: v.n, c: v.c, g: String(v.g ?? "") });
      } catch {
        // a corrupt entry is no nickname
      }
    }
  } catch {
    return map; // the world isn't loaded yet: read again next time
  }
  return (cache = map);
}

/** @param {string} id @param {Nick | undefined} nick */
function save(id, nick) {
  if (nick) nicks().set(id, nick);
  else nicks().delete(id);
  world.setDynamicProperty(KEY_PREFIX + id, nick ? JSON.stringify(nick) : undefined);
}

// ---------------------------------------------------------------------------
// Name tags
// ---------------------------------------------------------------------------

/** Ids of players whose name tag this pack changed, to put their gamertag back. @type {Set<string>} */
const shown = new Set();

/** @param {Player} player */
const afkPrefix = (player) => (player.hasTag(CONFIG.afkTag) ? CONFIG.afkPrefix : "");

const TITLE_TAG = "realm_title:"; // set by the Titles & Trails pack: one per player

/** The line under the name for the player's title, or "". @param {Player} player */
function titleLine(player) {
  const tag = player.getTags().find((t) => t.startsWith(TITLE_TAG));
  const title = tag ? tag.slice(TITLE_TAG.length).replace(/§./g, "").trim() : "";
  return title ? `\n§7${title}` : "";
}

/** What the player's name tag should be, or undefined to leave it alone. @param {Player} player @param {string} [title] their titleLine, when already read */
function wanted(player, title = titleLine(player)) {
  const nick = enabled() ? nicks().get(player.id) : undefined;
  if (nick) {
    const second = get("showGamertag") === true ? `\n§7${player.name}` : "";
    return `${afkPrefix(player)}§${nick.c}${nick.n}§r${second}${title}`;
  }
  if (title) return `${afkPrefix(player)}${player.name}§r${title}`;
  // Nicknamed while nicknames are disabled, or was nicknamed or titled: the gamertag.
  if (shown.has(player.id) || nicks().has(player.id)) return `${afkPrefix(player)}${player.name}`;
  return undefined;
}

/** @param {Player} player @param {boolean} [force] put the gamertag back even if this pack didn't change the tag (nickname just removed) */
function refresh(player, force = false) {
  try {
    const title = titleLine(player);
    const want = wanted(player, title) ?? (force ? `${afkPrefix(player)}${player.name}` : undefined);
    if (want === undefined) return;
    if (player.nameTag !== want) player.nameTag = want;
    if ((enabled() && nicks().has(player.id)) || title) shown.add(player.id);
    else shown.delete(player.id);
  } catch {
    // left meanwhile
  }
}

const refreshAll = () => world.getAllPlayers().forEach((p) => refresh(p));

// The tag changes when the AFK pack marks a player away or back, or the Titles pack changes the title they wear: both
// send realm:nametag { player } right after, and the tag is put right at once. Every player is also looked at every
// 5 seconds (scripts/spread.js, one share: see the AFK pack's note), for anything that said nothing (an operator's /tag,
// an older AFK or Titles pack).
onScriptEvent("realm:nametag", ({ id, message }) => {
  if (id !== "realm:nametag") return;
  let who;
  try {
    who = String(JSON.parse(message)?.player ?? "");
  } catch {
    return;
  }
  const player = who ? world.getAllPlayers().find((p) => p.id === who) : undefined;
  if (player) refresh(player);
});
spreadPlayers(system, world, {
  every: 100,
  parts: 1,
  visit: (share) => {
    for (const p of share) refresh(p);
  },
});
onChange(() => refreshAll());

/** Remembers a gamertag, so nobody can take it as a nickname while its player is offline. @param {Player} player */
function noteGamertag(player) {
  const key = SEEN_PREFIX + player.name.toLowerCase();
  try {
    if (world.getDynamicProperty(key) !== player.id) world.setDynamicProperty(key, player.id);
    const now = Date.now();
    if (stale(world.getDynamicProperty(TIME_PREFIX + player.id), now)) world.setDynamicProperty(TIME_PREFIX + player.id, now);
  } catch (e) {
    console.warn(`[nick] ${e}`);
  }
}

/** Forgets the gamertags of players not seen for `forgetGamertagsAfterDays` (their nicknames stay). A player with no saved time starts counting now. */
function* forgetOld() {
  if (!(Number(get("forgetGamertagsAfterDays")) > 0)) return;
  let ids;
  try {
    ids = world.getDynamicPropertyIds().filter((k) => k.startsWith(SEEN_PREFIX));
  } catch {
    return;
  }
  yield* sweepGamertags({
    keys: () => ids,
    owner: (key) => world.getDynamicProperty(key),
    online: (id) => world.getAllPlayers().some((p) => p.id === id),
    seen: (id) => world.getDynamicProperty(TIME_PREFIX + id),
    days: () => Number(get("forgetGamertagsAfterDays")),
    now: () => Date.now(),
    start: (id, now) => world.setDynamicProperty(TIME_PREFIX + id, now),
    drop: (key, id, days) => {
      world.setDynamicProperty(key, undefined);
      world.setDynamicProperty(TIME_PREFIX + id, undefined);
      console.warn(`[nick] forgot the gamertag ${key.slice(SEEN_PREFIX.length)}: not seen for over ${days} days`);
    },
    warn: (e) => console.warn(`[nick] ${e}`),
  });
}
system.runTimeout(() => system.runJob(forgetOld()), 1200);
system.runInterval(() => system.runJob(forgetOld()), 20 * 3600 * 6);

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (initialSpawn) noteGamertag(player);
  // Keep the saved gamertag current, for the operators' list.
  const nick = nicks().get(player.id);
  if (nick && nick.g !== player.name) save(player.id, { ...nick, g: player.name });
  refresh(player);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => shown.delete(playerId));

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

/**
 * Shows a form, retrying while the player still has chat or another screen open.
 * @template {ActionFormData | ModalFormData} F
 * @param {Player} player @param {F} form
 * @returns {Promise<Awaited<ReturnType<F["show"]>> | undefined>}
 */
async function show(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = /** @type {any} */ (await form.show(player));
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await new Promise((r) => system.runTimeout(() => r(undefined), 20));
  }
  return undefined;
}

/**
 * Is `name` a reserved word or a listed operator gamertag that this player may not take? Operators may use the reserved
 * words; nobody is held back from their own gamertag. The game doesn't tell packs which offline players are operators,
 * so only the listed gamertags (and every gamertag seen here) are protected while their owner is away.
 * @param {Player} player @param {string} name
 */
function isReserved(player, name, op = isOp(player)) {
  const key = squash(name);
  if (name.toLowerCase() === player.name.toLowerCase()) return false;
  if (reservedSet("reservedGamertags").has(key)) return true;
  if (world.getAllPlayers().some((p) => p.id !== player.id && isOp(p) && squash(p.name) === key)) return true;
  return !op && reservedSet("reservedNames").has(key);
}

/**
 * Why `name` can't be this player's nickname, or undefined.
 * @param {Player} player @param {string} name
 */
function problem(player, name) {
  if (!NAME_RULE.test(name)) return "A nickname is 3 to 16 characters: letters A-Z, digits, spaces and _.";
  if (isReserved(player, name)) return `${name} is a reserved name.`;
  const lower = name.toLowerCase();
  for (const p of world.getAllPlayers()) {
    if (p.id !== player.id && p.name.toLowerCase() === lower) return `${p.name} is someone else's gamertag.`;
  }
  try {
    const owner = world.getDynamicProperty(SEEN_PREFIX + lower);
    if (typeof owner === "string" && owner !== player.id) return `${name} is someone else's gamertag.`; // a player who is offline now
  } catch {
    // not readable: the checks below still run
  }
  for (const [id, nick] of nicks()) {
    if (id === player.id) continue;
    if (nick.n.toLowerCase() === lower) return `${nick.g || "Someone"} already has that nickname.`;
    if (nick.g.toLowerCase() === lower) return `${nick.g} is someone else's gamertag.`;
  }
  return undefined;
}

/** The nickname form. @param {Player} player @param {string} [tried] what the player typed last time */
async function editMine(player, tried) {
  const mine = nicks().get(player.id);
  const color = Math.max(0, COLORS.findIndex((c) => c.code === mine?.c));
  const form = new ModalFormData()
    .title("§lNickname")
    .label("Shown above your head instead of your gamertag. Chat and the player list still show your gamertag.")
    .textField("Nickname (3 to 16 letters, digits, spaces or _)", "Your nickname", { defaultValue: tried ?? mine?.n ?? "" })
    .dropdown("Color", COLORS.map((c) => `§${c.code}${c.name}`), { defaultValueIndex: color });
  if (mine) form.toggle("Remove my nickname", { defaultValue: false });
  form.submitButton("Save");
  const res = await show(player, form);
  if (!res || res.canceled || !res.formValues || !player.isValid) return;
  if (!enabled()) return player.sendMessage(`§c${DISABLED}`);

  // Labels may or may not take a place in formValues: pick the answers by type.
  const values = res.formValues;
  const text = values.find((v) => typeof v === "string");
  const index = values.find((v) => typeof v === "number");
  const remove = values.find((v) => typeof v === "boolean");
  if (remove === true) {
    save(player.id, undefined);
    refresh(player, true);
    return player.sendMessage("§7Nickname removed. Your gamertag shows again.");
  }
  const name = String(text ?? "").trim().replace(/ +/g, " ");
  const why = problem(player, name);
  if (why) {
    player.sendMessage(`§c${why}`);
    return editMine(player, name);
  }
  const c = COLORS[typeof index === "number" ? index : 0] ?? COLORS[0];
  save(player.id, { n: name, c: c.code, g: player.name });
  refresh(player);
  player.sendMessage(`§aYour nickname is now §${c.code}${name}§a.§r Chat still shows your gamertag.`);
}

const PAGE_SIZE = 20; // nicknames per page of the operators' list: a form with hundreds of buttons is unusable and slow to send

/** A saved nickname that the reserved lists would refuse today (it is kept; operators can clear it). @param {Nick} nick */
const reservedNow = (nick) => {
  const key = squash(nick.n);
  if (nick.n.toLowerCase() === String(nick.g ?? "").toLowerCase()) return false;
  return reservedSet("reservedNames").has(key) || reservedSet("reservedGamertags").has(key) || world.getAllPlayers().some((p) => isOp(p) && p.name.toLowerCase() !== String(nick.g ?? "").toLowerCase() && squash(p.name) === key);
};

/**
 * Operators: saved nicknames, a page at a time and searchable by nickname or gamertag, to clear any of them.
 * @param {Player} player @param {number} [page] @param {string} [query]
 */
async function allNicks(player, page = 0, query = "") {
  if (!isOp(player)) return player.sendMessage("§cOnly operators can see other players' nicknames.");
  const want = query.trim().toLowerCase();
  const list = [...nicks()]
    .filter(([, nick]) => !want || nick.n.toLowerCase().includes(want) || nick.g.toLowerCase().includes(want))
    .sort((a, b) => a[1].n.localeCompare(b[1].n));
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const at = Math.min(Math.max(0, page), pages - 1);
  const shownHere = list.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE);
  const form = new ActionFormData()
    .title("§lPlayers' nicknames")
    .body(
      (list.length ? `Tap a nickname to clear it. ${list.length} ${want ? "match" : "saved"}${pages > 1 ? `, page ${at + 1} of ${pages}` : ""}.` : want ? "No nickname or gamertag matches." : "Nobody has a nickname.") +
        (want ? `\n§7Search: ${query.trim().replace(/§/g, "")}` : "")
    );
  for (const [, nick] of shownHere) form.button(`§${nick.c}${nick.n}§r${reservedNow(nick) ? " §c(reserved)" : ""}\n§8${nick.g || "unknown gamertag"}`);
  const extra = /** @type {string[]} */ ([]);
  extra.push("search");
  if (want) extra.push("clear");
  if (at > 0) extra.push("prev");
  if (at < pages - 1) extra.push("next");
  extra.push("back");
  const labels = { search: "Search by name", clear: "Show everyone", prev: "Previous page", next: "Next page", back: "Back" };
  for (const e of extra) form.button(labels[/** @type {keyof typeof labels} */ (e)]);
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  const picked = shownHere[res.selection];
  if (!picked) {
    const action = extra[res.selection - shownHere.length];
    if (action === "search") {
      const ask = await show(player, new ModalFormData().title("§lSearch nicknames").textField("Part of a nickname or gamertag", "", { defaultValue: query }).submitButton("Search"));
      if (!ask || ask.canceled || !player.isValid) return allNicks(player, at, query);
      return allNicks(player, 0, String(ask.formValues?.[0] ?? "").slice(0, 32));
    }
    if (action === "clear") return allNicks(player, 0, "");
    if (action === "prev") return allNicks(player, at - 1, query);
    if (action === "next") return allNicks(player, at + 1, query);
    return mainMenu(player);
  }
  const [id, nick] = picked;
  const sure = await show(
    player,
    new ActionFormData()
      .title("§lClear nickname")
      .body(`Clear §${nick.c}${nick.n}§r (${nick.g || "unknown gamertag"})? Their gamertag shows again; they can pick a new nickname.`)
      .button("Clear nickname")
      .button("Back")
  );
  if (!sure || sure.canceled || !player.isValid) return;
  if (sure.selection !== 0) return allNicks(player, at, query);
  if (!isOp(player)) return player.sendMessage("§cOnly operators can clear other players' nicknames."); // de-opped while the menu was open
  if (nicks().get(id) !== nick) return allNicks(player, at, query); // changed while the form was open: don't clear the wrong one
  save(id, undefined);
  const target = world.getAllPlayers().find((p) => p.id === id);
  if (target) {
    refresh(target, true);
    if (target.id !== player.id) target.sendMessage("§7An operator cleared your nickname.");
  }
  player.sendMessage(`§7Cleared ${nick.n} (${nick.g || "unknown gamertag"}).`);
  return allNicks(player, at, query);
}

/** @param {Player} player */
async function mainMenu(player) {
  if (!isOp(player)) return editMine(player);
  const mine = nicks().get(player.id);
  const form = new ActionFormData()
    .title("§lNicknames")
    .body(mine ? `Your nickname: §${mine.c}${mine.n}§r` : "You have no nickname.")
    .button("My nickname\n§8Set, change or remove it")
    .button(`§4Players' nicknames (operator)\n§8${nicks().size} saved, clear any`);
  const res = await show(player, form);
  if (!res || res.canceled || !player.isValid) return;
  if (res.selection === 0) await editMine(player);
  else if (res.selection === 1) await allNicks(player);
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:nick",
      description: "Set a nickname and color shown above your head",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      if (!enabled()) return { status: CustomCommandStatus.Failure, message: DISABLED };
      system.run(() => mainMenu(player).catch((e) => console.warn(`[nick] ${e}`)));
      return { status: CustomCommandStatus.Success };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
onScriptEvent(
  "realm:help_ping",
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "nick_bp");
  },
);
