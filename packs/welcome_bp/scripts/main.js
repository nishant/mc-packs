import "./diag.js";
import {
  CommandPermissionLevel,
  CustomCommandStatus,
  Player,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import { DEFAULTS, GENERIC, LEGACY_REALM } from "./config.js";
import { getFor } from "./settings.js";
import { onScriptEvent } from "./script-events.js";

/** @typedef {import("./config.js").WelcomeSettings} WelcomeSettings */

const PROP_SETTINGS = "welcome:settings"; // world: JSON overrides saved by /realm:welcome_edit (and /realm:config, see settings.js)
const PROP_REVISION = "welcome:revision"; // world: bumped on every save
const PROP_SEEN = "welcome:seen"; // player: revision they last saw
const PROP_MIGRATED = "welcome:migrated"; // world: 1 once the Realm's old saved welcome has been moved to the default

// The client rejects forms while it's still loading, or has chat/inventory open
// (UserBusy). Keep retrying for ~30s before giving up.
const RETRY_INTERVAL_TICKS = 20;
const MAX_ATTEMPTS = 30;

// ---------------------------------------------------------------------------
// One-time move of the Realm's old saved welcome to the default
// ---------------------------------------------------------------------------

const stripCodes = (/** @type {string} */ s) => s.replace(/§./g, "");

/**
 * Once per world (welcome:migrated): the Realm's old saved welcome (the Old Tobin and Mara text with house rules)
 * is dropped so the default shows. Only a saved body with LEGACY_REALM.sentence goes, plus its title and button
 * when they are still the old built-in ones; every other saved field, and every other saved text, stays. A welcome
 * saved after this runs is never touched.
 */
function migrate() {
  if (world.getDynamicProperty(PROP_MIGRATED) === 1) return;
  const raw = world.getDynamicProperty(PROP_SETTINGS);
  if (typeof raw === "string") {
    let saved;
    try {
      saved = JSON.parse(raw);
    } catch {
      saved = undefined;
    }
    if (saved && typeof saved === "object" && !Array.isArray(saved) && typeof saved.body === "string" && stripCodes(saved.body).includes(LEGACY_REALM.sentence)) {
      delete saved.body;
      if (saved.title === LEGACY_REALM.title) delete saved.title;
      if (saved.button === LEGACY_REALM.button) delete saved.button;
      saveSettings(Object.keys(saved).length ? saved : undefined);
    }
  }
  world.setDynamicProperty(PROP_MIGRATED, 1);
}

world.afterEvents.worldLoad.subscribe(() => {
  migrate();
});
/** @type {Set<string>} the pack folders that answered the last realm:help_ping */
let installed = new Set(["welcome_bp"]);
let askedAt = -Infinity;
/** @type {Set<Set<string>>} answer sets of pings still waiting */
const pongs = new Set();

/** @type {Promise<void> | undefined} the ping in flight: a join during it waits for the same answer */
let asking;

/** Asks which packs are installed (each answers /realm:help's ping with its folder), at most once a minute. */
function askInstalled() {
  if (asking) return asking;
  if (system.currentTick - askedAt < 1200) return Promise.resolve();
  askedAt = system.currentTick;
  asking = (async () => {
    /** @type {Set<string>} */
    const got = new Set(["welcome_bp"]);
    pongs.add(got);
    try {
      system.sendScriptEvent("realm:help_ping", "");
      await system.waitTicks(10);
      installed = got;
    } finally {
      pongs.delete(got);
      asking = undefined;
    }
  })();
  return asking;
}

onScriptEvent(
  "realm:help_pong",
  ({ id, message }) => {
    if (id !== "realm:help_pong") return;
    for (const set of pongs) set.add(String(message));
  },
);

/**
 * The default welcome, the same in every world: the world, what the installed packs add, where to go next.
 * @returns {{ heading: string, paragraphs: string[] }[]}
 */
function defaultSections() {
  const intro = [GENERIC.greeting];
  if (installed.has("saga_bp")) {
    intro.push(GENERIC.story);
    if (installed.has("npc_bp")) intro.push(GENERIC.storyStart);
  } else intro.push(GENERIC.noStory);
  const features = Object.keys(GENERIC.lines)
    .filter((pack) => installed.has(pack))
    .map((pack) => `§7-§r ${GENERIC.lines[pack]}`);
  const next = Object.keys(GENERIC.next)
    .filter((pack) => installed.has(pack))
    .map((pack) => GENERIC.next[pack]);
  next.push(GENERIC.operators);
  return [
    { heading: GENERIC.heading.world, paragraphs: intro },
    ...(features.length ? [{ heading: GENERIC.heading.features, paragraphs: [features.join("\n")] }] : []),
    { heading: GENERIC.heading.next, paragraphs: [next.join("\n")] },
  ];
}

/** The default as one text, for the chat copy and the editor. */
function defaultBody() {
  return defaultSections()
    .map((s) => `§l§6${s.heading}§r\n${s.paragraphs.join("\n\n")}`)
    .join("\n\n");
}

/** The defaults this world falls back to: config.js's, with the title and the body built from the installed packs. @returns {WelcomeSettings} */
function effectiveDefaults() {
  return { ...DEFAULTS, body: defaultBody() };
}

// ---------------------------------------------------------------------------
// Settings storage
// ---------------------------------------------------------------------------

/** @returns {WelcomeSettings} */
function getSettings() {
  const base = effectiveDefaults();
  const raw = world.getDynamicProperty(PROP_SETTINGS);
  if (typeof raw !== "string") return base;
  try {
    const saved = JSON.parse(raw);
    const s = { ...base, ...(saved && typeof saved === "object" ? saved : {}) };
    // A value of the wrong type (a hand-edited or corrupt property) falls back to its default.
    for (const key of /** @type {(keyof WelcomeSettings)[]} */ (Object.keys(DEFAULTS))) {
      if (typeof s[key] !== typeof DEFAULTS[key]) /** @type {any} */ (s)[key] = base[key];
    }
    return s;
  } catch {
    console.warn("[welcome] Saved settings are corrupt, using defaults.");
    return base;
  }
}

/** What operators saved, without the defaults filled in. @returns {Partial<WelcomeSettings>} */
function savedOverrides() {
  const raw = world.getDynamicProperty(PROP_SETTINGS);
  try {
    const saved = typeof raw === "string" ? JSON.parse(raw) : {};
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

/**
 * @param {Partial<WelcomeSettings> | undefined} overrides
 * @param {boolean} [reshow] count it as a new revision, so "show once" shows it to everyone again
 */
function saveSettings(overrides, reshow = true) {
  world.setDynamicProperty(PROP_SETTINGS, overrides ? JSON.stringify(overrides) : undefined);
  if (reshow) world.setDynamicProperty(PROP_REVISION, getRevision() + 1);
}

function getRevision() {
  const rev = world.getDynamicProperty(PROP_REVISION);
  return typeof rev === "number" ? rev : 0;
}

// ---------------------------------------------------------------------------
// Showing the welcome message
// ---------------------------------------------------------------------------

/**
 * @param {string} text
 * @param {Player} player
 */
function fillPlaceholders(text, player) {
  return text
    .replaceAll("{player}", player.name)
    .replaceAll("{online}", String(world.getAllPlayers().length));
}

/**
 * Shows the popup, retrying while the client is busy (loading screen, chat open, …).
 * @param {Player} player
 * @param {WelcomeSettings} settings
 * @param {number} [attempt]
 * @returns {Promise<boolean>} true if the player actually saw it
 */
async function showPopup(player, settings, attempt = 1) {
  if (!player.isValid) return false;

  const form = new ActionFormData().title(fillPlaceholders(settings.title, player));
  if (typeof savedOverrides().body === "string") form.body(fillPlaceholders(settings.body, player));
  else {
    // The default: one scrolling form, a bold gold label for each section and a label for each paragraph.
    for (const s of defaultSections()) {
      form.label(`§l§6${s.heading}`);
      for (const text of s.paragraphs) form.label(fillPlaceholders(text, player));
    }
  }
  form.button(settings.button);

  const response = await form.show(player);

  if (response.canceled && response.cancelationReason === FormCancelationReason.UserBusy) {
    if (attempt >= MAX_ATTEMPTS) return false;
    return new Promise((resolve) => {
      system.runTimeout(() => {
        showPopup(player, settings, attempt + 1).then(resolve, () => resolve(false));
      }, RETRY_INTERVAL_TICKS);
    });
  }
  return true;
}

/**
 * @param {Player} player
 * @param {{ force?: boolean }} [opts] force = ignore showOnce (used for previews)
 */
async function welcome(player, { force = false } = {}) {
  if (!player.isValid) return; // left during the join delay
  migrate();
  if (typeof savedOverrides().body !== "string") await askInstalled();
  if (!player.isValid) return;
  const settings = getSettings();
  const revision = getRevision();

  if (!force && settings.showOnce && player.getDynamicProperty(PROP_SEEN) === revision) return;

  if (settings.chat) {
    player.sendMessage(
      `${fillPlaceholders(settings.title, player)}§r\n${fillPlaceholders(settings.body, player)}`
    );
  }
  if (settings.screenTitle) {
    system.sendScriptEvent("realm:title", JSON.stringify({ player: player.id, ticks: 90, from: "welcome_bp" }));
    player.onScreenDisplay.setTitle(fillPlaceholders(settings.title, player), {
      subtitle: " ",
      fadeInDuration: 10,
      stayDuration: 60,
      fadeOutDuration: 20,
    });
  }

  // The popup alone is each player's to turn off (/realm:prefs): the chat welcome and the title still come.
  const popup = force || getFor(player, "popup") !== false;
  const seen = popup ? await showPopup(player, settings) : true;
  if (seen && player.isValid) player.setDynamicProperty(PROP_SEEN, revision);
}

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  // initialSpawn is true when the player joins, false on respawn after death.
  if (!initialSpawn) return;
  system.runTimeout(() => {
    welcome(player).catch((e) => console.warn(`[welcome] ${e}`));
  }, DEFAULTS.delayTicks); // not editable in game, so always config.js's
});

// ---------------------------------------------------------------------------
// In-game editor
// ---------------------------------------------------------------------------

/**
 * Shows a form, retrying while the client is busy (chat still closing, inventory open).
 * @template {ActionFormData | ModalFormData | MessageFormData} F
 * @param {Player} player
 * @param {F} form
 * @returns {Promise<Awaited<ReturnType<F["show"]>> | undefined>} undefined if it never got shown
 */
async function showForm(player, form, maxAttempts = 20) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (!player.isValid) return undefined;
    const res = /** @type {any} */ (await form.show(player));
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await new Promise((r) => system.runTimeout(() => r(undefined), RETRY_INTERVAL_TICKS));
  }
  return undefined;
}

