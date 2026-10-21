import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { eolFiles, eolProblem } from "./check-eol.mjs";

test("LF-only and binary files pass", () => {
  assert.equal(eolProblem(Buffer.from("a\nb\n")), undefined);
  assert.equal(eolProblem(Buffer.from("no newline")), undefined);
  assert.equal(eolProblem(Buffer.from([0x89, 0x50, 0x00, 0x0d, 0x0a])), undefined);
});

test("CRLF, mixed and lone CR are each reported", () => {
  assert.equal(eolProblem(Buffer.from("a\r\nb\r\n")), "CRLF endings (2 lines)");
  assert.equal(eolProblem(Buffer.from("a\r\nb\nc\n")), "mixed endings (1 CRLF, 2 LF)");
  assert.equal(eolProblem(Buffer.from("a\rb\n")), "1 lone CR");
});

test("covers pack files and the shared sources the sync tools copy", () => {
  const files = eolFiles().map((f) => f.split("\\").join("/"));
  assert.ok(files.some((f) => f.endsWith("/packs/admin_bp/scripts/script-events.js")));
  assert.ok(files.some((f) => f.endsWith("/tools/events-shared.js")));
  assert.ok(!files.some((f) => f.endsWith(".test.mjs")));
});

test("the repository passes", () => {
  const r = spawnSync(process.execPath, [join(import.meta.dirname, "check-eol.mjs")], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});
