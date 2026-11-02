// The hosting half of a release, for CI (.github/workflows/release.yml): what CLAUDE.md's "Ship every change" steps 2-3
// ask of a session, run from a checkout of master after its checks passed.
//
//   node tools/ci-release.mjs --hosting <nishant/hosting checkout> [--from <mc-packs checkout>] [--open-pr | --merge-pr <branch>] [--no-merge] [--no-live]
//
// In <hosting>/minecraft it runs fetch-packs (each pack's newest version onto disk, which publish-packs compares a new
// build with), publish-packs (with the notes from release/notes.json that no published version has yet), archive-packs
// --prune (adds `archive` URLs to packs.json entries past the newest 5), pack-docs, pack-docs' check and check-site
// realm; when anything under minecraft/ changed it commits that on a new branch and opens a PR to master in hosting
// (gh, with GH_TOKEN). Merging that PR is the deploy, and the deploy fetches the newest 5 versions of every pack from
// the packs-<slug> releases of nishant/mc-packs. So the release workflow uses two modes, with its `upload` job between
// them: --open-pr stops after `gh pr create` (it writes branch=<name> and pr=<url> to $GITHUB_OUTPUT, branch= empty when
// nothing changed), the `upload` job puts every new .mcpack into its release and checks the newest 5 of each pack, and
// only then --merge-pr <branch> merges that PR, checks out the merged master and runs check-live, which waits for the
// deploy before it asks for any new URL (Cloudflare caches a 404). The assets must exist before the deploy, or it
// could not fetch them.
//
// Without either flag it does everything in one go (open the PR, merge it, check-live), for manual runs, but only while
// hosting has no tools/fetch-packs.mjs: once it has, the new versions must be uploaded before the merge, so a run
// with new pack versions is refused in that mode (use the workflow, or --open-pr, upload, --merge-pr). Nothing new to
// publish and an up-to-date realm page: no PR, check-live only (in --open-pr too, since there is nothing to merge). So
// a rerun, or a run after a session already published by hand, does no harm. --no-merge stops after the commit (a dry
// run of the hosting side: nothing is pushed); --no-live skips check-live.
//
// It writes a Markdown report to $GITHUB_STEP_SUMMARY (or stdout) and exits non-zero on the first failing step.
// What it never does: pass --allow-dirty, force anything, or upload to the Realm (the owner does that).
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { NOTES_FILE, lines, versionOf } from "./release-notes.mjs";

const BUNDLE = "realm-bundle";
const RESOURCES = "realm-resources";

/**
 * The publish-packs arguments for these notes: only lines that no published version of that pack carries yet, and a
 * pack's notes only for its current, unpublished version. Returns { args, used } (used: what each note went to).
 * @param {any} notesFile the parsed release/notes.json (or undefined)
 * @param {{ packs: { slug: string, folder?: string, versions: { version: string, notes?: string[] }[] }[] }} packsJson
 * @param {Map<string, string>} current folder -> its header.version now
 */
export function publishArgs(notesFile, packsJson, current) {
  const args = [], used = [];
  const published = (/** @type {(p: any) => boolean} */ match) => new Set((packsJson.packs.find(match)?.versions ?? []).flatMap((v) => lines(v.notes)));
  const add = (/** @type {string} */ flag, /** @type {string} */ text, /** @type {string} */ to) => { args.push(flag, text); used.push([to, text]); };
  const bundleSeen = published((p) => p.slug === BUNDLE);
  for (const l of lines(notesFile?.notes)) if (!bundleSeen.has(l)) add("--notes", l, "Realm Bundle");
  const resSeen = published((p) => p.slug === RESOURCES);
  for (const l of lines(notesFile?.resourceNotes)) if (!resSeen.has(l)) add("--resource-notes", l, "Realm Resources");
  for (const [folder, e] of Object.entries(notesFile?.packNotes ?? {})) {
    if (!e || current.get(folder) !== e.version) continue; // stale: the pack moved on (release-notes refuses this on a PR)
    const entry = packsJson.packs.find((p) => p.folder === folder);
    if (entry?.versions.some((v) => v.version === e.version)) continue; // already published
    for (const l of lines(e.notes)) add("--pack-notes", `${folder}=${l}`, `${folder} ${e.version}`);
  }
  return { args, used };
}

/**
 * The rows of publish-packs' report ("slug  version  what"), e.g. [{ slug, version, what: "new (was 1.0.1)" }].
 * @param {string} stdout
 */
export function parseReport(stdout) {
  const rows = [];
  for (const line of stdout.split("\n")) {
    const m = line.match(/^([a-z0-9-]+)\s{2,}(\S+)\s+(unchanged|new.*)$/);
    if (m) rows.push({ slug: m[1], version: m[2], what: m[3].trim() });
  }
  return rows;
}

