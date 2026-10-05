// Fails if a pack's script code holds a character other than ASCII and §. Bedrock draws a whole
// line in a smaller fallback font when it contains a character its default font lacks (…, –, ·, •,
// emoji and the like), so chat, menus and command descriptions stay plain ASCII. Comments may use
// anything.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const problems = [];
for (const folder of readdirSync(join(root, "packs")).sort()) {
  const dir = join(root, "packs", folder, "scripts");
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const lines = readFileSync(join(dir, file), "utf8").split("\n");
    let inBlock = false;
    lines.forEach((line, i) => {
      let code = line;
      if (inBlock) {
        const end = code.indexOf("*/");
        if (end < 0) return;
        code = code.slice(end + 2);
        inBlock = false;
      }
      code = code.replace(/\/\*.*?\*\//g, "");
      const open = code.indexOf("/*");
      if (open >= 0) {
        code = code.slice(0, open);
        inBlock = true;
      }
      const comment = code.search(/(^|[^:"'`\\])\/\/(?![^"'`]*["'`]\s*[,)\]}])/);
      if (comment >= 0) code = code.slice(0, comment + 1);
      for (const ch of code) {
        if (ch.codePointAt(0) > 127 && ch !== "§") {
          problems.push(`packs/${folder}/scripts/${file}:${i + 1}: "${ch}" (U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}) - use ASCII in game text`);
          break;
        }
      }
    });
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("Pack scripts use plain ASCII (and §) outside comments.");
