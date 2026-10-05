import { CommandPermissionLevel, CustomCommandStatus, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG, DEFAULTS } from "./config.js";
import { get } from "./settings.js";

const PROP_NEWS = "news:news"; // world: JSON { title, body }
const PROP_REVISION = "news:revision"; // world: bumped when news should be re-shown
const PROP_TIPS = "news:tips"; // world: JSON string[]
const PROP_TIP_SETTINGS = "news:tipSettings"; // world: JSON { enabled, intervalMinutes }, also set in /realm:config (settings.js)
const PROP_SEEN = "news:seen"; // player: revision last seen
const PROP_LAST_SEEN = "news:lastSeen"; // player: epoch ms, refreshed while online

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

/** @returns {string[]} */
const getTips = () => readJson(PROP_TIPS, DEFAULTS.tips);

/** @returns {{ enabled: boolean, intervalMinutes: number }} */
const getTipSettings = () => ({
  enabled: DEFAULTS.tipsEnabled,
  intervalMinutes: DEFAULTS.tipIntervalMinutes,
  ...readJson(PROP_TIP_SETTINGS, {}),
});

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
  broadcastTip();
}, 1200);

function broadcastTip() {
  minutesSinceTip = 0;
  const tips = getTips();
  if (tips.length === 0) return;
  world.sendMessage(CONFIG.tipPrefix + tips[tipIndex++ % tips.length]);
}

// ---------------------------------------------------------------------------
// Editors (ops)
// ---------------------------------------------------------------------------

/** @param {Player} player */
async function editNews(player) {
  const news = getNews();
  const parts = splitBody(escapeNewlines(news.body));
  const form = new ModalFormData()
    .title("Edit Realm news")
    .textField("Title", DEFAULTS.news.title, { defaultValue: news.title })
    .label(`§7Minecraft's text boxes take ${BODY_PART} characters each, so the body is split over ${parts.length} boxes that are joined in order, with nothing added between them. Type \\n for a new line and § for colors. All boxes empty = no news.`);
  parts.forEach((part, i) => form.textField(`Body, part ${i + 1}`, i === 0 ? "What's new..." : "", { defaultValue: part }));
  form.toggle("Pop up for everyone on their next join", { defaultValue: true }).submitButton("Save");
  const res = await show(player, form);
  if (!res) {
    if (player.isValid) player.sendMessage("§eCouldn't open the editor. Close chat or your inventory and try again.");
    return;
  }
  if (res.canceled || !res.formValues) return;

  const values = res.formValues;
  // Labels may or may not take a place in formValues: the title is the first string, the toggle the last value.
  const strings = values.filter((v) => typeof v === "string");
  const title = strings[0];
  const body = strings.slice(1).join("");
  const announce = values.at(-1);
  writeJson(PROP_NEWS, {
    title: typeof title === "string" && title.trim() ? title : DEFAULTS.news.title,
    body: typeof body === "string" ? unescapeNewlines(body) : "",
  });
  const hasBody = typeof body === "string" && body.trim() !== "";
  if (announce === true) {
    world.setDynamicProperty(PROP_REVISION, getRevision() + 1);
    // Online players would otherwise only hear about it on their next join.
    if (hasBody) world.sendMessage("§bRealm news updated.§r Run §b/realm:news§r to read it.");
  }

  player.sendMessage(
    announce === true
      ? "§aNews saved.§r Everyone who hasn't read it sees it on their next join."
      : "§aNews saved quietly§r (won't pop up again for people who've seen it)."
  );
}

/** @param {Player} player */
async function tipsMenu(player) {
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
  if (res.canceled || res.selection === undefined) return;

  if (res.selection === 0) await editTip(player, -1);
  else if (res.selection === 1) await tipSettings(player);
  else if (res.selection === 2) broadcastTip();
  else await editTip(player, res.selection - 3);
}

/** @param {Player} player @param {number} index -1 = new tip */
async function editTip(player, index) {
  const tips = getTips();
  const form = new ModalFormData()
    .title(index < 0 ? "New tip" : "Edit tip")
    .textField("Tip", "Did you know...", { defaultValue: index < 0 ? "" : tips[index] });
  if (index >= 0) form.toggle("§cDelete this tip", { defaultValue: false });
  form.submitButton("Save");

  const res = await show(player, form);
  if (!res || res.canceled || !res.formValues) return tipsMenu(player);

  const [text, remove] = res.formValues;
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
  if (res && !res.canceled && res.formValues) {
    const [enabled, interval] = res.formValues;
    writeJson(PROP_TIP_SETTINGS, {
      enabled: enabled === true,
      intervalMinutes: typeof interval === "number" ? interval : s.intervalMinutes,
    });
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

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:news",
      description: "Show the latest Realm news",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    playerCommand(async (player) => {
      // Read it here, and it won't pop up again on the next join.
      if ((await showNews(player)) && player.isValid && getNews().body.trim()) player.setDynamicProperty(PROP_SEEN, getRevision());
    })
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
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "news_bp");
  },
  { namespaces: ["realm"] }
);
