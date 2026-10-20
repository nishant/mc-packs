// O43 acceptance (owner design 2026-10-19): every world, the Realm's included, gets ONE default welcome popup: one
// scrolling form, a bold gold label per section, one Close button; the Realm's old saved welcome is replaced once;
// an operator's saved welcome always wins. Reads the form the production welcome shows (title, labels, buttons).
//
// 1. New world, the genuine Realm Bundle (every pack's start-up writes, e.g. find:mig, are in play):
//      node tools/bundle.mjs --all
//      node tools/test-bds/hooks/full-bundle-protocols.mjs --from dist/realm_bundle.mcpack --out <stage>
//      node tools/test-bds/run.mjs --quiet --flat --bundle <stage>/realm_bundle --arg expect=default --scenario tools/test-bds/examples/welcome-generic-bundle.js --timeout 1200
// 2. The Realm's old saved welcome migrates once (small bundle; disclosed adaptation, the probe saves it before Welcome loads):
//      mkdir -p <d> && node tools/test-bds/hooks/diag-bundle.mjs <d> admin_bp,help_bp,find_bp,settings_bp,welcome_bp,saga_bp,npc_bp --probe-first --first-key welcome:settings --first-value '{"body":"Tap Old Tobin or Mara in town to begin\n== Rules ==","showOnce":true}'
//      node tools/test-bds/run.mjs --quiet --flat --packs <d> --arg expect=default --scenario tools/test-bds/examples/welcome-generic-bundle.js
// 3. An operator's saved welcome stays (the same with --first-value '{"body":"Saved old body"}' and --arg expect=saved).
// Phase 2 repeats the check after a restart: the migration must not run again and the text must be the same.
// F64: Townsfolk installed is not townsfolk placed. In phase 1 (expect=default) the first joiner sees no "Tap Old
// Tobin" line (nobody is placed in a new world); an operator then places Old Tobin with /realm:npc_add, and the next
// joiner is told to tap Old Tobin (and not Mara, who is not placed). Phase 2 (after the restart) still names him.
// The saved fields themselves (welcome:settings, welcome:migrated) are add-on scoped: the harness cannot read them, so the offline\n// tests (tools/operator-welcome.test.mjs) hold those checks.\n// Limit: a form's title, labels and buttons are the server's proof; whether the client draws them without cutting
// text off is not tested here (no client input).
export default async function (t) {
  const expect = String(t.args?.expect ?? "default");
  t.assert(["default", "saved"].includes(expect), `--arg expect=default|saved (${expect})`);
  const plain = (/** @type {string} */ s) => String(s ?? "").replace(/§./g, "");
  const p = await t.player(`Joiner${t.phase}`, { op: false });
  const f = await t.waitForm(p, { timeout: 400 });
  const labels = (f.elements ?? []).filter((e) => e.kind === "label" || e.kind === "header").map((e) => String(e.text ?? ""));
  const text = labels.map(plain).join("\n") + "\n" + plain(f.body ?? "");
  t.log(`phase ${t.phase} welcome (${expect}): ${plain(f.title)} | ${text.slice(0, 400).replace(/\n/g, " | ")} | buttons ${JSON.stringify(f.buttons)}`);
  t.check(f.buttons.length === 1, `one button (phase ${t.phase})`);
  if (expect === "default") {
    t.check(!(f.elements ?? []).some((e) => e.kind === "header"), "section titles are labels, never headers");
    // The official form observer strips formatting codes; producer tests check bold/gold, not client pixels.
    const headingNames = ["The World", "What You Can Do", "Where To Go Next"];
    const heads = labels.map(plain).filter((l) => headingNames.includes(l));
    t.check(heads.join(",") === headingNames.join(","), `sections in order: ${heads.join(", ")}`);
    t.check(f.type === "action" && text.length <= 1800 && text.split(/\s+/).filter(Boolean).length <= 200, "one action form stays within the documented text budget, not a client-fit proof");
    t.check(/realm:help/.test(text) && /realm:prefs/.test(text), "where to go next, for the installed packs");
    if (t.phase === 1) {
      t.check(!/Old Tobin|Mara/.test(text), "F64: no townsfolk named before any is placed");
      t.check(/harbor/.test(text), "the story paragraph is there without townsfolk");
    } else t.check(/Tap Old Tobin in town to begin/.test(text) && !/Mara/.test(text), "F64: after the restart the placed Old Tobin is still named, Mara still not");
    t.check(!/Rules|griefing|== /.test(text), "the old Realm text is gone");
    t.check(plain(f.buttons[0]) === "Close", "the Close button");
  } else {
    t.check(/Saved old body/.test(plain(f.body ?? "") + text), "an operator's saved text is unchanged");
  }

  if (t.phase === 1 && expect === "default") {
    f.answer(0);
    const op = await t.player("Op1", { op: true, gameMode: "creative" });
    (await t.waitForm(op, { timeout: 400 })).answer(0);
    t.assert(t.cmd(op, "/realm:npc_add tobin").ok, "npc_add tobin");
    await t.waitMessage(op, /Old Tobin.*now lives at/, { timeout: 60 });
    await t.wait(10);
    const late = await t.player("Late1", { op: false });
    const g = await t.waitForm(late, { timeout: 400 });
    const lateText = (g.elements ?? []).filter((e) => e.kind === "label").map((e) => plain(e.text)).join("\n");
    t.log(`after placing Old Tobin: ${lateText.slice(0, 400).replace(/\n/g, " | ")}`);
    t.check(/Tap Old Tobin in town to begin The Lantern and the Hollow/.test(lateText), "F64: the story start names the placed Old Tobin");
    t.check(!/Mara/.test(lateText), "F64: Mara is not named while she isn't placed");
    g.answer(0);
  }
  if (t.phase === 1) {
    await t.wait(20);
    t.restart("welcome shown, restarting to check the migration does not run again");
  }
}