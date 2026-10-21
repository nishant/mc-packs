// Fails if a pack's files changed without a higher header.version. A published version is never replaced
// (hosting's publish-packs refuses), so a change shipped under an old version never reaches players; and two
// branches that each bump the same pack to the same version (help_bp and news_bp, whose generators bump on every
// branch) end up with one version number for two different packs (history C7, PRs #20, #24, #64, #72).
//
// It compares each pack folder in the working tree (uncommitted and untracked files included) with the base: the
// merge-base of HEAD and origin/master, or --base <ref>. A pack that is new since the base needs no bump. With no
// base (no git, a shallow clone without origin/master) it says so and passes.
//
//   node tools/check-versions.mjs [--base <ref>]
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const root = join(import.meta.dirname, "..");
const { values: args } = parseArgs({ options: { base: { type: "string" } } });
const git = (/** @type {string[]} */ ...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 26 }).trim();
const tryGit = (/** @type {string[]} */ ...a) => {
  try {
    return git(...a);
  } catch {
    return undefined;
  }
};

let base = args.base;
if (base) {
  if (tryGit("rev-parse", "--verify", "--quiet", `${base}^{commit}`) === undefined) {
    console.error(`check-versions: no commit "${base}"`);
    process.exit(1);
  }
} else {
  base = tryGit("merge-base", "HEAD", "origin/master");
  if (!base) {
    console.log("check-versions: no origin/master to compare with (no git, or not fetched): versions not checked.");
    process.exit(0);
  }
}
const short = tryGit("rev-parse", "--short", base) ?? base;

/** "1.2.3" from a manifest's text, or undefined. @param {string | undefined} text */
function versionOf(text) {
  if (!text) return undefined;
  try {
    const v = JSON.parse(text).header?.version;
    return Array.isArray(v) ? v.map(Number) : undefined;
  } catch {
    return undefined;
  }
}
/** @param {number[]} a @param {number[]} b */
const cmp = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
};

// Every path under packs/ that differs from the base, tracked or not (one git call each, not one per pack).
const changed = new Set();
for (const line of (tryGit("diff", "--name-only", "--no-renames", base, "--", "packs") ?? "").split("\n")) if (line) changed.add(line);
for (const line of (tryGit("ls-files", "--others", "--exclude-standard", "--", "packs") ?? "").split("\n")) if (line) changed.add(line);
/** @type {Map<string, string[]>} folder -> changed files */
const byPack = new Map();
for (const f of changed) {
  const [, folder, ...rest] = f.split("/");
  if (!folder || !rest.length) continue;
  if (!byPack.has(folder)) byPack.set(folder, []);
  /** @type {string[]} */ (byPack.get(folder)).push(rest.join("/"));
}

const problems = [];
let checked = 0;
for (const folder of [...byPack.keys()].sort()) {
  const mf = join(root, "packs", folder, "manifest.json");
  if (!existsSync(mf)) continue; // removed pack
  const before = versionOf(tryGit("show", `${base}:packs/${folder}/manifest.json`));
  if (!before) continue; // new since the base
  checked++;
  const now = versionOf(readFileSync(mf, "utf8"));
  if (!now) {
    problems.push(`${folder}: manifest.json has no readable header.version`);
    continue;
  }
  if (cmp(now, before) > 0) continue;
  const files = /** @type {string[]} */ (byPack.get(folder));
  problems.push(`${folder}: ${files.length} file${files.length === 1 ? "" : "s"} changed since ${short} (${files.slice(0, 3).join(", ")}${files.length > 3 ? ", ..." : ""}) but header.version is still ${now.join(".")}${cmp(now, before) < 0 ? ` (lower than ${before.join(".")})` : ""}: raise it`);
}
const packs = readdirSync(join(root, "packs")).filter((f) => existsSync(join(root, "packs", f, "manifest.json"))).length;
if (problems.length) {
  console.error(`Packs changed without a version bump (compared with ${short}):\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  console.error("(sky_rp's version is set in tools/gen-sky/gen.mjs; help_bp and news_bp are bumped by their generators)");
  process.exit(1);
}
console.log(`Versions: ${checked} of ${packs} packs changed since ${short}, each with a higher header.version.`);
// Then every bump's release notes (tools/release-notes.mjs, the notes the release workflow publishes with): run from
// here rather than as its own term in npm run check, so the long check line other branches edit doesn't conflict.
const notes = spawnSync(process.execPath, [join(root, "tools", "release-notes.mjs"), ...(args.base ? ["--base", args.base] : [])], { stdio: "inherit" });
if (notes.status !== 0) process.exit(notes.status ?? 1);
