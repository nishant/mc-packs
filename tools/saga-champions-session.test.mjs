// F27: saga_bp's list of the champions it spawned this session forgets a champion when it dies and never grows
// without bound (it used to keep every id for the whole session). Runs packs/saga_bp/scripts/champions-session.js.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_SESSION_CHAMPIONS, forgetChampion, sessionChampion, sessionChampionCount, trackChampion } from "../packs/saga_bp/scripts/champions-session.js";

test("a champion is known while alive and forgotten when it dies", () => {
  trackChampion("-100");
  assert.equal(sessionChampion("-100"), true);
  forgetChampion("-100");
  assert.equal(sessionChampion("-100"), false);
  assert.equal(sessionChampionCount(), 0);
});

test("the list is bounded, oldest first, and a re-tracked id counts as new", () => {
  for (let i = 0; i < MAX_SESSION_CHAMPIONS + 40; i++) trackChampion(`c${i}`);
  assert.equal(sessionChampionCount(), MAX_SESSION_CHAMPIONS);
  assert.equal(sessionChampion("c0"), false, "the oldest went first");
  assert.equal(sessionChampion(`c${MAX_SESSION_CHAMPIONS + 39}`), true);
  trackChampion("c40"); // the oldest left; touching it moves it to the newest
  trackChampion("x");
  assert.equal(sessionChampion("c40"), true);
  assert.equal(sessionChampion("c41"), false);
  for (let i = 0; i < MAX_SESSION_CHAMPIONS + 40; i++) forgetChampion(`c${i}`);
  forgetChampion("x");
  assert.equal(sessionChampionCount(), 0);
});

test("objectives.js forgets a champion in its entityDie handler and tracks only through the module", () => {
  const src = readFileSync(new URL("../packs/saga_bp/scripts/objectives.js", import.meta.url), "utf8");
  const die = src.indexOf("world.afterEvents.entityDie.subscribe(");
  assert.ok(die > 0);
  const body = src.slice(die, src.indexOf("\n});", die));
  assert.match(body, /tags\.includes\(CHAMPION_TAG\)\) \{\s*forgetChampion\(deadEntity\.id\);/);
  assert.doesNotMatch(src, /sessionChampions/, "no second list kept in objectives.js");
  assert.match(src, /trackChampion\(mob\.id\)/);
});
