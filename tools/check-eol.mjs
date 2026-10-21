// Fails when a file that ships, or is copied into a pack, has a carriage return: CRLF, mixed or lone CR line endings
// (F67). Bedrock reads either, but a file with mixed endings hides real changes in diffs and reviews, and a sync tool's
// byte-for-byte copy goes stale when one side is converted. Checked: every text file under packs/ (binary files, those
// with a NUL byte, are skipped) and the shared sources the sync tools copy into packs (tools/*-shared.js).
// .gitattributes keeps these LF in every checkout, Windows included.
//
//   node tools/check-eol.mjs          fail on any carriage return, one line per file
//   node tools/check-eol.mjs --fix    rewrite those files with LF endings (then bump the packs they belong to)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");
const fix = process.argv.includes("--fix");

/** @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

/**
 * What is wrong with a file's line endings, or undefined when it has no carriage return (or is binary).
 * @param {Buffer} bytes
 */
export function eolProblem(bytes) {
  if (bytes.includes(0)) return undefined;
  const text = bytes.toString("latin1");
  if (!text.includes("\r")) return undefined;
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lone = (text.match(/\r(?!\n)/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  if (lone) return `${lone} lone CR`;
  return lf ? `mixed endings (${crlf} CRLF, ${lf} LF)` : `CRLF endings (${crlf} lines)`;
}

/** The files this check covers, absolute. */
export function eolFiles() {
  const shared = readdirSync(join(root, "tools"))
    .filter((n) => n.endsWith("-shared.js"))
    .map((n) => join(root, "tools", n));
  return [...walk(join(root, "packs")), ...shared].sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = [];
  let files = 0;
  for (const file of eolFiles()) {
    files++;
    const bytes = readFileSync(file);
    const problem = eolProblem(bytes);
    if (!problem) continue;
    const name = relative(root, file).split(sep).join("/");
    if (fix) {
      writeFileSync(file, bytes.toString("utf8").replace(/\r\n?/g, "\n"));
      console.log(`check-eol: ${name}: ${problem}, rewritten with LF`);
    } else problems.push(`${name}: ${problem}`);
  }
  if (problems.length) {
    for (const p of problems) console.error(`check-eol: ${p}`);
    console.error(`check-eol: ${problems.length} file(s) with carriage returns; run node tools/check-eol.mjs --fix, then bump their packs`);
    process.exit(1);
  }
  console.log(`check-eol: ${files} files, LF only`);
}
