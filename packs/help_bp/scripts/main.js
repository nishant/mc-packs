import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { PACKS } from "./catalog.js";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

/** @typedef {typeof PACKS[number]} Pack */

const SELF = "help_bp";
const ALL = "all";

// ---------------------------------------------------------------------------
// Which packs are installed: each one answers "realm:help_ping" with its folder
// ---------------------------------------------------------------------------

/** @type {Set<Set<string>>} the answer sets of pings still waiting */
const waiting = new Set();

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id === "realm:help_pong") for (const answers of waiting) answers.add(message);
  },
  { namespaces: ["realm"] }
);

/** @returns {Promise<Pack[]>} the installed packs, in docs order */
async function installed() {
  const answers = new Set([SELF]);
  waiting.add(answers);
  try {
    system.sendScriptEvent("realm:help_ping", "");
    await system.waitTicks(CONFIG.answerTicks);
  } finally {
    waiting.delete(answers);
  }
  return PACKS.filter((p) => answers.has(p.folder));
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/**
 * Shows a form, retrying while the player still has chat or another screen open.
 * @param {Player} player @param {ActionFormData} form
 * @returns {Promise<import("@minecraft/server-ui").ActionFormResponse | undefined>} undefined if it never got shown
 */
async function show(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await system.waitTicks(20);
  }
  if (player.isValid) player.sendMessage("§eCouldn't open the help. Close chat or your inventory and try again.");
  return undefined;
}

/** @param {Player} player */
const seesOps = (player) => get("showOpsToEveryone") === true || player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

/** The commands and steps this player may use. @param {Pack} pack @param {boolean} ops */
const visible = (pack, ops) => ({
  commands: pack.commands.filter((c) => ops || !c.ops),
  steps: pack.steps.filter((s) => ops || !s.ops),
});

/** @param {{ usage: string, ops: boolean, text: string }} c */
const commandText = (c) => `§e${c.usage}§r${c.ops ? " §7(operators)§r" : ""}\n${c.text}`;

const PARAMS_NOTE = "§7In a usage, §e<name>§7 is something you must type and §e[name]§7 is optional; leave out the brackets.";

/** "/realm:stash · /realm:sort · …" for a menu button, or what to do when a pack has no commands. @param {Pack} pack @param {boolean} ops */
function buttonLine(pack, ops) {
  const names = visible(pack, ops).commands.map((c) => c.usage.split(" ")[0]);
  if (!names.length) return "No commands: it just works";
  const line = names.join(" | ");
  return line.length > 44 ? `${names.slice(0, 2).join(" | ")} | +${names.length - 2} more` : line;
}

/** @param {Player} player @param {Pack[]} packs @returns {Promise<"back" | undefined>} */
async function allCommands(player, packs) {
  const ops = seesOps(player);
  const form = new ActionFormData().title("§lAll realm commands").body(PARAMS_NOTE);
  for (const pack of packs) {
    const { commands } = visible(pack, ops);
    if (!commands.length) continue;
    form.divider().header(pack.name).label(commands.map(commandText).join("\n\n"));
  }
  form.button("Back").button("Close");
  const res = await show(player, form);
  return res?.selection === 0 ? "back" : undefined;
}

/** @param {Player} player @param {Pack} pack @returns {Promise<"back" | undefined>} */
async function packPage(player, pack) {
  const { commands, steps } = visible(pack, seesOps(player));
  const form = new ActionFormData().title(`§l${pack.name}`).body(pack.summary);
  if (steps.length) {
    form.divider().header("How to use").label(steps.map((s, i) => `${i + 1}. ${s.text}`).join("\n\n"));
  }
  form.divider().header("Commands");
  if (commands.length) {
    form.label(commands.map(commandText).join("\n\n"));
    if (commands.some((c) => /[<[]/.test(c.usage))) form.label(PARAMS_NOTE);
  } else {
    form.label("§7None: it works on its own.");
  }
  form.button("Back").button("Close");
  const res = await show(player, form);
  return res?.selection === 0 ? "back" : undefined;
}

/**
 * The help menu: "All commands", then one button per installed feature.
 * @param {Player} player @param {string} [topic] a pack's topic, or "all", to open straight to that page
 */
async function openHelp(player, topic) {
  const packs = await installed();
  if (!player.isValid) return;
  const features = packs.filter((p) => p.folder !== SELF);
  const ops = seesOps(player);

  if (topic && topic !== ALL) {
    const pack = PACKS.find((p) => p.topic === topic);
    if (!pack || !packs.includes(pack)) {
      player.sendMessage(`§7${pack?.name ?? topic} isn't installed on this realm. Run /realm:help to see what is.`);
      return;
    }
    if ((await packPage(player, pack)) !== "back") return;
  } else if (topic === ALL) {
    if ((await allCommands(player, packs)) !== "back") return;
  }

  for (;;) {
    const count = packs.reduce((n, p) => n + visible(p, ops).commands.length, 0);
    const form = new ActionFormData()
      .title("§lRealm help")
      .body(
        `This realm adds ${features.length} feature${features.length === 1 ? "" : "s"} and ${count} command${count === 1 ? "" : "s"}. ` +
          "Every command starts with §e/realm:§r; type §e/realm§r in chat to pick one from the list.\n\nPick a feature to see how it works and its commands."
      )
      .button(`§lAll commands§r\n§8Every command with its usage`);
    for (const pack of features) form.button(`${pack.name}\n§8${buttonLine(pack, ops)}`);

    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
    const next = res.selection === 0 ? await allCommands(player, packs) : await packPage(player, features[res.selection - 1]);
    if (next !== "back") return;
  }
}

// ---------------------------------------------------------------------------
// /realm:help [topic]
// ---------------------------------------------------------------------------

/** @type {Set<string>} players with the help open */
const open = new Set();
world.afterEvents.playerLeave.subscribe(({ playerId }) => open.delete(playerId));

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerEnum("realm:help_topic", [ALL, ...PACKS.filter((p) => p.folder !== SELF).map((p) => p.topic)]);

  customCommandRegistry.registerCommand(
    {
      name: "realm:help",
      description: "Help for every realm feature and command. Add a feature name (stash, find, stats...) or all to jump there",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
      optionalParameters: [{ name: "realm:help_topic", type: CustomCommandParamType.Enum }],
    },
    (origin, /** @type {string | undefined} */ topic) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => {
        // A second /realm:help while the first is still waiting for answers or open would stack another menu.
        if (open.has(player.id)) return;
        open.add(player.id);
        openHelp(player, topic)
          .catch((e) => console.warn(`[help] ${e}`))
          .finally(() => open.delete(player.id));
      });
      return { status: CustomCommandStatus.Success };
    }
  );
});
