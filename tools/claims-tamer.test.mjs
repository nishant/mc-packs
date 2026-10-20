// F29: Land Claims lets a visitor use their own tamed pet inside someone else's claim. A vanilla pet loses its
// tameable / tamemount component (and tamedToPlayerId) when tamed, so the pack records the tamer itself.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");
const { createTamerWatch, tamerOf, TAMER_PROP, FEED_TICKS } = await import(pathToFileURL(join(root, "packs", "claims_bp", "scripts", "tamer.js")).href);

/** A vanilla-like animal: wild components until tamed, then only is_tamed. */
function animal(id, kind = "tameable") {
  const props = new Map();
  const e = {
    id,
    isValid: true,
    tamed: false,
    riders: /** @type {{ id: string }[]} */ ([]),
    getComponent(c) {
      if (c === "minecraft:is_tamed") return e.tamed ? {} : undefined;
      if (c === `minecraft:${kind}`) return e.tamed ? undefined : { tamedToPlayerId: undefined };
      if (c === "minecraft:rideable") return { getRiders: () => e.riders };
      return undefined;
    },
    getDynamicProperty: (k) => props.get(k),
    setDynamicProperty: (k, v) => props.set(k, v),
  };
  return e;
}

test("a wolf fed into taming records its tamer", () => {
  const w = createTamerWatch();
  const wolf = animal("w1");
  assert.equal(w.tap(wolf, "ann", 0), true);
  w.step(5);
  assert.equal(tamerOf(wolf), undefined);
  wolf.tamed = true;
  assert.equal(w.step(10), 1);
  assert.equal(tamerOf(wolf), "ann");
  assert.equal(wolf.getDynamicProperty(TAMER_PROP), "ann");
  assert.equal(w.size, 0);
});

test("a feed that doesn't tame stops being watched, and a later taming by someone else isn't credited", () => {
  const w = createTamerWatch();
  const wolf = animal("w2");
  w.tap(wolf, "ann", 0);
  w.step(FEED_TICKS + 1);
  assert.equal(w.size, 0);
  wolf.tamed = true;
  w.step(FEED_TICKS + 6);
  assert.equal(tamerOf(wolf), undefined);
});

test("the last player to feed it gets it", () => {
  const w = createTamerWatch();
  const cat = animal("c1");
  w.tap(cat, "ann", 0);
  w.tap(cat, "bob", 2);
  cat.tamed = true;
  w.step(5);
  assert.equal(tamerOf(cat), "bob");
});

test("a horse is the rider's when it turns tame under them, not when someone else rides it", () => {
  const w = createTamerWatch();
  const horse = animal("h1", "tamemount");
  assert.equal(w.tap(horse, "ann", 0), true);
  w.step(5); // not seated yet
  horse.riders = [{ id: "ann" }];
  w.step(10);
  horse.tamed = true;
  w.step(15);
  assert.equal(tamerOf(horse), "ann");

  const other = animal("h2", "tamemount");
  w.tap(other, "ann", 0);
  other.riders = [{ id: "bob" }];
  w.step(5);
  other.tamed = true;
  w.step(10);
  assert.equal(tamerOf(other), undefined);
});

test("thrown off untamed ends the watch", () => {
  const w = createTamerWatch();
  const horse = animal("h3", "tamemount");
  w.tap(horse, "ann", 0);
  horse.riders = [{ id: "ann" }];
  w.step(5);
  horse.riders = [];
  w.step(10);
  assert.equal(w.size, 0);
});

test("a pet already tamed, or an animal that can't be tamed, isn't watched; a recorded tamer is never replaced", () => {
  const w = createTamerWatch();
  const pet = animal("p1");
  pet.tamed = true;
  assert.equal(w.tap(pet, "bob", 0), false);
  const cow = { id: "cow", getComponent: () => undefined };
  assert.equal(w.tap(cow, "bob", 0), false);
  const wolf = animal("w3");
  wolf.setDynamicProperty(TAMER_PROP, "ann");
  w.tap(wolf, "bob", 0);
  wolf.tamed = true;
  w.step(5);
  assert.equal(tamerOf(wolf), "ann");
});

test("claims_bp lets a pet's tamer use it in any claim and watches taps for taming", () => {
  const main = readFileSync(join(root, "packs", "claims_bp", "scripts", "main.js"), "utf8");
  const handler = main.slice(main.indexOf("world.beforeEvents.playerInteractWithEntity.subscribe"));
  assert.match(handler, /if \(tamed && tamerOf\(target\) === player\.id\) return;/);
  assert.ok(handler.indexOf("tamerOf(target) === player.id") < handler.indexOf("event.cancel = true"), "the owner check comes before the cancel");
  assert.match(handler, /return watchTaming\(target, player\);/);
});
