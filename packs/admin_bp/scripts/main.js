import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  EntityComponentTypes,
  EquipmentSlot,
  ItemLockMode,
  ItemStack,
  Player,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import { ACTIONS, TITLE_MAX_SECONDS, showTitle } from "./actions.js";
import { ENUMS, PACKS } from "./catalog.js";
import { CONFIG } from "./config.js";
import { GROUPS, LINE, NAMES, OP_COLOR, OP_TEXT, PARAMS, SETUP, needsConfirm, textWidth } from "./presets.js";
import { get, onChange } from "./settings.js";
import { allZones, pingZones } from "./zones.js";

// Realm Configuration: one item, one menu, every realm: command. Every player gets the item and sees the
// commands they may use; operators see everything, their own entries in red. The commands come from
// catalog.js (generated from every pack's registrations); picking one asks for its options with preset
// choices, then runs it as the player with player.runCommand, so the command's own checks and menus
// apply. Operator commands and quick actions are checked again right before they run, never only hidden.
// This pack holds no other pack's data: it only runs their commands.

/**
 * @typedef {import("./catalog.js").Command & { folder: string, pack: string }} Cmd
 * @typedef {import("./actions.js").Action} Action
 * @typedef {{ t: string, l?: string, a?: string, v?: import("./actions.js").Values }} Recent
 * @typedef {{ label: string, open: () => Promise<unknown> } | { header: string } | { text: string }} Entry a button, a heading or a line of text
 */

const TITLE = "Realm Configuration";
const RECENT_PROP = "admin:recent";
const LORE = ["§r§7Hold it in your hand and use it", "§r§7to open the realm menu:", "§r§7every realm command you can use,", "§r§7in one place.", "§r§8Red entries: operators only"];
const MARK = /** @type {string} */ (LORE.at(-1));
/** Last lore lines of items handed out earlier (before the menu was for everyone; while operator entries were gold): still the real item. */
const OLD_MARKS = ["§r§8Operators only", "§r§8Gold entries: operators only"];
const RANK = { any: 0, op: 1, admin: 2, host: 3, owner: 4 };

/** @type {Cmd[]} every command in the catalog */
const ALL = PACKS.flatMap((p) => p.commands.map((c) => ({ ...c, folder: p.folder, pack: p.pack })));

/** @param {Player} p */
const isOp = (p) => p.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
/** Whether the item goes to every player (otherwise only to operators). */
const forEveryone = () => get("giveToPlayers") !== false;
/** The permission rank a command needs (an unknown one: operator). @param {string} name */
const needs = (name) => {
  const c = ALL.find((x) => x.name === name);
  return c ? (RANK[c.permission] ?? 1) : 1;
};
/** @param {Cmd} c */
const isOpCmd = (c) => (RANK[c.permission] ?? 1) > 0;
/** @param {unknown} s */
const plain = (s) => String(s ?? "").replace(/§./g, "");
/** A button line cut to what fits (LINE pixels), so Bedrock doesn't cut it somewhere worse. @param {string} s @param {number} [room] */
const fit = (s, room = LINE) => {
  if (textWidth(s) <= room) return s;
  let out = s;
  while (out && textWidth(`${out}...`) > room) out = out.slice(0, -1);
  return `${out.trimEnd().replace(/[,;:(]$/, "")}...`;
};
/** @param {unknown} e */
const errText = (e) => plain(e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 200) || "unknown error";

// ---------------------------------------------------------------------------
// Which packs are installed (they answer /realm:help's ping)
// ---------------------------------------------------------------------------

/** @type {Set<Set<string>>} */
const listening = new Set();
/** @type {{ tick: number, set: Set<string> | undefined }} */
let installedCache = { tick: -1e9, set: undefined };

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id === "realm:help_pong") for (const s of listening) s.add(message);
    // /realm:help lists this pack while it's installed: answer its ping with the folder name.
    else if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "admin_bp");
  },
  { namespaces: ["realm"] }
);

/** The installed pack folders, or undefined if nobody answered (then every command shows). */
async function installed() {
  if (installedCache.set && system.currentTick - installedCache.tick < 1200) return installedCache.set;
  /** @type {Set<string>} */
  const got = new Set();
  listening.add(got);
  try {
    system.sendScriptEvent("realm:help_ping", "");
    await system.waitTicks(Math.max(2, Number(CONFIG.answerTicks) || 10));
  } finally {
    listening.delete(got);
  }
  installedCache = { tick: system.currentTick, set: got.size ? got : undefined };
  return installedCache.set;
}

/** Commands this player may run, from installed packs. @param {Player} player */
async function available(player) {
  const set = await installed();
  const level = Number(player.commandPermissionLevel);
  return ALL.filter((c) => (RANK[c.permission] ?? 1) <= level && (!set || set.has(c.folder)));
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

/**
 * Shows a form, retrying while the player still has chat or another screen open.
 * @template {ActionFormData | MessageFormData | ModalFormData} F
 * @param {Player} player @param {F} form
 * @returns {Promise<any>} undefined if it was closed or never shown
 */
async function show(player, form) {
  const once = resumed.delete(player.id);
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = /** @type {any} */ (await form.show(player));
    if (res.canceled && res.cancelationReason === FormCancelationReason.UserBusy) {
      if (once) return undefined; // the command they just ran opened its own menu: that one stays
      await system.waitTicks(20);
      continue;
    }
    return res.canceled ? undefined : res;
  }
  if (player.isValid) player.sendMessage("§eCouldn't open the menu. Close chat or your inventory and try again.");
  return undefined;
}

/** @type {Set<string>} players whose next form comes back after a command they ran: if another screen is open by then, it's the command's own menu */
const resumed = new Set();

/**
 * Brings back the page a command was picked from, so the next one is two taps away instead of a new
 * trip from the item. It waits long enough for a command's own menu to open first (even one that
 * pings the other packs before it opens); if one did, that menu stays and this does nothing.
 * @param {Player} player @param {(() => Promise<unknown>) | undefined} back
 */
async function resume(player, back) {
  if (!back) return;
  await system.waitTicks(Math.max(2, Number(CONFIG.answerTicks) || 10) * 2 + 5); // Realm Settings pings twice before it opens
  if (!player.isValid) return;
  resumed.add(player.id);
  try {
    return await back();
  } finally {
    resumed.delete(player.id);
  }
}

/**
 * One scrolling page of buttons, with headings and lines of text between them; picking a button opens it.
 * @param {Player} player @param {string} title @param {string} body @param {Entry[]} entries @param {(() => Promise<unknown>) | undefined} back
 */
