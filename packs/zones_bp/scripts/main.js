import "./diag.js";
import { CommandPermissionLevel, CustomCommandStatus, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { get } from "./settings.js";
import { CONFIG } from "./config.js";
import { allZones, provideZones, zoneHolds, zonesAt } from "./zones.js";

// World properties:
//   "zones:list"  JSON Zone[]: the safe zones made with /realm:zones
//   "zones:next"  the next zone id number
const PROP_LIST = "zones:list";
const PROP_NEXT = "zones:next";
const SRC = "zones"; // this pack's name in the realm:zones protocol (see scripts/zones.js)
const MAX_ZONES = 100;
const MIN_RADIUS = 8;
const RADIUS_LIMIT = 512;
const STEP = 8;
const NAME_MAX = 24;
const CONFIRM_AFTER = 120; // ticks of looking at the preview before the confirm form opens
const DRAW_EVERY = 10; // ticks between outline redraws
const DRAW_RANGE = 40; // outline points within this many blocks of the player are drawn
const NEARBY = 64; // "Show nearby outlines": zones whose edge is this close
const OUTLINE = "minecraft:villager_happy";
const PREVIEW = "minecraft:endrod";
const SOURCE_NAME = /** @type {Record<string, string>} */ ({ zones: "Safe zone", town: "Town", claims: "Land claim" });

/** @typedef {{ id: string, name: string, dim: string, x: number, y: number, z: number, r: number, o?: string, on?: string }} Zone o, on: the player who added it, when not an operator */
/** @typedef {{ id?: string, name: string, dim: string, x: number, y: number, z: number, r: number }} Draft a zone being previewed: id when it changes an existing one */
/** @typedef {{ name: string, dim: string, x: number, z: number, r: number, shape?: "circle" | "square" }} Shape */

/** @param {Player} player */
const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
const shortDim = (/** @type {string} */ id) => id.replace(/^minecraft:/, "").replaceAll("_", " ");
/** @param {Player} player @param {string} text */
function bar(player, text) {
  system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: player.id, ticks: 40, from: "zones_bp" }));
  player.onScreenDisplay.setActionBar(text);
}

// ---------------------------------------------------------------------------
// Saved zones
// ---------------------------------------------------------------------------

/** @type {Zone[] | undefined} */
let cache;

/** @returns {Zone[]} */
function zones() {
  if (cache) return cache;
  let raw;
  try {
    raw = world.getDynamicProperty(PROP_LIST);
  } catch {
    return []; // the world isn't loaded yet
  }
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : [];
    cache = (Array.isArray(parsed) ? parsed : []).filter(
      (/** @type {any} */ z) => z && typeof z.id === "string" && typeof z.name === "string" && typeof z.dim === "string" && [z.x, z.y, z.z, z.r].every((n) => Number.isFinite(n))
    );
  } catch {
    console.warn(`[zones] ${PROP_LIST} is corrupt; starting with no zones`);
    cache = [];
  }
  return /** @type {Zone[]} */ (cache);
}

/** @param {Zone[]} list */
function saveZones(list) {
  cache = list;
  world.setDynamicProperty(PROP_LIST, list.length ? JSON.stringify(list) : undefined);
  publish();
}

const publish = provideZones(SRC, () => zones().map((z) => ({ id: z.id, name: z.name, dim: z.dim, x: z.x, z: z.z, r: z.r })));

/** The largest radius allowed in game (a multiple of 8, 8 to 512). */
function maxRadius() {
  const m = Math.floor(Number(get("maxRadius")) / STEP) * STEP;
  return Math.max(MIN_RADIUS, Math.min(RADIUS_LIMIT, m || RADIUS_LIMIT));
}

/** @param {Player} player */
function radiusLimit(player) {
  if (isOp(player)) return maxRadius();
  const p = Math.floor(Number(get("playerMaxRadius")) / STEP) * STEP;
  return Math.max(MIN_RADIUS, Math.min(maxRadius(), p || MIN_RADIUS));
}

