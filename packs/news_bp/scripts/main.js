import { CommandPermissionLevel, CustomCommandStatus, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG, DEFAULTS } from "./config.js";

const PROP_NEWS = "news:news"; // world: JSON { title, body }
const PROP_REVISION = "news:revision"; // world: bumped when news should be re-shown
const PROP_TIPS = "news:tips"; // world: JSON string[]
const PROP_TIP_SETTINGS = "news:tipSettings"; // world: JSON { enabled, intervalMinutes }
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
  const awayMs = lastSeen ? Date.now() - lastSeen : 0;
  const away =
    CONFIG.awayNoticeHours > 0 && awayMs >= CONFIG.awayNoticeHours * 3_600_000
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
  else player.sendMessage("§b📰 There's new Realm news!§r Run §b/news:show§r to read it.");
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
  const res = await show(
    player,
    new ModalFormData()
      .title("Edit Realm news")
      .textField("Title", DEFAULTS.news.title, { defaultValue: news.title })
      .textField("Body  (\\n = new line, § colours; empty = no news)", "What's new…", {
        defaultValue: escapeNewlines(news.body),
      })
      .toggle("Pop up for everyone on their next join", { defaultValue: true })
      .submitButton("Save")
  );
  if (!res || res.canceled || !res.formValues) return;

  const [title, body, announce] = res.formValues;
  writeJson(PROP_NEWS, {
    title: typeof title === "string" && title.trim() ? title : DEFAULTS.news.title,
    body: typeof body === "string" ? unescapeNewlines(body) : "",
  });
  if (announce === true) world.setDynamicProperty(PROP_REVISION, getRevision() + 1);

  player.sendMessage(
    announce === true
      ? "§aNews saved.§r Everyone sees it on their next join. Online players: §b/news:show§r."
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
  for (const tip of tips) form.button(tip.length > 40 ? `${tip.slice(0, 38)}…` : tip);

  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined) return;

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
    .textField("Tip", "Did you know…", { defaultValue: index < 0 ? "" : tips[index] });
  if (index >= 0) form.toggle("§cDelete this tip", { defaultValue: false });
  form.submitButton("Save");

  const res = await show(player, form);
  if (!res || res.canceled || !res.formValues) return tipsMenu(player);

  const [text, remove] = res.formValues;
  if (remove === true) tips.splice(index, 1);
  else if (typeof text === "string" && text.trim()) {
    if (index < 0) tips.push(text.trim());
    else tips[index] = text.trim();
  }
  writeJson(PROP_TIPS, tips);
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
      name: "news:show",
      description: "Show the latest Realm news",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    playerCommand((player) => showNews(player))
  );
  customCommandRegistry.registerCommand(
    {
      name: "news:edit",
      description: "Edit the Realm news (operators only)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
    },
    playerCommand(editNews)
  );
  customCommandRegistry.registerCommand(
    {
      name: "news:tips",
      description: "Add, edit or delete chat tips (operators only)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
    },
    playerCommand(tipsMenu)
  );
});