async function list(player, title, body, entries, back) {
  const form = new ActionFormData().title(title).body(body);
  /** @type {(() => Promise<unknown>)[]} */
  const opens = [];
  let gap = false;
  for (const e of entries) {
    if ("header" in e) {
      if (gap) form.divider();
      form.label(`§l${e.header}§r`); // header() is double size: too big for a heading inside a menu
    } else if ("text" in e) form.label(e.text);
    else {
      form.button(e.label);
      opens.push(e.open);
    }
    gap = true;
  }
  if (back) {
    if (gap) form.divider();
    form.button("Back\n§8To the page before");
  }
  const res = await show(player, form);
  if (res?.selection === undefined) return;
  if (res.selection < opens.length) return opens[res.selection]();
  if (back) return back();
}

/** @param {Player} player @param {string} text @returns {Promise<boolean>} */
async function confirm(player, text) {
  const res = await show(player, new MessageFormData().title("Are you sure?").body(text).button1("Yes, do it").button2("Cancel"));
  return res?.selection === 0;
}

/**
 * Modal answers: one per input. Some clients also send an entry for each label; drop those.
 * @param {any[]} values @param {boolean[]} isInput per element of the form, in order
 */
const inputsOf = (values, isInput) => (values.length === isInput.length ? values.filter((_, i) => isInput[i]) : values);

// ---------------------------------------------------------------------------
// Running commands
// ---------------------------------------------------------------------------

/** One command argument: bare when it's a single plain word, otherwise in quotes. @param {string} s */
const token = (s) => (/^(@[aeprs](\[[^\s\]]*\])?|[A-Za-z0-9_:.+-]+)$/.test(s) ? s : `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);

/** @param {Player} player @returns {Recent[]} */
function recents(player) {
  try {
    const v = JSON.parse(String(player.getDynamicProperty(RECENT_PROP) ?? "[]"));
    return Array.isArray(v) ? v.filter((e) => e && typeof e.t === "string") : [];
  } catch {
    return [];
  }
}

/** @param {Player} player @param {Recent} entry */
function remember(player, entry) {
  const key = JSON.stringify([entry.l, entry.a, entry.v]);
  const kept = recents(player).filter((e) => JSON.stringify([e.l, e.a, e.v]) !== key);
  const size = Math.max(1, Math.min(20, Number(get("recentSize")) || 8));
  try {
    player.setDynamicProperty(RECENT_PROP, JSON.stringify([entry, ...kept].slice(0, size)));
  } catch (e) {
    console.warn(`[admin] ${e}`);
  }
}

/**
 * Runs a command line as the operator, says how it went and remembers it.
 * @param {Player} player @param {string} line without the slash @param {string} title
 */
function exec(player, line, title) {
  let ok = false;
  let why = "";
  // Checked here, not only by hiding: an operator command never runs for someone below its level (the
  // menu can stay open a while, and someone who stopped being an operator meanwhile runs nothing).
  const name = line.split(" ")[0];
  if (Number(player.commandPermissionLevel) < needs(name)) {
    player.sendMessage(`§c[${TITLE}] /${name} didn't run: it's for operators${isOp(player) ? " of a higher level" : ""}.`);
    return false;
  }
  try {
    const res = player.runCommand(line);
    ok = res.successCount > 0;
    if (!ok) why = "the command refused. Check the options, or type it to see its reason";
  } catch (e) {
    why = errText(e);
  }
  if (ok) {
    player.sendMessage(`§7[${TITLE}] Ran §e/${line}`);
    remember(player, { t: title, l: line });
  } else player.sendMessage(`§c[${TITLE}] /${line} didn't run: ${why}`);
  return ok;
}

/** An id as words: "notice_board" reads "Notice board" (the command still gets the id). @param {string} id */
const readable = (id) => {
  const base = id.replace(/_/g, " ");
  return base.charAt(0).toUpperCase() + base.slice(1);
};

/** What an input is called. @param {import("./catalog.js").Param} p */
const paramLabel = (p) => readable(p.name.replace(/^realm:/, ""));

/** @param {Player} p */
const heldItemId = (p) => p.getComponent(EntityComponentTypes.Inventory)?.container?.getItem(p.selectedSlotIndex)?.typeId;

/** @param {Player} me */
const onlineNames = (me) => [me.name, ...world.getAllPlayers().filter((p) => p.id !== me.id).map((p) => p.name)];

/**
 * Builds the options form of a command. Each parameter adds one or two inputs and a reader that turns
 * their answers into its argument ("" = left out) or an error.
 * @param {Player} player @param {Cmd} cmd @param {string} [note]
 */
