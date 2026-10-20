// Fails when a release would have no notes. The release workflow (.github/workflows/release.yml, tools/ci-release.mjs)
// publishes every merge to master on mc.nish.software by itself, and CI can't invent what changed: the author writes it
// in release/notes.json, in the same PR as the change.
//
//   release/notes.json
//   {
//     "notes": ["What changed in the Realm Bundle, for players."],
//     "resourceNotes": ["What changed in Realm Resources (optional: without it Realm Resources takes the notes)."],
//     "packNotes": { "guard_bp": { "version": "1.4.10", "notes": "What changed in this pack." } }
//   }
//
// Rules, comparing each pack's header.version with the base (the merge-base of HEAD and origin/master, or --base <ref>):
//   - a pack whose version went up needs a packNotes entry for exactly that version (help_bp and news_bp excepted: the
//     publisher names the release for them; a pack that is new since the base gets "First version hosted here.");
//   - every packNotes entry names a pack and its current version (an entry for an older version is stale: update it
//     or remove it), so the file holds at most one entry per pack and clears itself as packs move on;
//   - when a behavior pack went up (or was added), "notes" has at least one line that the base's file doesn't have;
//     when a resource pack did, "resourceNotes" has a new line, or there is no resourceNotes and "notes" has one.
// Lines stay in the file after a release; the release passes only lines no published version has yet, so a skipped
// or manual release loses nothing. Prune old lines whenever you like. With no base it says so and passes.
//
//   node tools/release-notes.mjs [--base <ref>]
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

export const NOTES_FILE = "release/notes.json";
/** Packs whose notes the publisher writes itself (publish-packs.mjs generatedNotes). */
export const GENERATED_NOTES = new Set(["help_bp", "news_bp"]);

/** "1.2.3" from a manifest's text, or undefined. @param {string | undefined} text */
export function versionOf(text) {
  if (!text) return undefined;
  try {
    const v = JSON.parse(text).header?.version;
    return Array.isArray(v) ? v.map(Number).join(".") : undefined;
  } catch {
    return undefined;
  }
}
/** "resources" or "behavior" from a manifest's text. @param {string} text */
export function kindOf(text) {
  try {
    return (JSON.parse(text).modules ?? []).some((/** @type {{type?: string}} */ m) => m.type === "resources") ? "resources" : "behavior";
  } catch {
    return "behavior";
  }
}
/** @param {string} a @param {string} b */
export function cmpVersion(a, b) {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}
/** A notes value (a string or a list of strings) as a list of trimmed lines. @param {unknown} v */
export const lines = (v) => (typeof v === "string" ? [v] : Array.isArray(v) ? v : []).map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean);

/**
 * The shape problems of a parsed notes file.
 * @param {any} file
 */
export function shapeProblems(file) {
  const p = [];
  if (!file || typeof file !== "object" || Array.isArray(file)) return [`${NOTES_FILE} must be a JSON object with "notes", optional "resourceNotes" and "packNotes"`];
  for (const k of Object.keys(file)) if (!["notes", "resourceNotes", "packNotes"].includes(k)) p.push(`unknown key "${k}" (notes, resourceNotes, packNotes)`);
  for (const k of ["notes", "resourceNotes"]) {
    if (file[k] === undefined) continue;
    if (!Array.isArray(file[k]) || file[k].some((/** @type {unknown} */ s) => typeof s !== "string" || !s.trim())) p.push(`"${k}" must be a list of non-empty strings`);
  }
  if (file.packNotes !== undefined) {
    if (!file.packNotes || typeof file.packNotes !== "object" || Array.isArray(file.packNotes)) p.push(`"packNotes" must map a pack folder to { "version": "1.2.3", "notes": "..." }`);
    else {
      for (const [folder, e] of Object.entries(file.packNotes)) {
        if (!e || typeof e !== "object" || typeof e.version !== "string" || !/^\d+(\.\d+)*$/.test(e.version)) p.push(`packNotes.${folder}: needs "version": "1.2.3" (the version these notes describe)`);
        else if (!lines(e.notes).length || (typeof e.notes !== "string" && !Array.isArray(e.notes))) p.push(`packNotes.${folder}: needs "notes": "what changed" (a string or a list of strings)`);
      }
    }
  }
  return p;
}

/**
 * Every problem with the notes for this change.
 * @param {{ file: any, baseFile?: any, packs: { folder: string, kind: "behavior" | "resources", before?: string, now?: string }[] }} input
 *   file: the parsed release/notes.json (undefined when missing); baseFile: the base's (undefined when it had none);
 *   packs: every pack folder in the tree now, with its version at the base (undefined when new) and now.
 * @returns {string[]}
 */
