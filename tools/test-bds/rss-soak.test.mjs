// rss-soak.mjs's verdict on a memory soak (O4): growth that goes on in the second half is "growing", growth that stops
// is "leveled", and a run under 30 minutes after the warm-up gets no verdict.
import assert from "node:assert/strict";
import test from "node:test";
import { mainPid, summarize } from "./rss-soak.mjs";

const series = (seconds, f) => Array.from({ length: Math.floor(seconds / 5) + 1 }, (_, i) => ({ t: i * 5, rssMiB: f(i * 5) }));

test("steady growth for an hour is growing", () => {
  const s = summarize(series(3600, (t) => 1400 + (t / 60) * 3.7));
  assert.equal(s.verdict, "growing");
  assert.ok(Math.abs(s.slopeSecondHalf - 3.7) < 0.01);
  assert.equal(s.bins.length, 6); // 10-minute medians from 300 s to 3,600 s (the last one partial)
});

test("growth that levels off after 20 minutes is leveled", () => {
  const s = summarize(series(3600, (t) => 1400 + Math.min(t, 1200) / 60 * 8 + Math.sin(t) * 2));
  assert.equal(s.verdict, "leveled");
  assert.ok(s.slopeFirstHalf > 2);
});

test("15 minutes is too short for a verdict", () => {
  assert.equal(summarize(series(900, (t) => 1400 + t)).verdict, "too short");
});

test("the spawn ramp is not counted", () => {
  const s = summarize(series(3600, (t) => (t < 300 ? 500 + t * 3 : 1500)));
  assert.equal(s.verdict, "leveled");
  assert.equal(s.firstMiB, 500);
});

test("only the longest-lived server counts, its warm-up from its own first sample", () => {
  // A template server for 60 s at low memory, then the soak server, which boots at 90 s and grows for 20 minutes
  // (still in the warm-up and first half when measured from run.mjs's start) before it levels.
  const template = series(60, () => 300).map((x) => ({ ...x, pid: 11 }));
  const soak = series(3600, (t) => 1400 + Math.min(t, 1200) / 60 * 8).map((x) => ({ ...x, t: x.t + 90, pid: 22 }));
  assert.equal(mainPid([...template, ...soak]), 22);
  const s = summarize([...template, ...soak]);
  assert.equal(s.pid, 22);
  assert.equal(s.startS, 90);
  assert.equal(s.firstMiB, 1400);
  assert.equal(s.pids.length, 2);
  assert.equal(s.verdict, "leveled");
  assert.equal(s.bins[0].fromS, 300);
});

test("a restart's fresh, low process doesn't make a growing server look falling", () => {
  const first = series(3000, (t) => 1400 + (t / 60) * 3).map((x) => ({ ...x, pid: 1 }));
  const second = series(300, () => 600).map((x) => ({ ...x, t: x.t + 3010, pid: 2 }));
  const s = summarize([...first, ...second]);
  assert.equal(s.pid, 1);
  assert.equal(s.verdict, "growing");
});
