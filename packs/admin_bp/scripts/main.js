import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  EntityComponentTypes,
  ItemLockMode,
  ItemStack,
  Player,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import { ACTIONS } from "./actions.js";
import { ENUMS, PACKS } from "./catalog.js";
import { CONFIG } from "./config.js";
import { CATEGORIES, PARAMS, SETUP, needsConfirm } from "./presets.js";
import { get } from "./settings.js";
import { allZones, pingZones } from "./zones.js";

// Realm Configuration: one item, one menu, every realm: command. The commands come from catalog.js
// (generated from every pack's registrations); picking one asks for its options with preset choices,
// then runs it as the operator with player.runCommand, so the command's own checks and menus apply.
// This pack holds no other pack's data: it only runs their commands.

/**
 * @typedef {import("./catalog.js").Command & { folder: string, pack: string }} Cmd
 * @typedef {import("./actions.js").Action} Action
 * @typedef {{ t: string, l?: string, a?: string, v?: import("./actions.js").Values }} Recent
 * @typedef {{ label: string, open: () => Promise<unknown> }} Entry
 */

const TITLE = "Realm Configuration";
const RECENT_PROP = "admin:recent";
const LORE = ["§r§7Use it to open the admin menu:", "§r§7every realm command in one place,", "§r§7with preset choices.", "§r§8Operators only"];
const MARK = /** @type {string} */ (LORE.at(-1));
const RANK = { any: 0, op: 1, admin: 2, host: 3, owner: 4 };

/** @type {Cmd[]} every command in the catalog */
const ALL = PACKS.flatMap((p) => p.commands.map((c) => ({ ...c, folder: p.folder, pack: p.pack })));

/** @param {Player} p */
const isOp = (p) => p.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
/** @param {unknown} s */
const plain = (s) => String(s ?? "").replace(/§./g, "");
/** @param {string} s @param {number} n */
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 3).trimEnd()}...` : s);
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
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = /** @type {any} */ (await form.show(player));
    if (res.canceled && res.cancelationReason === FormCancelationReason.UserBusy) {
      await system.waitTicks(20);
      continue;
    }
    return res.canceled ? undefined : res;
  }
  if (player.isValid) player.sendMessage("§eCouldn't open the menu. Close chat or your inventory and try again.");
  return undefined;
}

/** A list of buttons; picking one opens it. @param {Player} player @param {string} title @param {string} body @param {Entry[]} entries @param {(() => Promise<unknown>) | undefined} back */
async function list(player, title, body, entries, back) {
  const form = new ActionFormData().title(title).body(body);
  for (const e of entries) form.button(e.label);
  if (back) form.button("Back");
  const res = await show(player, form);
  if (res?.selection === undefined) return;
  if (res.selection < entries.length) return entries[res.selection].open();
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
  // The menu can stay open a while: someone who stopped being an operator meanwhile runs nothing.
  if (!isOp(player)) {
    player.sendMessage(`§c[${TITLE}] /${line} didn't run: you aren't an operator any more.`);
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

/** What an input is called. @param {import("./catalog.js").Param} p */
const paramLabel = (p) => {
  const base = p.name.replace(/^realm:/, "").replace(/_/g, " ");
  return base.charAt(0).toUpperCase() + base.slice(1);
};

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
  const form = new ModalFormData().title(`/${cmd.name}`);
  /** @type {boolean[]} */
  const isInput = [];
  /** @type {{ count: number, read: (v: any[]) => string | { error: string } }[]} */
  const readers = [];
  form.label(`${cmd.description}${note ? `\n\n§7${note}` : ""}`);
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
      const shown = values.map((v) => pre.names?.[v] ?? v);
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
 * Opens a command: asks for its options (if it has any), asks first if it's destructive, runs it.
 * @param {Player} player @param {Cmd} cmd @param {string} [note]
 */
async function openCommand(player, cmd, note) {
  if (!cmd.params.length) {
    if (needsConfirm(cmd.name) && !(await confirm(player, `Run /${cmd.name}?\n\n${cmd.description}`))) return;
    exec(player, cmd.name, `/${cmd.name}`);
    return;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const { form, isInput, readers } = paramForm(player, cmd, note);
    const res = await show(player, form);
    if (!res) return;
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
      const again = await show(player, new MessageFormData().title(`/${cmd.name}`).body(`§c${error}`).button1("Try again").button2("Cancel"));
      if (again?.selection !== 0) return;
      continue;
    }
    const line = [cmd.name, ...args].join(" ");
    if (needsConfirm(cmd.name) && !(await confirm(player, `Run /${line}?\n\n${cmd.description}`))) return;
    exec(player, line, `/${line}`);
    return;
  }
}

/**
 * A quick action: its own form (or the realm command that should do it instead), then run it.
 * @param {Player} player @param {Action} action
 */
async function openAction(player, action) {
  if (action.use) {
    const cmd = (await available(player)).find((c) => c.name === action.use);
    if (cmd) return openCommand(player, cmd, `${action.title}: the ${cmd.pack} pack owns this, so its command does it.`);
  }
  /** @type {import("./actions.js").Values} */
  let values = {};
  const form = action.form?.(player);
  if (form) {
    const res = await show(player, form.submitButton("Do it"));
    if (!res) return;
    const read = action.read ? action.read(player, res.formValues ?? []) : {};
    if (typeof read === "string") return void player.sendMessage(`§c[${TITLE}] ${read}`);
    values = read;
  }
  return runAction(player, action, values);
}

/** @param {Player} player @param {Action} action @param {import("./actions.js").Values} values */
async function runAction(player, action, values) {
  const ask = action.confirm?.(player, values);
  if (ask && !(await confirm(player, ask))) return;
  if (!isOp(player)) return void player.sendMessage(`§c[${TITLE}] ${action.title} didn't run: you aren't an operator any more.`);
  try {
    const said = action.run(player, values);
    player.sendMessage(`§7[${TITLE}] ${said}`);
    remember(player, { t: action.title, a: action.id, v: values });
  } catch (e) {
    player.sendMessage(`§c[${TITLE}] ${action.title} didn't work: ${errText(e)}`);
  }
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/** @param {Cmd} c */
const cmdLabel = (c) => `/${c.name.replace(/^realm:/, "realm:")}${c.permission === "any" ? "" : " §8(ops)"}\n§8${clip(c.description, 52)}`;

