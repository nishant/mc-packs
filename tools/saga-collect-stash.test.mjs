// A collect step must count what Expansive Inventory routed to a saved page (stash_bp, realm:stash_count), while
// countItem, which deliveries use, keeps reading only the live inventory. Saga's production functions run in a vm.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const objectivesSource = readFileSync(new URL("../packs/saga_bp/scripts/objectives.js", import.meta.url), "utf8");
const dataSource = readFileSync(new URL("../packs/saga_bp/scripts/data.js", import.meta.url), "utf8");

function productionFunction(source, name, optional = false) {
  const match = source.match(new RegExp(`^(?:export )?function ${name}\\([\\s\\S]*?^\\}`, "m"));
  if (!match && optional) return "";
  assert.ok(match, `load the production ${name} implementation`);
  return match[0].replace(/^export /, "");
}

const SHARDS = { type: "collect", item: "minecraft:amethyst_shard", count: 8, label: "Gather shards" };
const NAMED = { type: "collect", item: "minecraft:emerald", name: "Lily's Marble", count: 4, label: "Marbles" };

function fixture(obj) {
  const chapter = { id: "c", objectives: [obj] };
  const st = { dn: [], a: 1, cur: "c", o: [], f: {}, ch: {} };
  const entry = { story: { id: "s" }, chapter, st };
  const inventory = [];
  const player = {
    id: "solo",
    dimension: { id: "minecraft:overworld" },
    location: { x: 0, y: 64, z: 0 },
    isSleeping: false,
    getComponent: () => ({ container: { size: 36, getItem: (slot) => inventory[slot] } }),
    sendMessage() {},
    playSound() {},
  };
  const sent = [];
  let finishes = 0;
  const context = {
    console,
    system: { currentTick: 0 },
    invChanged: new Set([player.id]),
    collectedAt: new Map(),
    collectSeen: new Map(),
    COLLECT_RECOUNT: 200,
    dreams: new Map(),
    busy: new Set(),
    progressed: new Set(),
    sagaOf: () => ({ s: { s: st } }),
    counting: () => true,
    helps: () => true,
    active: (e, i) => (e.st.o[i] ?? 0) < obj.count,
    questGuides() {},
    markDirty() {},
    finishObj() { finishes++; },
    chapterDone: () => false,
    currentStep: () => 0,
    objKey: (e, i) => `s:c:${i}`,
    share() {},
    plain: (s) => s.replace(/§./g, ""),
    KITCHEN: {},
    send: (id, msg) => sent.push({ id, msg }),
    world: { getAllPlayers: () => [player] },
  };
  const functions = [
    productionFunction(dataSource, "target"),
    "const reached = (e, i) => (e.st.o[i] ?? 0) >= target(e.chapter.objectives[i]);",
    "const nameKey = (s) => plain(s).replace(/\\s+/g, ' ').trim().toLowerCase();",
    productionFunction(objectivesSource, "kitchenOk"),
    productionFunction(objectivesSource, "same"),
    productionFunction(objectivesSource, "countItem"),
    productionFunction(objectivesSource, "bump"),
    productionFunction(objectivesSource, "tickPlayer"),
  ].join("\n");
  // The bridge (when it exists) lives next to countItem: its state and functions are loaded from the real file.
  const bridge = [...objectivesSource.matchAll(/^\/\/ stash-bridge:begin\r?\n([\s\S]*?)^\/\/ stash-bridge:end/gm)].map((m) => m[1].replace(/^export /gm, "")).join("\n");
  const engine = vm.runInNewContext(`${functions}\n${bridge}\n;({ tickPlayer, countItem, reply: typeof stashCountReply === "function" ? stashCountReply : undefined, changed: typeof stashChanged === "function" ? stashChanged : undefined, forget: typeof stashForget === "function" ? stashForget : undefined });`, context);
  const stack = (typeId, amount, nameTag, lore = []) => ({ typeId, amount, nameTag, getLore: () => lore });
  return {
    st,
    sent,
    inventory,
    stack,
    finishes: () => finishes,
    hold: (...stacks) => {
      inventory.length = 0;
      inventory.push(...stacks);
      context.invChanged.add(player.id);
    },
    tick: (ticks = 20) => {
      context.system.currentTick += ticks;
      engine.tickPlayer(player, [entry]);
    },
    /** Stash answers every outstanding ask with these rows, as the real pack does on the next tick. */
    answer: (rows) => {
      for (const s of sent.splice(0)) {
        if (s.id !== "realm:stash_count_ask") continue;
        engine.reply?.(JSON.stringify({ player: player.id, item: s.msg.item, name: s.msg.name, rows }));
      }
    },
    changed: (rev) => engine.changed?.(JSON.stringify({ player: player.id, rev })),
    reply: (body) => engine.reply?.(JSON.stringify({ player: player.id, ...body })),
    count: () => engine.countItem(player, obj.item, obj.name),
    forget: () => (engine.forget ? (engine.forget(player.id), true) : false),
    asks: () => sent.filter((s) => s.id === "realm:stash_count_ask").length,
    progress: () => st.o[0],
  };
}

