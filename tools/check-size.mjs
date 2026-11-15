// The resource pack size budget (PIPE-15 (d), XC-09). Every player downloads Realm Resources again on join whenever
// any resource pack changes, so growth should be a decision. For each resource pack this zips the folder as
// `npm run build` does (tools/lib/zip.mjs, in memory), prints its built size with its largest files, and compares it
// with the same pack zipped at the base (the merge-base of HEAD and origin/master, or --base <ref>). A resource pack
// that grows more than 5% fails, unless its release notes say why: a "size" line in its packNotes entry,
//
//   "packNotes": { "build_rp": { "version": "2.1.17", "notes": "...", "size": "Why it is bigger, e.g. two new guide pages." } }
//
// which, like the entry, goes stale with the next version. A pack that is new since the base, or no base (no git,
// not fetched), is reported and passes.
//
//   node tools/check-size.mjs [--base <ref>] [--all]   (--all also lists every behavior pack's size and largest files)
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { walk, zip } from "./lib/zip.mjs";
import { NOTES_FILE, kindOf, lines } from "./release-notes.mjs";

/** The growth that needs a "size" line: 5%. */
export const BUDGET = 0.05;

/** @param {number} n bytes */
export const mb = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} MB` : `${(n / 1e3).toFixed(1)} KB`);

/**
 * The problem with one resource pack's size, or undefined when it is within the budget or the notes say why.
 * @param {{ folder: string, now: number, before?: number, sizeNote?: unknown }} p
 */
export function sizeProblem({ folder, now, before, sizeNote }) {
  if (!before || now <= before * (1 + BUDGET)) return undefined;
  if (lines(sizeNote).length) return undefined;
  const pct = ((now / before - 1) * 100).toFixed(1);
  return `${folder} grew ${pct}% (${mb(before)} -> ${mb(now)}), more than ${BUDGET * 100}%: every player downloads Realm Resources again. Make it smaller, or say why in ${NOTES_FILE}: packNotes.${folder}.size = "why it is bigger"`;
}

/**
 * The built size of a set of files, and the largest of them.
 * @param {{ name: string, data: Buffer }[]} files sorted by name, as walk() gives them
 */
export function measure(files) {
  const largest = [...files].sort((a, b) => b.data.length - a.data.length).slice(0, 3).map((f) => ({ name: f.name, bytes: f.data.length }));
  return { bytes: zip(files).length, count: files.length, largest };
}

/** The files of a pack folder at a git commit, sorted by name. @param {string} root @param {string} ref @param {string} folder */
function filesAt(root, ref, folder) {
  const tree = execFileSync("git", ["ls-tree", "-r", "-z", ref, "--", `packs/${folder}/`], { cwd: root, maxBuffer: 1 << 26 }).toString();
  const entries = tree.split("\0").filter(Boolean).map((l) => {
    const [meta, path] = l.split("\t");
    return { sha: meta.split(" ")[2], name: path.slice(`packs/${folder}/`.length) };
  });
  if (!entries.length) return [];
  const r = spawnSync("git", ["cat-file", "--batch"], { cwd: root, input: entries.map((e) => e.sha).join("\n") + "\n", maxBuffer: 1 << 30 });
  const buf = r.stdout;
  let at = 0;
  const files = [];
  for (const e of entries) {
    const nl = buf.indexOf(10, at);
    const size = Number(buf.subarray(at, nl).toString().split(" ")[2]);
    files.push({ name: e.name, data: buf.subarray(nl + 1, nl + 1 + size) });
    at = nl + 1 + size + 1;
  }
  // The same order walk() gives on disk: sorted by name at every level.
  return files.sort((a, b) => cmpPath(a.name, b.name));
}

/** walk()'s order: compare path segment by segment. @param {string} a @param {string} b */
export function cmpPath(a, b) {
  const x = a.split("/"), y = b.split("/");
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return x.length - y.length;
}

// ---------- CLI ----------
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const root = join(import.meta.dirname, "..");
  const { values: args } = parseArgs({ options: { base: { type: "string" }, all: { type: "boolean", default: false } } });
  const tryGit = (/** @type {string[]} */ ...a) => {
    try {
      return execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 26 }).trim();
    } catch {
      return undefined;
    }
  };
  const base = args.base ?? tryGit("merge-base", "HEAD", "origin/master");
  const changed = new Set();
  if (base) {
    for (const f of [...(tryGit("diff", "--name-only", base, "--", "packs/") ?? "").split("\n"), ...(tryGit("ls-files", "--others", "--exclude-standard", "--", "packs/") ?? "").split("\n")]) {
      if (f.startsWith("packs/")) changed.add(f.split("/")[1]);
    }
  }
  /** @type {any} */
  let notes = {};
  try {
    notes = JSON.parse(readFileSync(join(root, NOTES_FILE), "utf8"));
  } catch {
    // release-notes.mjs reports a missing or broken file.
  }
  const packsDir = join(root, "packs");
  const problems = [];
  let total = 0;
  const show = (/** @type {ReturnType<typeof measure>} */ m) => m.largest.map((f) => `${f.name} ${mb(f.bytes)}`).join(", ");
  for (const folder of readdirSync(packsDir).sort()) {
    const dir = join(packsDir, folder);
    if (!statSync(dir).isDirectory() || !existsSync(join(dir, "manifest.json"))) continue;
    const kind = kindOf(readFileSync(join(dir, "manifest.json"), "utf8"));
    if (kind !== "resources" && !args.all) continue;
    const files = walk(dir).map((p) => ({ name: relative(dir, p).split(sep).join("/"), data: readFileSync(p) }));
    const now = measure(files);
    if (kind !== "resources") {
      console.log(`  ${folder} ${mb(now.bytes)} (${now.count} files); largest: ${show(now)}`);
      continue;
    }
    total += now.bytes;
    let before = now.bytes;
    if (base && changed.has(folder)) before = measure(filesAt(root, base, folder)).bytes || 0;
    const delta = before ? `${now.bytes >= before ? "+" : ""}${((now.bytes / before - 1) * 100).toFixed(1)}%` : "new";
    console.log(`  ${folder} ${mb(now.bytes)} (${now.count} files, ${delta}); largest: ${show(now)}`);
    const p = sizeProblem({ folder, now: now.bytes, before: base ? before : undefined, sizeNote: notes.packNotes?.[folder]?.size });
    if (p) problems.push(p);
  }
  if (problems.length) {
    console.error(`Resource pack size budget:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`Resource packs: ${mb(total)} built in all${base ? `, none grown more than ${BUDGET * 100}% since ${base.slice(0, 8)} without a size note` : " (no origin/master to compare with: growth not checked)"}.`);
}
