#!/usr/bin/env node
// validate.yml's plan: which commit a merge's A/B pairs compare with. Not HEAD^1: when merges land faster than one
// validation, GitHub cancels the queued runs, and HEAD^1 then hides whatever the skipped merges changed (PIPE-06). The
// base is the newest master commit whose push validation finished (success or failure, not canceled) and is an
// ancestor of HEAD; HEAD^1 when there is none. The report says how many commits the pair spans.
//   node tools/test-bds/lib/validate-base.mjs --runs <runs.json> --head <sha>   (prints { base, from, span } as JSON)
// <runs.json> is `gh api repos/<repo>/actions/workflows/validate.yml/runs?branch=master&event=push&status=completed`.
// It also answers the nightly memory soak (--memory): the newest finished scheduled run whose memory-40-head artifact
// can serve as this night's base, so the base tree is not soaked again (PIPE-24).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

/**
 * The newest finished (not canceled) run's commit that is an ancestor of head and is not head itself.
 * @param {{ head_sha: string, conclusion: string | null, status?: string, created_at?: string }[]} runs
 * @param {string} head
 * @param {(sha: string) => boolean} isAncestor whether sha is an ancestor of head
 * @returns {string | null}
 */
export function chooseBase(runs, head, isAncestor) {
  const finished = runs
    .filter((r) => r && r.head_sha && r.head_sha !== head && (r.status === undefined || r.status === "completed") && (r.conclusion === "success" || r.conclusion === "failure"))
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  for (const r of finished) if (isAncestor(r.head_sha)) return r.head_sha;
  return null;
}

/**
 * The newest finished scheduled run (the nightly memory soak) with its head commit, or null.
 * @param {{ id: number, head_sha: string, conclusion: string | null, event?: string, created_at?: string }[]} runs
 */
export function previousNightly(runs) {
  return runs
    .filter((r) => r && (r.event === undefined || r.event === "schedule") && (r.conclusion === "success" || r.conclusion === "failure"))
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))[0] ?? null;
}

function git(/** @type {string[]} */ ...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function main() {
  const { values: a } = parseArgs({ options: { runs: { type: "string" }, head: { type: "string", default: "HEAD" }, memory: { type: "boolean", default: false } } });
  let runs = [];
  try { runs = JSON.parse(fs.readFileSync(String(a.runs), "utf8")).workflow_runs ?? []; } catch { runs = []; }
  const head = git("rev-parse", a.head);
  if (a.memory) {
    const prev = previousNightly(runs);
    console.log(JSON.stringify(prev ? { run: prev.id, base: prev.head_sha, same: prev.head_sha === head } : { run: null, base: null, same: false }));
    return;
  }
  const isAncestor = (/** @type {string} */ sha) => {
    try { execFileSync("git", ["merge-base", "--is-ancestor", sha, head], { stdio: "ignore" }); return true; } catch { return false; }
  };
  const chosen = chooseBase(runs, head, isAncestor);
  const base = chosen ?? git("rev-parse", `${head}^1`);
  const span = Number(git("rev-list", "--first-parent", "--count", `${base}..${head}`)) || 1;
  console.log(JSON.stringify({ base, from: chosen ? "last finished validation" : "first parent", span }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