/** @param {Player} player */
const ownZones = (player) => zones().filter((z) => z.o === player.id);

/** Why this player can't add a zone now, or undefined. @param {Player} player */
function cannotAdd(player) {
  if (zones().length >= MAX_ZONES) return `The realm has the most safe zones allowed (${MAX_ZONES}).`;
  if (isOp(player)) return undefined;
  if (get("playersCreate") !== true) return "Only operators can add safe zones on this realm.";
  const max = Math.max(1, Number(get("playerMaxZones")) || 1);
  if (ownZones(player).length >= max) return `You already have ${max} safe zone${max === 1 ? "" : "s"}. Remove one first.`;
  return undefined;
}

/** @param {Player} player @param {Zone} z */
const canEdit = (player, z) => isOp(player) || (!!z.o && z.o === player.id);

/** Plain ASCII, no formatting codes, up to 24 characters. @param {unknown} v */
const cleanName = (v) =>
  String(v ?? "")
    .replace(/§./g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .trim()
    .slice(0, NAME_MAX);

/** A free name like "Home", "Home 2". @param {string} base */
function freeName(base) {
  const taken = new Set(zones().map((z) => z.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
}

// ---------------------------------------------------------------------------
// Outlines
// ---------------------------------------------------------------------------

/** @type {Map<string, number>} player id -> the run drawing outlines for them */
const drawing = new Map();
/** @type {Map<string, Draft>} player id -> the zone they're previewing */
const previews = new Map();
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  const run = drawing.get(playerId);
  if (run !== undefined) system.clearRun(run);
  drawing.delete(playerId);
  previews.delete(playerId);
});

/** How far the player is from the shape's edge (blocks), and whether they're inside. @param {Shape} s @param {{ x: number, z: number }} at */
function edge(s, at) {
  if (s.shape === "square") {
    const dx = Math.abs(at.x - s.x), dz = Math.abs(at.z - s.z);
    const inside = dx <= s.r && dz <= s.r;
    return { inside, dist: inside ? Math.min(s.r - dx, s.r - dz) : Math.hypot(Math.max(0, dx - s.r), Math.max(0, dz - s.r)) };
  }
  const d = Math.hypot(at.x - s.x, at.z - s.z);
  return { inside: d <= s.r, dist: Math.abs(s.r - d) };
}

/**
 * Draws the edge of each shape near the player for `seconds`, at the player's height (only that player sees it).
 * A new call replaces the outlines they had. `onTick` runs once a second (the preview's action bar).
 * @param {Player} player @param {Shape[]} shapes @param {number} seconds @param {string} particle @param {(left: number) => void} [onTick]
 */
function drawOutlines(player, shapes, seconds, particle, onTick) {
  const pid = player.id;
  const previous = drawing.get(pid);
  if (previous !== undefined) system.clearRun(previous);
  const until = system.currentTick + seconds * 20;
  let step = 0;
  const run = system.runInterval(() => {
    if (!player.isValid || system.currentTick > until) {
      system.clearRun(run);
      if (drawing.get(pid) === run) drawing.delete(pid);
      return;
    }
    try {
      if (onTick && step % (20 / DRAW_EVERY) === 0) onTick(Math.ceil((until - system.currentTick) / 20));
      step++;
      const { x: px, y: py, z: pz } = player.location;
      for (const s of shapes) {
        if (s.dim !== player.dimension.id) continue;
        for (const [x, z] of edgePoints(s, px, pz)) {
          for (const dy of [0.2, 1.6]) {
            try {
              player.spawnParticle(particle, { x, y: py + dy, z });
            } catch {
              // outside the loaded world
            }
          }
        }
        if (Math.hypot(s.x - px, s.z - pz) <= DRAW_RANGE) {
          for (let dy = 0; dy <= 4; dy += 1) {
            try {
              player.spawnParticle(particle, { x: s.x, y: py + dy, z: s.z }); // the center
            } catch {
              // outside the loaded world
            }
          }
        }
      }
    } catch (e) {
      console.warn(`[zones] ${e}`);
    }
  }, DRAW_EVERY);
  drawing.set(pid, run);
}

/** Points along a shape's edge within DRAW_RANGE of px, pz, about 1.5 blocks apart. @param {Shape} s @param {number} px @param {number} pz */
function edgePoints(s, px, pz) {
  /** @type {[number, number][]} */
  const out = [];
  const near = (/** @type {number} */ x, /** @type {number} */ z) => Math.abs(x - px) <= DRAW_RANGE && Math.abs(z - pz) <= DRAW_RANGE;
  if (s.shape === "square") {
    const x0 = s.x - s.r, x1 = s.x + s.r, z0 = s.z - s.r, z1 = s.z + s.r;
    for (let t = 0; t <= x1 - x0; t += 1.5) for (const p of /** @type {[number, number][]} */ ([[x0 + t, z0], [x0 + t, z1]])) if (near(p[0], p[1])) out.push(p);
    for (let t = 0; t <= z1 - z0; t += 1.5) for (const p of /** @type {[number, number][]} */ ([[x0, z0 + t], [x1, z0 + t]])) if (near(p[0], p[1])) out.push(p);
    return out;
  }
  const n = Math.max(16, Math.ceil((2 * Math.PI * s.r) / 1.5));
  // Only the arc that can come within DRAW_RANGE of the player: a big zone's edge has thousands of points.
  const d = Math.hypot(px - s.x, pz - s.z), reach = DRAW_RANGE * Math.SQRT2;
  const cos = d > 1e-6 ? (d * d + s.r * s.r - reach * reach) / (2 * d * s.r) : s.r > reach ? 2 : -1;
  if (cos > 1) return out; // the edge is nowhere near
  let from = 0, to = n - 1;
  if (cos > -1) {
    const mid = Math.atan2(pz - s.z, px - s.x), half = Math.acos(cos);
    from = Math.floor(((mid - half) / (Math.PI * 2)) * n);
    to = Math.min(from + n - 1, Math.ceil(((mid + half) / (Math.PI * 2)) * n));
  }
  for (let j = from; j <= to; j++) {
    const i = ((j % n) + n) % n;
    const a = (i / n) * Math.PI * 2;
    const x = s.x + Math.cos(a) * s.r, z = s.z + Math.sin(a) * s.r;
    if (near(x, z)) out.push([x, z]);
  }
  return out;
}

/** "The edge is 12 blocks away" for the action bar. @param {Player} player @param {Shape} s */
function edgeNote(player, s) {
  if (player.dimension.id !== s.dim) return `It's in the ${shortDim(s.dim)}`;
  const e = edge(s, player.location);
  const d = Math.round(e.dist);
  return d > DRAW_RANGE ? `You're ${e.inside ? "inside" : "outside"}, ${d} blocks from the edge` : `You're ${e.inside ? "inside" : "outside"}`;
}

/** @param {Player} player @param {Shape} s */
function showOutline(player, s) {
  const seconds = Math.max(5, Number(CONFIG.previewSeconds) || 20);
  drawOutlines(player, [s], seconds, OUTLINE, () => bar(player, `§a${s.name}§7: ${edgeNote(player, s)}`));
}

// ---------------------------------------------------------------------------
// Previews: a new zone, a new size, a new center
// ---------------------------------------------------------------------------

/** @param {Player} player @param {Draft} draft */
function startPreview(player, draft) {
  previews.set(player.id, draft);
  const seconds = Math.max(5, Number(CONFIG.previewSeconds) || 20);
  const shape = { name: draft.name, dim: draft.dim, x: draft.x, z: draft.z, r: draft.r };
  drawOutlines(player, [shape], seconds, PREVIEW, (left) => {
    if (previews.get(player.id) !== draft) return;
    bar(player, `§ePreview of ${draft.name}§7 (radius ${draft.r}): ${edgeNote(player, shape)}. ${left}s`);
  });
  player.sendMessage(`§7The outline of §e${draft.name}§7 shows around you for ${seconds} seconds. Look around: the confirm menu opens in a moment (or run /realm:zones).`);
  system.runTimeout(() => {
    if (previews.get(player.id) === draft && player.isValid) confirm(player, draft).catch((e) => console.warn(`[zones] ${e}`));
  }, CONFIRM_AFTER);
}

/** @param {Draft} d */
const describeDraft = (d) => `§e${d.name}§r: radius ${d.r} around ${d.x}, ${d.z} (${shortDim(d.dim)}), ${2 * d.r + 1} blocks across, top to bottom.`;

/** @param {Player} player @param {Draft} draft */
async function confirm(player, draft) {
  const old = draft.id ? zones().find((z) => z.id === draft.id) : undefined;
  const title = old ? "§lChange this safe zone?" : "§lCreate this safe zone?";
  const body = `${describeDraft(draft)}\n\nInside it, meteors, tornadoes, storm lightning and other world events break no blocks.`;
  await menu(player, title, body, [
    { text: old ? "§aSave it" : "§aCreate it", run: () => commit(player, draft) },
    { text: "Look again\n§8Show the outline a little longer", run: () => startPreview(player, draft) },
    { text: "Change name or size", run: () => draftForm(player, draft) },
    {
      text: "Cancel",
      run: () => {
        cancelPreview(player);
        bar(player, "§7Canceled");
      },
    },
  ]);
}

/** @param {Player} player */
function cancelPreview(player) {
  previews.delete(player.id);
  const run = drawing.get(player.id);
  if (run !== undefined) system.clearRun(run);
  drawing.delete(player.id);
}

/** Saves a confirmed draft, checking the limits again (the menu may have been open a while). @param {Player} player @param {Draft} draft */
function commit(player, draft) {
  cancelPreview(player);
  const list = zones();
  const r = Math.max(MIN_RADIUS, Math.min(radiusLimit(player), draft.r));
  if (draft.id) {
    const old = list.find((z) => z.id === draft.id);
    if (!old || !canEdit(player, old)) return player.sendMessage("§cThat safe zone is gone, or isn't yours to change.");
    if (list.some((z) => z.id !== old.id && z.name.toLowerCase() === draft.name.toLowerCase())) return player.sendMessage(`§cThere's already a safe zone called ${draft.name}.`);
    saveZones(list.map((z) => (z.id === old.id ? { ...z, name: draft.name, dim: draft.dim, x: draft.x, y: draft.y, z: draft.z, r } : z)));
    player.sendMessage(`§aSafe zone saved. ${describeDraft({ ...draft, r })}`);
  } else {
    const why = cannotAdd(player);
    if (why) return player.sendMessage(`§c${why}`);
    if (list.some((z) => z.name.toLowerCase() === draft.name.toLowerCase())) return player.sendMessage(`§cThere's already a safe zone called ${draft.name}.`);
    const next = world.getDynamicProperty(PROP_NEXT);
    const n = typeof next === "number" ? next : 1;
    world.setDynamicProperty(PROP_NEXT, n + 1);
    /** @type {Zone} */
    const zone = { id: `z${n}`, name: draft.name, dim: draft.dim, x: draft.x, y: draft.y, z: draft.z, r };
    if (!isOp(player)) {
      zone.o = player.id;
      zone.on = player.name;
    }
    saveZones([...list, zone]);
    player.sendMessage(`§aSafe zone added. ${describeDraft({ ...draft, r })} §7World events break no blocks inside it.`);
  }
  player.playSound("random.levelup", { pitch: 1.3, volume: 0.6 });
}

/**
 * The name and radius form, for a new zone or a change. Shows the preview after it.
 * @param {Player} player @param {Draft} draft
 */
async function draftForm(player, draft) {
  const limit = radiusLimit(player);
  const form = new ModalFormData()
    .title(draft.id ? "§lEdit safe zone" : "§lAdd a safe zone here")
    .textField(`Name (up to ${NAME_MAX} characters)`, "Home", { defaultValue: draft.name })
    .slider(`Radius in blocks (${MIN_RADIUS} to ${limit})`, MIN_RADIUS, limit, { valueStep: STEP, defaultValue: Math.max(MIN_RADIUS, Math.min(limit, draft.r)) })
    .submitButton("Preview");
  const res = await show(player, form);
  if (!res || res.canceled || !res.formValues || !player.isValid) {
    if (previews.get(player.id) === draft) cancelPreview(player);
    return;
  }
  const values = res.formValues.filter((v) => v !== undefined);
  const name = cleanName(values[0]) || draft.name;
  const r = Math.round(Number(values[1]) / STEP) * STEP || draft.r;
  const taken = zones().some((z) => z.id !== draft.id && z.name.toLowerCase() === name.toLowerCase());
  if (taken) {
    player.sendMessage(`§cThere's already a safe zone called ${name}. Pick another name.`);
    return draftForm(player, { ...draft, name: freeName(name) });
  }
  startPreview(player, { ...draft, name, r: Math.max(MIN_RADIUS, Math.min(limit, r)) });
}

/** "Add a safe zone here": the form, then the preview. @param {Player} player */
function addHere(player) {
  const why = cannotAdd(player);
  if (why) return player.sendMessage(`§c${why}`);
  const { x, y, z } = player.location;
  const r = Math.max(MIN_RADIUS, Math.min(radiusLimit(player), Math.round(Number(get("defaultRadius")) / STEP) * STEP || 64));
  return draftForm(player, { name: freeName(isOp(player) ? "Home" : `${player.name}'s base`.slice(0, NAME_MAX)), dim: player.dimension.id, x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), r });
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

/**
 * Shows a form, retrying while the player still has chat or another screen open.
 * @template {ActionFormData | ModalFormData} F
 * @param {Player} player @param {F} form
 * @returns {Promise<Awaited<ReturnType<F["show"]>> | undefined>}
 */
async function show(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = /** @type {any} */ (await form.show(player));
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await new Promise((r) => system.runTimeout(() => r(undefined), 20));
  }
  return undefined;
}

