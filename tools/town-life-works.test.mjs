// Town Projects' saved works record: "~<id>" leftovers (what Remove spot could not reach yet) keep their cells across a
// reload and do not use up the live posts budget.
import assert from "node:assert/strict";
import test from "node:test";
import { LEFT_PATH_MAX, LEFT_POSTS_MAX, PATH_MAX, POSTS_MAX, postCount, readWorks } from "../packs/town_bp/scripts/life.js";

const CELL = 6;
const cells = (n) => "abcdef".repeat(n); // CELL-wide packed cells; any [0-9a-z] text works

test("a '~' entry keeps 3 * PATH_MAX path cells", () => {
  const w = readWorks({ "~spot": [cells(3 * PATH_MAX), ""] });
  assert.equal(w["~spot"][0].length / CELL, 3 * PATH_MAX);
});

test("a '~' entry is cut at LEFT_PATH_MAX, a live one at PATH_MAX", () => {
  const w = readWorks({ "~spot": [cells(LEFT_PATH_MAX + 5), ""], well: [cells(PATH_MAX + 5), ""] });
  assert.equal(w["~spot"][0].length / CELL, LEFT_PATH_MAX);
  assert.equal(w.well[0].length / CELL, PATH_MAX);
});

test("'~' posts do not reduce the live POSTS_MAX budget", () => {
  const w = readWorks({ "~spot": ["", cells(POSTS_MAX)], well: ["", cells(POSTS_MAX)] });
  assert.equal(w["~spot"][1].length / CELL, POSTS_MAX);
  assert.equal(w.well[1].length / CELL, POSTS_MAX);
});

test("'~' posts are capped at LEFT_POSTS_MAX in all", () => {
  const w = readWorks({ "~a": ["", cells(LEFT_POSTS_MAX)], "~b": ["", cells(3)] });
  assert.equal(postCount(w), 0);
  assert.equal(w["~a"][1].length / CELL, LEFT_POSTS_MAX);
  assert.equal(w["~b"], undefined);
});

test("postCount ignores '~' entries", () => {
  assert.equal(postCount({ "~x": ["", cells(5)], dock: ["", cells(2)] }), 2);
});
