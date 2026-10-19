import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const out = path.resolve(process.argv[2] ?? path.join(root, "tools", "test-bds", ".cache", "starfall-depleted"));
const source = fs.realpathSync(process.argv[3] ?? path.join(root, "packs"));
if (out === source || source.startsWith(`${out}${path.sep}`) || out.startsWith(`${source}${path.sep}`)) {
  throw new Error("The test stage must be separate from all source packs");
}
fs.mkdirSync(out, { recursive: true });
const marker = path.join(out, "starfall-stage.json");
if (fs.readdirSync(out).length) {
  if (!fs.existsSync(marker)) throw new Error(`Refusing to overwrite an unowned stage: ${out}`);
  const old = JSON.parse(fs.readFileSync(marker, "utf8"));
  if (old.source !== source || old.tool !== "saga-starfall-stage") throw new Error("The existing stage belongs to another source");
}
for (const folder of ["saga_bp", "party_bp"]) {
  fs.cpSync(path.join(source, folder), path.join(out, folder), { recursive: true });
}
const hook = fs.readFileSync(path.join(import.meta.dirname, "saga-starfall-state.js"));
fs.writeFileSync(path.join(out, "saga_bp", "scripts", "starfall-test-hook.js"), hook);
const main = path.join(out, "saga_bp", "scripts", "main.js");
fs.appendFileSync(main, '\nimport "./starfall-test-hook.js";\n');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
});
const files = ["saga_bp", "party_bp"].flatMap((folder) => walk(path.join(out, folder))).map((file) => ({
  path: path.relative(out, file),
  sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
}));
fs.writeFileSync(marker, JSON.stringify({ tool: "saga-starfall-stage", source, out, files }, null, 2));
console.log(`Staged source-preserving Starfall test hooks at ${out}`);
