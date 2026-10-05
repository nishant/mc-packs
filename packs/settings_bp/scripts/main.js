import { CommandPermissionLevel, CustomCommandStatus, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";

// This pack holds no other pack's data. It asks the installed packs what they can change
// (realm:cfg_ping → realm:cfg_schema), shows forms, and sends the changes back
// (realm:cfg_set / realm:cfg_reset → realm:cfg_ack). Each pack's scripts/settings.js answers.

/**
 * @typedef {{
 *   key: string, type: "bool" | "int" | "float" | "enum" | "text", label: string, help?: string,
 *   value: any, default: any, min?: number, max?: number, step?: number, choices?: string[],
 *   scope: "world" | "player", restart?: boolean
 * }} Option
 * @typedef {{ pack: string, title: string, options: Option[] }} Pack
 * @typedef {{ pack: Pack, option: Option }} Slot one input of a form
 */

// ---------------------------------------------------------------------------
// Talking to the packs
// ---------------------------------------------------------------------------

let counter = 0;
const newId = () => `${system.currentTick.toString(36)}.${(counter++).toString(36)}`;

/** @type {Map<string, (msg: any) => void>} request id → what to do with an answer */
const waiting = new Map();

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:cfg_schema" && id !== "realm:cfg_ack") return;
    try {
      const msg = JSON.parse(message);
      if (msg && typeof msg.id === "string") waiting.get(msg.id)?.(msg);
    } catch (e) {
      console.warn(`[settings] ${e}`);
    }
  },
  { namespaces: ["realm"] }
);

/**
 * Asks every installed pack for its options, with this player's own values for player options.
 * @param {Player} player @returns {Promise<Pack[]>} by title
 */
async function collect(player) {
  const id = newId();
  /** @type {Map<string, { title: string, parts: number, got: Map<number, Option[]> }>} */
  const answers = new Map();
  waiting.set(id, (msg) => {
    if (typeof msg.pack !== "string" || !Array.isArray(msg.options)) return;
    let a = answers.get(msg.pack);
    if (!a) answers.set(msg.pack, (a = { title: String(msg.title ?? msg.pack), parts: Number(msg.parts) || 1, got: new Map() }));
    a.got.set(Number(msg.part) || 1, msg.options);
  });
  const complete = () => [...answers.values()].every((a) => a.got.size >= a.parts);
  try {
    system.sendScriptEvent("realm:cfg_ping", JSON.stringify({ id, player: player.id }));
    await system.waitTicks(CONFIG.answerTicks);
    if (!complete()) await system.waitTicks(CONFIG.answerTicks); // a long answer comes in parts: give the rest a moment
  } finally {
    waiting.delete(id);
  }
  /** @type {Pack[]} */
  const packs = [];
  for (const [pack, a] of answers) {
    if (a.got.size < a.parts) {
      console.warn(`[settings] ${pack}: only ${a.got.size} of ${a.parts} parts of its settings arrived`);
      continue;
    }
    const options = [...a.got].sort((x, y) => x[0] - y[0]).flatMap(([, o]) => o);
    packs.push({ pack, title: a.title, options });
  }
  return packs.sort((x, y) => x.title.localeCompare(y.title));
}

/**
 * Sends changes and waits for each pack to confirm.
 * @param {{ pack: string, key: string, value: unknown, player?: string }[]} changes
 * @returns {Promise<Map<number, any>>} the answer to each change, by index; missing = no answer
 */
async function send(changes) {
  /** @type {Map<number, any>} */
  const acks = new Map();
  const ids = changes.map(() => newId());
  ids.forEach((id, i) => waiting.set(id, (msg) => acks.set(i, msg)));
  try {
    changes.forEach((c, i) => system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: ids[i], ...c })));
    for (let t = 0; t < CONFIG.answerTicks && acks.size < changes.length; t++) await system.waitTicks(1);
  } finally {
    for (const id of ids) waiting.delete(id);
  }
  return acks;
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

/**
 * Shows a form, retrying while the player still has chat or another screen open.
 * @template {ActionFormData | MessageFormData | ModalFormData} F
 * @param {Player} player @param {F} form
 * @returns {Promise<Awaited<ReturnType<F["show"]>> | undefined>} undefined if it never got shown
 */
async function show(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = /** @type {any} */ (await form.show(player));
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await system.waitTicks(20);
  }
  if (player.isValid) player.sendMessage("§eCouldn't open the menu. Close chat or your inventory and try again.");
  return undefined;
}

/** A value as players read it. @param {Option} o @param {unknown} v */
function fmt(o, v) {
  if (o.type === "bool") return v ? "on" : "off";
  if (o.type === "text") return v ? `"${v}§r"` : "(empty)";
  return String(v);
}