function paramForm(player, cmd, note) {
  const form = new ModalFormData().title(nameOf(cmd));
  /** @type {boolean[]} */
  const isInput = [];
  /** @type {{ count: number, read: (v: any[]) => string | { error: string } }[]} */
  const readers = [];
  form.label(`§7/${cmd.name}${isOpCmd(cmd) ? ` ${OP_TEXT}(operators only)` : ""}§r\n${cmd.description}${note ? `\n\n§7${note}` : ""}`);
  isInput.push(false);
  const loc = player.location;

  for (const p of cmd.params) {
    const pre = PARAMS[cmd.name]?.[p.name] ?? {};
    const opt = p.optional;
    const label = `${pre.label ?? paramLabel(p)}${opt && !pre.label?.includes("(") ? " (optional)" : ""}`;
    const add = (/** @type {number} */ count, /** @type {(v: any[]) => string | { error: string }} */ read) => {
      for (let i = 0; i < count; i++) isInput.push(true);
      readers.push({ count, read });
    };
    const kind = pre.kind ?? (/^(player|target|who)$/i.test(p.name) && p.type === "String" ? "player" : undefined);

    const enumValues = p.type === "Enum" ? (ENUMS[p.enum ?? p.name] ?? []) : [];
    if (p.type === "Enum" && enumValues.length) {
      const values = enumValues;
      const shown = values.map((v) => pre.names?.[v] ?? readable(v));
      const items = opt ? ["(leave out)", ...shown] : shown;
      const def = typeof pre.default === "string" ? Math.max(0, values.indexOf(pre.default)) + (opt ? 1 : 0) : 0;
      form.dropdown(label, items, { defaultValueIndex: def });
      add(1, ([i]) => {
        const n = Number(i) || 0;
        if (opt && n === 0) return "";
        return values[opt ? n - 1 : n] ?? "";
      });
    } else if (p.type === "PlayerSelector" || kind === "player") {
      const names = onlineNames(player);
      const items = [...(opt ? ["(leave out)"] : []), ...names, ...(pre.everyone && p.type === "PlayerSelector" ? ["Everyone online (@a)"] : [])];
      form.dropdown(label, items, { defaultValueIndex: opt ? 1 : 0 });
      const typed = p.type === "String";
      if (typed) form.textField("Or type a player name (offline players too)", "Steve");
      add(typed ? 2 : 1, ([i, text]) => {
        if (typed && String(text ?? "").trim()) return token(String(text).trim());
        const pick = items[Number(i) || 0];
        if (pick === "(leave out)") return "";
        if (pick === "Everyone online (@a)") return "@a";
        return token(String(pick));
      });
    } else if (p.type === "Boolean" || pre.kind === "toggle") {
      form.toggle(label, { defaultValue: pre.default === true });
      add(1, ([v]) => (v === true ? "true" : "false"));
    } else if ((p.type === "Integer" || p.type === "Float") && kind === "slider") {
      const min = Number(pre.min ?? 0), max = Number(pre.max ?? 100);
      const def = Math.min(max, Math.max(min, Number(pre.default ?? min)));
      form.slider(label, min, max, { valueStep: Number(pre.step ?? 1), defaultValue: def });
      add(1, ([v]) => String(Number(v ?? def)));
    } else if (p.type === "Integer" || p.type === "Float") {
      const def = kind === "posX" ? Math.floor(loc.x) : kind === "posY" ? Math.floor(loc.y) : kind === "posZ" ? Math.floor(loc.z) : pre.default;
      form.textField(label, p.type === "Integer" ? "a whole number" : "a number", { defaultValue: def === undefined ? "" : String(def) });
      add(1, ([v]) => {
        const s = String(v ?? "").trim();
        if (!s) return opt ? "" : { error: `${label}: needs a number.` };
        const ok = p.type === "Integer" ? /^-?\d+$/.test(s) : Number.isFinite(Number(s));
        return ok ? s : { error: `${label}: "${s}" isn't ${p.type === "Integer" ? "a whole number" : "a number"}.` };
      });
    } else if (p.type === "Location") {
      form.textField(label, "x y z", { defaultValue: `${Math.floor(loc.x)} ${Math.floor(loc.y)} ${Math.floor(loc.z)}` });
      add(1, ([v]) => {
        const s = String(v ?? "").trim();
        if (!s) return opt ? "" : { error: `${label}: needs x y z.` };
        return /^(~?-?\d*\.?\d*\s+){2}~?-?\d*\.?\d*$/.test(s) ? s : { error: `${label}: write it as x y z.` };
      });
    } else {
      // String, ItemType, BlockType, EntityType, EntitySelector...: text, with a sensible start
      const def = p.type === "ItemType" || kind === "item" ? (heldItemId(player) ?? (opt ? "" : "minecraft:")) : pre.default === undefined ? "" : String(pre.default);
      form.textField(label, pre.placeholder ?? (p.type === "String" ? "text" : p.type), { defaultValue: def, tooltip: pre.help });
      add(1, ([v]) => {
        const s = String(v ?? "").trim();
        if (!s || s === "minecraft:") return opt ? "" : { error: `${label}: can't be empty.` };
        return p.type === "String" || p.type === "EntitySelector" || p.type === "Enum" ? token(s) : s;
      });
    }
  }
  form.submitButton("Run");
  return { form, isInput, readers };
}

/**
 * Opens a command: asks for its options (if it has any), asks first if it's destructive or for everyone,
 * runs it, then goes back to the page it was picked from (`back`; so does cancelling or closing the options).
 * @param {Player} player @param {Cmd} cmd @param {string} [note] @param {() => Promise<unknown>} [back]
 */
async function openCommand(player, cmd, note, back) {
  if (!cmd.params.length) {
    if (needsConfirm(cmd.name) && !(await confirm(player, `${nameOf(cmd)}: run /${cmd.name}?\n\n${cmd.description}`))) return back?.();
    exec(player, cmd.name, nameOf(cmd));
    return resume(player, back);
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const { form, isInput, readers } = paramForm(player, cmd, note);
    const res = await show(player, form);
    if (!res) return back?.();
    const values = inputsOf(res.formValues ?? [], isInput);
    /** @type {string[]} */
    const args = [];
    let error = "";
    let at = 0;
    for (const r of readers) {
      const out = r.read(values.slice(at, at + r.count));
      at += r.count;
      if (typeof out === "object") error ||= out.error;
      else args.push(out);
    }
    while (args.length && args.at(-1) === "") args.pop();
    const gap = args.findIndex((a) => a === "");
    if (!error && gap >= 0) error = `${paramLabel(cmd.params[gap])}: fill it in too, or clear the options after it.`;
    if (error) {
      const again = await show(player, new MessageFormData().title(nameOf(cmd)).body(`§c${error}`).button1("Try again").button2("Cancel"));
      if (again?.selection !== 0) return back?.();
      continue;
    }
    const line = [cmd.name, ...args].join(" ");
    const everyone = args.includes("@a");
    if ((needsConfirm(cmd.name) || everyone) && !(await confirm(player, `${nameOf(cmd)}: run /${line}?${everyone ? "\n\nThis is for everyone online." : ""}\n\n${cmd.description}`))) return back?.();
    exec(player, line, nameOf(cmd));
    return resume(player, back);
  }
  return back?.();
}

/**
 * A quick action: its own form (or the realm command that should do it instead), then run it and
 * go back to the page it was picked from.
 * @param {Player} player @param {Action} action @param {() => Promise<unknown>} [back]
 */
async function openAction(player, action, back) {
  if (!isOp(player)) {
    player.sendMessage(`§c[${TITLE}] ${action.title} is for operators.`);
    return back?.();
  }
  if (action.use) {
    const cmd = (await available(player)).find((c) => c.name === action.use);
    if (cmd) return openCommand(player, cmd, `${action.title}: the ${cmd.pack} pack owns this, so its command does it.`, back);
  }
  /** @type {import("./actions.js").Values} */
  let values = {};
  const form = action.form?.(player);
  if (form) {
    const res = await show(player, form.submitButton("Do it"));
    if (!res) return back?.();
    const read = action.read ? action.read(player, res.formValues ?? []) : {};
    if (typeof read === "string") {
      player.sendMessage(`§c[${TITLE}] ${read}`);
      return back?.();
    }
    values = read;
  }
  return runAction(player, action, values, back);
}

