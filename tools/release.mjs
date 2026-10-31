#!/usr/bin/env node
// The ship order from CLAUDE.md as one checked, resumable command per phase. It plans first and runs nothing without
// --execute; every phase refuses to start until the evidence the previous phases left is on record for the exact commit.
//
//   node tools/release.mjs plan     [options]   print every step of the release, in order, with its gate (default; changes nothing)
//   node tools/release.mjs prepare  --execute --state <file> [--commands-changed]
//        merge master, sync-diag, catalogs (help, admin, news), npm run check, npm run build, the two bundles, then
//        validate the native and review receipts and that everything is committed
//   node tools/release.mjs source   --execute --state <file> --native-receipt <f> --review-receipt <f> --title "..." [--wait]
//        push the branch, open the PR to master, require green PR checks, merge it with a merge commit, record the merge sha
//   node tools/release.mjs publish  --execute --state <file> --hosting <hosting repo> --from <frozen checkout> --source-sha <sha>
//                                   --notes "..." [--pack-note folder="..."]... [--docs-only]
//        in hosting/minecraft: publish-packs (dry run, then real) from the explicit frozen merged checkout, pack-docs and its
//        check, check-site realm, then the hosting PR (merging it is the deploy)
//   node tools/release.mjs live     --execute --state <file> --hosting <hosting repo>
//        check-live (waits for the deploy, checks the live pages and every pack's latest .mcpack), then the summary
//
// What it never does: upload anything to the Realm (the owner imports the .mcpack files), pass --allow-dirty or any force
// flag, merge with admin rights, publish from a working tree, invent a native-test or review result (those are receipts a
// person or the lead writes: {schema: "release-evidence-v1", kind, sourceSha, result: "pass", artifacts, ...}), or reorder the
// source merge ahead of its checks. A step that fails stops the run; fix it and run the phase again.
//
// The plan's shorthand ("merge, catalogs, versions, sync-diag, build, publish, pack-docs, check-site") is the CLAUDE.md
// order spelled out: versions and sync-diag first, catalogs last, then check/build/native/review, then the source PR merge,
// and only then the publication from that merged commit.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

export const PHASES = ["plan", "prepare", "source", "publish", "live"];
export const EVIDENCE_SCHEMA = "release-evidence-v1";
const SHA = /^[0-9a-f]{40}$/;

export class UsageError extends Error {}

const OPTIONS = {
  execute: { type: "boolean", default: false },
  repo: { type: "string" },
  hosting: { type: "string" },
  from: { type: "string" },
  "source-sha": { type: "string" },
  pr: { type: "string" },
  title: { type: "string" },
  body: { type: "string" },
  notes: { type: "string" },
  "pack-note": { type: "string", multiple: true, default: [] },
  "native-receipt": { type: "string" },
  "review-receipt": { type: "string" },
  "skip-native": { type: "string" },
  "skip-review": { type: "string" },
  "commands-changed": { type: "boolean", default: false },
  "docs-only": { type: "boolean", default: false },
  state: { type: "string" },
  wait: { type: "boolean", default: false },
  help: { type: "boolean", short: "h", default: false },
};

/** @param {string[]} argv */
export function parseOptions(argv) {
  if (argv.some((a) => a === "--allow-dirty" || a.startsWith("--allow-dirty="))) {
    throw new UsageError("release.mjs never publishes from a dirty tree: commit everything, merge it to master, and pass that merged checkout with --from");
  }
  const phase = argv[0] && !argv[0].startsWith("-") ? argv[0] : "plan";
  const rest = phase === argv[0] ? argv.slice(1) : argv;
  if (!PHASES.includes(phase)) throw new UsageError(`unknown phase "${phase}" (${PHASES.join(", ")})`);
  let values;
  try {
    values = parseArgs({ args: rest, options: OPTIONS, allowPositionals: false }).values;
  } catch (e) {
    throw new UsageError(String(e.message));
  }
  const packNotes = new Map();
  for (const n of values["pack-note"]) {
    const i = n.indexOf("=");
    if (i <= 0 || !/^[a-z0-9_]+$/.test(n.slice(0, i)) || !n.slice(i + 1).trim()) throw new UsageError(`--pack-note wants folder="what changed for players" (got ${JSON.stringify(n)})`);
    packNotes.set(n.slice(0, i), n.slice(i + 1).trim());
  }
  return { phase, ...values, packNotes };
}

