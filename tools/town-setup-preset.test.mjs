// The Realm Configuration setup checklist's "Town Project Spots" entry (admin_bp/scripts/presets.js): towns pick their
// project spots by themselves now (F37), so setting one is optional, and the text still fits the button.
import assert from "node:assert/strict";
import test from "node:test";
import { LINE, SETUP, textWidth } from "../packs/admin_bp/scripts/presets.js";

test("setup checklist: Town Project Spots says towns pick their own and a set spot is never leveled", () => {
  const s = SETUP.find((x) => x.id === "spots");
  assert.ok(s, "the entry is there");
  assert.equal(s.cmd, "realm:town_spot");
  assert.match(s.hint, /Optional/);
  assert.match(s.help, /pick a spot for each project by themselves/);
  assert.match(s.why, /never leveled/);
  assert.ok(textWidth(s.hint) <= LINE && textWidth(s.title) <= LINE, "both button lines fit");
});
