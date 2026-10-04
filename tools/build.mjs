// Zips every folder in packs/ into dist/<folder>.mcpack (no dependencies).
// Double-click / open the .mcpack on any device with Minecraft to import it.
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { walk, zip } from "./lib/zip.mjs";

const root = join(import.meta.dirname, "..");
const packsDir = join(root, "packs");
const distDir = join(root, "dist");

mkdirSync(distDir, { recursive: true });
for (const pack of readdirSync(packsDir)) {
  const packDir = join(packsDir, pack);
  if (!statSync(packDir).isDirectory()) continue;
  const manifest = JSON.parse(readFileSync(join(packDir, "manifest.json"), "utf8"));
  const files = walk(packDir).map((p) => ({
    name: relative(packDir, p).split(sep).join("/"),
    data: readFileSync(p),
  }));
  const out = join(distDir, `${pack}.mcpack`);
  writeFileSync(out, zip(files));
  console.log(`${relative(root, out)}  v${manifest.header.version.join(".")}  (${files.length} files)`);
}