test("shards the stash routed to page 1 count toward the collect step (routed pickups were invisible to the live scan)", () => {
  const f = fixture(SHARDS);
  f.hold(f.stack("minecraft:amethyst_shard", 3));
  f.tick();
  f.answer([{ id: "minecraft:amethyst_shard", n: 5 }]);
  f.tick();
  assert.equal(f.progress(), 8, "3 on the page plus 5 on a saved page");
  assert.equal(f.finishes(), 1);
});

test("countItem, which deliveries use, still counts only the live inventory", () => {
  const f = fixture(SHARDS);
  f.hold(f.stack("minecraft:amethyst_shard", 3));
  f.tick();
  f.answer([{ id: "minecraft:amethyst_shard", n: 5 }]);
  f.tick();
  assert.equal(f.count(), 3);
});

test("progress never dips while the stash is answering after it moved items", () => {
  const f = fixture(SHARDS);
  f.hold(f.stack("minecraft:amethyst_shard", 6));
  f.tick();
  f.answer([]);
  f.tick();
  assert.equal(f.progress(), 6);
  // the stash routes 4 to page 1: the live count falls first, the stash says so, then answers
  f.hold(f.stack("minecraft:amethyst_shard", 2));
  f.changed();
  f.tick();
  assert.equal(f.progress(), 6, "no count while the answer is pending");
  f.answer([{ id: "minecraft:amethyst_shard", n: 4 }]);
  f.tick();
  assert.equal(f.progress(), 6);
});

test("without Expansive Inventory the step counts the live inventory after one bounded wait", () => {
  const f = fixture(SHARDS);
  f.hold(f.stack("minecraft:amethyst_shard", 3));
  for (let i = 0; i < 5; i++) f.tick();
  assert.equal(f.progress(), 3);
  assert.equal(f.finishes(), 0);
});

test("named steps count only saved stacks with that name (and the Kitchen's lore rules)", () => {
  const f = fixture(NAMED);
  f.hold(f.stack("minecraft:emerald", 1, "Lily's Marble"));
  f.tick();
  f.answer([
    { id: "minecraft:emerald", name: "Lily's Marble", n: 2 },
    { id: "minecraft:emerald", name: "Other", n: 9 },
    { id: "minecraft:emerald", n: 7 },
  ]);
  f.tick();
  assert.equal(f.progress(), 3);
});

test("a reply for another player or without rows changes nothing and never throws", () => {
  const f = fixture(SHARDS);
  f.hold(f.stack("minecraft:amethyst_shard", 3));
  f.tick();
  assert.doesNotThrow(() => {
    f.answer(undefined);
    f.answer("junk");
  });
});

const HEART = { type: "collect", name: "Champion's Heart", count: 2, label: "Hearts" };

test("a name-only step (no item) asks the stash and counts matching saved stacks", () => {
  const f = fixture(HEART);
  f.hold(f.stack("minecraft:emerald", 1, "Champion's Heart"));
  f.tick();
  assert.equal(f.sent[0]?.id, "realm:stash_count_ask");
  assert.equal(f.sent[0].msg.item, undefined);
  assert.equal(f.sent[0].msg.name, "Champion's Heart");
  f.reply({ name: "Champion's Heart", rev: "a", part: 1, parts: 1, rows: [{ id: "minecraft:emerald", name: "Champion's Heart", n: 1 }, { id: "minecraft:emerald", name: "Other", n: 5 }] });
  f.tick();
  assert.equal(f.progress(), 2);
  assert.equal(f.finishes(), 1);
});