/**
 * Buttons with what each does.
 * @param {Player} player @param {string} title @param {string} body @param {{ text: string, run: () => unknown }[]} actions
 */
async function menu(player, title, body, actions) {
  const form = new ActionFormData().title(title).body(body);
  for (const a of actions) form.button(a.text);
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  await actions[res.selection]?.run();
}

/** "80 blocks away" or "in the nether". @param {Player} player @param {Shape} s */
function away(player, s) {
  if (player.dimension.id !== s.dim) return `in the ${shortDim(s.dim)}`;
  const e = edge(s, player.location);
  return e.inside ? "you're inside" : `${Math.round(Math.hypot(player.location.x - s.x, player.location.z - s.z))} blocks away`;
}

/** Same dimension first, nearest first. @param {Player} player @param {Shape} a @param {Shape} b */
function nearer(player, a, b) {
  const da = a.dim === player.dimension.id ? Math.hypot(player.location.x - a.x, player.location.z - a.z) : 1e9;
  const db = b.dim === player.dimension.id ? Math.hypot(player.location.x - b.x, player.location.z - b.z) : 1e9;
  return da - db || a.name.localeCompare(b.name);
}

/** @param {Player} player */
async function zoneList(player) {
  const list = [...zones()].sort((a, b) => nearer(player, a, b));
  await menu(
    player,
    "§lSafe zones",
    list.length ? `${list.length} safe zone${list.length === 1 ? "" : "s"}, nearest first.` : "No safe zones yet.",
    list.map((z) => ({ text: `${z.name} (radius ${z.r})\n§8${z.x}, ${z.z} - ${away(player, z)}`, run: () => zoneMenu(player, z.id) }))
  );
}