/** @param {Player} player @param {Action} action @param {import("./actions.js").Values} values @param {() => Promise<unknown>} [back] */
async function runAction(player, action, values, back) {
  const ask = action.confirm?.(player, values);
  if (ask && !(await confirm(player, ask))) return back?.();
  if (!isOp(player)) return void player.sendMessage(`§c[${TITLE}] ${action.title} didn't run: you aren't an operator any more.`);
  try {
    const said = action.run(player, values);
    player.sendMessage(`§7[${TITLE}] ${said}`);
    remember(player, { t: action.title, a: action.id, v: values });
  } catch (e) {
    player.sendMessage(`§c[${TITLE}] ${action.title} didn't work: ${errText(e)}`);
  }
  return back?.(); // a quick action never opens a menu of its own, so the page can come straight back
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/**
 * What a command does, without its pack's name in front ("Merchant Caravan: bring the caravan now"):
 * the hint of a command presets.js doesn't name yet.
 * @param {Cmd} c
 */
function whatItDoes(c) {
  const m = c.description.match(/^([^:]+): (.+)$/s);
  if (!m) return c.description;
  const head = m[1].replace(/\s*\((operators|ops)\)$/i, "").trim().toLowerCase();
  if (!head || !c.pack.toLowerCase().startsWith(head)) return c.description;
  return m[2].charAt(0).toUpperCase() + m[2].slice(1);
}

/** A command's name for what it does ("Find Container"); the command name for one presets.js doesn't know. @param {Cmd} c */
const nameOf = (c) => NAMES[c.name]?.[0] ?? `/${c.name}`;

/** A button's two lines: the name (red when only operators can use it) and what it does. @param {string} name @param {string} hint @param {boolean} op */
const button = (name, hint, op) => `${op ? OP_COLOR : ""}${fit(name)}\n§8${fit(hint)}`;

/** @param {Cmd} c */
const cmdLabel = (c) => button(nameOf(c), NAMES[c.name]?.[1] ?? whatItDoes(c), isOpCmd(c));

/** The buttons of a list of commands; each comes back to `back` (the list) once it has run. @param {Player} player @param {Cmd[]} cmds @param {() => Promise<unknown>} back */
const cmdEntries = (player, cmds, back) => cmds.map((c) => /** @type {Entry} */ ({ label: cmdLabel(c), open: () => openCommand(player, c, undefined, back) }));

/** The top line of every page for operators: what the colors mean. @param {Player} player @param {string} rest */
const legend = (player, rest) => (isOp(player) ? `${OP_TEXT}Red§r = operators only. The rest is for every player.\n${rest}` : rest);

/** @type {Set<string>} packs that sit on a page of their own (Realm Configuration's commands are on Operator Tools) */
const OWN_PAGE = new Set(["admin_bp"]);

/**
 * The groups with the commands this player may use, sections in order, empty ones left out. A pack no
 * group lists lands in "Other".
 * @param {Cmd[]} cmds
 * @returns {{ id: string, title: string, hint: string, sections: { title: string, cmds: Cmd[] }[] }[]}
 */
function grouped(cmds) {
  const placed = new Set(OWN_PAGE);
  const rank = (/** @type {Cmd} */ c) => [isOpCmd(c) ? 1 : 0, c.name.includes("_") ? 1 : 0];
  const out = [];
  for (const g of GROUPS) {
    const sections = [];
    for (const sec of g.sections) {
      sec.packs.forEach((f) => placed.add(f));
      const inSec = cmds
        .filter((c) => sec.packs.includes(c.folder))
        .sort((a, b) => {
          const ra = rank(a), rb = rank(b);
          return sec.packs.indexOf(a.folder) - sec.packs.indexOf(b.folder) || ra[0] - rb[0] || ra[1] - rb[1] || a.name.localeCompare(b.name);
        });
      if (inSec.length) sections.push({ title: sec.title, cmds: inSec });
    }
    if (sections.length) out.push({ id: g.id, title: g.title, hint: g.hint, sections });
  }
  const other = cmds.filter((c) => !placed.has(c.folder)).sort((a, b) => a.pack.localeCompare(b.pack) || a.name.localeCompare(b.name));
  if (other.length) out.push({ id: "other", title: "Other", hint: "Packs the menu doesn't sort yet", sections: [{ title: "Other packs", cmds: other }] });
  return out;
}

/** @param {Player} player */
async function mainMenu(player) {
  const cmds = await available(player);
  const op = isOp(player);
  const home = () => mainMenu(player);
  const rec = shownRecents(player, cmds);
  const has = (/** @type {string} */ name) => cmds.some((c) => c.name === name);
  /** @type {Entry[]} */
  const entries = [];
  if (has("realm:prefs")) entries.push({ label: button("My Preferences", "Your own settings, every pack", false), open: async () => exec(player, "realm:prefs", "My Preferences") });
  if (op && has("realm:config")) entries.push({ label: button("Realm Settings", "Every pack's settings, for all", true), open: async () => exec(player, "realm:config", "Realm Settings") });
  entries.push({ label: button(`Recent (${rec.length})`, "Run one of your last again", false), open: () => recentPage(player, home) });
  entries.push({ label: button("Search", "Find a command by any word", false), open: () => searchPage(player, cmds, home) });

  entries.push({ header: "What do you want to do?" });
  for (const g of grouped(cmds)) entries.push({ label: button(g.title, g.hint, false), open: () => groupPage(player, g.id, home) });
  if (op) entries.push({ label: button("Operator Tools", "Quick actions, setup checklist", true), open: () => opsPage(player, home) });

  const packCount = new Set(cmds.map((c) => c.folder)).size;
  const body = `${cmds.length} commands${op ? "" : " you can use"} from ${packCount} packs. Each page scrolls; the second line of a button says what it does.`;
  await list(player, `§l${TITLE}`, legend(player, body), entries, undefined);
}

/** One group: every command of its packs on one scrolling page, a heading per section. @param {Player} player @param {string} id @param {() => Promise<unknown>} back */
async function groupPage(player, id, back) {
  const again = () => groupPage(player, id, back);
  const group = grouped(await available(player)).find((g) => g.id === id);
  if (!group) return back();
  /** @type {Entry[]} */
  const entries = [];
  for (const sec of group.sections) entries.push({ header: sec.title }, ...cmdEntries(player, sec.cmds, again));
  await list(player, group.title, legend(player, "Tap one to run it. Its options, if it has any, come with preset choices."), entries, back);
}

/** @param {Player} player @param {Cmd[]} cmds @param {() => Promise<unknown>} back */
async function searchPage(player, cmds, back) {
  const res = await show(player, new ModalFormData().title("Search").textField("Search for", "weather, party, sort...", { defaultValue: "" }).submitButton("Search"));
  if (!res) return back();
  const q = String(inputsOf(res.formValues ?? [], [true])[0] ?? "").trim().toLowerCase();
  return resultsPage(player, cmds, q, back);
}

/** The matches of a search; a command run from here comes back here. @param {Player} player @param {Cmd[]} cmds @param {string} q @param {() => Promise<unknown>} back */
async function resultsPage(player, cmds, q, back) {
  const words = q.split(/\s+/).filter(Boolean);
  const hit = (/** @type {string} */ s) => words.every((w) => s.toLowerCase().includes(w));
  const found = cmds.filter((c) => hit(`${c.name} ${c.description} ${c.pack} ${(NAMES[c.name] ?? []).join(" ")}`));
  const actions = isOp(player) ? ACTIONS.filter((a) => hit(`${a.title} ${a.hint} ${a.help}`)) : [];
  const again = () => resultsPage(player, cmds, q, back);
  const search = () => searchPage(player, cmds, back);
  /** @type {Entry[]} */
  const entries = [
    ...actions.map((a) => ({ label: button(a.title, `Quick action: ${a.hint}`, true), open: () => openAction(player, a, again) })),
    ...cmdEntries(player, found, again),
  ];
  const n = entries.length;
  entries.push({ label: button("Search again", "Another word", false), open: search });
  await list(player, "Search", legend(player, n ? `${n} match${n === 1 ? "" : "es"} for "${q}".` : `Nothing matches "${q}".`), entries, back);
}

/** This player's recent commands that they may still run (a former operator's operator ones are left out). @param {Player} player @param {Cmd[]} cmds */
const shownRecents = (player, cmds) => recents(player).filter((e) => (e.a ? isOp(player) : cmds.some((c) => c.name === String(e.l ?? "").split(" ")[0])));

/** @param {Player} player @param {() => Promise<unknown>} back */
async function recentPage(player, back) {
  const cmds = await available(player);
  const rec = shownRecents(player, cmds);
  const again = () => recentPage(player, back);
  /** @type {Entry[]} */
  const entries = rec.map((e) => ({
    label: button(e.t, e.a ? `Quick action${e.v && Object.keys(e.v).length ? `: ${Object.values(e.v).join(", ")}` : ""}` : `/${e.l ?? ""}`, e.a ? true : needs(String(e.l ?? "").split(" ")[0]) > 0),
    open: async () => {
      if (e.a) {
        const action = ACTIONS.find((a) => a.id === e.a);
        if (action && isOp(player)) return runAction(player, action, e.v ?? {}, again);
        return again();
      }
      const name = String(e.l ?? "").split(" ")[0];
      const cmd = cmds.find((c) => c.name === name);
      if (!cmd) {
        player.sendMessage(`§c[${TITLE}] /${name} isn't available any more.`);
        return again();
      }
      const everyone = String(e.l).split(" ").includes("@a");
      if ((needsConfirm(name) || everyone) && !(await confirm(player, `Run /${e.l} again?${everyone ? "\n\nThis is for everyone online." : ""}`))) return again();
      exec(player, String(e.l), e.t);
      return resume(player, again);
    },
  }));
  const body = rec.length ? "Your last commands, newest first. Tap one to run it again right away, with the same options (shown under its name)." : "Nothing yet: commands you run from this menu show up here.";
  await list(player, "Recent", legend(player, body), entries, back);
}

/**
 * Operator Tools: the quick actions, the server setup checklist and Realm Configuration's own commands,
 * on one scrolling page. Only operators see it; every button checks again before it runs.
 * @param {Player} player @param {() => Promise<unknown>} back
 */
async function opsPage(player, back) {
  if (!isOp(player)) return back();
  const cmds = await available(player);
  pingZones();
  await system.waitTicks(Math.max(2, Number(CONFIG.answerTicks) || 10));
  if (!player.isValid) return;
  const zones = allZones();
  const count = { zones: zones.filter((z) => z.src === "zones").length, towns: zones.filter((z) => z.src === "town").length };
  const again = () => opsPage(player, back);
  /** @type {Entry[]} */
  const entries = [{ header: "Quick actions" }, { text: "§7Vanilla things you would otherwise type. They work without cheats." }];
  for (const a of ACTIONS) entries.push({ label: button(a.title, a.hint, true), open: () => openAction(player, a, again) });

  /** @type {Entry[]} */
  const setup = [];
  for (const item of SETUP) {
    const cmd = cmds.find((c) => c.name === item.cmd);
    if (!cmd) continue;
    const n = item.done ? count[item.done] : undefined;
    const mark = n === undefined ? "§8[ ]" : n > 0 ? "§2[x]" : "§c[ ]";
    const extra = n === undefined ? "" : ` §8(${n})`;
    setup.push({ label: `${mark} ${OP_COLOR}${item.title}${extra}\n§8${fit(item.hint)}`, open: () => openCommand(player, cmd, item.help, again) });
  }
  if (setup.length) entries.push({ header: "Server setup checklist" }, { text: "§7One-time jobs across the packs. §2[x]§7 means its pack says it's done; the others can't be checked from here." }, ...setup);

  const own = cmds.filter((c) => OWN_PAGE.has(c.folder) && !ACTIONS.some((a) => a.title === nameOf(c))); // Show a Title is a quick action already
  if (own.length) entries.push({ header: TITLE }, ...cmdEntries(player, own, again));
  await list(player, "Operator Tools", `${OP_TEXT}Red§r = operators only: everything on this page is.`, entries, back);
}

/** @type {Set<string>} players with the menu open */
const open = new Set();
// A player who leaves with the menu open (or while it waits for the packs to answer) keeps the same id
// when they come back: without this they couldn't open it again until the world restarts.
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  open.delete(playerId);
  resumed.delete(playerId);
  toldFull.delete(playerId);
  toldFailed.delete(playerId);
  updatingItem.delete(playerId);
  dirtyWhileUpdating.delete(playerId);
  scheduledItem.delete(playerId);
});

