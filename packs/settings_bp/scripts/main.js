import "./diag.js";
import { CommandPermissionLevel, CustomCommandStatus, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { onScriptEvent } from "./script-events.js";

// This pack holds no other pack's data. It asks the installed packs what they can change
// (realm:cfg_ping -> realm:cfg_schema), shows forms, and sends the changes back
// (realm:cfg_set / realm:cfg_reset → realm:cfg_ack). Each pack's scripts/settings.js answers.

/**
 * @typedef {{
 *   key: string, type: "bool" | "int" | "float" | "enum" | "text", label: string, help?: string,
 *   value: any, default: any, min?: number, max?: number, step?: number, choices?: string[], names?: string[],
 *   scope: "world" | "player", restart?: boolean, invert?: boolean, locked?: string
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

onScriptEvent(
  ["realm:cfg_schema", "realm:cfg_ack"],
  ({ id, message }) => {
    if (id !== "realm:cfg_schema" && id !== "realm:cfg_ack") return;
    try {
      const msg = JSON.parse(message);
      if (msg && typeof msg.id === "string") waiting.get(msg.id)?.(msg);
    } catch (e) {
      console.warn(`[settings] ${e}`);
    }
  },
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

/** A switch's position: an `invert` option is stored as "off" but shown as "enabled". @param {Option} o @param {unknown} v */
const switchOn = (o, v) => (o.invert ? v !== true : v === true);

/** How a choice reads in the menu. @param {Option} o @param {unknown} v */
const choiceName = (o, v) => {
  const i = (o.choices ?? []).indexOf(/** @type {string} */ (v));
  return i >= 0 && o.names?.[i] ? o.names[i] : String(v);
};

// Bedrock's sliders only stop on whole numbers: a 0-1 slider in steps of 0.05 can only be 0 or 1, and saving the
// form would snap an untouched value too. So a 0-1 setting (a volume) is shown as a 0-100% slider, and any other
// setting with fractional steps as a dropdown of its exact values.

/** A 0-1 setting, shown and read as a percentage. @param {Option} o */
const isPercent = (o) => o.type === "float" && o.min === 0 && o.max === 1;

/** Decimal places of a step, so 0.05 * 7 reads 0.35, not 0.35000000000000003. @param {number} step */
const decimalsOf = (step) => (String(step).split(".")[1] ?? "").length;

/** Snaps a number to its option's step grid. @param {Option} o @param {number} v */
function onGrid(o, v) {
  const step = o.step ?? 0.1, from = o.min ?? 0;
  return Number((from + Math.round((v - from) / step) * step).toFixed(decimalsOf(step)));
}

/** A fractional setting that isn't 0-1 (seat reach 1 to 5 in 0.5s): its values, for a dropdown. undefined = slider. @param {Option} o */
function choicesOf(o) {
  if ((o.type === "int" || o.type === "float") && Array.isArray(o.choices) && o.choices.length) return o.choices.map(Number);
  if (o.type !== "float" || isPercent(o) || o.min === undefined || o.max === undefined) return undefined;
  const step = o.step ?? 0.1, out = [];
  for (let v = o.min; v <= o.max + 1e-9 && out.length < 100; v = onGrid(o, v + step)) out.push(v);
  return out;
}

/** A value as players read it. @param {Option} o @param {unknown} v */
function fmt(o, v) {
  if (o.type === "bool") return switchOn(o, v) ? "Enabled" : "Disabled";
  if (o.type === "enum") return choiceName(o, v);
  if (o.type === "text") return v ? `"${v}§r"` : "(empty)";
  if (isPercent(o) && typeof v === "number") return `${Math.round(v * 100)}%`;
  return String(v);
}

/**
 * How a number option is shown: a dropdown of its exact values, or a whole-number slider. `untouched` holds the
 * answers that mean the control was left as it opened: the shown value, and where the slider may snap it to its
 * step. A value from config.js that is off the grid or outside the in-game range is shown at the nearest place it
 * can be, so without this, saving another setting in the same form would quietly change it.
 * @param {Option} o
 */
function numberControl(o) {
  const choices = choicesOf(o);
  if (choices) {
    const at = choices.reduce((best, c, i) => (Math.abs(c - Number(o.value)) < Math.abs(choices[best] - Number(o.value)) ? i : best), 0);
    return { choices, at, min: 0, max: 0, value: 0, step: 1, untouched: [at] };
  }
  const k = isPercent(o) ? 100 : 1; // percentages: 0-100 in whole steps
  const min = (o.min ?? 0) * k;
  const max = o.max !== undefined ? o.max * k : Math.max(min + 1, (Number(o.value) || 0) * k);
  const value = Math.min(max, Math.max(min, Math.round((Number(o.value) || 0) * k)));
  const step = Math.max(1, Math.round((o.step ?? 1) * k));
  const snapped = Math.min(max, min + Math.round((value - min) / step) * step);
  return { choices: undefined, at: 0, min, max, value, step, untouched: [value, snapped] };
}

/** @param {ModalFormData} form @param {Option} o */
function addControl(form, o) {
  const range = (o.type === "int" || o.type === "float") && o.min !== undefined && o.max !== undefined ? `Range: ${fmt(o, o.min)} to ${fmt(o, o.max)}` : undefined;
  const tooltip = [o.help, `Default: ${fmt(o, o.default)}`, range].filter(Boolean).join("\n");
  switch (o.type) {
    case "bool":
      form.toggle(o.label, { defaultValue: switchOn(o, o.value), tooltip });
      break;
    case "float":
    case "int": {
      const c = numberControl(o);
      if (c.choices) form.dropdown(o.label, c.choices.map((v) => fmt(o, v)), { defaultValueIndex: c.at, tooltip });
      else form.slider(isPercent(o) ? `${o.label} (%)` : o.label, c.min, c.max, { defaultValue: c.value, valueStep: c.step, tooltip });
      break;
    }
    case "enum": {
      const choices = o.choices ?? [];
      form.dropdown(o.label, choices.map((c) => choiceName(o, c)), { defaultValueIndex: Math.max(0, choices.indexOf(o.value)), tooltip });
      break;
    }
    default:
      form.textField(o.label, String(o.default ?? ""), { defaultValue: String(o.value ?? ""), tooltip });
  }
}

/** What a control returned, as the option's type. An untouched control keeps the exact saved value. @param {Option} o @param {unknown} raw */
function valueOf(o, raw) {
  switch (o.type) {
    case "bool":
      return o.invert ? raw !== true : raw === true;
    case "int":
    case "float": {
      if (typeof raw !== "number") return o.value;
      const c = numberControl(o);
      if (c.untouched.includes(raw)) return o.value;
      if (c.choices) return c.choices[raw] ?? o.value; // a dropdown answers with an index
      if (o.type === "int") return Math.round(raw);
      return onGrid(o, isPercent(o) ? raw / 100 : raw);
    }
    case "enum": {
      const choices = o.choices ?? [];
      if (typeof raw !== "number") return o.value;
      if (raw === 0 && !choices.includes(o.value)) return o.value; // shown as the first choice, left alone
      return choices[raw] ?? o.value;
    }
    default:
      return typeof raw === "string" ? raw : o.value;
  }
}

/**
 * Pairs a modal form's answers with its inputs. Labels and headers may or may not take a place in
 * formValues, so both layouts are accepted.
 * @param {import("@minecraft/server-ui").ModalFormResponse} res
 * @param {(Slot | "nav" | null)[]} slots null = a label or header; "nav" = the All settings page list
 * @returns {{ answers: { slot: Slot, value: unknown }[], nav?: unknown } | undefined}
 */
function answersOf(res, slots) {
  const values = res.formValues ?? [];
  const inputs = /** @type {[Slot | "nav", number][]} */ (slots.map((s, i) => [s, i]).filter(([s]) => s !== null));
  /** @type {unknown[]} */
  let raw;
  if (values.length === slots.length) raw = inputs.map(([, i]) => values[i]);
  else if (values.length === inputs.length) raw = inputs.map((_, k) => values[k]);
  else return undefined;
  /** @type {{ slot: Slot, value: unknown }[]} */
  const answers = [];
  /** @type {unknown} */
  let nav;
  inputs.forEach(([slot], k) => {
    if (slot === "nav") nav = raw[k];
    else answers.push({ slot, value: valueOf(slot.option, raw[k]) });
  });
  return { answers, nav };
}

/**
 * @typedef {{ changed: number, saved: number, packs: Set<string>, lines: string[] }} Saved what a save did: one line per change
 */

/**
 * Saves what changed, and lists each change as old -> new.
 * @param {{ slot: Slot, value: unknown }[]} answers @param {string} [forPlayer] player id, for preferences
 * @param {boolean} [named] always name the pack in each line (the All settings pages)
 * @returns {Promise<Saved>}
 */
async function save(answers, forPlayer, named = false) {
  const changed = answers.filter(({ slot, value }) => value !== slot.option.value);
  const packs = new Set(changed.map(({ slot }) => slot.pack.title));
  if (!changed.length) return { changed: 0, saved: 0, packs, lines: [] };
  const acks = await send(changed.map(({ slot, value }) => ({ pack: slot.pack.pack, key: slot.option.key, value, player: forPlayer })));
  let saved = 0;
  const lines = changed.map(({ slot }, i) => {
    const ack = acks.get(i), o = slot.option;
    const name = named || packs.size > 1 ? `${slot.pack.title} > ${o.label}` : o.label;
    if (!ack?.ok) return `§c- ${name}:§r not saved, ${ack ? `${ack.error ?? "refused"}` : "the pack didn't answer. Try again"}`;
    saved++;
    return `§a- ${name}:§r ${fmt(o, o.value)} -> §e${fmt(o, ack.value)}`;
  });
  return { changed: changed.length, saved, packs, lines };
}

/**
 * The summary of one or more saves: how many changes were saved, then each one.
 * @param {Saved[]} results @returns {{ title: string, lines: string[] }}
 */
function summary(results) {
  const changed = results.reduce((n, r) => n + r.changed, 0);
  if (!changed) return { title: "No changes", lines: ["§7Nothing was different, so nothing was saved."] };
  const saved = results.reduce((n, r) => n + r.saved, 0);
  const packs = new Set(results.flatMap((r) => [...r.packs]));
  const failed = changed - saved;
  const where = packs.size === 1 ? ` in ${[...packs][0]}` : "";
  const title = `${saved} change${saved === 1 ? "" : "s"} saved${failed ? `, ${failed} not saved` : ""}`;
  return { title, lines: [`§l${title}${where}§r`, ...results.flatMap((r) => r.lines)] };
}

/**
 * Shows what a save did: in chat, and in a dialog so it isn't hidden behind the next menu.
 * @param {Player} player @param {{ title: string, lines: string[] }} result @param {string} back the other button
 * @returns {Promise<boolean>} true = the player picked `back`
 */
async function report(player, result, back) {
  if (!player.isValid) return false;
  player.sendMessage(result.lines.join("\n"));
  const res = await show(player, new MessageFormData().title(result.title).body(result.lines.join("\n")).button1(back).button2("Done"));
  return !!res && !res.canceled && res.selection === 0;
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
      .body("Pick All settings for every pack's settings on one form, or a single pack. They apply to everyone, right away.\n§7Hold or hover over §f!§7 for what a setting does. Players set their own preferences with /realm:prefs.");
    const pages = paginate(packs).length;
    const total = packs.reduce((n, p) => n + worldOptions(p).filter((o) => !o.restart).length, 0);
    form.button(`All settings\n§8${total} settings, ${pages === 1 ? "one page" : `${pages} pages`}`);
    for (const p of packs) {
      const n = worldOptions(p).filter((o) => !o.restart).length;
      form.button(`${p.title}\n§8${n} setting${n === 1 ? "" : "s"}`);
    }
    form.button("Reset a pack to defaults\n§8Back to its config.js values");

    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
    if (res.selection === 0) {
      if (!(await allSettings(player))) return;
    } else if (res.selection === packs.length + 1) await resetMenu(player, packs);
    else if (!(await editPack(player, packs[res.selection - 1]))) return;
  }
}

