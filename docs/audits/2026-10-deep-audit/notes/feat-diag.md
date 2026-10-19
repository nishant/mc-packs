# feat-diag: per-pack diagnostics and saved-data removal (worktree /home/user/wt/f-ops, branch feat/ops)

## What was built
- `tools/diag-shared.js`, synced by `tools/sync-diag.mjs` (logic in `tools/lib/diag-sync.mjs`) into
  `packs/<every *_bp>/scripts/diag.js` (67 packs) with `PACK` (folder), `VERSION` (manifest header.version) and
  `NAME` (manifest header.name) filled in. `sync-diag` also makes `import "./diag.js";` the FIRST import of every
  `scripts/main.js`. `--check` fails on a stale copy (shared file changed, version bumped, name changed) or a
  missing/misplaced import; wired into `npm run check` right after `sync-side.mjs --check`.
  `help-catalog.mjs` and `gen-news.mjs` call `syncDiag()` for help_bp / news_bp right after they bump.
- diag.js wraps system.run / runTimeout / runInterval / runJob (each step), every world/system before/after
  subscribe, and custom command callbacks; hooks World.prototype.get/setDynamicProperty to learn key owners and
  to block a forgotten pack's writes.
- Protocol (all `realm:`, JSON, < 2048 chars; pongs measured 68-313 chars):
  - `realm:diag_ping {id, ticks?}` -> `realm:diag_pong {id, pack, name, version, bytes, props, big, bigKey,
    forgotten?, shared?, total?, unowned?, unownedProps?}`; with `ticks` (1-1200) the reply comes when that
    profiling window ends and adds `{ticks, ms, calls, mpt, top:[{k, ms, n}] (2)}`. Overlapping windows merge.
  - `realm:diag_forget {id, pack, confirm:"FORGET <pack>"}` -> `realm:diag_forgot {id, pack, ok, removed, bytes}`
    or `{id, pack, ok:false, error}`. Only the named pack answers.
- admin_bp: `/realm:diag [seconds]` (operators; level checked in the callback, again when the list opens and
  again right before the forget is sent) and **Operator Tools > Pack diagnostics** (after the quick actions).
  `scripts/diagnostics.js`: measure (default 10 s), list every pack that answered, slowest first, with version,
  ms/tick and saved KB; red when > 0.5 ms/tick or one entry > 24 KB; "No answer" lists installed packs (from
  the help ping) that did not answer within 40 ticks after the window. A pack page shows ms/tick, calls per
  tick, the top 2 callbacks (kind, function name, file:line), entries, KB, biggest entry, and
  "Forget this pack's saved data" -> MessageFormData "Forget saved data?" naming the pack, entry count and KB,
  saying scoreboards, tags and data saved on players are kept, and that it saves nothing until /reload or a
  restart. Then a chat line with what was removed and "Run /reload or restart the server now".

## Design decisions
- **The bundle is one script context and one storage.** tools/bundle.mjs merges every behavior pack into one
  add-on: one JS context, ONE dynamic property storage. A `world.clearDynamicProperties()` there would wipe all
  67 packs. So: the first diag.js copy installs the patches and keeps state on globalThis; each copy
  registers its pack. Forget = `clearDynamicProperties()` only when a pack is alone in its context
  (standalone install / test harness); in a bundle it deletes only that pack's keys. Writes are blocked per
  pack (key owner forgotten), so other packs keep saving. Bytes: exact `getDynamicPropertyTotalByteCount()`
  alone, else the sum of the pack's keys (key + value length, UTF-8), plus `total` and the unowned entries.
- **Ownership, decided once per registration/key, never per call:** a callback belongs to the pack whose module
  is being evaluated (each copy sets it; ES modules evaluate a pack's graph before the next pack's copy), else
  to the pack named in the call stack (`scripts/<folder>/...` in a bundle; checked on BDS: frames read
  `nick_bp/main.js:130`). Stack walks happen for intervals, subscriptions and commands always, for
  run/runTimeout/runJob only while profiling (they are many and short-lived; a runTimeout loop is attributed
  from its first re-registration in the window). A key belongs to the pack being evaluated when first read or
  written, else to the pack already using its prefix, else to the stack's pack (one walk per new prefix). No
  two packs share a key prefix (checked: 59 PREFIX/PROP/KEY constants, all distinct).
