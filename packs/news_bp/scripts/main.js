import "./diag.js";
import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG, DEFAULTS } from "./config.js";
import { RELEASE } from "./release.js";
import { get, set } from "./settings.js";
import { onScriptEvent } from "./script-events.js";

const PROP_NEWS = "news:news"; // world: JSON { title, body }
const PROP_REVISION = "news:revision"; // world: bumped when news should be re-shown
const PROP_TIPS = "news:tips"; // world: JSON string[]
const PROP_RELEASE = "news:release"; // world: id of the generated release news (release.js) last posted
// world "news:tipSettings": JSON { enabled, intervalMinutes }, read and written through settings.js (shared with /realm:config)
/** Minecraft's text boxes keep at most this many characters: the most a tip typed in the editor can have. */
const TIP_MAX = 100;
const PROP_SEEN = "news:seen"; // player: revision last seen
const PROP_LAST_SEEN = "news:lastSeen"; // player: epoch ms, refreshed while online
const PROP_DRAFT = "news:draft"; // player: unsaved body pasted in chunks with /realm:news_add

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * @template T
 * @param {string} prop
 * @param {T} fallback
 * @returns {T}
 */
function readJson(prop, fallback) {
  const raw = world.getDynamicProperty(prop);
  if (typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** @param {string} prop @param {unknown} value */
const writeJson = (prop, value) => world.setDynamicProperty(prop, JSON.stringify(value));

/** @returns {{ title: string, body: string }} */
const getNews = () => ({ ...DEFAULTS.news, ...readJson(PROP_NEWS, {}) });

/** @type {Set<string> | undefined} the pack folders that answered the last realm:help_ping (undefined: not asked yet) */
let installedPacks;
/** @type {Set<Set<string>>} answer sets of pings still waiting */
const pongs = new Set();

/** Asks which packs are installed (each answers /realm:help's ping with its folder). */
async function askInstalled() {
  /** @type {Set<string>} */
  const got = new Set(["news_bp"]);
  pongs.add(got);
  try {
    system.sendScriptEvent("realm:help_ping", "");
    await system.waitTicks(10);
  } finally {
    pongs.delete(got);
  }
  installedPacks = got;
}

/** The default tips for the packs installed here (all of them before the first answer). */
const defaultTips = () =>
  DEFAULTS.tips
    .map((t) => (typeof t === "string" ? { text: t, pack: undefined } : t))
    .filter((t) => t && typeof t.text === "string" && t.text.trim() && (!t.pack || !installedPacks || installedPacks.has(t.pack)))
    .map((t) => t.text);

/** @returns {string[]} a copy, safe to change */
function getTips() {
  /** @type {unknown} */
  const tips = readJson(PROP_TIPS, undefined);
  return Array.isArray(tips) ? tips.filter((/** @type {unknown} */ t) => typeof t === "string" && t.trim()) : defaultTips();
}

/**
 * Read through settings.js, which checks the saved values (in news:tipSettings, shared with /realm:config).
 * @returns {{ enabled: boolean, intervalMinutes: number }}
 */
const getTipSettings = () => ({ enabled: get("tipsEnabled") === true, intervalMinutes: Number(get("tipIntervalMinutes")) || DEFAULTS.tipIntervalMinutes });

function getRevision() {
  const rev = world.getDynamicProperty(PROP_REVISION);
  return typeof rev === "number" ? rev : 0;
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

/**
 * Shows a form, retrying while the client is busy (loading, chat open, or
 * another popup such as the welcome message still on screen).
 * @template {ActionFormData | ModalFormData} F
 * @param {Player} player
 * @param {F} form
 * @param {number} maxAttempts
 * @returns {Promise<Awaited<ReturnType<F["show"]>> | undefined>} undefined if it never got shown
 */
async function show(player, form, maxAttempts = 20) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (!player.isValid) return undefined;
    const res = /** @type {any} */ (await form.show(player));
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await new Promise((r) => system.runTimeout(() => r(undefined), 20));
  }
  return undefined;
}

const escapeNewlines = (/** @type {string} */ s) => s.replaceAll("\n", "\\n");
const unescapeNewlines = (/** @type {string} */ s) => s.replaceAll("\\n", "\n");

/** Minecraft's text boxes keep at most this many characters, so the news body is edited in parts. */
const BODY_PART = 100;
const MIN_PARTS = 10;
/** Longest draft /realm:news_add builds up (100 boxes in the editor). */
const MAX_DRAFT = 10_000;

/** @param {Player} player */
function getDraft(player) {
  const draft = player.getDynamicProperty(PROP_DRAFT);
  return typeof draft === "string" ? draft : "";
}

/** @param {Player} player @param {string} draft empty = no draft */
const setDraft = (player, draft) => player.setDynamicProperty(PROP_DRAFT, draft || undefined);

/** The body in BODY_PART pieces, with room to grow: at least MIN_PARTS boxes and one empty box at the end. @param {string} text */
function splitBody(text) {
  const parts = [];
  for (let i = 0; i < text.length; i += BODY_PART) parts.push(text.slice(i, i + BODY_PART));
  while (parts.length < MIN_PARTS || parts.at(-1) !== "") parts.push("");
  return parts;
}

/** @param {Player} player @param {string} [header] */
async function showNews(player, header = "") {
  const news = getNews();
  if (!news.body.trim()) {
    player.sendMessage("§7No news right now.");
    return true;
  }
  const res = await show(
    player,
    new ActionFormData()
      .title(news.title)
      .body(header + news.body)
      .button("§lGot it"),
    90
  );
  return res !== undefined;
}

// ---------------------------------------------------------------------------
// Release news: release.js is generated from docs/NEWS.md for every bundle
// ---------------------------------------------------------------------------

/** Posts the bundle's release news once: it becomes the news and pops up for everyone. */
function applyRelease() {
  if (!CONFIG.releaseNews || !RELEASE.id || !RELEASE.body.trim()) return;
  try {
    const last = world.getDynamicProperty(PROP_RELEASE);
    if (last === RELEASE.id) return;
    if (last === undefined && getRevision() === 0 && world.getDynamicProperty(PROP_NEWS) === undefined) {
      // A new world, or the pack just added: what changed since the last update means nothing here yet. The next
      // update's news is the first to pop up.
      world.setDynamicProperty(PROP_RELEASE, RELEASE.id);
      return;
    }
    writeJson(PROP_NEWS, { title: RELEASE.title ? `§l§b${RELEASE.title}` : DEFAULTS.news.title, body: RELEASE.body });
    world.setDynamicProperty(PROP_REVISION, getRevision() + 1);
    world.setDynamicProperty(PROP_RELEASE, RELEASE.id);
  } catch (e) {
    console.warn(`[news] release: ${e}`);
  }
}
world.afterEvents.worldLoad.subscribe(() => applyRelease());

// ---------------------------------------------------------------------------
// Join: news popup + "you were away"
// ---------------------------------------------------------------------------

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  const lastSeen = player.getDynamicProperty(PROP_LAST_SEEN);
  player.setDynamicProperty(PROP_LAST_SEEN, Date.now());

  system.runTimeout(async () => {
    try {
      await onJoin(player, typeof lastSeen === "number" ? lastSeen : undefined);
    } catch (e) {
      console.warn(`[news] ${e}`);
    }
  }, CONFIG.delayTicks);
});

