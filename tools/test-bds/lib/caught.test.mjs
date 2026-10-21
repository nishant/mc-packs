import { test } from "node:test";
import assert from "node:assert/strict";
import { isCaughtErrorWarning } from "./caught.mjs";

test("a caught error a pack logs is counted, whatever its class name", () => {
  for (const line of [
    "[Scripting] [elite] InvalidEntityError: Failed to call function 'hasTag' due to Entity being invalid (has the Entity been removed?).",
    "[Scripting] [elite] InvalidEntityError: Failed to get property 'dimension' due to Entity being invalid (has the Entity been removed?).",
    "[Scripting] [x] TypeError: cannot read property 'id' of undefined",
    "[Scripting] [x] LocationOutOfWorldBoundariesError: Trying to access location (0, 400, 0) which is outside of the world boundaries.",
    "[Scripting] [claims] Error: boom",
    "[Scripting] [cooking] could not hand over [\"fishermans_breakfast\",1], kept for the next join: Error: test: grant failed",
    "[Scripting] [stash] an exception while saving",
  ])
    assert.ok(isCaughtErrorWarning(line), line);
});

test("ordinary warnings and other categories are not", () => {
  for (const line of [
    "[Scripting] [dbg] spawn minecraft:zombie cause=Spawned",
    "[Scripting] [stash] page 3 is full, kept on page 2",
    "[Scripting] [errors] none",
    "[Scripting] [map] terrorize: 0",
    "[Json] InvalidEntityError: not a script line",
  ])
    assert.ok(!isCaughtErrorWarning(line), line);
});