/** Why a receipt does not prove a pass for this commit; an empty list means it does. */
export function validateEvidence(receipt, { kind, sourceSha, exists = fs.existsSync }) {
  const problems = [];
  if (!receipt || typeof receipt !== "object") return ["the receipt is not a JSON object"];
  if (receipt.schema !== EVIDENCE_SCHEMA) problems.push(`schema is ${JSON.stringify(receipt.schema)}, not ${EVIDENCE_SCHEMA}`);
  if (receipt.kind !== kind) problems.push(`kind is ${JSON.stringify(receipt.kind)}, not ${kind}`);
  if (receipt.sourceSha !== sourceSha) problems.push(`it is for source ${receipt.sourceSha}, not the commit being shipped (${sourceSha})`);
  if (receipt.result !== "pass") problems.push(`result is ${JSON.stringify(receipt.result)}, not "pass"`);
  const artifacts = Array.isArray(receipt.artifacts) ? receipt.artifacts : [];
  if (!artifacts.length) problems.push("no artifacts (logs or reports) back the result");
  for (const a of artifacts) if (typeof a !== "string" || !path.isAbsolute(a) || !exists(a)) problems.push(`artifact is not an existing absolute path: ${JSON.stringify(a)}`);
  if (kind === "native" && !(Array.isArray(receipt.commands) && receipt.commands.length && receipt.commands.every((c) => typeof c === "string" && c.trim()))) problems.push("native receipts list the exact commands that ran");
  if (kind === "review" && !(typeof receipt.reviewer === "string" && receipt.reviewer.trim() && receipt.openFindings === 0)) problems.push("review receipts name the reviewer and say openFindings: 0");
  return problems;
}

/** What makes a checkout the frozen source of a publication. @param {{ ctx: any, from: string, sourceSha: string }} input */
export function frozenSourceProblems({ ctx, from, sourceSha }) {
  const problems = [];
  if (!from) return ["--from <merged checkout> is required (publishing never defaults to the working tree)"];
  if (!path.isAbsolute(from)) problems.push("--from must be an absolute path");
  if (!SHA.test(sourceSha ?? "")) problems.push("--source-sha must be the full 40-character merge commit of the source PR");
  if (problems.length) return problems;
  if (!ctx.exists(from)) return [`--from ${from} does not exist`];
  const head = ctx.git(["rev-parse", "HEAD"], from);
  if (head.status !== 0 || head.stdout.trim() !== sourceSha) problems.push(`${from} is at ${head.stdout.trim() || "an unknown commit"}, not the merged ${sourceSha}`);
  const dirty = ctx.git(["status", "--porcelain"], from);
  if (dirty.status !== 0 || dirty.stdout.trim()) problems.push(`${from} has uncommitted changes: a publication comes from a clean, merged checkout`);
  const merged = ctx.git(["merge-base", "--is-ancestor", sourceSha, "origin/master"], from);
  if (merged.status !== 0) problems.push(`${sourceSha} is not on origin/master of ${from} (fetch it, or merge the PR first)`);
  return problems;
}

const hostingTools = (opts) => path.join(opts.hosting ?? "<hosting>", "minecraft");
const node = (...args) => [process.execPath, ...args];

/**
 * Every step of the release in order. A step has an id, a phase, a title, what it changes ("none", "local", "remote") and
 * either an argv to run (in cwd) or a check that only reads. Steps that depend on facts found while running (the PR number,
 * the merge sha) read them from the state.
 */
