#!/usr/bin/env node
// Builds the TEST COPY of saga_bp that tools/test-bds/examples/saga-graveyard-softlock.js needs: every file of the pack
// unchanged, plus tools/test-bds/hooks/saga-softlock-rvtest.js appended to scripts/objectives.js. Only the copy is
// written (never the source packs folder), so it works the same on Windows, Linux and macOS and from a frozen
// baseline:
//   node tools/test-bds/hooks/stage-saga-softlock.mjs <outDir> [--from <packs dir>]
// <outDir> gets saga_bp/ (replaced when it is there); run.mjs then uses it with --packs <outDir>. --from picks the packs
// folder to copy (default: this repo's packs/), e.g. a before-the-fix checkout for the scenario's before run.
// Prints one JSON line with the source and staged hashes of objectives.js.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const args = process.argv.slice(2);
const fromAt = args.indexOf("--from");
const from = fromAt >= 0 ? args[fromAt + 1] : undefined;
const positional = args.filter((a, i) => !a.startsWith("--") && (fromAt < 0 || i !== fromAt + 1));
if (!positional[0] || (fromAt >= 0 && !from)) {
  console.error("usage: node tools/test-bds/hooks/stage-saga-softlock.mjs <outDir> [--from <packs dir>]");
  process.exit(64);
}
const packs = path.resolve(from ?? path.join(ROOT, "packs"));
const out = path.resolve(positional[0]);
const src = path.join(packs, "saga_bp");
const dst = path.join(out, "saga_bp");
const inside = (child, parent) => child === parent || child.startsWith(parent + path.sep);
if (!fs.existsSync(path.join(src, "scripts", "objectives.js"))) {
  console.error(`no saga_bp in ${packs}`);
  process.exit(64);
}
if (inside(out, packs) || inside(packs, out)) {
  console.error(`refusing to stage inside (or around) the source packs folder: ${out}`);
  process.exit(64);
}

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const source = fs.readFileSync(path.join(src, "scripts", "objectives.js"));
fs.mkdirSync(out, { recursive: true });
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
fs.appendFileSync(path.join(dst, "scripts", "objectives.js"), fs.readFileSync(path.join(HERE, "saga-softlock-rvtest.js")));
const staged = fs.readFileSync(path.join(dst, "scripts", "objectives.js"));
if (!staged.subarray(0, source.length).equals(source)) {
  console.error("the staged objectives.js does not start with the source bytes");
  process.exit(1);
}
console.log(JSON.stringify({ from: src, staged: dst, sourceObjectivesSha256: sha(source), stagedObjectivesSha256: sha(staged), hook: "saga-softlock-rvtest.js" }));