/**
 * How many versions archive-packs --prune moved to GitHub Releases: "archived A" on its last line
 * ("total  uploaded U, archived A, kept K, X MB freed").
 * @param {string} stdout
 */
export function parseArchive(stdout) {
  const m = stdout.match(/^total\s{2,}uploaded \d+, archived (\d+),/m);
  return m ? Number(m[1]) : 0;
}

/**
 * Which mode the flags ask for: "all" (neither flag), "open-pr" or "merge-pr" (with its branch). The two flags exclude
 * each other, and --merge-pr needs a branch name.
 * @param {{ "open-pr"?: boolean, "merge-pr"?: string }} opt
 * @returns {{ mode: "all" | "open-pr" } | { mode: "merge-pr", branch: string } | { error: string }}
 */
export function modeOf(opt) {
  const merge = opt["merge-pr"];
  if (opt["open-pr"] && merge !== undefined) return { error: "--open-pr and --merge-pr exclude each other" };
  if (merge !== undefined) return merge.trim() ? { mode: "merge-pr", branch: merge.trim() } : { error: "--merge-pr needs a branch name" };
  return { mode: opt["open-pr"] ? "open-pr" : "all" };
}

/**
 * The `key=value` lines the workflow reads from $GITHUB_OUTPUT. A value cannot span lines there, so only its first line
 * is kept. Undefined values are left out.
 * @param {Record<string, string | undefined>} outputs
 */
export function outputLines(outputs) {
  return Object.entries(outputs).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${String(v).split("\n")[0].trim()}\n`).join("");
}

/**
 * Write the outputs to the file $GITHUB_OUTPUT names, or print them when it is unset.
 * @param {Record<string, string | undefined>} outputs
 * @param {string | undefined} file
 * @param {(text: string) => void} [print]
 */
export function writeOutputs(outputs, file, print = (t) => process.stdout.write(t)) {
  const text = outputLines(outputs);
  if (file) appendFileSync(file, text);
  else print(text);
}

/**
 * The job summary, in Markdown.
 * @param {{ sourceSha?: string, rows: { slug: string, version: string, what: string }[], used: string[][], fetch?: string, archive?: string, bundle?: string, resources?: string, pr?: string, merged?: boolean, changed: boolean, live?: string, failed?: { step: string, output: string } }} r
 */
export function summaryMarkdown(r) {
  const fresh = r.rows.filter((x) => x.what !== "unchanged");
  const out = [`## Release${r.sourceSha ? ` of mc-packs ${r.sourceSha.slice(0, 7)}` : ""}`, ""];
  if (r.failed) out.push(`**Failed at ${r.failed.step}.** Fix the cause, then rerun it (Actions > release > Run workflow); the workflow is idempotent.`, "", "```", r.failed.output.trim().split("\n").slice(-40).join("\n"), "```", "");
  if (fresh.length) out.push(`**${fresh.length} new version${fresh.length === 1 ? "" : "s"} published:**`, "");
  else if (r.rows.length) out.push("Nothing new to publish (every pack's latest version is already on the site).", "");
  if (fresh.length) {
    out.push("| Pack | Version | |", "|---|---|---|");
    for (const x of fresh) out.push(`| ${x.slug} | ${x.version} | ${x.what} |`);
    out.push("");
  }
  if (r.used.length) {
    out.push("Notes used:", "");
    for (const [to, text] of r.used) out.push(`- ${to}: ${text}`);
    out.push("");
  }
  if (r.fetch) out.push(`fetch-packs: ${r.fetch}`, "");
  if (r.archive) out.push(`Archive: ${r.archive}`, "");
  if (r.bundle || r.resources) out.push(`Realm Bundle **${r.bundle ?? "?"}**, Realm Resources **${r.resources ?? "?"}** (latest in packs.json).`, "");
  if (r.pr) out.push(`Hosting PR: ${r.pr}${r.merged ? " (merged: deploying)" : " (open, not merged: the merge job merges it after the upload job)"}`, "");
  else if (!r.failed) out.push(r.changed ? "Hosting changes committed locally only (--no-merge)." : "The realm page was already up to date: no hosting PR.", "");
  if (r.live) out.push(`check-live: ${r.live}`, "");
  if (r.live?.startsWith("passed") && (r.bundle || r.resources)) out.push(`Site up to date: Realm Bundle ${r.bundle ?? "?"} and Realm Resources ${r.resources ?? "?"} are live at https://minecraft.nish.software/realm/.`, "");
  return out.join("\n");
}

/**
 * An argument as the job log shows it: single-quoted like a shell would take it, so a multi-line commit message or PR
 * body prints on its own lines instead of as one JSON string with literal "\n"s.
 * @param {string} x
 */
