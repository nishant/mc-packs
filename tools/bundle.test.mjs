// Builds the Realm Bundle and checks the dedupe: shared modules are stored once in scripts/_shared/ and every
// relative import in the bundle still resolves to a file in the zip.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, posix } from "node:path";
import { test } from "node:test";
import { inflateRawSync } from "node:zlib";

const root = join(import.meta.dirname, "..");
const NAME = "bundle_test";
const out = join(root, "dist", `${NAME}.mcpack`);
const SHARED = ["diag-core.js", "settings-core.js", "tether.js", "owed.js", "name-labels.js", "spread.js", "gossip.js", "spawn.js", "prune.js", "weather-plan.js"];

/** Minimal zip reader (central directory, stored or deflate). @param {Buffer} buf @returns {Map<string, Buffer>} */
function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  assert.ok(eocd >= 0, "zip end record not found");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  /** @type {Map<string, Buffer>} */
  const files = new Map();
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataStart, dataStart + size);
    files.set(name, method === 8 ? inflateRawSync(raw) : Buffer.from(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

test("the Realm Bundle stores shared modules once and every import resolves", () => {
  try {
    const log = execFileSync(process.execPath, [join(root, "tools", "bundle.mjs"), "--all", "--name", NAME], { cwd: root, encoding: "utf8" });
    assert.match(log, /deduped \d+ modules, saved \d+ KB/);
    const files = unzip(readFileSync(out));

    const shared = [...files.keys()].filter((f) => f.startsWith("scripts/_shared/"));
    assert.ok(shared.length > 0, "scripts/_shared/ exists");
    assert.ok(files.has("scripts/_shared/diag-core.js"), "diag-core.js is shared");
    assert.ok(files.has("scripts/_shared/settings-core.js"), "settings-core.js is shared");

    // No allowlisted module is left under a pack folder.
    for (const f of files.keys()) {
      if (f.startsWith("scripts/_shared/")) continue;
      assert.ok(!SHARED.includes(posix.basename(f)), `${f} should live in scripts/_shared/`);
    }

    // Every relative import of every script resolves to a file in the zip.
    const importRe = /(?:\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.{1,2}\/[^"'\n]*)\1/g;
    let checked = 0;
    for (const [f, data] of files) {
      if (!f.endsWith(".js")) continue;
      const code = data.toString("utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); // imports named in comments are not imports
      for (const m of code.matchAll(importRe)) {
        const target = posix.join(posix.dirname(f), m[2]);
        assert.ok(files.has(target), `${f} imports ${m[2]}, which is not in the bundle (${target})`);
        checked++;
      }
    }
    assert.ok(checked > 100, `checked ${checked} imports`);

    // The shared diag core is what the stubs import.
    assert.match(files.get("scripts/afk_bp/diag.js")?.toString("utf8") ?? "", /from "\.\.\/_shared\/diag-core\.js"/);
  } finally {
    if (existsSync(out)) rmSync(out);
  }
});