/** @param {Player} player @param {number | undefined} lastSeen */
async function onJoin(player, lastSeen) {
  if (!player.isValid) return; // left during the join delay
  applyRelease();
  const awayMs = lastSeen ? Date.now() - lastSeen : 0;
  const awayHours = get("awayNoticeHours");
  const away =
    awayHours > 0 && awayMs >= awayHours * 3_600_000
      ? `Welcome back! You were away ${formatDuration(awayMs)}.`
      : "";

  const revision = getRevision();
  const hasNews = getNews().body.trim() !== "";
  const unseen = hasNews && revision > 0 && player.getDynamicProperty(PROP_SEEN) !== revision;

  if (!unseen) {
    if (away) player.sendMessage(`§7${away}`);
    return;
  }

  const shown = await showNews(player, away ? `§7${away}§r\n\n` : "");
  if (!player.isValid) return;
  if (shown) player.setDynamicProperty(PROP_SEEN, revision);
  else player.sendMessage(`${away ? `§7${away}§r ` : ""}§bThere's new Realm news!§r Run §b/realm:news§r to read it.`);
}

// Keep lastSeen fresh while online (leave events can't write player data).
system.runInterval(() => {
  const now = Date.now();
  for (const p of world.getAllPlayers()) p.setDynamicProperty(PROP_LAST_SEEN, now);
}, 1200);

/** @param {number} ms */
function formatDuration(ms) {
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  return d > 0 ? `${d}d ${h % 24}h` : `${h}h`;
}

// ---------------------------------------------------------------------------
// Tips
// ---------------------------------------------------------------------------

let minutesSinceTip = 0;
let tipIndex = Math.floor(Math.random() * 1000);

