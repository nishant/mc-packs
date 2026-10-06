import { CommandPermissionLevel, CustomCommandStatus, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get, getFor } from "./settings.js";

// One world property per letter: "mail:l:<id>" -> JSON Letter. A letter is one small property (a
// subject and up to bodyLength characters), so no property gets near the 32 KB limit however many
// letters a player has. The roster of everyone who has joined is one property of up to maxRoster
// short entries.
const LETTER_PREFIX = "mail:l:";
const PROP_NEXT = "mail:next"; // world: next letter id
const PROP_ROSTER = "mail:roster"; // world: JSON [{ i, n, t }] player id, name, last seen (ms)
const MAX_LETTERS = 5000; // in the whole world, as a safety net

/**
 * @typedef {{ id: number, f: string, fn: string, t: string, tn: string, s: string, b: string, at: number, r: number, di: number, ds: number }} Letter
 * from id and name, to id and name, subject, body, sent (ms), read, deleted from the inbox, deleted from Sent
 */
/** @typedef {{ i: string, n: string, t: number }} Member */

// ---------------------------------------------------------------------------
// Letters (cached; this pack is the only writer)
// ---------------------------------------------------------------------------

/** @type {Map<number, Letter> | undefined} */
let cache;

/** @returns {Map<number, Letter>} */
function letters() {
  if (cache) return cache;
  /** @type {Map<number, Letter>} */
  const map = new Map();
  try {
    for (const key of world.getDynamicPropertyIds()) {
      if (!key.startsWith(LETTER_PREFIX)) continue;
      try {
        const raw = world.getDynamicProperty(key);
        const l = typeof raw === "string" ? JSON.parse(raw) : undefined;
        if (l && typeof l.id === "number" && typeof l.t === "string" && typeof l.f === "string") map.set(l.id, l);
      } catch {
        // a corrupt letter is skipped
      }
    }
  } catch {
    return map; // the world isn't loaded yet: read again next time
  }
  return (cache = map);
}

/** Saves the letter, or removes it once both its reader and its writer deleted it. @param {Letter} l */
function save(l) {
  if (l.di && l.ds) {
    letters().delete(l.id);
    world.setDynamicProperty(LETTER_PREFIX + l.id, undefined);
  } else {
    letters().set(l.id, l);
    world.setDynamicProperty(LETTER_PREFIX + l.id, JSON.stringify(l));
  }
}

/** Newest first. @param {string} id */
const inboxOf = (id) => [...letters().values()].filter((l) => l.t === id && !l.di).sort((a, b) => b.at - a.at || b.id - a.id);
/** Newest first. @param {string} id */
const sentOf = (id) => [...letters().values()].filter((l) => l.f === id && !l.ds).sort((a, b) => b.at - a.at || b.id - a.id);
/** @param {string} id */
const unreadCount = (id) => inboxOf(id).filter((l) => !l.r).length;

// ---------------------------------------------------------------------------
// Roster: everyone who has joined since the pack was installed
// ---------------------------------------------------------------------------

/** @type {Member[] | undefined} */
let roster;

/** @returns {Member[]} */
function members() {
  if (roster) return roster;
  try {
    const raw = world.getDynamicProperty(PROP_ROSTER);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : [];
    roster = Array.isArray(parsed) ? parsed.filter((m) => m && typeof m.i === "string" && typeof m.n === "string") : [];
  } catch {
    roster = [];
  }
  return /** @type {Member[]} */ (roster);
}

/** Adds or refreshes a player (their name may have changed). @param {Player} player */
function remember(player) {
  const list = members().filter((m) => m.i !== player.id);
  list.push({ i: player.id, n: player.name, t: Date.now() });
  list.sort((a, b) => b.t - a.t);
  roster = list.slice(0, Math.max(1, CONFIG.maxRoster));
  world.setDynamicProperty(PROP_ROSTER, JSON.stringify(roster));
}