export function buildPlan(opts, root) {
  const repo = opts.repo ?? root;
  const host = hostingTools(opts);
  const packNotes = [...opts.packNotes].flatMap(([folder, text]) => ["--pack-notes", `${folder}=${text}`]);
  const publish = (...extra) => node(path.join(host, "tools", "publish-packs.mjs"), "--from", opts.from ?? "<frozen merged checkout>", ...(opts.notes ? ["--notes", opts.notes] : []), ...packNotes, ...extra);
  /** @type {any[]} */
  const steps = [
    { id: "merge-master", phase: "prepare", title: "merge origin/master into the branch (merge, never rebase)", changes: "local", cwd: repo, argv: ["git", "fetch", "origin", "master"], then: ["git", "merge", "--no-edit", "origin/master"] },
    { id: "versions", phase: "prepare", title: "every changed pack has a higher version than origin/master (bump header.version first)", changes: "none", cwd: repo, argv: node("tools/check-versions.mjs") },
    { id: "sync-diag", phase: "prepare", title: "sync-diag after every version bump", changes: "local", cwd: repo, argv: node("tools/sync-diag.mjs") },
    { id: "catalog-help", phase: "prepare", title: "regenerate the /realm:help catalog (last, after every doc edit)", changes: "local", cwd: repo, argv: node("tools/help-catalog.mjs") },
    ...(opts["commands-changed"] ? [{ id: "catalog-admin", phase: "prepare", title: "regenerate the Realm Configuration menu (commands changed; bump admin_bp first)", changes: "local", cwd: repo, argv: node("tools/admin-catalog.mjs") }] : []),
    { id: "catalog-news", phase: "prepare", title: "refresh Realm News from docs/NEWS.md", changes: "local", cwd: repo, argv: node("tools/gen-news.mjs") },
    { id: "check", phase: "prepare", title: "npm run check", changes: "none", cwd: repo, argv: npm("run", "check") },
    { id: "build", phase: "prepare", title: "npm run build", changes: "local", cwd: repo, argv: npm("run", "build") },
    { id: "bundle-behavior", phase: "prepare", title: "build the Realm Bundle", changes: "local", cwd: repo, argv: npm("run", "bundle", "--", "--all") },
    { id: "bundle-resources", phase: "prepare", title: "build Realm Resources", changes: "local", cwd: repo, argv: npm("run", "bundle", "--", "--resources") },
    { id: "native", phase: "prepare", title: "native tests: a receipt for this commit (or an explicit --skip-native reason, recorded as NOT RUN)", changes: "none", gate: "native" },
    { id: "review", phase: "prepare", title: "review before the first publish: a receipt for this commit (or an explicit --skip-review reason)", changes: "none", gate: "review" },
    { id: "committed", phase: "prepare", title: "everything, regenerated files included, is committed", changes: "none", gate: "committed" },

    { id: "source-gates", phase: "source", title: "the checks, native and review evidence are on record for this exact commit", changes: "none", gate: "source-gates" },
    { id: "push", phase: "source", title: "push the branch (never forced)", changes: "remote", cwd: repo, gate: "push" },
    { id: "pr", phase: "source", title: "open the PR to master", changes: "remote", cwd: repo, gate: "pr" },
    { id: "ci", phase: "source", title: "the PR's checks (check, build, the Realm Bundle smoke test) are green", changes: "none", cwd: repo, gate: "ci" },
    { id: "merge", phase: "source", title: "merge the PR with a merge commit (no admin override), record the merge sha", changes: "remote", cwd: repo, gate: "merge" },

    { id: "frozen-source", phase: "publish", title: "--from is a clean checkout at the merged commit", changes: "none", gate: "frozen-source" },
    { id: "hosting-clean", phase: "publish", title: "the hosting checkout is clean and on an up-to-date master", changes: "none", gate: "hosting-clean" },
    ...(opts["docs-only"] ? [] : [
      { id: "publish-dry-run", phase: "publish", title: "publish-packs --dry-run from the frozen source", changes: "none", cwd: host, argv: publish("--dry-run"), gate: "notes" },
      { id: "publish", phase: "publish", title: "publish-packs from the frozen source (never --allow-dirty; an existing version is never overwritten)", changes: "local", cwd: host, argv: publish(), gate: "notes" },
    ]),
    { id: "pack-docs", phase: "publish", title: "pack-docs from the frozen source", changes: "local", cwd: host, argv: node(path.join(host, "tools", "pack-docs.mjs"), "--from", opts.from ?? "<frozen merged checkout>") },
    { id: "pack-docs-check", phase: "publish", title: "pack-docs --check", changes: "none", cwd: host, argv: node(path.join(host, "tools", "pack-docs.mjs"), "--from", opts.from ?? "<frozen merged checkout>", '--check') },
    { id: "check-site", phase: "publish", title: "check-site realm (a full run is only for site changes)", changes: "none", cwd: host, argv: node(path.join(host, "tools", "check-site.mjs"), "realm") },
    { id: "hosting-pr", phase: "publish", title: "commit the publication in hosting, open its PR, merge it (that merge is the deploy)", changes: "remote", cwd: opts.hosting, gate: "hosting-pr" },

    { id: "check-live", phase: "live", title: "check-live: waits for the deploy, checks the live pages, every pack's latest .mcpack and the realm page", changes: "none", cwd: host, argv: node(path.join(host, "tools", "check-live.mjs")), gate: "hosting-merged" },
    { id: "summary", phase: "live", title: "summary for the owner: numbers and the new .mcpack files (importing them into the Realm is the owner's step)", changes: "none", gate: "summary" },
  ];
  return steps;
}
function npm(...args) { return [process.platform === "win32" ? "npm.cmd" : "npm", ...args]; }