/** @param {Player} player @param {string} id */
async function zoneMenu(player, id) {
  const z = zones().find((x) => x.id === id);
  if (!z) return;
  const body = [
    `§e${z.name}§r: radius ${z.r} around ${z.x}, ${z.z} (${shortDim(z.dim)}), top to bottom. ${away(player, z)}.`,
    z.on ? `§7Added by ${z.on}.` : "§7Added by an operator.",
  ].join("\n");
  /** @type {{ text: string, run: () => unknown }[]} */
  const actions = [{ text: "Show outline\n§8For a few seconds", run: () => showOutline(player, z) }];
  if (canEdit(player, z)) {
    actions.push({ text: "Edit name or size", run: () => draftForm(player, { id: z.id, name: z.name, dim: z.dim, x: z.x, y: z.y, z: z.z, r: z.r }) });
    actions.push({
      text: "Move here\n§8Center it where you stand",
      run: () => {
        const l = player.location;
        startPreview(player, { id: z.id, name: z.name, dim: player.dimension.id, x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z), r: Math.min(z.r, radiusLimit(player)) });
      },
    });
  }
  if (isOp(player)) actions.push({ text: "§4Teleport (operator)\n§8To its center", run: () => teleport(player, z) });
  if (canEdit(player, z)) {
    actions.push({
      text: "§cRemove",
      run: () =>
        menu(player, "§lRemove this safe zone?", `${z.name}: radius ${z.r} around ${z.x}, ${z.z}. World events could break blocks there again.`, [
          {
            text: "§cRemove it",
            run: () => {
              // Checked again: the player may have been de-opped, or the zone changed hands, while the menu was open.
              if (!canEdit(player, z)) return player.sendMessage("§cThat safe zone isn't yours to remove.");
              saveZones(zones().filter((x) => x.id !== z.id));
              player.sendMessage(`§aSafe zone ${z.name} removed.`);
            },
          },
          { text: "Keep it", run: () => {} },
        ]),
    });
  }
  await menu(player, "§lSafe zone", body, actions);
}

