import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, ItemLockMode, ItemTypes, Player, ScriptEventSource, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

// One world property per goal: "goals:g:<id>" -> JSON Goal. Contributions are kept per player id
// ([name, amount]), a few dozen bytes each, so a goal stays far below the 32 KB property limit.
const GOAL_PREFIX = "goals:g:";
const PROP_NEXT = "goals:next"; // world: next goal id
const MAX_TARGET = 1000000;
const NAME_LENGTH = 32;

/**
 * @typedef {{ id: number, n: string, item: string, target: number, got: number, dim: string, x: number, y: number, z: number,
 *   c: Record<string, [string, number]>, by: string, at: number, done: number, m: number }} Goal
 * name, item id, target and progress, the container's place, contributions by player id, who made it and when,
 * finished, and the last quarter announced (0 to 4)
 */

/** @param {Player} player */
const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
/** Checked again once a form comes back: a player de-opped while it was open can't use it. @param {Player} player */
const stillOp = (player) => isOp(player) || (player.sendMessage("§cOnly operators can do that."), false);

/** 12345 -> "12,345". @param {number} n */
const fmt = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** "minecraft:cobbled_deepslate" -> "Cobbled Deepslate". @param {string} id */
const itemName = (id) =>
  id
    .replace(/^minecraft:/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const shortDim = (/** @type {string} */ id) => id.replace(/^minecraft:/, "").replaceAll("_", " ");
/** @param {Goal} g */
const pct = (g) => Math.min(100, Math.floor((g.got * 100) / Math.max(1, g.target)));
/** @param {Goal} g */
const where = (g) => `${g.x}, ${g.y}, ${g.z} (${shortDim(g.dim)})`;

// ---------------------------------------------------------------------------
// Goals (cached; this pack is the only writer)
// ---------------------------------------------------------------------------

/** @type {Map<number, Goal> | undefined} */
let cache;

/** @returns {Map<number, Goal>} */
function goals() {
  if (cache) return cache;
  /** @type {Map<number, Goal>} */
  const map = new Map();
  try {
    for (const key of world.getDynamicPropertyIds()) {
      if (!key.startsWith(GOAL_PREFIX)) continue;
      try {
        const raw = world.getDynamicProperty(key);
        const g = typeof raw === "string" ? JSON.parse(raw) : undefined;
        if (g && typeof g.id === "number" && typeof g.item === "string" && typeof g.target === "number") map.set(g.id, { ...g, c: g.c ?? {} });
      } catch {
        // a corrupt goal is skipped
      }
    }
  } catch {
    return map; // the world isn't loaded yet: read again next time
  }
  return (cache = map);
}

/** Where the smallest contributors are added up once a goal has too many to keep by name. */
const OTHERS = "*";
/** A goal's property stays under this many characters (one holds about 32,000). */
const SAVE_LIMIT = 30000;

/**
 * Saves the goal. One with so many contributors that it would pass the property's limit (hundreds, on a big server)
 * keeps the biggest by name and adds the smallest up under "Others", so its total and top list stay right.
 * @param {Goal} g
 */
function save(g) {
  goals().set(g.id, g);
  let json = JSON.stringify(g);
  if (json.length > SAVE_LIMIT) {
    const others = g.c[OTHERS]?.[1] ?? 0;
    const named = Object.entries(g.c)
      .filter(([id]) => id !== OTHERS)
      .sort((a, b) => b[1][1] - a[1][1]);
    // About 50 characters each: keep as many as fit in two thirds of the room, so this runs again only rarely.
    const keep = Math.max(1, Math.floor((SAVE_LIMIT * 2) / 3 / 50));
    let folded = others;
    for (const [, [, n]] of named.slice(keep)) folded += n;
    g.c = Object.fromEntries(named.slice(0, keep));
    g.c[OTHERS] = ["Others", folded];
    json = JSON.stringify(g);
  }
  world.setDynamicProperty(GOAL_PREFIX + g.id, json);
}

/** @param {number} id */
function remove(id) {
  goals().delete(id);
  world.setDynamicProperty(GOAL_PREFIX + id, undefined);
}

/** Highest first, by name (without the smallest added up under "Others"). @param {Goal} g @returns {[string, number][]} */
const ranking = (g) =>
  Object.entries(g.c)
    .filter(([id, [, n]]) => id !== OTHERS && n > 0)
    .map(([, v]) => v)
    .sort((a, b) => b[1] - a[1]);

/** "Sam 1,200, Alex 800". @param {Goal} g @param {number} n */
const topText = (g, n) =>
  ranking(g)
    .slice(0, n)
    .map(([name, amount]) => `${name} ${fmt(amount)}`)
    .join(", ");

/** The container the player is looking at, within linkDistance. @param {Player} player */
function lookedAtContainer(player) {
  const hit = player.getBlockFromViewDirection({ maxDistance: CONFIG.linkDistance });
  const block = hit?.block;
  if (!block) return undefined;
  const container = block.getComponent("minecraft:inventory")?.container;
  return container ? block : undefined;
}

/**
 * The open goal (other than `except`) that already collects into this container, if any.
 * @param {import("@minecraft/server").Block} block @param {number} [except]
 */
const collectorAt = (block, except) =>
  [...goals().values()].find((g) => g.id !== except && !g.done && g.dim === block.dimension.id && g.x === block.x && g.y === block.y && g.z === block.z);

/** "Look at a chest ..." when the player isn't looking at a container. */
const LOOK = `Look at a chest, barrel or other container within ${CONFIG.linkDistance} blocks, then try again.`;

// ---------------------------------------------------------------------------
// Town news: Townsfolk gossip, Realm Mail letters and a title for a reached goal
// ---------------------------------------------------------------------------

const NEWS_GAP = 1000; // ticks (an in-game hour): at most one piece of gossip from this pack per in-game hour
let newsAt = -NEWS_GAP;
/** Events already gossiped about (each once). @type {Set<string>} */
const newsSeen = new Set();

/** Townsfolk gossip (Hearth & Hearsay), rate-limited and once per event. @param {string} key @param {object} msg */
function gossip(key, msg) {
  const now = system.currentTick;
  if (newsSeen.has(key) || now - newsAt < NEWS_GAP) return false;
  newsAt = now;
  newsSeen.add(key);
  if (newsSeen.size > 64) newsSeen.delete(/** @type {string} */ (newsSeen.values().next().value));
  system.sendScriptEvent("realm:gossip", JSON.stringify(msg));
  return true;
}

/** Plain ASCII, no color codes. @param {string} s */
const plain = (s) => s.replace(/§./g, "").replace(/[^\x20-\x7E]/g, "").trim();
const TITLE_MAX = 32; // the Titles pack's default maxTitleLength

/**
 * A goal was reached: the town gossips about the top contributor, who gets the title "Pillar of <goal>" (or "Pillar
 * of the Town" when the name is too long for a title), and the top contributors get a thank-you letter through
 * Realm Mail, offline ones too. Other packs ignore these events when they aren't installed.
 * @param {Goal} g
 */
function celebrate(g) {
  const ranked = Object.entries(g.c)
    .filter(([id, [, n]]) => id !== OTHERS && n > 0)
    .sort((a, b) => b[1][1] - a[1][1])
    .slice(0, Math.max(1, Math.min(10, Number(get("topContributors")) || CONFIG.topContributors)));
  if (!ranked.length) return;
  const name = plain(g.n) || itemName(g.item);
  const [topId, [topName]] = ranked[0];
  gossip(`goal:${g.id}`, { kind: "goal", player: topId, name: topName, place: name.slice(0, 48) });
  const title = `Pillar of ${name}`.length <= TITLE_MAX ? `Pillar of ${name}` : "Pillar of the Town";
  system.sendScriptEvent("realm:title_unlock", JSON.stringify({ player: topId, title, from: "goals_bp" }));
  ranked.forEach(([id, [who, n]], i) => {
    const place = i === 0 ? "more than anyone" : `the ${["", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"][i] ?? `number ${i + 1}`} most`;
    const body =
      `${who},\n\nThe community goal ${name} is reached: ${fmt(g.target)} ${itemName(g.item)} in all. ` +
      `You gave ${fmt(n)}, ${place}.${i === 0 ? ` The town calls you ${title} now.` : ""}\n\nThank you!\n\n- The town`;
    system.sendScriptEvent("realm:mail_send", JSON.stringify({ to: id, from: "Community Goals", subject: `Thank you: ${name}`.slice(0, 40), body: body.slice(0, 600) }));
  });
}

// ---------------------------------------------------------------------------
// Donating
// ---------------------------------------------------------------------------

/** @param {Goal} g @param {Player} donor */
function announce(g, donor) {
  const q = g.got >= g.target ? 4 : Math.floor((g.got * 4) / g.target);
  if (q <= g.m) return;
  g.m = q;
  if (q === 4) {
    g.done = 1;
    const top = topText(g, 3);
    const line = `§6Community goal §e${g.n}§6 reached: ${fmt(g.target)} ${itemName(g.item)}!${top ? ` Top contributors: ${top}.` : ""} Thanks, everyone!`;
    const everyone = get("announce") === true;
    if (everyone) world.sendMessage(line);
    else donor.sendMessage(line);
    for (const p of everyone ? world.getAllPlayers() : [donor]) p.playSound("random.levelup", { pitch: 1, volume: 0.8 });
    try {
      celebrate(g);
    } catch (e) {
      console.warn(`[goals] news: ${e}`);
    }
  } else if (get("announce") === true) {
    world.sendMessage(`§6Community goal §e${g.n}§6: ${q * 25} percent there (${fmt(g.got)} / ${fmt(g.target)} ${itemName(g.item)}). /realm:goals to help`);
    for (const p of world.getAllPlayers()) p.playSound("note.pling", { pitch: 1.2, volume: 0.6 });
  }
}

/** @param {Player} player @param {number} id */
function donate(player, id) {
  const g = goals().get(id);
  if (!g || g.done) return player.sendMessage("§cThat goal is finished or was removed.");
  let block;
  try {
    block = world.getDimension(g.dim).getBlock({ x: g.x, y: g.y, z: g.z });
  } catch {
    block = undefined; // its chunk isn't loaded
  }
  if (!block) return player.sendMessage(`§cThe goal's chest at ${where(g)} isn't loaded. Go closer to it and try again.`);
  const chest = block.getComponent("minecraft:inventory")?.container;
  if (!chest) return player.sendMessage(`§cThe goal's chest at ${where(g)} is gone. Ask an operator to link the goal to a new one.`);
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv) return;

  const keepNamed = get("keepNamedItems") === true;
  let left = g.target - g.got;
  let moved = 0;
  let full = false;
  let kept = 0;
  for (let slot = 0; slot < inv.size && left > 0; slot++) {
    const item = inv.getItem(slot);
    if (!item || item.typeId !== g.item || item.lockMode !== ItemLockMode.none) continue; // locked items stay put
    if (keepNamed && item.nameTag) {
      kept += item.amount;
      continue;
    }
    const before = item.amount;
    let now = before;
    try {
      if (before > left) {
        // Only part of the stack is still needed: put a copy of that many in, then take them off the stack.
        const part = item.clone();
        part.amount = left;
        const rest = chest.addItem(part);
        const placed = left - (rest?.amount ?? 0);
        if (placed > 0) inv.getSlot(slot).amount = before - placed;
        now = before - placed;
      } else {
        const rest = inv.transferItem(slot, chest); // native move: fills matching stacks, then empty slots
        // The leftover should stay in the slot; if it was handed back instead, put it back.
        if (rest && !inv.getItem(slot)) inv.setItem(slot, rest);
        const after = inv.getItem(slot);
        now = after?.typeId === g.item ? after.amount : 0;
      }
    } catch (e) {
      console.warn(`[goals] donate: ${e}`);
      const after = inv.getItem(slot);
      now = after?.typeId === g.item ? after.amount : 0;
      full = true;
    }
    const gave = before - now;
    moved += gave;
    left -= gave;
    if (full || (now > 0 && left > 0)) {
      full = true;
      break;
    }
  }

  if (moved > 0) {
    g.got += moved;
    const mine = g.c[player.id];
    g.c[player.id] = [player.name, (mine?.[1] ?? 0) + moved];
    announce(g, player);
    save(g);
    player.sendMessage(`§aYou gave ${fmt(moved)} ${itemName(g.item)} to ${g.n}. §7Now ${fmt(g.got)} / ${fmt(g.target)} (${pct(g)} percent).`);
    player.playSound("random.orb", { pitch: 1.3, volume: 0.6 });
  }
  if (full) player.sendMessage(`§cThe goal's chest at ${where(g)} is full, so the rest stayed with you. An operator needs to empty it or link a bigger one.`);
  else if (!moved) {
    player.sendMessage(
      kept
        ? `§eYou only have ${itemName(g.item)} with a custom name, and those are never donated.`
        : `§eYou have no ${itemName(g.item)} to give. Bring some and try again.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

/**
 * Buttons with what each does, retrying while the player still has chat open.
 * @param {Player} player @param {string} title @param {string} body @param {{ text: string, run: () => void | Promise<void> }[]} actions
 */
async function menu(player, title, body, actions) {
  const form = new ActionFormData().title(title).body(body);
  for (const a of actions) form.button(a.text);
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return;
    const res = await form.show(player);
    if (res.canceled && res.cancelationReason === FormCancelationReason.UserBusy) {
      await new Promise((r) => system.runTimeout(() => r(undefined), 20));
      continue;
    }
    if (res.canceled || res.selection === undefined) return;
    await actions[res.selection]?.run();
    return;
  }
}

/** @param {Goal} g */
function bar(g) {
  const filled = Math.round((Math.min(g.got, g.target) / Math.max(1, g.target)) * 20);
  return `§a${"|".repeat(filled)}§8${"|".repeat(20 - filled)}§r`;
}

/** How many of the goal's item the player carries (named ones too). @param {Player} player @param {string} item */
function carried(player, item) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  let n = 0;
  if (inv)
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (it?.typeId === item) n += it.amount;
    }
  return n;
}

/** @param {Player} player @param {number} id */
async function showGoal(player, id) {
  const g = goals().get(id);
  if (!g) return;
  const top = ranking(g).slice(0, get("topContributors"));
  const mine = g.c[player.id]?.[1] ?? 0;
  const body = [
    `§e${g.n}§r: ${fmt(g.target)} ${itemName(g.item)}${g.done ? " §a(finished)" : ""}`,
    `${bar(g)} §f${fmt(g.got)} / ${fmt(g.target)} (${pct(g)} percent)`,
    `§7Donations go into the chest at ${where(g)}.`,
    `You gave: ${fmt(mine)}`,
    top.length ? `§lTop contributors§r\n${top.map(([name, n], i) => `${i + 1}. ${name}: ${fmt(n)}`).join("\n")}` : "Nobody has given anything yet.",
  ].join("\n\n");

  /** @type {{ text: string, run: () => void | Promise<void> }[]} */
  const actions = [];
  if (!g.done) {
    const have = carried(player, g.item);
    actions.push({
      text: `Donate from my inventory\n§8You carry ${fmt(have)} ${itemName(g.item)}`,
      run: () => {
        donate(player, g.id);
        return showGoal(player, g.id);
      },
    });
  }
  if (isOp(player)) {
    if (!g.done) {
      actions.push({
        text: "§4Mark finished (operator)\n§8No more donations",
        run: () => {
          if (!stillOp(player)) return;
          const now = goals().get(g.id);
          if (!now) return;
          now.done = 1;
          save(now);
          const t = topText(now, 3);
          world.sendMessage(
            `§6Community goal §e${now.n}§6 is finished: ${fmt(now.got)} ${itemName(now.item)} given.${t ? ` Top contributors: ${t}.` : ""} Thanks, everyone!`,
          );
          return mainMenu(player);
        },
      });
      actions.push({
        text: "Link to the block I'm looking at\n§8Operator: move the goal to another chest",
        run: () => {
          if (!stillOp(player)) return;
          const block = lookedAtContainer(player);
          const now = goals().get(g.id);
          if (!now) return;
          const taken = block && collectorAt(block, now.id);
          if (!block) player.sendMessage(`§c${LOOK}`);
          else if (taken) player.sendMessage(`§cThat container already collects for ${taken.n}. Use another one.`);
          else {
            Object.assign(now, { dim: block.dimension.id, x: block.x, y: block.y, z: block.z });
            save(now);
            player.sendMessage(`§a${now.n} now collects into the container at ${where(now)}.`);
          }
          return showGoal(player, now.id);
        },
      });
    }
    actions.push({
      text: "§4Remove this goal (operator)",
      run: () =>
        menu(player, "§lRemove this goal?", `${g.n}: ${fmt(g.got)} / ${fmt(g.target)} ${itemName(g.item)}. The items in its chest stay where they are.`, [
          {
            text: "§cRemove it",
            run: () => {
              if (!stillOp(player)) return;
              remove(g.id);
              player.sendMessage(`§aGoal ${g.n} removed.`);
              return mainMenu(player);
            },
          },
          { text: "Keep it", run: () => showGoal(player, g.id) },
        ]),
    });
  }
  actions.push({ text: "Back", run: () => (g.done ? finished(player) : mainMenu(player)) });
  await menu(player, `§l${g.n}`, body, actions);
}

/** @param {Goal} g */
const goalButton = (g) => `${g.n}: ${pct(g)} percent\n§8${fmt(g.got)} / ${fmt(g.target)} ${itemName(g.item)}`;

/** @param {Player} player */
async function finished(player) {
  const list = [...goals().values()].filter((g) => g.done).sort((a, b) => b.id - a.id);
  await menu(player, "§lFinished goals", list.length ? "Goals the realm has finished, newest first." : "No finished goals yet.", [
    ...list.map((g) => ({ text: goalButton(g), run: () => showGoal(player, g.id) })),
    { text: "Back", run: () => mainMenu(player) },
  ]);
}

/** /realm:goals @param {Player} player */
async function mainMenu(player) {
  const list = [...goals().values()].filter((g) => !g.done).sort((a, b) => a.id - b.id);
  const done = [...goals().values()].filter((g) => g.done).length;
  const body = list.length
    ? "Pick a goal to see who has helped and to donate from your inventory. Donations go into the goal's chest."
    : "No community goals right now.";
  /** @type {{ text: string, run: () => void | Promise<void> }[]} */
  const actions = list.map((g) => ({ text: goalButton(g), run: () => showGoal(player, g.id) }));
  if (done) actions.push({ text: `Finished goals\n§8${done} goal${done === 1 ? "" : "s"}`, run: () => finished(player) });
  if (isOp(player)) {
    actions.push({ text: "§4Add a goal\n§8Operators", run: () => addForm(player) });
    actions.push({
      text: "§4Settings\n§8Operators",
      run: () =>
        menu(
          player,
          "§lSettings",
          "Operators change this pack's settings in §e/realm:config§r: pick §eCommunity Goals§r there. Announcements, top contributors shown and named items are there.",
          [{ text: "Back", run: () => mainMenu(player) }],
        ),
    });
  }
  await menu(player, "§lCommunity Goals", body, actions);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** @param {Player} player @param {string} item @param {number} amount @param {string | undefined} name */
function addGoal(player, item, amount, name) {
  const block = lookedAtContainer(player);
  if (!block) return player.sendMessage(`§c${LOOK}`);
  if (goals().size >= CONFIG.maxGoals)
    return player.sendMessage(`§cThe realm already has ${CONFIG.maxGoals} goals. Remove a finished one first (/realm:goals).`);
  const taken = collectorAt(block);
  if (taken) return player.sendMessage(`§cThat container already collects for ${taken.n}. Use another one.`);
  const next = world.getDynamicProperty(PROP_NEXT);
  const id = typeof next === "number" ? next : 1;
  world.setDynamicProperty(PROP_NEXT, id + 1);
  /** @type {Goal} */
  const g = {
    id,
    n: (name ?? "").trim().slice(0, NAME_LENGTH) || itemName(item),
    item,
    target: amount,
    got: 0,
    dim: block.dimension.id,
    x: block.x,
    y: block.y,
    z: block.z,
    c: {},
    by: player.name,
    at: Date.now(),
    done: 0,
    m: 0,
  };
  save(g);
  player.sendMessage(`§aGoal ${g.n} added: ${fmt(amount)} ${itemName(item)}, collected into the container at ${where(g)}.`);
  if (get("announce") === true) world.sendMessage(`§6New community goal: §e${g.n}§6, ${fmt(amount)} ${itemName(item)}. Donate with /realm:goals`);
}

/**
 * The menu's "Add a goal": the same as /realm:goals_add, asked in a form. The container is the one
 * the operator looks at while filling it in.
 * @param {Player} player
 */
async function addForm(player) {
  if (!lookedAtContainer(player)) {
    await menu(
      player,
      "§lAdd a goal",
      `Put a chest or barrel where donations should go and look at it, then choose Add a goal again (or run §e/realm:goals_add <item> <amount> [name]§r). The realm can have ${CONFIG.maxGoals} goals at a time, finished ones included.`,
      [{ text: "Back", run: () => mainMenu(player) }],
    );
    return;
  }
  const held = player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex)?.typeId ?? "";
  // A typo shows the form again with what was typed and what to fix, instead of starting over.
  let typed = [held.replace(/^minecraft:/, ""), "", ""];
  let error = "";
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return;
    const form = new ModalFormData().title("§lAdd a goal");
    if (error) form.label(`§c${error}`);
    form
      .textField("Item id (the item you hold is filled in)", "cobblestone", { defaultValue: typed[0] })
      .textField(`Amount (1 to ${fmt(MAX_TARGET)})`, "10000", { defaultValue: typed[1] })
      .textField("Name (optional)", "Colosseum", { defaultValue: typed[2] })
      .submitButton("Add");
    const res = await form.show(player);
    if (res.canceled && res.cancelationReason === FormCancelationReason.UserBusy) {
      await new Promise((r) => system.runTimeout(() => r(undefined), 20));
      continue;
    }
    if (res.canceled || !res.formValues || !player.isValid || !stillOp(player)) return;
    // Labels may or may not take a place in formValues: the text boxes are the strings, in order.
    const [rawItem = "", rawAmount = "", name = ""] = res.formValues.filter((v) => typeof v === "string").map((v) => v.trim());
    typed = [rawItem, rawAmount, name];
    const id = rawItem.toLowerCase().includes(":") ? rawItem.toLowerCase() : `minecraft:${rawItem.toLowerCase()}`;
    const amount = Number(rawAmount.replace(/[, ]/g, ""));
    let known = false;
    try {
      known = !!rawItem && !!ItemTypes.get(id);
    } catch {
      // not a valid id
    }
    if (!known) error = `Unknown item "${rawItem}". Use an item id like cobblestone or oak_log.`;
    else if (!Number.isInteger(amount) || amount < 1 || amount > MAX_TARGET) error = `The amount must be a whole number from 1 to ${fmt(MAX_TARGET)}.`;
    else {
      addGoal(player, id, amount, name || undefined);
      return;
    }
  }
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:goals",
      description: "Community Goals: see the realm's goals and donate items from your inventory",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => mainMenu(player).catch((e) => console.warn(`[goals] ${e}`)));
      return { status: CustomCommandStatus.Success };
    },
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:goals_add",
      description: "Add a community goal collected into the container you look at: an item, an amount and a name",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [
        { name: "item", type: CustomCommandParamType.ItemType },
        { name: "amount", type: CustomCommandParamType.Integer },
      ],
      optionalParameters: [{ name: "name", type: CustomCommandParamType.String }],
    },
    (origin, itemType, amount, name) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      const item = /** @type {{ id?: string }} */ (itemType)?.id;
      if (typeof item !== "string") return { status: CustomCommandStatus.Failure, message: "Unknown item." };
      if (typeof amount !== "number" || amount < 1 || amount > MAX_TARGET)
        return { status: CustomCommandStatus.Failure, message: `The amount must be 1 to ${fmt(MAX_TARGET)}.` };
      system.run(() => {
        try {
          addGoal(player, item, amount, typeof name === "string" ? name : undefined);
        } catch (e) {
          console.warn(`[goals] ${e}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

// Scenario tests (BDS harness): every open goal gets `donors` more contributors (offline players, 1 item each), as a
// long goal on a big server does. Only from the server console: /scriptevent realm:goals_test {"donors":900}
system.afterEvents.scriptEventReceive.subscribe(
  (ev) => {
    if (ev.id !== "realm:goals_test" || ev.sourceType !== ScriptEventSource.Server) return;
    try {
      const n = Math.max(0, Math.min(5000, Math.floor(Number(JSON.parse(ev.message)?.donors) || 0)));
      for (const g of goals().values()) {
        if (g.done) continue;
        for (let i = 0; i < n; i++) g.c[`-${4294900000 - i}`] = [`DonorWithALongName${i}`, 1];
        g.got += n;
        save(g);
      }
    } catch (e) {
      console.warn(`[goals] test: ${e}`);
    }
  },
  { namespaces: ["realm"] },
);

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "goals_bp");
  },
  { namespaces: ["realm"] },
);