/** @param {Player} player @param {Pack} pack @returns {Promise<boolean>} true = back to the list of packs */
async function editPack(player, pack) {
  const form = new ModalFormData().title(pack.title).submitButton("Save");
  /** @type {(Slot | null)[]} */
  const slots = [];
  addWorldOptions(form, slots, pack);
  const res = await show(player, form);
  if (!res || !player.isValid || !isOp(player)) return false;
  if (res.canceled) return true;
  const read = answersOf(res, slots);
  if (!read) {
    player.sendMessage("§cCouldn't read the form, so nothing was saved.");
    return true;
  }
  return report(player, summary([await save(read.answers)]), "Back to Realm Settings");
}

/**
 * A pack's world options on a form: a control for each, or a line of text for one read only when the world starts.
 * The same for a pack's own page and the All settings pages, so both look and save the same.
 * @param {ModalFormData} form @param {(Slot | "nav" | null)[]} slots @param {Pack} pack
 */
function addWorldOptions(form, slots, pack) {
  for (const option of worldOptions(pack)) {
    if (option.restart) {
      form.label(`§7${option.label}: §f${fmt(option, option.value)}§7 (change in config.js, then restart the world)`);
      slots.push(null);
    } else {
      addControl(form, option);
      slots.push({ pack, option });
    }
  }
}