system.runInterval(() => {
  const settings = getTipSettings();
  if (!settings.enabled || world.getAllPlayers().length === 0) return;
  if (++minutesSinceTip < settings.intervalMinutes) return;
  broadcastTip().catch((e) => console.warn(`[news] ${e}`));
}, 1200);

async function broadcastTip() {
  minutesSinceTip = 0;
  await askInstalled(); // packs can be added or removed while the world runs
  const tips = getTips();
  if (tips.length === 0) return;
  world.sendMessage(CONFIG.tipPrefix + tips[tipIndex++ % tips.length]);
}

// ---------------------------------------------------------------------------
// Editors (ops)
// ---------------------------------------------------------------------------

/**
 * Opens the news editor. A draft from /realm:news_add or /realm:news_body is shown instead of the
 * saved body, and kept until it's saved or discarded, so closing the editor by mistake loses nothing.
 * @param {Player} player
 */
async function editNews(player) {
  // Built again before every try: while chat is still open after /realm:news_body, /realm:news_add may grow the
  // draft, and a form built before that would show (and save) only the first part.
  let draft = "";
  /** @type {import("@minecraft/server-ui").ModalFormResponse | undefined} */
  let res;
  /** What the editor opened with, so a save changes only what this operator changed. */
  let opened = getNews();
  for (let attempt = 1; attempt <= 20 && player.isValid; attempt++) {
    const news = (opened = getNews());
    draft = getDraft(player);
    const parts = splitBody(escapeNewlines(draft || news.body));
    const form = new ModalFormData()
      .title("Edit Realm news")
      .textField("Title", DEFAULTS.news.title, { defaultValue: news.title });
    if (draft) form.label(`§eShowing your unsaved draft (${draft.length} characters), not the saved news.`);
    form.label(`§7Minecraft's text boxes take ${BODY_PART} characters each, so the body is split over ${parts.length} boxes that are joined in order, with nothing added between them. Type \\n for a new line and § for colors. All boxes empty = no news.`);
    parts.forEach((part, i) => form.textField(`Body, part ${i + 1}`, i === 0 ? "What's new..." : "", { defaultValue: part }));
    form.toggle("Pop up for everyone on their next join", { defaultValue: true });
    if (draft) form.toggle("Discard the draft instead (the saved news stays as it is)", { defaultValue: false });
    form.submitButton("Save");
    res = await show(player, form, 1);
    if (res) break;
  }
  if (!res) {
    if (player.isValid) {
      player.sendMessage(
        draft
          ? `§7Your draft is kept (${draft.length} characters).§r §b/realm:news_add§r adds more, §b/realm:news_edit§r opens it once chat is closed.`
          : "§eCouldn't open the editor. Close chat or your inventory and try again."
      );
    }
    return;
  }
  if (res.canceled || !res.formValues) {
    if (draft && player.isValid) player.sendMessage("§7Draft kept.§r §b/realm:news_add§r adds more, §b/realm:news_edit§r opens it again.");
    return;
  }
  if (!player.isValid) return;
  if (!isOp(player)) return player.sendMessage(NOT_OP); // de-opped while the editor was open

  const values = res.formValues;
  // Labels may or may not take a place in formValues: the title is the first string, the toggles the booleans.
  const strings = values.filter((v) => typeof v === "string");
  const [announce, discard] = values.filter((v) => typeof v === "boolean");
  if (draft) setDraft(player, "");
  if (discard === true) {
    player.sendMessage("§7Draft discarded.§r The news is unchanged.");
    return;
  }
  const title = typeof strings[0] === "string" && strings[0].trim() ? strings[0] : DEFAULTS.news.title;
  const body = unescapeNewlines(strings.slice(1).join(""));
  // Another operator may have saved news while this editor was open: keep what they wrote in the part this one
  // left alone (a draft is always saved: that's what this editor was for).
  const now = getNews();
  writeJson(PROP_NEWS, {
    title: title !== opened.title ? title : now.title,
    body: draft || body !== opened.body ? body : now.body,
  });
  if (announce === true) {
    world.setDynamicProperty(PROP_REVISION, getRevision() + 1);
    // Online players would otherwise only hear about it on their next join.
    if (getNews().body.trim() !== "") world.sendMessage("§bRealm news updated.§r Run §b/realm:news§r to read it.");
  }

  player.sendMessage(
    announce === true
      ? "§aNews saved.§r Everyone who hasn't read it sees it on their next join."
      : "§aNews saved quietly§r (won't pop up again for people who've seen it)."
  );
}

