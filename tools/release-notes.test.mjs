import assert from "node:assert/strict";
import { test } from "node:test";
import { checkReleaseNotes, cmpVersion, kindOf, shapeProblems, versionOf } from "./release-notes.mjs";
import { parseReport, publishArgs, summaryMarkdown } from "./ci-release.mjs";

/** @param {Partial<{ folder: string, kind: "behavior" | "resources", before: string, now: string }>} p */
const pack = (p) => ({ folder: "guard_bp", kind: /** @type {"behavior"} */ ("behavior"), before: "1.0.0", now: "1.0.0", ...p });

test("versions and kinds come from the manifest text", () => {
  assert.equal(versionOf(JSON.stringify({ header: { version: [1, 4, 10] } })), "1.4.10");
  assert.equal(versionOf("not json"), undefined);
  assert.equal(versionOf(undefined), undefined);
  assert.equal(kindOf(JSON.stringify({ modules: [{ type: "resources" }] })), "resources");
  assert.equal(kindOf(JSON.stringify({ modules: [{ type: "script" }] })), "behavior");
  assert.ok(cmpVersion("1.4.10", "1.4.9") > 0);
  assert.equal(cmpVersion("1.0", "1.0.0"), 0);
});

test("nothing went up: no notes needed, even without the file", () => {
  assert.deepEqual(checkReleaseNotes({ file: undefined, packs: [pack({})] }), []);
  assert.deepEqual(checkReleaseNotes({ file: { notes: [] }, packs: [pack({})] }), []);
});

test("a missing file fails once a pack went up", () => {
  const p = checkReleaseNotes({ file: undefined, packs: [pack({ now: "1.0.1" })] });
  assert.equal(p.length, 1);
  assert.match(p[0], /missing.*guard_bp/);
});

test("a bumped pack needs notes for exactly its new version, and the bundle a new line", () => {
  const packs = [pack({ now: "1.0.1" })];
  const none = checkReleaseNotes({ file: { notes: ["old"] }, baseFile: { notes: ["old"] }, packs });
  assert.equal(none.length, 2);
  assert.match(none[0], /packNotes\.guard_bp/);
  assert.match(none[1], /Realm Bundle/);
  const ok = { notes: ["old", "Zones can be renamed."], packNotes: { guard_bp: { version: "1.0.1", notes: "Zones can be renamed." } } };
  assert.deepEqual(checkReleaseNotes({ file: ok, baseFile: { notes: ["old"] }, packs }), []);
  const wrong = { ...ok, packNotes: { guard_bp: { version: "1.0.0", notes: "x" } } };
  assert.ok(checkReleaseNotes({ file: wrong, baseFile: { notes: ["old"] }, packs }).some((x) => /describes 1\.0\.0 but the pack is at 1\.0\.1/.test(x)));
});

test("stale or unknown pack entries fail; current ones for unchanged packs pass", () => {
  const packs = [pack({ before: "1.0.1", now: "1.0.1" })];
  assert.deepEqual(checkReleaseNotes({ file: { packNotes: { guard_bp: { version: "1.0.1", notes: ["a", "b"] } } }, packs }), []);
  assert.match(checkReleaseNotes({ file: { packNotes: { guard_bp: { version: "1.0.0", notes: "a" } } }, packs })[0], /update the entry for 1\.0\.1 or remove it/);
  assert.match(checkReleaseNotes({ file: { packNotes: { nope_bp: { version: "1.0.0", notes: "a" } } }, packs })[0], /no pack folder/);
});

test("help_bp, news_bp and brand-new packs need no pack notes, but they still change the bundle", () => {
  const packs = [pack({ folder: "help_bp", now: "1.0.1" }), pack({ folder: "news_bp", now: "1.0.1" }), pack({ folder: "new_bp", before: undefined, now: "1.0.0" })];
  const p = checkReleaseNotes({ file: { notes: [] }, packs });
  assert.equal(p.length, 1);
  assert.match(p[0], /Realm Bundle/);
  assert.deepEqual(checkReleaseNotes({ file: { notes: ["New pack: Fireflies."] }, packs }), []);
});

test("a resource pack needs a new resourceNotes line, or a new notes line without resourceNotes", () => {
  const packs = [pack({ folder: "rain_rp", kind: "resources", now: "1.0.1" })];
  const pn = { rain_rp: { version: "1.0.1", notes: "Softer rain." } };
  assert.deepEqual(checkReleaseNotes({ file: { notes: ["Softer rain."], packNotes: pn }, baseFile: { notes: [] }, packs }), []);
  assert.match(checkReleaseNotes({ file: { notes: ["Softer rain."], resourceNotes: ["old"], packNotes: pn }, baseFile: { resourceNotes: ["old"] }, packs })[0], /Realm Resources/);
  assert.deepEqual(checkReleaseNotes({ file: { notes: [], resourceNotes: ["old", "Softer rain."], packNotes: pn }, baseFile: { resourceNotes: ["old"] }, packs }), []);
});

