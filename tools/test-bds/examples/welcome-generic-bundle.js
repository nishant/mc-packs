// O43 acceptance: which welcome a world gets when every pack of one add-on writes its start-up data in bundle order.
// A new world must greet with the generic text and keep it after a restart (the saved welcome:profile decides once);
// a world that already has older data keeps the Realm text, or its own saved text, unchanged.
// Console-only: the operator-visible text is read from the chat lines the production welcome sends.
//
// 1. New world, the genuine Realm Bundle (every pack's start-up writes, e.g. find:mig, are in play):
//      node tools/bundle.mjs --all
//      node tools/test-bds/hooks/full-bundle-protocols.mjs --from dist/realm_bundle.mcpack --out <stage>
//      node tools/test-bds/run.mjs --quiet --flat --bundle <stage>/realm_bundle --arg expect=generic --scenario tools/test-bds/examples/welcome-generic-bundle.js --timeout 1200
// 2. Older world, a small bundle whose probe saves player data before Welcome reads the world (disclosed adaptation):
//      mkdir -p <d> && node tools/test-bds/hooks/diag-bundle.mjs <d> admin_bp,help_bp,find_bp,settings_bp,welcome_bp --probe-first --first-key stats:legacy
//      node tools/test-bds/run.mjs --quiet --flat --packs <d> --arg expect=realm --scenario tools/test-bds/examples/welcome-generic-bundle.js
// 3. Older world with saved text: the same with --first-key welcome:settings --first-value '{"body":"Saved old body"}'
//      and --arg expect=saved
// The same expectation must hold again after the restart in phase 2.
export default async function (t) {
  const expect = String(t.args?.expect ?? "generic");
  t.assert(["generic", "realm", "saved"].includes(expect), `--arg expect=generic|realm|saved (${expect})`);
  const p =  await t.player(`Joiner${t.phase}`, { op: false });
  const line = await t.waitMessage(p, /Welcome|glad you're here|Saved old body/, { kind: "chat", timeout: 400 });
  const text = line.plain;
  t.log(`phase ${t.phase} welcome (${expect}): ${text.slice(0, 300).replace(/\n/g, " | ")}`);
  const isGeneric = /glad you're here/.test(text);
  const isRealm = /Welcome to the Realm!/.test(text);
  if (expect === "generic") {
    t.check(isGeneric && !isRealm, `a new world greets with the generic text, not the Realm's (phase ${t.phase})`);
  } else if (expect === "realm") {
    t.check(isRealm && !isGeneric, `an older world keeps the Realm text (phase ${t.phase})`);
  } else {
    t.check(/Saved old body/.test(text) && !isGeneric, `an older world keeps its saved text (phase ${t.phase})`);
  }

  if (t.phase === 1) {
    await t.wait(20);
    t.restart("welcome decided and shown, restarting to check it stays");
  }
}