/** @param {Player} player */
async function tipsMenu(player) {
  if (!installedPacks) await askInstalled();
  if (!player.isValid) return;
  const tips = getTips();
  const settings = getTipSettings();
  const form = new ActionFormData()
    .title("Tips")
    .body(
      `${tips.length} tips, ${settings.enabled ? `posted every ${settings.intervalMinutes} min` : "§cposting is off§r"}.`
    )
    .button("§2+ Add a tip")
    .button("Settings")
    .button("Post the next tip now");
  for (const tip of tips) form.button(tip.length > 40 ? `${tip.slice(0, 38).replace(/§$/, "")}...` : tip);

  const res = await show(player, form);
  if (!res) {
    if (player.isValid) player.sendMessage("§eCouldn't open the editor. Close chat or your inventory and try again.");
    return;
  }
  if (res.canceled || res.selection === undefined || !player.isValid) return;
  if (!isOp(player)) return player.sendMessage(NOT_OP); // de-opped while the menu was open

  if (res.selection === 0) await editTip(player, -1);
  else if (res.selection === 1) await tipSettings(player);
  else if (res.selection === 2) await broadcastTip();
  else await editTip(player, res.selection - 3);
}

/** @param {Player} player @param {number} index -1 = new tip */
async function editTip(player, index) {
  const before = getTips()[index] ?? "";
  const form = new ModalFormData()
    .title(index < 0 ? "New tip" : "Edit tip")
    .textField(`Tip (up to ${TIP_MAX} characters)`, "Did you know...", { defaultValue: before });
  if (index >= 0) form.toggle("§cDelete this tip", { defaultValue: false });
  form.submitButton("Save");

  const res = await show(player, form);
  if (!res || res.canceled || !res.formValues) return tipsMenu(player);
  if (!player.isValid) return;
  if (!isOp(player)) return player.sendMessage(NOT_OP); // de-opped while the form was open

  const [text, remove] = res.formValues;
  // Another operator may have changed the list meanwhile: find this tip again by its text.
  const tips = getTips();
  if (index >= 0) index = tips.indexOf(before);
  if (index < 0 && before) {
    player.sendMessage("§eThat tip was changed or deleted meanwhile, so nothing was saved.");
    return tipsMenu(player);
  }
  // Save only real changes: once saved, the list wins over config.js for good.
  if (remove === true) {
    tips.splice(index, 1);
    writeJson(PROP_TIPS, tips);
  } else if (typeof text === "string" && text.trim() && text.trim() !== tips[index]) {
    if (index < 0) tips.push(text.trim());
    else tips[index] = text.trim();
    writeJson(PROP_TIPS, tips);
  }
  return tipsMenu(player);
}