test("a multipart answer is used only when every part of one revision arrived", () => {
  const f = fixture(SHARDS);
  f.hold(f.stack("minecraft:amethyst_shard", 1));
  f.tick();
  f.reply({ item: SHARDS.item, rev: "a", part: 1, parts: 3, rows: [{ id: SHARDS.item, n: 2 }] });
  f.tick();
  assert.equal(f.progress(), undefined, "still waiting for parts 2 and 3");
  f.reply({ item: SHARDS.item, rev: "a", part: 3, parts: 3, rows: [{ id: SHARDS.item, name: "x", n: 1 }, { id: SHARDS.item, n: 2 }] });
  f.reply({ item: SHARDS.item, rev: "a", part: 2, parts: 3, rows: [{ id: SHARDS.item, n: 2 }] });
  f.tick();
  assert.equal(f.progress(), 8, "1 live + 2 + 2 + 1 + 2: every row of every part counts");
});

test("a reply computed before a change is stale once the notice names a newer revision", () => {
  const f = fixture(SHARDS);
  f.hold(f.stack("minecraft:amethyst_shard", 1));
  f.tick();
  f.changed("b");
  f.reply({ item: SHARDS.item, rev: "a", part: 1, parts: 1, rows: [{ id: SHARDS.item, n: 6 }] });
  f.tick();
  assert.equal(f.progress(), undefined, "the stale reply is dropped, nothing counted yet");
  f.tick(20);
  f.reply({ item: SHARDS.item, rev: "b", part: 1, parts: 1, rows: [{ id: SHARDS.item, n: 3 }] });
  f.tick();
  assert.equal(f.progress(), 4);
});

const MANY = { type: "collect", item: "minecraft:amethyst_shard", count: 20, label: "Gather shards" };

test("F6: an installed stash that stops answering never lowers progress, and is asked again", () => {
  const f = fixture(MANY);
  f.hold(f.stack("minecraft:amethyst_shard", 3));
  f.tick();
  f.answer([{ id: MANY.item, n: 4 }]);
  f.tick();
  assert.equal(f.progress(), 7, "3 live + 4 saved");
  // The pages change, and the stash can't answer (an unreadable page, a lost message).
  f.changed("b");
  f.sent.length = 0;
  for (let i = 0; i < 4; i++) f.tick();
  assert.equal(f.progress(), 7, "the missing answer is not counted as zero");
  f.hold(f.stack("minecraft:amethyst_shard", 9));
  f.tick();
  assert.equal(f.progress(), 9, "live items still raise progress");
  for (let i = 0; i < 10; i++) f.tick();
  assert.ok(f.asks() >= 2, `asked again after the retry interval (${f.asks()})`);
});

test("F6: a stash answer of unknown keeps the progress, and a later real answer counts", () => {
  const f = fixture(MANY);
  f.hold(f.stack("minecraft:amethyst_shard", 2));
  f.tick();
  f.answer([{ id: MANY.item, n: 6 }]);
  f.tick();
  assert.equal(f.progress(), 8);
  f.changed("c");
  f.sent.length = 0;
  f.tick();
  f.reply({ item: MANY.item, unknown: true });
  for (let i = 0; i < 4; i++) f.tick();
  assert.equal(f.progress(), 8, "unknown is not zero, however long it lasts");
  for (let i = 0; i < 12; i++) f.tick();
  f.reply({ item: MANY.item, rev: "c", part: 1, parts: 1, rows: [{ id: MANY.item, n: 10 }] });
  f.tick();
  assert.equal(f.progress(), 12, "2 live + 10 saved, once the stash can answer");
});

test("F6: the bridge forgets a player who left", () => {
  const f = fixture(MANY);
  f.hold(f.stack("minecraft:amethyst_shard", 2));
  f.tick();
  f.answer([{ id: MANY.item, n: 6 }]);
  f.tick();
  const before = f.asks();
  assert.equal(f.forget(), true, "the bridge has a leave cleanup");
  f.hold(f.stack("minecraft:amethyst_shard", 2)); // they come back: counted again
  f.tick();
  assert.equal(f.asks(), before + 1, "nothing cached for them after they left: the next count asks again");
});