- **No listener of its own:** the first version subscribed a realm: listener per pack; every realm: event then
  woke 67 extra callbacks (+176 calls/tick, >= 0.18 ms/tick at 40 players, measured). Now the first realm:
  scriptEventReceive listener a pack subscribes carries the protocol (one id comparison inside a call the game
  makes anyway); diag.js listens itself only if no pack did by the first tick (every pack has one today) or
  after that listener is unsubscribed.
- **Wrapper off path is one boolean + one plain call** (`if (!st.on || !rec) return fn(ev)`): a rest/apply
  wrapper measured 4x slower (0.45 vs 0.12 us); per-call "current pack" bookkeeping (0.4 us) was dropped for
  once-per-registration attribution. Commands keep a rest wrapper (rare).
- **Coexists with tools/test-bds/lib/profile.js:** profile.js wraps outside diag.js (it loads first). Its site()
  now skips `diag.js` and `(native)` frames, and while it is present (`globalThis.__harnessProfile`) diag.js
  records wrapper -> original so its labels keep the pack's function names (verified: "runInterval(10)
  refreshAll @ main.js:130"). Zero cost outside the harness.
- Time is Date.now() like profile.js; time after an `await` in async callbacks and `await system.waitTicks`
  loops are not counted (same limitation as the harness profiler).
- Tools that import packs in node with a stub (admin-catalog, check-docs) work: diag.js skips patching when
  System.prototype has no run/runTimeout/runInterval/runJob.

## Commands and options (Commands rows for docs/PACKS.md, Realm Configuration section)
| `/realm:diag [seconds]` | Ops | Pack diagnostics: measures every pack's script time for a few seconds (default 10, 1 to 60), then lists every pack that answered, slowest first, with its version, ms per tick and saved data. Red: over 0.5 ms per tick, or one saved entry over 24 KB (the limit for one entry is 32 KB). Packs that don't answer (an older version) are listed under **No answer**. A pack's page shows what takes its time and its biggest saved entry, and offers **Forget this pack's saved data**: after you confirm, the pack deletes everything it saved in the world (in a bundle only its own entries) and saves nothing more until you run `/reload` or restart. Scoreboards, tags and data saved on players are kept. The same page is **Operator Tools > Pack diagnostics** |
No config.js options added. presets.js: NAMES `realm:diag` ["Pack diagnostics", "Script time, saved data"],
PARAMS `seconds` slider 1-60 default 10.

### DOCS (for the lead)
- PACKS.md, Realm Configuration: add the Commands row above; in How to use step 6 (Operator Tools), after the quick
  actions: "**Pack diagnostics** measures every pack's script time for 10 seconds and lists the packs, slowest
  first, with their saved data; a pack's page can forget its saved data (see `/realm:diag`)."; Saved data: none
  new (diag keeps nothing; forgetting removes the chosen pack's world entries).
- PACKS.md, How the packs work together: a "Diagnostics protocol" paragraph: every behavior pack has
  `scripts/diag.js` (synced from tools/diag-shared.js) answering `realm:diag_ping {id, ticks?}` with
  `realm:diag_pong` and `realm:diag_forget {id, pack, confirm:"FORGET <pack>"}` with `realm:diag_forgot`
  (fields as in the protocol above); in the Realm Bundle all packs share one storage, so a forget deletes only the
  pack's own keys (owner = first pack to read/write the key, else its prefix).
- README / WORKING.md / CLAUDE.md: `node tools/sync-diag.mjs` next to sync-side in the command list, and in the
  version-bump rule: **after bumping any pack's manifest, run `node tools/sync-diag.mjs`** (diag.js carries the
  version; `npm run check` fails otherwise). help-catalog.mjs and gen-news.mjs do it for help_bp/news_bp.
- New pack rule: its main.js gets `import "./diag.js";` first (sync-diag adds it and the copy).
- tools/test-bds/README.md "Profiling": diag.js runs inside the profiler; labels unaffected.
- Catalog: `node tools/admin-catalog.mjs` (new command), then `node tools/help-catalog.mjs`.

## NEWS
- Operators: Pack diagnostics (Operator Tools, or /realm:diag) shows how much script time and saved data each pack uses, and can wipe one pack's saved data.

## Measured cost (40 simulated players, perf-soak 120 s, --profile, all 67 behavior packs)
Whole-bundle A/B is dominated by run-to-run noise (two baseline runs of the same code: 9.49 and 6.23 ms/tick), so
the cost is measured directly and the A/B is a sanity check.