/** @param {Player} player @param {{ dim: string, x: number, z: number, y?: number }} z */
function teleport(player, z) {
  if (!isOp(player)) return player.sendMessage("§cOnly operators can teleport to safe zones."); // de-opped while the menu was open
  const dim = world.getDimension(z.dim);
  let y = z.y;
  if (y === undefined) {
    try {
      let top = dim.getTopmostBlock({ x: z.x, z: z.z });
      // getTopmostBlock skips water (it answers a lake or sea bed): over water, the water's surface instead.
      for (let i = 0; top && i < 64; i++) {
        const up = top.above();
        if (!up || !(up.isLiquid || /water|kelp|seagrass|bubble_column/.test(up.typeId))) break;
        top = up;
      }
      y = top ? top.location.y + 1 : undefined;
    } catch {
      y = undefined;
    }
  }
  player.teleport({ x: z.x + 0.5, y: y ?? 100, z: z.z + 0.5 }, { dimension: dim });
}

/** Zones from other packs (towns, claims): read only here. @param {Player} player */
async function otherList(player) {
  const list = allZones()
    .filter((z) => z.src !== SRC)
    .sort((a, b) => nearer(player, a, b));
  await menu(
    player,
    "§lTowns and claims",
    list.length ? "Protected by other packs. Change them there (towns in /realm:town, claims in /realm:claim)." : "No towns or claims are protected from world events.",
    list.map((z) => ({
      text: `${SOURCE_NAME[z.src] ?? z.src}: ${z.name}\n§8${Math.round(z.x)}, ${Math.round(z.z)} - ${away(player, z)}`,
      run: () => {
        /** @type {{ text: string, run: () => unknown }[]} */
        const actions = [{ text: "Show outline\n§8For a few seconds", run: () => showOutline(player, z) }];
        if (isOp(player)) actions.push({ text: "§4Teleport (operator)\n§8To its center", run: () => teleport(player, { dim: z.dim, x: Math.floor(z.x), z: Math.floor(z.z) }) });
        const size = z.shape === "square" ? `${2 * z.r + 1} x ${2 * z.r + 1} blocks` : `radius ${z.r}`;
        return menu(player, `§l${SOURCE_NAME[z.src] ?? z.src}`, `§e${z.name}§r: ${size} around ${Math.round(z.x)}, ${Math.round(z.z)} (${shortDim(z.dim)}). ${away(player, z)}.`, actions);
      },
    }))
  );
}