/**
 * Splits the packs into All settings pages of at most CONFIG.allPageSize lines each (a heading per pack, plus a
 * line per setting). A pack is never split: one bigger than a page gets a page of its own.
 * @param {Pack[]} packs @returns {Pack[][]}
 */
function paginate(packs) {
  const size = CONFIG.allPageSize > 0 ? CONFIG.allPageSize : Infinity;
  /** @type {Pack[][]} */
  const pages = [];
  let lines = 0;
  for (const p of packs) {
    const n = 1 + worldOptions(p).length;
    const last = pages.at(-1);
    if (last && lines + n <= size) {
      last.push(p);
      lines += n;
    } else {
      pages.push([p]);
      lines = n;
    }
  }
  return pages;
}

/**
 * All settings: every pack's settings with a heading per pack, on one form or a few pages. Each page saves when it
 * is submitted, through realm:cfg_set exactly like a pack's own page, and every page asks the packs for their values
 * again before it opens, so this and the pack pages always show the same saved values.
 * @param {Player} player @returns {Promise<boolean>} true = back to the list of packs
 */
async function allSettings(player) {
  /** @type {Saved[]} */
  const results = [];
  let page = 0;
  while (player.isValid && isOp(player)) {
    const pages = paginate((await collect(player)).filter((p) => worldOptions(p).length));
    if (!player.isValid || !pages.length) return false;
    page = Math.min(page, pages.length - 1);
    const many = pages.length > 1;
    const form = new ModalFormData()
      .title(many ? `§lAll settings (page ${page + 1} of ${pages.length})` : "§lAll settings")
      .submitButton(many ? "Save and go" : "Save");
    /** @type {(Slot | "nav" | null)[]} */
    const slots = [];
    if (many) {
      const targets = pages.map((pg, i) => `Page ${i + 1}: ${pg[0].title}${pg.length > 1 ? ` to ${pg[pg.length - 1].title}` : ""}`);
      form.dropdown("After saving, go to", [...targets, "Done (show what was saved)"], {
        defaultValueIndex: page + 1,
        tooltip: "Saving keeps this page's changes, whichever page you go to next. Closing the form saves nothing on this page.",
      });
      slots.push("nav");
    }
    for (const pack of pages[page]) {
      form.label(`§l§6${pack.title}`);
      slots.push(null);
      addWorldOptions(form, slots, pack);
    }
    const res = await show(player, form);
    if (!res || !player.isValid || !isOp(player)) return false;
    if (res.canceled) break;
    const read = answersOf(res, slots);
    if (!read) {
      player.sendMessage("§cCouldn't read the form, so nothing on that page was saved.");
      break;
    }
    results.push(await save(read.answers, undefined, true));
    const next = typeof read.nav === "number" ? read.nav : pages.length;
    if (next >= pages.length) break;
    page = next;
  }
  if (!results.length) return true; // closed before saving anything
  return report(player, summary(results), "Back to Realm Settings");
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
  while (player.isValid && (await prefsForm(player)));
}

