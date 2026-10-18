// What players see: offers at the townsfolk, chapter dialogues, hints, rewards, the tracker, the
// story log menu (current, available, finished, codex, daily favors) and the operators' tools.
import { Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, MessageFormData, ModalFormData, uiManager } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import {
  ORDERED,
  active,
  applyChoice,
  chapterApplies,
  chapterDone,
  chapterNumber,
  codexById,
  currentChapter,
  currentStep,
  entries,
  favorById,
  favorOfDay,
  favorShape,
  favorsByNpc,
  finished,
  hostileById,
  forget,
  giveRep,
  invalidate,
  ownEntries,
  labelOf,
  markDirty,
  matches,
  objApplies,
  objDone,
  objKey,
  onHold,
  pagesFor,
  partyViews,
  progressOf,
  reached,
  requires,
  sagaOf,
  stateOf,
  storyById,
  storyWaitsForPacks,
  target,
  today,
  wanderShape,
} from "./data.js";
import { askAnswer, askSky, completeStep, counting, crownsOf, endScene, endScenesOf, helps, holdUntil, outdoors, ownUntil, progressed, radiusOf, reportTo, reward, sceneFocus, showLine, side, skyFocus, takeCrowns, timeText, timeWait, TRACKER_STEADY, weatherWait } from "./objectives.js";
import { canTake, partyMates, partyTick, reporters, takers, together } from "./party.js";
import { campName, ensurePlace, isCamp, leaveCamp, locate, placeLabel, placesIn, placesMenu, placesOf } from "./places.js";
import { campCheck, campForChapter, startHostile, wandererOf } from "./wander.js";
import { get, getFor } from "./settings.js";
import { QUEST_TEXT_BYTES, SLOTS, SLOT_NAMES, byteLength, isSlot, questCode } from "./side.js";
import { PACK, across, busy, clock, compass, coords, dialog, dimName, exclusive, isOp, itemName, npcName, num, plain, send, show } from "./util.js";

/** @typedef {import("./data.js").Entry} Entry */
/** @typedef {import("./data.js").Saga} Saga */
/** @typedef {import("./data.js").StoryState} StoryState */
/** @typedef {import("./data.js").FavorState} FavorState */
/** @typedef {import("./types.js").Story} Story */
/** @typedef {import("./types.js").Chapter} Chapter */
/** @typedef {import("./types.js").Objective} Objective */
/** @typedef {import("./places.js").Loc} Loc */

const HINT_MS = 600000; // operator notes about unset places: at most every 10 minutes per place

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** "§8[mystery] [eerie]" @param {Story} story */
const toneTags = (story) => (story.tones?.length ? `§8${story.tones.map((t) => `[${t}]`).join(" ")}§r` : "");

/** "Chapter 2 of 6: The Drowned Choir" @param {Saga} saga @param {Story} story @param {number} index */
function chapterHeader(saga, story, index) {
  if (story.id.startsWith("fv:")) return `§7Daily favor: ${story.chapters[index].title}§r`;
  if (story.id.startsWith("wv:")) return `§7${story.short === "Ambush" ? "Ambush" : "A stranger's request"}: ${story.chapters[index].title}§r`;
  const { pos, total } = chapterNumber(saga, story, index);
  return `§7Chapter ${pos} of ${total}: ${story.chapters[index].title}§r`;
}

/** NPC positions (when loaded), cached for 2 seconds. @type {Map<string, { at: import("@minecraft/server").Vector3 | undefined, tick: number }>} */
const npcCache = new Map();

/** Where a townsfolk stands in this dimension, if loaded. @param {import("@minecraft/server").Dimension} dim @param {string} npc */
function npcAt(dim, npc) {
  const k = `${dim.id}|${npc}`;
  const hit = npcCache.get(k);
  if (hit && system.currentTick - hit.tick < 40) return hit.at;
  let at;
  try {
    const [ent] = dim.getEntities({ tags: [`realm:npc_id:${npc}`] });
    at = ent?.location;
  } catch {
    at = undefined;
  }
  npcCache.set(k, { at, tick: system.currentTick });
  return at;
}

/** "NE 240m", "here" or "in the Nether" from the player to a spot. @param {Player} player @param {{ dim: string, x: number, z: number }} loc @param {number} radius */
function bearing(player, loc, radius) {
  if (player.dimension.id !== loc.dim) return `in the ${dimName(loc.dim)}`;
  const p = player.location;
  const d = across(p, loc);
  if (d <= radius) return "here";
  return `${compass(loc.x - p.x, loc.z - p.z)} ${num(d)}m`;
}

/** " (NE 40m)" toward an NPC (a Recurring Wanderer: their camp when they aren't loaded), or "". @param {Player} player @param {string} npc */
function towardNpc(player, npc) {
  const at = npcAt(player.dimension, npc);
  if (!at) {
    const w = wandererOf(npc);
    const camp = w ? placesOf()[campName(w.id)] : undefined;
    return camp ? ` at ${placeLabel(campName(w?.id ?? ""))} ${bearing(player, camp, 6)}` : "";
  }
  return ` ${bearing(player, { dim: player.dimension.id, x: at.x, z: at.z }, 4)}`;
}

/** Is an objective's location hidden from the tracker (secret, no hint bought)? @param {Entry} e @param {Objective} obj */
const hidden = (e, obj) => !!obj.secret && !e.st.h;

/** Objective lines with progress and where to go, for the log and reminders. @param {Player} player @param {Entry} e @param {Saga} saga */
function objectiveLines(player, e, saga) {
  const step = currentStep(e, saga);
  /** @type {string[]} */
  const out = [];
  e.chapter.objectives.forEach((obj, i) => {
    if (!objApplies(e, obj, saga)) return;
    const n = progressOf(e, i);
    const need = target(obj);
    if (n >= need) return out.push(`§a[Done] ${obj.optional ? "Optional: " : ""}${obj.label}§r`);
    if (objDone(e, i, saga)) return; // another way of its "either" group was taken
    const label = labelOf(e, i, saga);
    if (!active(e, i, saga)) return out.push(`§8- ${i > step ? "(later) " : ""}${label}§r`);
    let line = `§e- ${label}§r`;
    if (need > 1) line += ` §f${n}/${need}${obj.type === "survive" || obj.type === "vigil" ? " s" : obj.type === "ride" ? " blocks" : ""}`;
    const t = timeText(e, i);
    if (t) line += ` §c${t}`;
    if (obj.npc && (obj.type === "talk" || obj.type === "deliver" || obj.type === "answer")) line += ` §7(${npcName(obj.npc)}${towardNpc(player, obj.npc)})`;
    const loc = locate(obj);
    if (typeof loc === "string") line += isCamp(loc) ? `\n  §7(${placeLabel(loc)} is gone: find ${npcName(e.story.giver)} on the road and they set it up again)` : `\n  §7(${placeLabel(loc)} isn't set yet: an operator sets it in /realm:saga_places)`;
    else if (loc && hidden(e, obj)) line += " §7(find it yourself, or ask for a hint)";
    else if (loc) line += ` §7(${loc.label} ${bearing(player, loc, radiusOf(obj))})`;
    const sky = skyFocus(player.id, e, i);
    if (sky) line += `\n  §e${sky.text}: get within ${sky.near} blocks of ${sky.spot} (${bearing(player, sky, sky.near)}), ${clock(sky.left)} left.`;
    const wait = weatherWait(obj) ?? timeWait(obj);
    if (wait) line += `\n  §7${wait[0].toUpperCase()}${wait.slice(1)}.`;
    out.push(`${line}§r`);
  });
  const how = orderNote(player, e, saga);
  if (how) out.unshift(how);
  return out;
}

/**
 * How a chapter's steps go, above its objective lines: in any order or one at a time, and who in the party shares
 * them. "" for a single step out of a party.
 * @param {Player} player @param {Entry} e @param {Saga} saga
 */
function orderNote(player, e, saga) {
  const steps = e.chapter.objectives.filter((o) => !o.optional && objApplies(e, o, saga)).length;
  const order = steps < 2 ? "" : e.chapter.sequential ? "§7These steps go one at a time, in order." : "§7Do these steps in any order.";
  const party = partyLine(player, e);
  return [order, party].filter(Boolean).join(" ");
}

/** One short line: what to do next (the "current step"). @param {Player} player @param {Entry} e @param {Saga} saga */
function stepLine(player, e, saga) {
  if (chapterDone(e, saga) && e.wv && (/** @type {any} */ (e.st).g || /** @type {any} */ (e.st).tn)) return "§6Done: the reward comes in a moment";
  if (chapterDone(e, saga)) return `§6Report to ${npcName(reportTo(e))}${towardNpc(player, reportTo(e))}`;
  const i = currentStep(e, saga);
  if (i < 0) return "";
  const t = timeText(e, i);
  return `${labelOf(e, i, saga)}${t ? ` (${t})` : ""}`;
}

// ---------------------------------------------------------------------------
// Places a chapter needs
// ---------------------------------------------------------------------------

/** Last note per place name. @type {Map<string, number>} */
const noted = new Map();

/** Tells operators online that a player needs place `name` (rate limited). @param {Player} player @param {string} name @param {Story} story */
export function hintOps(player, name, story) {
  if (get("opHints") !== true) return;
  const now = Date.now();
  if (now - (noted.get(name) ?? -Infinity) < HINT_MS) return;
  for (const op of world.getAllPlayers()) {
    if (!isOp(op)) continue;
    noted.set(name, now);
    op.sendMessage(`§e[Story] ${player.name} needs the place "${name}" (${placeLabel(name)}) for ${story.title}. Set or build it in /realm:saga_places, or stand there and run /realm:saga_place ${name}`);
  }
}