/** Text fields are single-line, so real newlines are shown as a literal "\n". */
const escapeNewlines = (/** @type {string} */ s) => s.replaceAll("\n", "\\n");
const unescapeNewlines = (/** @type {string} */ s) => s.replaceAll("\\n", "\n");

/** Minecraft's text boxes keep at most this many characters, so the body is edited in parts (as in the news editor). */
const BODY_PART = 100;
const MIN_PARTS = 4;

/** The body in BODY_PART pieces, with room to grow: at least MIN_PARTS boxes and one empty box at the end. @param {string} text */
function splitBody(text) {
  const parts = [];
  for (let i = 0; i < text.length; i += BODY_PART) parts.push(text.slice(i, i + BODY_PART));
  while (parts.length < MIN_PARTS || parts.at(-1) !== "") parts.push("");
  return parts;
}

/** @param {Player} player */
async function openEditor(player) {
  migrate();
  await askInstalled();
  if (!player.isValid) return;
  const DEF = effectiveDefaults();
  const s = getSettings();
  const parts = splitBody(escapeNewlines(s.body));

  const form = new ModalFormData()
    .title("Edit welcome message")
    .textField("Title", DEF.title, { defaultValue: s.title })
    .label(
      `§7Minecraft's text boxes take ${BODY_PART} characters each, so the body is split over ${parts.length} boxes that are joined in order, with nothing added between them. Type \\n for a new line, {player} for the player's name, {online} for how many are online, and § for colors. All boxes empty = the default text.`
    );
  parts.forEach((part, i) => form.textField(`Body, part ${i + 1}`, i === 0 ? "Message..." : "", { defaultValue: part }));
  form
    .textField("Button text", DEF.button, { defaultValue: s.button })
    .toggle("Show only once per player (re-shows after each edit)", { defaultValue: s.showOnce })
    .toggle("Also post in chat", { defaultValue: s.chat })
    .toggle("Also flash big on-screen title", { defaultValue: s.screenTitle })
    .toggle("Show it again to players who've seen it (turn off for a typo fix)", { defaultValue: true })
    .submitButton("Save");

  const response = await showForm(player, form);
  if (!response) {
    if (player.isValid) player.sendMessage("§eCouldn't open the editor. Close chat or your inventory and try again.");
    return;
  }
  if (response.canceled || !response.formValues || !player.isValid) return;
  if (!isOp(player)) return player.sendMessage(NOT_OP); // de-opped while the editor was open

  // Labels may or may not take a place in formValues: the text boxes are the strings, in order, and the switches the booleans.
  const strings = response.formValues.filter((v) => typeof v === "string");
  const [showOnce, chat, screenTitle, reshow] = response.formValues.filter((v) => typeof v === "boolean");
  const title = strings[0];
  const body = strings.slice(1, -1).join("");
  // The saved settings must stay under the 32 KB a world property holds (with room for the rest).
  if (typeof body === "string" && body.length > 20000)
    return player.sendMessage(`§cNot saved: the body has ${body.length} characters, more than 20000. Shorten it and save again.`);
  const button = strings.at(-1);
  const str = (/** @type {unknown} */ v, /** @type {string} */ fallback) =>
    typeof v === "string" && v.trim() !== "" ? v : fallback;

  /** @type {WelcomeSettings} */
  const edited = {
    ...s,
    title: str(title, DEF.title),
    body: unescapeNewlines(str(body, escapeNewlines(DEF.body))),
    button: str(button, DEF.button),
    showOnce: showOnce === true,
    chat: chat === true,
    screenTitle: screenTitle === true,
  };
  // Only what this operator changed: another operator's save, or a switch flipped in /realm:config, while this
  // editor was open stays (the editor opened with the values of then).
  const now = savedOverrides();
  for (const key of /** @type {(keyof WelcomeSettings)[]} */ (Object.keys(edited))) {
    if (edited[key] === s[key]) continue;
    if (edited[key] === DEF[key]) delete now[key]; // back to the defaults: a later change there applies
    else /** @type {any} */ (now)[key] = edited[key];
  }
  saveSettings(Object.keys(now).length ? now : undefined, reshow !== false);
  player.sendMessage(
    `§aWelcome message saved${reshow === false ? " quietly" : ""}.§r Run §b/realm:welcome§r to preview it.`
  );
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Command callbacks run in a restricted context where forms and world writes
 * aren't allowed, so the real work is deferred with system.run.
 * @param {(player: Player) => void | Promise<void>} action
 */
function playerCommand(action) {
  /** @param {import("@minecraft/server").CustomCommandOrigin} origin */
  return (origin) => {
    const player = origin.initiator ?? origin.sourceEntity;
    if (!(player instanceof Player)) {
      return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
    }
    system.run(async () => {
      try {
        await action(player);
      } catch (e) {
        console.warn(`[welcome] ${e}`);
      }
    });
    return { status: CustomCommandStatus.Success };
  };
}

/** /realm:welcome_show: the welcome message, even if this player has seen it. @param {Player} player */
const showWelcome = (player) => welcome(player, { force: true });

/** /realm:welcome_reset: back to the pack's defaults, after a confirmation. @param {Player} player */
async function resetWelcome(player) {
  // One mistyped command would otherwise throw away the edited text for good.
  const res = await showForm(
    player,
    new MessageFormData()
      .title("Reset the welcome message?")
      .body("This throws away the edited title, body, button and switches, and goes back to the pack's defaults. There's no undo.")
      .button1("§cReset")
      .button2("Keep it")
  );
  if (!res || res.canceled || res.selection !== 0 || !player.isValid) {
    if (player.isValid) player.sendMessage("§7Welcome message kept.");
    return;
  }
  if (!isOp(player)) return player.sendMessage(NOT_OP); // de-opped while the form was open
  saveSettings(undefined);
  player.sendMessage("§aWelcome message reset to the pack defaults.");
}

const isOp = (/** @type {Player} */ player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

/** @param {Player} player */
async function settingsInfo(player) {
  const res = await showForm(
    player,
    new ActionFormData()
      .title("Settings")
      .body("Operators change this pack's settings in §e/realm:config§r: pick §eWelcome Message§r there. The popup, chat and on-screen title switches are there too.")
      .button("Back")
  );
  if (res && !res.canceled && player.isValid) await packMenu(player);
}

/**
 * /realm:welcome: every action this player may use. Players who aren't operators can only see the
 * message, so they go straight to it, as before.
 * @param {Player} player
 */
async function packMenu(player) {
  /** @type {{ text: string, run: () => Promise<void> }[]} */
  const entries = [{ text: "Show the welcome message", run: () => showWelcome(player) }];
  if (isOp(player)) {
    entries.push({ text: "§4Edit the welcome message\n§8Operators", run: () => openEditor(player) });
    entries.push({ text: "§4Reset to the defaults\n§8Operators", run: () => resetWelcome(player) });
    entries.push({ text: "§4Settings\n§8Operators", run: () => settingsInfo(player) });
  }
  if (entries.length === 1) return entries[0].run();
  const form = new ActionFormData().title("§lWelcome Message").body("The message new players see when they join.");
  for (const e of entries) form.button(e.text);
  const res = await showForm(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  if (res.selection > 0 && !isOp(player)) return player.sendMessage(NOT_OP); // every button but the first is an operator's
  await entries[res.selection]?.run();
}

const NOT_OP = "§cOnly operators can do that.";

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:welcome",
      description: "Welcome Message: see the welcome message (operators: a menu to edit or reset it too)",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    playerCommand(packMenu)
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:welcome_show",
      description: "Show the welcome message to yourself",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    playerCommand(showWelcome)
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:welcome_edit",
      description: "Edit the welcome message (operators only)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
    },
    playerCommand(openEditor)
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:welcome_reset",
      description: "Reset the welcome message to the pack defaults (operators only)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
    },
    playerCommand(resetWelcome)
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
onScriptEvent(
  "realm:help_ping",
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "welcome_bp");
  },
);
