// Realm Bundle smoke test: the genuine merged bundle (tools/bundle.mjs --all) loaded as ONE behavior pack, so all of its
// packs share one script context, one dynamic property store and one event bus, as on the Realm. The separate-pack runs
// hide bugs that need that sharing (a canceled beforeEvents event that later subscribers in the same pack still see, C13).
// This checks the bundle loads (a script error in any member fails the run), that every member's /realm:help responder
// and its diag.js responder answer from inside the one context with their own pack folder, and that a command runs.
// It is bounded (about a minute of game time) and is what CI runs after check and build.
//   node tools/bundle.mjs --all
//   node tools/test-bds/run.mjs --quiet --flat --bundle dist/realm_bundle.mcpack --scenario tools/test-bds/examples/bundle-smoke.js --timeout 300
export default async function (t) {
  t.assert(Array.isArray(t.bundle) && t.bundle.length >= 1, "run with --bundle: the Realm Bundle is installed as one pack");
  const bundle = t.bundle[0];
  const members = bundle.members;
  t.assert(members.length >= 2, `the bundle merges ${members.length} packs into one script entry`);
  t.log(`bundle ${bundle.folder} (${bundle.name}): ${members.length} packs in one script context`);

  const helpers = new Set();
  const diag = new Map();
  t.system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "realm:help_pong") helpers.add(message);
    else if (id === "realm:diag_pong") {
      try {
        const m = JSON.parse(message);
        if (m.id === "bundle-smoke") diag.set(m.pack, m);
      } catch { /* not ours */ }
    }
  }, { namespaces: ["realm"] });

  // Let every member finish its worldLoad work before asking.
  await t.wait(100);
  t.system.sendScriptEvent("realm:help_ping", "");
  t.system.sendScriptEvent("realm:diag_ping", JSON.stringify({ id: "bundle-smoke" }));
  await t.wait(60);

  const noHelp = members.filter((m) => !helpers.has(m));
  t.check(noHelp.length === 0, `every pack in the bundle answers realm:help_ping (${helpers.size}/${members.length}${noHelp.length ? `; silent: ${noHelp.slice(0, 12).join(", ")}` : ""})`);
  const strays = [...helpers].filter((h) => !members.includes(h));
  t.check(strays.length === 0, `and only bundle members answer (${strays.join(", ") || "no strays"})`);

  const noDiag = members.filter((m) => !diag.has(m));
  t.check(noDiag.length === 0, `every pack in the bundle answers realm:diag_ping with its own folder (${diag.size}/${members.length}${noDiag.length ? `; silent: ${noDiag.slice(0, 12).join(", ")}` : ""})`);
  // diag.js keeps one registry per script context and reports its size as `shared`: all members in one registry is the one-context proof.
  const sizes = [...new Set([...diag.values()].map((d) => d.shared))];
  t.check(sizes.length === 1 && sizes[0] === members.length, `all ${members.length} packs share one diag registry, i.e. one script context (shared: ${sizes.join(", ") || "none"})`);
  const odd = [...diag.values()].filter((d) => typeof d.name !== "string" || typeof d.version !== "string" || !Number.isFinite(d.bytes ?? 0));
  t.check(odd.length === 0, `each diag answer names its pack, version and saved bytes (${odd.map((d) => d.pack).join(", ") || "all well-formed"})`);

  const p = await t.player("Smoke", { op: true });
  t.check(t.cmd(p, "/realm:help").ok, "/realm:help runs in the bundle");
  await t.wait(40);
  t.log(`messages to the player: ${t.messages(p).length}`);
}