/** @param {Player} player */
function openMenu(player) {
  if (open.has(player.id)) return;
  open.add(player.id);
  mainMenu(player)
    .catch((e) => console.warn(`[admin] ${e}`))
    .finally(() => open.delete(player.id));
}

// ---------------------------------------------------------------------------
// The item
// ---------------------------------------------------------------------------

/** @type {Set<string>} players whose inventory slots are being written by this script */
const updatingItem = new Set();
/** @type {Set<string>} players who received an external inventory change while updatingItem was active */
const dirtyWhileUpdating = new Set();
/** @type {Set<string>} players with a reconcile already queued for the next tick */
const scheduledItem = new Set();
/** @type {Set<string>} players already warned about a failed duplicate removal or normalization */
const toldFailed = new Set();

/** @param {Player} player */
function markUpdating(player) {
  const id = player.id;
  if (updatingItem.has(id)) return;
  updatingItem.add(id);
  system.run(() => {
    updatingItem.delete(id);
    if (dirtyWhileUpdating.has(id)) {
      dirtyWhileUpdating.delete(id);
      if (player.isValid) scheduleReconcile(player);
    }
  });
}

const REAL_MARKS = new Set([MARK, ...OLD_MARKS].map((m) => plain(m).trim()));
const KNOWN_LORE_PREFIXES = [
  ["Hold it in your hand and use it", "to open the realm menu:"],
  ["Use it to open the realm menu:", "every realm command you can use,"],
  ["Use it to open the admin menu:", "every realm command in one place,"],
];

/**
 * The real item, made by this pack (current or legacy pack marker/fingerprint, even if recolored or anvil-renamed).
 * Also one made of another item than `itemType` (a world that changed it, or an older copy): it's locked in the
 * inventory and can't be dropped, so it must count, be replaced and never be doubled. Only its exact lore counts then.
 * @param {ItemStack | undefined} it
 */
