// What players see: offers at the townsfolk, chapter dialogues, hints, rewards, the tracker, the
// story log menu (current, available, finished, codex, daily favors) and the operators' tools.
import { Player, system, world } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import {
  ORDERED,
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
  forget,
  giveRep,
  invalidate,
  markDirty,
  objApplies,
  objDone,
  objKey,
  pagesFor,
  progressOf,
  requires,
  sagaOf,
  stateOf,
  storyById,
  target,
  today,
} from "./data.js";
import { askAnswer, completeStep, counting, endScene, endScenesOf, giveItem, holdUntil, ownUntil, sideHold, radiusOf, reportTo, sceneFocus, showLine, timeText, weather } from "./objectives.js";
import { ensurePlace, locate, placeLabel, placesIn, placesMenu, placesOf } from "./places.js";
import { get, getFor } from "./settings.js";
import { PACK, across, compass, coords, dialog, dimName, exclusive, isOp, itemName, npcName, num, plain, send, show } from "./util.js";

/** @typedef {import("./data.js").Entry} Entry */
/** @typedef {import("./data.js").Saga} Saga */
/** @typedef {import("./data.js").StoryState} StoryState */
/** @typedef {import("./data.js").FavorState} FavorState */
/** @typedef {import("./types.js").Story} Story */
/** @typedef {import("./types.js").Chapter} Chapter */
/** @typedef {import("./types.js").Objective} Objective */
/** @typedef {import("./types.js").Reward} Reward */
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

/** " (NE 40m)" toward an NPC, or "". @param {Player} player @param {string} npc */
function towardNpc(player, npc) {
  const at = npcAt(player.dimension, npc);
  if (!at) return "";
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
    if (n >= need) return out.push(`§a[Done] ${obj.label}§r`);
    if (e.chapter.sequential && step !== i) return out.push(`§8- ${i > step ? "(later) " : ""}${obj.label}§r`);
    let line = `§e- ${obj.label}§r`;
    if (need > 1) line += ` §f${n}/${need}${obj.type === "survive" || obj.type === "vigil" ? " s" : obj.type === "ride" ? " blocks" : ""}`;
    const t = timeText(e, i);
    if (t) line += ` §c${t}`;
    if (obj.npc && (obj.type === "talk" || obj.type === "deliver" || obj.type === "answer")) line += ` §7(${npcName(obj.npc)}${towardNpc(player, obj.npc)})`;
    const loc = locate(obj);
    if (typeof loc === "string") line += `\n  §7(${placeLabel(loc)} isn't set yet: an operator sets it in /realm:saga_places)`;
    else if (loc && hidden(e, obj)) line += " §7(find it yourself, or ask for a hint)";
    else if (loc) line += ` §7(${loc.label} ${bearing(player, loc, radiusOf(obj))})`;
    if ((obj.type === "survive" || obj.type === "vigil") && obj.weather !== "any" && (obj.weather || obj.type === "survive")) {
      const want = obj.weather ?? "thunder";
      if ((want === "thunder" && weather !== "Thunder") || (want === "rain" && weather === "Clear")) line += `\n  §7Wait for ${want === "thunder" ? "a thunderstorm" : "rain"}.`;
    }
    out.push(`${line}§r`);
  });
  return out;
}