export function formatPlan(steps, opts) {
  const L = [`release plan (${opts.execute ? "executing" : "dry: nothing runs without --execute"})`];
  let phase = "";
  steps.forEach((s, i) => {
    if (s.phase !== phase) { phase = s.phase; L.push("", `[${phase}]`); }
    const show = (a) => (a === process.execPath ? "node" : /\s/.test(a) ? JSON.stringify(a) : a);
    const cmd = s.argv ? `\n      $ ${s.argv.map(show).join(" ")}${s.then ? `\n      $ ${s.then.join(" ")}` : ""}${s.cwd ? `   (in ${s.cwd})` : ""}` : "";
    L.push(`  ${String(i + 1).padStart(2)}. ${s.id}: ${s.title} [${s.changes}]${cmd}`);
  });
  return L.join("\n");
}

/** Reads and writes the run's state file (steps done, facts found). */
export function loadState(file, ctx) {
  if (!file) return { schema: "release-state-v1", steps: [], facts: {} };
  if (!ctx.exists(file)) return { schema: "release-state-v1", steps: [], facts: {} };
  return JSON.parse(ctx.read(file));
}
export function saveState(file, state, ctx) { if (file) ctx.write(file, JSON.stringify(state, null, 2)); }
const done = (state, id, sha) => state.steps.some((s) => s.id === id && s.ok && (sha === undefined || s.sha === sha));

/** The gate of a step: problems that stop it before it runs. */
export function gateProblems(step, { opts, ctx, state, head }) {
  const root = opts.repo ?? ctx.root;
  const p = [];
  switch (step.gate) {
    case "native":
    case "review": {
      const file = opts[`${step.gate}-receipt`], skip = opts[`skip-${step.gate}`];
      if (skip) { if (skip.trim().length < 12) p.push(`--skip-${step.gate} needs a real reason (12+ characters)`); break; }
      if (!file) { p.push(`--${step.gate}-receipt <file> is required (or --skip-${step.gate} "<reason>", which is recorded as NOT RUN)`); break; }
      if (!ctx.exists(file)) { p.push(`${file} does not exist`); break; }
      try { p.push(...validateEvidence(JSON.parse(ctx.read(file)), { kind: step.gate, sourceSha: head, exists: ctx.exists })); } catch (e) { p.push(`${file} is not valid JSON: ${e.message}`); }
      break;
    }
    case "committed": {
      const s = ctx.git(["status", "--porcelain"], root);
      if (s.status !== 0 || s.stdout.trim()) p.push("uncommitted changes (regenerated catalogs and bundles' sources included): commit them, then run prepare again");
      break;
    }
    case "source-gates": {
      if (!opts.state) p.push("--state <file> is required: it is the record that check and build passed for this commit");
      for (const id of ["merge-master", "sync-diag", "catalog-help", "catalog-news", "check", "build", "native", "review", "committed"]) if (!done(state, id, head)) p.push(`${id} is not recorded as passed for ${head}: run prepare --execute`);
      if (head && ctx.git(["status", "--porcelain"], root).stdout.trim()) p.push("the working tree changed since prepare");
      break;
    }
    case "push": {
      const b = ctx.git(["branch", "--show-current"], root).stdout.trim();
      if (!b || b === "master" || b === "main") p.push(`push from a feature branch, not ${b || "a detached HEAD"}`);
      break;
    }
    case "pr": if (!opts.title) p.push('--title "<one line>" is required to open the PR'); break;
    case "ci": case "merge": if (!state.facts.pr && !opts.pr) p.push("no PR on record (run the pr step, or pass --pr <number>)"); break;
    case "frozen-source": p.push(...frozenSourceProblems({ ctx, from: opts.from, sourceSha: opts["source-sha"] })); if (!state.facts.mergeSha) p.push("the source merge is not on record in --state (run the source phase)"); else if (opts["source-sha"] && state.facts.mergeSha !== opts["source-sha"]) p.push(`--source-sha ${opts["source-sha"]} is not the recorded merge ${state.facts.mergeSha}`); break;
    case "hosting-clean": {
      if (!opts.hosting || !ctx.exists(opts.hosting)) { p.push("--hosting <hosting checkout> is required"); break; }
      if (ctx.git(["status", "--porcelain"], opts.hosting).stdout.trim()) p.push(`${opts.hosting} has uncommitted changes`);
      const hostBranch = ctx.git(["branch", "--show-current"], opts.hosting).stdout.trim();
      if (hostBranch !== "master") p.push(`${opts.hosting} is on ${hostBranch || "a detached HEAD"}, not master`);
      const behind = ctx.git(["rev-list", "--count", "HEAD..origin/master"], opts.hosting);
      if (behind.status !== 0 || behind.stdout.trim() !== "0") p.push(`${opts.hosting} is behind origin/master (fetch and merge it first)`);
      break;
    }
    case "notes": if (!opts.notes || !opts.notes.trim()) p.push('--notes "<what changed in the Realm Bundle>" is required for a publication'); break;
    case "hosting-pr": if (!opts.hosting) p.push("--hosting is required"); if (!opts.title) p.push('--title "<one line>" is required for the hosting PR'); break;
    case "hosting-merged": if (!state.facts.hostingMerged) p.push("the hosting PR merge is not on record in --state (run the publish phase)"); break;
    default: break;
  }
  return p;
}