/** @param {string} id @returns {Player | undefined} */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  try {
    remember(player);
  } catch (e) {
    console.warn(`[mail] ${e}`);
  }
  system.runTimeout(
    () => {
      try {
        if (!player.isValid || getFor(player, "joinNotice") !== true) return;
        const n = unreadCount(player.id);
        if (n) player.sendMessage(`§eYou have ${n} unread letter${n === 1 ? "" : "s"}: /realm:mail`);
      } catch (e) {
        console.warn(`[mail] ${e}`);
      }
    },
    Math.max(1, CONFIG.notifyDelaySeconds * 20),
  );
});

// Players already online when the pack is added (a /reload) join the roster too.
system.run(() => {
  try {
    for (const p of world.getAllPlayers()) if (!members().some((m) => m.i === p.id && m.n === p.name)) remember(p);
  } catch (e) {
    console.warn(`[mail] ${e}`);
  }
});

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** "just now", "5m ago", "3h ago", "2d ago". @param {number} at */
function ago(at) {
  const m = Math.floor((Date.now() - at) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** "2026-10-06 14:05 UTC". @param {number} at */
function stamp(at) {
  const d = new Date(at);
  const p = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

/** Trims, turns a typed \n into a new line and shortens to `max`. @param {unknown} v @param {number} max @param {boolean} lines */
function clean(v, max, lines) {
  let s = typeof v === "string" ? v.trim() : "";
  s = lines ? s.replaceAll("\\n", "\n") : s.replaceAll("\\n", " ").replace(/\s+/g, " ");
  const cut = s.length > max;
  return { text: cut ? s.slice(0, max) : s, cut };
}

// ---------------------------------------------------------------------------
// Forms
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
 * Buttons with what each does.
 * @param {Player} player @param {string} title @param {string} body @param {{ text: string, run: () => void | Promise<void> }[]} actions
 */
async function menu(player, title, body, actions) {
  const form = new ActionFormData().title(title).body(body);
  for (const a of actions) form.button(a.text);
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  await actions[res.selection]?.run();
}

/** @type {Map<string, number>} player id -> when they last sent (ms) */
const lastSent = new Map();
world.afterEvents.playerLeave.subscribe(({ playerId }) => lastSent.delete(playerId));

/**
 * The letter form. `to` picks the recipient (a reply), and `draft` refills it after a problem.
 * @param {Player} player @param {{ to?: string, subject?: string, body?: string, problem?: string }} [draft]
 */
async function write(player, draft = {}) {
  const others = members()
    .filter((m) => m.i !== player.id)
    .sort((a, b) => a.n.localeCompare(b.n));
  if (draft.to && !others.some((m) => m.i === draft.to)) {
    const l = [...letters().values()].find((x) => x.f === draft.to);
    if (l) others.unshift({ i: l.f, n: l.fn, t: 0 }); // replying to someone the roster forgot
  }
  if (!others.length) {
    player.sendMessage("§eNobody else has joined the realm since mail was set up, so there's nobody to write to yet.");
    return;
  }
  const here = new Set(world.getAllPlayers().map((p) => p.id));
  const index = Math.max(
    0,
    others.findIndex((m) => m.i === draft.to),
  );
  const subjectMax = CONFIG.subjectLength;
  const bodyMax = CONFIG.bodyLength;
  const form = new ModalFormData()
    .title("§lWrite a letter")
    .dropdown(
      `${draft.problem ? `§c${draft.problem}§r\n\n` : ""}To (everyone who has joined the realm; offline players get it when they're back)`,
      others.map((m) => (here.has(m.i) ? `${m.n} §a(online)` : m.n)),
      { defaultValueIndex: index },
    )
    .textField(`Subject (up to ${subjectMax} characters)`, "Hello!", { defaultValue: draft.subject ?? "" })
    .textField(`Letter (up to ${bodyMax} characters; type \\n for a new line)`, "Write your letter here", { defaultValue: draft.body ?? "" })
    .submitButton("Send");
  const res = await show(player, form);
  if (!res || res.canceled || !res.formValues || !player.isValid) return;
  const [who, rawSubject, rawBody] = res.formValues;
  const to = others[typeof who === "number" ? who : -1];
  const subject = clean(rawSubject, subjectMax, false);
  const body = clean(rawBody, bodyMax, true);
  const again = { to: to?.i, subject: typeof rawSubject === "string" ? rawSubject : "", body: typeof rawBody === "string" ? rawBody : "" };
  if (!to) return;
  if (!body.text) return write(player, { ...again, problem: "Write something in the letter first." });
  send(player, to, subject.text || "(no subject)", body.text, subject.cut || body.cut);
}

/**
 * @param {Player} player @param {Member} to @param {string} subject @param {string} body @param {boolean} shortened
 */
function send(player, to, subject, body, shortened) {
  const wait = get("sendCooldownSeconds") * 1000 - (Date.now() - (lastSent.get(player.id) ?? 0));
  if (wait > 0) {
    player.sendMessage(`§cWait ${Math.ceil(wait / 1000)} more seconds before sending another letter.`);
    return;
  }
  if (letters().size >= MAX_LETTERS) {
    player.sendMessage("§cThe realm's mail is full. Ask players to delete old letters.");
    return;
  }
  // Make room: the oldest letters the recipient has already read go first.
  const inbox = inboxOf(to.i);
  const limit = get("inboxLimit");
  const read = inbox.filter((l) => l.r).reverse(); // oldest first
  if (inbox.length - read.length >= limit) {
    player.sendMessage(`§c${to.n}'s mailbox is full of unread letters. Try again once they've read some.`);
    return;
  }
  for (let n = inbox.length; n >= limit; n--) {
    const old = /** @type {Letter} */ (read.shift());
    save({ ...old, di: 1 });
  }

  const next = world.getDynamicProperty(PROP_NEXT);
  const id = typeof next === "number" ? next : 1;
  world.setDynamicProperty(PROP_NEXT, id + 1);
  /** @type {Letter} */
  const letter = { id, f: player.id, fn: player.name, t: to.i, tn: to.n, s: subject, b: body, at: Date.now(), r: 0, di: 0, ds: 0 };
  const keepSent = get("sentLimit");
  if (keepSent <= 0) letter.ds = 1;
  save(letter);
  lastSent.set(player.id, Date.now());

  // Sent keeps the newest sentLimit letters.
  for (const old of sentOf(player.id).slice(Math.max(0, keepSent))) save({ ...old, ds: 1 });

  player.sendMessage(`§aLetter sent to ${to.n}.${shortened ? " §7(It was shortened to fit.)" : ""}`);
  player.playSound("random.orb", { pitch: 1.4, volume: 0.6 });
  const reader = online(to.i);
  if (reader) {
    reader.sendMessage(`§eNew letter from ${player.name}: "${subject}§r§e". Read it with /realm:mail`);
    reader.playSound("random.orb", { pitch: 0.9, volume: 0.8 });
  }
}

/** @param {Player} player @param {Letter} l */
async function readLetter(player, l) {
  if (!l.r) save((l = { ...l, r: 1 }));
  const body = [`§7From:§r ${l.fn}`, `§7Sent:§r ${ago(l.at)} (${stamp(l.at)})`, "", `${l.b}§r`].join("\n");
  await menu(player, `§l${l.s}`, body, [
    { text: "Reply", run: () => write(player, { to: l.f, subject: l.s.startsWith("Re: ") ? l.s : `Re: ${l.s}`.slice(0, CONFIG.subjectLength) }) },
    {
      text: "§cDelete",
      run: () => {
        const now = letters().get(l.id);
        if (now) save({ ...now, di: 1 });
        player.onScreenDisplay.setActionBar("§7Letter deleted");
        return inbox(player);
      },
    },
    { text: "Back to inbox", run: () => inbox(player) },
  ]);
}

/** @param {Player} player */
async function inbox(player) {
  const list = inboxOf(player.id);
  const unread = list.filter((l) => !l.r).length;
  const limit = get("inboxLimit");
  const body = list.length
    ? `${list.length} of ${limit} letters, ${unread} unread. When your inbox is full, the oldest letters you've read make room for new ones.`
    : "Your inbox is empty.";
  /** @type {{ text: string, run: () => void | Promise<void> }[]} */
  const actions = list.map((l) => ({
    text: `${l.r ? "" : "§2[New] §r"}${l.s}§r\n§8from ${l.fn}, ${ago(l.at)}`,
    run: () => readLetter(player, l),
  }));
  const read = list.filter((l) => l.r);
  if (read.length) {
    actions.push({
      text: `§cDelete all read letters\n§8${read.length} letter${read.length === 1 ? "" : "s"}`,
      run: () => {
        for (const l of read) {
          const now = letters().get(l.id);
          if (now) save({ ...now, di: 1 });
        }
        player.onScreenDisplay.setActionBar(`§7Deleted ${read.length} letter${read.length === 1 ? "" : "s"}`);
      },
    });
  }
  actions.push({ text: "Back", run: () => mainMenu(player) });
  await menu(player, "§lInbox", body, actions);
}

/** @param {Player} player @param {Letter} l */
async function readSent(player, l) {
  const status = l.di ? "§7Deleted by them" : l.r ? "§aRead" : "§eNot read yet";
  const body = [`§7To:§r ${l.tn}`, `§7Sent:§r ${ago(l.at)} (${stamp(l.at)})`, `§7Status:§r ${status}`, "", `${l.b}§r`].join("\n");
  await menu(player, `§l${l.s}`, body, [
    {
      text: "§cRemove from Sent\n§8They keep their copy",
      run: () => {
        const now = letters().get(l.id);
        if (now) save({ ...now, ds: 1 });
        player.onScreenDisplay.setActionBar("§7Removed from Sent");
        return sent(player);
      },
    },
    { text: "Back to Sent", run: () => sent(player) },
  ]);
}

/** @param {Player} player */
async function sent(player) {
  const list = sentOf(player.id);
  const body = list.length ? `Your last ${list.length} letter${list.length === 1 ? "" : "s"}, newest first.` : "You haven't sent any letters yet.";
  /** @type {{ text: string, run: () => void | Promise<void> }[]} */
  const actions = list.map((l) => ({
    text: `${l.s}§r\n§8to ${l.tn}, ${ago(l.at)}, ${l.di ? "deleted" : l.r ? "read" : "not read yet"}`,
    run: () => readSent(player, l),
  }));
  actions.push({ text: "Back", run: () => mainMenu(player) });
  await menu(player, "§lSent", body, actions);
}

/** /realm:mail @param {Player} player */
async function mainMenu(player) {
  if (!members().some((m) => m.i === player.id && m.n === player.name)) remember(player);
  const n = unreadCount(player.id);
  const total = inboxOf(player.id).length;
  const body = [
    n ? `§eYou have ${n} unread letter${n === 1 ? "" : "s"}.§r` : "No unread letters.",
    "Write to anyone who has joined the realm. Letters to offline players wait for them. Letters carry words only: to send items, use the Player Mailroom build.",
  ].join("\n\n");
  await menu(player, "§lRealm Mail", body, [
    { text: `Inbox\n§8${total} letter${total === 1 ? "" : "s"}, ${n} unread`, run: () => inbox(player) },
    { text: "Write a letter", run: () => write(player) },
    { text: "Sent\n§8Letters you sent, read or not", run: () => sent(player) },
  ]);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:mail",
      description: "Realm Mail: read your inbox and write letters to any player, even offline ones",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => mainMenu(player).catch((e) => console.warn(`[mail] ${e}`)));
      return { status: CustomCommandStatus.Success };
    },
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "mail_bp");
  },
  { namespaces: ["realm"] },
);
