// Field Journal: "Also found" (entries other packs send that aren't in config.js) keeps the newest finds. A page used
// to stop at 40 of them and silently refuse the rest, so a player with many waystones never saw a later Atlas site or
// expedition. Now a page keeps 100 and drops its oldest, and when the whole journal nears the 30,000-character save
// limit the oldest of the page with the most go, so every new find is saved and shown. One dropped and found again
// comes back quietly (it used to say "New entry" a second time). Entries come in with
// realm:journal, as Waystones, Atlas and the others send them. About 30 seconds:
//   node tools/test-bds/run.mjs --quiet --flat --only journal_bp --scenario tools/test-bds/examples/journal-extras.js --timeout 300
export default async function (t) {
  const sys = t.system;
  const p = await t.player("Tester", { op: true });
  const send = (page, entry, label) => sys.sendScriptEvent("realm:journal", JSON.stringify({ player: p.id, page, entry, label }));
  const pad = (n) => String(n).padStart(3, "0");
  /** Opens the journal's `label` page and returns its text. */
  async function pageText(label) {
    const book = t.waitForm(p, { timeout: 100 });
    t.assert(t.cmd(p, "/realm:journal").ok, "journal opens");
    const f = await book;
    const page = t.waitForm(p, { timeout: 100 });
    f.answer(label);
    const g = await page;
    g.answer("Close");
    return String(g.body);
  }
  /** Sends a batch and returns how many were saved (each saved new entry says so in chat). */
  async function flood(list) {
    const since = t.tick;
    for (let k = 0; k < list.length; k++) {
      send(...list[k]);
      if (k % 20 === 19) await t.wait(1);
    }
    // Only ours (the journal also finds the Overworld and the biome you stand in by itself).
    const labels = new Set(list.map((e) => e[2].trim()));
    const count = () => t.messages(p, { since }).filter((m) => /Journal: New entry/.test(m.plain) && labels.has(m.plain.replace(/^.* - /, "").replace(/ \(\/realm:journal\)$/, "").trim())).length;
    for (let w = 0; w < 100 && count() < list.length; w++) await t.wait(1);
    await t.wait(5);
    return count();
  }

  // 1. 130 waystones on the Places page: the 100 newest show, the oldest went.
  const ways = Array.from({ length: 130 }, (_, k) => ["places", `waystone_test_${pad(k)}`, `Waystone: Test ${pad(k)}`]);
  let saved = await flood(ways);
  t.check(saved === 130, `every waystone is saved as it comes (${saved} of 130)`);
  // A find after them (an Atlas site) still shows.
  saved = await flood([["places", "atlas_test_site", "Test Shrine"]]);
  t.check(saved === 1, "a later Atlas site is saved");
  let body = await pageText("Places");
  const shown = (body.match(/Waystone: Test \d+/g) ?? []).length;
  t.log(`Places page: ${shown} waystones shown; ${body.match(/Also found[^:]*/)?.[0]}`);
  t.check(body.includes("Test Shrine"), "the newest find (the Atlas site) is on the page");
  t.check(body.includes("Waystone: Test 129"), "the newest waystone is on the page");
  t.check(!body.includes("Waystone: Test 000,"), "the oldest waystone made room");
  t.check(/Also found \(100\)/.test(body), "the page shows how many it keeps (100)");

  // 1b. The oldest waystone, dropped to make room, found again: back on the page without a second "New entry".
  const since = t.tick;
  send("places", "waystone_test_000", "Waystone: Test 000");
  await t.wait(10);
  const again = t.messages(p, { since }).filter((m) => /Journal: New entry/.test(m.plain) && /Waystone: Test 000/.test(m.plain));
  t.check(!again.length, `a dropped waystone found again comes back quietly (${again.length} "New entry" notes)`);
  body = await pageText("Places");
  t.check(body.includes("Waystone: Test 000"), "and it's back on the page");
  t.check(/Also found \(100\)/.test(body), "still 100 kept");
  saved = await flood([["places", "waystone_test_new", "Waystone: Brand New"]]);
  t.check(saved === 1, "a waystone never seen before still says New entry");

  // 2. Long ids and labels on every page, far past the save limit: the newest are saved anyway.
  const PAGES = ["mobs", "places", "fish", "weather", "relics", "story", "wanderers"];
  const big = [];
  for (const page of PAGES) for (let k = 0; k < 60; k++) big.push([page, `${page}_${pad(k)}_`.padEnd(40, "x"), `${page} find number ${pad(k)} `.padEnd(40, "y")]);
  saved = await flood(big);
  t.check(saved === big.length, `every long entry is saved as it comes (${saved} of ${big.length})`);
  saved = await flood([["story", "the_last_one", "The Last One"]]);
  t.check(saved === 1, "the newest story entry is saved past the limit");
  body = await pageText("Story");
  t.check(body.includes("The Last One"), "and it's on the Story page");
  t.check(body.includes("story find number 059"), "with the story's newest long entries");

  // 2b. One dropped by the save limit and found again comes back quietly too.
  body = await pageText("Mobs");
  t.assert(!body.includes("mobs find number 000"), "the oldest long Mobs entry went to make room");
  const since2 = t.tick;
  send(...big[0]);
  await t.wait(10);
  const again2 = t.messages(p, { since: since2 }).filter((m) => /Journal: New entry/.test(m.plain) && /mobs find number 000/.test(m.plain));
  t.check(!again2.length, `a long entry dropped by the save limit comes back quietly (${again2.length} "New entry" notes)`);
  body = await pageText("Mobs");
  t.check(body.includes("mobs find number 000"), "and it's back on the Mobs page");
}