/** One short line: what to do next (the "current step"). @param {Player} player @param {Entry} e @param {Saga} saga */
function stepLine(player, e, saga) {
  if (chapterDone(e, saga)) return `§6Report to ${npcName(reportTo(e))}${towardNpc(player, reportTo(e))}`;
  const i = currentStep(e, saga);
  if (i < 0) return "";
  const obj = e.chapter.objectives[i];
  const t = timeText(e, i);
  return `${obj.label}${t ? ` (${t})` : ""}`;
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

/**
 * Gives a reward (levels and Crowns cut by `penalty` after a hint); returns what this pack gave itself.
 * @param {Player} player @param {Reward | undefined} r @param {string} source @param {number} [penalty]
 */
export function reward(player, r, source, penalty = 0) {
  if (!r) return "";
  /** @type {string[]} */
  const given = [];
  const keep = 1 - Math.max(0, Math.min(1, penalty));
  const levels = Math.round((r.levels ?? 0) * keep);
  const crowns = Math.round((r.crowns ?? 0) * keep);
  try {
    if (levels > 0) {
      player.addLevels(levels);
      given.push(`${levels} level${levels === 1 ? "" : "s"}`);
    }
  } catch (e) {
    console.warn(`[saga] levels: ${e}`);
  }
  for (const it of r.items ?? []) {
    try {
      const dropped = giveItem(player, it.item, it.amount, it.name, it.lore);
      given.push(`${it.amount} ${it.name ? `"${plain(it.name)}"` : itemName(it.item)}${dropped ? " (some dropped at your feet: your inventory is full)" : ""}`);
    } catch (e) {
      console.warn(`[saga] reward ${it.item}: ${e}`);
    }
  }
  if (crowns > 0 && addCrowns(player, crowns)) player.sendMessage(`§6+${crowns} Crowns §7(${source})`);
  const cut = penalty > 0 && ((r.levels ?? 0) > levels || (r.crowns ?? 0) > crowns);
  // These belong to other packs, which tell the player themselves (nothing happens without them).
  if (r.relic) send("realm:relic_give", { player: player.id, relic: r.relic });
  if (r.title) send("realm:title_unlock", { player: player.id, title: r.title, from: PACK });
  if (r.journal) send("realm:journal", { player: player.id, page: "story", entry: r.journal.entry, label: r.journal.label });
  if (r.codex) {
    const saga = sagaOf(player);
    saga.cx ??= [];
    if (!saga.cx.includes(r.codex.id)) {
      saga.cx.push(r.codex.id);
      markDirty(player);
      player.sendMessage(`§d[Codex] New entry: ${r.codex.title} §7(read it in /realm:saga, Codex)`);
    }
  }
  return given.join(", ") + (cut ? " (less for the hint)" : "");
}

function crownsObjective() {
  try {
    return world.scoreboard.getObjective("crowns") ?? world.scoreboard.addObjective("crowns", "Crowns");
  } catch {
    return world.scoreboard.getObjective("crowns"); // another pack added it this tick
  }
}

/** @param {Player} p @param {number} n */
function addCrowns(p, n) {
  try {
    const obj = crownsObjective();
    if (!obj) return false;
    obj.addScore(p, Math.floor(n));
    return true;
  } catch (e) {
    console.warn(`[saga] crowns: ${e}`);
    return false;
  }
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
    for (const name of placesIn(obj)) if (!placesOf()[name] && !ensurePlace(name) && !out.includes(name)) out.push(name);
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
  const tag = story.kind === "main" ? "Main story" : "Story";
  if (!st || !st.a || st.cur !== chapter.id) {
    if (starter !== npc) return undefined;
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
      if (obj.type === "answer" && obj.npc === npc && !objDone(e, i, saga) && (!e.chapter.sequential || currentStep(e, saga) === i))
        out.push({ key: `ans:${e.story.id}:${i}`, label: `Answer: ${obj.label}`, order: CONFIG.offerOrder - 1 });
    });
  const f = favorOffer(player, npc);
  if (f) out.push({ ...f, order: CONFIG.offerOrder + 5 });
  return out;
}

/** The player picked one of our offers. @param {Player} player @param {string} key */
export async function choose(player, key) {
  const [kind, id, extra] = key.split(":");
  if (kind === "fvstart") return favorStart(player, id);
  if (kind === "fvend") return favorEnd(player, id);
  if (kind === "fvinfo") return favorInfo(player, id);
  if (kind === "ans") {
    const e = entries(player).find((x) => x.story.id === id || x.story.id === `${id}:${extra}`);
    if (e) await askAnswer(player, e, Number(key.split(":").pop()));
    return;
  }
  const story = storyById.get(id ?? "");
  if (!story) return;
  if (kind === "start") return startChapter(player, story);
  if (kind === "end") return endChapter(player, story);
  if (kind === "info") return chapterInfo(player, story);
}

