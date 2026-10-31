import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../examples/calendar.js", import.meta.url), "utf8");
const line = source.split(/\r?\n/).find((line) => line.includes('"the second siege ends inside the calendar news gap"'));
const expression = /t\.check\((.+), "the second siege/.exec(line)?.[1];
assert.ok(expression, "the actual native fixture's clock guard is present");

function gapOpen(now) {
  const payload = { kind: "siege", player: "tester" };
  const received = { id: "realm:gossip", m: payload, tick: 1000 };
  const capture = /const heldNewsTick = (.+);/.exec(source)?.[1];
  assert.ok(capture, "the fixture captures a receipt tick");
  const heldNewsTick = new Function("ev", "since", `return (${capture});`)([received], 990);
  assert.equal(heldNewsTick, received.tick);
  return new Function("sys", "heldNews", "heldNewsTick", `return (${expression});`)(
    { currentTick: now }, [payload], heldNewsTick,
  );
}

test("the native calendar fixture uses the received event clock, not a nonexistent payload tick", () => {
  assert.equal(gapOpen(1050), true);
});

test("the same fixture still rejects a second siege outside the gap", () => {
  assert.equal(gapOpen(2050), false);
});
