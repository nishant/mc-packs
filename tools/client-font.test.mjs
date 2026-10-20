// The client font model (tools/lib/client-font.mjs) that Side HUD box checks use to wrap text the way a Bedrock client
// does, and its copy in the saga-quest-wrap scenario (scenarios run inside the game and cannot import it).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { advance, clientRows } from "./lib/client-font.mjs";

const read = (/** @type {string} */ file) => fs.readFileSync(new URL(file, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("glyph advances: 6 px for most letters and digits, the narrow ones less, bold one more, codes nothing", () => {
  for (const ch of "abcdeghjmnopqrsuvwxyzABCDEFGHJKLMNOPQRSTUVWXYZ0123456789?#$%&+-/=\\^_") assert.equal(advance(ch), 6, ch);
  assert.equal(advance("i"), 2);
  assert.equal(advance("l"), 3);
  assert.equal(advance("t"), 4);
  assert.equal(advance(" "), 4);
  assert.equal(advance("@"), 7);
  assert.equal(advance("a", true), 7);
  assert.equal(advance(" ", true), 4, "a bold space is no wider");
  assert.equal(clientRows("§a§l§r"), 1, "codes alone are one empty row");
});

test("rows: a 200 px label holds 33 wide letters, wraps at spaces, breaks a word wider than a row", () => {
  assert.equal(clientRows("a".repeat(33)), 1, "33 x 6 = 198 px");
  assert.equal(clientRows("a".repeat(34)), 2, "204 px");
  assert.equal(clientRows("i".repeat(100)), 1, "narrow letters fit more");
  assert.equal(clientRows("@".repeat(29)), 2, "wide ones fewer (29 x 7 = 203 px)");
  assert.equal(clientRows("§l" + "a".repeat(29)), 2, "bold: 29 x 7 = 203 px");
  assert.equal(clientRows(`${"abcde ".repeat(6)}abcde`), 2, "words of 30 px and 4 px spaces: six fit a row (200 px), the seventh wraps");
  assert.equal(clientRows(`${"abcde ".repeat(5)}abcde`), 1, "six words are exactly 200 px");
  assert.equal(clientRows("a\nb\n\nc"), 4, "every line starts a row, an empty one too");
  assert.equal(clientRows("x".repeat(70)), 3, "a 420 px word takes three rows");
});

test("the scenario's copy is the same model", () => {
  const scenario = read("./test-bds/examples/saga-quest-wrap.js");
  const lib = read("./lib/client-font.mjs");
  const between = (/** @type {string} */ s) => s.slice(s.indexOf("// CLIENT-FONT-TABLE-START"), s.indexOf("// CLIENT-FONT-TABLE-END")).replace(/^export /gm, "");
  assert.equal(between(scenario), between(lib), "the glyph table");
  const start = scenario.indexOf("// CLIENT-FONT-TABLE-START");
  const end = scenario.indexOf("export default async function");
  const copy = vm.runInNewContext(`${scenario.slice(start, end)}\n;clientRows`, {});
  const samples = ["", "a", "Ask Warden Reyes what the night watch heard", "§e[>] §fAsk Warden Reyes what the night watch heard §eNE 240m", "§l§6Salt and Silence§r: The Drowned Bell", "a\nb c\n\nd", "x".repeat(250)];
  for (let k = 0; k < 400; k++) samples.push(Array.from({ length: 5 + ((k * 7) % 90) }, (_, i) => " il@~tfI.abcdeW§l§r"[(i * 13 + k * 5) % 19]).join(""));
  for (const s of samples) assert.equal(copy(s), clientRows(s), JSON.stringify(s));
});