/** @param {Player} player */
async function tipSettings(player) {
  const s = getTipSettings();
  const res = await show(
    player,
    new ModalFormData()
      .title("Tip settings")
      .toggle("Post tips in chat", { defaultValue: s.enabled })
      .slider("Every N minutes", 5, 120, { valueStep: 5, defaultValue: s.intervalMinutes })
      .submitButton("Save")
  );
  if (!player.isValid) return;
  if (res && !res.canceled && res.formValues) {
    if (!isOp(player)) return player.sendMessage(NOT_OP); // de-opped while the form was open
    const [enabled, interval] = res.formValues;
    // Through settings.js, so the values are checked and /realm:config shows the same.
    const errors = [set("tipsEnabled", enabled === true), typeof interval === "number" ? set("tipIntervalMinutes", interval) : undefined].filter(Boolean);
    if (errors.length) player.sendMessage(`§cNot saved: ${errors.join(", ")}`);
  }
  return tipsMenu(player);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * @param {(player: Player) => Promise<unknown>} action
 */
function playerCommand(action) {
  /** @param {import("@minecraft/server").CustomCommandOrigin} origin */
  return (origin) => {
    const player = origin.initiator ?? origin.sourceEntity;
    if (!(player instanceof Player)) {
      return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
    }
    system.run(() => action(player).catch((e) => console.warn(`[news] ${e}`)));
    return { status: CustomCommandStatus.Success };
  };
}

/**
 * /realm:news_body (append = false: a new draft, then the editor) and /realm:news_add (append to the
 * draft, no editor, so several chunks can be pasted in a row).
 * @param {boolean} append
 */
function draftCommand(append) {
  /** @param {import("@minecraft/server").CustomCommandOrigin} origin @param {unknown} text */
  return (origin, text) => {
    const player = origin.initiator ?? origin.sourceEntity;
    if (!(player instanceof Player)) {
      return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
    }
    // The command parser drops the backslash of \n, so pasted text marks new lines with | instead.
    const chunk = String(text ?? "").replaceAll("|", "\n");
    const draft = (append ? getDraft(player) : "") + chunk;
    if (draft.length > MAX_DRAFT) {
      return {
        status: CustomCommandStatus.Failure,
        message: `The draft would be ${draft.length} characters; the most is ${MAX_DRAFT}. Nothing was added.`,
      };
    }
    // Dynamic properties can't be written in this read-only callback.
    system.run(() => {
      setDraft(player, draft);
      if (!append) editNews(player).catch((e) => console.warn(`[news] ${e}`));
    });
    return {
      status: CustomCommandStatus.Success,
      message: append
        ? `Added ${chunk.length} characters; the draft has ${draft.length}. Paste the next part with /realm:news_add, or run /realm:news_edit to check and save it.`
        : `Got ${chunk.length} characters. Close chat: the editor opens with them filled in. To paste more first, use /realm:news_add, then /realm:news_edit.`,
    };
  };
}

// ---------------------------------------------------------------------------
// /realm:news: the pack's menu
// ---------------------------------------------------------------------------

const isOp = (/** @type {Player} */ player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

/** /realm:news_read: show the news. Read here, it won't pop up again on the next join. @param {Player} player */
async function readNews(player) {
  if ((await showNews(player)) && player.isValid && getNews().body.trim()) player.setDynamicProperty(PROP_SEEN, getRevision());
}

/** @param {Player} player @param {string} title @param {string} body */
async function infoPage(player, title, body) {
  const res = await show(player, new ActionFormData().title(title).body(body).button("Back"));
  if (res && !res.canceled && player.isValid) await packMenu(player);
}

/**
 * /realm:news: every action this player may use. Players who aren't operators can only read the
 * news, so they go straight to it, as before.
 * @param {Player} player
 */
async function packMenu(player) {
  /** @type {{ text: string, run: () => Promise<void> }[]} */
  const entries = [{ text: "Read the news", run: () => readNews(player) }];
  if (isOp(player)) {
    entries.push({ text: "§4Edit the news\n§8Operators", run: () => editNews(player) });
    entries.push({
      text: "§4Paste a long news body\n§8Operators",
      run: () =>
        infoPage(
          player,
          "Paste a long news body",
          `Chat takes longer text than the editor's ${BODY_PART}-character boxes. Copy the text, then in chat:\n\n§e/realm:news_body "first part"§r starts a draft and opens the editor.\n§e/realm:news_add "next part"§r adds more to the draft.\n§e/realm:news_edit§r checks and saves it.\n\nWrite | for a new line.`
        ),
    });
    entries.push({ text: `§4Chat tips\n§8Operators, ${getTips().length} tips`, run: () => tipsMenu(player) });
    entries.push({
      text: "§4Settings\n§8Operators",
      run: () =>
        infoPage(
          player,
          "Settings",
          "Operators change this pack's settings in §e/realm:config§r: pick §eRealm News & Tips§r there. Chat tips on or off, minutes between tips and the welcome back notice are all there."
        ),
    });
  }
  if (entries.length === 1) return entries[0].run();
  const form = new ActionFormData().title("§lRealm News & Tips").body(getNews().body.trim() ? `Latest: §e${getNews().title}` : "No news right now.");
  for (const e of entries) form.button(e.text);
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  if (res.selection > 0 && !isOp(player)) return player.sendMessage(NOT_OP); // every button but "Read the news" is an operator's
  await entries[res.selection]?.run();
}

const NOT_OP = "§cOnly operators can do that.";

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:news",
      description: "Realm News: read the news (operators: a menu to edit the news and chat tips too)",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    playerCommand(packMenu)
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:news_read",
      description: "Show the latest Realm news",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    playerCommand(readNews)
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:news_edit",
      description: "Edit the Realm news (operators only)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
    },
    playerCommand(editNews)
  );
  // Chat takes longer text than a form's 100-character boxes, but it has a limit of its own, so a
  // long body is pasted in chunks: /realm:news_body starts a draft, /realm:news_add adds to it.
  customCommandRegistry.registerCommand(
    {
      name: "realm:news_body",
      description: "Start the news body from text pasted in quotes, then opens the editor (operators only)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "text", type: CustomCommandParamType.String }],
    },
    draftCommand(false)
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:news_add",
      description: "Add pasted text, in quotes, to the end of your news draft (operators only)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "text", type: CustomCommandParamType.String }],
    },
    draftCommand(true)
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:news_tips",
      description: "Add, edit or delete chat tips (operators only)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
    },
    playerCommand(tipsMenu)
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
onScriptEvent(
  ["realm:help_ping", "realm:help_pong"],
  ({ id, message }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "news_bp");
    else if (id === "realm:help_pong") for (const got of pongs) got.add(message); // askInstalled
  },
);
