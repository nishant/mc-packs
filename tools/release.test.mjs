import assert from "node:assert/strict";
import { test } from "node:test";
import { EVIDENCE_SCHEMA, UsageError, buildPlan, formatPlan, frozenSourceProblems, parseOptions, runPhase, summaryText, validateEvidence } from "./release.mjs";

const HEAD = "a".repeat(40);
const MERGE = "b".repeat(40);
const ROOT = "/repo";
const HOST = "/hosting";
const FROM = "/frozen/mc-packs";

/** Scripted effects: records every command, answers the git/gh questions a release asks. */
function fakeCtx({ head = HEAD, dirty = false, failOn = null, behind = "0", hostBranch = "master", prExists = false, merged = true, files = {} } = {}) {
  const ran = [];
  const existing = new Set(["/native.json", "/review.json", "/log/native.log", "/log/review.md", FROM, HOST, ROOT]);
  const answer = (argv, cwd) => {
    const cmd = argv.join(" ");
    ran.push({ cmd, cwd });
    if (failOn && cmd.includes(failOn)) return { status: 1, stdout: "", stderr: `${failOn} failed` };
    if (cmd === "git rev-parse HEAD") return { status: 0, stdout: cwd === FROM ? MERGE : `${head}\n`, stderr: "" };
    if (cmd === "git status --porcelain") return { status: 0, stdout: dirty ? " M packs/a_bp/manifest.json\n" : "", stderr: "" };
    if (cmd === "git branch --show-current") return { status: 0, stdout: cwd === HOST ? `${hostBranch}\n` : "audit-w12a\n", stderr: "" };
    if (cmd.startsWith("git rev-list --count")) return { status: 0, stdout: `${behind}\n`, stderr: "" };
    if (cmd.startsWith("git merge-base --is-ancestor")) return { status: merged ? 0 : 1, stdout: "", stderr: "" };
    if (cmd.startsWith("gh pr list")) return { status: 0, stdout: prExists ? "42\n" : "", stderr: "" };
    if (cmd.startsWith("gh pr view audit-w12a --json number")) return { status: 0, stdout: "42\n", stderr: "" };
    if (cmd.startsWith("gh pr view 42 --json state,mergeCommit")) return { status: 0, stdout: `MERGED ${MERGE}\n`, stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  const ctx = {
    root: ROOT,
    exists: (p) => existing.has(p) || p in files,
    read: (p) => files[p],
    write: (p, t) => { files[p] = t; },
    run: answer,
    git: (args, cwd) => answer(["git", ...args], cwd),
    gh: (args, cwd) => answer(["gh", ...args], cwd),
    now: () => "2026-10-19T12:34:56.000Z",
    print: () => {},
  };
  return { ctx, ran, files, commands: () => ran.map((r) => r.cmd).filter((c) => !/^git (rev-parse|status|branch|rev-list|merge-base)|^gh pr (list|view)/.test(c)) };
}

const receipt = (kind, extra = {}) => JSON.stringify({ schema: EVIDENCE_SCHEMA, kind, sourceSha: HEAD, result: "pass", artifacts: ["/log/native.log"], ...(kind === "native" ? { commands: ["node tools/test-bds/suite.mjs --filter x"] } : { reviewer: "lead", openFindings: 0 }), ...extra });
const withReceipts = (files, extra = {}) => { files["/native.json"] = receipt("native", extra.native); files["/review.json"] = receipt("review", extra.review); return files; };
const prepareArgs = ["prepare", "--execute", "--repo", ROOT, "--state", "/state.json", "--native-receipt", "/native.json", "--review-receipt", "/review.json"];

test("never accepts --allow-dirty, unknown phases or options, or a malformed pack note", () => {
  assert.throws(() => parseOptions(["publish", "--allow-dirty"]), (e) => e instanceof UsageError && /never publishes from a dirty tree/.test(e.message));
  assert.throws(() => parseOptions(["ship"]), /unknown phase/);
  assert.throws(() => parseOptions(["plan", "--force-upload"]), UsageError);
  assert.throws(() => parseOptions(["publish", "--pack-note", "no equals sign"]), /--pack-note wants folder=/);
  assert.equal(parseOptions([]).phase, "plan");
  assert.equal(parseOptions(["publish", "--pack-note", 'maps_bp=Fewer "stuck" hunts']).packNotes.get("maps_bp"), 'Fewer "stuck" hunts');
});

test("the plan follows CLAUDE.md's ship order: versions, sync, catalogs, checks, evidence, source merge, then publication", () => {
  const opts = parseOptions(["plan", "--hosting", HOST, "--from", FROM, "--notes", "n", "--commands-changed"]);
  const ids = buildPlan(opts, ROOT).map((s) => s.id);
  const order = ["merge-master", "versions", "sync-diag", "catalog-help", "catalog-admin", "catalog-news", "check", "build", "bundle-behavior", "bundle-resources", "native", "review", "committed",
    "source-gates", "push", "pr", "ci", "merge", "frozen-source", "hosting-clean", "publish-dry-run", "publish", "pack-docs", "pack-docs-check", "check-site", "hosting-pr", "check-live", "summary"];
  assert.deepEqual(ids, order);
  assert.ok(!buildPlan(parseOptions(["plan"]), ROOT).some((s) => s.id === "catalog-admin"), "the admin menu is regenerated only when commands changed");
  const plan = formatPlan(buildPlan(opts, ROOT), opts);
  assert.match(plan, /dry: nothing runs without --execute/);
  const argv = buildPlan(opts, ROOT).flatMap((s) => [...(s.argv ?? []), ...(s.then ?? [])]).join(" ");
  for (const bad of ["--allow-dirty", "--force", "--admin", "upload", "import"]) assert.ok(!argv.includes(bad), bad);
  const docsOnly = buildPlan(parseOptions(["plan", "--docs-only", "--hosting", HOST, "--from", FROM]), ROOT).map((s) => s.id);
  assert.ok(!docsOnly.includes("publish") && !docsOnly.includes("publish-dry-run"));
  assert.ok(docsOnly.includes("pack-docs") && docsOnly.includes("check-site"), "docs-only still regenerates the realm page");
});

test("native and review receipts must prove a pass for this exact commit", () => {
  const exists = (p) => p === "/log/native.log";
  const good = JSON.parse(receipt("native"));
  assert.deepEqual(validateEvidence(good, { kind: "native", sourceSha: HEAD, exists }), []);
  assert.match(validateEvidence({ ...good, sourceSha: MERGE }, { kind: "native", sourceSha: HEAD, exists }).join("\n"), /not the commit being shipped/);
  assert.match(validateEvidence({ ...good, result: "fail" }, { kind: "native", sourceSha: HEAD, exists }).join("\n"), /not "pass"/);
  assert.match(validateEvidence({ ...good, artifacts: [] }, { kind: "native", sourceSha: HEAD, exists }).join("\n"), /no artifacts/);
  assert.match(validateEvidence({ ...good, artifacts: ["relative.log"] }, { kind: "native", sourceSha: HEAD, exists }).join("\n"), /existing absolute path/);
  assert.match(validateEvidence({ ...good, commands: [] }, { kind: "native", sourceSha: HEAD, exists }).join("\n"), /exact commands/);
  assert.match(validateEvidence({ ...good, schema: "x" }, { kind: "native", sourceSha: HEAD, exists }).join("\n"), /schema/);
  assert.match(validateEvidence({ ...JSON.parse(receipt("review")), openFindings: 2 }, { kind: "review", sourceSha: HEAD, exists }).join("\n"), /openFindings: 0/);
  assert.match(validateEvidence(good, { kind: "review", sourceSha: HEAD, exists }).join("\n"), /kind is "native", not review/);
});

test("prepare runs the commands in ship order and stops at the first failure", () => {
  const ok = fakeCtx({ files: withReceipts({}) });
  const r = runPhase("prepare", parseOptions(prepareArgs), ok.ctx);
  assert.equal(r.ok, true, JSON.stringify(r.failed));
  const cmds = ok.commands().map((c) => c.replace(/^\S*node\S*\s/, "node "));
  const at = (s) => cmds.findIndex((c) => c.includes(s));
  assert.ok(at("check-versions") < at("sync-diag") && at("sync-diag") < at("help-catalog") && at("help-catalog") < at("gen-news"));
  assert.ok(at("gen-news") < at("run check") && at("run check") < at("run build") && at("run build") < at("--all") && at("--all") < at("--resources"));
  assert.ok(cmds[0].startsWith("git fetch origin master") && cmds[1] === "git merge --no-edit origin/master", "master is merged, never rebased");
  assert.equal(cmds.some((c) => /rebase|push|--force/.test(c)), false);
  const saved = JSON.parse(ok.files["/state.json"]);
  assert.ok(["check", "build", "native", "review", "committed"].every((id) => saved.steps.some((s) => s.id === id && s.ok && s.sha === HEAD)));

  const broken = fakeCtx({ files: withReceipts({}), failOn: "run check" });
  const bad = runPhase("prepare", parseOptions(prepareArgs), broken.ctx);
  assert.equal(bad.ok, false);
  assert.equal(bad.failed.id, "check");
  assert.equal(broken.commands().some((c) => c.includes("run build")), false, "build does not run after a failed check");
  assert.equal(JSON.parse(broken.files["/state.json"]).steps.at(-1).ok, false, "the failure is on record");
});

test("prepare refuses stale, failing or missing evidence and uncommitted regenerated files; a skip is recorded as NOT RUN", () => {
  const stale = fakeCtx({ files: withReceipts({}, { native: { sourceSha: MERGE } }) });
  assert.match(runPhase("prepare", parseOptions(prepareArgs), stale.ctx).failed.problems.join("\n"), /not the commit being shipped/);
  const none = fakeCtx({ files: {} });
  assert.match(runPhase("prepare", parseOptions(prepareArgs.filter((a) => a !== "--native-receipt" && a !== "/native.json")), none.ctx).failed.problems.join("\n"), /--native-receipt <file> is required \(or --skip-native/);
  const dirty = fakeCtx({ files: withReceipts({}), dirty: true });
  const d = runPhase("prepare", parseOptions(prepareArgs), dirty.ctx);
  assert.equal(d.failed.id, "committed");
  assert.match(d.failed.problems[0], /uncommitted changes/);

  const skip = fakeCtx({ files: { "/review.json": receipt("review") } });
  const args = prepareArgs.filter((a) => a !== "--native-receipt" && a !== "/native.json").concat(["--skip-native", "no gameplay change: docs and tools only"]);
  const r = runPhase("prepare", parseOptions(args), skip.ctx);
  assert.equal(r.ok, true, JSON.stringify(r.failed));
  const state = JSON.parse(skip.files["/state.json"]);
  assert.equal(state.steps.find((s) => s.id === "native").skipped, "no gameplay change: docs and tools only");
  assert.match(summaryText({}, state), /native: NOT RUN \(no gameplay change/);
  assert.match(runPhase("prepare", parseOptions(prepareArgs.filter((a) => a !== "--native-receipt" && a !== "/native.json").concat(["--skip-native", "short"])), fakeCtx({ files: {} }).ctx).failed.problems.join(""), /needs a real reason/);
});

test("the source merge needs the recorded checks, never runs before them, and records the merge sha", () => {
  const ctx0 = fakeCtx({ files: withReceipts({}) });
  const srcArgs = ["source", "--execute", "--repo", ROOT, "--state", "/state.json", "--title", "Ship it", "--native-receipt", "/native.json", "--review-receipt", "/review.json"];
  const early = runPhase("source", parseOptions(srcArgs), ctx0.ctx);
  assert.equal(early.failed.id, "source-gates");
  assert.match(early.failed.problems.join("\n"), /check is not recorded as passed for a{40}: run prepare --execute/);
  assert.deepEqual(ctx0.commands(), [], "nothing was pushed, opened or merged");
  assert.equal(runPhase("source", parseOptions(["source", "--execute", "--repo", ROOT]), ctx0.ctx).failed.problems[0].includes("--state"), true);

  const full = fakeCtx({ files: withReceipts({}) });
  assert.equal(runPhase("prepare", parseOptions(prepareArgs), full.ctx).ok, true);
  full.ran.length = 0;
  const r = runPhase("source", parseOptions(srcArgs), full.ctx);
  assert.equal(r.ok, true, JSON.stringify(r.failed));
  const cmds = full.commands();
  assert.deepEqual(cmds.map((c) => c.split(" ").slice(0, 3).join(" ")), ["git push -u", "gh pr create", "gh pr checks", "gh pr merge"]);
  assert.ok(cmds[3].endsWith("pr merge 42 --merge"), cmds[3]);
  assert.equal(cmds.some((c) => /--admin|--force|--auto/.test(c)), false);
  assert.equal(JSON.parse(full.files["/state.json"]).facts.mergeSha, MERGE);

  const red = fakeCtx({ files: withReceipts({}) });
  runPhase("prepare", parseOptions(prepareArgs), red.ctx);
  red.ran.length = 0;
  const failing = fakeCtx({ files: red.files, failOn: "gh pr checks" });
  const f = runPhase("source", parseOptions(srcArgs), failing.ctx);
  assert.equal(f.failed.id, "ci");
  assert.equal(failing.commands().some((c) => c.includes("pr merge")), false, "a red PR is never merged");
});

test("publication needs the merged, clean, explicit frozen checkout, dry-runs first, and never passes --allow-dirty", () => {
  const ctx = fakeCtx();
  assert.deepEqual(frozenSourceProblems({ ctx: ctx.ctx, from: FROM, sourceSha: MERGE }), []);
  assert.match(frozenSourceProblems({ ctx: ctx.ctx, from: "", sourceSha: MERGE }).join(), /never defaults to the working tree/);
  assert.match(frozenSourceProblems({ ctx: ctx.ctx, from: "relative/dir", sourceSha: MERGE }).join(), /absolute path/);
  assert.match(frozenSourceProblems({ ctx: ctx.ctx, from: FROM, sourceSha: "abc" }).join(), /40-character/);
  assert.match(frozenSourceProblems({ ctx: ctx.ctx, from: FROM, sourceSha: "c".repeat(40) }).join(), /not the merged/);
  assert.match(frozenSourceProblems({ ctx: fakeCtx({ dirty: true }).ctx, from: FROM, sourceSha: MERGE }).join(), /uncommitted changes/);
  assert.match(frozenSourceProblems({ ctx: fakeCtx({ merged: false }).ctx, from: FROM, sourceSha: MERGE }).join(), /not on origin\/master/);

  const files = { "/state.json": JSON.stringify({ schema: "release-state-v1", steps: [], facts: { mergeSha: MERGE, pr: 42 } }) };
  const pub = fakeCtx({ files });
  const args = ["publish", "--execute", "--repo", ROOT, "--state", "/state.json", "--hosting", HOST, "--from", FROM, "--source-sha", MERGE, "--notes", "Fixes the softlock", "--pack-note", "saga_bp=Softlock fixed", "--title", "Publish the softlock fix"];
  const r = runPhase("publish", parseOptions(args), pub.ctx);
  assert.equal(r.ok, true, JSON.stringify(r.failed));
  const cmds = pub.commands();
  const dry = cmds.findIndex((c) => c.includes("publish-packs") && c.includes("--dry-run"));
  const real = cmds.findIndex((c) => c.includes("publish-packs") && !c.includes("--dry-run"));
  assert.ok(dry >= 0 && real > dry, "dry run before the real publication");
  assert.match(cmds[real], /--from \/frozen\/mc-packs --notes Fixes the softlock --pack-notes saga_bp=Softlock fixed$/);
  assert.equal(cmds.some((c) => /--allow-dirty|upload/.test(c)), false);
  const order = ["publish-packs", "pack-docs", "--check", "check-site", "git checkout -b release/", "pr create", "pr merge"].map((s) => cmds.findIndex((c, i) => i >= 0 && c.includes(s)));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "publish, pack-docs, its check, check-site, then the hosting PR");
  assert.equal(JSON.parse(pub.files["/state.json"]).facts.hostingMerged, true);

  const wrong = fakeCtx({ files: { "/state.json": JSON.stringify({ steps: [], facts: { mergeSha: "d".repeat(40) } }) } });
  assert.match(runPhase("publish", parseOptions(args), wrong.ctx).failed.problems.join("\n"), /is not the recorded merge/);
  assert.equal(wrong.commands().some((c) => c.includes("publish-packs")), false);
  const noNotes = fakeCtx({ files });
  assert.match(runPhase("publish", parseOptions(args.filter((a) => a !== "--notes" && a !== "Fixes the softlock")), noNotes.ctx).failed.problems.join(), /--notes/);
  const behind = fakeCtx({ files, behind: "3" });
  assert.match(runPhase("publish", parseOptions(args), behind.ctx).failed.problems.join(), /behind origin\/master/);
});

test("check-live waits for a recorded hosting merge and the summary never uploads to the Realm", () => {
  const early = fakeCtx({ files: { "/state.json": JSON.stringify({ steps: [], facts: { mergeSha: MERGE } }) } });
  const live = ["live", "--execute", "--repo", ROOT, "--state", "/state.json", "--hosting", HOST];
  assert.match(runPhase("live", parseOptions(live), early.ctx).failed.problems.join(), /hosting PR merge is not on record/);
  assert.equal(early.commands().length, 0);
  const ok = fakeCtx({ files: { "/state.json": JSON.stringify({ steps: [], facts: { mergeSha: MERGE, hostingMerged: true } }) } });
  const printed = [];
  ok.ctx.print = (s) => printed.push(s);
  assert.equal(runPhase("live", parseOptions(live), ok.ctx).ok, true);
  assert.match(ok.commands().join("\n"), /check-live\.mjs/);
  assert.match(printed.join("\n"), /importing them into the Realm is the owner's step, this tool never uploads/);
});
