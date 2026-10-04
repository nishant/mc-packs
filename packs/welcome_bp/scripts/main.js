import {
  CommandPermissionLevel,
  CustomCommandStatus,
  Player,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { DEFAULTS } from "./config.js";

/** @typedef {import("./config.js").WelcomeSettings} WelcomeSettings */

const PROP_SETTINGS = "welcome:settings"; // world: JSON overrides saved by /welcome:edit
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
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    console.warn("[welcome] Saved settings are corrupt, using defaults.");
    return { ...DEFAULTS };
  }
}

/** @param {Partial<WelcomeSettings> | undefined} overrides */
function saveSettings(overrides) {
  world.setDynamicProperty(PROP_SETTINGS, overrides ? JSON.stringify(overrides) : undefined);
  world.setDynamicProperty(PROP_REVISION, getRevision() + 1);
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
  system.runTimeout(() => {
    welcome(player).catch((e) => console.warn(`[welcome] ${e}`));
  }, getSettings().delayTicks);
});

// ---------------------------------------------------------------------------
// In-game editor
// ---------------------------------------------------------------------------

/**
 * Shows a form, retrying while the client is busy (chat still closing, inventory open).
 * @param {Player} player
 * @param {ModalFormData} form
 * @returns {Promise<import("@minecraft/server-ui").ModalFormResponse | undefined>} undefined if it never got shown
 */
async function showForm(player, form, maxAttempts = 20) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await new Promise((r) => system.runTimeout(() => r(undefined), RETRY_INTERVAL_TICKS));
  }
  return undefined;
}

/** Text fields are single-line, so real newlines are shown as a literal "\n". */
const escapeNewlines = (/** @type {string} */ s) => s.replaceAll("\n", "\\n");
const unescapeNewlines = (/** @type {string} */ s) => s.replaceAll("\\n", "\n");

/** @param {Player} player */
async function openEditor(player) {
  const s = getSettings();

  const form = new ModalFormData()
    .title("Edit welcome message")
    .textField("Title", DEFAULTS.title, { defaultValue: s.title })
    .textField("Body  (\\n = new line, {player}, {online}, § colours)", "Message…", {
      defaultValue: escapeNewlines(s.body),
    })
    .textField("Button text", DEFAULTS.button, { defaultValue: s.button })
    .toggle("Show only once per player (re-shows after each edit)", { defaultValue: s.showOnce })
    .toggle("Also post in chat", { defaultValue: s.chat })
    .toggle("Also flash big on-screen title", { defaultValue: s.screenTitle })
    .submitButton("Save");

  const response = await showForm(player, form);
  if (!response) {
    if (player.isValid) player.sendMessage("§eCouldn't open the editor. Close chat or your inventory and try again.");
    return;
  }
  if (response.canceled || !response.formValues) return;

  const [title, body, button, showOnce, chat, screenTitle] = response.formValues;
  const str = (/** @type {unknown} */ v, /** @type {string} */ fallback) =>
    typeof v === "string" && v.trim() !== "" ? v : fallback;

  saveSettings({
    title: str(title, DEFAULTS.title),
    body: unescapeNewlines(str(body, DEFAULTS.body)),
    button: str(button, DEFAULTS.button),
    showOnce: showOnce === true,
    chat: chat === true,
    screenTitle: screenTitle === true,
    delayTicks: s.delayTicks,
  });
  player.sendMessage("§aWelcome message saved.§r Run §b/welcome:show§r to preview it.");
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
      name: "welcome:show",
      description: "Show the welcome message to yourself",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    playerCommand((player) => welcome(player, { force: true }))
  );

  customCommandRegistry.registerCommand(
    {
      name: "welcome:edit",
      description: "Edit the welcome message (operators only)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
    },
    playerCommand(openEditor)
  );

  customCommandRegistry.registerCommand(
    {
      name: "welcome:reset",
      description: "Reset the welcome message to the pack defaults (operators only)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
    },
    playerCommand((player) => {
      saveSettings(undefined);
      player.sendMessage("§aWelcome message reset to the pack defaults.");
    })
  );
});
