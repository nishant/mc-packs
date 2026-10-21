// The story tracker's quest box (saga_bp ui.js): a fixed panel of about 32 characters by 10 rows and 502 bytes, so
// nothing may be cut with "...". Every line wraps over as many rows as it needs and, when the box is full, whole
// lines go (the least useful first) while a last row says how many. This runs the production source of the box
// (ui.js's box region and data.js's step logic) over every step of every shipped story, favor, stranger request and
// hostile fight, in every role a step can have and with every status shape the tracker can add. It is offline
// producer evidence for the text, not a picture of what a client draws (the 32-column estimate is the measured one).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { STORIES } from "../packs/saga_bp/scripts/stories.js";
import { FAVORS, HOSTILES, WANDER_TEMPLATES } from "../packs/saga_bp/scripts/stories/index.js";
import { clientRows } from "./lib/client-font.mjs";

const read = (/** @type {string} */ file) => fs.readFileSync(new URL(file, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const uiSource = read("../packs/saga_bp/scripts/ui.js");
const dataSource = read("../packs/saga_bp/scripts/data.js");
const utilSource = read("../packs/saga_bp/scripts/util.js");
const objectivesSource = read("../packs/saga_bp/scripts/objectives.js");

/** tools/side-shared.js run offline: the byte counting and the quest code the box is sent with. */
function loadSide() {
  const source = read("./side-shared.js").replace(/^import .*$/gm, "").replace(/^export /gm, "");
  const none = () => {};
  const signal = { subscribe: none };
  const context = {
    system: { currentTick: 0, afterEvents: { scriptEventReceive: signal }, runInterval: none, sendScriptEvent: none },
    world: { afterEvents: { playerLeave: signal }, getAllPlayers: () => [] },
    onScriptEvent: none,
  };
  return vm.runInNewContext(`${source}\n;({ byteLength, questCode, QUEST_TEXT_BYTES })`, context);
}
const side = loadSide();

/** The part of a source file from the doc comment of `from` up to (not including) `until`. */
function region(/** @type {string} */ source, /** @type {string} */ from, /** @type {string} */ until) {
  const at = source.indexOf(from);
  const end = source.indexOf(until, at);
  assert.ok(at >= 0 && end > at, `find ${from} .. ${until} in the production source`);
  return source.slice(source.lastIndexOf("/**", at), end);
}
const boxRegion = region(uiSource, "const BOX_COLS", "// ---------------------------------------------------------------------------\n// The story log (/realm:saga)");
const stepLogic = region(dataSource, "export function target(", "/** @type {Map<string, { v: number, list: Entry[] }>} */\nconst entryCache").replace(/^export /gm, "");
const take = (/** @type {string} */ source, /** @type {RegExp} */ re) => {
  const found = source.match(re)?.[0];
  assert.ok(found, `find ${re} in the production source`);
  return found.replace(/^export /, "");
};

/**
 * The production quest box, with the game's state stubbed out. `rows` and `bytes` override the box's limits (to see
 * what it would show with room for everything); the status of each open step comes from `state.statusOf`.
 * @param {{ rows?: number, bytes?: number }} [limits]
 */
function loadBox(limits = {}) {
  let source = boxRegion;
  if (limits.rows !== undefined) {
    assert.ok(source.includes("const BOX_ROWS = 10;"), "the box has its row limit as a literal");
    source = source.replace("const BOX_ROWS = 10;", `const BOX_ROWS = ${limits.rows};`);
  }
  if (limits.bytes !== undefined) {
    const before = source;
    source = source.replace(/const BOX_BYTES = [^\n]+;/, `const BOX_BYTES = ${limits.bytes};`);
    assert.notEqual(source, before, "the box has its byte limit on one line");
  }
  const state = {
    statusOf: /** @type {(i: number, e: any) => string} */ (() => ""),
    mates: /** @type {{ id: string, name: string }[]} */ ([]),
    view: /** @type {any} */ (undefined),
  };
  const context = /** @type {any} */ ({
    QUEST_TEXT_BYTES: side.QUEST_TEXT_BYTES,
    byteLength: side.byteLength,
    questCode: side.questCode,
    matches: () => true,
    packsPending: () => false,
    together: () => true,
    partyMates: () => state.mates,
    partyViews: { get: () => state.view },
    get: () => 64,
    console,
  });
  vm.runInNewContext(
    [
      take(utilSource, /^export const plain = .*$/m),
      take(uiSource, /^const listNames = .*$/m),
      stepLogic,
      source,
      ";globalThis.api = { questBox, partyLine, rowsOf, clipTo, labelOf, target, reached, objDone, BOX_COLS, BOX_ROWS, BOX_BYTES };",
    ].join("\n"),
    context,
  );
  // The place and wait of an open step come from the world; the tests say what they are.
  context.whereOf = (/** @type {any} */ _player, /** @type {any} */ e, /** @type {number} */ i) => state.statusOf(i, e);
  return { ...context.api, state, player: { id: "p1", name: "Ann", dimension: { id: "minecraft:overworld" } } };
}

const box = loadBox();
const wide = loadBox({ rows: 1000, bytes: 1000000 });
const { BOX_COLS, BOX_ROWS, BOX_BYTES } = box;

test("a party helper is not told they finished a chapter they never accepted", () => {
  const fresh = loadBox();
  fresh.state.mates = [{ id: "p2", name: "Bob" }];
  assert.equal(fresh.partyLine(fresh.player, { pq: true, story: { kind: "main" } }), "§3Party quest: helping your party");
});

/** Rows of a line, counted a second way from the box's own: words at spaces, color codes take no room. */
function rowsIn(/** @type {string} */ line) {
  let rows = 1;
  let used = 0;
  for (const word of line.replace(/§./g, "").split(" ")) {
    if (used > 0 && used + 1 + word.length <= BOX_COLS) {
      used += 1 + word.length;
      continue;
    }
    if (used > 0) rows++;
    let rest = word.length;
    while (rest > BOX_COLS) {
      rows++;
      rest -= BOX_COLS;
    }
    used = rest;
  }
  return rows;
}
const rowsOfBox = (/** @type {string} */ text) => text.split("\n").reduce((n, line) => n + rowsIn(line), 0);
const plainOf = (/** @type {string} */ text) => text.replace(/§./g, "");
const SUMMARY = /^§7\+(\d+) more( quests?| steps?)? in \/realm:saga$/;

// ---------------------------------------------------------------------------------------------------------------
// What the stories and the tracker can put in the box
// ---------------------------------------------------------------------------------------------------------------

/** Story text names far distances with {far:x,z}; the game fills the number in (scale.js, unscaled: the widest). */
const say = (/** @type {number} */ d) => String(d < 600 ? Math.round(d / 10) * 10 : Math.round(d / 50) * 50).replace(/\B(?=(\d{3})+$)/g, ",");
const fillFar = (/** @type {string} */ s) => s.replace(/\{far:(-?\d+),(-?\d+)\}/g, (_, x, z) => say(Math.hypot(Number(x), Number(z))));
const itemWords = (/** @type {string} */ id) => id.replace(/^minecraft:/, "").split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/** @type {{ source: string, story: any, chapter: any }[]} */
const content = [];
for (const story of STORIES) for (const chapter of story.chapters) content.push({ source: `${story.id}/${chapter.id}`, story, chapter: structuredClone(chapter) });
for (const f of FAVORS) {
  const chapter = { id: f.id, title: f.label, objectives: [structuredClone(f.objective)] };
  content.push({ source: `favor ${f.id}`, story: { id: `fv:${f.npc}`, short: "Favor", kind: "side" }, chapter });
}
/** A stranger's name as long as the wanderer pack gives (the pack's longest is 27 characters). */
const STRANGER = "Anwen, the Surveyor's Ghost";
for (const t of WANDER_TEMPLATES) {
  // Every item a template can ask for, at the biggest count.
  for (const item of t.params?.item?.length ? t.params.item : [undefined]) {
    const count = t.params?.count ? Math.max(...t.params.count) : 1;
    const fill = (/** @type {string} */ s) => s.split("{name}").join(STRANGER).split("{item}").join(item ? itemWords(item) : "").split("{count}").join(String(count));
    const chapter = { id: t.id, title: fill(t.label), objectives: t.objectives.map((/** @type {any} */ o) => ({ ...o, label: fill(o.label) })) };
    content.push({ source: `stranger ${t.id}${item ? ` ${item}` : ""}`, story: { id: `wv:${t.id}`, short: "Stranger", kind: "wander" }, chapter });
  }
}
for (const h of HOSTILES) {
  const chapter = { id: `h_${h.id}`, title: h.title, objectives: [{ type: "defeat", label: `Defeat ${h.champion.name}` }] };
  content.push({ source: `hostile ${h.id}`, story: { id: `wv:h:${h.id}`, short: "Ambush", kind: "wander" }, chapter });
}
for (const c of content) for (const o of c.chapter.objectives) o.label = fillFar(o.label);
const labels = content.flatMap((c) => c.chapter.objectives.map((/** @type {any} */ o) => ({ ...c, obj: o })));

/**
 * Every shape the tracker adds after a step (whereOf in ui.js), as it writes them, at their longest. `anchor` is a
 * piece of the production source that makes the shape, so this list can't drift from it unnoticed.
 * @type {{ name: string, text: string, anchor: ["ui" | "objectives", string] }[]}
 */
const STATUSES = [
  { name: "no place", text: "", anchor: ["ui", 'let out = "";'] },
  { name: "direction", text: " §eSSW 12,345m", anchor: ["ui", "` §e${b}`"] },
  { name: "here", text: " §a(you're here)", anchor: ["ui", " §a(you're here)"] },
  { name: "another dimension", text: " §ein the Nether", anchor: ["ui", "`in the ${dimName(loc.dim)}`"] },
  { name: "hint", text: " §7(hint available)", anchor: ["ui", " §7(hint available)"] },
  { name: "place not set", text: " §7(Ruined Watchtower isn't set yet)", anchor: ["ui", " isn't set yet)"] },
  { name: "camp gone", text: " §7(Pell the Pilgrim's Camp is gone: find them on the road)", anchor: ["ui", " is gone: find them on the road)"] },
  { name: "townsfolk camp", text: " §eat Pell the Pilgrim's Camp SW 1,234m", anchor: ["ui", " at ${placeLabel(campName("] },
  { name: "townsfolk not loaded", text: " §e(Mara: /realm:npc)", anchor: ["ui", "(${npcName(obj.npc)}: /realm:npc)"] },
  { name: "clock", text: " §c3:20 left §eNE 240m", anchor: ["ui", "out += ` §c${t}`;"] },
  { name: "days", text: " §c12 days left §ein the Nether", anchor: ["objectives", 'day${Math.ceil(days) === 1 ? "" : "s"} left'] },
  { name: "sky event", text: " §eBlood Moon: within 200 blocks NE 1,200m §c12 min left", anchor: ["ui", "within ${sky.near} blocks"] },
  { name: "seconds under way", text: " §eNE 240m §e90 s left", anchor: ["ui", "§e${left} s left"] },
  { name: "open sky", text: " §eNE 240m §e90 s left §7- step out under the open sky", anchor: ["ui", "step out under the open sky"] },
  { name: "storm due", text: " §eNE 240m §e90 s left §7- wait for a thunderstorm (due in about 120 min)", anchor: ["objectives", "(due in about ${Math.max(1, Math.ceil((due.at - now) / 60000))} min)"] },
  { name: "night due", text: " §eNE 240m §e90 s left §7- wait for nightfall (in about 5 min)", anchor: ["objectives", "(in about ${Math.max(1, Math.ceil((((a - t + 24000) % 24000) / 1200)))} min)"] },
  { name: "weather wait", text: " §7- wait for a thunderstorm (due in about 120 min)", anchor: ["ui", "out += ` §7- ${wait}`;"] },
];
const sources = { ui: uiSource, objectives: objectivesSource };
const SOME = [STATUSES[0], STATUSES[1], STATUSES[11], STATUSES[15]];

// ---------------------------------------------------------------------------------------------------------------
// One box, checked against everything that must hold of it
// ---------------------------------------------------------------------------------------------------------------

/**
 * @typedef {{ pq?: boolean, mates?: number, kind?: string, others?: number, progress?: number[], at?: number, sequential?: boolean, status?: (i: number) => string }} Setup
 */
const MATES = ["Bob", "Alexandria", "Christopher_99", "Ann", "Zed", "Mirabel_Wren", "Quentin", "Ottoline"];

/** Builds the quest box of a chapter, as the tracker would: with the real limits, and with room for everything. */
function boxes(/** @type {any} */ story, /** @type {any} */ chapter, /** @type {Setup} */ setup = {}) {
  const ch = setup.sequential === undefined ? chapter : { ...chapter, sequential: setup.sequential };
  const entry = { story: setup.kind ? { ...story, kind: setup.kind } : story, chapter: ch, index: 0, st: { o: setup.progress ?? [] }, pq: setup.pq };
  const mates = Array.from({ length: setup.mates ?? (setup.pq ? 1 : 0) }, (_, k) => ({ id: `m${k}`, name: MATES[k % MATES.length] }));
  const others = Array.from({ length: setup.others ?? 0 }, (_, k) => {
    const o = content[(k * 37 + 5) % content.length];
    return { e: { story: o.story, chapter: o.chapter }, text: `§f${o.chapter.objectives[0].label}${STATUSES[(k + 3) % STATUSES.length].text}` };
  });
  const first = entry.pq ? "§6party reports to Old Tobin NE 40m" : "§6report to Old Tobin NE 40m";
  /** @type {string[]} */
  const made = [];
  for (const b of [box, wide]) {
    b.state.mates = mates;
    b.state.view = { chapter: { id: ch.id } };
    b.state.statusOf = (i) => (setup.status ? setup.status(i) : STATUSES[(i + 1) % STATUSES.length].text);
    made.push(b.questBox(b.player, entry, {}, first, setup.at ?? -1, others));
  }
  return { out: made[0], all: made[1], entry };
}

/**
 * Everything the box promises, for one chapter in one situation.
 * @param {string} what @param {ReturnType<typeof boxes>} built @param {string[]} mustShow text that must be whole when there is room for it
 */
function assertBox(what, { out, all }, mustShow) {
  const bytes = side.byteLength(out);
  assert.ok(bytes <= BOX_BYTES, `${what}: ${bytes} bytes is over the box's ${BOX_BYTES}\n${out}`);
  const rows = rowsOfBox(out);
  assert.ok(rows <= BOX_ROWS, `${what}: ${rows} rows is over the box's ${BOX_ROWS}\n${out}`);
  // And as a client draws it: the default font's real glyph widths in the label's 200 pixels (tools/lib/client-font.mjs).
  const drawn = clientRows(out, 200);
  assert.ok(drawn <= BOX_ROWS, `${what}: a client wraps it to ${drawn} rows, over the box's ${BOX_ROWS}\n${out}`);
  // With room for everything, every step label is there whole (the client wraps it), never cut with "...".
  const allPlain = plainOf(all);
  for (const text of mustShow) assert.ok(allPlain.includes(text), `${what}: "${text}" is cut when the box has room for everything\n${all}`);
  // With the real limits, whole lines are left out and counted, never cut.
  const wanted = all.split("\n");
  const shownLines = out.split("\n");
  const summary = SUMMARY.exec(shownLines.at(-1) ?? "");
  const kept = summary ? shownLines.slice(0, -1) : shownLines;
  let at = 0;
  for (const line of kept) {
    const found = wanted.indexOf(line, at);
    assert.ok(found >= 0, `${what}: "${line}" is neither a whole line of the full box nor its summary row\n${out}`);
    at = found + 1;
  }
  assert.equal(summary ? Number(summary[1]) : 0, wanted.length - kept.length, `${what}: the summary row counts the lines left out\n${out}`);
  // What matters most never goes: the quest and chapter, and the step the tracker points at (or the report line).
  assert.equal(shownLines[0], wanted[0], `${what}: the quest and chapter line stays`);
  for (const line of wanted) if (/^§(e\[>\] |6> |f> )/.test(line)) assert.ok(kept.includes(line), `${what}: "${line}" stays\n${out}`);
  return { rows, bytes, left: summary ? Number(summary[1]) : 0 };
}

/** A sweep over many boxes: every one is checked and the test fails once, counting how many break a promise. */
function sweep() {
  /** @type {string[]} */
  const bad = [];
  let total = 0;
  return {
    /** @param {string} what @param {ReturnType<typeof boxes>} built @param {string[]} mustShow */
    check(what, built, mustShow) {
      total++;
      try {
        return assertBox(what, built, mustShow);
      } catch (e) {
        bad.push(String(/** @type {Error} */ (e).message).split("\n")[0]);
        return { rows: 0, bytes: 0, left: 0 };
      }
    },
    /** @param {string} kind */
    finish(kind) {
      assert.equal(bad.length, 0, `${bad.length} of ${total} ${kind} break the box's promises. First: ${bad.slice(0, 3).join(" | ")}`);
      return total;
    },
  };
}

/** The labels of the steps a chapter's box lists in this state, by the game's own step logic. */
function listed(/** @type {any} */ entry) {
  /** @type {string[]} */
  const out = [];
  entry.chapter.objectives.forEach((/** @type {any} */ o, /** @type {number} */ i) => {
    if (o.optional) return;
    if (box.reached(entry, i)) out.push(o.label);
    else if (!box.objDone(entry, i, {})) out.push(box.labelOf(entry, i, {}));
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------------------------------------------

test("the box's measured limits are unchanged: 32 columns, 10 rows, 502 bytes after its code", () => {
  assert.equal(BOX_COLS, 32);
  assert.equal(BOX_ROWS, 10);
  assert.equal(BOX_BYTES, 511 - side.byteLength(side.questCode("right1")));
  assert.equal(BOX_BYTES, 502);
});

test("an unchanged box is still sent once and renewed before its 300 ticks run out; no quest takes it down", () => {
  assert.match(uiSource, /const BOX_TICKS = 300;/);
  assert.match(uiSource, /const BOX_RENEW = 60;/);
  assert.match(uiSource, /if \(sent && sent\.text === key && sent\.until - now > BOX_RENEW\) return;/);
  assert.match(uiSource, /if \(!shown \|\| !line \|\| !shownE \|\| !isSlot\(where\)\) clearBox\(player\);/);
  assert.match(uiSource, /showLine\(player, box, BOX_TICKS, TRACKER_STEADY\);/);
});

test("the status shapes this test uses are the ones the tracker's source makes", () => {
  for (const s of STATUSES) assert.ok(sources[s.anchor[0]].includes(s.anchor[1]), `${s.name}: the source still has ${JSON.stringify(s.anchor[1])}`);
});

test("the content under test is all of it: every story, favor, stranger request and hostile fight", () => {
  assert.equal(STORIES.length, 59);
  assert.equal(FAVORS.length, 48);
  assert.equal(HOSTILES.length, 4);
  assert.equal(labels.filter((l) => l.source.includes("/")).length, 604, "every objective of every story");
  assert.ok(labels.length >= 604 + 48 + 4, `${labels.length} step labels`);
  for (const { obj } of labels) {
    assert.ok(/^[\x20-\x7e]+$/.test(obj.label), `"${obj.label}" is plain ASCII (the existing rule for game text)`);
    assert.ok(!/[{}~§]/.test(obj.label), `"${obj.label}" has no leftover token, filler or color code`);
  }
});

test("a line takes as many rows as its words need, and color codes take no room", () => {
  const { rowsOf } = box;
  for (const [line, rows] of /** @type {[string, number][]} */ ([
    ["", 1],
    ["a", 1],
    ["x".repeat(32), 1],
    ["x".repeat(33), 2],
    ["x".repeat(64), 2],
    ["x".repeat(65), 3],
    [`${"x".repeat(31)} y`, 2],
    [`${"x".repeat(30)} y`, 1],
    [`${"x".repeat(15)} ${"y".repeat(16)}`, 1],
    [`${"x".repeat(15)} ${"y".repeat(17)}`, 2],
    [`§a§l§o${"x".repeat(32)}`, 1],
  ]))
    assert.equal(rowsOf(line), rows, `${JSON.stringify(line)} takes ${rows}`);
  for (const l of labels) for (const prefix of ["§f[ ] ", "§e[>] §f", "§8[ ] Then: ", "§a[x] §7"]) assert.equal(rowsOf(`${prefix}${l.obj.label}`), rowsIn(`${prefix}${l.obj.label}`), l.obj.label);
});

test("the reported box: the party-help line is said in full, nothing is cut with ...", () => {
  const found = labels.find((l) => l.obj.label === "Bring Mara a filled map of a place you love");
  assert.ok(found, "the Last Map step of the report");
  const r = boxes(found.story, found.chapter, { pq: true, at: 0, status: () => " §eE 322m" });
  assert.equal(r.out, "§bLast Map§7: The Last Map\n§e[>] §fBring Mara a filled map of a place you love §eE 322m\n§3Party quest: helping your party");
  assert.ok(!r.out.includes("..."));
  assert.equal(box.partyLine(box.player, { pq: true, story: { kind: "main" } }), "§3Party quest: helping your party");
  assert.ok(!uiSource.includes("you finished it, so you're helping"), "the long wording is gone from the source");
  assert.ok(rowsIn("Party quest: helping your party") <= 2);
});

test("every party line, for one mate and for a full party, is said whole", () => {
  const main = { story: { kind: "main" }, chapter: { id: "c1" } };
  for (const n of [1, 2, 3, 8]) {
    box.state.mates = Array.from({ length: n }, (_, k) => ({ id: `m${k}`, name: MATES[k] }));
    box.state.view = { chapter: { id: "c1" } };
    for (const [name, e] of /** @type {[string, any][]} */ ([["main story", main], ["side story", { story: { kind: "side" } }], ["party quest", { ...main, pq: true }]])) {
      const line = box.partyLine(box.player, e);
      assert.ok(line.length > 0 && !line.includes("..."), `${name} with ${n} mates: ${line}`);
    }
  }
});

test("every step label of every story, with every status shape, in every role it can have, is whole or counted as left out", () => {
  const all = sweep();
  const decoy = { type: "talk", label: "Talk to Mara", npc: "mara" };
  for (const l of labels) {
    const label = l.obj.label;
    const own = { ...l.obj, optional: false, or: undefined };
    // The step the tracker points at: the line that matters most, with every status.
    for (const s of STATUSES) {
      const r = boxes(l.story, { ...l.chapter, objectives: [own] }, { at: 0, sequential: false, status: () => s.text });
      all.check(`${l.source} [>] ${s.name}`, r, [label, plainOf(s.text).trim()].filter(Boolean));
    }
    // Beside another open step, as a later step, as an optional step, as one done, in an either/or pair.
    for (const [role, objectives, setup] of /** @type {[string, any[], Setup][]} */ ([
      ["[ ] open", [decoy, own], { sequential: false }],
      ["[ ] Then:", [decoy, own], { sequential: true }],
      ["[ ] Optional:", [decoy, { ...own, optional: true }], { sequential: false }],
      ["[x] done", [decoy, own], { sequential: false, progress: [0, 99999] }],
      ["Either:", [decoy, { ...own, or: "x" }, { type: "talk", label: "Or ask Mara", npc: "mara", or: "x" }], { sequential: false }],
    ])) {
      for (const s of role === "[ ] Then:" || role === "[x] done" ? [STATUSES[0]] : SOME) {
        const r = boxes(l.story, { ...l.chapter, objectives }, { ...setup, at: 0, status: (i) => (i === 1 ? s.text : " §eNE 40m") });
        all.check(`${l.source} ${role} ${s.name}`, r, [label]);
      }
    }
  }
  assert.ok(all.finish("step boxes") > 10000);
});

test("a step counting down (6 more, 6 left) is whole too", () => {
  const all = sweep();
  for (const l of labels) {
    const own = { ...l.obj, optional: false, or: undefined };
    const need = box.target(own);
    for (const n of new Set([1, need - 1])) {
      if (n < 1 || n >= need) continue;
      const r = boxes(l.story, { ...l.chapter, objectives: [own] }, { at: 0, sequential: false, progress: [n], status: () => "" });
      all.check(`${l.source} at ${n} of ${need}`, r, [box.labelOf(r.entry, 0, {})]);
    }
  }
  assert.ok(all.finish("counting steps") > 400);
});

test("every chapter, in every stage, with every kind of party and other quests going, fits its box", () => {
  const all = sweep();
  let leftOut = 0;
  for (const c of content) {
    const objectives = c.chapter.objectives;
    const required = objectives.map((/** @type {any} */ _o, /** @type {number} */ i) => i).filter((/** @type {number} */ i) => !objectives[i].optional);
    const progressTo = (/** @type {number} */ steps) => objectives.map((/** @type {any} */ o, /** @type {number} */ i) => (required.indexOf(i) >= 0 && required.indexOf(i) < steps ? box.target(o) : 0));
    for (const [stage, steps] of /** @type {[string, number][]} */ ([
      ["fresh", 0],
      ["half done", Math.floor(required.length / 2)],
      ["one step left", Math.max(0, required.length - 1)],
      ["all done", required.length],
    ])) {
      const progress = progressTo(steps);
      const at = required.find((/** @type {number} */ i) => !(progress[i] >= box.target(objectives[i]))) ?? -1;
      for (const [party, setup] of /** @type {[string, Setup][]} */ ([
        ["alone", {}],
        ["party quest", { pq: true }],
        ["main story with 1 mate", { mates: 1, kind: "main" }],
        ["main story with 5 mates", { mates: 5, kind: "main" }],
        ["side story with mates", { mates: 2, kind: "side" }],
      ]))
        for (const others of [0, 1, 3]) {
          const r = boxes(c.story, c.chapter, { ...setup, others, progress, at });
          if (all.check(`${c.source} ${stage}, ${party}, ${others} other quests`, r, listed(r.entry)).left) leftOut++;
        }
    }
  }
  assert.ok(all.finish("chapter boxes") > 4000);
  assert.ok(leftOut > 0, "some boxes are too full for everything, and they say so");
});

test("exact boundaries: a box of exactly 10 rows or 502 bytes shows everything, one more leaves a counted line out", () => {
  const story = { id: "t", short: "Test", kind: "side" };
  const words = "abcdef ".repeat(30);
  const all = sweep();
  let exactRows = 0;
  let overRows = 0;
  for (let n = 1; n <= 8; n++)
    for (let len = 1; len <= 130; len++) {
      const label = words.slice(0, len).trim() || "a";
      const chapter = { id: "c", title: "T", objectives: Array.from({ length: n }, () => ({ type: "talk", label, npc: "mara" })) };
      const r = boxes(story, chapter, { at: 0, sequential: false, status: () => "" });
      const got = all.check(`${n} steps of ${len}`, r, [label]);
      const fullRows = rowsOfBox(r.all);
      const fullBytes = side.byteLength(r.all);
      if (fullRows <= BOX_ROWS && fullBytes <= BOX_BYTES) assert.equal(r.out, r.all, `${n} steps of ${len}: it all fits, so it all shows`);
      else if (got.bytes) assert.ok(got.left > 0, `${n} steps of ${len}: ${fullRows} rows, ${fullBytes} bytes cannot fit, so lines are counted as left out`);
      if (fullRows === BOX_ROWS && fullBytes <= BOX_BYTES) exactRows++;
      if (fullRows === BOX_ROWS + 1) overRows++;
    }
  all.finish("sweep boxes");
  assert.ok(exactRows > 0 && overRows > 0, `the sweep reached the row boundary (${exactRows} boxes at 10 rows, ${overRows} at 11)`);

  // The byte boundary: steps of color codes (3 bytes each, no room on a row) up to exactly 502 bytes, then one more.
  const heavy = (/** @type {number} */ extra) => ({
    id: "c",
    title: "T",
    objectives: [
      ...Array.from({ length: 3 }, (_, k) => ({ type: "talk", label: `${"§a§b§c".repeat(12)}step ${k} here`, npc: "mara" })),
      { type: "talk", label: `last${"x".repeat(extra)}`, npc: "mara" },
    ],
  });
  const build = (/** @type {number} */ extra) => boxes(story, heavy(extra), { at: 0, sequential: false, status: () => "" });
  let exact = -1;
  for (let extra = 0; extra < 300 && exact < 0; extra++) if (side.byteLength(build(extra).all) === BOX_BYTES) exact = extra;
  assert.ok(exact >= 0, "a chapter whose full box is exactly 502 bytes");
  const at502 = build(exact);
  assert.equal(at502.out, at502.all, "502 bytes shows everything");
  const at503 = build(exact + 1);
  assert.equal(side.byteLength(at503.all), BOX_BYTES + 1);
  assert.notEqual(at503.out, at503.all, "503 bytes leaves a line out");
  assert.match(at503.out.split("\n").at(-1) ?? "", SUMMARY, "and says how many");
  assertBox("503 bytes", at503, []);
});

test("clipTo keeps whole characters, no dangling section sign, never over the limit", () => {
  const { clipTo } = box;
  const samples = ["x".repeat(600), "§a§bword ".repeat(80), `caf\u00e9 \u20ac \u{1F600} ${"y".repeat(40)}§`, "§", "ab§", "a\u0080b".repeat(30)];
  for (const text of samples)
    for (const max of [1, 2, 3, 4, 5, 9, 10, 31, 32, 33, 100, 501, 502, 503]) {
      const out = clipTo(text, max);
      assert.ok(side.byteLength(out) <= max, `${JSON.stringify(text.slice(0, 12))} in ${max} bytes: ${side.byteLength(out)}`);
      assert.ok(text.replace(/§$/, "").startsWith(out), "a prefix, nothing rewritten");
      assert.ok(!out.endsWith("§"), "no dangling section sign");
      if (side.byteLength(text) <= max) assert.equal(out, text.replace(/§$/, ""), "what fits is left alone");
    }
  const ascii = "x".repeat(502);
  assert.equal(clipTo(ascii, 502), ascii, "exactly 502 bytes stays");
  assert.equal(clipTo(`${ascii}x`, 502), ascii, "503 bytes is cut to 502");
  assert.equal(clipTo(`${"x".repeat(501)}\u20ac`, 502), "x".repeat(501), "a 3-byte character is never split");
});

test("non-ASCII text, were a story to carry some, is counted in bytes and never overflows the box", () => {
  const story = { id: "t", short: "Caf\u00e9", kind: "side" };
  const chapter = {
    id: "c",
    title: "T\u00edtulo \u20ac",
    objectives: Array.from({ length: 6 }, (_, k) => ({ type: "talk", label: `Visit \u00c9mile at the caf\u00e9 \u20ac${k} \u{1F600} ${"w".repeat(20 * k)}`, npc: "mara" })),
  };
  const r = boxes(story, chapter, { at: 0, sequential: false, status: () => " §eNE 40m" });
  assert.ok(side.byteLength(r.out) <= BOX_BYTES, `${side.byteLength(r.out)} bytes`);
  assert.ok(rowsOfBox(r.out) <= BOX_ROWS);
  assert.ok(!r.out.endsWith("§"));
});
