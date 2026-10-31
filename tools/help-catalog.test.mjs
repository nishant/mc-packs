import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { catalogText } from "./help-catalog.mjs";

const lf = readFileSync(join(import.meta.dirname, "..", "docs", "PACKS.md"), "utf8").replace(/\r\n?/g, "\n");

test("help catalog: a CRLF copy of PACKS.md gives the same catalog as LF, with steps", () => {
  const fromLf = catalogText(lf);
  const fromCrlf = catalogText(lf.replace(/\n/g, "\r\n"));
  assert.equal(fromCrlf.text, fromLf.text);
  assert.ok(fromLf.count > 0);
  assert.match(fromLf.text, /"steps": \[\s*\{/, "at least one pack has steps");
});