/** /realm:zones @param {Player} player */
async function mainMenu(player) {
  const here = zonesAt(player.dimension.id, player.location.x, player.location.z);
  const own = zones().filter((z) => z.dim === player.dimension.id && zoneHolds({ ...z, shape: "circle", src: SRC }, player.location.x, player.location.z));
  const names = [...new Set([...own.map((z) => `${z.name} (Safe zone)`), ...here.filter((z) => z.src !== SRC).map((z) => `${z.name} (${SOURCE_NAME[z.src] ?? z.src})`)])];
  const others = allZones().filter((z) => z.src !== SRC);
  const body = [
    names.length ? `Where you stand: §aprotected§r by ${names.join(", ")}.` : "Where you stand: not in a safe zone.",
    "Inside a safe zone, meteors, tornadoes, storm lightning and other world events break no blocks. They still happen: you see them, they just leave the ground alone.",
  ].join("\n\n");
  /** @type {{ text: string, run: () => unknown }[]} */
  const actions = [];
  const draft = previews.get(player.id);
  if (draft) {
    actions.push({ text: `§a${draft.id ? "Save" : "Create"} ${draft.name}\n§8The zone you're previewing`, run: () => commit(player, draft) });
    actions.push({ text: "Cancel the preview", run: () => cancelPreview(player) });
  }
  if (!cannotAdd(player)) actions.push({ text: "Add a safe zone here\n§8Pick a name and a size", run: () => addHere(player) });
  actions.push({ text: `Safe zones (${zones().length})\n§8Nearest first`, run: () => zoneList(player) });
  actions.push({ text: `Towns and claims (${others.length})\n§8Protected by other packs`, run: () => otherList(player) });
  actions.push({
    text: "Show nearby outlines\n§8Every zone close to you",
    run: () => {
      const near = [...zones().map((z) => ({ ...z, shape: /** @type {"circle"} */ ("circle") })), ...others].filter((s) => s.dim === player.dimension.id && edge(s, player.location).dist <= NEARBY);
      if (!near.length) return bar(player, "§7No safe zone edges nearby");
      drawOutlines(player, near, Math.max(5, Number(CONFIG.previewSeconds) || 20), OUTLINE);
    },
  });
  await menu(player, "§lSafe Zones", body, actions);
}

// ---------------------------------------------------------------------------
// Commands and requests from other packs
// ---------------------------------------------------------------------------

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:zones",
      description: "Safe Zones: places where world events break no blocks. See them, add one here, change or remove them",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => mainMenu(player).catch((e) => console.warn(`[zones] ${e}`)));
      return { status: CustomCommandStatus.Success };
    }
  );
});

// realm:zones_open { player, action: "add" }: another pack's "Protect this area" button (Meteor Strikes).
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:zones_open") return;
    try {
      const req = JSON.parse(message);
      const player = world.getAllPlayers().find((p) => p.id === req?.player);
      if (!player) return;
      const run = req.action === "add" ? addHere(player) : mainMenu(player);
      Promise.resolve(run).catch((e) => console.warn(`[zones] ${e}`));
    } catch (e) {
      console.warn(`[zones] ${e}`);
    }
  },
  { namespaces: ["realm"] }
);

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "zones_bp");
  },
  { namespaces: ["realm"] }
);
