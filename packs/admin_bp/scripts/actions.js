// Quick actions: the vanilla things operators would otherwise type (/time, /gamemode, /tp, /give...).
// They use the script API directly, so they work without cheats. Each one asks with a form, then runs
// with the plain values it got (player names, not dropdown positions), so Recent can repeat it.
import { EntityComponentTypes, GameMode, ItemStack, ItemTypes, Player, WeatherType, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

/**
 * @typedef {Record<string, string | number | boolean>} Values
 * @typedef {object} Action
 * @property {string} id
 * @property {string} title
 * @property {string} help
 * @property {(player: Player) => ModalFormData | undefined} [form] no form: runs right away
 * @property {(player: Player, raw: (string | number | boolean | undefined)[]) => Values | string} [read] form answers → values, or why they're wrong
 * @property {(player: Player, values: Values) => string | undefined} [confirm] the "Are you sure?" text, if it should ask
 * @property {(player: Player, values: Values) => string} run what happened, for chat
 * @property {string} [use] instead of its own form: run this realm command when it's installed (the pack that owns it)
 */

const EVERYONE = "Everyone online";

/** Online players, the operator first. @param {Player} me */
export const playerNames = (me) => [me.name, ...world.getAllPlayers().filter((p) => p.id !== me.id).map((p) => p.name)];

/** @param {string} name */
const online = (name) => world.getAllPlayers().find((p) => p.name === name);

/** The players a name stands for (EVERYONE: all online). @param {unknown} name */
const targets = (name) => (name === EVERYONE ? world.getAllPlayers() : [online(String(name))].filter((p) => !!p));

/** @type {[string, number][]} */
const TIMES = [
  ["Day (1000)", 1000],
  ["Noon (6000)", 6000],
  ["Sunset (12000)", 12000],
  ["Night (13000)", 13000],
  ["Midnight (18000)", 18000],
  ["Sunrise (23000)", 23000],
];
/** @type {[string, GameMode][]} */
const MODES = [
  ["Survival", GameMode.Survival],
  ["Creative", GameMode.Creative],
  ["Adventure", GameMode.Adventure],
  ["Spectator", GameMode.Spectator],
];
/** @type {[string, WeatherType][]} */
const WEATHER = [
  ["Clear", WeatherType.Clear],
  ["Rain", WeatherType.Rain],
  ["Thunder", WeatherType.Thunder],
];
/** @type {[string, string][]} */
const RULES = [
  ["doDayLightCycle", "Day and night cycle"],
  ["keepInventory", "Keep inventory on death"],
  ["doMobSpawning", "Mobs spawn"],
  ["mobGriefing", "Mobs change blocks (creepers, endermen)"],
];

/** @param {ModalFormData} form @param {Player} me @param {string} label @param {boolean} [everyone] */
function playerDropdown(form, me, label, everyone = false) {
  const names = playerNames(me);
  form.dropdown(label, everyone ? [...names, EVERYONE] : names, { defaultValueIndex: 0 });
  return everyone ? [...names, EVERYONE] : names;
}

/** @param {Player} me @param {unknown} i @param {boolean} [everyone] */
const pickName = (me, i, everyone = false) => {
  const names = everyone ? [...playerNames(me), EVERYONE] : playerNames(me);
  return names[Number(i) || 0] ?? me.name;
};

/** @param {Player} p */
const heldItemId = (p) => p.getComponent(EntityComponentTypes.Inventory)?.container?.getItem(p.selectedSlotIndex)?.typeId;

/** @type {Action[]} */
export const ACTIONS = [
  {
    id: "weather",
    title: "Set the weather",
    help: "Clear, rain or thunder. With the Weather Almanac installed this runs /realm:weather_set, because the almanac plans the weather and would undo a plain change.",
    use: "realm:weather_set",
    form: () => new ModalFormData().title("Set the weather").dropdown("Weather", WEATHER.map((w) => w[0])).slider("For how many real minutes", 1, 120, { valueStep: 1, defaultValue: 10 }),
    read: (_p, [w, m]) => ({ weather: WEATHER[Number(w) || 0][0], minutes: Number(m) || 10 }),
    confirm: (_p, v) => `Set the weather to ${v.weather} for ${v.minutes} minutes, for everyone?`,
    run(player, v) {
      const w = WEATHER.find((x) => x[0] === v.weather) ?? WEATHER[0];
      player.dimension.setWeather(w[1], Math.round(Number(v.minutes) * 1200));
      return `Weather: ${w[0]} for ${v.minutes} minutes`;
    },
  },
  {
    id: "time",
    title: "Set the time",
    help: "Day, noon, sunset, night, midnight or sunrise.",
    form: () => new ModalFormData().title("Set the time").dropdown("Time", TIMES.map((t) => t[0]), { defaultValueIndex: 0 }),
    read: (_p, [t]) => ({ time: TIMES[Number(t) || 0][0] }),
    confirm: (_p, v) => `Set the time to ${v.time}, for everyone?`,
    run(_player, v) {
      const t = TIMES.find((x) => x[0] === v.time) ?? TIMES[0];
      world.setTimeOfDay(t[1]);
      return `Time set to ${t[0]}`;
    },
  },
  {
    id: "gamemode",
    title: "Game mode for a player",
    help: "Survival, creative, adventure or spectator.",
    form(me) {
      const f = new ModalFormData().title("Game mode for a player");
      playerDropdown(f, me, "Player");
      return f.dropdown("Game mode", MODES.map((m) => m[0]), { defaultValueIndex: 1 });
    },
    read: (me, [p, m]) => ({ player: pickName(me, p), mode: MODES[Number(m) || 0][0] }),
    run(_me, v) {
      const p = online(String(v.player));
      if (!p) return `${v.player} isn't online.`;
      const m = MODES.find((x) => x[0] === v.mode) ?? MODES[0];
      p.setGameMode(m[1]);
      return `${p.name} is now in ${m[0]}`;
    },
  },
  {
    id: "tp_to",
    title: "Teleport me to a player",
    help: "Go to where they are, in their dimension.",
    form(me) {
      const f = new ModalFormData().title("Teleport me to a player");
      playerDropdown(f, me, "Player");
      return f;
    },
    read: (me, [p]) => ({ player: pickName(me, p) }),
    run(me, v) {
      const p = online(String(v.player));
      if (!p) return `${v.player} isn't online.`;
      me.teleport(p.location, { dimension: p.dimension });
      return `Teleported to ${p.name}`;
    },
  },
  {
    id: "tp_here",
    title: "Teleport a player to me",
    help: "Bring them to where you stand.",
    form(me) {
      const f = new ModalFormData().title("Teleport a player to me");
      playerDropdown(f, me, "Player", true);
      return f;
    },
    read: (me, [p]) => ({ player: pickName(me, p, true) }),
    confirm: (_me, v) => (v.player === EVERYONE ? "Teleport everyone online to you?" : undefined),
    run(me, v) {
      const list = targets(v.player).filter((p) => p.id !== me.id);
      for (const p of list) p.teleport(me.location, { dimension: me.dimension });
      return list.length ? `Teleported ${list.map((p) => p.name).join(", ")} to you` : "Nobody to teleport.";
    },
  },
  {
    id: "give",
    title: "Give an item",
    help: "Any item id and an amount, to a player or everyone online.",
    form(me) {
      const f = new ModalFormData().title("Give an item");
      playerDropdown(f, me, "Give to", true);
      return f
        .textField("Item id", "minecraft:diamond", { defaultValue: heldItemId(me) ?? "minecraft:diamond" })
        .slider("Amount", 1, 64, { valueStep: 1, defaultValue: 1 });
    },
    read(me, [p, id, n]) {
      let item = String(id ?? "").trim().toLowerCase();
      if (item && !item.includes(":")) item = `minecraft:${item}`;
      if (!item || !ItemTypes.get(item)) return `There is no item "${item}".`;
      return { player: pickName(me, p, true), item, amount: Number(n) || 1 };
    },
    confirm: (_me, v) => (v.player === EVERYONE ? `Give ${v.amount} ${v.item} to everyone online?` : undefined),
    run(_me, v) {
      if (!ItemTypes.get(String(v.item))) return `There is no item "${v.item}".`;
      const list = targets(v.player);
      for (const p of list) {
        let left = Number(v.amount);
        while (left > 0) {
          const stack = new ItemStack(String(v.item), 1);
          const n = Math.min(left, stack.maxAmount);
          stack.amount = n;
          left -= n;
          const rest = p.getComponent(EntityComponentTypes.Inventory)?.container?.addItem(stack);
          if (rest) p.dimension.spawnItem(rest, p.location);
        }
      }
      return list.length ? `Gave ${v.amount} ${v.item} to ${list.map((p) => p.name).join(", ")}` : `${v.player} isn't online.`;
    },
  },
  {
    id: "effects",
    title: "Clear effects",
    help: "Removes every potion effect from a player or everyone online.",
    form(me) {
      const f = new ModalFormData().title("Clear effects");
      playerDropdown(f, me, "Player", true);
      return f;
    },
    read: (me, [p]) => ({ player: pickName(me, p, true) }),
    confirm: (_me, v) => (v.player === EVERYONE ? "Remove every potion effect from everyone online?" : undefined),
    run(_me, v) {
      let n = 0;
      const list = targets(v.player);
      for (const p of list)
        for (const e of p.getEffects()) {
          p.removeEffect(e.typeId);
          n++;
        }
      return list.length ? `Removed ${n} effect${n === 1 ? "" : "s"} from ${list.map((p) => p.name).join(", ")}` : `${v.player} isn't online.`;
    },
  },
  {
    id: "heal",
    title: "Heal a player",
    help: "Full health for a player or everyone online.",
    form(me) {
      const f = new ModalFormData().title("Heal a player");
      playerDropdown(f, me, "Player", true);
      return f;
    },
    read: (me, [p]) => ({ player: pickName(me, p, true) }),
    confirm: (_me, v) => (v.player === EVERYONE ? "Heal everyone online?" : undefined),
    run(_me, v) {
      const list = targets(v.player);
      for (const p of list) p.getComponent(EntityComponentTypes.Health)?.resetToMaxValue();
      return list.length ? `Healed ${list.map((p) => p.name).join(", ")}` : `${v.player} isn't online.`;
    },
  },
  {
    id: "spawn",
    title: "Set world spawn here",
    help: "New players and players without a bed appear where you stand (Overworld only).",
    confirm: (me) => `Move the world spawn to ${Math.floor(me.location.x)}, ${Math.floor(me.location.y)}, ${Math.floor(me.location.z)}?`,
    run(me) {
      if (me.dimension.id !== "minecraft:overworld") return "The world spawn has to be in the Overworld.";
      const at = { x: Math.floor(me.location.x), y: Math.floor(me.location.y), z: Math.floor(me.location.z) };
      world.setDefaultSpawnLocation(at);
      return `World spawn set to ${at.x}, ${at.y}, ${at.z}`;
    },
  },
  {
    id: "hostiles",
    title: "Remove hostile mobs nearby",
    help: "Only monsters (zombies, creepers, skeletons...) within the radius. Named mobs are kept. They vanish without drops.",
    form: () => new ModalFormData().title("Remove hostile mobs nearby").slider("Radius (blocks)", 8, 128, { valueStep: 8, defaultValue: 32 }),
    read: (_p, [r]) => ({ radius: Number(r) || 32 }),
    confirm: (me, v) => `Remove ${hostiles(me, Number(v.radius)).length} hostile mobs within ${v.radius} blocks?`,
    run(me, v) {
      const list = hostiles(me, Number(v.radius));
      for (const e of list) e.remove();
      return `Removed ${list.length} hostile mob${list.length === 1 ? "" : "s"} within ${v.radius} blocks`;
    },
  },
  {
    id: "rules",
    title: "Game rules",
    help: "Day and night cycle, keep inventory, mob spawning, mob griefing.",
    form() {
      const f = new ModalFormData().title("Game rules");
      const rules = /** @type {any} */ (world.gameRules);
      for (const [key, label] of RULES) f.toggle(label, { defaultValue: rules[key] === true });
      return f;
    },
    read: (_p, raw) => Object.fromEntries(RULES.map(([key], i) => [key, raw[i] === true])),
    confirm(_me, v) {
      const changes = ruleChanges(v).map(([, label, on]) => `${label}: ${on ? "Enabled" : "Disabled"}`);
      return changes.length ? `Change the game rules for everyone?\n\n${changes.join("\n")}` : undefined;
    },
    run(_me, v) {
      const rules = /** @type {any} */ (world.gameRules);
      const changed = [];
      for (const [key, label, on] of ruleChanges(v)) {
        rules[key] = on;
        changed.push(`${label}: ${on ? "Enabled" : "Disabled"}`);
      }
      return changed.length ? changed.join(", ") : "No game rule changed";
    },
  },
];

/** The game rules `v` would change: [key, label, new value]. @param {Values} v @returns {[string, string, boolean][]} */
function ruleChanges(v) {
  const rules = /** @type {any} */ (world.gameRules);
  return RULES.filter(([key]) => typeof v[key] === "boolean" && rules[key] !== v[key]).map(([key, label]) => [key, label, v[key] === true]);
}

/** Monsters near a player, without names (a named mob is somebody's). @param {Player} me @param {number} radius */
function hostiles(me, radius) {
  return me.dimension
    .getEntities({ location: me.location, maxDistance: Math.min(128, Math.max(1, radius)), families: ["monster"], excludeTypes: ["minecraft:player"] })
    .filter((e) => !e.nameTag);
}