const isRealItem = (it) => {
  if (!it) return false;
  try {
    const lore = it.getLore();
    if (!lore.length) return false;
    if (lore.includes(MARK) || OLD_MARKS.some((m) => lore.includes(m))) return true;
    const stripped = lore.map((l) => plain(l).trim());
    if (KNOWN_LORE_PREFIXES.some((prefix) => prefix.every((line, idx) => stripped[idx] === line))) return true;
    return it.typeId === CONFIG.itemType && stripped.some((l) => REAL_MARKS.has(l));
  } catch {
    return false;
  }
};

/** @param {ItemStack | undefined} it named Realm Configuration (also one renamed on an anvil) or the real item */
const isConfigItem = (it) => (!!it && it.typeId === CONFIG.itemType && plain(it.nameTag).trim() === TITLE) || isRealItem(it);

function makeItem() {
  const it = new ItemStack(CONFIG.itemType, 1);
  it.nameTag = `§r§6${TITLE}`;
  it.setLore(LORE);
  it.keepOnDeath = true;
  try {
    it.lockMode = ItemLockMode.inventory;
  } catch {
    // some items can't be locked
  }
  return it;
}

/** @param {Player} player */
const inventory = (player) => player.getComponent(EntityComponentTypes.Inventory)?.container;
/** @param {Player} player */
const equippable = (player) => player.getComponent(EntityComponentTypes.Equippable);

/** @param {ItemStack} item @returns {boolean} */
function needsNormalize(item) {
  try {
    const lore = item.getLore();
    const sameLore = lore.length === LORE.length && lore.every((l, idx) => l === LORE[idx]);
    const locked = item.lockMode === ItemLockMode.inventory;
    return item.typeId !== CONFIG.itemType || item.amount !== 1 || item.nameTag !== `§r§6${TITLE}` || !sameLore || !item.keepOnDeath || !locked;
  } catch {
    return true;
  }
}

/** @param {ItemStack} item @returns {ItemStack} */
function normalizedItem(item) {
  if (item.typeId !== CONFIG.itemType) return makeItem(); // made of an older itemType: a fresh one of the current
  const copy = typeof item.clone === "function" ? item.clone() : makeItem();
  copy.amount = 1;
  copy.nameTag = `§r§6${TITLE}`;
  copy.setLore(LORE);
  copy.keepOnDeath = true;
  try {
    copy.lockMode = ItemLockMode.inventory;
  } catch {
    // some items can't be locked
  }
  return copy;
}

/** Rank of a slot when choosing which single copy to keep: selected hotbar slot first, then hotbar, then main inventory. @param {Player} player @param {number} slot */
function slotPriority(player, slot) {
  if (slot === player.selectedSlotIndex) return -1;
  return slot;
}

/**
 * Ensures the player carries at most one real Realm Configuration item (amount 1, normalized lore/lock/keepOnDeath),
 * removing any extra real copies across the inventory, offhand and cursor while leaving anvil-renamed items alone.
 * @param {Player} player
 * @param {boolean} [tellFailure] always tell the player if a removal or normalization failed
 * @returns {{ hasItem: boolean, hasReal: boolean, removedExtras: number, failedRemovals: number }}
 */
function reconcileItems(player, tellFailure = false) {
  const inv = inventory(player);
  if (!inv) return { hasItem: true, hasReal: true, removedExtras: 0, failedRemovals: 0 };
  /** @type {number[]} */
  const realSlots = [];
  let hasAnvilConfig = false;
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (!isConfigItem(it)) continue;
    if (isRealItem(it)) realSlots.push(i);
    else hasAnvilConfig = true;
  }

  let removedExtras = 0;
  let failedRemovals = 0;
  let keptReal = false;

  if (realSlots.length > 0) {
    realSlots.sort((a, b) => slotPriority(player, a) - slotPriority(player, b));
    const keptSlot = realSlots[0];
    keptReal = true;
    const kept = /** @type {ItemStack} */ (inv.getItem(keptSlot));
    const extraInKept = Math.max(0, kept.amount - 1);
    if (needsNormalize(kept)) {
      try {
        markUpdating(player);
        inv.setItem(keptSlot, normalizedItem(kept));
        const after = inv.getItem(keptSlot);
        if (!after || !isRealItem(after)) {
          failedRemovals += Math.max(1, extraInKept);
        } else if (after.amount > 1) {
          removedExtras += Math.max(0, kept.amount - after.amount);
          failedRemovals += after.amount - 1;
        } else if (needsNormalize(after)) {
          removedExtras += extraInKept;
          failedRemovals += 1;
        } else {
          removedExtras += extraInKept;
        }
      } catch {
        failedRemovals += Math.max(1, extraInKept);
      }
    }
    for (let j = 1; j < realSlots.length; j++) {
      const slot = realSlots[j];
      const dup = inv.getItem(slot);
      const count = dup?.amount ?? 1;
      try {
        markUpdating(player);
        inv.setItem(slot, undefined);
        const rem = inv.getItem(slot);
        if (rem && isRealItem(rem)) failedRemovals += rem.amount;
        else removedExtras += count;
      } catch {
        failedRemovals += count;
      }
    }
  }

  // Also check offhand for a duplicate or stray real item.
  let eq;
  let offItem;
  try {
    eq = equippable(player);
    offItem = eq?.getEquipment(EquipmentSlot.Offhand);
  } catch {
    // equippable unavailable
  }
  if (eq && offItem && isRealItem(offItem)) {
    if (keptReal) {
      const count = offItem.amount;
      try {
        markUpdating(player);
        eq.setEquipment(EquipmentSlot.Offhand, undefined);
        const rem = eq.getEquipment(EquipmentSlot.Offhand);
        if (rem && isRealItem(rem)) failedRemovals += rem.amount;
        else removedExtras += count;
      } catch {
        failedRemovals += count;
      }
    } else {
      keptReal = true;
      const extra = Math.max(0, offItem.amount - 1);
      try {
        markUpdating(player);
        const rest = inv.addItem(normalizedItem(offItem));
        if (!rest) {
          eq.setEquipment(EquipmentSlot.Offhand, undefined);
          const rem = eq.getEquipment(EquipmentSlot.Offhand);
          if (rem && isRealItem(rem)) failedRemovals += rem.amount;
          else removedExtras += extra;
        } else if (needsNormalize(offItem)) {
          eq.setEquipment(EquipmentSlot.Offhand, normalizedItem(offItem));
          const rem = eq.getEquipment(EquipmentSlot.Offhand);
          if (!rem || !isRealItem(rem)) failedRemovals += Math.max(1, extra);
          else if (rem.amount > 1) failedRemovals += rem.amount - 1;
          else if (needsNormalize(rem)) failedRemovals += 1;
          else removedExtras += extra;
        }
      } catch {
        failedRemovals += Math.max(1, extra);
      }
    }
  } else if (offItem && isConfigItem(offItem)) {
    hasAnvilConfig = true;
  }

  // Also check cursor inventory for a duplicate or stray real item.
  let cursor;
  let cItem;
  try {
    cursor = player.getComponent("minecraft:cursor_inventory");
    cItem = cursor?.item;
  } catch {
    // cursor_inventory unavailable
  }
  if (cursor && cItem && isRealItem(cItem)) {
    if (keptReal) {
      const count = cItem.amount;
      try {
        markUpdating(player);
        cursor.clear();
        if (cursor.item && isRealItem(cursor.item)) failedRemovals += cursor.item.amount;
        else removedExtras += count;
      } catch {
        failedRemovals += count;
      }
    } else {
      keptReal = true;
      const extra = Math.max(0, cItem.amount - 1);
      if (needsNormalize(cItem)) {
        try {
          markUpdating(player);
          const rest = inv.addItem(normalizedItem(cItem));
          if (!rest) {
            cursor.clear();
            if (cursor.item && isRealItem(cursor.item)) failedRemovals += cursor.item.amount;
            else removedExtras += extra;
          } else {
            failedRemovals += Math.max(1, extra);
          }
        } catch {
          failedRemovals += Math.max(1, extra);
        }
      }
    }
  } else if (cItem && isConfigItem(cItem)) {
    hasAnvilConfig = true;
  }

  if (failedRemovals > 0) {
    console.warn(`[admin] could not remove or normalize ${failedRemovals} ${TITLE} item(s) for ${player.name}`);
    if (tellFailure || !toldFailed.has(player.id)) {
      player.sendMessage(`§cCould not remove ${failedRemovals} extra ${TITLE} item(s).`);
      toldFailed.add(player.id);
    }
  } else {
    toldFailed.delete(player.id);
  }

  return { hasItem: keptReal || hasAnvilConfig, hasReal: keptReal, removedExtras, failedRemovals };
}