| run (perf-soak, 40 players, 120 s) | bundle ms/tick | calls/tick | ms per call | map_bp | build_bp | stash_bp | TPS |
|---|---|---|---|---|---|---|---|
| integration (00517e1 code) run 1 | 9.487 | 454.4 | 0.0209 | 3.936 | 1.197 | 0.586 | 18.00 |
| integration run 2 | 6.227 | 296.9 | 0.0210 | 2.751 | 0.743 | 0.359 | 19.40 |
| first diag version (own listener per pack) | 10.753 | 630.3 | 0.0171 | 3.855 | 1.162 | 0.697 | 17.14 |
| final diag, off | 10.112 | 501.1 | 0.0202 | 3.868 | 1.108 | 0.703 | 18.88 |

- The first version's own `realm:` listener per pack added ~176 calls/tick (diagListener: 238,960 calls,
  >= 527 ms in 2,910 ticks = >= 0.18 ms/tick inside JS alone): removed (protocol carried by each pack's
  existing listener). Final run: 0 diagListener calls.
- Microbenchmark on BDS (scratchpad diagperf/bench4.js, the exact off path, 1e6 calls x 5): direct 367-441 ms,
  wrapped 534-630 ms -> **0.10-0.25 us per call, median 0.16 us**. World get hook: +0.37 us per call.
  (Rest/apply wrapper was 0.45 us, per-call "current pack" bookkeeping 0.4 us: both dropped.)
- Counted at 40 players (instrumented copy, scratchpad diagperf/count.*): 407 wrapped calls/tick, 0.3 wrapper
  creations/tick, 0.2 world gets/tick, 0.2 world sets/tick, 0.1 job steps/tick.
- **Cost with diag off: 400-500 calls/tick x 0.16 us = 0.065-0.08 ms/tick for the whole bundle** (+ < 0.001 ms for
  creations and property hooks): under the 0.1 ms budget. The same wrapper runs per pack when installed
  separately. Per call the final run is at the baseline's level (0.0202 vs 0.0209/0.0210 ms per call).
- Profiling on (10 s window): two Date.now() per call, about the same as the harness profiler; only while an
  operator measures.