// ---------------------------------------------------------------------------
// Chapter dialogues
// ---------------------------------------------------------------------------

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

/** The intro of the next chapter, and accepting it. @param {Player} player @param {Story} story */
export async function startChapter(player, story) {
  await exclusive(player, async () => {
    const saga = sagaOf(player);
    const st = stateOf(saga, story);
    const cur = currentChapter(saga, story);
    if (!cur || (st.a && st.cur === cur.chapter.id)) return;
    if (!st.dn.length) {
      const req = requires(story.requires, saga, story.id, player);
      if (!req.ok) {
        player.sendMessage(`§7[Story] ${story.title} isn't ready yet: ${req.why.join(", ")}.`);
        return;
      }
    }
    const { chapter } = cur;
    const choices = (chapter.introChoices ?? []).filter((c) => requires(c.requires, saga, story.id, player).ok);
    const buttons = choices.length ? [...choices.map((c) => c.label), "Not now"] : ["Accept", "Not now"];
    const header = [story.title !== chapter.title ? chapterHeader(saga, story, cur.index) : "", !st.dn.length ? toneTags(story) : ""].filter(Boolean).join("\n");
    const pick = await dialog(player, story.title, header, pagesFor(chapter.intro, saga, story.id, player.name), buttons);
    if (pick < 0 || pick === buttons.length - 1 || !player.isValid) return;
    // Check again: the form was open for a while.
    const again = currentChapter(saga, story);
    if (!again || again.chapter.id !== chapter.id || (st.a && st.cur === chapter.id)) return;
    const choice = choices[pick];
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
    invalidate(player.id);
    markDirty(player, true);
    const e = entries(player).find((x) => x.story.id === story.id);
    player.sendMessage(`§6[Story] ${story.title}: ${chapter.title}`);
    // Recipes the chapter asks you to cook; the Kitchen pack tells the player (nothing happens without it).
    for (const recipe of chapter.teach ?? []) send("realm:recipe_learn", { player: player.id, recipe });
    if (e) {
      const missing = missingPlaces(e, saga); // picks unset places first, so the lines below can point at them
      for (const line of objectiveLines(player, e, saga)) player.sendMessage(line.replace(/\n\s*/g, " "));
      for (const name of missing) {
        player.sendMessage(`§c[Story] This chapter needs the place "${placeLabel(name)}", which isn't set yet: an operator sets it in /realm:saga_places.`);
        hintOps(player, name, story);
      }
      travelTips(player, e);
    }
    player.sendMessage("§7The tracker above your hotbar points the way. /realm:saga shows your progress, and a hint if you're stuck.");
    player.playSound("random.orb", { pitch: 0.8, volume: 0.7 });
    if (choice?.reply?.length) await dialog(player, story.title, "", pagesFor(choice.reply, saga, story.id, player.name), ["OK"]);
  });
}

/** What a hint costs for an entry: levels and Crowns. @param {Entry} e */
function hintCost(e) {
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
  await exclusive(player, async () => {
    while (player.isValid) {
      const saga = sagaOf(player);
      const st = stateOf(saga, story);
      const cur = currentChapter(saga, story);
      if (!cur) return;
      const e = entries(player).find((x) => x.story.id === story.id);
      const lines = [chapterHeader(saga, story, cur.index), toneTags(story)].filter(Boolean);
      if (!e) {
        const starter = cur.chapter.npc ?? story.giver;
        lines.push("", `§7Talk to ${npcName(starter)}${towardNpc(player, starter)} to begin this chapter.`);
        await show(player, new ActionFormData().title(story.title).body(lines.join("\n")).button("OK"));
        return;
      }
      lines.push("", `§fCurrent step: §e${stepLine(player, e, saga)}§r`, "", ...objectiveLines(player, e, saga));
      if (chapterDone(e, saga)) lines.push("", `§6All done: go back to ${npcName(reportTo(e))}${towardNpc(player, reportTo(e))}.`);
      const cost = hintCost(e);
      /** @type {[string, () => Promise<unknown>][]} */
      const actions = [];
      actions.push([
        st.h ? "Read the hint again" : cost.levels + cost.crowns > 0 ? `Ask for a hint\n§8Costs ${cost.levels} level${cost.levels === 1 ? "" : "s"}, ${cost.crowns} Crowns` : "Ask for a hint\n§8Free",
        () => showHint(player, e),
      ]);
      actions.push(["Hear the intro again", () => dialog(player, story.title, chapterHeader(saga, story, cur.index), pagesFor(cur.chapter.intro, saga, story.id, player.name), ["OK"])]);
      e.chapter.objectives.forEach((obj, i) => {
        if (obj.type === "answer" && !obj.npc && !(obj.place || obj.at || obj.offset) && !objDone(e, i, saga))
          actions.push([`Answer: ${obj.label}`, () => answerFromLog(player, e, i)]);
      });
      const form = new ActionFormData().title(story.title).body(lines.join("\n"));
      for (const [label] of actions) form.button(label);
      form.button("OK");
      const res = await show(player, form);
      if (!res || res.canceled || res.selection === undefined || res.selection >= actions.length) return;
      await actions[res.selection][1]();
    }
  });
}