/** @param {Player} player */
function carries(player) {
  return reconcileItems(player).hasItem;
}

/** Players told their inventory was too full for the item (the 30 s check doesn't repeat it). @type {Set<string>} */
const toldFull = new Set();

/** Gives the item unless they carry one. @param {Player} player @param {boolean} tell say so if they already have one */
function giveItem(player, tell) {
  const before = reconcileItems(player, tell);
  if (before.hasItem) {
    if (tell && before.failedRemovals === 0) {
      if (before.removedExtras > 0) {
        player.sendMessage(`§7Removed ${before.removedExtras} extra ${TITLE} item${before.removedExtras === 1 ? "" : "s"}; you carry one.`);
      } else {
        player.sendMessage(`§7You already carry the ${TITLE} item.`);
      }
    }
    return false;
  }
  const inv = inventory(player);
  if (!inv) return false;
  markUpdating(player);
  const rest = inv.addItem(makeItem());
  if (rest) {
    // The 30 s check would say it again and again: once per player until the realm restarts, unless asked.
    if (tell || !toldFull.has(player.id)) player.sendMessage(`§e[${TITLE}] Your inventory is full: make room for the ${TITLE} item, or run /realm:admin_item.`);
    toldFull.add(player.id);
    return false;
  }
  toldFull.delete(player.id);
  const after = reconcileItems(player, tell);
  if (!after.hasItem || after.failedRemovals > 0) return false;
  player.sendMessage(`§6[${TITLE}] §rYou have the §6${TITLE}§r item: use it for every realm command you can use, in one menu.`);
  return true;
}

const HINT_PROP = "admin:setupHint"; // player: true once told where the setup checklist is

/**
 * First run on a new world: an operator's first item comes with where the one-time setup jobs are (townsfolk,
 * towns, safe zones...), once per operator, so a new server owner doesn't have to find them in the docs.
 * @param {Player} player
 */
function setupHint(player) {
  try {
    if (player.getDynamicProperty(HINT_PROP) === true || !hasRealItem(player)) return;
    player.setDynamicProperty(HINT_PROP, true);
  } catch {
    return;
  }
  player.sendMessage(`§6[${TITLE}] §rSetting up a new world? Open the item, then §6Operator Tools§r (the last button): its server setup checklist has every one-time job, such as placing the townsfolk, towns and safe zones.`);
}

/** Takes the real item from someone who isn't an operator (only while the item is for operators only). @param {Player} player */
function takeItem(player) {
  const inv = inventory(player);
  if (!inv) return { took: 0, failed: 0 };
  let took = 0;
  let failed = 0;
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (!isRealItem(it)) continue;
    const count = it?.amount ?? 1;
    try {
      markUpdating(player);
      inv.setItem(i, undefined);
      if (isRealItem(inv.getItem(i))) failed += inv.getItem(i)?.amount ?? 1;
      else took += count;
    } catch {
      failed += count;
    }
  }
  let eq;
  let offItem;
  try {
    eq = equippable(player);
    offItem = eq?.getEquipment(EquipmentSlot.Offhand);
  } catch {
    // equippable unavailable
  }
  if (eq && offItem && isRealItem(offItem)) {
    const count = offItem.amount;
    try {
      markUpdating(player);
      eq.setEquipment(EquipmentSlot.Offhand, undefined);
      const rem = eq.getEquipment(EquipmentSlot.Offhand);
      if (rem && isRealItem(rem)) failed += rem.amount;
      else took += count;
    } catch {
      failed += count;
    }
  }
  let cursor;
  let cItem;
  try {
    cursor = player.getComponent("minecraft:cursor_inventory");
    cItem = cursor?.item;
  } catch {
    // cursor_inventory unavailable
  }
  if (cursor && cItem && isRealItem(cItem)) {
    const count = cItem.amount;
    try {
      markUpdating(player);
      cursor.clear();
      if (cursor.item && isRealItem(cursor.item)) failed += cursor.item.amount;
      else took += count;
    } catch {
      failed += count;
    }
  }
  if (failed > 0) {
    console.warn(`[admin] could not remove ${failed} ${TITLE} item(s) from non-operator ${player.name}`);
    if (!toldFailed.has(player.id)) {
      player.sendMessage(`§cCould not remove ${failed} ${TITLE} item(s).`);
      toldFailed.add(player.id);
    }
  } else {
    toldFailed.delete(player.id);
  }
  if (took && !failed) player.sendMessage(`§7The ${TITLE} item is for operators here, so it was put away.`);
  return { took, failed };
}

/** @param {Player} player */
function check(player) {
  if (!player.isValid) return;
  const all = forEveryone();
  if (all || isOp(player)) {
    const { hasItem } = reconcileItems(player);
    if ((all || get("giveToOperators") === true) && !hasItem) giveItem(player, false);
  } else if (get("removeFromOthers") === true) {
    takeItem(player);
  } else {
    reconcileItems(player);
  }
  // Also an owner who joined first and was made an operator afterwards (usual on a new dedicated server).
  if (isOp(player)) setupHint(player);
}