test("shape problems are reported before anything else", () => {
  assert.match(shapeProblems([])[0], /JSON object/);
  assert.match(shapeProblems({ note: [] })[0], /unknown key "note"/);
  assert.match(shapeProblems({ notes: "one line" })[0], /list of non-empty strings/);
  assert.match(shapeProblems({ packNotes: { guard_bp: "text" } })[0], /needs "version"/);
  assert.match(shapeProblems({ packNotes: { guard_bp: { version: "1.0.1" } } })[0], /needs "notes"/);
  assert.deepEqual(shapeProblems({ notes: ["a"], resourceNotes: ["b"], packNotes: { guard_bp: { version: "1.0.1", notes: ["c"] } } }), []);
});

const PUBLISHED = {
  packs: [
    { slug: "realm-bundle", versions: [{ version: "2026.1020.1738", notes: ["Old bundle line."] }, { version: "2026.1019.1", notes: ["Older line."] }] },
    { slug: "realm-resources", versions: [{ version: "2026.1020.532", notes: ["Old resource line."] }] },
    { slug: "creeper-guard", folder: "guard_bp", versions: [{ version: "1.4.9", notes: ["x"] }] },
    { slug: "rain", folder: "rain_rp", versions: [{ version: "1.0.0", notes: ["y"] }] },
  ],
};

test("CI passes only lines no published version has, and pack notes only for the current unpublished version", () => {
  const notes = {
    notes: ["Older line.", "Old bundle line.", "Zones can be renamed."],
    resourceNotes: ["Old resource line.", "Softer rain."],
    packNotes: {
      guard_bp: { version: "1.4.10", notes: ["Zones can be renamed.", "Faster checks."] },
      rain_rp: { version: "1.0.0", notes: "already out" },
      gone_bp: { version: "1.0.0", notes: "stale" },
    },
  };
  const current = new Map([["guard_bp", "1.4.10"], ["rain_rp", "1.0.0"], ["gone_bp", "1.0.1"]]);
  const { args, used } = publishArgs(notes, PUBLISHED, current);
  assert.deepEqual(args, ["--notes", "Zones can be renamed.", "--resource-notes", "Softer rain.", "--pack-notes", "guard_bp=Zones can be renamed.", "--pack-notes", "guard_bp=Faster checks."]);
  assert.equal(used.length, 4);
  assert.deepEqual(publishArgs(undefined, PUBLISHED, current).args, []);
  // a pack entry for a version the site doesn't know yet, of a pack it doesn't know yet
  assert.deepEqual(publishArgs({ packNotes: { new_bp: { version: "1.0.0", notes: "Hello." } } }, PUBLISHED, new Map([["new_bp", "1.0.0"]])).args, ["--pack-notes", "new_bp=Hello."]);
});

test("publish-packs' report is read back row by row", () => {
  const out = ["realm-bundle      2026.1021.0900 new (was 2026.1020.1738)", "realm-resources   2026.1020.532  unchanged", "creeper-guard     1.4.10         new (was 1.4.9)", "fireflies         1.0.0          new", "3 new versions published in site/packs/. Next: ..."].join("\n");
  const rows = parseReport(out);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], { slug: "realm-bundle", version: "2026.1021.0900", what: "new (was 2026.1020.1738)" });
  assert.equal(rows.filter((r) => r.what !== "unchanged").length, 3);
});

test("the summary names the versions, the PR and the live result", () => {
  const md = summaryMarkdown({ sourceSha: "abcdef1234", rows: [{ slug: "creeper-guard", version: "1.4.10", what: "new (was 1.4.9)" }], used: [["guard_bp 1.4.10", "Zones."]], bundle: "2026.1021.0900", resources: "2026.1020.532", pr: "https://github.com/nishant/hosting/pull/1", merged: true, changed: true, live: "passed" });
  assert.match(md, /mc-packs abcdef1/);
  assert.match(md, /\| creeper-guard \| 1\.4\.10 \|/);
  assert.match(md, /pull\/1 \(merged: deploying\)/);
  assert.match(md, /Realm Bundle 2026\.1021\.0900 and Realm Resources 2026\.1020\.532 are live/);
  const quiet = summaryMarkdown({ rows: [{ slug: "realm-bundle", version: "1", what: "unchanged" }], used: [], changed: false });
  assert.match(quiet, /Nothing new to publish/);
  assert.match(quiet, /no hosting PR/);
  const failed = summaryMarkdown({ rows: [], used: [], changed: false, failed: { step: "publish-packs", output: "error: Realm Bundle changed: say what changed" } });
  assert.match(failed, /Failed at publish-packs/);
  assert.doesNotMatch(failed, /are live/);
});