/** @param {Player} player @param {Cmd[]} cmds @param {() => Promise<unknown>} back */
const cmdEntries = (player, cmds, back) => cmds.map((c) => /** @type {Entry} */ ({ label: cmdLabel(c), open: () => openCommand(player, c) }));

/** @param {Player} player */
async function mainMenu(player) {
  const cmds = await available(player);
  const home = () => mainMenu(player);
  /** @type {Entry[]} */
  const entries = [];
  const settings = cmds.find((c) => c.name === "realm:config");
  if (settings) entries.push({ label: "Realm Settings\n§8Every pack's settings (/realm:config)", open: async () => exec(player, "realm:config", "Realm Settings") });
  entries.push({ label: "Search commands\n§8By name or what they do", open: () => searchPage(player, cmds, home) });
  const rec = recents(player);
  entries.push({ label: `Recent (${rec.length})\n§8Repeat one of your last commands`, open: () => recentPage(player, home) });
  entries.push({ label: "Server setup checklist\n§8One-time jobs across the packs", open: () => setupPage(player, cmds, home) });
  entries.push({ label: "Quick actions\n§8Time, weather, game mode, teleport, give...", open: () => actionsPage(player, home) });

  const placed = new Set();
  for (const cat of CATEGORIES) {
    const inCat = cmds.filter((c) => cat.packs.includes(c.folder));
    inCat.forEach((c) => placed.add(c.name));
    if (inCat.length) entries.push({ label: `${cat.title}\n§8${inCat.length} command${inCat.length === 1 ? "" : "s"}`, open: () => categoryPage(player, cat.title, inCat, home) });
  }
  const other = cmds.filter((c) => !placed.has(c.name));
  if (other.length) entries.push({ label: `Other\n§8${other.length} command${other.length === 1 ? "" : "s"}`, open: () => categoryPage(player, "Other", other, home) });

  const packCount = new Set(cmds.map((c) => c.folder)).size;
  await list(player, `§l${TITLE}`, `${cmds.length} commands from ${packCount} packs, in one place. Pick a category, search, or repeat a recent one. Options come with preset choices; commands that have their own menu open it.`, entries, undefined);
}

