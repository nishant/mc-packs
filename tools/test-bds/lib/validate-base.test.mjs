// validate.yml's base for a merge's A/B pairs (PIPE-06) and the nightly memory soak's reused base (PIPE-24), and the
// suite's hard time limit per scenario (PIPE-16).
import assert from "node:assert/strict";
import test from "node:test";
import { chooseBase, previousNightly } from "./validate-base.mjs";
import { hardLimitSeconds } from "./suite-limits.mjs";

const run = (sha, conclusion, at) => ({ head_sha: sha, conclusion, status: "completed", created_at: at });

test("the base is the newest finished validation's commit, skipping canceled runs and non-ancestors", () => {
  const runs = [
    run("c3", "cancelled", "2026-11-14T03:00:00Z"), // queued behind c2, canceled by the next merge
    run("x9", "success", "2026-11-14T02:30:00Z"), // a commit not on this line (force-pushed away)
    run("c2", "failure", "2026-11-14T02:00:00Z"), // finished red: still measured
    run("c1", "success", "2026-11-14T01:00:00Z"),
  ];
  const ancestors = new Set(["c1", "c2", "c3"]);
  assert.equal(chooseBase(runs, "c4", (s) => ancestors.has(s)), "c2");
  assert.equal(chooseBase(runs, "c2", (s) => s === "c1"), "c1", "never the head itself");
  assert.equal(chooseBase([run("c3", "cancelled", "x")], "c4", () => true), null, "nothing finished: the caller uses HEAD^1");
  assert.equal(chooseBase([], "c4", () => true), null);
});

test("the nightly memory soak reuses the newest finished scheduled run", () => {
  const runs = [
    { id: 3, head_sha: "n3", conclusion: "cancelled", event: "schedule", created_at: "2026-11-14" },
    { id: 2, head_sha: "n2", conclusion: "failure", event: "schedule", created_at: "2026-11-13" },
    { id: 1, head_sha: "n1", conclusion: "success", event: "schedule", created_at: "2026-11-12" },
  ];
  assert.deepEqual(previousNightly(runs), runs[1]);
  assert.equal(previousNightly([]), null);
});

test("a scenario is killed at 3x its usual seconds (300 s at least), never later than its header asks", () => {
  assert.equal(hardLimitSeconds(30000, 300), 900, "town-breed-soak's 30,000 s header, usually 5 minutes");
  assert.equal(hardLimitSeconds(9000, 962), 2886);
  assert.equal(hardLimitSeconds(180, 20), 300, "the header's 300 s is the cap");
  assert.equal(hardLimitSeconds(600, 20), 300, "300 s at least");
  assert.equal(hardLimitSeconds(600, undefined), 720, "no usual time: the header plus 120 s");
});
