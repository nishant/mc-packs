import { CommandPermissionLevel, CustomCommandStatus, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get, onChange } from "./settings.js";

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
const NAME_RULE = /^[A-Za-z0-9_ ]{3,16}$/;
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

/** What the player's name tag should be, or undefined to leave it alone. @param {Player} player */
function wanted(player) {
  const nick = enabled() ? nicks().get(player.id) : undefined;
  const title = titleLine(player);
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
    const want = wanted(player) ?? (force ? `${afkPrefix(player)}${player.name}` : undefined);
    if (want === undefined) return;
    if (player.nameTag !== want) player.nameTag = want;
    if ((enabled() && nicks().has(player.id)) || titleLine(player)) shown.add(player.id);
    else shown.delete(player.id);
  } catch {
    // left meanwhile
  }
}

const refreshAll = () => world.getAllPlayers().forEach((p) => refresh(p));

// Twice a second: cheap (a string comparison per player), and it undoes the AFK pack resetting the tag.
system.runInterval(refreshAll, 10);
onChange(() => refreshAll());

world.afterEvents.playerSpawn.subscribe(({ player }) => {
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
 * Why `name` can't be this player's nickname, or undefined.
 * @param {Player} player @param {string} name
 */
function problem(player, name) {
  if (!NAME_RULE.test(name)) return "A nickname is 3 to 16 characters: letters A-Z, digits, spaces and _.";
  const lower = name.toLowerCase();
  for (const p of world.getAllPlayers()) {
    if (p.id !== player.id && p.name.toLowerCase() === lower) return `${p.name} is someone else's gamertag.`;
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

/** Operators: every saved nickname, to clear any of them. @param {Player} player */
async function allNicks(player) {
  const list = [...nicks()].sort((a, b) => a[1].n.localeCompare(b[1].n));
  const form = new ActionFormData()
    .title("§lPlayers' nicknames")
    .body(list.length ? "Tap a nickname to clear it." : "Nobody has a nickname.");
  for (const [, nick] of list) form.button(`§${nick.c}${nick.n}§r\n§8${nick.g || "unknown gamertag"}`);
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  const picked = list[res.selection];
  if (!picked) return mainMenu(player);
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
  if (sure.selection !== 0) return allNicks(player);
  save(id, undefined);
  const target = world.getAllPlayers().find((p) => p.id === id);
  if (target) {
    refresh(target, true);
    if (target.id !== player.id) target.sendMessage("§7An operator cleared your nickname.");
  }
  player.sendMessage(`§7Cleared ${nick.n} (${nick.g || "unknown gamertag"}).`);
  return allNicks(player);
}

/** @param {Player} player */
async function mainMenu(player) {
  if (!isOp(player)) return editMine(player);
  const mine = nicks().get(player.id);
  const form = new ActionFormData()
    .title("§lNicknames")
    .body(mine ? `Your nickname: §${mine.c}${mine.n}§r` : "You have no nickname.")
    .button("My nickname\n§8Set, change or remove it")
    .button(`Players' nicknames (operator)\n§8${nicks().size} saved, clear any`);
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
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "nick_bp");
  },
  { namespaces: ["realm"] }
);