/** @param {Player} player @param {string} title @param {Cmd[]} cmds @param {() => Promise<unknown>} back */
async function categoryPage(player, title, cmds, back) {
  const again = () => categoryPage(player, title, cmds, back);
  const packs = [...new Set(cmds.map((c) => c.pack))].sort();
  const sorted = [...cmds].sort((a, b) => a.pack.localeCompare(b.pack) || a.name.localeCompare(b.name));
  await list(player, title, `From: ${packs.join(", ")}.`, cmdEntries(player, sorted, again), back);
}

/** @param {Player} player @param {Cmd[]} cmds @param {() => Promise<unknown>} back */
async function searchPage(player, cmds, back) {
  const res = await show(player, new ModalFormData().title("Search commands").textField("Search for", "weather, npc, give...", { defaultValue: "" }).submitButton("Search"));
  if (!res) return back();
  const q = String(inputsOf(res.formValues ?? [], [true])[0] ?? "").trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const hit = (/** @type {string} */ s) => words.every((w) => s.toLowerCase().includes(w));
  const found = cmds.filter((c) => hit(`${c.name} ${c.description} ${c.pack}`));
  const actions = ACTIONS.filter((a) => hit(`${a.title} ${a.help}`));
  /** @type {Entry[]} */
  const entries = [
    ...actions.map((a) => ({ label: `${a.title}\n§8Quick action`, open: () => openAction(player, a) })),
    ...cmdEntries(player, found, back),
  ];
  const again = () => searchPage(player, cmds, back);
  if (!entries.length) return list(player, "Search commands", `Nothing matches "${q}".`, [{ label: "Search again", open: again }], back);
  await list(player, "Search commands", `${entries.length} match${entries.length === 1 ? "" : "es"} for "${q}".`, entries, back);
}

/** @param {Player} player @param {() => Promise<unknown>} back */
async function recentPage(player, back) {
  const rec = recents(player);
  const cmds = await available(player);
  /** @type {Entry[]} */
  const entries = rec.map((e) => ({
    label: `${clip(e.t, 40)}\n§8${e.a ? "Quick action" : "Tap to run it again"}`,
    open: async () => {
      if (e.a) {
        const action = ACTIONS.find((a) => a.id === e.a);
        if (action) return runAction(player, action, e.v ?? {});
        return;
      }
      const name = String(e.l ?? "").split(" ")[0];
      const cmd = cmds.find((c) => c.name === name);
      if (!cmd) return void player.sendMessage(`§c[${TITLE}] /${name} isn't available any more.`);
      if (needsConfirm(name) && !(await confirm(player, `Run /${e.l} again?`))) return;
      exec(player, String(e.l), e.t);
    },
  }));
  await list(player, "Recent", rec.length ? "Your last commands, newest first. Tap one to run it again with the same options." : "Nothing yet: commands you run from this menu show up here.", entries, back);
}

/** @param {Player} player @param {Cmd[]} cmds @param {() => Promise<unknown>} back */
async function setupPage(player, cmds, back) {
  pingZones();
  await system.waitTicks(Math.max(2, Number(CONFIG.answerTicks) || 10));
  const zones = allZones();
  const count = { zones: zones.filter((z) => z.src === "zones").length, towns: zones.filter((z) => z.src === "town").length };
  /** @type {Entry[]} */
  const entries = [];
  for (const item of SETUP) {
    const cmd = cmds.find((c) => c.name === item.cmd);
    if (!cmd) continue;
    const n = item.done ? count[item.done] : undefined;
    const mark = n === undefined ? "§8[ ]§r" : n > 0 ? "§2[x]§r" : "§c[ ]§r";
    const extra = n === undefined ? "" : item.done === "towns" ? ` §8(${n} protected)` : ` §8(${n} set)`;
    entries.push({ label: `${mark} ${item.title}${extra}\n§8${clip(item.help, 52)}`, open: () => openCommand(player, cmd, item.help) });
  }
  await list(
    player,
    "Server setup checklist",
    "One-time jobs across the packs. Tap one to do it. §2[x]§r means its pack says it's done; the others can't be checked from here, so it's up to you.",
    entries,
    back
  );
}

/** @param {Player} player @param {() => Promise<unknown>} back */
async function actionsPage(player, back) {
  const entries = ACTIONS.map((a) => /** @type {Entry} */ ({ label: `${a.title}\n§8${clip(a.help, 52)}`, open: () => openAction(player, a) }));
  await list(player, "Quick actions", "Vanilla things you would otherwise type as commands. They work without cheats.", entries, back);
}