/** Unset places among the unfinished objectives of an entry, after picking what can be picked. @param {Entry} e @param {Saga} saga */
export function missingPlaces(e, saga) {
  /** @type {string[]} */
  const out = [];
  e.chapter.objectives.forEach((obj, i) => {
    if (objDone(e, i, saga)) return;
    for (const name of placesIn(obj)) if (!isCamp(name) && !placesOf()[name] && !ensurePlace(name) && !out.includes(name)) out.push(name);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Offers at the townsfolk
// ---------------------------------------------------------------------------

/**
 * What a story offers this player at this NPC: start a chapter, report back, or a reminder.
 * @param {Player} player @param {Story} story @param {string} npc @returns {{ key: string, label: string } | undefined}
 */
function offerFor(player, story, npc) {
  const saga = sagaOf(player);
  const st = saga.s[story.id];
  const cur = currentChapter(saga, story);
  if (!cur) return undefined;
  const { chapter, index } = cur;
  const starter = chapter.npc ?? story.giver;
  const ender = chapter.end ?? starter;
  const { pos } = chapterNumber(saga, story, index);
  const tag = story.kind === "main" ? "Main story" : story.kind === "heart" ? "Heart story" : story.kind === "wander" ? "Wanderer" : story.kind === "festival" ? "Festival" : "Story";
  // In a party, a main-story chapter other than the party's waits (party.js).
  if (onHold(player.id, story, chapter.id)) return starter === npc || ender === npc ? { key: `wait:${story.id}`, label: `${tag}: ${story.title}\n§8Waiting for your party` } : undefined;
  if (!st || !st.a || st.cur !== chapter.id) {
    if (starter !== npc || storyWaitsForPacks(story)) return undefined;
    if (!st?.dn.length && !requires(story.requires, saga, story.id, player).ok) return undefined;
    return { key: `start:${story.id}`, label: `${tag}: ${story.title}${pos > 1 ? `\n§8Chapter ${pos}: ${chapter.title}` : "\n§8New story"}` };
  }
  const e = entries(player).find((x) => x.story.id === story.id);
  if (e && chapterDone(e, saga) && ender === npc) return { key: `end:${story.id}`, label: `${tag}: ${story.title}\n§8Done: report back` };
  if (starter === npc || ender === npc) return { key: `info:${story.id}`, label: `${tag}: ${story.title}\n§8Chapter ${pos}: ${chapter.title}` };
  return undefined;
}

/** Today's favor offer at an NPC. @param {Player} player @param {string} npc */
function favorOffer(player, npc) {
  if (get("favors") !== true || !favorsByNpc.has(npc)) return undefined;
  const saga = sagaOf(player);
  const fs = saga.fv?.[npc];
  if (fs?.a && !fs.c) {
    const f = favorById(fs.id);
    if (!f) return undefined;
    const e = entries(player).find((x) => x.fav === npc);
    if (e && chapterDone(e, saga)) return { key: `fvend:${npc}`, label: `Daily favor: ${f.label}\n§8Done: report back` };
    return { key: `fvinfo:${npc}`, label: `Daily favor: ${f.label}\n§8In progress` };
  }
  const day = today();
  if (fs && fs.d >= day) return undefined; // done (or turned down) today
  const f = favorOfDay(player.id, npc, day);
  return f ? { key: `fvstart:${npc}`, label: `Daily favor: ${f.label}` } : undefined;
}

/**
 * Every offer for this player at an NPC (stories, favors, riddles to answer).
 * @param {Player} player @param {string} npc @returns {{ key: string, label: string, order: number }[]}
 */
export function offersAt(player, npc) {
  /** @type {{ key: string, label: string, order: number }[]} */
  const out = [];
  for (const story of ORDERED) {
    const o = offerFor(player, story, npc);
    if (o) out.push({ ...o, order: CONFIG.offerOrder + (story.kind === "main" ? 0 : 1) });
  }
  const saga = sagaOf(player);
  for (const e of entries(player))
    e.chapter.objectives.forEach((obj, i) => {
      if (obj.type === "answer" && obj.npc === npc && helps(e, obj) && !objDone(e, i, saga) && (!e.chapter.sequential || currentStep(e, saga) === i))
        out.push({ key: `ans:${e.story.id}:${i}`, label: `Answer: ${obj.label}`, order: CONFIG.offerOrder - 1 });
    });
  const f = favorOffer(player, npc);
  if (f) out.push({ ...f, order: CONFIG.offerOrder + 5 });
  if (npc.startsWith("w_")) {
    campCheck(player, npc);
    const w = wanderOffer(player, npc);
    if (w) out.push({ ...w, order: CONFIG.offerOrder + 2 });
  }
  return out;
}

/** A stranger's one-off (or a disguise's talk) at their NPC: start, info or report. @param {Player} player @param {string} npc */
function wanderOffer(player, npc) {
  const saga = sagaOf(player);
  const wv = saga.wv;
  if (!wv || `w_${wv.w}` !== npc || wv.tn) return undefined;
  if (!wv.a) {
    if (wv.hk) {
      const h = hostileById.get(/** @type {any} */ (wv.hk));
      return h ? { key: `wvh:${wv.w}`, label: h.label } : undefined;
    }
    const shape = wanderShape(wv);
    return shape ? { key: `wvstart:${wv.w}`, label: `Request: ${shape.chapter.title}` } : undefined;
  }
  const e = entries(player).find((x) => x.wv === wv.w);
  if (!e) return undefined;
  if (chapterDone(e, saga)) return { key: `wvend:${wv.w}`, label: `${e.chapter.title}\n§8Done: report back` };
  return { key: `wvinfo:${wv.w}`, label: `${e.chapter.title}\n§8In progress` };
}

/** The player picked one of our offers. @param {Player} player @param {string} key */
export async function choose(player, key) {
  const [kind, id, extra] = key.split(":");
  if (kind === "fvstart") return favorStart(player, id);
  if (kind === "fvend") return favorEnd(player, id);
  if (kind === "fvinfo") return favorInfo(player, id);
  if (kind === "wvstart") return wanderStart(player, id);
  if (kind === "wvinfo") return wanderInfo(player);
  if (kind === "wvend") return wanderEnd(player, false);
  if (kind === "wvh") return hostileTalk(player, id);
  if (kind === "ans") {
    const e = entries(player).find((x) => x.story.id === id || x.story.id === `${id}:${extra}`);
    if (e) await askAnswer(player, e, Number(key.split(":").pop()));
    return;
  }
  const story = storyById.get(id ?? "");
  if (!story) return;
  if (kind === "wait") return void player.sendMessage(holdNote(player));
  if (kind === "start") return startChapter(player, story);
  if (kind === "end") return endChapter(player, story);
  if (kind === "info") return chapterInfo(player, story);
}

// ---------------------------------------------------------------------------
// Chapter dialogues
// ---------------------------------------------------------------------------

/** Why a main-story chapter waits in a party. @param {Player} player */
function holdNote(player) {
  const view = partyViews.get(player.id);
  if (!view) return "§7[Story] Nothing to do here right now.";
  return `§7[Party] Your party is on ${view.story.title}, "${view.chapter.title}". Your own story waits until everyone in the party gets there (or until you leave the party).`;
}

/**
 * Tracks a quest: the tracker, the Minimap and the story log follow it instead of the newest one, until it's done.
 * In a party, every mate online who is on the same story (or helps with it as the party quest) tracks it too; a
 * daily favor or a wanderer's job is personal, and mates not on the story keep their own choice.
 * @param {Player} player @param {Entry} e
 */
function trackQuest(player, e) {
  const id = e.story.id;
  const saga = sagaOf(player);
  saga.tr = id;
  showAgain(saga, id);
  markDirty(player);
  player.sendMessage(`§b[Story] Tracking ${e.story.title}.`);
  if (e.fav) return;
  for (const mate of partyMates(player)) {
    if (!entries(mate).some((x) => x.story.id === id && !x.fav)) continue;
    const ms = sagaOf(mate);
    if (ms.tr === id && !untracked(ms, id)) continue; // follows it already
    ms.tr = id;
    showAgain(ms, id);
    markDirty(mate);
    mate.sendMessage(`§b[Party] ${player.name} set the party's tracked quest: ${e.story.title}.`);
  }
}

/** Is this quest off the tracker (Stop tracking)? @param {Saga} saga @param {string} id */
export const untracked = (saga, id) => !!saga.ut?.includes(id);

/** Takes a quest off the untracked list. @param {Saga} saga @param {string} id */
function showAgain(saga, id) {
  if (!saga.ut?.includes(id)) return;
  saga.ut = saga.ut.filter((x) => x !== id);
  if (!saga.ut.length) delete saga.ut;
}

/**
 * Stops tracking a quest: it stays in the Story Log and still counts, but the tracker and the Minimap skip it until
 * the player picks Track this quest again (or starts its next chapter). Personal, also in a party.
 * @param {Player} player @param {Entry} e
 */
function untrackQuest(player, e) {
  const id = e.story.id;
  const saga = sagaOf(player);
  if (saga.tr === id) delete saga.tr;
  if (!untracked(saga, id)) saga.ut = [...(saga.ut ?? []), id].slice(-40);
  markDirty(player);
  progressed.add(player.id);
  player.sendMessage(`§7[Story] Stopped tracking ${e.story.title}. It stays in your Story Log and still counts; pick Track this quest there to show it again.`);
}

/**
 * The quest the tracker follows: the tracked one while it's on, else (in a party) the party's chapter, so every mate
 * sees the same quest on top, else the one accepted last.
 * @param {Player} player @param {Entry[]} list
 */
export function trackedFirst(player, list) {
  const tr = sagaOf(player).tr;
  const sorted = [...list].sort((a, b) => (b.st.t ?? 0) - (a.st.t ?? 0));
  let k = tr ? sorted.findIndex((e) => e.story.id === tr) : -1;
  const view = k < 0 ? partyViews.get(player.id) : undefined;
  if (view) k = sorted.findIndex((e) => !e.fav && e.story.id === view.story.id && e.chapter.id === view.chapter.id);
  if (k > 0) sorted.unshift(...sorted.splice(k, 1));
  return sorted;
}

/**
 * The track buttons for a quest's page: Track this quest (unless it's the tracked one) and Stop tracking (unless it's
 * off the tracker already). @param {Player} player @param {Entry} e @returns {[string, () => void][]}
 */
function trackButtons(player, e) {
  const saga = sagaOf(player);
  /** @type {[string, () => void][]} */
  const out = [];
  // Tracked already, but a party mate on the same story follows another quest: tracking it again shares it with them.
  const mateElsewhere = !e.fav && partyMates(player).some((m) => sagaOf(m).tr !== e.story.id && entries(m).some((x) => x.story.id === e.story.id && !x.fav));
  if (saga.tr !== e.story.id)
    out.push([`Track this quest\n§8${untracked(saga, e.story.id) ? "Show it in the tracker again" : "The tracker follows it"}${!e.fav && partyMates(player).length ? ", for your party too" : ""}`, () => trackQuest(player, e)]);
  else if (mateElsewhere) out.push(["Track this quest\n§8For your party too", () => trackQuest(player, e)]);
  if (!untracked(saga, e.story.id)) out.push(["Stop tracking\n§8Hide it from the tracker and map", () => untrackQuest(player, e)]);
  return out;
}

/** A choice's button: its label, and what it costs. @param {import("./types.js").Choice} c */
const choiceLabel = (c) => (c.cost?.crowns ? `${c.label} (${c.cost.crowns} Crowns)` : c.label);

/**
 * Can the talker's choice be made for this mate too? Not when it fits only the talker's own path (its `requires`
 * don't hold for the mate: they took another way earlier) or when it costs something (each pays their own way).
 * @param {Player} p @param {Story} story @param {import("./types.js").Choice | undefined} c
 */
const choiceFits = (p, story, c) => !c || (!(c.cost?.crowns ?? 0) && requires(c.requires, sagaOf(p), story.id, p).ok);

/** Takes a choice's cost; false (and a note) when the player can't pay. @param {Player} player @param {import("./types.js").Choice | undefined} c */
function payFor(player, c) {
  const n = c?.cost?.crowns ?? 0;
  if (n <= 0) return true;
  if (takeCrowns(player, n)) {
    player.sendMessage(`§6-${n} Crowns`);
    return true;
  }
  player.sendMessage(`§c[Story] That costs ${n} Crowns and you have ${crownsOf(player)}. Nothing was chosen: come back when you have them.`);
  return false;
}

/** Far places get a travel tip. @param {Player} player @param {Entry} e */
function travelTips(player, e) {
  let far = 0;
  for (const obj of e.chapter.objectives) {
    if (hidden(e, obj)) continue;
    for (const w of [obj, obj.to, obj.from]) {
      const loc = locate(w);
      if (loc && typeof loc !== "string" && loc.dim === player.dimension.id) far = Math.max(far, across(player.location, loc));
    }
  }
  if (far > 600) player.sendMessage(`§7[Story] That's about ${num(far)} blocks away: take a horse, a boat or elytra, and food for the road.`);
}

// ---------------------------------------------------------------------------
// Co-op: a party accepts and reports back once
// ---------------------------------------------------------------------------

/** How long a mate's listening-in popup may stay open (ticks), and a side-story invite. */
const LISTEN_TICKS = 2400;
const INVITE_TICKS = 1200;
/** Players with a chapter's dialogue open (startChapter, endChapter): player id -> story id. @type {Map<string, string>} */
const talking = new Map();
/** Players with one of our party popups open. @type {Set<string>} */
const popups = new Set();

/** Closes whatever form a player has open (ours: a popup still showing, or their own copy of a dialogue). @param {Player} p */
function closeForms(p) {
  try {
    if (p.isValid) uiManager.closeAllForms(p);
  } catch {
    // left meanwhile
  }
}

/** "- Catch 5 things with a fishing rod" lines: a chapter's required steps that apply for a player. @param {Chapter} chapter @param {Saga} saga @param {Story} story */
const stepsFor = (chapter, saga, story) => chapter.objectives.filter((o) => !o.optional && matches(o.when, saga, story.id)).map((o) => `§e- ${o.label}§r`);

/**
 * Party mates listening in while one of them talks to an NPC: a popup with what the NPC says (and the chapter's
 * steps), closed by itself once the talk is over (the returned function) or after LISTEN_TICKS. A mate who has a form
 * open already (ours, or anything else: UserBusy) gets nothing; the chat line afterwards is enough.
 * @param {Player[]} mates @param {string} title @param {string} body @returns {() => void} closes the popups still open
 */
function listenIn(mates, title, body) {
  /** @type {{ p: Player, done: boolean }[]} */
  const open = [];
  for (const p of mates) {
    if (!p.isValid || busy.has(p.id) || popups.has(p.id)) continue;
    const h = { p, done: false };
    open.push(h);
    popups.add(p.id);
    const form = new ActionFormData().title(title).body(body).button("OK");
    form
      .show(p)
      .catch(() => undefined)
      .then(() => {
        h.done = true;
        popups.delete(p.id);
      });
  }
  const close = () => {
    for (const h of open) if (!h.done) closeForms(h.p);
    open.length = 0;
  };
  const timer = open.length ? system.runTimeout(close, LISTEN_TICKS) : undefined;
  return () => {
    if (timer !== undefined) system.clearRun(timer);
    close();
  };
}

/** Pages of a dialogue as one popup body. @param {string} lead @param {string[]} pages @param {string[]} steps */
const listenBody = (lead, pages, steps) => [`§b${lead}§r`, "", ...pages.flatMap((t) => [t, ""]), ...(steps.length ? ["§fSteps:§r", ...steps, ""] : []), "§7This closes by itself."].join("\n");

/**
 * Accepts a chapter for a party mate, as if they had talked to its NPC: the intro choice the talker made, recipes it
 * teaches, the steps in chat. A dialogue of theirs still open for the same story closes.
 * Returns false (with a note to talk to the NPC themselves) when the talker's choice doesn't fit their story.
 * @param {Player} p @param {Story} story @param {Chapter} chapter @param {string} by the talker's name @param {import("./types.js").Choice | undefined} choice @param {boolean} joined they picked Join (a side story)
 */
function acceptFor(p, story, chapter, by, choice, joined) {
  if (!choiceFits(p, story, choice)) {
    p.sendMessage(`§e[Party] ${by} took on ${story.title}, "${chapter.title}" with a choice that isn't yours to make (your story went another way, or it has a cost). Talk to ${npcName(chapter.npc ?? story.giver)} to take it on yourself.`);
    return false;
  }
  const saga = sagaOf(p);
  const st = stateOf(saga, story);
  if (choice) {
    applyChoice(saga, story, `${chapter.id}@`, choice);
    giveRep(p, choice.rep, saga, story);
  }
  st.a = 1;
  st.cur = chapter.id;
  st.o = [];
  delete st.x;
  delete st.h;
  st.t = Date.now();
  invalidate(p.id);
  markDirty(p, true);
  if (talking.get(p.id) === story.id) closeForms(p); // their own copy of the intro: it's accepted now
  const pick = choice ? ` ${by} chose: ${choice.label}.` : "";
  p.sendMessage(joined ? `§6[Party] You joined ${by}: ${story.title}, "${chapter.title}".` : `§6[Party] ${by} accepted ${story.title}, "${chapter.title}" for the party.${pick}`);
  p.sendMessage(`§6[Story] ${story.title}: ${chapter.title}`);
  for (const recipe of chapter.teach ?? []) send("realm:recipe_learn", { player: p.id, recipe });
  const e = entries(p).find((x) => x.story.id === story.id && !x.pq);
  if (e) for (const line of objectiveLines(p, e, saga)) p.sendMessage(line.replace(/\n\s*/g, " "));
  p.sendMessage(`§7Progress is shared with your party. /realm:saga can play the intro again (Current quests > ${story.short}).`);
  p.playSound("random.orb", { pitch: 0.8, volume: 0.7 });
  return true;
}

/**
 * A side story one member started: each mate who could start it too is asked "Join?" (a popup that closes itself after
 * INVITE_TICKS, or chat only when they're busy with another form). Joining accepts it as the talker did.
 * @param {Player} by @param {Story} story @param {Chapter} chapter @param {import("./types.js").Choice | undefined} choice @param {Player[]} mates
 */
function inviteSide(by, story, chapter, choice, mates) {
  const npc = npcName(chapter.npc ?? story.giver);
  const byName = by.name; // by may have left by the time a mate answers
  for (const p of mates) {
    p.sendMessage(`§b[Party] ${by.name} started ${story.title}, "${chapter.title}". Join in from the popup, or talk to ${npc} to start it too.`);
    if (busy.has(p.id) || popups.has(p.id)) continue;
    popups.add(p.id);
    void exclusive(p, async () => {
      const steps = stepsFor(chapter, sagaOf(p), story);
      const form = new MessageFormData()
        .title("Party: join a story?")
        .body([`§b${by.name}§r started a story with ${npc}:`, `§e${story.title}, "${chapter.title}"§r`, "", ...steps, "", "Join, and you take it on too: progress near each other is shared, and one report back counts for everyone who finished it."].join("\n"))
        .button1("Join")
        .button2("Not now");
      let answered = false;
      const timer = system.runTimeout(() => {
        if (!answered) closeForms(p);
      }, INVITE_TICKS);
      const res = await form.show(p).catch(() => undefined);
      answered = true;
      system.clearRun(timer);
      if (!res || res.canceled || res.selection !== 0 || !p.isValid) {
        if (res?.canceled && res.cancelationReason === FormCancelationReason.UserBusy) return;
        p.sendMessage(`§7[Party] Not now: ${npc} can start ${story.title} for you any time.`);
        return;
      }
      if (!canTake(p, story, chapter.id)) {
        p.sendMessage(`§7[Party] ${story.title} can't start for you right now.`);
        return;
      }
      if (acceptFor(p, story, chapter, byName, choice, true) && by.isValid) by.sendMessage(`§b[Party] ${p.name} joined ${story.title}.`);
    })
      .catch((e) => console.warn(`[saga] invite: ${e}`))
      .finally(() => popups.delete(p.id));
  }
}

/** The intro of the next chapter, and accepting it. @param {Player} player @param {Story} story */
export async function startChapter(player, story) {
  await exclusive(player, async () => {
    const saga = sagaOf(player);
    const st = stateOf(saga, story);
    const cur = currentChapter(saga, story);
    if (!cur || (st.a && st.cur === cur.chapter.id) || storyWaitsForPacks(story)) return;
    if (onHold(player.id, story, cur.chapter.id)) {
      player.sendMessage(holdNote(player));
      return;
    }
    if (!st.dn.length) {
      const req = requires(story.requires, saga, story.id, player);
      if (!req.ok) {
        player.sendMessage(`§7[Story] ${story.title} isn't ready yet: ${req.why.join(", ")}.`);
        return;
      }
    }
    const { chapter } = cur;
    const choices = (chapter.introChoices ?? []).filter((c) => requires(c.requires, saga, story.id, player).ok);
    const buttons = choices.length ? [...choices.map(choiceLabel), "Not now"] : ["Accept", "Not now"];
    const header = [story.title !== chapter.title ? chapterHeader(saga, story, cur.index) : "", !st.dn.length ? toneTags(story) : ""].filter(Boolean).join("\n");
    const pages = pagesFor(chapter.intro, saga, story.id, player.name);
    // The party's main chapter: mates on it listen in (a popup that closes once this talk is over).
    const along = story.kind === "main" ? takers(player, story, chapter.id) : [];
    const stop = listenIn(along, story.title, listenBody(`${player.name} is talking to ${npcName(chapter.npc ?? story.giver)} about your party's next chapter, "${chapter.title}". When ${player.name} accepts it, it's yours too.`, pages, stepsFor(chapter, saga, story)));
    let accepted = false;
    try {
      talking.set(player.id, story.id);
      const pick = await dialog(player, story.title, header, pages, buttons);
      talking.delete(player.id);
      if (pick < 0 || pick === buttons.length - 1 || !player.isValid) return;
      // Check again: the form was open for a while (and a party mate may have accepted it for everyone meanwhile).
      const again = currentChapter(saga, story);
      if (!again || again.chapter.id !== chapter.id || (st.a && st.cur === chapter.id) || onHold(player.id, story, chapter.id)) return;
      const choice = choices[pick];
      if (!payFor(player, choice)) return;
      accepted = true;
      await accept(player, story, chapter, saga, st, choice, stop);
    } finally {
      talking.delete(player.id);
      stop();
      if (!accepted) for (const p of along) if (p.isValid && canTake(p, story, chapter.id)) p.sendMessage(`§7[Party] ${player.name} didn't take on "${chapter.title}" yet.`);
    }
  });
}

/**
 * Accepting a chapter the player picked Accept (or an intro choice) for, and the party's share of it.
 * @param {Player} player @param {Story} story @param {Chapter} chapter @param {Saga} saga @param {StoryState} st @param {import("./types.js").Choice | undefined} choice @param {() => void} [heard] closes the mates' listening-in popups
 */
async function accept(player, story, chapter, saga, st, choice, heard = () => {}) {
  // Before this player's own state changes: who takes it along (the main story's party chapter: everyone on it; a
  // side story: who could start it too, asked below).
  const mates = takers(player, story, chapter.id);
  if (choice) {
    applyChoice(saga, story, `${chapter.id}@`, choice);
    giveRep(player, choice.rep, saga, story);
  }
  st.a = 1;
  st.cur = chapter.id;
  st.o = [];
  delete st.x;
  delete st.h;
  st.t = Date.now();
  showAgain(saga, story.id); // a new chapter the player took on shows again
  invalidate(player.id);
  markDirty(player, true);
  if (story.kind === "main") {
    // Accepted once for the party: every mate on the chapter gets it too, with the choice made here.
    const took = mates.filter((p) => acceptFor(p, story, chapter, player.name, choice, false));
    // Mates past it (or who can't start it) help with it as the party quest.
    const others = partyMates(player).filter((p) => !mates.some((m) => m.id === p.id) && partyViews.get(p.id)?.chapter.id === chapter.id && !ownEntries(p).some((x) => x.story.id === story.id));
    for (const p of others) p.sendMessage(`§b[Party] ${player.name} accepted ${story.title}, "${chapter.title}" for the party. Help out: what you do for it counts for them.`);
    if (took.length) player.sendMessage(`§b[Party] Accepted for your party too: ${listNames(took.map((p) => p.name))}.`);
    partyTick(); // party mates get the party quest (and its progress) right away
  }
  heard();
  const e = entries(player).find((x) => x.story.id === story.id);
  player.sendMessage(`§6[Story] ${story.title}: ${chapter.title}`);
  // Recipes the chapter asks you to cook; the Kitchen pack tells the player (nothing happens without it).
  for (const recipe of chapter.teach ?? []) send("realm:recipe_learn", { player: player.id, recipe });
  // Sky events the chapter asks for (meteor, moon, weather...): the world-event packs decide (nothing happens without them).
  for (const req of chapter.sky ?? []) askSky(player, req, `${story.id}:${chapter.id}`);
  // A Recurring Wanderer's chapter: their camp goes up (or moves) where the chapter says.
  if (story.kind === "wander") campForChapter(player, story, chapter);
  if (e) {
    const missing = missingPlaces(e, saga); // picks unset places first, so the lines below can point at them
    for (const line of objectiveLines(player, e, saga)) player.sendMessage(line.replace(/\n\s*/g, " "));
    for (const name of missing) {
      player.sendMessage(`§c[Story] This chapter needs the place "${placeLabel(name)}", which isn't set yet: an operator sets it in /realm:saga_places.`);
      hintOps(player, name, story);
    }
    travelTips(player, e);
  }
  // Where the tracker shows for this player: a Side HUD box (the default, bottom right) or above the hotbar.
  const where = getFor(player, "trackerAt");
  const spot = isSlot(where) ? `in the ${SLOT_NAMES[SLOTS.indexOf(where)].replace(/ \(.*\)$/, "")} box at the ${where.startsWith("left") ? "left" : where.startsWith("right") ? "right" : "middle"} of your screen` : "above your hotbar";
  player.sendMessage(`§7The tracker ${spot} points the way. /realm:saga shows your progress, and a hint if you're stuck.`);
  player.playSound("random.orb", { pitch: 0.8, volume: 0.7 });
  // A side story: mates who could start it are asked to join.
  if (story.kind !== "main" && mates.length) inviteSide(player, story, chapter, choice, mates);
  if (choice?.reply?.length) await dialog(player, story.title, "", pagesFor(choice.reply, saga, story.id, player.name), ["OK"]);
}

/** Names as "Ann", "Ann and Bob", "Ann, Bob and Cy". @param {string[]} names */
const listNames = (names) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** What a hint costs for an entry: levels and Crowns. @param {Entry} e */
function hintCost(e) {
  if (e.pq) return { p: 0, levels: 0, crowns: 0 }; // a party quest pays the helper nothing, so its hint is free
  const p = Math.max(0, Math.min(1, Number(get("hintPenalty")) || 0));
  const r = e.chapter.reward ?? {};
  return { p, levels: (r.levels ?? 0) - Math.round((r.levels ?? 0) * (1 - p)), crowns: (r.crowns ?? 0) - Math.round((r.crowns ?? 0) * (1 - p)) };
}

/** The hint: the chapter's and steps' hint text, and the exact coordinates of every place in them. @param {Player} player @param {Entry} e */
async function showHint(player, e) {
  const saga = sagaOf(player);
  if (!e.st.h) {
    const cost = hintCost(e);
    if (cost.levels + cost.crowns > 0) {
      const res = await show(
        player,
        new ActionFormData()
          .title("Ask for a hint?")
          .body(`A hint tells you what to do and gives the exact coordinates of every place in this chapter. It costs ${cost.levels} level${cost.levels === 1 ? "" : "s"} and ${cost.crowns} Crowns of this chapter's reward.`)
          .button("Ask for the hint")
          .button("No, I'll manage"),
      );
      if (!res || res.canceled || res.selection !== 0) return;
    }
    e.st.h = 1;
    markDirty(player, true);
  }
  /** @type {string[]} */
  const lines = [];
  if (e.chapter.hint) lines.push(e.chapter.hint);
  e.chapter.objectives.forEach((obj, i) => {
    if (objDone(e, i, saga)) return;
    if (obj.hint) lines.push(`§e${obj.label}:§r ${obj.hint}`);
    for (const [what, w] of /** @type {[string, any][]} */ ([
      ["", obj],
      ["from ", obj.from],
      ["to ", obj.to],
      ["the animal at ", obj.spawnAt],
    ])) {
      const loc = locate(w, obj.label);
      if (loc === undefined) continue;
      if (typeof loc === "string") lines.push(`§7${obj.label}: ${what}${placeLabel(loc)} isn't set yet.`);
      else lines.push(`§7${obj.label}: ${what}${loc.label} at §f${coords(loc)}§7 in the ${dimName(loc.dim)}${loc.pending ? " (built when you get close)" : ""}`);
    }
    if (obj.type === "reach" && (obj.belowY !== undefined || obj.aboveY !== undefined || obj.dim))
      lines.push(`§7${obj.label}: ${obj.dim ? `in the ${dimName(obj.dim)}` : ""}${obj.belowY !== undefined ? ` below height ${obj.belowY}` : ""}${obj.aboveY !== undefined ? ` above height ${obj.aboveY}` : ""}`);
    if (obj.npc) lines.push(`§7${obj.label}: ${npcName(obj.npc)}${towardNpc(player, obj.npc) || " (find them in town: /realm:npc)"}`);
  });
  if (chapterDone(e, saga)) lines.push(`Everything is done: go back to ${npcName(reportTo(e))}.`);
  if (!lines.length) lines.push("No hint for this one. Read the intro again: everything you need is in it.");
  await show(player, new ActionFormData().title("Hint").body(lines.join("\n\n")).button("OK"));
}

/**
 * A chapter's page: objectives, current step, hint, the intro again. From the NPC mid-chapter, or
 * from the story log.
 * @param {Player} player @param {Story} story
 */
export async function chapterInfo(player, story) {
  /** @type {[Entry, number] | undefined} a riddle picked from this page, asked once the page is gone */
  let pending;
  await exclusive(player, async () => {
    while (player.isValid) {
      const saga = sagaOf(player);
      const e = entries(player).find((x) => x.story.id === story.id);
      // A party quest (party.js) shows the party's chapter, not the player's own.
      const cur = e?.pq ? { chapter: e.chapter, index: e.index } : currentChapter(saga, story);
      if (!cur) return;
      const lines = [chapterHeader(saga, story, cur.index), toneTags(story)].filter(Boolean);
      if (!e) {
        const starter = cur.chapter.npc ?? story.giver;
        lines.push("", onHold(player.id, story, cur.chapter.id) ? holdNote(player) : `§7Talk to ${npcName(starter)}${towardNpc(player, starter)} to begin this chapter.`);
        await show(player, new ActionFormData().title(story.title).body(lines.join("\n")).button("OK"));
        return;
      }
      if (e.pq) lines.push("", "§bParty quest: your party mates' chapter. What you do for it counts for them; they report back.§r");
      lines.push("", `§fCurrent step: §e${stepLine(player, e, saga)}§r`, "", ...objectiveLines(player, e, saga));
      if (chapterDone(e, saga)) lines.push("", e.pq ? `§6All done: your party mates report to ${npcName(reportTo(e))}.` : `§6All done: go back to ${npcName(reportTo(e))}${towardNpc(player, reportTo(e))}.`);
      const cost = hintCost(e);
      /** @type {[string, () => Promise<unknown>][]} */
      const actions = [];
      for (const [label, fn] of trackButtons(player, e)) actions.push([label, async () => fn()]);
      actions.push([
        e.st.h ? "Read the hint again" : cost.levels + cost.crowns > 0 ? `Ask for a hint\n§8Costs ${cost.levels} level${cost.levels === 1 ? "" : "s"}, ${cost.crowns} Crowns` : "Ask for a hint\n§8Free",
        () => showHint(player, e),
      ]);
      actions.push(["Hear the intro again", () => dialog(player, story.title, chapterHeader(saga, story, cur.index), pagesFor(cur.chapter.intro, saga, story.id, player.name), ["OK"])]);
      e.chapter.objectives.forEach((obj, i) => {
        if (obj.type === "answer" && !obj.npc && !(obj.place || obj.at || obj.offset) && !objDone(e, i, saga) && helps(e, obj))
          actions.push([`Answer: ${obj.label}`, async () => void (pending = [e, i])]);
      });
      const form = new ActionFormData().title(story.title).body(lines.join("\n"));
      for (const [label] of actions) form.button(label);
      form.button("OK");
      const res = await show(player, form);
      if (!res || res.canceled || res.selection === undefined || res.selection >= actions.length) return;
      await actions[res.selection][1]();
      if (pending) return; // the riddle's form is exclusive too, so this page (and its busy mark) goes first
    }
  });
  // Asked here, not scheduled, so a menu that opened this page comes back after the riddle.
  if (pending) await askAnswer(player, ...pending);
}

/** The outro, the choice, the rewards. In a party, one report counts for every mate who finished the chapter too. @param {Player} player @param {Story} story */
export async function endChapter(player, story) {
  /** @type {Story | undefined} */
  let continueWith;
  await exclusive(player, async () => {
    const saga = sagaOf(player);
    const st = stateOf(saga, story);
    const cur = currentChapter(saga, story);
    const e = entries(player).find((x) => x.story.id === story.id);
    if (cur && onHold(player.id, story, cur.chapter.id)) {
      player.sendMessage(holdNote(player));
      return;
    }
    if (!cur || !e || e.pq || !st.a || st.cur !== cur.chapter.id || !chapterDone(e, saga)) return;
    const { chapter, index } = cur;
    const header = chapterHeader(saga, story, index);
    const choices = (chapter.choices ?? []).filter((c) => requires(c.requires, saga, story.id, player).ok);
    const last = !story.chapters.some((c, k) => k !== index && !st.dn.includes(c.id) && chapterApplies(c, saga, story));
    const buttons = choices.length ? choices.map(choiceLabel) : [last ? "Finish the story" : "Finish the chapter"];
    const pages = pagesFor(chapter.outro, saga, story.id, player.name);
    const ender = npcName(chapter.end ?? chapter.npc ?? story.giver);
    // Mates who finished it too listen in: the report counts for them.
    const stop = listenIn(
      reporters(player, story, chapter.id).done.map((x) => x.p),
      story.title,
      listenBody(`${player.name} is reporting back to ${ender} on "${chapter.title}". It counts for you too${choices.length ? `, with what ${player.name} chooses` : ""}.`, pages, [])
    );
    try {
      talking.set(player.id, story.id);
      const pick = await dialog(player, story.title, header, pages, buttons);
      talking.delete(player.id);
      if (pick < 0 || !player.isValid) return; // nothing is lost: the report waits at the NPC
      // Check again before paying out: the form was open for a while (and a mate may have reported for the party).
      const again = currentChapter(saga, story);
      if (!again || again.chapter.id !== chapter.id || !st.a || !chapterDone(e, saga) || onHold(player.id, story, chapter.id)) return;
      const choice = choices[pick];
      if (!payFor(player, choice)) return; // the report waits at the NPC
      // Who it counts for, before this player's own report moves the party's chapter on.
      const party = reporters(player, story, chapter.id);
      const next = complete(player, story, chapter, e, choice);
      for (const { p, e: pe } of party.done) {
        // Still on it and done (they may have reported themselves meanwhile).
        const ps = sagaOf(p);
        if (!p.isValid || !pe.st.a || /** @type {StoryState} */ (pe.st).cur !== chapter.id || !chapterDone(pe, ps)) continue;
        if (!choiceFits(p, story, choice)) {
          p.sendMessage(`§e[Party] ${player.name} reported back to ${ender} and chose: ${choice?.label}. That choice isn't yours to make (your story went another way, or it has a cost): report back yourself to choose.`);
          continue;
        }
        if (talking.get(p.id) === story.id) closeForms(p); // their own copy of the outro
        p.sendMessage(`§b[Party] ${player.name} reported back to ${ender} for the party${choice ? ` and chose: ${choice.label}` : ""}.`);
        complete(p, story, chapter, pe, choice, player);
      }
      for (const { p, e: pe } of party.open) {
        if (!p.isValid) continue;
        const left = pe.chapter.objectives.filter((o, i) => !o.optional && !objDone(pe, i, sagaOf(p))).map((o) => o.label);
        p.sendMessage(`§e[Party] ${player.name} reported back to ${ender} on "${chapter.title}". Your part isn't done yet${left.length ? `: ${left.join(", ")}` : ""}. Then report back yourself.`);
      }
      const done = party.done.filter(({ p }) => p.isValid && sagaOf(p).s[story.id]?.dn.includes(chapter.id));
      if (done.length) player.sendMessage(`§b[Party] It counts for ${listNames(done.map(({ p }) => p.name))} too.`);
      if (story.kind === "main") partyTick(); // the party's chapter may move on: the next one isn't held up for a second
      stop();
      if (next && (next.chapter.npc ?? story.giver) === (chapter.end ?? chapter.npc ?? story.giver)) continueWith = story;
      if (choice?.reply?.length) await dialog(player, story.title, header, pagesFor(choice.reply, saga, story.id, player.name), ["OK"]);
    } finally {
      talking.delete(player.id);
      stop();
    }
  });
  // The same NPC tells the next chapter: go straight on (Not now is always there).
  if (continueWith && player.isValid) await startChapter(player, continueWith);
}

/**
 * Completes a reported chapter for a player: the choice, reputation, rewards, what comes next. `by` is the party mate
 * who reported it for them (their talk, gossip and the reply stay with `by`).
 * @param {Player} player @param {Story} story @param {Chapter} chapter @param {Entry} e
 * @param {import("./types.js").Choice | undefined} choice @param {Player} [by]
 * @returns {{ chapter: Chapter, index: number } | undefined} the story's next chapter for them
 */
function complete(player, story, chapter, e, choice, by) {
  const saga = sagaOf(player);
  const st = stateOf(saga, story);
  if (choice) {
    applyChoice(saga, story, chapter.id, choice);
    giveRep(player, choice.rep, saga, story);
  }
  giveRep(player, chapter.rep, saga, story);
  const penalty = st.h ? Math.max(0, Math.min(1, Number(get("hintPenalty")) || 0)) : 0;
  chapter.objectives.forEach((_, i) => endScene(player.id, objKey(e, i)));
  st.dn.push(chapter.id);
  st.a = 0;
  delete st.cur;
  delete st.o;
  delete st.x;
  delete st.h;
  const next = currentChapter(saga, story);
  if (!next) {
    st.fin = Date.now();
    delete st.t;
  }
  invalidate(player.id);
  markDirty(player, true);
  const got = reward(player, chapter.reward, `Story: ${story.title}`, penalty);
  player.sendMessage(`§a[Story] Chapter complete: ${chapter.title}!${got ? ` §7Reward: ${got}` : ""}`);
  // npcs: who gave and who ended the chapter (Townsfolk adds affinity with each).
  const npcs = [...new Set([chapter.npc ?? story.giver, chapter.end ?? chapter.npc ?? story.giver])];
  const wanderer = story.kind === "wander" ? wandererOf(story.giver) : undefined;
  // A wanderer's chapter: its reputation goes to their guild (Guilds), not shared out.
  send("realm:quest_done", { player: player.id, pack: PACK, id: `${story.id}:${chapter.id}`, label: `${story.title}: ${chapter.title}`, kind: "story", npcs, ...(wanderer ? { guild: wanderer.guild } : {}) });
  if (wanderer && st.dn.length === 1) send("realm:journal", { player: player.id, page: "wanderers", entry: wanderer.id, label: wanderer.name });
  if (next) {
    const who = next.chapter.npc ?? story.giver;
    const same = who === (chapter.end ?? chapter.npc ?? story.giver);
    const shared = by && same ? (story.kind === "main" ? ": when one of you accepts it, it starts for the party" : ": when one of you starts it, the others are asked to join") : "";
    player.sendMessage(shared ? `§e[Story] Next: "${next.chapter.title}", from ${npcName(who)}${shared}.` : `§e[Story] Next: talk to ${npcName(who)} for "${next.chapter.title}".`);
    player.playSound("random.levelup", { pitch: 1, volume: 0.8 });
  } else {
    player.sendMessage(`§6[Story] Story complete: ${story.title}!`);
    // Townsfolk gossip about a finished act of the main story (once, for whoever told it).
    if (!by && story.kind === "main" && (story.act ?? 0) >= 1) send("realm:gossip", { kind: "act", player: player.id, name: player.name, place: story.title, n: story.act });
    // A Recurring Wanderer's chain is done: town gossip, and their camp goes once nobody else needs it.
    if (wanderer) {
      send("realm:gossip", { kind: "wander_chain", player: player.id, name: player.name, place: wanderer.name });
      leaveCamp(wanderer.id, player.id);
    }
    player.playSound("random.levelup", { pitch: 0.7, volume: 1 });
    for (const s of ORDERED) {
      if (s.id === story.id || saga.s[s.id] || !s.requires?.stories?.includes(story.id)) continue;
      if (requires(s.requires, saga, s.id, player).ok) player.sendMessage(`§e[Story] New story: ${s.title}. Talk to ${npcName(s.giver)}.`);
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// Daily favors
// ---------------------------------------------------------------------------

/** @param {Player} player @param {string} npc */
async function favorStart(player, npc) {
  await exclusive(player, async () => {
    if (get("favors") !== true) return;
    const saga = sagaOf(player);
    const day = today();
    const fs = saga.fv?.[npc];
    if ((fs?.a && !fs.c) || (fs && fs.d >= day)) return;
    const f = favorOfDay(player.id, npc, day);
    if (!f) return;
    const pick = await dialog(player, `Daily favor: ${f.label}`, "", [`${pagesFor([f.lines[0]], saga, "", player.name)[0] ?? ""}\n\n§e${f.objective.label}`], ["Accept", "Not now"]);
    if (pick !== 0 || !player.isValid) return;
    saga.fv ??= {};
    saga.fv[npc] = { id: f.id, d: day, a: 1, o: [], t: Date.now() };
    showAgain(saga, `fv:${npc}`);
    invalidate(player.id);
    markDirty(player, true);
    player.sendMessage(`§6[Story] Daily favor for ${npcName(npc)}: §e${f.objective.label}`);
    const e = entries(player).find((x) => x.fav === npc);
    if (e) for (const name of missingPlaces(e, saga)) hintOps(player, name, e.story);
  });
}

/** @param {Player} player @param {string} npc */
async function favorInfo(player, npc) {
  await exclusive(player, async () => {
    const saga = sagaOf(player);
    const e = entries(player).find((x) => x.fav === npc);
    if (!e) return;
    const lines = [chapterHeader(saga, e.story, 0), "", ...objectiveLines(player, e, saga)];
    const tb = trackButtons(player, e);
    const form = new ActionFormData().title(e.story.title).body(lines.join("\n")).button("OK").button("Give up this favor");
    for (const [label] of tb) form.button(label);
    const res = await show(player, form);
    if (res && !res.canceled && res.selection !== undefined && res.selection >= 2) tb[res.selection - 2]?.[1]();
    if (res && !res.canceled && res.selection === 1) {
      const fs = saga.fv?.[npc];
      if (fs) {
        fs.a = 0;
        fs.c = 1;
        delete fs.o;
        delete fs.x;
      }
      e.chapter.objectives.forEach((_, i) => endScene(player.id, objKey(e, i)));
      invalidate(player.id);
      markDirty(player, true);
      player.sendMessage(`§7[Story] You gave up today's favor for ${npcName(npc)}. There's a new one tomorrow.`);
    }
  });
}

/** @param {Player} player @param {string} npc */
async function favorEnd(player, npc) {
  await exclusive(player, async () => {
    const saga = sagaOf(player);
    const e = entries(player).find((x) => x.fav === npc);
    const fs = saga.fv?.[npc];
    if (!e || !fs || !chapterDone(e, saga)) return;
    const f = favorById(fs.id);
    if (!f) return;
    const pick = await dialog(player, `Daily favor: ${f.label}`, "", pagesFor([f.lines[1]], saga, "", player.name), ["Thanks"]);
    if (pick < 0 || !player.isValid || fs.c) return;
    fs.c = 1;
    fs.a = 0;
    delete fs.o;
    delete fs.x;
    e.chapter.objectives.forEach((_, i) => endScene(player.id, objKey(e, i)));
    invalidate(player.id);
    markDirty(player, true);
    const got = reward(player, f.reward, `Favor: ${f.label}`);
    player.sendMessage(`§a[Story] Favor done: ${f.label}!${got ? ` §7Reward: ${got}` : ""} §7A new favor tomorrow.`);
    send("realm:quest_done", { player: player.id, pack: PACK, id: `favor:${f.id}`, label: `Favor: ${f.label}`, kind: "favor", npc });
  });
}

/** Clears favors claimed on an earlier day (keeps saved data small). @param {Player} player */
export function tidyFavors(player) {
  const saga = sagaOf(player);
  if (!saga.fv) return;
  const day = today();
  let changed = false;
  for (const [npc, fs] of Object.entries(saga.fv)) {
    if (!fs || typeof fs !== "object" || (fs.c && fs.d < day) || (!fs.a && fs.d < day)) {
      delete saga.fv[npc];
      changed = true;
    }
  }
  if (changed) markDirty(player);
}

// ---------------------------------------------------------------------------
// Wanderers of the Wilds: a Stranger's one-off, a hostile's disguise
// ---------------------------------------------------------------------------

/** The stranger's request: intro, then Accept. @param {Player} player @param {string} wid */
async function wanderStart(player, wid) {
  await exclusive(player, async () => {
    const saga = sagaOf(player);
    const wv = saga.wv;
    if (!wv || wv.w !== wid || wv.a || wv.hk) return;
    const shape = wanderShape(wv);
    if (!shape) return;
    const { chapter } = shape;
    const pages = pagesFor(chapter.intro, saga, "", player.name);
    const last = pages.length - 1;
    pages[last] = `${pages[last]}\n\n§e${chapter.objectives.map((o) => o.label).join("\n")}`;
    const pick = await dialog(player, wv.nm, `§7A stranger's request: ${chapter.title}§r`, pages, ["Accept", "Not now"]);
    if (pick !== 0 || !player.isValid || saga.wv !== wv || wv.a) return;
    wv.a = 1;
    wv.o = [];
    wv.t = Date.now();
    delete wv.x;
    delete wv.h;
    if (saga.ut) saga.ut = saga.ut.filter((x) => !x.startsWith("wv:"));
    invalidate(player.id);
    markDirty(player, true);
    send("realm:wander_done", { player: player.id, wid: wv.w, how: "accepted" });
    player.sendMessage(`§6[Story] ${wv.nm}: ${chapter.title}`);
    const e = entries(player).find((x) => x.wv === wv.w);
    if (e) for (const line of objectiveLines(player, e, saga)) player.sendMessage(line.replace(/\n\s*/g, " "));
    player.sendMessage(`§7${wv.nm} waits here for half an hour at most. Strangers move on: a job you can finish without them pays anyway.`);
    player.playSound("random.orb", { pitch: 0.8, volume: 0.7 });
  });
}

/** The one-off's page: objectives, hint, give up. @param {Player} player */
async function wanderInfo(player) {
  await exclusive(player, async () => {
    const saga = sagaOf(player);
    const wv = saga.wv;
    const e = entries(player).find((x) => x.wv === wv?.w);
    if (!wv || !e) return;
    const lines = [chapterHeader(saga, e.story, 0), "", `§fCurrent step: §e${stepLine(player, e, saga)}§r`, "", ...objectiveLines(player, e, saga)];
    if (e.chapter.hint) lines.push("", `§7${e.chapter.hint}`);
    const tb = trackButtons(player, e);
    const form = new ActionFormData().title(wv.nm).body(lines.join("\n")).button("OK");
    for (const [label] of tb) form.button(label);
    if (!wv.tn) form.button("Give up this job");
    const res = await show(player, form);
    if (res && !res.canceled && res.selection !== undefined && res.selection >= 1 && res.selection <= tb.length) return void tb[res.selection - 1][1]();
    if (!res || res.canceled || res.selection !== tb.length + 1 || wv.tn || saga.wv !== wv) return;
    e.chapter.objectives.forEach((_, i) => endScene(player.id, objKey(e, i)));
    delete saga.wv;
    invalidate(player.id);
    markDirty(player, true);
    send("realm:wander_done", { player: player.id, wid: wv.w, how: "left" });
    player.sendMessage(`§7[Story] You gave up ${wv.nm}'s job. They shrug and go on their way.`);
  });
}

/**
 * The one-off is done: the outro (from the stranger, or in chat when they're gone or it was a fight), the
 * reward, and the stranger leaves. @param {Player} player @param {boolean} auto
 */
export async function wanderEnd(player, auto) {
  await exclusive(player, async () => {
    const saga = sagaOf(player);
    const wv = saga.wv;
    const e = entries(player).find((x) => x.wv === wv?.w);
    if (!wv || !e || !chapterDone(e, saga)) return;
    const pages = pagesFor(e.chapter.outro, saga, "", player.name);
    if (auto) for (const p of pages) player.sendMessage(`§7${p}`);
    else if ((await dialog(player, wv.nm, chapterHeader(saga, e.story, 0), pages, ["Thanks"])) < 0 || !player.isValid) return;
    if (saga.wv !== wv || wv.c) return;
    wv.c = 1;
    e.chapter.objectives.forEach((_, i) => endScene(player.id, objKey(e, i)));
    delete saga.wv;
    if (!wv.hk) saga.wn = (saga.wn ?? 0) + 1;
    invalidate(player.id);
    markDirty(player, true);
    const penalty = wv.h ? Math.max(0, Math.min(1, Number(get("hintPenalty")) || 0)) : 0;
    const got = reward(player, e.chapter.reward, wv.hk ? `Ambush: ${e.chapter.title}` : `Stranger: ${wv.nm}`, penalty);
    player.sendMessage(`§a[Story] ${wv.hk ? "Ambush beaten" : "Job done"}: ${e.chapter.title}!${got ? ` §7Reward: ${got}` : ""}`);
    player.playSound("random.levelup", { pitch: 1.2, volume: 0.7 });
    const guild = wv.hk ? "wardens" : (WANDER_GUILD[wv.ar] ?? "wayfarers");
    send("realm:quest_done", { player: player.id, pack: PACK, id: `wander:${e.chapter.id}`, label: `${wv.hk ? "Ambush" : "Stranger"}: ${e.chapter.title}`, kind: "wander", guild });
    if (wv.hk) {
      send("realm:rep_add", { player: player.id, guild: "wardens", amount: 15, reason: `Ambush: ${e.chapter.title}` });
      send("realm:gossip", { kind: "wander_hostile", player: player.id, name: player.name, place: e.chapter.title });
    } else send("realm:wander_done", { player: player.id, wid: wv.w, how: "left" });
  });
}

/** Strangers' guilds by archetype: who hears about a job done (Guilds, `realm:quest_done` kind `wander`). */
const WANDER_GUILD = /** @type {Record<string, "miners" | "growers" | "wardens" | "wayfarers">} */ ({ miner: "miners", ghost: "wayfarers", pilgrim: "wayfarers", rival: "wardens", hermit: "growers", storm: "wayfarers", exile: "miners", traveler: "growers" });

/** Finishes a one-off without its stranger (gone, or a fight), once a second. @param {Player} player */
export function wanderAuto(player) {
  const wv = sagaOf(player).wv;
  if (!wv?.a || wv.c || !(wv.g || wv.tn) || busy.has(player.id)) return;
  const e = entries(player).find((x) => x.wv === wv.w);
  if (e && chapterDone(e, sagaOf(player))) wanderEnd(player, true).catch((err) => console.warn(`[saga] ${err}`));
}

/** A disguised hostile talks: its tell is in the pages. The toll man wants paying. @param {Player} player @param {string} wid */
async function hostileTalk(player, wid) {
  /** @type {boolean} */
  let fight = false;
  await exclusive(player, async () => {
    const saga = sagaOf(player);
    const wv = saga.wv;
    const h = wv?.hk ? hostileById.get(/** @type {any} */ (wv.hk)) : undefined;
    if (!wv || !h || wv.w !== wid || wv.a) return;
    const pages = pagesFor(h.intro, saga, "", player.name).map((p) => p.split("{name}").join(wv.nm));
    const buttons = h.toll ? [`Pay the toll (${h.toll.crowns} Crowns)`, "Refuse"] : ["I'll help", "Not now"];
    const pick = await dialog(player, wv.nm, "", pages, buttons);
    if (pick < 0 || !player.isValid || saga.wv !== wv || wv.a) return;
    if (!h.toll) return; // the disguise drops on its own time (the wanderer pack's clock), or when accused
    if (pick === 0 && takeCrowns(player, h.toll.crowns)) {
      player.sendMessage(`§6-${h.toll.crowns} Crowns §7(${wv.nm} pockets them and waves you through)`);
      delete saga.wv;
      invalidate(player.id);
      markDirty(player, true);
      send("realm:wander_done", { player: player.id, wid: wv.w, how: "left" });
      return;
    }
    if (pick === 0) player.sendMessage(`§c[Story] You don't have ${h.toll.crowns} Crowns. "Then we'll take it out of your hide."`);
    fight = true;
  });
  if (fight && player.isValid) startHostile(player, false);
}

// ---------------------------------------------------------------------------
// The tracker
// ---------------------------------------------------------------------------

/**
 * Where the tracker line just computed points, for the Minimap (realm:track): a spot, or a townsfolk by id.
 * @typedef {{ label: string, dim?: string, x?: number, z?: number, npc?: string }} Pointed
 */
/** @type {Pointed | undefined} */
let pointed;
/** The objective the tracker line just computed points at, or -1. */
let pointedAt = -1;

/** A townsfolk (or a Recurring Wanderer's camp) as a tracker target. @param {Player} player @param {string} npc @param {string} label @returns {Pointed} */
function npcTarget(player, npc, label) {
  const at = npcAt(player.dimension, npc);
  if (at) return { label, npc, dim: player.dimension.id, x: at.x, z: at.z };
  const w = wandererOf(npc);
  const camp = w ? placesOf()[campName(w.id)] : undefined;
  return camp ? { label, npc, dim: camp.dim, x: camp.x, z: camp.z } : { label, npc };
}

/** The tracker line for one entry, or undefined when there's nothing to point at. @param {Player} player @param {Entry} e @param {Saga} saga */
function trackLine(player, e, saga) {
  pointed = undefined;
  pointedAt = -1;
  // A sky event to chase comes first: it doesn't last.
  for (let i = 0; i < e.chapter.objectives.length; i++) {
    const sky = active(e, i, saga) ? skyFocus(player.id, e, i) : undefined;
    if (sky) {
      pointed = { label: sky.text, dim: sky.dim, x: sky.x, z: sky.z };
      pointedAt = i;
      return `§e${sky.text}: §fget within ${sky.near} blocks ${bearing(player, sky, sky.near)} §c${clock(sky.left)} left`;
    }
  }
  if (chapterDone(e, saga)) {
    if (e.wv && (/** @type {any} */ (e.st).g || /** @type {any} */ (e.st).tn)) return undefined;
    pointed = npcTarget(player, reportTo(e), `Report to ${npcName(reportTo(e))}`);
    return `§6${e.pq ? "party reports" : "report"} to ${npcName(reportTo(e))}${towardNpc(player, reportTo(e))}`;
  }
  // Optional objectives only when nothing required has anything to show.
  return pointAt(player, e, saga, false) ?? pointAt(player, e, saga, true);
}

/** The tracker's pick among the required (or the optional) objectives that count now. @param {Player} player @param {Entry} e @param {Saga} saga @param {boolean} optional */
function pointAt(player, e, saga, optional) {
  /** @type {string | undefined} */
  let best;
  let bestD = Infinity;
  /** @type {string | undefined} */
  let timed;
  /** @type {Pointed | undefined} */
  let bestAt;
  let bestI = -1;
  let timedI = -1;
  e.chapter.objectives.forEach((obj, i) => {
    if (!!obj.optional !== optional || !active(e, i, saga)) return;
    const label = labelOf(e, i, saga);
    const t = timeText(e, i);
    if (t && !timed) {
      timed = `§f${label} §c${t}`;
      timedI = i;
    }
    const focus = sceneFocus(player.id, e, i);
    /** @type {Loc | string | undefined} */
    let loc = focus ?? locate(obj);
    if (!focus && obj.type === "follow") loc = locate(obj.from, "where the trail starts");
    if (!focus && obj.type === "escort" && obj.from) loc = locate(obj.from, obj.who?.name ?? "the start");
    if (!focus && obj.type === "lead") loc = locate(obj.spawnAt, obj.name ? plain(obj.name) : itemName(obj.mob ?? "")) ?? locate(obj.to, "the pen");
    if (obj.npc && (obj.type === "talk" || obj.type === "deliver" || obj.type === "answer")) {
      if (bestD === Infinity && !best) {
        best = `§f${label}${towardNpc(player, obj.npc)}`;
        bestAt = npcTarget(player, obj.npc, label);
        bestI = i;
      }
      return;
    }
    if (loc === undefined) {
      const wait = weatherWait(obj); // the label already counts down the seconds
      if (!best) {
        best = `§f${label}${wait ? ` §7- ${wait}` : ""}`;
        bestI = i;
      }
      return;
    }
    if (typeof loc === "string") {
      if (bestD === Infinity) {
        best = isCamp(loc) ? `§7${placeLabel(loc)} is gone: find them on the road` : `§7${placeLabel(loc)} isn't set yet`;
        bestI = i;
      }
      return;
    }
    if (hidden(e, obj) && !focus) {
      if (bestD === Infinity) {
        best = `§f${label} §7(hint available)`;
        bestI = i;
      }
      return;
    }
    const d = loc.dim === player.dimension.id ? across(player.location, loc) : 1e9;
    if (d < bestD) {
      bestD = d;
      best = `§f${loc.label} ${bearing(player, loc, radiusOf(obj))}${watchText(player, e, i, obj, d <= radiusOf(obj))}`;
      bestAt = { label: loc.label, dim: loc.dim, x: loc.x, z: loc.z };
      bestI = i;
    }
  });
  pointed = bestAt;
  pointedAt = timed ? timedI : bestI;
  return timed ?? best;
}

/**
 * A survive or vigil step's seconds so far and, while the weather is wrong, what it waits for:
 * " 83 s left" or " 120 s left - wait for a thunderstorm (due in about 6 min)"; at the place under a roof (a step
 * that needs the open sky), " 83 s left - step out under the open sky".
 * @param {Player} player @param {Entry} e @param {number} i @param {Objective} obj @param {boolean} here
 */
function watchText(player, e, i, obj, here) {
  if (obj.type !== "survive" && obj.type !== "vigil") return "";
  const left = target(obj) - progressOf(e, i);
  const wait = weatherWait(obj) ?? timeWait(obj) ?? (left > 0 && here && (obj.type === "survive" || obj.outdoors) && !outdoors(player) ? "step out under the open sky" : undefined);
  return `${left > 0 ? ` §e${left} s left` : ""}${wait ? ` §7- ${wait}` : ""}`;
}

/** What realm:track last sent for each player (JSON). @type {Map<string, string>} */
const trackSent = new Map();
/**
 * What each player's quest box last showed and the tick it runs out: an unchanged box is sent again only shortly before
 * it runs out, since every side-box pack parses every realm:side. @type {Map<string, { text: string, until: number }>}
 */
const boxSent = new Map();
/** How long one quest box write lasts (ticks); the tracker runs every 40. */
const BOX_TICKS = 300;
/** An unchanged box is written again when this little of it is left (more than one tracker run). */
const BOX_RENEW = 60;
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  trackSent.delete(playerId);
  boxSent.delete(playerId);
});

/** Takes the player's quest box down, if this pack drew one. @param {Player} player */
export function clearBox(player) {
  if (!boxSent.delete(player.id)) return;
  try {
    side.clear(player);
  } catch {
    // left meanwhile
  }
}

/**
 * The tracker's target for the Minimap (map_bp), when it changed: realm:track { player, label, dim?, x?, z?, npc? },
 * or { player } for none.
 * @param {Player} player @param {Pointed | undefined} target
 */
export function sendTrack(player, target) {
  /** @type {Record<string, unknown>} */
  const msg = { player: player.id };
  if (target) {
    msg.label = plain(target.label).slice(0, 60);
    if (target.dim && Number.isFinite(target.x) && Number.isFinite(target.z)) Object.assign(msg, { dim: target.dim, x: Math.floor(/** @type {number} */ (target.x)), z: Math.floor(/** @type {number} */ (target.z)) });
    if (target.npc) msg.npc = target.npc;
  }
  const json = JSON.stringify(msg);
  if (trackSent.get(player.id) === json) return;
  trackSent.set(player.id, json);
  send("realm:track", msg);
}

/** realm:track_ping { player? }: every target sent so far again. @param {string | undefined} playerId */
export function resendTracks(playerId) {
  for (const [id, json] of trackSent) if (!playerId || id === playerId) system.sendScriptEvent("realm:track", json);
}

/**
 * The tracker: where to go for the tracked quest (Track this quest), else the latest chapter with something to show. The target goes to the Minimap every
 * time (realm:track, when it changed); the line shows when `shown` (the player's tracker is on).
 * @param {Player} player @param {Entry[]} list @param {boolean} [shown]
 */
export function track(player, list, shown = true) {
  const saga = sagaOf(player);
  const sorted = trackedFirst(player, saga.ut?.length ? list.filter((e) => !untracked(saga, e.story.id)) : list);
  /** @type {string | undefined} */
  let line;
  /** @type {Entry | undefined} */
  let shownE;
  let shownAt = -1;
  /** @type {Pointed | undefined} */
  let target;
  /** @type {{ e: Entry, text: string }[]} the other quests going, each with its own tracker line */
  const others = [];
  for (const e of sorted) {
    const text = trackLine(player, e, saga);
    if (!text) continue;
    if (shownE) {
      others.push({ e, text });
      continue;
    }
    line = text;
    shownE = e;
    shownAt = pointedAt;
    target = pointed ? { ...pointed, label: `${e.story.short}: ${pointed.label}` } : undefined;
  }
  sendTrack(player, target);
  const where = getFor(player, "trackerAt");
  if (!shown || !line || !shownE || !isSlot(where)) clearBox(player);
  if (!shown || !line || !shownE) return;
  // Our own note is showing, or (above the hotbar) another pack's (a quest, a bounty, mob health): don't write over it.
  const now = system.currentTick;
  if (now < (ownUntil.get(player.id) ?? 0)) {
    boxSent.delete(player.id); // the note took the box's place: draw the box afresh after it
    return;
  }
  // Above the hotbar: wait while another pack's note holds it (realm:actionbar). The quest box is the story's own.
  if (where === "hotbar" && now < (holdUntil.get(player.id) ?? 0)) return;
  if (!isSlot(where)) return showLine(player, `§b${shownE.story.short}: ${line}`, 50, TRACKER_STEADY);
  const box = questBox(player, shownE, saga, line, shownAt, others);
  const key = `${where}|${box}`;
  const sent = boxSent.get(player.id);
  if (sent && sent.text === key && sent.until - now > BOX_RENEW) return;
  boxSent.set(player.id, { text: key, until: now + BOX_TICKS });
  showLine(player, box, BOX_TICKS, TRACKER_STEADY);
}

/**
 * The quest box (Side HUD's big story box, the "quest" segment): 200 pixels of the default font wide, about 32
 * characters a row, and up to 110 pixels high, about 10 rows; more gets cut off.
 */
const BOX_COLS = 32;
const BOX_ROWS = 10;
/** Bytes of quest box text, after the questCode that says where it shows. */
const BOX_BYTES = QUEST_TEXT_BYTES - byteLength(questCode("right1"));

/** Rows a line takes in a box, wrapped at spaces like the game does (color codes take no room). @param {string} line */
function rowsOf(line) {
  let rows = 1;
  let col = 0;
  for (const word of line.replace(/§./g, "").split(" ")) {
    const w = word.length;
    if (col > 0 && col + 1 + w <= BOX_COLS) col += 1 + w;
    else {
      if (col > 0) rows++;
      col = w;
      while (col > BOX_COLS) {
        rows++;
        col -= BOX_COLS;
      }
    }
  }
  return rows;
}

/** A line cut at a word to fit in `rows` rows, ending in "..." when cut. @param {string} line @param {number} rows */
function fitRows(line, rows) {
  if (rowsOf(line) <= rows) return line;
  const words = line.split(" ");
  while (words.length > 1) {
    words.pop();
    const cut = `${words.join(" ").replace(/[\s,:;(-]+$/, "")}...`;
    if (rowsOf(cut) <= rows) return cut;
  }
  return `${line.replace(/§./g, "").slice(0, BOX_COLS * rows - 3)}...`;
}

/**
 * A label and its tail (where it is, what it waits for) in `rows` rows: the label is cut at a word to make room, so
 * the tail always shows (unless it doesn't fit on its own). @param {string} label @param {string} tail @param {number} rows
 */
function fitTail(label, tail, rows) {
  if (!tail || rowsOf(label + tail) <= rows) return fitRows(label + tail, rows);
  const words = label.split(" ");
  while (words.length > 1) {
    words.pop();
    const cut = `${words.join(" ").replace(/[\s,:;(-]+$/, "")}...${tail}`;
    if (rowsOf(cut) <= rows) return cut;
  }
  return fitRows(label + tail, rows);
}

/**
 * Where one open objective is, for its row in the quest box: " §eNE 240m", " §eMara NE 40m", " §c1:20 left",
 * " §7(hint available)", or "" when it has no place.
 * @param {Player} player @param {Entry} e @param {number} i @param {Saga} saga
 */
function whereOf(player, e, i, saga) {
  const obj = e.chapter.objectives[i];
  const sky = active(e, i, saga) ? skyFocus(player.id, e, i) : undefined;
  if (sky) return ` §e${sky.text}: within ${sky.near} blocks ${bearing(player, sky, sky.near)} §c${clock(sky.left)} left`;
  let out = "";
  const t = timeText(e, i);
  if (t) out += ` §c${t}`;
  if (obj.npc && (obj.type === "talk" || obj.type === "deliver" || obj.type === "answer")) return `${out} §e${towardNpc(player, obj.npc).trim() || `(${npcName(obj.npc)}: /realm:npc)`}`;
  const focus = sceneFocus(player.id, e, i);
  /** @type {Loc | string | undefined} */
  let loc = focus ?? locate(obj);
  if (!focus && obj.type === "follow") loc = locate(obj.from, "where the trail starts");
  if (!focus && obj.type === "escort" && obj.from) loc = locate(obj.from, obj.who?.name ?? "the start");
  if (!focus && obj.type === "lead") loc = locate(obj.spawnAt, obj.name ? plain(obj.name) : itemName(obj.mob ?? "")) ?? locate(obj.to, "the pen");
  if (typeof loc === "string") out += isCamp(loc) ? ` §7(${placeLabel(loc)} is gone: find them on the road)` : ` §7(${placeLabel(loc)} isn't set yet)`;
  else if (loc && hidden(e, obj) && !focus) out += " §7(hint available)";
  else if (loc) {
    const d = loc.dim === player.dimension.id ? across(player.location, loc) : Infinity;
    const b = bearing(player, loc, radiusOf(obj));
    out += `${b === "here" ? " §a(you're here)" : ` §e${b}`}${watchText(player, e, i, obj, d <= radiusOf(obj))}`;
  } else {
    const wait = weatherWait(obj);
    if (wait) out += ` §7- ${wait}`;
  }
  return out;
}

/**
 * The party line of the quest box: who shares this chapter's progress, or "" out of a party (or when it's each
 * player's own story).
 * @param {Player} player @param {Entry} e
 */
function partyLine(player, e) {
  if (!together(e.story)) return "";
  const mates = partyMates(player);
  if (!mates.length) return "";
  if (e.pq) return "§3Party quest: you finished it, so you're helping. Your party reports back.";
  if (e.story.kind === "main") {
    const view = partyViews.get(player.id);
    const on = mates.filter((p) => partyViews.get(p.id)?.chapter.id === e.chapter.id);
    if (!view || !on.length) return "";
    return `§3Party: all progress shared with ${listNames(on.map((p) => p.name))}. One report counts for all.`;
  }
  return `§3Party: mates within ${Number(get("partyRange")) || 64} blocks share progress.`;
}

/**
 * The tracker in Side HUD's quest box: the quest and its chapter, every step of the chapter as a checklist (the one
 * the tracker points at first, then the other open ones with where they are, steps that come later, and the ones done),
 * whether they go in any order or one at a time, who in the party shares it, and the other quests going, one row
 * each. When it doesn't all fit (in rows, or in the box's bytes), the least useful rows go first and the last row says
 * how many more there are; the story log (/realm:saga) has everything.
 * @param {Player} player @param {Entry} e @param {Saga} saga @param {string} first the tracker's line for the quest
 * @param {number} at the objective the tracker points at, or -1
 * @param {{ e: Entry, text: string }[]} [others] the other quests going, with their tracker lines
 */
function questBox(player, e, saga, first, at, others = []) {
  /** @type {{ text: string, tail: string, rows: number, prio: number, kind: "step" | "quest" | "other" }[]} */
  const items = [];
  const add = (/** @type {string} */ text, rows = 1, prio = 5, kind = /** @type {"step" | "quest" | "other"} */ ("other"), tail = "") => items.push({ text, tail, rows, prio, kind });
  add(`§b${e.story.short}§7: ${e.chapter.title}`, 2, 10);
  const done = chapterDone(e, saga);
  if (done) add(`§6> ${plain(first)}`, 2, 9);
  const steps = e.chapter.objectives.map((obj, i) => ({ obj, i })).filter(({ obj }) => !obj.optional && objApplies(e, obj, saga));
  if (!done) {
    const open = steps.filter(({ i }) => !objDone(e, i, saga));
    if (steps.length > 1) add(e.chapter.sequential ? "§7Steps, one at a time, in order:" : open.length > 1 ? "§7Steps, in any order:" : "§7Steps:", 1, 7);
    else if (!steps.length) add(`§f> ${plain(first)}`, 2, 9);
  }
  // Open steps: the one the tracker points at first.
  const order = [...steps].sort((a, b) => (a.i === at ? -1 : b.i === at ? 1 : 0));
  for (const { obj, i } of order) {
    if (reached(e, i) || objDone(e, i, saga)) continue;
    if (!active(e, i, saga)) add(`§8[ ] Then: ${labelOf(e, i, saga)}`, 1, 4, "step");
    else add(`${i === at ? "§e[>] §f" : "§f[ ] "}${labelOf(e, i, saga)}`, i === at ? 4 : 2, i === at ? 9 : 8, "step", whereOf(player, e, i, saga));
  }
  e.chapter.objectives.forEach((obj, i) => {
    if (obj.optional && objApplies(e, obj, saga) && active(e, i, saga)) add(`§7[ ] ${labelOf(e, i, saga)}`, 1, 3, "step", whereOf(player, e, i, saga));
  });
  for (const { obj, i } of steps) if (reached(e, i)) add(`§a[x] §7${obj.label}`, 1, 2, "step");
  const party = partyLine(player, e);
  if (party) add(party, 2, 6);
  for (const o of others) add(`§3${o.e.story.short}§7: ${plain(o.text)}`, 1, 1, "quest");
  // Fit: drop the lowest rows (the last of equals) until the rows and bytes fit, with one row saying what's left out.
  /** "+2 more quests", "+1 more step", or "+3 more" for both. @param {typeof items} left */
  const more = (left) => {
    const q = left.filter((x) => x.kind === "quest").length;
    const n = left.length;
    return `§7+${n} more${q === n ? (n === 1 ? " quest" : " quests") : q === 0 ? (n === 1 ? " step" : " steps") : ""} in /realm:saga`;
  };
  const shown = items.map((x) => ({ ...x, full: x.text, text: fitTail(x.text, x.tail, x.rows) }));
  /** @type {typeof items} */
  const dropped = [];
  const render = () => [...shown.map((x) => x.text), ...(dropped.length ? [more(dropped)] : [])].join("\n");
  const rows = () => shown.reduce((n, x) => n + rowsOf(x.text), 0) + (dropped.length ? 1 : 0);
  while (shown.length > 1 && (rows() > BOX_ROWS || byteLength(render()) > BOX_BYTES)) {
    // Too many rows: a two-row line below the top ones goes down to one row first (the last such line).
    let squeeze = -1;
    if (rows() > BOX_ROWS) for (let k = shown.length - 1; k >= 0 && squeeze < 0; k--) if (shown[k].prio < 9 && rowsOf(shown[k].text) > 1) squeeze = k;
    if (squeeze >= 0) {
      shown[squeeze].text = fitTail(shown[squeeze].full, shown[squeeze].tail, 1);
      continue;
    }
    let low = 0;
    for (let k = 1; k < shown.length; k++) if (shown[k].prio <= shown[low].prio) low = k;
    dropped.push(shown[low]);
    shown.splice(low, 1);
  }
  return clipTo(render(), BOX_BYTES);
}

/** Text cut to a number of UTF-8 bytes on a whole character, with no dangling "§". @param {string} text @param {number} max */
function clipTo(text, max) {
  // Counted once, a character at a time: the box is redrawn for every player every 2 seconds.
  if (text.length <= max / 3 || byteLength(text) <= max) return text.replace(/§$/, "");
  let n = 0;
  let end = 0;
  for (const ch of text) {
    const c = /** @type {number} */ (ch.codePointAt(0));
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    if (n > max) break;
    end += ch.length;
  }
  return text.slice(0, end).replace(/§$/, "");
}

// ---------------------------------------------------------------------------
// The story log (/realm:saga)
// ---------------------------------------------------------------------------

/** @param {Story} story @param {StoryState} st */
function choicesMade(story, st) {
  /** @type {string[]} */
  const out = [];
  for (const c of story.chapters) {
    for (const [key, list] of /** @type {[string, import("./types.js").Choice[] | undefined][]} */ ([
      [`${c.id}@`, c.introChoices],
      [c.id, c.choices],
    ])) {
      const id = st.ch[key];
      const choice = id ? list?.find((x) => x.id === id) : undefined;
      if (choice) out.push(`${c.title}: ${choice.label}`);
    }
    c.objectives.forEach((o, i) => {
      const id = st.ch[`${c.id}#${i}`];
      const choice = id ? o.choices?.find((x) => x.id === id) : undefined;
      if (choice) out.push(`${c.title}: ${choice.label}`);
    });
  }
  return out;
}

/** Which stories are where for this player. @param {Player} player */
function sortStories(player) {
  const saga = sagaOf(player);
  /** @type {Story[]} */
  const current = [];
  /** @type {Story[]} */
  const available = [];
  /** @type {{ story: Story, why: string[] }[]} */
  const locked = [];
  /** @type {Story[]} */
  const done = [];
  let nextMain = true;
  for (const story of ORDERED) {
    const st = saga.s[story.id];
    if (finished(saga, story)) done.push(story);
    else if (st && (st.a || st.dn.length)) current.push(story);
    else {
      const req = requires(story.requires, saga, story.id, player);
      if (req.ok) available.push(story);
      else if (story.kind !== "main" || nextMain) locked.push({ story, why: req.why });
      if (story.kind === "main") nextMain = false;
    }
  }
  return { saga, current, available, locked, done };
}

/** @param {Player} player */
export async function showMenu(player) {
  while (player.isValid) {
    entries(player); // tidies chapters that vanished from the stories
    tidyFavors(player);
    const { saga, current, available, done } = sortStories(player);
    const favorsOn = get("favors") === true && favorsByNpc.size > 0;
    const active = entries(player);
    const lines = [];
    if (get("enabled") !== true) lines.push("§cStories are paused by an operator: nothing counts for now.§r", "");
    const tr = saga.tr ? active.find((e) => e.story.id === saga.tr) : undefined;
    const shown = active.filter((e) => !untracked(saga, e.story.id));
    const main = tr ?? shown.find((e) => e.story.kind === "main") ?? shown[0] ?? active[0];
    if (main) lines.push(`§fNow: §e${main.story.title}§r`, `§7Current step: ${stepLine(player, main, saga)}`);
    else lines.push(available.length ? `§7Talk to ${npcName(available[0].giver)} to start ${available[0].title}.` : "§7No story in progress.");
    /** @type {[string, () => Promise<unknown>][]} */
    const actions = [
      [`Current quests (${current.length + active.filter((e) => e.fav).length})`, () => currentPage(player)],
      [`Available (${available.length})`, () => availablePage(player)],
      [`Finished (${done.length} ${done.length === 1 ? "story" : "stories"}, ${questsDone(saga)} quests)`, () => finishedPage(player)],
      [`Codex (${saga.cx?.length ?? 0})`, () => codexPage(player)],
    ];
    if (favorsOn) actions.push(["Daily favors", () => favorsPage(player)]);
    if (isOp(player)) {
      actions.push(["§4Story places\n§8Operators", () => placesMenu(player)]);
      actions.push(["§4Operator tools\n§8Operators", () => opTools(player)]);
    }
    const form = new ActionFormData().title("§lStory Log").body(lines.join("\n"));
    for (const [label] of actions) form.button(label);
    form.button("Close");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || res.selection >= actions.length) return;
    await actions[res.selection][1]();
  }
}

/** Current quests: main story first, then side stories, then favors. @param {Player} player */
export async function currentPage(player) {
  while (player.isValid) {
    const { saga, current } = sortStories(player);
    const list = entries(player);
    const favs = list.filter((e) => e.fav);
    // A party quest (party.js) comes first, also when the player finished that story long ago.
    const party = list.find((e) => e.pq);
    const stories = party && !current.includes(party.story) ? [party.story, ...current] : current;
    if (!stories.length && !favs.length) {
      await show(player, new ActionFormData().title("Current quests").body("No story in progress. See Available for stories you can start.").button("Back"));
      return;
    }
    const form = new ActionFormData().title("Current quests").body("Pick one for its objectives, Track this quest or Stop tracking, a hint, and the intro again.");
    /** @type {(() => Promise<unknown>)[]} */
    const acts = [];
    /** @param {string} id */
    const mark = (id) => (saga.tr === id && list.some((x) => x.story.id === id) ? "§b[Tracked]§r " : untracked(saga, id) && list.some((x) => x.story.id === id) ? "§8[Not tracked]§r " : "");
    for (const story of stories) {
      const e = list.find((x) => x.story.id === story.id);
      const cur = currentChapter(saga, story);
      const step = e ? stepLine(player, e, saga) : cur && onHold(player.id, story, cur.chapter.id) ? "Waiting for your party" : `Talk to ${npcName(cur?.chapter.npc ?? story.giver)} to go on`;
      form.button(`${mark(story.id)}${story.kind === "main" ? "§l" : ""}${e?.pq ? "Party: " : ""}${story.title}§r\n§8${plain(step).slice(0, 60)}`);
      acts.push(() => chapterInfo(player, story));
    }
    for (const e of favs) {
      form.button(`${mark(e.story.id)}${e.story.title}\n§8${plain(stepLine(player, e, saga)).slice(0, 60)}`);
      acts.push(() => (e.wv ? wanderInfo(player) : favorInfo(player, /** @type {string} */ (e.fav))));
    }
    form.button("Back");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || res.selection >= acts.length) return;
    await acts[res.selection]();
  }
}

/** Stories to start, and the next locked ones with what they need. @param {Player} player */
async function availablePage(player) {
  const { available, locked } = sortStories(player);
  const lines = [];
  if (available.length) {
    lines.push("§lReady to start§r");
    for (const s of available) lines.push(`§e${s.title}§r ${toneTags(s)}\n§7${s.summary ? `${s.summary} ` : ""}Talk to ${npcName(s.giver)}${towardNpc(player, s.giver)}.`);
  }
  if (locked.length) {
    lines.push("", "§lLater§r");
    for (const { story, why } of locked) lines.push(`§7${story.title}: ${why.join(", ")}.`);
  }
  if (!lines.length) lines.push("You've started every story there is.");
  await show(player, new ActionFormData().title("Available").body(lines.join("\n")).button("Back"));
}

/** Quests (story chapters) finished, in every story, finished or not. @param {Saga} saga */
function questsDone(saga) {
  let n = 0;
  for (const story of ORDERED) n += story.chapters.filter((c) => saga.s[story.id]?.dn.includes(c.id)).length;
  return n;
}

/**
 * Finished: two sections on one page. Stories finished to the end, with how they ended; then Quests, the chapters
 * finished in stories still going. Each opens its chapters and the choices made.
 * @param {Player} player
 */
async function finishedPage(player) {
  while (player.isValid) {
    const { saga, done } = sortStories(player);
    const going = ORDERED.filter((s) => !done.includes(s) && s.chapters.some((c) => saga.s[s.id]?.dn.includes(c.id)));
    const quests = questsDone(saga);
    const form = new ActionFormData().title("Finished").body(`${done.length} ${done.length === 1 ? "story" : "stories"} and ${quests} quest${quests === 1 ? "" : "s"} finished.${saga.wn ? ` Strangers' requests done: ${saga.wn}.` : ""}`);
    form.label(`§l§6Stories (${done.length})`);
    if (!done.length) form.label("§7No story finished to the end yet.");
    for (const s of done) form.button(`${s.title}\n§8${choicesMade(s, saga.s[s.id]).length} choices made`);
    form.label(`§l§6Quests (${quests})`);
    if (!going.length && !done.length) form.label("§7No quest finished yet. Each chapter of a story you finish shows here.");
    else if (!going.length) form.label("§7Every quest you finished is part of a story above.");
    for (const s of going) {
      const n = s.chapters.filter((c) => saga.s[s.id].dn.includes(c.id)).length;
      form.button(`${s.title}\n§8${n} of ${s.chapters.length} quests done`);
    }
    form.button("Back");
    const res = await show(player, form);
    const list = [...done, ...going];
    if (!res || res.canceled || res.selection === undefined || res.selection >= list.length) return;
    const s = list[res.selection];
    const st = saga.s[s.id];
    const made = choicesMade(s, st);
    const chapters = s.chapters.filter((c) => st.dn.includes(c.id)).map((c) => `§a- ${c.title}§r`);
    const ended = done.includes(s);
    const body = [toneTags(s), "", ended ? "§lChapters§r" : `§lQuests done (${chapters.length} of ${s.chapters.length})§r`, ...(chapters.length ? chapters : ["§7(all of them)"]), "", "§lYour choices§r", ...(made.length ? made.map((m) => `§7${m}`) : ["§7No choices made yet."])];
    if (ended && made.length) body.push("", `§fThe ending: §e${made[made.length - 1].split(": ").slice(1).join(": ")}`);
    await show(player, new ActionFormData().title(s.title).body(body.join("\n")).button("Back"));
  }
}

/** The codex: every lore entry found, readable. @param {Player} player */
async function codexPage(player) {
  while (player.isValid) {
    const saga = sagaOf(player);
    const ids = (saga.cx ?? []).filter((id) => codexById.has(id));
    if (!ids.length) {
      await show(player, new ActionFormData().title("Codex").body("Nothing here yet. The stories add an entry here for every secret you uncover.").button("Back"));
      return;
    }
    const form = new ActionFormData().title("Codex").body(`${ids.length} of ${codexById.size} entries found.`);
    for (const id of ids) {
      const c = /** @type {{ title: string, story: string }} */ (codexById.get(id));
      form.button(`${c.title}\n§8${c.story}`);
    }
    form.button("Back");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || res.selection >= ids.length) return;
    const c = /** @type {{ title: string, text: string, story: string }} */ (codexById.get(ids[res.selection]));
    await show(player, new ActionFormData().title(c.title).body(`§7${c.story}§r\n\n${c.text}`).button("Back"));
  }
}

/** Today's favors from every questgiver. @param {Player} player */
async function favorsPage(player) {
  const saga = sagaOf(player);
  const day = today();
  const lines = ["Each questgiver has one favor for you each day (a new one at midnight UTC). Tap them to take it.", ""];
  for (const npc of favorsByNpc.keys()) {
    const fs = saga.fv?.[npc];
    let status;
    if (fs?.a && !fs.c) {
      const e = entries(player).find((x) => x.fav === npc);
      status = e && chapterDone(e, saga) ? "§6done: report back" : `§ein progress: ${e ? plain(stepLine(player, e, saga)) : ""}`;
    } else if (fs && fs.d >= day) status = "§adone for today";
    else status = `§f${favorOfDay(player.id, npc, day)?.label ?? ""} §7(tap them to take it)`;
    lines.push(`§e${npcName(npc)}§r: ${status}§r`);
  }
  await show(player, new ActionFormData().title("Daily favors").body(lines.join("\n")).button("Back"));
}

// ---------------------------------------------------------------------------
// Operator tools
// ---------------------------------------------------------------------------

/** @param {Player} player */
async function pickPlayer(player, /** @type {string} */ title) {
  const all = world.getAllPlayers();
  const res = await show(player, new ModalFormData().title(title).dropdown("Player", all.map((p) => p.name)).submitButton("OK"));
  if (!res || res.canceled) return undefined;
  const p = all[Number(res.formValues?.[0] ?? 0)];
  return p?.isValid ? p : undefined;
}

/** Resets a player's stories. @param {Player} target @param {Player} [by] */
export function resetPlayer(target, by) {
  forget(target.id);
  endScenesOf(target.id);
  target.setDynamicProperty("saga:p", undefined);
  target.sendMessage("§e[Story] Your stories were reset by an operator.");
  if (by && by.id !== target.id) by.sendMessage(`§a[Story] Reset the stories of ${target.name}.`);
}

/** @param {Player} player */
async function opTools(player) {
  const res = await show(
    player,
    new ActionFormData()
      .title("Operator tools")
      .body("Story settings (switches, hint cost, picked places, favors) are in /realm:config, Story Questlines.")
      .button("Story places")
      .button("Finish a player's current step\n§8For a stuck player")
      .button("Reset a player's stories")
      .button("Back"),
  );
  if (!res || res.canceled) return;
  if (res.selection === 0) return placesMenu(player);
  if (res.selection === 1) {
    const target = await pickPlayer(player, "Finish a step");
    if (!target) return;
    const name = target.name;
    const list = entries(target);
    if (!list.length) return player.sendMessage(`§7[Story] ${name} isn't working on any chapter.`);
    const form = new ActionFormData().title("Finish a step").body(`${name}'s chapters: pick one to finish its current step.`);
    for (const e of list) form.button(`${e.story.title}\n§8${plain(stepLine(target, e, sagaOf(target))).slice(0, 60)}`);
    form.button("Back");
    const r = await show(player, form);
    if (!r || r.canceled || r.selection === undefined || r.selection >= list.length) return;
    // They may have left while the menu was open, and the operator may have lost their rights.
    if (!target.isValid) return player.sendMessage(`§7[Story] ${name} left meanwhile; nothing was changed.`);
    if (!isOp(player)) return player.sendMessage("§c[Story] Only operators can do that; nothing was changed.");
    const ok = completeStep(target, list[r.selection]);
    player.sendMessage(ok ? `§a[Story] Finished ${name}'s current step in ${list[r.selection].story.title}.` : "§7[Story] Nothing left to finish there: they can report back.");
    return;
  }
  if (res.selection === 2) {
    const target = await pickPlayer(player, "Reset stories");
    if (!target) return;
    const name = target.name;
    const sure = await show(player, new ActionFormData().title("Reset stories?").body(`Start all of ${name}'s stories over? Rewards already given are kept.`).button("Reset").button("Cancel"));
    if (!sure || sure.canceled || sure.selection !== 0) return;
    if (!target.isValid) return player.sendMessage(`§7[Story] ${name} left meanwhile; nothing was changed.`);
    if (!isOp(player)) return player.sendMessage("§c[Story] Only operators can do that; nothing was changed.");
    resetPlayer(target, player);
  }
}

export { counting };
