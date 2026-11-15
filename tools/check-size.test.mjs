import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { cmpPath, measure, sizeProblem } from "./check-size.mjs";
import { walk } from "./lib/zip.mjs";

test("a resource pack may grow up to 5%; more needs a size line in its packNotes", () => {
  assert.equal(sizeProblem({ folder: "build_rp", now: 105, before: 100 }), undefined);
  assert.match(sizeProblem({ folder: "build_rp", now: 106, before: 100 }) ?? "", /build_rp grew 6\.0%.*packNotes\.build_rp\.size/);
  assert.equal(sizeProblem({ folder: "build_rp", now: 200, before: 100, sizeNote: "Two new guide pages." }), undefined);
  assert.notEqual(sizeProblem({ folder: "build_rp", now: 200, before: 100, sizeNote: "  " }), undefined, "a blank size line says nothing");
  assert.equal(sizeProblem({ folder: "new_rp", now: 200, before: undefined }), undefined, "new since the base, or no base");
  assert.equal(sizeProblem({ folder: "build_rp", now: 50, before: 100 }), undefined);
});

test("walk() lists files sorted at every level, the order the base's git files are sorted in, so the zips match", () => {
  const dir = mkdtempSync(join(tmpdir(), "check-size-"));
  try {
    for (const p of ["b.json", "a/z.png", "a.json", "a/b/c.txt", "A.txt"]) {
      mkdirSync(join(dir, p, ".."), { recursive: true });
      writeFileSync(join(dir, p), p.repeat(50));
    }
    const names = walk(dir).map((p) => relative(dir, p).split(sep).join("/"));
    assert.deepEqual(names, [...names].sort(cmpPath));
    assert.deepEqual(names, ["A.txt", "a/b/c.txt", "a/z.png", "a.json", "b.json"]);
    const files = (/** @type {string[]} */ order) => order.map((n) => ({ name: n, data: Buffer.from(n.repeat(50)) }));
    const m = measure(files(names));
    assert.equal(m.count, 5);
    assert.equal(m.largest[0].name, "a/b/c.txt");
    assert.equal(measure(files([...names].reverse().sort(cmpPath))).bytes, m.bytes);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