/** @type {Set<string>} players with the menu open */
const open = new Set();

/** @param {Player} player */
function openMenu(player) {
  if (open.has(player.id)) return;
  if (!isOp(player)) {
    player.sendMessage(`§7${TITLE} is for operators. Your own options: /realm:prefs`);
    return;
  }
  open.add(player.id);
  mainMenu(player)
    .catch((e) => console.warn(`[admin] ${e}`))
    .finally(() => open.delete(player.id));
}

// ---------------------------------------------------------------------------
// The item
// ---------------------------------------------------------------------------

/** @param {ItemStack | undefined} it named Realm Configuration (also one renamed on an anvil) */
const isConfigItem = (it) => !!it && it.typeId === CONFIG.itemType && plain(it.nameTag) === TITLE;
/** @param {ItemStack | undefined} it the real item, made by this pack */
const isRealItem = (it) => isConfigItem(it) && /** @type {ItemStack} */ (it).getLore().includes(MARK);

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
function carries(player) {
  const inv = inventory(player);
  if (!inv) return true; // can't tell: don't hand out another
  for (let i = 0; i < inv.size; i++) if (isConfigItem(inv.getItem(i))) return true;
  return false;
}

/** Gives the item unless they carry one. @param {Player} player @param {boolean} tell say so if they already have one */
function giveItem(player, tell) {
  if (carries(player)) {
    if (tell) player.sendMessage(`§7You already carry the ${TITLE} item.`);
    return false;
  }
  const rest = inventory(player)?.addItem(makeItem());
  if (rest) {
    player.sendMessage(`§e[${TITLE}] Your inventory is full: make room for the ${TITLE} item, or run /realm:admin_item.`);
    return false;
  }
  player.sendMessage(`§6[${TITLE}] §rYou have the §6${TITLE}§r item: use it to run any realm command from one menu.`);
  return true;
}

/** Takes the real item from someone who isn't an operator. @param {Player} player */
function takeItem(player) {
  const inv = inventory(player);
  if (!inv) return;
  let took = 0;
  for (let i = 0; i < inv.size; i++) {
    if (!isRealItem(inv.getItem(i))) continue;
    inv.setItem(i, undefined);
    took++;
  }
  if (took) player.sendMessage(`§7The ${TITLE} item is for operators, so it was put away.`);
}

/** @param {Player} player */
function check(player) {
  if (!player.isValid) return;
  if (isOp(player)) {
    if (get("giveToOperators") === true && !carries(player)) giveItem(player, false);
  } else if (get("removeFromOthers") === true) takeItem(player);
}

world.afterEvents.playerSpawn.subscribe(({ player }) => {
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
  if (!isOp(source)) {
    system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: source.id, ticks: 60 })); // other bar writers wait
    source.onScreenDisplay.setActionBar(`§7${TITLE} is for operators. Your own options: /realm:prefs`);
    if (get("removeFromOthers") === true) system.run(() => takeItem(source));
    return;
  }
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
      name: "realm:admin",
      description: "Realm Configuration: the operators' menu that runs every realm command, with preset choices",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
    },
    (origin) => {
      const player = originPlayer(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      if (!isOp(player)) return { status: CustomCommandStatus.Failure, message: "Realm Configuration is for operators." };
      system.run(() => openMenu(player));
      return { status: CustomCommandStatus.Success };
    }
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:admin_item",
      description: "Realm Configuration: get the admin menu item (or give it to other operators)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      optionalParameters: [{ name: "player", type: CustomCommandParamType.PlayerSelector }],
    },
    (origin, /** @type {Player[] | undefined} */ targets) => {
      const player = originPlayer(origin);
      if (player && !isOp(player)) return { status: CustomCommandStatus.Failure, message: "Realm Configuration is for operators." };
      const list = targets?.length ? targets : player ? [player] : [];
      if (!list.length) return { status: CustomCommandStatus.Failure, message: "Name a player." };
      system.run(() => {
        for (const p of list) {
          if (!p.isValid) continue;
          if (!isOp(p)) {
            player?.sendMessage(`§c${p.name} isn't an operator, so they can't have the ${TITLE} item.`);
            continue;
          }
          giveItem(p, p === player);
          if (player && p !== player) player.sendMessage(`§7Checked ${p.name}: they have the ${TITLE} item.`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
});