/** @param {Player} player @returns {Promise<boolean>} true = show the preferences again */
async function prefsForm(player) {
  const packs = (await collect(player)).filter((p) => p.options.some((o) => o.scope === "player"));
  if (!player.isValid) return false;
  if (!packs.length) {
    player.sendMessage("§7No installed pack has preferences of your own.");
    return false;
  }
  const form = new ModalFormData().title("§lMy preferences").submitButton("Save");
  form.label("§7Changes apply when you press §fSave§7 at the bottom. Closing with X keeps your settings as they were.");
  /** @type {(Slot | null)[]} */
  const slots = [null];
  for (const pack of packs) {
    form.label(`§l§6${pack.title}`);
    slots.push(null);
    for (const option of pack.options.filter((o) => o.scope === "player")) {
      if (option.locked) {
        // Set by the operators: shown, not a control, so nobody changes something that does nothing.
        form.label(`§7${option.label}: §f${fmt(option, option.value)}\n§8Locked by the operators: ${option.locked}`);
        slots.push(null);
        continue;
      }
      addControl(form, option);
      slots.push({ pack, option });
    }
  }
  const res = await show(player, form);
  if (!player.isValid) return false;
  if (!res || res.canceled) {
    // Closed with X: the game hands back nothing, so whether anything changed can't be known. A line in chat, not a
    // second popup: that came on every close, even after only looking.
    if (res?.cancelationReason === FormCancelationReason.UserClosed) {
      player.sendMessage("§7My preferences: closed with X, so nothing was saved. To change a setting, run §f/realm:prefs§7 again and press §fSave§7 at the bottom.");
    }
    return false;
  }
  const read = answersOf(res, slots);
  if (!read) {
    player.sendMessage("§cCouldn't read the form, so nothing was saved.");
    return false;
  }
  return report(player, summary([await save(read.answers, player.id)]), "Back to my preferences");
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
    system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: source.id, ticks: 60, from: "settings_bp" })); // other bar writers wait
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
onScriptEvent(
  "realm:help_ping",
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "settings_bp");
  },
);