/** The default effects: real commands, no shell. Tests pass their own. */
export function realContext(root) {
  const run = (argv, cwd) => {
    const r = spawnSync(argv[0], argv.slice(1), { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, shell: process.platform === "win32" && /\.cmd$/i.test(argv[0]) });
    return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? (r.error ? String(r.error) : "") };
  };
  return {
    root,
    exists: fs.existsSync,
    read: (f) => fs.readFileSync(f, "utf8"),
    write: (f, t) => { fs.mkdirSync(path.dirname(path.resolve(f)), { recursive: true }); fs.writeFileSync(f, t); },
    run,
    git: (args, cwd) => run(["git", ...args], cwd),
    gh: (args, cwd) => run(["gh", ...args], cwd),
    now: () => new Date().toISOString(),
    print: (s) => console.log(s),
  };
}

/** Steps whose command is built from what earlier steps found. */
function dynamic(step, { opts, ctx, state, head }) {
  const root = opts.repo ?? ctx.root;
  switch (step.id) {
    case "push": {
      const b = ctx.git(["branch", "--show-current"], root).stdout.trim();
      return [{ argv: ["git", "push", "-u", "origin", b], cwd: root }];
    }
    case "pr": {
      const b = ctx.git(["branch", "--show-current"], root).stdout.trim();
      const found = ctx.gh(["pr", "list", "--head", b, "--base", "master", "--json", "number", "--jq", ".[0].number"], root);
      if (found.status === 0 && found.stdout.trim()) { state.facts.pr = Number(found.stdout.trim()); return []; }
      return [{ argv: ["gh", "pr", "create", "--base", "master", "--head", b, "--title", opts.title, "--body", opts.body ?? opts.title], cwd: root, after: () => {
        const n = ctx.gh(["pr", "view", b, "--json", "number", "--jq", ".number"], root);
        if (n.status === 0) state.facts.pr = Number(n.stdout.trim());
      } }];
    }
    case "ci": {
      const n = String(opts.pr ?? state.facts.pr);
      return [{ argv: ["gh", "pr", "checks", n, ...(opts.wait ? ["--watch", "--fail-fast"] : [])], cwd: root }];
    }
    case "merge": {
      const n = String(opts.pr ?? state.facts.pr);
      return [{ argv: ["gh", "pr", "merge", n, "--merge"], cwd: root, after: () => {
        const v = ctx.gh(["pr", "view", n, "--json", "state,mergeCommit", "--jq", '.state + " " + (.mergeCommit.oid // "")'], root);
        const [st, sha] = v.stdout.trim().split(" ");
        if (st !== "MERGED" || !SHA.test(sha ?? "")) throw new Error(`the PR is not merged (${v.stdout.trim() || v.stderr.trim()})`);
        state.facts.mergeSha = sha;
      } }];
    }
    case "hosting-pr": {
      const h = opts.hosting;
      const branch = `release/${ctx.now().replace(/[-:T]/g, "").slice(0, 12)}`;
      return [
        { argv: ["git", "checkout", "-b", branch], cwd: h },
        { argv: ["git", "add", "-A", "minecraft"], cwd: h },
        { argv: ["git", "commit", "-m", opts.title], cwd: h },
        { argv: ["git", "push", "-u", "origin", branch], cwd: h },
        { argv: ["gh", "pr", "create", "--base", "master", "--head", branch, "--title", opts.title, "--body", `Publishes the merged source ${opts["source-sha"]}. Merging deploys.`], cwd: h },
        { argv: ["gh", "pr", "merge", branch, "--merge"], cwd: h, after: () => { state.facts.hostingMerged = true; } },
      ];
    }
    case "summary": return [];
    default: return null;
  }
}

