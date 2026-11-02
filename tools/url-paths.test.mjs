// Issue #162: a file path built from a URL's `.pathname` keeps the leading `/` before a Windows drive letter
// (`/C:/...`, which path.resolve turns into `C:\C:\...`) and keeps percent-escapes (a checkout in `mc packs`
// becomes `mc%20packs`), so the tool or test fails to find its own files. Build paths with fileURLToPath instead.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("no tool turns a file URL's .pathname into a file path", () => {
  const files = execFileSync("git", ["ls-files", "tools/*.mjs", "tools/*.js"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  assert.ok(files.length > 100, "found the tools");
  const hits = [];
  for (const f of files) {
    if (f === "tools/url-paths.test.mjs") continue;
    readFileSync(path.join(root, f), "utf8").split("\n").forEach((line, i) => {
      if (/\bURL\(/.test(line) && /\.pathname\b/.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(hits, [], "use fileURLToPath(url) instead of url.pathname");
});