/** @param {ModalFormData} form @param {Option} o */
function addControl(form, o) {
  const tooltip = [o.help, `Default: ${fmt(o, o.default)}`].filter(Boolean).join("\n");
  switch (o.type) {
    case "bool":
      form.toggle(o.label, { defaultValue: o.value === true, tooltip });
      break;
    case "int":
    case "float": {
      const min = o.min ?? 0;
      const max = o.max ?? Math.max(min + 1, Number(o.value) || 0);
      const value = Math.min(max, Math.max(min, Number(o.value) || 0));
      form.slider(o.label, min, max, { defaultValue: value, valueStep: o.step ?? (o.type === "int" ? 1 : 0.1), tooltip });
      break;
    }
    case "enum": {
      const choices = o.choices ?? [];
      form.dropdown(o.label, choices, { defaultValueIndex: Math.max(0, choices.indexOf(o.value)), tooltip });
      break;
    }
    default:
      form.textField(o.label, String(o.default ?? ""), { defaultValue: String(o.value ?? ""), tooltip });
  }
}

/** What a control returned, as the option's type. @param {Option} o @param {unknown} raw */
function valueOf(o, raw) {
  switch (o.type) {
    case "bool":
      return raw === true;
    case "int":
      return typeof raw === "number" ? Math.round(raw) : o.value;
    case "float": {
      if (typeof raw !== "number") return o.value;
      const step = o.step ?? 0.1;
      const decimals = (String(step).split(".")[1] ?? "").length;
      return Number((Math.round(raw / step) * step).toFixed(decimals)); // 2.5, not 2.5000000000000004
    }
    case "enum":
      return typeof raw === "number" ? (o.choices ?? [])[raw] ?? o.value : o.value;
    default:
      return typeof raw === "string" ? raw : o.value;
  }
}

/**
 * Pairs a modal form's answers with its inputs. Labels and headers may or may not take a place in
 * formValues, so both layouts are accepted.
 * @param {import("@minecraft/server-ui").ModalFormResponse} res @param {(Slot | null)[]} slots null = a label or header
 * @returns {{ slot: Slot, value: unknown }[] | undefined}
 */
function answersOf(res, slots) {
  const values = res.formValues ?? [];
  const inputs = /** @type {Slot[]} */ (slots.filter(Boolean));
  if (values.length === slots.length) {
    return slots.flatMap((slot, i) => (slot ? [{ slot, value: valueOf(slot.option, values[i]) }] : []));
  }
  if (values.length === inputs.length) return inputs.map((slot, i) => ({ slot, value: valueOf(slot.option, values[i]) }));
  return undefined;
}

/**
 * Saves what changed and tells the player, one line per change.
 * @param {Player} player @param {{ slot: Slot, value: unknown }[]} answers @param {string} [forPlayer] player id, for preferences
 */
async function save(player, answers, forPlayer) {
  const changed = answers.filter(({ slot, value }) => value !== slot.option.value);
  if (!changed.length) {
    player.sendMessage("§7Nothing changed.");
    return;
  }
  const acks = await send(changed.map(({ slot, value }) => ({ pack: slot.pack.pack, key: slot.option.key, value, player: forPlayer })));
  if (!player.isValid) return;
  changed.forEach(({ slot }, i) => {
    const ack = acks.get(i);
    const what = `${slot.pack.title}, ${slot.option.label}`;
    if (!ack) player.sendMessage(`§cNot saved:§r ${what}: the pack didn't answer. Try again.`);
    else if (!ack.ok) player.sendMessage(`§cNot saved:§r ${what}: ${ack.error ?? "refused"}.`);
    else player.sendMessage(`§aSaved:§r ${what}: §e${fmt(slot.option, ack.value)}`);
  });
}

// ---------------------------------------------------------------------------
// /realm:config (operators)
// ---------------------------------------------------------------------------

/** @param {Player} player */
const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

/** @param {Pack} pack */
const worldOptions = (pack) => pack.options.filter((o) => o.scope === "world");

/** @param {Player} player */
async function configMenu(player) {
  while (player.isValid && isOp(player)) {
    const packs = (await collect(player)).filter((p) => worldOptions(p).length);
    if (!player.isValid) return;
    if (!packs.length) {
      player.sendMessage("§7No installed pack has settings to change.");
      return;
    }
    const form = new ActionFormData()
      .title("§lRealm Settings")
      .body("Pick a pack to change its settings for everyone. Changes apply right away and are saved in the world.\n§7Players choose their own preferences with /realm:prefs.");
    for (const p of packs) {
      const n = worldOptions(p).filter((o) => !o.restart).length;
      form.button(`${p.title}\n§8${n} setting${n === 1 ? "" : "s"}`);
    }
    form.button("Reset a pack to defaults\n§8Back to its config.js values");

    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
    if (res.selection === packs.length) await resetMenu(player, packs);
    else await editPack(player, packs[res.selection]);
  }
}

