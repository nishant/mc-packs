import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packsDir = path.join(root, "packs");

// This number only goes down: when you remove @ts-nocheck from a build_bp file, lower it.
const MAX_NOCHECK = 68;

function nocheckFiles() {
  const found = [];
  for (const pack of fs.readdirSync(packsDir, { withFileTypes: true })) {
    if (!pack.isDirectory()) continue;
    const scripts = path.join(packsDir, pack.name, "scripts");
    if (!fs.existsSync(scripts)) continue;
    for (const rel of fs.readdirSync(scripts, { recursive: true })) {
      const name = String(rel);
      if (!name.endsWith(".js")) continue;
      const file = path.join(scripts, name);
      if (!fs.statSync(file).isFile()) continue;
      if (fs.readFileSync(file, "utf8").includes("@ts-nocheck")) {
        found.push(path.relative(root, file).split(path.sep).join("/"));
      }
    }
  }
  return found.sort();
}

test("only build_bp scripts may use @ts-nocheck", () => {
  const outside = nocheckFiles().filter((f) => !f.startsWith("packs/build_bp/scripts/"));
  assert.deepEqual(outside, [], `@ts-nocheck outside build_bp:\n${outside.join("\n")}`);
});

test(`@ts-nocheck count never exceeds ${MAX_NOCHECK}`, () => {
  const files = nocheckFiles();
  assert.ok(files.length <= MAX_NOCHECK, `${files.length} files use @ts-nocheck (max ${MAX_NOCHECK}); offenders:\n${files.join("\n")}`);
});