/** An answer typed from the log (the form helper is exclusive too, so step out first). @param {Player} player @param {Entry} e @param {number} i */
function answerFromLog(player, e, i) {
  system.runTimeout(() => askAnswer(player, e, i).catch(() => {}), 2);
  return Promise.resolve();
}

/** The outro, the choice, the rewards. @param {Player} player @param {Story} story */
export async function endChapter(player, story) {
  /** @type {Story | undefined} */
  let continueWith;
  await exclusive(player, async () => {
    const saga = sagaOf(player);
    const st = stateOf(saga, story);
    const cur = currentChapter(saga, story);
    const e = entries(player).find((x) => x.story.id === story.id);
    if (!cur || !e || !st.a || st.cur !== cur.chapter.id || !chapterDone(e, saga)) return;
    const { chapter, index } = cur;
    const header = chapterHeader(saga, story, index);
    const choices = (chapter.choices ?? []).filter((c) => requires(c.requires, saga, story.id, player).ok);
    const last = !story.chapters.some((c, k) => k !== index && !st.dn.includes(c.id) && chapterApplies(c, saga, story));
    const buttons = choices.length ? choices.map((c) => c.label) : [last ? "Finish the story" : "Finish the chapter"];
    const pick = await dialog(player, story.title, header, pagesFor(chapter.outro, saga, story.id, player.name), buttons);
    if (pick < 0 || !player.isValid) return; // nothing is lost: the report waits at the NPC
    // Check again before paying out: the form was open for a while.
    const again = currentChapter(saga, story);
    if (!again || again.chapter.id !== chapter.id || !st.a || !chapterDone(e, saga)) return;
    const choice = choices[pick];
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
    send("realm:quest_done", { player: player.id, pack: PACK, id: `${story.id}:${chapter.id}`, label: `${story.title}: ${chapter.title}`, kind: "story" });
    if (next) {
      const who = next.chapter.npc ?? story.giver;
      player.sendMessage(`§e[Story] Next: talk to ${npcName(who)} for "${next.chapter.title}".`);
      player.playSound("random.levelup", { pitch: 1, volume: 0.8 });
      if (who === (chapter.end ?? chapter.npc ?? story.giver)) continueWith = story;
    } else {
      player.sendMessage(`§6[Story] Story complete: ${story.title}!`);
      player.playSound("random.levelup", { pitch: 0.7, volume: 1 });
      for (const s of ORDERED) {
        if (s.id === story.id || saga.s[s.id] || !s.requires?.stories?.includes(story.id)) continue;
        if (requires(s.requires, saga, s.id, player).ok) player.sendMessage(`§e[Story] New story: ${s.title}. Talk to ${npcName(s.giver)}.`);
      }
    }
    if (choice?.reply?.length) await dialog(player, story.title, header, pagesFor(choice.reply, saga, story.id, player.name), ["OK"]);
  });
  // The same NPC tells the next chapter: go straight on (Not now is always there).
  if (continueWith && player.isValid) await startChapter(player, continueWith);
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
    const res = await show(player, new ActionFormData().title(e.story.title).body(lines.join("\n")).button("OK").button("Give up this favor"));
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
    send("realm:quest_done", { player: player.id, pack: PACK, id: `favor:${f.id}`, label: `Favor: ${f.label}`, kind: "favor" });
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
// The tracker
// ---------------------------------------------------------------------------

/** The tracker line for one entry, or undefined when there's nothing to point at. @param {Player} player @param {Entry} e @param {Saga} saga */
function trackLine(player, e, saga) {
  if (chapterDone(e, saga)) return `§6report to ${npcName(reportTo(e))}${towardNpc(player, reportTo(e))}`;
  /** @type {string | undefined} */
  let best;
  let bestD = Infinity;
  /** @type {string | undefined} */
  let timed;
  e.chapter.objectives.forEach((obj, i) => {
    if (objDone(e, i, saga) || (e.chapter.sequential && currentStep(e, saga) !== i)) return;
    const t = timeText(e, i);
    if (t && !timed) timed = `§f${obj.label} §c${t}`;
    const focus = sceneFocus(player.id, e, i);
    /** @type {Loc | string | undefined} */
    let loc = focus ?? locate(obj);
    if (!focus && obj.type === "follow") loc = locate(obj.from, "where the trail starts");
    if (!focus && obj.type === "escort" && obj.from) loc = locate(obj.from, obj.who?.name ?? "the start");
    if (!focus && obj.type === "lead") loc = locate(obj.spawnAt, obj.name ? plain(obj.name) : itemName(obj.mob ?? "")) ?? locate(obj.to, "the pen");
    if (obj.npc && (obj.type === "talk" || obj.type === "deliver" || obj.type === "answer")) {
      if (bestD === Infinity && !best) best = `§f${obj.label}${towardNpc(player, obj.npc)}`;
      return;
    }
    if (loc === undefined) {
      if (!best) best = `§f${obj.label}`;
      return;
    }
    if (typeof loc === "string") {
      if (bestD === Infinity) best = `§7${placeLabel(loc)} isn't set yet`;
      return;
    }
    if (hidden(e, obj) && !focus) {
      if (bestD === Infinity) best = `§f${obj.label} §7(hint available)`;
      return;
    }
    const d = loc.dim === player.dimension.id ? across(player.location, loc) : 1e9;
    if (d < bestD) {
      bestD = d;
      best = `§f${loc.label} ${bearing(player, loc, radiusOf(obj))}${loc.pending ? "" : ""}`;
    }
  });
  return timed ?? best;
}

/** The tracker: where to go for the latest chapter with something to show. @param {Player} player @param {Entry[]} list */
export function track(player, list) {
  // Our own note is showing, or (above the hotbar) another pack's (a quest, a bounty, mob health): don't write over it.
  if (system.currentTick < (ownUntil.get(player.id) ?? 0)) return;
  // Wait while another pack's note holds the same spot: the action bar (realm:actionbar) or the right-side box (realm:side).
  const where = getFor(player, "trackerAt");
  const hold = where === "hotbar" ? holdUntil : where === "middle" ? undefined : sideHold;
  if (hold && system.currentTick < (hold.get(player.id) ?? 0)) return;
  const saga = sagaOf(player);
  const sorted = [...list].sort((a, b) => (b.st.t ?? 0) - (a.st.t ?? 0));
  for (const e of sorted) {
    const text = trackLine(player, e, saga);
    if (!text) continue;
    showLine(player, `§b${e.story.short}: ${text}`, 50);
    return;
  }
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
    const main = active.find((e) => e.story.kind === "main") ?? active[0];
    if (main) lines.push(`§fNow: §e${main.story.title}§r`, `§7Current step: ${stepLine(player, main, saga)}`);
    else lines.push(available.length ? `§7Talk to ${npcName(available[0].giver)} to start ${available[0].title}.` : "§7No story in progress.");
    /** @type {[string, () => Promise<unknown>][]} */
    const actions = [
      [`Current quests (${current.length + active.filter((e) => e.fav).length})`, () => currentPage(player)],
      [`Available (${available.length})`, () => availablePage(player)],
      [`Finished (${done.length})`, () => finishedPage(player)],
      [`Codex (${saga.cx?.length ?? 0})`, () => codexPage(player)],
    ];
    if (favorsOn) actions.push(["Daily favors", () => favorsPage(player)]);
    if (isOp(player)) {
      actions.push(["Story places\n§8Operators", () => placesMenu(player)]);
      actions.push(["Operator tools\n§8Operators", () => opTools(player)]);
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
    const favs = entries(player).filter((e) => e.fav);
    if (!current.length && !favs.length) {
      await show(player, new ActionFormData().title("Current quests").body("No story in progress. See Available for stories you can start.").button("Back"));
      return;
    }
    const form = new ActionFormData().title("Current quests").body("Pick one for its objectives, a hint, and the intro again.");
    /** @type {(() => Promise<unknown>)[]} */
    const acts = [];
    for (const story of current) {
      const e = entries(player).find((x) => x.story.id === story.id);
      const cur = currentChapter(saga, story);
      const step = e ? stepLine(player, e, saga) : `Talk to ${npcName(cur?.chapter.npc ?? story.giver)} to go on`;
      form.button(`${story.kind === "main" ? "§l" : ""}${story.title}§r\n§8${plain(step).slice(0, 60)}`);
      acts.push(() => chapterInfo(player, story));
    }
    for (const e of favs) {
      form.button(`${e.story.title}\n§8${plain(stepLine(player, e, saga)).slice(0, 60)}`);
      acts.push(() => favorInfo(player, /** @type {string} */ (e.fav)));
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

/** Finished stories with the choices made. @param {Player} player */
async function finishedPage(player) {
  while (player.isValid) {
    const { saga, done } = sortStories(player);
    if (!done.length) {
      await show(player, new ActionFormData().title("Finished").body("No story finished yet.").button("Back"));
      return;
    }
    const form = new ActionFormData().title("Finished").body("Stories you've finished, and how they ended.");
    for (const s of done) form.button(`${s.title}\n§8${choicesMade(s, saga.s[s.id]).length} choices made`);
    form.button("Back");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || res.selection >= done.length) return;
    const s = done[res.selection];
    const st = saga.s[s.id];
    const made = choicesMade(s, st);
    const chapters = s.chapters.filter((c) => st.dn.includes(c.id)).map((c) => `§a- ${c.title}§r`);
    const body = [toneTags(s), "", "§lChapters§r", ...(chapters.length ? chapters : ["§7(all of them)"]), "", "§lYour choices§r", ...(made.length ? made.map((m) => `§7${m}`) : ["§7No choices in this story."])];
    if (made.length) body.push("", `§fThe ending: §e${made[made.length - 1].split(": ").slice(1).join(": ")}`);
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
    const list = entries(target);
    if (!list.length) return player.sendMessage(`§7[Story] ${target.name} isn't working on any chapter.`);
    const form = new ActionFormData().title("Finish a step").body(`${target.name}'s chapters: pick one to finish its current step.`);
    for (const e of list) form.button(`${e.story.title}\n§8${plain(stepLine(target, e, sagaOf(target))).slice(0, 60)}`);
    form.button("Back");
    const r = await show(player, form);
    if (!r || r.canceled || r.selection === undefined || r.selection >= list.length) return;
    const ok = completeStep(target, list[r.selection]);
    player.sendMessage(ok ? `§a[Story] Finished ${target.name}'s current step in ${list[r.selection].story.title}.` : "§7[Story] Nothing left to finish there: they can report back.");
    return;
  }
  if (res.selection === 2) {
    const target = await pickPlayer(player, "Reset stories");
    if (!target) return;
    const sure = await show(player, new ActionFormData().title("Reset stories?").body(`Start all of ${target.name}'s stories over? Rewards already given are kept.`).button("Reset").button("Cancel"));
    if (sure && !sure.canceled && sure.selection === 0) resetPlayer(target, player);
  }
}

export { counting };