export const shellQuote = (x) => (/[\s'"$`\\]/.test(x) ? `'${x.replaceAll("'", "'\\''")}'` : x);

// ---------- CLI ----------
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const { values: opt } = parseArgs({ options: { hosting: { type: "string" }, from: { type: "string" }, "open-pr": { type: "boolean", default: false }, "merge-pr": { type: "string" }, "no-merge": { type: "boolean", default: false }, "no-live": { type: "boolean", default: false }, "live-wait": { type: "string", default: "900" } } });
  if (!opt.hosting) {
    console.error("usage: node tools/ci-release.mjs --hosting <hosting checkout> [--from <mc-packs checkout>] [--open-pr | --merge-pr <branch>] [--no-merge] [--no-live]");
    process.exit(2);
  }
  const chosen = modeOf(opt);
  if ("error" in chosen) {
    console.error(chosen.error);
    process.exit(2);
  }
  const from = resolve(opt.from ?? join(import.meta.dirname, ".."));
  const hosting = resolve(opt.hosting);
  const mc = join(hosting, "minecraft");
  /** @param {string} cmd @param {string[]} a @param {string} cwd */
  const run = (cmd, a, cwd, env = process.env) => {
    console.log(`$ ${cmd} ${a.map(shellQuote).join(" ")}`);
    const r = spawnSync(cmd, a, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}${r.error ? String(r.error) : ""}`;
    process.stdout.write(out);
    return { ok: r.status === 0, out, stdout: r.stdout ?? "" };
  };
  const node = (/** @type {string[]} */ ...a) => run(process.execPath, a, mc);
  // The archive token only reads and deletes local files here: it needs read access to mc-packs releases.
  const nodeAs = (/** @type {NodeJS.ProcessEnv} */ env, /** @type {string[]} */ ...a) => run(process.execPath, a, mc, env);
  const git = (/** @type {string[]} */ ...a) => run("git", a, hosting);
  /** @type {Parameters<typeof summaryMarkdown>[0]} */
  const report = { rows: [], used: [], changed: false };
  report.sourceSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: from, encoding: "utf8" }).stdout.trim() || undefined;
  const finish = (/** @type {number} */ code) => {
    const md = summaryMarkdown(report);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
    else console.log("\n" + md);
    process.exit(code);
  };
  const step = (/** @type {string} */ name, /** @type {{ ok: boolean, out: string }} */ r) => {
    if (!r.ok) {
      report.failed = { step: name, output: r.out };
      finish(1);
    }
    return r;
  };
  const latest = () => {
    try {
      const j = JSON.parse(readFileSync(join(mc, "site", "packs", "packs.json"), "utf8"));
      report.bundle = j.packs.find((/** @type {any} */ p) => p.slug === BUNDLE)?.versions[0]?.version;
      report.resources = j.packs.find((/** @type {any} */ p) => p.slug === RESOURCES)?.versions[0]?.version;
      return j;
    } catch {
      return { packs: [] };
    }
  };

  // Merge a PR (GitHub works out mergeability a moment after it opens: retry a few times before giving up), then make
  // this checkout the merged master, which check-live compares the live site with.
  const mergeAndCheckout = (/** @type {string} */ branch) => {
    // A rerun after the merge itself succeeded (e.g. "Re-run failed jobs" after check-live failed): skip the merge.
    const state = run("gh", ["pr", "view", branch, "--json", "state", "--jq", ".state"], hosting);
    const alreadyMerged = state.ok && state.stdout.trim().split("\n").at(-1) === "MERGED";
    if (!alreadyMerged) {
      let merge = { ok: false, out: "", stdout: "" };
      for (let i = 0; i < 6 && !merge.ok; i++) {
        if (i) spawnSync("sleep", ["10"]);
        merge = run("gh", ["pr", "merge", branch, "--merge"], hosting);
      }
      step("gh pr merge", merge);
    }
    report.merged = true;
    step("git fetch", git("fetch", "-q", "origin", "master"));
    step("git checkout master", git("checkout", "-q", "--detach", "origin/master"));
    latest();
  };
  // The live site (waits for the deploy on the hosting PC first).
  const checkLive = () => {
    if (opt["no-live"]) return;
    const live = node("tools/check-live.mjs", "--wait", String(opt["live-wait"]));
    report.live = live.ok ? "passed" : "FAILED";
    if (!live.ok) {
      report.failed = { step: "check-live", output: live.out };
      finish(1);
    }
  };

  // --merge-pr: the publish steps ran in the --open-pr job, and the upload job has put the assets where the deploy
  // fetches them. Merge, then check the live site.
  if (chosen.mode === "merge-pr") {
    const view = run("gh", ["pr", "view", chosen.branch, "--json", "url", "--jq", ".url"], hosting);
    report.pr = (view.ok && view.stdout.trim().split("\n").at(-1)) || chosen.branch;
    mergeAndCheckout(chosen.branch);
    checkLive();
    finish(0);
  }

  // 1. Notes: the lines no published version has yet.
  const notesPath = join(from, NOTES_FILE);
  let notesFile;
  try {
    notesFile = existsSync(notesPath) ? JSON.parse(readFileSync(notesPath, "utf8")) : undefined;
  } catch (e) {
    report.failed = { step: NOTES_FILE, output: String(e) };
    finish(1);
  }
  const current = new Map();
  for (const f of readdirSync(join(from, "packs"))) {
    const mf = join(from, "packs", f, "manifest.json");
    if (existsSync(mf)) current.set(f, versionOf(readFileSync(mf, "utf8")) ?? "");
  }
  const { args, used } = publishArgs(notesFile, latest(), current);
  report.used = used;

  // 2. Put each pack's newest version on disk (hosting no longer tracks .mcpack files; publish-packs compares a new build
  //    with it), publish, then the realm page and its checks. pack-docs' check flag is spelled '--check' here on purpose: this
  //    tool has no check mode of its own for check-pipeline to look for.
  if (existsSync(join(mc, "tools", "fetch-packs.mjs"))) {
    step("fetch-packs", node("tools/fetch-packs.mjs", "--keep", "1"));
    report.fetch = "newest version of each pack fetched";
  } else report.fetch = "skipped (no tools/fetch-packs.mjs in hosting)";
  const pub = step("publish-packs", node("tools/publish-packs.mjs", "--from", from, ...args));
  report.rows = parseReport(pub.stdout);
  latest();
  if (existsSync(join(mc, "tools", "archive-packs.mjs"))) {
    const arch = step("archive-packs --prune", nodeAs({ ...process.env, GH_TOKEN: process.env.ARCHIVE_READ_TOKEN || process.env.GH_TOKEN }, "tools/archive-packs.mjs", "--prune", "--keep", "5"));
    const moved = parseArchive(arch.stdout);
    report.archive = `${moved} version${moved === 1 ? "" : "s"} moved to GitHub Releases`;
    latest();
  } else report.archive = "skipped (no tools/archive-packs.mjs in hosting)";
  step("pack-docs", node("tools/pack-docs.mjs", "--from", from));
  step("pack-docs --check", node("tools/pack-docs.mjs", "--from", from, '--check'));
  step("check-site realm", node("tools/check-site.mjs", "realm"));

  // 3. The hosting PR, only when something changed.
  const status = step("git status", git("status", "--porcelain", "--", "minecraft"));
  report.changed = status.stdout.trim() !== "";
  if (report.changed) {
    const fresh = report.rows.filter((x) => x.what !== "unchanged");
    const short = (report.sourceSha ?? "unknown").slice(0, 7);
    const title = fresh.length ? `Publish mc-packs ${short}: ${fresh.length} new pack version${fresh.length === 1 ? "" : "s"}` : `Realm page from mc-packs ${short}`;
    const branch = `release/mc-packs-${short}-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12)}`;
    step("git checkout -b", git("checkout", "-b", branch));
    step("git add", git("add", "-A", "minecraft"));
    step("git commit", git("commit", "-q", "-m", `${title}\n\nReleased by nishant/mc-packs' release workflow from ${report.sourceSha ?? "an unknown commit"}.`));
    if (opt["no-merge"]) finish(0);
    // The deploy fetches new versions from the packs-<slug> releases, so merging before they are uploaded breaks it.
    if (chosen.mode === "all" && fresh.length && existsSync(join(mc, "tools", "fetch-packs.mjs"))) {
      step("all-in-one mode", { ok: false, out: "Refusing to open and merge the hosting PR without uploading the new pack versions first (the deploy would 404 on them). Run the release workflow, or run --open-pr, upload the new .mcpack files to their packs-<slug> releases, then --merge-pr <branch>." });
    }
    step("git push", git("push", "-q", "-u", "origin", branch));
    const body = [`Published by the mc-packs release workflow from nishant/mc-packs@${report.sourceSha ?? "?"}. Merging deploys.`, "", ...fresh.map((x) => `- ${x.slug} ${x.version} (${x.what})`)].join("\n");
    const pr = step("gh pr create", run("gh", ["pr", "create", "--base", "master", "--head", branch, "--title", title, "--body", body], hosting));
    report.pr = pr.stdout.trim().split("\n").at(-1);
    if (chosen.mode === "open-pr") {
      // Merging waits for the upload job (see the header): hand the branch to the workflow.
      writeOutputs({ branch, pr: report.pr }, process.env.GITHUB_OUTPUT);
      finish(0);
    }
    mergeAndCheckout(branch);
  } else if (chosen.mode === "open-pr") writeOutputs({ branch: "" }, process.env.GITHUB_OUTPUT);

  // 4. The live site.
  checkLive();
  finish(0);
}