export function checkReleaseNotes({ file, baseFile, packs }) {
  const bumped = packs.filter((p) => p.now && (!p.before || cmpVersion(p.now, p.before) > 0));
  if (file === undefined) return bumped.length ? [`${NOTES_FILE} is missing and ${bumped.map((p) => p.folder).join(", ")} went up: add it with what changed`] : [];
  const shape = shapeProblems(file);
  if (shape.length) return shape;
  const p = [];
  const byFolder = new Map(packs.map((x) => [x.folder, x]));
  const packNotes = /** @type {Record<string, { version: string, notes: unknown }>} */ (file.packNotes ?? {});
  for (const [folder, e] of Object.entries(packNotes)) {
    const pack = byFolder.get(folder);
    if (!pack) p.push(`packNotes.${folder}: no pack folder packs/${folder}`);
    else if (pack.now !== e.version) p.push(`packNotes.${folder} describes ${e.version} but the pack is at ${pack.now}: update the entry for ${pack.now} or remove it`);
  }
  for (const pack of bumped) {
    if (!pack.before || GENERATED_NOTES.has(pack.folder)) continue;
    if (!packNotes[pack.folder]) p.push(`${pack.folder} went up to ${pack.now} (from ${pack.before}): add packNotes.${pack.folder} = { "version": "${pack.now}", "notes": "what changed, for players" }`);
  }
  const fresh = (/** @type {unknown} */ now, /** @type {unknown} */ before) => {
    const old = new Set(lines(before));
    return lines(now).some((l) => !old.has(l));
  };
  const names = (/** @type {string} */ kind) => {
    const f = bumped.filter((x) => x.kind === kind).map((x) => x.folder);
    return f.slice(0, 5).join(", ") + (f.length > 5 ? `, and ${f.length - 5} more` : "");
  };
  if (bumped.some((x) => x.kind === "behavior") && !fresh(file.notes, baseFile?.notes)) {
    p.push(`the Realm Bundle changes (${names("behavior")}): add a new line to "notes" saying what changed, for players`);
  }
  if (bumped.some((x) => x.kind === "resources")) {
    const ok = file.resourceNotes?.length ? fresh(file.resourceNotes, baseFile?.resourceNotes) : fresh(file.notes, baseFile?.notes);
    if (!ok) p.push(`Realm Resources changes (${names("resources")}): add a new line to "resourceNotes" (or leave "resourceNotes" out and add one to "notes")`);
  }
  return p;
}

// ---------- CLI ----------
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const root = join(import.meta.dirname, "..");
  const { values: args } = parseArgs({ options: { base: { type: "string" } } });
  const tryGit = (/** @type {string[]} */ ...a) => {
    try {
      return execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 26 }).trim();
    } catch {
      return undefined;
    }
  };
  const base = args.base ?? tryGit("merge-base", "HEAD", "origin/master");
  if (!base) {
    console.log("release-notes: no origin/master to compare with (no git, or not fetched): notes not checked.");
    process.exit(0);
  }
  if (tryGit("rev-parse", "--verify", "--quiet", `${base}^{commit}`) === undefined) {
    console.error(`release-notes: no commit "${base}"`);
    process.exit(1);
  }
  const short = tryGit("rev-parse", "--short", base) ?? base;
  const parse = (/** @type {string | undefined} */ text, /** @type {string} */ where) => {
    if (text === undefined) return undefined;
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error(`release-notes: ${where} is not valid JSON: ${/** @type {Error} */ (e).message}`);
      process.exit(1);
    }
  };
  const notesPath = join(root, NOTES_FILE);
  const file = parse(existsSync(notesPath) ? readFileSync(notesPath, "utf8") : undefined, NOTES_FILE);
  let baseFile;
  try {
    baseFile = JSON.parse(tryGit("show", `${base}:${NOTES_FILE}`) ?? "");
  } catch {
    baseFile = undefined; // none at the base, or unreadable there: every line counts as new
  }
  const packs = readdirSync(join(root, "packs"))
    .filter((f) => existsSync(join(root, "packs", f, "manifest.json")))
    .sort()
    .map((folder) => {
      const text = readFileSync(join(root, "packs", folder, "manifest.json"), "utf8");
      return { folder, kind: kindOf(text), before: versionOf(tryGit("show", `${base}:packs/${folder}/manifest.json`)), now: versionOf(text) };
    });
  const problems = checkReleaseNotes({ file, baseFile, packs });
  if (problems.length) {
    console.error(`Release notes are missing or stale (${NOTES_FILE}, compared with ${short}):\n${problems.map((x) => `  - ${x}`).join("\n")}`);
    console.error("(the release workflow publishes every merge to master with these notes; see Releases from CI in docs/WORKING.md)");
    process.exit(1);
  }
  const bumped = packs.filter((x) => x.now && (!x.before || cmpVersion(x.now, x.before) > 0)).length;
  console.log(`Release notes: ${bumped} pack${bumped === 1 ? "" : "s"} went up since ${short}, each with its notes.`);
}