/** @param {Player} player @param {Pack} pack */
async function editPack(player, pack) {
  const form = new ModalFormData().title(pack.title).submitButton("Save");
  /** @type {(Slot | null)[]} */
  const slots = [];
  for (const option of worldOptions(pack)) {
    if (option.restart) {
      form.label(`§7${option.label}: §f${fmt(option, option.value)}§7 (set in config.js; needs a world restart)`);
      slots.push(null);
    } else {
      addControl(form, option);
      slots.push({ pack, option });
    }
  }
  const res = await show(player, form);
  if (!res || res.canceled || !player.isValid || !isOp(player)) return;
  const answers = answersOf(res, slots);
  if (!answers) {
    player.sendMessage("§cCouldn't read the form, so nothing was saved.");
    return;
  }
  await save(player, answers);
}

/** @param {Player} player @param {Pack[]} packs */
async function resetMenu(player, packs) {
  const form = new ActionFormData()
    .title("Reset a pack")
    .body("Pick a pack to put its settings back to its config.js values. Players' own preferences are kept.");
  for (const p of packs) form.button(p.title);
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || res.selection >= packs.length) return;
  const pack = packs[res.selection];

  const confirm = await show(
    player,
    new MessageFormData()
      .title("Reset settings")
      .body(`Put every ${pack.title} setting back to its config.js value?`)
      .button1("Reset")
      .button2("Cancel")
  );
  if (!confirm || confirm.canceled || confirm.selection !== 0 || !player.isValid || !isOp(player)) return;

  const id = newId();
  /** @type {any} */
  let ack;
  waiting.set(id, (msg) => (ack = msg));
  try {
    system.sendScriptEvent("realm:cfg_reset", JSON.stringify({ id, pack: pack.pack }));
    for (let t = 0; t < CONFIG.answerTicks && !ack; t++) await system.waitTicks(1);
  } finally {
    waiting.delete(id);
  }
  if (!player.isValid) return;
  player.sendMessage(
    ack?.ok ? `§aReset:§r every ${pack.title} setting is back to its config.js value.` : `§cNot reset:§r ${pack.title} didn't answer. Try again.`
  );
}

// ---------------------------------------------------------------------------
// /realm:prefs (everyone)
// ---------------------------------------------------------------------------

/** @param {Player} player */
async function prefsMenu(player) {
  const packs = (await collect(player)).filter((p) => p.options.some((o) => o.scope === "player"));
  if (!player.isValid) return;
  if (!packs.length) {
    player.sendMessage("§7No installed pack has preferences of your own.");
    return;
  }
  const form = new ModalFormData().title("§lMy preferences").submitButton("Save");
  /** @type {(Slot | null)[]} */
  const slots = [];
  for (const pack of packs) {
    form.header(pack.title);
    slots.push(null);
    for (const option of pack.options.filter((o) => o.scope === "player")) {
      addControl(form, option);
      slots.push({ pack, option });
    }
  }
  const res = await show(player, form);
  if (!res || res.canceled || !player.isValid) return;
  const answers = answersOf(res, slots);
  if (!answers) {
    player.sendMessage("§cCouldn't read the form, so nothing was saved.");
    return;
  }
  await save(player, answers, player.id);
}

// ---------------------------------------------------------------------------
// Opening the menus
// ---------------------------------------------------------------------------

/** @type {Set<string>} players with a menu open, so a second command or item use doesn't stack another */
const open = new Set();
world.afterEvents.playerLeave.subscribe(({ playerId }) => open.delete(playerId));

/** @param {Player} player @param {(player: Player) => Promise<void>} menu */
function openMenu(player, menu) {
  if (open.has(player.id)) return;
  open.add(player.id);
  menu(player)
    .catch((e) => console.warn(`[settings] ${e}`))
    .finally(() => open.delete(player.id));
}

// An item renamed "Realm Settings" on an anvil opens the operators' menu: no custom item needed.
world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  if (!CONFIG.itemName || itemStack.nameTag !== CONFIG.itemName) return;
  if (!isOp(source)) {
    source.onScreenDisplay.setActionBar("§7Only operators can change the realm's settings. Your own: /realm:prefs");
    return;
  }
  openMenu(source, configMenu);
});

/** @param {import("@minecraft/server").CustomCommandOrigin} origin */
const originPlayer = (origin) => {
  const p = origin.initiator ?? origin.sourceEntity;
  return p instanceof Player ? p : undefined;
};

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:config",
      description: "Change the settings of every installed realm pack, for everyone",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
    },
    (origin) => {
      const player = originPlayer(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => openMenu(player, configMenu));
      return { status: CustomCommandStatus.Success };
    }
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:prefs",
      description: "Your own preferences for the realm's packs: warnings, phantoms, rain extras, sneak-tap and more",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = originPlayer(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => openMenu(player, prefsMenu));
      return { status: CustomCommandStatus.Success };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "settings_bp");
  },
  { namespaces: ["realm"] }
);