/** @param {Player} player */
function hasRealItem(player) {
  const inv = inventory(player);
  if (!inv) return false;
  for (let i = 0; i < inv.size; i++) if (isRealItem(inv.getItem(i))) return true;
  return false;
}

/** Schedules a reconcile on the next tick when a Realm Configuration item changes in the inventory. @param {Player} player */
function scheduleReconcile(player) {
  const id = player.id;
  if (scheduledItem.has(id)) return;
  scheduledItem.add(id);
  system.run(() => {
    scheduledItem.delete(id);
    try {
      if (!player.isValid) return;
      if (updatingItem.has(id)) {
        dirtyWhileUpdating.add(id);
        return;
      }
      if (!forEveryone() && !isOp(player) && get("removeFromOthers") === true) takeItem(player);
      else reconcileItems(player);
    } catch (e) {
      console.warn(`[admin] ${e}`);
    }
  });
}

onChange(() => {
  for (const p of world.getAllPlayers()) {
    try {
      check(p);
    } catch (e) {
      console.warn(`[admin] ${e}`);
    }
  }
});

world.afterEvents.playerInventoryItemChange?.subscribe((event) => {
  try {
    const player = event.player;
    if (!player?.isValid) return;
    if (!isRealItem(event.itemStack) && !isRealItem(event.beforeItemStack)) {
      const cursor = player.getComponent("minecraft:cursor_inventory");
      if (!isRealItem(cursor?.item)) return;
    }
    if (updatingItem.has(player.id)) {
      dirtyWhileUpdating.add(player.id);
      return;
    }
    scheduleReconcile(player);
  } catch (e) {
    console.warn(`[admin] ${e}`);
  }
});

world.afterEvents.playerSpawn.subscribe(({ player }) => {
  system.run(() => {
    try {
      if (player.isValid) reconcileItems(player);
    } catch (e) {
      console.warn(`[admin] ${e}`);
    }
  });
  system.runTimeout(() => {
    try {
      check(player);
    } catch (e) {
      console.warn(`[admin] ${e}`);
    }
  }, 40);
});

let seconds = 0;
system.runInterval(() => {
  if (++seconds < Math.max(5, Number(get("checkSeconds")) || 30)) return;
  seconds = 0;
  for (const p of world.getAllPlayers()) {
    try {
      check(p);
    } catch (e) {
      console.warn(`[admin] ${e}`);
    }
  }
}, 20);

world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  if (!isConfigItem(itemStack)) return;
  // With the item for operators only (giveToPlayers off), someone else's real item is put away instead.
  if (!isOp(source) && !forEveryone() && get("removeFromOthers") === true && isRealItem(itemStack)) {
    system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: source.id, ticks: 60, from: "admin_bp" })); // other bar writers wait
    source.onScreenDisplay.setActionBar(`§7The ${TITLE} item is for operators here. /realm:admin opens the menu`);
    system.run(() => takeItem(source));
    return;
  }
  system.run(() => {
    try {
      if (source.isValid) reconcileItems(source);
    } catch (e) {
      console.warn(`[admin] ${e}`);
    }
  });
  openMenu(source);
});

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** @param {import("@minecraft/server").CustomCommandOrigin} origin */
const originPlayer = (origin) => {
  const p = origin.initiator ?? origin.sourceEntity;
  return p instanceof Player ? p : undefined;
};

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:admin_title",
      description: "Show a title (and subtitle) that the Minimap compass and the side boxes leave alone: use it instead of /title. Default everyone online, 5 seconds",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "title", type: CustomCommandParamType.String }],
      optionalParameters: [
        { name: "subtitle", type: CustomCommandParamType.String },
        { name: "seconds", type: CustomCommandParamType.Integer },
        { name: "player", type: CustomCommandParamType.PlayerSelector },
      ],
    },
    (origin, /** @type {string} */ title, /** @type {string | undefined} */ subtitle, /** @type {number | undefined} */ seconds, /** @type {Player[] | undefined} */ targets) => {
      const player = originPlayer(origin);
      if (player && !isOp(player)) return { status: CustomCommandStatus.Failure, message: "Realm Configuration is for operators." };
      if (!String(title ?? "").trim()) return { status: CustomCommandStatus.Failure, message: "Give the title's text (in quotes if it has spaces)." };
      if (seconds !== undefined && (seconds < 1 || seconds > TITLE_MAX_SECONDS)) return { status: CustomCommandStatus.Failure, message: `Seconds: 1 to ${TITLE_MAX_SECONDS}.` };
      if (targets && !targets.length) return { status: CustomCommandStatus.Failure, message: "No player matches." };
      system.run(() => {
        const list = targets ?? world.getAllPlayers();
        const n = showTitle(list, title, subtitle ?? "", seconds ?? 5);
        player?.sendMessage(`§7[${TITLE}] Title shown to ${n} player${n === 1 ? "" : "s"} for ${seconds ?? 5} s.`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:admin",
      description: "Realm Configuration: one menu for every realm command you can use, with preset choices (operators: theirs in red)",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = originPlayer(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => openMenu(player));
      return { status: CustomCommandStatus.Success };
    }
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:admin_item",
      description: "Realm Configuration: get the menu item again (operators: give it to other players too)",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
      optionalParameters: [{ name: "player", type: CustomCommandParamType.PlayerSelector }],
    },
    (origin, /** @type {Player[] | undefined} */ targets) => {
      const player = originPlayer(origin);
      const op = !player || isOp(player);
      const list = targets?.length ? targets : player ? [player] : [];
      if (!list.length) return { status: CustomCommandStatus.Failure, message: "Name a player." };
      if (!op && list.some((p) => p.id !== player?.id)) return { status: CustomCommandStatus.Failure, message: "Only operators can give the item to other players." };
      if (!op && !forEveryone()) return { status: CustomCommandStatus.Failure, message: "The Realm Configuration item is for operators here. /realm:admin opens the menu." };
      system.run(() => {
        for (const p of list) {
          if (!p.isValid) continue;
          if (!isOp(p) && !forEveryone()) {
            player?.sendMessage(`§c${p.name} isn't an operator, and the ${TITLE} item is for operators here.`);
            continue;
          }
          giveItem(p, p === player);
          if (player && p !== player) {
            const after = reconcileItems(p);
            if (!after.hasItem) player.sendMessage(`§cCould not give ${p.name} the ${TITLE} item (inventory full).`);
            else if (after.failedRemovals > 0) player.sendMessage(`§cCould not remove ${after.failedRemovals} extra ${TITLE} item(s) from ${p.name}.`);
            else player.sendMessage(`§7Checked ${p.name}: they have the ${TITLE} item.`);
          }
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
});