/**
 * Runs the steps of one phase in order, stopping at the first gate or command that fails. Returns { ok, ran, failed }.
 */
export function runPhase(phase, opts, ctx) {
  const root = opts.repo ?? ctx.root;
  const steps = buildPlan(opts, root).filter((s) => s.phase === phase);
  const state = loadState(opts.state, ctx);
  const headNow = () => ctx.git(["rev-parse", "HEAD"], root).stdout.trim();
  const record = (step, ok, extra = {}) => { state.steps.push({ id: step.id, at: ctx.now(), ok, sha: headNow(), ...extra }); saveState(opts.state, state, ctx); };
  const ran = [];
  if (phase === "source" || phase === "publish" || phase === "live") {
    if (!opts.state) return { ok: false, ran, failed: { id: phase, problems: ["--state <file> is required: later phases rely on what earlier ones recorded"] } };
  }
  for (const step of steps) {
    const head = headNow(); // a merge or a regenerated-and-committed file moves HEAD: evidence is judged against the current commit
    const problems = gateProblems(step, { opts, ctx, state, head });
    const skipped = (step.gate === "native" && opts["skip-native"] && !problems.length) || (step.gate === "review" && opts["skip-review"] && !problems.length);
    if (problems.length) { record(step, false, { problems }); return { ok: false, ran, failed: { id: step.id, problems } }; }
    if (skipped) {
      ctx.print(`[${step.id}] NOT RUN: ${opts[`skip-${step.gate}`]}`);
      record(step, true, { skipped: opts[`skip-${step.gate}`] });
      ran.push(step.id);
      continue;
    }
    const commands = step.gate ? dynamic(step, { opts, ctx, state, head }) : null;
    const list = commands ?? (step.argv ? [{ argv: step.argv, cwd: step.cwd }, ...(step.then ? [{ argv: step.then, cwd: step.cwd }] : [])] : []);
    for (const c of list) {
      ctx.print(`[${step.id}] $ ${c.argv.join(" ")}`);
      const r = ctx.run(c.argv, c.cwd);
      if (r.status !== 0) {
        record(step, false, { command: c.argv.join(" "), status: r.status, output: `${r.stdout}${r.stderr}`.slice(-2000) });
        return { ok: false, ran, failed: { id: step.id, problems: [`${c.argv.join(" ")} exited ${r.status}`, (r.stderr || r.stdout).trim().split("\n").slice(-6).join("\n")] } };
      }
      try { c.after?.(); } catch (e) { record(step, false, { problems: [e.message] }); return { ok: false, ran, failed: { id: step.id, problems: [e.message] } }; }
    }
    if (step.id === "summary") ctx.print(summaryText(opts, state));
    record(step, true);
    ran.push(step.id);
  }
  return { ok: true, ran, failed: null };
}

export function summaryText(opts, state) {
  const merge = state.facts.mergeSha ?? "(not recorded)";
  const skipped = state.steps.filter((s) => s.skipped).map((s) => `${s.id}: NOT RUN (${s.skipped})`);
  return ["", "release summary", `  source merge: ${merge}`, `  hosting merged: ${state.facts.hostingMerged ? "yes" : "no"}`, ...(skipped.length ? ["  not run: " + skipped.join("; ")] : []),
    "  The new .mcpack files are in hosting/minecraft/site/packs/ (see packs.json for versions and sizes); importing them into the Realm is the owner's step, this tool never uploads to it."].join("\n");
}

function main() {
  let opts;
  try {
    if (process.argv.includes("--help") || process.argv.includes("-h")) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 28).map((l) => l.replace(/^\/\/ ?/, "")).join("\n")); return; }
    opts = parseOptions(process.argv.slice(2));
  } catch (e) {
    if (e instanceof UsageError) { console.error(`release: ${e.message}`); process.exit(64); }
    throw e;
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const ctx = realContext(root);
  if (opts.phase === "plan" || !opts.execute) {
    const steps = buildPlan(opts, opts.repo ?? root).filter((s) => opts.phase === "plan" || s.phase === opts.phase);
    console.log(formatPlan(steps, opts));
    if (opts.phase !== "plan") console.log("\nNothing was run: add --execute.");
    return;
  }
  const r = runPhase(opts.phase, opts, ctx);
  if (!r.ok) {
    console.error(`\nrelease: stopped at ${r.failed.id}:\n  ${r.failed.problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`\nrelease: ${opts.phase} phase done (${r.ran.join(", ")})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