## Scenarios and results
- `tools/test-bds/examples/admin-diag.js` (`--only admin_bp,nick_bp`): ping/pong with version, name, entries
  and bytes; a 40-tick profiling window (no answer before it ends; Nicknames' runInterval(10) counted, labeled);
  forget refused without / with a wrong confirm, nothing deleted; `/realm:diag` refused for a member (no form)
  and for seconds 0 and 61; operator list (body, buttons with version, ms/tick, saved), pack page, confirmation
  text (pack, count, "Not deleted: scoreboards and tags", "/reload or restart"), Cancel deletes nothing,
  confirm deletes, chat line says to reload; a later player's gamertag is not saved (blocked write), the other
  pack untouched. PASS.
- `tools/test-bds/examples/admin-diag-bundle.js` (header recipe builds a bundle with
  `tools/test-bds/hooks/diag-bundle.mjs`: admin_bp + nick_bp + a probe pack in one context and storage): one
  pong per pack, `shared: 3`, per-pack keys and bytes, no unowned entries; per-pack callbacks (Nicknames'
  interval only in Nicknames', an interval started after an `await` and a self-rescheduling runTimeout loop
  attributed to the probe); the 25 KB entry is red and named; the bundle note; forgetting the probe deletes
  only its entry, blocks its later writes, Nicknames keeps its entries and keeps saving. PASS.
- `tools/diag.test.mjs` (npm test): two copies in one context with a fake @minecraft/server (ownership,
  carrier listener, profiling window, refused and done forget, blocked writes) and one alone (clear all). PASS.
- `node tools/test-bds/suite.mjs --filter '^admin-diag' --retry`: 2 pass.

## Checks
- `npm run check`: stops at check-docs (`admin_bp: command /realm:diag not documented`: PACKS.md is the lead's).
  Every later step run by hand: all pass except `admin-catalog --check` (catalog.js out of date for the new
  command: regenerate) and `check-versions` (every behavior pack changed, no bumps by design). tsc, ascii,
  commands, stories, ids, events, actionbar, unit tests (incl. tools/diag.test.mjs, admin-item.test.mjs), all
  sync checks (sync-diag: 67 copies current), help-catalog, gen-news and all generators: pass.
- `npm run build`: ok (dist/*.mcpack for every pack).
- `node tools/test-bds/suite.mjs --filter '^(admin-|smoke$|restart$|forms$|perf-soak$|harness-event-limit$|actionbar-steady$)' --retry`:
  14/14 pass (both new scenarios, every admin scenario, smoke and restart with every pack, perf-soak).

## Requests for the lead
- Bump every behavior pack (all 67 get diag.js and a main.js import), then run `node tools/sync-diag.mjs` (the
  copies carry the version) before `npm run check`.
- Regenerate admin catalog (new `/realm:diag`) and docs as above.
- tools/check-events.mjs SHARED now includes diag.js (checked once in tools/diag-shared.js).

## Review (independent reviewer, head 52c5249)
Verdict: ship after the three fixes below. Profiling off is behavior-identical as far as I can find; forget is gated by
operator check (open, list, right before send) + MessageFormData + exact `FORGET <pack>` token, and writes are blocked per
owner until /reload, so cached writes cannot bring the data back.

| sev | file:line | trigger | fix | status |
|---|---|---|---|---|
| high | tools/diag-shared.js install() | Realm Bundle: `system.beforeEvents.startup` fires after every module ran but before the first tick, while `S.cur` still names the LAST bundled pack, so every pack's command callbacks (and anything subscribed in startup) were counted as that pack's. Reproduced on BDS: `command realm:nick` in probe_bp's top | unwrapped startup handler subscribed first in install() clears `cur` when multi; owners then come from the call stack | fixed 12e12e2 (+ test 52c5249; admin-diag-bundle fails before, passes after) |
| medium-high | tools/diag-shared.js handle/endWindow | two operators measure at once: a later, longer ping extended the shared window, so the first operator's collect (secs + 2 s) got no answers and saw "No pack answered" with every pack under No answer | each request keeps its own end; endWindow answers the due ones and reschedules for the next; at most 20 requests per window | fixed 2f4f2c7 (admin-diag step 2b fails before: "2 answers to w1", passes after) |
| medium | admin_bp diagnostics.js forgetPack | forgetting stash_bp / mail_bp deletes players' stored inventory pages / letters (world entries); the text said only "settings, records and progress", and "everything it saved in the world" while structures stay | text names items kept for players and that saved structures stay | fixed f14f0d4 (admin-diag checks it) |
| low | diag-shared.js patchSystem | while profiling, every run/runTimeout registration walks the stack (new Error().stack), inflating the measured time of packs that schedule many short tasks; a run/runTimeout registered before the window (cur null in a bundle) is never counted | deferred: only during an operator's window; document "approximate" |
| low | diag protocol | anyone who can run /scriptevent (operators, command blocks) can send realm:diag_forget with the token; the token is a typo guard, not authorization (same trust as realm:cfg_set) | deferred: say so in PACKS.md "Diagnostics protocol" |
| low | diagnostics.js:219 | a forgot answer later than 40 ticks: operator is told "nothing was deleted" although it was | deferred: the answer is sent in the same tick in practice |
| low | diag-shared.js claim() | bundle: keys whose prefix no pack touched since reload stay unowned (not forgotten); a prefix-less key whose stack names no pack is re-walked on every get | deferred: none exist today (59 prefixes distinct, checked) |

Verified (no change): worldLoad runs after diag's first-tick `cur = null` (scratch bundle with the probe first: probe:big
still the probe's); subscribe returns the wrapper and unsubscribe maps original or wrapper (domt effects.js, setup.js);
runJob step keeps exceptions and done; all 67 main.js have `import "./diag.js";` first, manifests enter scripts/main.js;
no folder is a suffix of another (stack attribution); no setDynamicProperties in 2.1.0; pongs < 600 chars, forgot < 300;
no .header(), ASCII, realm: ids. Per-tick cost not re-measured: the BDS microbenchmark (0.16 us per wrapped call off) x
407 counted calls/tick at 40 players = ~0.07 ms/tick, and no listener of its own; the whole-bundle A/B is noise.
Checks: `npm run check` steps all pass except check-docs and admin-catalog --check (lead's docs/catalog) and
check-versions (skipped, lead bumps). `npm run build` ok. Suite: admin-diag, admin-diag-bundle, admin-setup-wizard,
admin-size-profile, admin-setup-hint, admin-menu, smoke, restart: all pass.
DOCS addition: "Diagnostics protocol" paragraph should say forget is for operators but any /scriptevent sender can send it.
