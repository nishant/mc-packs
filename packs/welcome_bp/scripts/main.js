import {
  CommandPermissionLevel,
  CustomCommandStatus,
  Player,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import { DEFAULTS } from "./config.js";
import { getFor } from "./settings.js";

/** @typedef {import("./config.js").WelcomeSettings} WelcomeSettings */

const PROP_SETTINGS = "welcome:settings"; // world: JSON overrides saved by /realm:welcome_edit (and /realm:config, see settings.js)
const PROP_REVISION = "welcome:revision"; // world: bumped on every save
const PROP_SEEN = "welcome:seen"; // player: revision they last saw

// The client rejects forms while it's still loading, or has chat/inventory open
// (UserBusy). Keep retrying for ~30s before giving up.
const RETRY_INTERVAL_TICKS = 20;
const MAX_ATTEMPTS = 30;

// ---------------------------------------------------------------------------
// Settings storage
// ---------------------------------------------------------------------------

/** @returns {WelcomeSettings} */
function getSettings() {
  const raw = world.getDynamicProperty(PROP_SETTINGS);
  if (typeof raw !== "string") return { ...DEFAULTS };
  try {
    const saved = JSON.parse(raw);
    const s = { ...DEFAULTS, ...(saved && typeof saved === "object" ? saved : {}) };
    // A value of the wrong type (a hand-edited or corrupt property) falls back to its default.
    for (const key of /** @type {(keyof WelcomeSettings)[]} */ (Object.keys(DEFAULTS))) {
      if (typeof s[key] !== typeof DEFAULTS[key]) /** @type {any} */ (s)[key] = DEFAULTS[key];
    }
    return s;
  } catch {
    console.warn("[welcome] Saved settings are corrupt, using defaults.");
    return { ...DEFAULTS };
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

  const form = new ActionFormData()
    .title(fillPlaceholders(settings.title, player))
    .body(fillPlaceholders(settings.body, player))
    .button(settings.button);

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
  const settings = getSettings();
  const revision = getRevision();

  if (!force && settings.showOnce && player.getDynamicProperty(PROP_SEEN) === revision) return;

  if (settings.chat) {
    player.sendMessage(
      `${fillPlaceholders(settings.title, player)}§r\n${fillPlaceholders(settings.body, player)}`
    );
  }
  if (settings.screenTitle) {
    player.onScreenDisplay.setTitle(fillPlaceholders(settings.title, player), {
      fadeInDuration: 10,
      stayDuration: 60,
      fadeOutDuration: 20,
    });
  }

  const seen = await showPopup(player, settings);
  if (seen && player.isValid) player.setDynamicProperty(PROP_SEEN, revision);
}

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  // initialSpawn is true when the player joins, false on respawn after death.
  if (!initialSpawn) return;
  if (getFor(player, "popup") === false) return; // turned off in /realm:prefs; /realm:welcome still shows it
  system.runTimeout(() => {
    welcome(player).catch((e) => console.warn(`[welcome] ${e}`));
  }, DEFAULTS.delayTicks); // not editable in game, so always config.js's
});

// ---------------------------------------------------------------------------
// In-game editor
// ---------------------------------------------------------------------------

/**
 * Shows a form, retrying while the client is busy (chat still closing, inventory open).
 * @template {ModalFormData | MessageFormData} F
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
  const s = getSettings();
  const parts = splitBody(escapeNewlines(s.body));

  const form = new ModalFormData()
    .title("Edit welcome message")
    .textField("Title", DEFAULTS.title, { defaultValue: s.title })
    .label(
      `§7Minecraft's text boxes take ${BODY_PART} characters each, so the body is split over ${parts.length} boxes that are joined in order, with nothing added between them. Type \\n for a new line, {player} for the player's name, {online} for how many are online, and § for colors. All boxes empty = the default text.`
    );
  parts.forEach((part, i) => form.textField(`Body, part ${i + 1}`, i === 0 ? "Message..." : "", { defaultValue: part }));
  form
    .textField("Button text", DEFAULTS.button, { defaultValue: s.button })
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

  // Labels may or may not take a place in formValues: the text boxes are the strings, in order, and the switches the booleans.
  const strings = response.formValues.filter((v) => typeof v === "string");
  const [showOnce, chat, screenTitle, reshow] = response.formValues.filter((v) => typeof v === "boolean");
  const title = strings[0];
  const body = strings.slice(1, -1).join("");
  const button = strings.at(-1);
  const str = (/** @type {unknown} */ v, /** @type {string} */ fallback) =>
    typeof v === "string" && v.trim() !== "" ? v : fallback;

  saveSettings(
    {
      title: str(title, DEFAULTS.title),
      body: unescapeNewlines(str(body, escapeNewlines(DEFAULTS.body))),
      button: str(button, DEFAULTS.button),
      showOnce: showOnce === true,
      chat: chat === true,
      screenTitle: screenTitle === true,
    },
    reshow !== false
  );
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

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:welcome",
      description: "Show the welcome message to yourself",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    playerCommand((player) => welcome(player, { force: true }))
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
    playerCommand(async (player) => {
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
      saveSettings(undefined);
      player.sendMessage("§aWelcome message reset to the pack defaults.");
    })
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "welcome_bp");
  },
  { namespaces: ["realm"] }
);
